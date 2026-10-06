import { useEffect, useState } from 'react';
import { getPendingOperations, resumeReservationOperation } from '../services/reservationService';
import type { PendingOperation } from '../services/reservationWriter';
import { userCanCreateReservations, userCanEditReservations, userCanDeleteReservations, type AuthUser } from '../services/authService';

export function PendingReservationOperations({ user }: { user: AuthUser | null }) {
  const [operations, setOperations] = useState<PendingOperation[]>(getPendingOperations);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const update = () => setOperations(getPendingOperations());
    window.addEventListener('reservation-operations-changed', update);
    return () => window.removeEventListener('reservation-operations-changed', update);
  }, []);
  if (!user) return null;
  const visible = operations.filter(o => !o.actor || o.actor === user.username);
  const resume = async (o: PendingOperation) => {
    if (busy) return;
    const canWrite = o.reservations.every(r => o.intent === 'update' || r.version ? userCanEditReservations(user) : userCanCreateReservations(user));
    if (!canWrite || (o.deletedIds.length > 0 && !userCanDeleteReservations(user))) { setError('No tienes permisos para reanudar esta operación.'); return; }
    setBusy(o.id); setError('');
    try { await resumeReservationOperation(o.id); }
    catch (err: any) { setError(err?.message || 'No se pudo reanudar. Tus datos están conservados.'); }
    finally { setBusy(null); }
  };
  return <>{visible.map(o => <div key={o.id} role="status" className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm">
    <p>Guardado pendiente: {o.confirmedIds.length} de {o.reservations.length + o.deletedIds.length} reservas confirmadas.</p>
    <button type="button" disabled={!!busy} onClick={() => resume(o)} className="mt-2 px-3 py-2 rounded-lg bg-amber-700 text-white disabled:opacity-50">
      {busy === o.id ? 'Guardando…' : 'Reanudar guardado'}
    </button>
  </div>)}{error && <p role="alert" className="text-rose-700">{error}</p>}</>;
}
