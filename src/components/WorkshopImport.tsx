import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ActivityTypeItem, EquipmentItem, LoanType, Reservation, SpaceBlock, SpaceInfo } from '../types';
import type { AuthUser } from '../services/authService';
import { buildWorkshopImport, type WorkshopRow, type WorkshopImportPreview } from '../utils/workshopImport';
import { readReservationImportFile } from '../utils/workshopImportFile';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { detectBatchConflicts, findMaintenanceBlockConflicts, formatBlockConflictMessage } from '../utils/conflictDetector';
import { getEnabledSpaces } from '../utils/spaceAvailability';
import { DEFAULT_ACTIVITY_ITEMS } from '../data/activityTypes';
const ReservationEditor = lazyWithRetry(() => import('./ReservationModal').then(module => ({ default: module.ReservationModal })), 'WorkshopReservationEditor');

interface Props {
  spaces: SpaceInfo[];
  spaceBlocks: SpaceBlock[];
  reservations: Reservation[];
  onImportReservations: (rows: Reservation[]) => Promise<void>;
  source?: { rows: WorkshopRow[]; name: string } | null;
  currentUser?: AuthUser | null;
  activityTypes?: ActivityTypeItem[];
  loanTypes?: LoanType[];
  equipment?: EquipmentItem[];
}

export function WorkshopImport({ spaces, spaceBlocks, reservations, onImportReservations, source, currentUser, activityTypes, loanTypes, equipment }: Props) {
  const [rows, setRows] = useState<WorkshopRow[]>([]);
  const [removedRows, setRemovedRows] = useState<WorkshopRow[]>([]);
  const [assignments, setAssignments] = useState<Record<number, string>>({});
  const [activityAssignments, setActivityAssignments] = useState<Record<number, string>>({});
  const [preview, setPreview] = useState<WorkshopImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<number, Reservation[]>>({});
  const [editor, setEditor] = useState<{ row: number; sessions: Reservation[] } | null>(null);
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!source) return;
    setRows(source.rows); setRemovedRows([]); setEditor(null); setFilename(source.name); setAssignments({}); setActivityAssignments({}); setDrafts({}); setPreview(null); setError(''); setMessage('');
    section.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [source]);
  const enabledSpaces = getEnabledSpaces(spaces);
  const categories = activityTypes ?? DEFAULT_ACTIVITY_ITEMS;
  const defaultActivity = categories.find(item => item.name === 'TALLER CCD')?.name || categories[0]?.name || '';
  const effectiveActivityAssignments = Object.fromEntries(rows.map(row => [row.row, activityAssignments[row.row] ?? defaultActivity]));
  const missingCategories = rows.filter(row => {
    const sessions = drafts[row.row];
    return sessions ? sessions.some(session => !categories.some(item => item.name === session.tipoActividad))
      : !categories.some(item => item.name === effectiveActivityAssignments[row.row]);
  }).length;
  const missing = rows.filter(row => drafts[row.row] ? drafts[row.row].some(session => !enabledSpaces.some(space => space.name === session.espacio)) : !enabledSpaces.some(space => space.name === assignments[row.row])).length;
  const conflicts = useMemo(() => preview ? detectBatchConflicts(preview.reservations, reservations) : [], [preview, reservations]);
  const blocks = useMemo(() => preview ? findMaintenanceBlockConflicts(preview.reservations, spaceBlocks) : [], [preview, spaceBlocks]);

  async function load(file?: File) {
    if (!file) return;
    setBusy(true); setError(''); setMessage(''); setFilename(''); setPreview(null); setRows([]); setRemovedRows([]); setEditor(null); setAssignments({}); setActivityAssignments({}); setDrafts({});
    try {
      const result = await readReservationImportFile(file);
      if (!result.workshops) throw new Error('El archivo debe incluir NOMBRE TALLER, HORARIO 1 y PROFESOR. Para respaldos de reservas utiliza Importar Excel o CSV.');
      setRows(result.workshops);
      setFilename(file.name);
    } catch (cause) { setError((cause as Error).message || 'No se pudo leer el Excel.'); }
    finally { setBusy(false); }
  }

  async function review() {
    setBusy(true); setError(''); setMessage(''); setPreview(null);
    try { setPreview(await buildWorkshopImport(rows, assignments, spaces, reservations, drafts, effectiveActivityAssignments)); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function save() {
    if (!preview || busy || missing || missingCategories || conflicts.length || blocks.length) return;
    setBusy(true); setError(''); setMessage('');
    try {
      // Recheck the latest catalog, known reservations and blocks before invoking the normal writer.
      const latest = await buildWorkshopImport(rows, assignments, spaces, reservations, drafts, effectiveActivityAssignments);
      if (detectBatchConflicts(latest.reservations, reservations).length || findMaintenanceBlockConflicts(latest.reservations, spaceBlocks).length) {
        throw new Error('Cambió la disponibilidad. Revisa los topamientos antes de guardar.');
      }
      if (!latest.reservations.length) { setPreview(latest); setMessage('Estos talleres ya están ingresados.'); return; }
      await onImportReservations(latest.reservations);
      setMessage(`Se guardaron ${latest.reservations.length} sesiones de talleres.`);
      setPreview(null); setRows([]); setRemovedRows([]); setAssignments({}); setActivityAssignments({}); setDrafts({}); setFilename('');
    } catch (cause) {
      setError(`${(cause as Error).message} Puedes volver a revisar y reintentar; las sesiones confirmadas no se duplican.`);
      setPreview(null);
    } finally { setBusy(false); }
  }

  async function edit(row: WorkshopRow) {
    setBusy(true); setError('');
    try {
      const draft = await buildWorkshopImport([row], { [row.row]: assignments[row.row] || enabledSpaces[0]?.name }, spaces, [], drafts, effectiveActivityAssignments);
      if (!draft.reservations.length) throw new Error('Este taller no tiene sesiones disponibles para editar.');
      setEditor({ row: row.row, sessions: draft.reservations });
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function remove(row: WorkshopRow) {
    if (busy) return;
    setRows(previous => previous.filter(item => item.row !== row.row));
    setRemovedRows(previous => [...previous, row]);
    setPreview(null); setError(''); setMessage('');
    if (editor?.row === row.row) setEditor(null);
  }

  function undoRemove() {
    if (busy || !removedRows.length) return;
    const restored = removedRows[removedRows.length - 1];
    setRows(previous => [...previous, restored].sort((a, b) => a.row - b.row));
    setRemovedRows(previous => previous.slice(0, -1));
    setPreview(null); setError(''); setMessage('');
  }

  return <section ref={section} aria-label="Importar talleres desde Excel" className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-3">
    <h3 className="font-bold text-sm text-slate-900">Importar talleres desde Excel o CSV</h3>
    <p className="text-xs text-slate-600">Valores iniciales: reservas semanales del 01/03/2027 al 30/11/2027 y profesor como responsable. Elige el espacio y la categoría de actividad de cada taller antes de importar. Puedes cambiar los demás datos en Editar todas las opciones.</p>
    <p className="text-xs text-slate-600">Columnas: NOMBRE TALLER, HORARIO 1, HORARIO 2 (opcional), PROFESOR. Reconoce LUN, MAR, MIE, JUE, VIE, SAB y DOM. Los feriados se omiten y se detallan antes de guardar.</p>
    <label className="block text-xs font-semibold text-slate-800">Seleccionar Excel o CSV de talleres
      <input aria-label="Excel de talleres" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} className="block w-full mt-2 text-xs" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void load(file); }} />
    </label>
    {filename && <p className="text-xs text-slate-700 break-all">Archivo cargado: {filename}</p>}
    {removedRows.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
      <p role="status" className="text-xs text-amber-900">{removedRows.length} taller(es) eliminado(s) de esta importación. {rows.length === 0 ? 'No quedan talleres para importar.' : 'Sus sesiones no se guardarán.'} Las reservas existentes no se modifican.</p>
      <button type="button" disabled={busy} onClick={undoRemove} className="min-h-11 px-3 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-900">Deshacer última eliminación</button>
    </div>}
    {rows.length > 0 && <>
      <p className="text-xs font-semibold text-slate-700">{rows.length} talleres · {rows.reduce((count, row) => count + row.schedules.length, 0)} horarios semanales · {missing} espacios pendientes · {missingCategories} categorías pendientes</p>
      <div className="max-h-80 overflow-y-auto space-y-2">
        {rows.map(row => <div key={row.row} className="p-3 bg-white border border-slate-200 rounded-xl space-y-1">
          <p className="text-xs font-bold text-slate-900">Fila {row.row}: {drafts[row.row]?.[0]?.descripcion || row.name}</p>
          <p className="text-xs text-slate-600">{drafts[row.row]?.[0]?.responsable || row.teacher}</p>
          {drafts[row.row] ? <p className="text-xs text-blue-800">Personalizado · {drafts[row.row].length} sesiones · {drafts[row.row][0].tipoActividad} · {drafts[row.row][0].fecha} al {drafts[row.row].at(-1)!.fecha} · {[...new Set(drafts[row.row].map(session => `${session.espacio} ${session.horaInicio}–${session.horaFin}`))].join(' · ')}</p> : <p className="text-xs text-slate-600">{row.schedules.map(slot => `${['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'][slot.day]} ${slot.start}–${slot.end}`).join(' · ')}</p>}
          <label className="block text-xs text-slate-700">Espacio para {row.name} (fila {row.row})
            <select value={assignments[row.row] || ''} disabled={busy} className="block w-full min-h-11 mt-1 border border-slate-300 rounded-lg bg-white px-2 text-sm" onChange={event => { const space = event.target.value; setAssignments(previous => ({ ...previous, [row.row]: space })); setDrafts(previous => previous[row.row] ? { ...previous, [row.row]: previous[row.row].map(session => ({ ...session, espacio: space })) } : previous); setPreview(null); setError(''); setMessage(''); }}>
              <option value="">Selecciona un espacio</option>
              {enabledSpaces.map(space => <option key={space.id} value={space.name}>{space.name}</option>)}
            </select>
          </label>
          <label className="block text-xs text-slate-700">Categoría de actividad para {row.name} (fila {row.row})
            <select value={activityAssignments[row.row] ?? defaultActivity} disabled={busy} className="block w-full min-h-11 mt-1 border border-slate-300 rounded-lg bg-white px-2 text-sm" onChange={event => {
              const activity = event.target.value;
              setActivityAssignments(previous => ({ ...previous, [row.row]: activity }));
              setDrafts(previous => previous[row.row] ? { ...previous, [row.row]: previous[row.row].map(session => ({ ...session, tipoActividad: activity, tipoPrestamo: activity })) } : previous);
              setPreview(null); setError(''); setMessage('');
            }}>
              <option value="">Selecciona una categoría</option>
              {[...new Set(categories.map(item => item.category))].map(category => <optgroup key={category} label={category}>
                {categories.filter(item => item.category === category).map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
              </optgroup>)}
              {activityAssignments[row.row] && !categories.some(item => item.name === activityAssignments[row.row]) && <option value={activityAssignments[row.row]}>{activityAssignments[row.row]} (no disponible)</option>}
            </select>
          </label>
          <button type="button" disabled={busy || !enabledSpaces.length} onClick={() => void edit(row)} className="min-h-11 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-blue-800">Editar todas las opciones (fila {row.row})</button>
          <button type="button" disabled={busy} onClick={() => remove(row)} aria-label={`Eliminar taller ${drafts[row.row]?.[0]?.descripcion || row.name} de la importación (fila ${row.row})`} className="min-h-11 px-3 rounded-lg border border-red-200 text-xs font-semibold text-red-800 sm:ml-2">Eliminar taller de la importación</button>
        </div>)}
      </div>
      <button type="button" disabled={busy || missing > 0 || missingCategories > 0} onClick={() => void review()} className="min-h-11 px-4 rounded-xl bg-white border border-blue-300 text-sm font-semibold text-blue-800 disabled:opacity-50">Revisar importación</button>
    </>}
    {preview && <div className="space-y-2 text-xs text-slate-800" aria-label="Resumen de importación">
      <p className="font-semibold">{preview.reservations.length} sesiones nuevas · {preview.duplicates} ya ingresadas · {preview.omittedHolidays.reduce((sum, holiday) => sum + holiday.sessions, 0)} sesiones omitidas por feriados</p>
      {preview.omittedHolidays.length > 0 && <details><summary className="cursor-pointer">Ver feriados omitidos</summary><ul className="mt-2 space-y-1">{preview.omittedHolidays.map(holiday => <li key={holiday.date}>{holiday.date}: {holiday.name} ({holiday.sessions} sesiones)</li>)}</ul></details>}
      {(conflicts.length > 0 || blocks.length > 0) && <div role="alert" className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="font-bold">Hay {conflicts.length + blocks.length} topamientos. Ajusta los espacios y vuelve a revisar.</p>
        <ul className="mt-2 space-y-1">{conflicts.slice(0, 15).map((conflict, i) => <li key={`reservation-${i}`}>{conflict.fecha} · {conflict.espacio} · {conflict.overlap}: {conflict.reserva.descripcion} / {conflict.conflictingWith.descripcion}</li>)}{blocks.slice(0, 5).map((block, i) => <li key={`block-${i}`}>{formatBlockConflictMessage(block)}</li>)}</ul>
        {conflicts.length > 15 || blocks.length > 5 ? <p>Se muestran los primeros topamientos.</p> : null}
      </div>}
      <button type="button" disabled={busy || missing > 0 || missingCategories > 0 || !preview.reservations.length || conflicts.length > 0 || blocks.length > 0} onClick={() => void save()} className="min-h-11 px-4 rounded-xl bg-blue-700 text-white text-sm font-semibold disabled:opacity-50">Guardar {preview.reservations.length} sesiones recurrentes</button>
    </div>}
    {busy && <p role="status" className="text-xs text-blue-800">Procesando talleres…</p>}
    {error && <p role="alert" className="text-xs text-red-800">{error}</p>}
    {message && <p role="status" className="text-xs text-emerald-800">{message}</p>}
    {editor && <Suspense fallback={<p role="status">Abriendo opciones de la reserva…</p>}><ReservationEditor
      isOpen draftMode editingReservation={editor.sessions[0]} currentUser={currentUser}
      availableSpaces={spaces} availableActivityTypes={activityTypes} availableLoanTypes={loanTypes} availableEquipment={equipment} spaceBlocks={spaceBlocks}
      allReservations={[...reservations.filter(reservation => !editor.sessions.some(session => session.id === reservation.id)), ...editor.sessions]}
      onClose={() => setEditor(null)}
      onSave={(reservation, _generate, _slots, _whole, batch) => {
        const changed = batch?.updatedReservations || [reservation];
        const removed = new Set([...(batch?.deletedIds || []), ...changed.map(session => session.id)]);
        const sessions = [...editor.sessions.filter(session => !removed.has(session.id)), ...changed].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio));
        setDrafts(previous => ({ ...previous, [editor.row]: sessions }));
        setAssignments(previous => ({ ...previous, [editor.row]: sessions[0]?.espacio || '' }));
        setActivityAssignments(previous => ({ ...previous, [editor.row]: sessions[0]?.tipoActividad || '' }));
        setPreview(null); setMessage('Cambios guardados en la revisión. Todavía no se han importado a la base de datos.');
        return true;
      }}
    /></Suspense>}
  </section>;
}
