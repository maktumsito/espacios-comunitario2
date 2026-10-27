import type { Reservation } from '../types';
import type { AuthUser } from '../services/authService';
import { BaseModal } from './common/BaseModal';
import { useDistributionPlanner } from '../hooks/useDistributionPlanner';
import { DistributionActivityEditor } from './DistributionActivityEditor';
import { DistributionProposalTable } from './DistributionProposalTable';
import { isReservationActiveForAvailability } from '../utils/conflictDetector';
import { getChileLocalDateString } from '../utils/dateUtils';
import { isChileanHoliday } from '../utils/holidayUtils';
import { isCoordinatorOrAdmin } from '../services/authService';

const button = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
export function DistributionPlannerModal({ user, onClose, onCommitted }: { user: AuthUser; onClose: () => void; onCommitted: (rows: Reservation[]) => void }) {
  const planner = useDistributionPlanner(user, onCommitted);
  const locked = planner.busy || Boolean(planner.pending);
  const existing = planner.snapshot?.reservations.filter(row => row.fecha === planner.fecha && isReservationActiveForAvailability(row, new Set()) && !row.reemplazadaPorReservaId && !planner.requests.some(request => request.source?.id === row.id)) || [];
  return <BaseModal isOpen onClose={() => { if (!planner.busy) onClose(); }} title="Asistente de distribución" subtitle="Planificación de una jornada mediante reglas locales" maxWidth="6xl" closeOnBackdrop={false}
    footer={<div className="flex w-full flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{planner.requests.length}/12 actividades · Borrador en este navegador</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={planner.busy} onClick={onClose}>Cerrar</button>
        <button type="button" className={button} disabled={locked || planner.loading || !planner.requests.length} onClick={planner.calculate}>{planner.busy && !planner.pending ? 'Calculando…' : 'Calcular distribución'}</button>
        <button type="button" className={`${button} !border-blue-700 !bg-blue-700 !text-white hover:!bg-blue-800`} disabled={planner.busy || !planner.canApply || (!planner.pending && (!planner.result || planner.result.unresolved.length > 0 || !planner.result.proposals.length))} onClick={planner.apply}>
          {planner.busy && planner.pending ? 'Confirmando…' : planner.pending ? 'Reintentar confirmación' : 'Aplicar todo el plan'}
        </button>
      </div>
    </div>}>
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-600">Organiza actividades nuevas y redistribuye reservas seleccionadas. El asistente propone salas, horarios y montaje usando los datos registrados. Todos los cambios se revisan aquí y se guardan juntos.</p>
      {planner.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{planner.error}</p>}
      {planner.success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{planner.success}</p>}
      {planner.storageWarning && <p role="status" className="text-sm text-amber-800">{planner.storageWarning}</p>}
      {planner.pending && <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">Hay una confirmación pendiente. La propuesta se conserva sin cambios para reintentar la misma operación sin duplicar reservas.</p>
        <DistributionProposalTable requests={planner.requests} result={{ proposals: planner.pending.proposals, unresolved: [], exploredStates: 0, searchLimitReached: false }} />
      </div>}
      <fieldset disabled={locked} className="space-y-6 disabled:opacity-60">
        <label className="block max-w-xs text-xs font-semibold text-slate-700">Fecha de la jornada
          <input type="date" min={getChileLocalDateString()} value={planner.fecha} onChange={event => planner.changeDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <span className="mt-1 block font-normal text-slate-500">Al cambiar la fecha se retiran las reservas existentes seleccionadas.</span>
        </label>
        {planner.loading && <div role="status" className="space-y-3"><span className="text-sm text-slate-500">Confirmando agenda, bloqueos y catálogos…</span><div className="h-14 rounded-lg bg-slate-100 animate-pulse" /><div className="h-14 rounded-lg bg-slate-100 animate-pulse" /></div>}
        {!planner.loading && !planner.snapshot && <button type="button" className={button} onClick={planner.calculate}>Reintentar lectura de la jornada</button>}
        {planner.snapshot && <>
          <div className="flex flex-wrap items-end gap-3">
            <button type="button" className={button} disabled={!planner.canCreate || planner.requests.length >= 12} onClick={planner.addNew}>Agregar actividad nueva</button>
            <label className="min-w-0 flex-1 max-w-xl text-xs font-semibold text-slate-700">Incorporar reserva de la jornada
              <select value="" disabled={!planner.canEdit || planner.requests.length >= 12} onChange={event => planner.addExisting(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                <option value="">{existing.length ? 'Selecciona una reserva' : 'No hay más reservas activas en la fecha'}</option>
                {existing.map(row => <option key={row.id} value={row.id}>{row.horaInicio} · {row.espacio} · {row.descripcion}</option>)}
              </select>
            </label>
          </div>
          {(!planner.canCreate || !planner.canEdit) && <p className="text-xs text-slate-500">Tu cuenta puede {planner.canCreate ? 'crear actividades nuevas' : planner.canEdit ? 'reorganizar reservas existentes' : 'consultar la jornada'}. Se respetan los permisos asignados.</p>}
          {!planner.canApply && planner.requests.length > 0 && <p role="alert" className="text-sm text-red-700">Tus permisos cambiaron. No puedes aplicar todas las actividades de este borrador.</p>}
          {!planner.requests.length && <div className="border-y border-slate-200 py-10 text-center"><h4 className="font-semibold text-slate-900">Comienza con las necesidades de tu jornada</h4><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Agrega actividades o incorpora reservas. Las reservas que no selecciones seguirán ocupando sus salas y recursos.</p></div>}
          {planner.requests.map((request, index) => <DistributionActivityEditor key={request.id} request={request} snapshot={planner.snapshot!} index={index} onChange={updated => planner.updateRequests(planner.requests.map(row => row.id === request.id ? updated : row))} onRemove={() => planner.updateRequests(planner.requests.filter(row => row.id !== request.id))} />)}
          {isChileanHoliday(planner.fecha) && planner.requests.length > 0 && <label className="block max-w-md text-sm font-medium text-amber-900">Autorización de feriado CCD
            <input type="password" value={planner.requests[0]?.holidayAuthorization || ''} disabled={!isCoordinatorOrAdmin(user)} autoComplete="off" className="mt-1 min-h-11 w-full rounded-lg border border-amber-300 px-3 py-2" onChange={event => {
              const value = event.target.value;
              planner.updateRequests(planner.requests.map(r => ({ ...r, holidayAuthorization: value })));
            }} />
            <span className="mt-1 block text-xs font-normal">La confirmación en feriados requiere autorización y cuenta de administración o coordinación.</span>
          </label>}
        </>}
      </fieldset>
      {planner.result && !planner.pending && <DistributionProposalTable result={planner.result} requests={planner.requests} />}
    </div>
  </BaseModal>;
}
