import { useEffect, useRef, useState } from 'react';
import { discardReservationOperation, getPendingOperations, readPendingOperations, resumeReservationOperation } from '../services/reservationService';
import type { PendingOperation } from '../services/reservationWriter';
import { userCanCreateReservations, userCanEditReservations, userCanDeleteReservations, type AuthUser } from '../services/authService';
import { ConfirmationModal } from './common/ConfirmationModal';

export function PendingReservationOperations({ user }: { user: AuthUser | null }) {
  const [operations, setOperations] = useState<PendingOperation[]>(getPendingOperations);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [discarding, setDiscarding] = useState<PendingOperation | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    let active = true;
    let revision = 0;
    setError(''); setDiscarding(null);
    const update = () => { revision++; setOperations(getPendingOperations()); };
    setOperations(getPendingOperations());
    window.addEventListener('reservation-operations-changed', update);
    void readPendingOperations().then(rows => { if (active && revision === 0) setOperations(rows); })
      .catch(err => { if (active) setError(err?.message || 'No se pudo leer el registro de recuperación.'); });
    return () => { active = false; window.removeEventListener('reservation-operations-changed', update); };
  }, [user?.username]);
  if (!user) return null;
  const visible = operations.filter(o => !o.actor || o.actor === user.username);
  const resume = async (o: PendingOperation) => {
    if (busyRef.current) return;
    const canWrite = o.reservations.every(r => o.intent === 'update' || r.version ? userCanEditReservations(user) : userCanCreateReservations(user));
    if (!canWrite || (o.deletedIds.length > 0 && !userCanDeleteReservations(user))) { setError('No tienes permisos para reanudar esta operación.'); return; }
    busyRef.current = true; setBusy(o.id); setError('');
    try { await resumeReservationOperation(o.id); }
    catch (err: any) { setError(err?.message || 'No se pudo reanudar. Tus datos están conservados.'); }
    finally { setOperations(getPendingOperations()); busyRef.current = false; setBusy(null); }
  };
  const discard = async () => {
    if (!discarding || busyRef.current) return;
    busyRef.current = true; setBusy(discarding.id); setError('');
    try {
      await discardReservationOperation(discarding.id);
      setOperations(getPendingOperations());
      setDiscarding(null);
    } finally { busyRef.current = false; setBusy(null); }
  };
  return <>{visible.map(o => <div key={o.id} role="status" className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm">
    <p>Guardado pendiente: {o.confirmedIds.length} de {o.reservations.length + o.deletedIds.length} reservas confirmadas.</p>
    <button type="button" disabled={!!busy} onClick={() => resume(o)} className="mt-2 px-3 py-2 rounded-lg bg-amber-700 text-white disabled:opacity-50">
      {busy === o.id ? 'Guardando…' : 'Reanudar guardado'}
    </button>
    <button type="button" disabled={!!busy} onClick={() => setDiscarding(o)} className="mt-2 ml-2 px-3 py-2 rounded-lg border border-amber-700 text-amber-900 disabled:opacity-50">
      Descartar pendiente
    </button>
  </div>)}{error && <p role="alert" className="text-rose-700">{error}</p>}
    <ConfirmationModal isOpen={!!discarding} title="Descartar guardado pendiente" variant="warning"
      message="Se quitará este intento de recuperación. Los cambios sin confirmar dejarán de estar disponibles para reintentar. Las reservas ya guardadas se conservan."
      confirmLabel="Descartar intento" onConfirm={discard} onCancel={() => setDiscarding(null)} isProcessing={!!busy} />
  </>;
}
