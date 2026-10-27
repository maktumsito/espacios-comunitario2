import { useState } from 'react';
import type { Reservation } from '../types';
import type { AuthUser } from '../services/authService';
import { BaseModal } from './common/BaseModal';
import { useDistributionPlanner } from '../hooks/useDistributionPlanner';
import { DistributionActivityEditor } from './DistributionActivityEditor';
import { DistributionProposalTable } from './DistributionProposalTable';
import { doSpacesConflict, isReservationActiveForAvailability, isTimeOverlapping, timeToMinutes } from '../utils/conflictDetector';
import { getChileLocalDateString } from '../utils/dateUtils';
import { isChileanHoliday } from '../utils/holidayUtils';
import { isCoordinatorOrAdmin } from '../services/authService';
import { MAX_DISTRIBUTION_ACTIVITIES } from '../utils/roomDistribution';

const button = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
const smallChip = 'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors';

export function DistributionPlannerModal({ user, onClose, onCommitted }: { user: AuthUser; onClose: () => void; onCommitted: (rows: Reservation[]) => void }) {
  const planner = useDistributionPlanner(user, onCommitted);
  const locked = planner.busy || Boolean(planner.pending);

  const [spacesToVacate, setSpacesToVacate] = useState<string[]>([]);
  const [vacateStart, setVacateStart] = useState('08:30');
  const [vacateEnd, setVacateEnd] = useState('14:00');
  const [priorityOrder, setPriorityOrder] = useState<string[]>([]);
  const [restrictToPriority, setRestrictToPriority] = useState(false);
  const [allowCascade, setAllowCascade] = useState(true);
  const [allowFlexibleTime, setAllowFlexibleTime] = useState(false);
  const [addIncomingActivity, setAddIncomingActivity] = useState(false);
  const [incomingDesc, setIncomingDesc] = useState('');
  const [incomingResp, setIncomingResp] = useState('Equipo comunitario');
  const [incomingParticipants, setIncomingParticipants] = useState(15);

  const activeDayReservations = planner.snapshot?.reservations
    .filter(row => row.fecha === planner.fecha && isReservationActiveForAvailability(row, new Set()) && !row.reemplazadaPorReservaId)
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio) || a.espacio.localeCompare(b.espacio)) || [];
  const existing = activeDayReservations.filter(row => !planner.requests.some(request => request.source?.id === row.id));
  const canAddMore = planner.requests.length < MAX_DISTRIBUTION_ACTIVITIES;

  const startMin = timeToMinutes(vacateStart);
  const endMin = timeToMinutes(vacateEnd);
  const validWindow = endMin > startMin;

  const reservationsInWindowBySpace = (spaceName: string) =>
    activeDayReservations.filter(row =>
      validWindow &&
      doSpacesConflict(row.espacio, spaceName) &&
      isTimeOverlapping(timeToMinutes(row.horaInicio), timeToMinutes(row.horaFin), startMin, endMin)
    );

  const affectedReservations = activeDayReservations.filter(row =>
    validWindow &&
    spacesToVacate.some(s => doSpacesConflict(row.espacio, s)) &&
    isTimeOverlapping(timeToMinutes(row.horaInicio), timeToMinutes(row.horaFin), startMin, endMin)
  );

  const toggleSpaceToVacate = (name: string) => {
    setSpacesToVacate(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
    setPriorityOrder(prev => prev.filter(s => s !== name));
  };

  const togglePrioritySpace = (name: string) => {
    if (spacesToVacate.includes(name)) return;
    setPriorityOrder(prev => prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]);
  };

  const handleVacateAndCalculate = () => {
    planner.vacateSpaces({
      spacesToVacate,
      startTime: vacateStart,
      endTime: vacateEnd,
      prioritySpaces: priorityOrder,
      restrictToPrioritySpaces: restrictToPriority,
      allowCascade,
      allowFlexibleTime,
      ...(addIncomingActivity && incomingDesc.trim() ? {
        replacementActivity: {
          descripcion: incomingDesc.trim(),
          responsable: incomingResp.trim() || 'Equipo comunitario',
          cantidadParticipantes: incomingParticipants,
          targetSpace: spacesToVacate[0],
        },
      } : {}),
    });
  };

  return <BaseModal isOpen onClose={() => { if (!planner.busy) onClose(); }} title="Asistente de distribución" subtitle="Planificación de una jornada mediante reglas locales" maxWidth="6xl" closeOnBackdrop={false}
    footer={<div className="flex w-full flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-slate-500">{planner.requests.length}/{MAX_DISTRIBUTION_ACTIVITIES} actividades · Borrador en este navegador</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={button} disabled={planner.busy} onClick={onClose}>Cerrar</button>
        <button type="button" className={button} disabled={locked || planner.loading || !planner.requests.length} onClick={planner.calculate}>{planner.busy && !planner.pending ? 'Calculando…' : 'Calcular distribución'}</button>
        <button type="button" className={`${button} !border-blue-700 !bg-blue-700 !text-white hover:!bg-blue-800`} disabled={planner.busy || !planner.canApply || (!planner.pending && (!planner.result || planner.result.unresolved.length > 0 || !planner.result.proposals.length))} onClick={planner.apply}>
          {planner.busy && planner.pending ? 'Confirmando…' : planner.pending ? 'Reintentar confirmación' : 'Aplicar todo el plan'}
        </button>
      </div>
    </div>}>
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-relaxed text-slate-600">Desocupa salas en un rango horario o agrega actividades nuevas. Indica qué necesitas, en qué orden priorizar los espacios destino y el asistente calculará automáticamente la distribución.</p>
      {planner.error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{planner.error}</p>}
      {planner.success && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{planner.success}</p>}
      {planner.storageWarning && <p role="status" className="text-sm text-amber-800">{planner.storageWarning}</p>}
      {planner.pending && <div className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-900">Hay una confirmación pendiente. La propuesta se conserva sin cambios para reintentar la misma operación sin duplicar reservas.</p>
        <DistributionProposalTable requests={planner.requests} result={{ proposals: planner.pending.proposals, unresolved: [], exploredStates: 0, searchLimitReached: false }} />
      </div>}
      <fieldset disabled={locked} className="space-y-6 disabled:opacity-60">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="block max-w-xs text-xs font-semibold text-slate-700">Fecha de la jornada
            <input type="date" min={getChileLocalDateString()} value={planner.fecha} onChange={event => planner.changeDate(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <span className="mt-1 block font-normal text-slate-500">Al cambiar la fecha se retiran las reservas existentes seleccionadas.</span>
          </label>
          {planner.snapshot && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <strong>{planner.snapshot.spaces.length}</strong> salas en catálogo
              </span>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                <strong>{activeDayReservations.length}</strong> reservas activas en el día
              </span>
              {planner.snapshot.blocks.length > 0 && (
                <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900">
                  <strong>{planner.snapshot.blocks.length}</strong> bloqueo{planner.snapshot.blocks.length === 1 ? '' : 's'} de mantención
                </span>
              )}
            </div>
          )}
        </div>
        {planner.loading && <div role="status" className="space-y-3"><span className="text-sm text-slate-500">Confirmando agenda, bloqueos y catálogos…</span><div className="h-14 rounded-lg bg-slate-100 animate-pulse" /><div className="h-14 rounded-lg bg-slate-100 animate-pulse" /></div>}
        {!planner.loading && !planner.snapshot && <button type="button" className={button} onClick={planner.calculate}>Reintentar lectura de la jornada</button>}
        {planner.snapshot && <>
          {planner.canEdit && (
            <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-4" aria-label="Desocupar salas en un rango horario">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Desocupar salas y reubicar automáticamente</h4>
                  <p className="text-xs text-slate-600 mt-0.5">Elige qué salas necesitas dejar libres, el horario y el orden de espacios donde enviar las reservas afectadas.</p>
                </div>
                {(spacesToVacate.length > 0 || priorityOrder.length > 0) && (
                  <button type="button" className="text-xs text-slate-600 underline hover:text-slate-900" onClick={() => { setSpacesToVacate([]); setPriorityOrder([]); }}>
                    Reiniciar selección
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <label className="text-xs font-semibold text-slate-700">Horario a desocupar (desde)
                  <input type="time" min="08:30" max="22:00" value={vacateStart} onChange={e => setVacateStart(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal" />
                </label>
                <label className="text-xs font-semibold text-slate-700">Horario a desocupar (hasta)
                  <input type="time" min="08:30" max="22:00" value={vacateEnd} onChange={e => setVacateEnd(e.target.value)} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-normal" />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={`${smallChip} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`} onClick={() => { setVacateStart('08:30'); setVacateEnd('14:00'); }}>Mañana</button>
                  <button type="button" className={`${smallChip} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`} onClick={() => { setVacateStart('14:00'); setVacateEnd('22:00'); }}>Tarde</button>
                  <button type="button" className={`${smallChip} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`} onClick={() => { setVacateStart('08:30'); setVacateEnd('22:00'); }}>Jornada completa</button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-700">1. ¿Qué salas necesitas desocupar?</span>
                <div className="flex flex-wrap gap-1.5">
                  {planner.snapshot.spaces.map(space => {
                    const selected = spacesToVacate.includes(space.name);
                    const count = reservationsInWindowBySpace(space.name).length;
                    return (
                      <button
                        key={space.id}
                        type="button"
                        onClick={() => toggleSpaceToVacate(space.name)}
                        className={`${smallChip} ${selected ? 'border-red-600 bg-red-600 text-white' : count > 0 ? 'border-amber-300 bg-amber-50 text-slate-900 hover:bg-amber-100' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                      >
                        {space.name} {count > 0 ? `(${count} ocup.)` : '(libre)'}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="block text-xs font-semibold text-slate-700">
                  2. Orden de espacios para reubicar {priorityOrder.length ? `(${priorityOrder.map((s, i) => `${i + 1}° ${s}`).join(' → ')})` : '(automático por aforo y actividad — haz clic para fijar un orden 1°, 2°, 3°…)'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {planner.snapshot.spaces
                    .filter(space => !spacesToVacate.includes(space.name))
                    .map(space => {
                      const rank = priorityOrder.indexOf(space.name);
                      return (
                        <button
                          key={space.id}
                          type="button"
                          onClick={() => togglePrioritySpace(space.name)}
                          className={`${smallChip} ${rank >= 0 ? 'border-blue-700 bg-blue-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                        >
                          {rank >= 0 ? `${rank + 1}° ` : ''}{space.name}{space.capacity !== undefined ? ` (${space.capacity})` : ''}
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4" checked={allowCascade} onChange={e => setAllowCascade(e.target.checked)} />
                  <span>Reacomodar otras salas en cadena si el espacio destino está ocupado</span>
                </label>
                {priorityOrder.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4" checked={restrictToPriority} onChange={e => setRestrictToPriority(e.target.checked)} />
                    <span>Usar únicamente los espacios del orden seleccionado</span>
                  </label>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="h-4 w-4" checked={allowFlexibleTime} onChange={e => setAllowFlexibleTime(e.target.checked)} />
                  <span>Permitir mover la hora dentro del bloque si no hay salas libres al mismo tiempo</span>
                </label>
                {planner.canCreate && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="h-4 w-4" checked={addIncomingActivity} onChange={e => setAddIncomingActivity(e.target.checked)} />
                    <span>Agendar nueva actividad en la sala desocupada</span>
                  </label>
                )}
              </div>

              {addIncomingActivity && planner.canCreate && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-lg border border-blue-200 bg-white p-3">
                  <label className="text-xs font-medium text-slate-700">Motivo o actividad que ocupará el espacio
                    <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" value={incomingDesc} placeholder="Ej: Ceremonia o taller prioritario" onChange={e => setIncomingDesc(e.target.value)} />
                  </label>
                  <label className="text-xs font-medium text-slate-700">Solicitante del nuevo uso
                    <input className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" value={incomingResp} onChange={e => setIncomingResp(e.target.value)} />
                  </label>
                  <label className="text-xs font-medium text-slate-700">Aforo estimado
                    <input type="number" min={1} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" value={incomingParticipants} onChange={e => setIncomingParticipants(Number(e.target.value))} />
                  </label>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <span className="text-xs text-slate-600">
                  {!spacesToVacate.length
                    ? 'Selecciona una o más salas arriba para ver qué reservas se moverán.'
                    : affectedReservations.length > 0
                      ? `${affectedReservations.length} reserva${affectedReservations.length === 1 ? '' : 's'} por reubicar: ${affectedReservations.map(r => `${r.horaInicio} ${r.espacio} (${r.descripcion})`).join(' · ')}`
                      : `No hay reservas ocupando ${spacesToVacate.join(', ')} entre ${vacateStart} y ${vacateEnd}.`}
                </span>
                <button
                  type="button"
                  disabled={!spacesToVacate.length || !validWindow || planner.busy}
                  onClick={handleVacateAndCalculate}
                  className={`${button} !border-blue-700 !bg-blue-700 !text-white hover:!bg-blue-800`}
                >
                  Desocupar y calcular espacios automáticamente
                </button>
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <button type="button" className={button} disabled={!planner.canCreate || !canAddMore} onClick={planner.addNew}>Agregar actividad nueva</button>
            <label className="min-w-0 flex-1 max-w-xl text-xs font-semibold text-slate-700">Incorporar reserva de la jornada
              <select value="" disabled={!planner.canEdit || !canAddMore || !existing.length} onChange={event => planner.addExisting(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                <option value="">{existing.length ? 'Selecciona una reserva' : 'No hay más reservas activas en la fecha'}</option>
                {existing.map(row => <option key={row.id} value={row.id}>{row.horaInicio} · {row.espacio} · {row.descripcion}</option>)}
              </select>
            </label>
            {planner.canEdit && existing.length > 0 && canAddMore && (
              <button type="button" className={button} onClick={() => planner.addAllExisting(existing)}>
                Incorporar reservas del día ({Math.min(existing.length, MAX_DISTRIBUTION_ACTIVITIES - planner.requests.length)})
              </button>
            )}
            {planner.requests.length > 0 && (
              <button type="button" className="min-h-11 px-3 text-xs font-semibold text-slate-600 underline hover:text-slate-900" onClick={planner.clearDraft}>
                Vaciar borrador
              </button>
            )}
          </div>
          {(!planner.canCreate || !planner.canEdit) && <p className="text-xs text-slate-500">Tu cuenta puede {planner.canCreate ? 'crear actividades nuevas' : planner.canEdit ? 'reorganizar reservas existentes' : 'consultar la jornada'}. Se respetan los permisos asignados.</p>}
          {!planner.canApply && planner.requests.length > 0 && <p role="alert" className="text-sm text-red-700">Tus permisos cambiaron. No puedes aplicar todas las actividades de este borrador.</p>}
          {!planner.requests.length && <div className="border-y border-slate-200 py-10 text-center"><h4 className="font-semibold text-slate-900">Comienza con las necesidades de tu jornada</h4><p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Usa el asistente superior para desocupar salas en un horario o agrega actividades manualmente.</p></div>}
          {planner.requests.map((request, index) => (
            <DistributionActivityEditor
              key={request.id}
              request={request}
              snapshot={planner.snapshot!}
              index={index}
              canDuplicate={planner.canCreate && canAddMore}
              onChange={updated => planner.updateRequests(planner.requests.map(row => row.id === request.id ? updated : row))}
              onDuplicate={() => planner.duplicateRequest(request.id)}
              onRemove={() => planner.updateRequests(planner.requests.filter(row => row.id !== request.id))}
            />
          ))}
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
