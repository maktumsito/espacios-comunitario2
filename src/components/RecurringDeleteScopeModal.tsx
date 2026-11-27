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
      .catch(() => { if (active) setError('No se pudo consultar la serie. Pulsa Reintentar consulta para intentar nuevamente.'); });
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
  const sortedSelectedDates = selected.map((row) => row.fecha).filter(Boolean).sort();
  const rangeSummary =
    sortedSelectedDates.length > 1
      ? `${formatDateDDMMYYYY(sortedSelectedDates[0])} al ${formatDateDDMMYYYY(sortedSelectedDates[sortedSelectedDates.length - 1])}`
      : sortedSelectedDates.length === 1
      ? formatDateDDMMYYYY(sortedSelectedDates[0])
      : formatDateDDMMYYYY(reservation.fecha);

  return <BaseModal isOpen onClose={() => { if (!inFlight.current) onClose(); }} title="Eliminar actividad recurrente" maxWidth="md" closeOnBackdrop={!busy}>
    <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
      <div className="font-bold text-slate-900">{reservation.descripcion || reservation.tipoActividad}</div>
      <div>{reservation.espacio} · {reservation.horaInicio} a {reservation.horaFin} · Fecha elegida: {formatDateDDMMYYYY(reservation.fecha)}</div>
      {rows && (
        <div className="font-semibold text-rose-800">
          Alcance seleccionado: {selected.length} {selected.length === 1 ? 'reserva' : 'reservas'} ({rangeSummary})
        </div>
      )}
    </div>
    <fieldset disabled={busy || !rows} className="space-y-3">
      <legend className="font-semibold mb-2">Elige qué reservas eliminar</legend>
      {([
        ['single', 'Solo esta fecha', `Elimina únicamente el ${formatDateDDMMYYYY(reservation.fecha)}.`],
        ['future', 'Esta fecha y las siguientes', `Incluye desde el ${formatDateDDMMYYYY(reservation.fecha)} en adelante.`],
        ['series', 'Toda la serie', 'Todas las fechas activas que forman parte de esta serie.']
      ] as const).map(([value, label, hint]) => <label key={value} className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
        <input type="radio" name="delete-scope" value={value} checked={scope === value} onChange={() => setScope(value)} className="mt-1" />
        <span className="flex flex-col">
          <span className="font-semibold text-slate-900">{label}</span>
          <span className="text-xs text-slate-600">{hint}</span>
        </span>
      </label>)}
    </fieldset>
    <p role="status" className="my-3 text-sm font-medium">{rows ? `${selected.length} ${selected.length === 1 ? 'reserva afectada' : 'reservas afectadas'} (${rangeSummary}).` : 'Consultando la serie…'}</p>
    {!canDelete && <label className="block mb-3">Motivo de la solicitud
      <textarea className="w-full border rounded p-2" value={motivo} disabled={busy} onChange={event => setMotivo(event.target.value)} />
    </label>}
    {error && <p role="alert" className="text-rose-700 my-3">{error}</p>}
    <div className="flex flex-wrap gap-3 mt-4">
      <button type="button" disabled={busy} onClick={onClose} className="border rounded px-4 py-2">Cancelar</button>
      <button type="button" disabled={busy} onClick={() => setRevision(value => value + 1)} className="border rounded px-4 py-2">Reintentar consulta</button>
      <button type="button" disabled={busy || !selected.length} onClick={() => void submit()} className="bg-rose-700 text-white rounded px-4 py-2 disabled:opacity-50">
        {busy
          ? 'Eliminando…'
          : canDelete
          ? (selected.length === 1 ? 'Eliminar esta fecha' : `Eliminar ${selected.length} reservas`)
          : (selected.length === 1 ? 'Solicitar eliminación de esta fecha' : `Solicitar eliminación (${selected.length} reservas)`)}
      </button>
    </div>
  </BaseModal>;
}
