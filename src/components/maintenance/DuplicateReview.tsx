import { useMemo, useState } from 'react';
import type { Reservation } from '../../types';
import { findDuplicateCandidates } from '../../utils/maintenanceDiagnostics';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';

export function DuplicateReview({ reservations, onReview }: { reservations: Reservation[]; onReview?: (reservation: Reservation) => void | Promise<void> }) {
  const [page, setPage] = useState(0);
  const groups = useMemo(() => findDuplicateCandidates(reservations), [reservations]);
  const safePage = Math.min(page, Math.max(0, Math.ceil(groups.length / 10) - 1));
  return <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="duplicate-review-title">
    <h3 id="duplicate-review-title" className="font-semibold text-slate-900">Revisión de posibles duplicados</h3>
    <p className="mt-2 text-sm text-slate-600">Compara reservas activas con el mismo espacio, fecha, horario, responsable y actividad. Cada registro se revisa en su ficha; la revisión no elimina ni modifica reservas.</p>
    <p className="mt-2 text-xs text-slate-500">Alcance: {reservations.length} reservas cargadas en la agenda. {groups.length} grupos candidatos. El resultado no cubre el historial que todavía no se ha cargado.</p>
    {!groups.length && <p role="status" className="mt-4 text-sm text-emerald-800">No se encontraron coincidencias exactas en las reservas cargadas. Los topamientos de horarios se revisan en Conflictos.</p>}
    <div className="mt-4 space-y-4">{groups.slice(safePage * 10, safePage * 10 + 10).map(group => {
      const first = group.reservations[0];
      return <div key={group.key} className="rounded-lg border border-amber-200 bg-amber-50/40 p-4"><h4 className="text-sm font-semibold text-slate-900">{first.descripcion} · {first.espacio}</h4>
        <p className="mt-1 text-xs text-slate-600">{formatDateDDMMYYYY(first.fecha)} · {first.horaInicio}–{first.horaFin} · {first.responsable}</p>
        <ul className="mt-3 divide-y divide-amber-200">{group.reservations.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
          <span className="break-all font-mono text-xs text-slate-600">{row.id}</span>
          {onReview && <button type="button" onClick={() => onReview(row)} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">Revisar reserva {row.id}</button>}
        </li>)}</ul></div>;
    })}</div>
    {groups.length > 10 && <div className="mt-4 flex items-center gap-3 text-sm"><button className="min-h-11 px-3 disabled:opacity-50" disabled={!safePage} onClick={() => setPage(safePage - 1)}>Anterior</button><span>Página {safePage + 1} de {Math.ceil(groups.length / 10)}</span><button className="min-h-11 px-3 disabled:opacity-50" disabled={(safePage + 1) * 10 >= groups.length} onClick={() => setPage(safePage + 1)}>Siguiente</button></div>}
  </section>;
}
