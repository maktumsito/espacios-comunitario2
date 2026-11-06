import React, { useMemo, useState } from 'react';
import type { Reservation, SpaceBlock, SpaceInfo } from '../types';
import { buildWorkshopImport, parseWorkshopRows, type WorkshopRow, type WorkshopImportPreview } from '../utils/workshopImport';
import { detectBatchConflicts, findMaintenanceBlockConflicts, formatBlockConflictMessage } from '../utils/conflictDetector';
import { getEnabledSpaces } from '../utils/spaceAvailability';

interface Props {
  spaces: SpaceInfo[];
  spaceBlocks: SpaceBlock[];
  reservations: Reservation[];
  onImportReservations: (rows: Reservation[]) => Promise<void>;
}

export function WorkshopImport({ spaces, spaceBlocks, reservations, onImportReservations }: Props) {
  const [rows, setRows] = useState<WorkshopRow[]>([]);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<WorkshopImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const enabledSpaces = getEnabledSpaces(spaces);
  const missing = rows.filter(row => !enabledSpaces.some(space => space.name === assignments[row.row])).length;
  const conflicts = useMemo(() => preview ? detectBatchConflicts(preview.reservations, reservations) : [], [preview, reservations]);
  const blocks = useMemo(() => preview ? findMaintenanceBlockConflicts(preview.reservations, spaceBlocks) : [], [preview, spaceBlocks]);

  async function load(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setMessage(''); setFilename(''); setPreview(null); setRows([]); setAssignments({});
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('Selecciona un archivo .xlsx.');
      if (file.size > 10 * 1024 * 1024) throw new Error('El archivo debe pesar como máximo 10 MB.');
      const { readSheet } = await import('read-excel-file/browser');
      setRows(parseWorkshopRows(await readSheet(file)));
      setFilename(file.name);
    } catch (cause) { setError((cause as Error).message || 'No se pudo leer el Excel.'); }
    finally { setBusy(false); }
  }

  async function review() {
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try { setPreview(await buildWorkshopImport(rows, assignments, spaces, reservations)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!preview || busy || missing || conflicts.length || blocks.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      // Recheck the latest catalog, known reservations and blocks before invoking the normal writer.
      const latest = await buildWorkshopImport(rows, assignments, spaces, reservations);
      if (detectBatchConflicts(latest.reservations, reservations).length || findMaintenanceBlockConflicts(latest.reservations, spaceBlocks).length) {
        throw new Error('Cambió la disponibilidad. Revisa los topamientos antes de guardar.');
      }
      if (!latest.reservations.length) { setPreview(latest); setMessage('Estos talleres ya están ingresados.'); return; }
      await onImportReservations(latest.reservations);
      setMessage(`Se guardaron ${latest.reservations.length} sesiones recurrentes de TALLER CCD.`);
      setPreview(null); setRows([]); setAssignments({}); setFilename('');
    } catch (cause) {
      setError(`${(cause as Error).message} Puedes volver a revisar y reintentar; las sesiones confirmadas no se duplican.`);
      setPreview(null);
    } finally { setBusy(false); }
  }

  return <section aria-label="Importar talleres desde Excel" className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
    <h3 className="font-bold text-sm text-slate-900">Importar talleres desde Excel</h3>
    <p className="text-xs text-slate-600">Reservas semanales del 01/03/2027 al 30/11/2027. Actividad: TALLER CCD. Responsable: PROFESOR. Solo debes elegir el espacio de cada taller.</p>
    <p className="text-xs text-slate-600">Columnas: NOMBRE TALLER, HORARIO 1, HORARIO 2 (opcional), PROFESOR. Reconoce LUN, MAR, MIE, JUE, VIE, SAB y DOM. Los feriados se omiten y se detallan antes de guardar.</p>
    <label className="block text-xs font-semibold text-slate-800">Seleccionar Excel de talleres
      <input aria-label="Excel de talleres" type="file" accept=".xlsx" disabled={busy} className="block w-full mt-2 text-xs" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void load(file); }} />
    </label>
    {filename && <p className="text-xs text-slate-700 break-all">Archivo cargado: {filename}</p>}
    {rows.length > 0 && <>
      <p className="text-xs font-semibold text-slate-700">{rows.length} talleres · {rows.reduce((count, row) => count + row.schedules.length, 0)} horarios semanales · {missing} espacios pendientes</p>
      <div className="max-h-80 overflow-y-auto space-y-2">
        {rows.map(row => <div key={row.row} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
          <p className="text-xs font-bold text-slate-900">Fila {row.row}: {row.name}</p>
          <p className="text-xs text-slate-600">{row.teacher}</p>
          <p className="text-xs text-slate-600">{row.schedules.map(slot => `${['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][slot.day]} ${slot.start}–${slot.end}`).join(' · ')}</p>
          <label className="block text-xs text-slate-700">Espacio para {row.name} (fila {row.row})
            <select value={assignments[row.row] || ''} disabled={busy} className="block w-full min-h-11 mt-1 border border-slate-300 rounded-lg bg-white px-2 text-sm" onChange={event => { setAssignments(previous => ({ ...previous, [row.row]: event.target.value })); setPreview(null); setError(''); setMessage(''); }}>
              <option value="">Selecciona un espacio</option>
              {enabledSpaces.map(space => <option key={space.id} value={space.name}>{space.name}</option>)}
            </select>
          </label>
        </div>)}
      </div>
      <button type="button" disabled={busy || missing > 0} onClick={() => void review()} className="min-h-11 px-4 rounded-xl bg-white border border-blue-300 text-sm font-semibold text-blue-800 disabled:opacity-50">Revisar importación</button>
    </>}
    {preview && <div className="space-y-2 text-xs text-slate-800" aria-label="Resumen de importación">
      <p className="font-semibold">{preview.reservations.length} sesiones nuevas · {preview.duplicates} ya ingresadas · {preview.omittedHolidays.reduce((sum, holiday) => sum + holiday.sessions, 0)} sesiones omitidas por feriados</p>
      {preview.omittedHolidays.length > 0 && <details><summary className="cursor-pointer">Ver feriados omitidos</summary><ul className="mt-2 space-y-1">{preview.omittedHolidays.map(holiday => <li key={holiday.date}>{holiday.date}: {holiday.name} ({holiday.sessions} sesiones)</li>)}</ul></details>}
      {(conflicts.length > 0 || blocks.length > 0) && <div role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="font-bold">Hay {conflicts.length + blocks.length} topamientos. Ajusta los espacios y vuelve a revisar.</p>
        <ul className="mt-2 space-y-1">{conflicts.slice(0, 15).map((conflict, i) => <li key={`reservation-${i}`}>{conflict.fecha} · {conflict.espacio} · {conflict.overlap}: {conflict.reserva.descripcion} / {conflict.conflictingWith.descripcion}</li>)}{blocks.slice(0, 5).map((block, i) => <li key={`block-${i}`}>{formatBlockConflictMessage(block)}</li>)}</ul>
        {conflicts.length > 15 || blocks.length > 5 ? <p>Se muestran los primeros topamientos.</p> : null}
      </div>}
      <button type="button" disabled={busy || missing > 0 || !preview.reservations.length || conflicts.length > 0 || blocks.length > 0} onClick={() => void save()} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">Guardar {preview.reservations.length} sesiones recurrentes</button>
    </div>}
    {busy && <p role="status" className="text-xs text-blue-800">Procesando talleres…</p>}
    {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    {message && <p role="status" className="text-xs text-emerald-800">{message}</p>}
  </section>;
}
