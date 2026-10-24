import { CalendarDateInput } from './common/CalendarDateInput';
import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Reservation } from '../types';
import { queryReservationsForDayDeletion } from '../services/reservationService';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { validateStrictCalendarDate } from '../utils/validationUtils';
import { formatDisplayTitle } from '../utils/reservationVisuals';
import { BaseModal } from './common/BaseModal';

interface DeleteDayReservationsModalProps {
  initialDate: string;
  onClose: () => void;
  onConfirm: (fecha: string, reservations: readonly Reservation[]) => Promise<void>;
}

export function DeleteDayReservationsModal({ initialDate, onClose, onConfirm }: DeleteDayReservationsModalProps) {
  const [fecha, setFecha] = useState(initialDate);
  const [preview, setPreview] = useState<{ fecha: string; rows: Reservation[] } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const pendingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setPreview(null);
    setSelectedIds(new Set());
    setError('');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !validateStrictCalendarDate(fecha).isValid) {
      setLoading(false);
      setError('Selecciona una fecha válida.');
      return;
    }
    setLoading(true);
    queryReservationsForDayDeletion(fecha)
      .then(rows => {
        if (!cancelled) {
          setPreview({ fecha, rows });
          setSelectedIds(new Set(rows.map(row => row.id)));
        }
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron consultar las reservas.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fecha, reload]);

  const rows = preview?.fecha === fecha ? preview.rows : [];
  const selectedRows = rows.filter(row => selectedIds.has(row.id));
  const canConfirm = !loading && !processing && selectedRows.length > 0;
  const close = () => { if (!pendingRef.current) onClose(); };
  const confirm = async () => {
    if (!canConfirm || pendingRef.current) return;
    pendingRef.current = true;
    setProcessing(true);
    setError('');
    try {
      await onConfirm(fecha, selectedRows);
      onClose();
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : 'No se pudieron eliminar las reservas. Consulta nuevamente para reintentar.');
    } finally {
      pendingRef.current = false;
      setProcessing(false);
    }
  };

  return (
    <BaseModal isOpen onClose={close} title="Eliminar reservas de un día" maxWidth="lg" role="alertdialog"
      icon={<Trash2 className="w-5 h-5 text-rose-600" />} closeOnBackdrop={!processing} showCloseButton={!processing}
      footer={<div className="flex flex-wrap justify-end gap-2 w-full">
        <button type="button" onClick={close} disabled={processing}
          className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold disabled:opacity-50">Cancelar</button>
        <button type="button" onClick={() => { void confirm(); }} disabled={!canConfirm}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold disabled:opacity-50">
          {processing ? 'Eliminando...' : `Eliminar ${selectedRows.length} reservas`}
        </button>
      </div>}
    >
      <label htmlFor="delete-day-date" className="block text-sm font-semibold mb-2">Fecha de las reservas</label>
      <CalendarDateInput id="delete-day-date" min="2020-01-01" max="2035-12-31" value={fecha} disabled={processing}
        onValueChange={dateValue => { setPreview(null); setFecha(dateValue); }}
        className="w-full min-h-[44px] border border-slate-300 rounded-xl px-3 py-2 text-sm" />
      <p className="mt-3 text-sm text-slate-600">Se incluyen todos los espacios y todas las reservas registradas en esa fecha, aunque estén ocultas por los filtros.</p>
      <p className="mt-2 text-sm text-slate-600">Marca las reservas que deseas borrar y desmarca las que quieres conservar.</p>
      {loading && <p role="status" className="mt-4 text-sm">Consultando reservas del día...</p>}
      {preview?.fecha === fecha && !loading && (
        rows.length ? <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <p role="status" className="font-semibold">{selectedRows.length} de {rows.length} reservas seleccionadas</p>
            <div className="flex gap-3">
              <button type="button" disabled={processing} onClick={() => setSelectedIds(new Set(rows.map(row => row.id)))}
                className="min-h-[44px] font-semibold text-blue-700 hover:underline disabled:opacity-50">Seleccionar todas</button>
              <button type="button" disabled={processing} onClick={() => setSelectedIds(new Set())}
                className="min-h-[44px] font-semibold text-slate-600 hover:underline disabled:opacity-50">Deseleccionar todas</button>
            </div>
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-200">
            {rows.map(row => <label key={row.id} className={`flex items-start gap-3 p-3 cursor-pointer ${selectedIds.has(row.id) ? 'bg-rose-50' : 'bg-white'}`}>
              <input type="checkbox" checked={selectedIds.has(row.id)} disabled={processing}
                onChange={() => setSelectedIds(previous => {
                  const next = new Set(previous);
                  if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                  return next;
                })} className="mt-1 w-5 h-5 shrink-0 accent-rose-600" />
              <span className="min-w-0 text-sm">
                <span className="block font-semibold text-slate-900 break-words">{formatDisplayTitle(row.tipoActividad || row.descripcion)}</span>
                <span className="block text-slate-700">{row.horaInicio} – {row.horaFin} · {formatDisplayTitle(row.espacio)}</span>
                <span className="block text-xs text-slate-500 break-words">{row.responsable}{row.estado === 'cancelada' ? ' · Cancelada' : ''}</span>
              </span>
            </label>)}
          </div>
          {selectedRows.length > 0 && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
            <p>¿Confirmas eliminar las <strong>{selectedRows.length} reservas del {formatDateDDMMYYYY(fecha)}</strong> que seleccionaste?</p>
            <p className="mt-2">Se borrarán únicamente las reservas marcadas. Si seleccionas una sesión recurrente, se eliminará solo la sesión de este día.</p>
          </div>}
        </> : <p role="status" className="mt-4 text-sm">No hay reservas para eliminar el {formatDateDDMMYYYY(fecha)}.</p>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-rose-700">{error}</p>}
      <button type="button" disabled={loading || processing} onClick={() => { setPreview(null); setReload(value => value + 1); }}
        className="mt-3 min-h-[44px] text-sm font-semibold text-blue-700 hover:underline disabled:opacity-50">Actualizar reservas del día</button>
    </BaseModal>
  );
}
