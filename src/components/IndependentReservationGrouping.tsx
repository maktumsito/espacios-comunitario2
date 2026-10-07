import { useRef, useState } from 'react';
import { collection, getDocsFromServer } from 'firebase/firestore';
import { getDb } from '../firebase/config';
import { getStoredAuthUser, userCanEditReservations } from '../services/authService';
import type { Reservation } from '../types';
import { WEEKDAYS, formatDateDDMMYYYY } from '../utils/dateUtils';
import { applyIndependentReservationGroup, planIndependentReservationGroups, type IndependentReservationGroup } from '../services/migrations/groupIndependentReservations';

export function IndependentReservationGrouping() {
  const [groups, setGroups] = useState<IndependentReservationGroup[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const run = async (apply: boolean) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    let completed = 0;
    try {
      const user = getStoredAuthUser();
      if (!userCanEditReservations(user) || !user) throw new Error('Debes iniciar sesión con permiso para editar reservas.');
      if (!apply) {
        // Full history is necessary to distinguish imported one-member series from established series.
        const snapshot = await getDocsFromServer(collection(getDb(), 'reservas'));
        const rows = snapshot.docs.map(document => ({ ...document.data(), id: document.id } as Reservation));
        const planned = planIndependentReservationGroups(rows);
        setGroups(planned);
        if (!planned.length) setMessage('No hay reservas individuales repetidas para agrupar.');
      } else if (groups?.length) {
        if (groups.some(group => group.reservations.length > 400)) throw new Error('Un grupo supera las 400 reservas. No se inició la agrupación.');
        for (const group of groups) {
          await applyIndependentReservationGroup(getDb(), group, user.name || user.username);
          completed++;
          setGroups(previous => previous?.filter(candidate => candidate.seriesId !== group.seriesId) || []);
        }
        setGroups(null);
        setMessage(`Agrupación completada: ${completed} series recurrentes. Se conservaron las fechas y horarios.`);
      }
    } catch (error) {
      setMessage(`${completed ? `${completed} grupos guardados. ` : ''}${error instanceof Error ? error.message : 'No se pudo completar la agrupación.'}`);
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
    <h2 className="font-bold text-slate-900">Agrupar reservas individuales como recurrentes</h2>
    <p className="text-sm text-slate-600">Detecta reservas desde hoy con el mismo día de la semana, horario de inicio y término, y nombres similares. Conserva cada espacio, responsable y fecha; las reservas anteriores y las series existentes quedan intactas.</p>
    <button type="button" disabled={busy} onClick={() => void run(false)} className="px-4 py-2 rounded-xl border border-blue-300 text-blue-700 disabled:opacity-50">{busy ? 'Procesando…' : 'Buscar reservas para agrupar'}</button>
    {Boolean(groups?.length) && <>
      <p className="text-sm font-semibold">{groups!.length} grupos · {groups!.reduce((sum, group) => sum + group.reservations.length, 0)} reservas</p>
      <ul className="max-h-64 overflow-y-auto space-y-2 text-sm">
        {groups!.map(group => <li key={group.seriesId} className="rounded-lg bg-slate-50 p-3">
          <strong>{group.reservations[0].descripcion}</strong> · {WEEKDAYS.find(day => day.dayNum === group.weekday)?.full} · {group.reservations[0].horaInicio}–{group.reservations[0].horaFin} · {group.reservations.length} reservas
          <div className="text-slate-600">{[...new Set(group.reservations.map(row => row.descripcion))].join(' / ')}</div>
          <div className="text-slate-500">{group.reservations.map(row => `${formatDateDDMMYYYY(row.fecha)} (${row.espacio})`).join(', ')}</div>
        </li>)}
      </ul>
      <button type="button" disabled={busy} onClick={() => void run(true)} className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50">Agrupar las reservas detectadas</button>
    </>}
    {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
  </section>;
}
