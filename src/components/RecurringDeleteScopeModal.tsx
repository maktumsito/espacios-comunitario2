import React, { useEffect, useRef, useState } from 'react';
import type { DeleteScope, Reservation } from '../types';
import { queryReservationsBySeries } from '../services/reservationService';
import { selectReservationsToDelete } from '../utils/reservationDeletion';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { BaseModal } from './common/BaseModal';

export interface ScopedDeleteProps {
  reservation: Reservation;
  onClose: () => void;
  canDelete: boolean;
  onConfirm: (reservation: Reservation, scope: DeleteScope, selection: Reservation[], motivo?: string) => Promise<void>;
}

export function RecurringDeleteScopeModal({ reservation, onClose, canDelete, onConfirm }: ScopedDeleteProps) {
  const [scope, setScope] = useState<DeleteScope>('single');
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [motivo, setMotivo] = useState('');
  const inFlight = useRef(false);
  useEffect(() => {
    let active = true;
    setRows(null);
    setError('');
    setScope('single');
    void queryReservationsBySeries(reservation.serieRecurrente || reservation.recurrenteId || '')
      .then(result => { if (active) setRows(result); })
      .catch(() => { if (active) setError('No se pudo consultar la serie. Pulsa Actualizar para reintentar.'); });
    return () => { active = false; };
  }, [reservation.id, reservation.serieRecurrente, reservation.recurrenteId, revision]);
  const selected = rows ? selectReservationsToDelete(reservation, scope, rows) : [];
  const submit = async () => {
    if (inFlight.current || !selected.length) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      await onConfirm(reservation, scope, structuredClone(selected), motivo);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la eliminación.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return <BaseModal isOpen onClose={() => { if (!inFlight.current) onClose(); }} title="Eliminar reserva recurrente" maxWidth="md" closeOnBackdrop={!busy}>
    <p className="mb-4">Fecha seleccionada {formatDateDDMMYYYY(reservation.fecha)}</p>
    <fieldset disabled={busy || !rows} className="space-y-3">
      <legend className="font-semibold mb-2">Elige qué reservas eliminar</legend>
      {([
        ['single', 'Solo esta reserva'],
        ['future', 'Desde esta fecha en adelante'],
        ['series', 'Toda la serie']
      ] as const).map(([value, label]) => <label key={value} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer">
        <input type="radio" name="delete-scope" value={value} checked={scope === value} onChange={() => setScope(value)} />
        <span>{label}</span>
      </label>)}
    </fieldset>
    <p role="status" className="my-3">{rows ? `${selected.length} reservas seleccionadas.` : 'Consultando la serie…'}</p>
    {scope === 'future' && <p className="text-sm mb-3">Incluye todas las sesiones del {formatDateDDMMYYYY(reservation.fecha)} y los días posteriores.</p>}
    {!canDelete && <label className="block mb-3">Motivo de la solicitud
      <textarea className="w-full border rounded p-2" value={motivo} disabled={busy} onChange={event => setMotivo(event.target.value)} />
    </label>}
    {error && <p role="alert" className="text-rose-700 my-3">{error}</p>}
    <div className="flex flex-wrap gap-3 mt-4">
      <button type="button" disabled={busy} onClick={onClose} className="border rounded px-4 py-2">Cancelar</button>
      <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)} className="border rounded px-4 py-2">Actualizar</button>
      <button type="button" disabled={busy || !selected.length} onClick={() => void submit()} className="bg-rose-700 text-white rounded px-4 py-2 disabled:opacity-50">
        {busy ? 'Procesando…' : canDelete ? 'Confirmar eliminación' : 'Solicitar eliminación'}
      </button>
    </div>
  </BaseModal>;
}
