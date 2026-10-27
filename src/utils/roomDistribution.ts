import type { DistributionRequest, DistributionSnapshot, DistributionResult, DistributionProposal, Reservation, RoomSetupType } from '../types';
import { doSpacesConflict, findMaintenanceBlockConflicts, getTimeIntervalsForReservation, isReservationActiveForAvailability, isTimeOverlapping, timeToMinutes, formatMinutesToTime, normalizeSpace } from './conflictDetector';
import { findEquipmentShortage, normalizeEquipmentName } from './equipmentAllocation';
import { REGULAR_LOAN_START_MINUTES, REGULAR_LOAN_END_MINUTES } from './validationUtils';
import { DateStringSchema } from '../schemas/reservationSchema';

export const MAX_DISTRIBUTION_ACTIVITIES = 12;
export const SETUP_LABELS: Record<RoomSetupType, string> = {
  auditorio: 'Auditorio', aula: 'Aula', u: 'En U', circulo: 'Círculo', mesas: 'Mesas de trabajo', despejado: 'Espacio despejado',
};
export const SETUP_INSTRUCTIONS: Record<RoomSetupType, string> = {
  auditorio: 'Organizar sillas en filas orientadas hacia la presentación. Confirmar pasillos y espacio de circulación en terreno.',
  aula: 'Orientar mesas y sillas hacia el relator. Confirmar mobiliario y circulación en terreno.',
  u: 'Disponer mesas y sillas en U, con el centro libre. Confirmar cantidades y circulación en terreno.',
  circulo: 'Disponer sillas en círculo para facilitar la conversación. Mantener el centro despejado.',
  mesas: 'Agrupar mesas para trabajo en equipos. Confirmar cuántas personas admite cada mesa y el espacio de circulación.',
  despejado: 'Dejar libre el área central de la actividad. Revisar en terreno la ubicación de recursos y objetos móviles.',
};

const ACTIVITY_RULES: { label: string; pattern: RegExp; setup: RoomSetupType; spacePattern: RegExp }[] = [
  { label: 'Danza o movimiento', pattern: /danza|baile|zumba|ballet|folcl|folkl/, setup: 'despejado', spacePattern: /espejo|gimnasio|danza/ },
  { label: 'Actividad de suelo', pattern: /yoga|pilates|artes marciales|karate|judo/, setup: 'despejado', spacePattern: /tatami|acolch|yoga/ },
  { label: 'Actividad deportiva', pattern: /deport|futbol|basquet|voleibol/, setup: 'despejado', spacePattern: /deporte|cancha|gimnasio/ },
  { label: 'Cocina', pattern: /cocina|repost|gastron|pasteler/, setup: 'mesas', spacePattern: /cocina|gastron/ },
  { label: 'Presentación o charla', pattern: /charla|present|asamblea|ceremonia|conferencia/, setup: 'auditorio', spacePattern: /auditorio|evento|audiovisual/ },
  { label: 'Aprendizaje', pattern: /capacit|clase|escolar|alfabet|ingles/, setup: 'aula', spacePattern: /clase|escolar|educa|biblioteca/ },
  { label: 'Reunión participativa', pattern: /reunion|conversa|lectura/, setup: 'circulo', spacePattern: /reunion|comunitaria|lectura/ },
  { label: 'Taller práctico', pattern: /taller|manual|tejido|textil/, setup: 'mesas', spacePattern: /taller|multiuso|clase/ },
];
export function detectDistributionCriteria(description: string) {
  const text = normalizeEquipmentName(description);
  const rule = ACTIVITY_RULES.find(rule => rule.pattern.test(text));
  return { label: rule?.label || 'Actividad general', setup: rule?.setup || 'circulo' as RoomSetupType, spacePattern: rule?.spacePattern };
}

export function newDistributionRequest(id: string, source?: Reservation): DistributionRequest {
  return {
    id, source, descripcion: source?.descripcion || '', responsable: source?.responsable || '', tipoActividad: source?.tipoActividad || 'OTROS',
    cantidadParticipantes: source?.cantidadParticipantes || 1,
    durationMinutes: source ? timeToMinutes(source.horaFin) - timeToMinutes(source.horaInicio) : 60,
    fixedTime: Boolean(source), startTime: source?.horaInicio || '10:00', endTime: source?.horaFin || '11:00',
    allowedSpaces: [], preferredSpace: source?.espacio,
    montaje: source?.montaje?.tipo || detectDistributionCriteria(source?.descripcion || '').setup,
    equipment: source?.equipamientoSolicitado?.map(item => ({ ...item, quantity: Number(item.quantity) })) || [],
  };
}

function overlaps(a: Reservation, b: Reservation): boolean {
  return doSpacesConflict(a.espacio, b.espacio) && getTimeIntervalsForReservation(a).some(x =>
    getTimeIntervalsForReservation(b).some(y => x.date === y.date && isTimeOverlapping(x.startMin, x.endMin, y.startMin, y.endMin)));
}

/** Bounded, deterministic search. Unassigned existing activities retain their original
 * bookings, including when a partial solution is displayed. Never publish a partial plan. */
export function planRoomDistribution(requests: readonly DistributionRequest[], snapshot: DistributionSnapshot, maxStates = 50_000): DistributionResult {
  const fail = (reason: string): DistributionResult => ({ proposals: [], unresolved: requests.map(r => ({ requestId: r.id, reason })), exploredStates: 0, searchLimitReached: false });
  if (!DateStringSchema.safeParse(snapshot.fecha).success) return fail('Fecha inválida.');
  if (!requests.length) return fail('Agrega actividades para planificar.');
  if (requests.length > MAX_DISTRIBUTION_ACTIVITIES) return fail('El máximo es de 12 actividades por plan.');
  const ids = new Set(requests.map(r => r.id));
  if (ids.size !== requests.length) return fail('Hay actividades duplicadas.');
  const sourceIds = requests.flatMap(r => r.source ? [r.source.id] : []);
  if (new Set(sourceIds).size !== sourceIds.length) return fail('Una reserva solo puede seleccionarse una vez.');
  if (requests.some(r => r.source && (r.source.fecha !== snapshot.fecha || !snapshot.reservations.some(row => row.id === r.source!.id)))) return fail('Recarga las reservas seleccionadas de esta jornada.');
  const base = snapshot.reservations.filter(r => !sourceIds.includes(r.id) && isReservationActiveForAvailability(r, new Set()));
  const reasons = new Map<string, string>();
  type Candidate = { proposal: DistributionProposal; cost: number };
  const choices = requests.map(request => {
    const candidates: Candidate[] = [];
    let rejected = 'No hay una combinación libre de sala, horario y equipamiento. Ajusta los requisitos.';
    const start = timeToMinutes(request.startTime), end = timeToMinutes(request.endTime);
    if (!request.descripcion.trim() || !Number.isInteger(request.cantidadParticipantes) || request.cantidadParticipantes < 1 ||
      !Number.isInteger(request.durationMinutes) || request.durationMinutes < 1 ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(request.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(request.endTime) ||
      start < REGULAR_LOAN_START_MINUTES || end > REGULAR_LOAN_END_MINUTES || end <= start ||
      request.durationMinutes > end - start && !request.fixedTime) {
      reasons.set(request.id, 'Completa la descripción, participantes y un horario válido entre 08:30 y 22:00.');
      return { request, candidates };
    }
    const duration = request.fixedTime ? end - start : request.durationMinutes;
    const criteria = detectDistributionCriteria(request.descripcion);
    const starts: number[] = request.fixedTime ? [start] : Array.from({ length: Math.floor((end - start - duration) / 15) + 1 }, (_, i) => start + i * 15);
    for (const space of snapshot.spaces) {
      if (request.allowedSpaces.length && !request.allowedSpaces.some(name => normalizeSpace(name) === normalizeSpace(space.name))) continue;
      if (space.capacity !== undefined && space.capacity < request.cantidadParticipantes) { rejected = 'Las salas permitidas no tienen aforo suficiente.'; continue; }
      for (const time of starts) {
        const reservation: Reservation = {
          ...request.source, id: request.source?.id || request.id, fecha: snapshot.fecha,
          descripcion: request.descripcion.trim(), responsable: request.responsable.trim(), tipoActividad: request.tipoActividad,
          cantidadParticipantes: request.cantidadParticipantes, actividadRecurrente: request.source?.actividadRecurrente || 'No',
          estado: request.source?.estado || 'activa', espacio: space.name,
          horaInicio: formatMinutesToTime(time), horaFin: formatMinutesToTime(time + duration), terminaDiaSiguiente: false,
          equipamientoSolicitado: request.equipment.map(item => ({ ...item })),
          montaje: { tipo: request.montaje, instrucciones: SETUP_INSTRUCTIONS[request.montaje] },
          ...(request.holidayAuthorization ? { claveAutorizacionFeriado: request.holidayAuthorization } : {}),
        };
        if (base.some(row => overlaps(reservation, row))) continue;
        if (findMaintenanceBlockConflicts([reservation], snapshot.blocks).length) { rejected = 'Hay bloqueos de mantenimiento en las salas u horarios permitidos.'; continue; }
        const shortage = findEquipmentShortage([...base, reservation], snapshot.equipment, new Set([reservation.id]));
        if (shortage) { rejected = shortage; continue; }
        const matchesActivity = Boolean(criteria.spacePattern?.test(normalizeEquipmentName(`${space.name} ${space.category} ${space.description}`)));
        const changedRoom = Boolean(request.source && normalizeSpace(space.name) !== normalizeSpace(request.source.espacio));
        const changedTime = Boolean(request.source && (request.source.horaInicio !== reservation.horaInicio || request.source.horaFin !== reservation.horaFin));
        const proposalReasons = [criteria.label, matchesActivity ? 'Coincide con la descripción del espacio.' : 'Espacio disponible según los requisitos indicados.',
          space.capacity === undefined ? 'Aforo sin registrar: confirmar en terreno.' : `Capacidad registrada: ${space.capacity} personas.`,
          'Montaje orientativo; confirmar disposición y circulación en terreno.'];
        // Lexicographic totals: preferences, then existing moves, then unused capacity.
        const cost = (request.preferredSpace && normalizeSpace(space.name) !== normalizeSpace(request.preferredSpace) ? 1_000_000_000_000 : 0) +
          (criteria.spacePattern && !matchesActivity ? 10_000_000_000 : 0) +
          (changedRoom || changedTime ? 10_000_000 : 0) +
          (space.capacity === undefined ? 100_000 : Math.min(1_000, space.capacity - request.cantidadParticipantes)) + (time - start) / 1440;
        candidates.push({ proposal: { requestId: request.id, reservation, reasons: proposalReasons }, cost });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost || a.proposal.reservation.espacio.localeCompare(b.proposal.reservation.espacio) || a.proposal.reservation.horaInicio.localeCompare(b.proposal.reservation.horaInicio));
    reasons.set(request.id, rejected);
    return { request, candidates };
  }).sort((a, b) => a.candidates.length - b.candidates.length || a.request.id.localeCompare(b.request.id));

  let states = 0, limit = false, best: DistributionProposal[] = [], bestCost = Infinity;
  const picked: DistributionProposal[] = [];
  function visit(index: number, cost: number) {
    if (states++ >= maxStates) { limit = true; return; }
    if (picked.length + choices.length - index < best.length) return;
    if (best.length === requests.length && cost >= bestCost) return;
    if (index === choices.length) {
      const assigned = new Set(picked.map(p => p.requestId));
      const retained = choices.flatMap(({ request }) => request.source && !assigned.has(request.id) ? [request.source] : []);
      if (picked.some(p => retained.some(r => overlaps(p.reservation, r)))) return;
      if (findEquipmentShortage([...base, ...retained, ...picked.map(p => p.reservation)], snapshot.equipment, new Set(picked.map(p => p.reservation.id)))) return;
      if (picked.length > best.length || picked.length === best.length && cost < bestCost) { best = [...picked]; bestCost = cost; }
      return;
    }
    const { candidates } = choices[index];
    for (const { proposal, cost: candidateCost } of candidates) {
      if (limit) break;
      if (picked.some(p => overlaps(proposal.reservation, p.reservation))) { if (++states >= maxStates) limit = true; continue; }
      if (findEquipmentShortage([...base, ...picked.map(p => p.reservation), proposal.reservation], snapshot.equipment, new Set([proposal.reservation.id]))) { if (++states >= maxStates) limit = true; continue; }
      picked.push(proposal); visit(index + 1, cost + candidateCost); picked.pop();
    }
    if (!limit) visit(index + 1, cost);
  }
  visit(0, 0);
  best.sort((a, b) => requests.findIndex(r => r.id === a.requestId) - requests.findIndex(r => r.id === b.requestId));
  return {
    proposals: best, exploredStates: Math.min(states, maxStates), searchLimitReached: limit,
    unresolved: requests.filter(r => !best.some(p => p.requestId === r.id)).map(r => ({ requestId: r.id,
      reason: limit ? 'Se alcanzó el límite de búsqueda. Ajusta requisitos o reduce actividades; puede existir otra solución.' : reasons.get(r.id) || 'No hay una combinación conjunta compatible.' })),
  };
}
