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
  { label: 'Actividad deportiva', pattern: /deport|futbol|basquet|voleibol|acondicionamiento/, setup: 'despejado', spacePattern: /deporte|cancha|gimnasio/ },
  { label: 'Cocina', pattern: /cocina|repost|gastron|pasteler/, setup: 'mesas', spacePattern: /cocina|gastron/ },
  { label: 'Música o artes escénicas', pattern: /musica|guitarra|coro|canto|banda|ensayo|teatro/, setup: 'circulo', spacePattern: /espejo|sala 3|biblioteca|auditorio|evento/ },
  { label: 'Atención o evaluación individual', pattern: /atencion|evaluacion|psicol|fonoaudiol|individual|\bbox\b/, setup: 'mesas', spacePattern: /box|individual|atencion/ },
  { label: 'Adulto mayor o club', pattern: /adulto mayor|\bcam\b|tercera edad/, setup: 'mesas', spacePattern: /sala 3|sala 6|comunitaria|multiuso/ },
  { label: 'Recreación al aire libre', pattern: /patin|recreac|aire libre|exterior/, setup: 'despejado', spacePattern: /patio|exterior|cancha/ },
  { label: 'Celebración o encuentro', pattern: /cumplean|celebrac|convivencia|aniversario/, setup: 'mesas', spacePattern: /sala 6|comunitaria|patio|evento/ },
  { label: 'Presentación o charla', pattern: /charla|present|asamblea|ceremonia|conferencia/, setup: 'auditorio', spacePattern: /auditorio|evento|audiovisual/ },
  { label: 'Aprendizaje', pattern: /capacit|clase|escolar|alfabet|ingles/, setup: 'aula', spacePattern: /clase|escolar|educa|biblioteca/ },
  { label: 'Reunión participativa', pattern: /reunion|conversa|lectura/, setup: 'circulo', spacePattern: /reunion|comunitaria|lectura/ },
  { label: 'Taller práctico', pattern: /taller|manual|tejido|textil|amigurumi|manicure|ergoterapia/, setup: 'mesas', spacePattern: /taller|multiuso|clase/ },
];
export function detectDistributionCriteria(description: string) {
  const text = normalizeEquipmentName(description);
  const rule = ACTIVITY_RULES.find(rule => rule.pattern.test(text));
  return { label: rule?.label || 'Actividad general', setup: rule?.setup || 'circulo' as RoomSetupType, spacePattern: rule?.spacePattern };
}

export function validateDistributionRequestInput(request: DistributionRequest): string | null {
  if (!request.descripcion.trim()) {
    return 'Completa la descripción de la actividad.';
  }
  if (request.responsable.trim().length < 2) {
    return 'Indica el nombre del responsable o solicitante (mínimo 2 caracteres).';
  }
  if (!Number.isInteger(request.cantidadParticipantes) || request.cantidadParticipantes < 1) {
    return 'La cantidad de participantes debe ser un número entero mayor o igual a 1.';
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(request.startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(request.endTime)) {
    return 'Indica un horario válido en formato HH:mm.';
  }
  const start = timeToMinutes(request.startTime);
  const end = timeToMinutes(request.endTime);
  if (start < REGULAR_LOAN_START_MINUTES || end > REGULAR_LOAN_END_MINUTES || end <= start) {
    return 'El horario debe estar entre 08:30 y 22:00, con término posterior al inicio.';
  }
  if (!request.fixedTime) {
    if (!Number.isInteger(request.durationMinutes) || request.durationMinutes < 1) {
      return 'La duración debe ser de al menos 1 minuto.';
    }
    if (request.durationMinutes > end - start) {
      return `La duración (${request.durationMinutes} min) supera la franja seleccionada (${end - start} min). Amplía la franja o reduce la duración.`;
    }
  }
  return null;
}

export function newDistributionRequest(id: string, source?: Reservation): DistributionRequest {
  return {
    id, source, descripcion: source?.descripcion || '', responsable: source?.responsable || '', tipoActividad: source?.tipoActividad || 'OTROS',
    cantidadParticipantes: source?.cantidadParticipantes || 1,
    durationMinutes: source ? Math.max(15, timeToMinutes(source.horaFin) - timeToMinutes(source.horaInicio)) : 60,
    fixedTime: Boolean(source), startTime: source?.horaInicio || '10:00', endTime: source?.horaFin || '11:00',
    allowedSpaces: [], prioritySpaces: [], preferredSpace: source?.espacio,
    montaje: source?.montaje?.tipo || detectDistributionCriteria(source?.descripcion || '').setup,
    equipment: source?.equipamientoSolicitado?.map(item => ({ ...item, quantity: Number(item.quantity) })) || [],
  };
}

export interface VacateSpacesOptions {
  spacesToVacate: string[];
  startTime: string;
  endTime: string;
  prioritySpaces?: string[];
  restrictToPrioritySpaces?: boolean;
  allowCascade?: boolean;
  allowFlexibleTime?: boolean;
  replacementActivity?: {
    id?: string;
    descripcion: string;
    responsable: string;
    cantidadParticipantes: number;
    tipoActividad?: string;
    montaje?: RoomSetupType;
    targetSpace?: string;
  };
}

/** Builds the set of distribution requests needed to vacate one or more rooms in a time window,
 * automatically respecting the user's preferred target room order and optionally including
 * cascade relocations when target rooms are occupied by other movable bookings. */
export function buildVacateSpacesPlan(
  snapshot: DistributionSnapshot,
  options: VacateSpacesOptions,
): { requests: DistributionRequest[]; result: DistributionResult; displacedCount: number; cascadeCount: number } {
  const vacated = options.spacesToVacate.map(s => s.trim()).filter(Boolean);
  const startMin = timeToMinutes(options.startTime);
  const endMin = timeToMinutes(options.endTime);
  const priorityOrder = (options.prioritySpaces || [])
    .filter(s => !vacated.some(v => doSpacesConflict(s, v)));

  const allCompatibleCatalogSpaces = snapshot.spaces
    .map(s => s.name)
    .filter(name => !vacated.some(v => doSpacesConflict(name, v)));

  const allowedDestinationSpaces = options.restrictToPrioritySpaces && priorityOrder.length > 0
    ? priorityOrder
    : allCompatibleCatalogSpaces;

  const activeDayRows = snapshot.reservations
    .filter(r => r.fecha === snapshot.fecha && isReservationActiveForAvailability(r, new Set()) && !r.reemplazadaPorReservaId)
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio) || a.espacio.localeCompare(b.espacio));

  const overlapsWindow = (r: Reservation) => {
    const rStart = timeToMinutes(r.horaInicio);
    const rEnd = timeToMinutes(r.horaFin);
    return isTimeOverlapping(rStart, rEnd, startMin, endMin);
  };

  const directDisplaced = activeDayRows.filter(
    r => overlapsWindow(r) && vacated.some(v => doSpacesConflict(r.espacio, v))
  );

  const toRelocationRequest = (row: Reservation): DistributionRequest => {
    const baseReq = newDistributionRequest(row.id, row);
    const rowStart = timeToMinutes(row.horaInicio);
    const rowEnd = timeToMinutes(row.horaFin);
    const duration = Math.max(15, rowEnd - rowStart);
    const flexStart = formatMinutesToTime(Math.min(rowStart, startMin));
    const flexEnd = formatMinutesToTime(Math.max(rowEnd, endMin));
    return {
      ...baseReq,
      responsable: baseReq.responsable.trim().length >= 2 ? baseReq.responsable : 'Equipo comunitario',
      allowedSpaces: [...allowedDestinationSpaces],
      prioritySpaces: [...priorityOrder],
      preferredSpace: priorityOrder[0] || undefined,
      fixedTime: !options.allowFlexibleTime,
      startTime: options.allowFlexibleTime ? flexStart : row.horaInicio,
      endTime: options.allowFlexibleTime ? flexEnd : row.horaFin,
      durationMinutes: duration,
    };
  };

  const baseRequests: DistributionRequest[] = directDisplaced
    .slice(0, options.replacementActivity ? MAX_DISTRIBUTION_ACTIVITIES - 1 : MAX_DISTRIBUTION_ACTIVITIES)
    .map(toRelocationRequest);

  if (options.replacementActivity && options.replacementActivity.descripcion.trim()) {
    const rep = options.replacementActivity;
    const targetRooms = rep.targetSpace ? [rep.targetSpace] : vacated;
    const criteria = detectDistributionCriteria(rep.descripcion);
    baseRequests.unshift({
      id: rep.id || `DIST_VACATE_${Date.now()}`,
      descripcion: rep.descripcion.trim(),
      responsable: rep.responsable.trim().length >= 2 ? rep.responsable.trim() : 'Equipo comunitario',
      tipoActividad: rep.tipoActividad || 'OTROS',
      cantidadParticipantes: Math.max(1, Number(rep.cantidadParticipantes) || 1),
      durationMinutes: Math.max(15, endMin - startMin),
      fixedTime: true,
      startTime: options.startTime,
      endTime: options.endTime,
      allowedSpaces: targetRooms,
      prioritySpaces: targetRooms,
      preferredSpace: targetRooms[0],
      montaje: rep.montaje || criteria.setup,
      equipment: [],
    });
  }

  let bestRequests = baseRequests;
  let bestResult = planRoomDistribution(baseRequests, snapshot);
  let cascadeCount = 0;

  // If some displaced activity could not be placed and cascade is allowed, include movable
  // reservations from destination rooms in the same window so the solver can chain-relocate them.
  if (options.allowCascade !== false && bestResult.unresolved.length > 0 && baseRequests.length < MAX_DISTRIBUTION_ACTIVITIES) {
    const alreadyIncluded = new Set(baseRequests.flatMap(r => r.source ? [r.source.id] : []));
    const cascadeCandidates = activeDayRows
      .filter(r => !alreadyIncluded.has(r.id) && overlapsWindow(r) && allowedDestinationSpaces.some(dest => doSpacesConflict(r.espacio, dest)))
      .sort((a, b) => {
        const aInPriority = priorityOrder.findIndex(p => normalizeSpace(p) === normalizeSpace(a.espacio));
        const bInPriority = priorityOrder.findIndex(p => normalizeSpace(p) === normalizeSpace(b.espacio));
        if (aInPriority !== bInPriority) {
          return (aInPriority === -1 ? 999 : aInPriority) - (bInPriority === -1 ? 999 : bInPriority);
        }
        return (a.cantidadParticipantes || 1) - (b.cantidadParticipantes || 1);
      });

    const expanded = [...baseRequests];
    for (const candidate of cascadeCandidates) {
      if (expanded.length >= MAX_DISTRIBUTION_ACTIVITIES) break;
      expanded.push({
        ...toRelocationRequest(candidate),
        // Allow cascade candidates to stay in their room or move to any non-vacated room
        allowedSpaces: allCompatibleCatalogSpaces,
        preferredSpace: candidate.espacio,
      });
      const candidateResult = planRoomDistribution(expanded, snapshot);
      const newlyResolved = candidateResult.unresolved.length < bestResult.unresolved.length ||
        (candidateResult.unresolved.length === 0 && bestResult.unresolved.length > 0);
      if (newlyResolved) {
        bestRequests = [...expanded];
        bestResult = candidateResult;
        cascadeCount = bestRequests.length - baseRequests.length;
        if (bestResult.unresolved.length === 0) break;
      }
    }
  }

  return {
    requests: bestRequests,
    result: bestResult,
    displacedCount: directDisplaced.length,
    cascadeCount,
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
    const inputError = validateDistributionRequestInput(request);
    if (inputError) {
      reasons.set(request.id, inputError);
      return { request, candidates };
    }
    const allowedSpaces = request.allowedSpaces.length
      ? snapshot.spaces.filter(space => request.allowedSpaces.some(name => normalizeSpace(name) === normalizeSpace(space.name)))
      : snapshot.spaces;
    if (!allowedSpaces.length) {
      reasons.set(request.id, 'Las salas permitidas no existen en el catálogo actual.');
      return { request, candidates };
    }
    const capacitySpaces = allowedSpaces.filter(space => space.capacity === undefined || space.capacity >= request.cantidadParticipantes);
    if (!capacitySpaces.length) {
      reasons.set(request.id, 'Las salas permitidas no tienen aforo suficiente.');
      return { request, candidates };
    }
    const start = timeToMinutes(request.startTime), end = timeToMinutes(request.endTime);
    const duration = request.fixedTime ? end - start : request.durationMinutes;
    const criteria = detectDistributionCriteria(request.descripcion);
    const starts: number[] = request.fixedTime ? [start] : Array.from({ length: Math.floor((end - start - duration) / 15) + 1 }, (_, i) => start + i * 15);
    let hadOverlap = false;
    let hadMaintenance = false;
    let lastShortage = '';
    const hasEquipment = request.equipment.length > 0;
    const priorityList = request.prioritySpaces?.filter(Boolean) || [];
    for (const space of capacitySpaces) {
      const spaceText = normalizeEquipmentName(`${space.name} ${space.category} ${space.description}`);
      const matchesActivity = Boolean(criteria.spacePattern?.test(spaceText));
      const changedRoom = Boolean(request.source && normalizeSpace(space.name) !== normalizeSpace(request.source.espacio));
      const priorityIndex = priorityList.length
        ? priorityList.findIndex(name => normalizeSpace(name) === normalizeSpace(space.name))
        : -1;
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
        if (base.some(row => overlaps(reservation, row))) { hadOverlap = true; continue; }
        if (findMaintenanceBlockConflicts([reservation], snapshot.blocks).length) { hadMaintenance = true; continue; }
        if (hasEquipment) {
          const shortage = findEquipmentShortage([...base, reservation], snapshot.equipment, new Set([reservation.id]));
          if (shortage) { lastShortage = shortage; continue; }
        }
        const changedTime = Boolean(request.source && (request.source.horaInicio !== reservation.horaInicio || request.source.horaFin !== reservation.horaFin));
        const proposalReasons = [
          criteria.label,
          ...(priorityIndex >= 0 ? [`Prioridad #${priorityIndex + 1} en el orden de espacios elegido.`] : []),
          matchesActivity ? 'Coincide con la descripción del espacio.' : 'Espacio disponible según los requisitos indicados.',
          space.capacity === undefined ? 'Aforo sin registrar: confirmar en terreno.' : `Capacidad registrada: ${space.capacity} personas.`,
          'Montaje orientativo; confirmar disposición y circulación en terreno.',
        ];
        const preferencePenalty = priorityList.length
          ? (priorityIndex >= 0 ? priorityIndex * 100_000_000_000 : 900_000_000_000)
          : (request.preferredSpace && normalizeSpace(space.name) !== normalizeSpace(request.preferredSpace) ? 1_000_000_000_000 : 0);
        // Lexicographic totals: priority/preferences, then activity match, then existing moves, then unused capacity.
        const cost = preferencePenalty +
          (criteria.spacePattern && !matchesActivity ? 10_000_000_000 : 0) +
          (changedRoom || changedTime ? 10_000_000 : 0) +
          (space.capacity === undefined ? 100_000 : Math.min(1_000, space.capacity - request.cantidadParticipantes)) + (time - start) / 1440;
        candidates.push({ proposal: { requestId: request.id, reservation, reasons: proposalReasons }, cost });
      }
    }
    candidates.sort((a, b) => a.cost - b.cost || a.proposal.reservation.espacio.localeCompare(b.proposal.reservation.espacio) || a.proposal.reservation.horaInicio.localeCompare(b.proposal.reservation.horaInicio));
    const rejected = lastShortage
      || (hadMaintenance && !hadOverlap ? 'Hay bloqueos de mantenimiento en las salas u horarios permitidos.' : '')
      || (hadMaintenance && hadOverlap ? 'Las salas con aforo suficiente están ocupadas o con bloqueo de mantenimiento en ese horario.' : '')
      || (hadOverlap ? 'Las salas con aforo suficiente ya están ocupadas en ese horario.' : '')
      || 'No hay una combinación libre de sala, horario y equipamiento. Ajusta los requisitos.';
    reasons.set(request.id, rejected);
    return { request, candidates };
  }).sort((a, b) => a.candidates.length - b.candidates.length || a.request.id.localeCompare(b.request.id));

  // Precompute suffix minimum costs and whether all remaining requests have at least 1 candidate.
  const minRemainingCost = new Array<number>(choices.length + 1).fill(0);
  const allRemainingHaveCandidates = new Array<boolean>(choices.length + 1).fill(true);
  for (let i = choices.length - 1; i >= 0; i--) {
    const first = choices[i].candidates[0];
    allRemainingHaveCandidates[i] = Boolean(first) && allRemainingHaveCandidates[i + 1];
    minRemainingCost[i] = (first ? first.cost : 0) + minRemainingCost[i + 1];
  }

  let states = 0, limit = false, best: DistributionProposal[] = [], bestCost = Infinity;
  const picked: DistributionProposal[] = [];
  const retained: Reservation[] = [];
  function visit(index: number, cost: number) {
    if (states++ >= maxStates) { limit = true; return; }
    const remaining = choices.length - index;
    if (picked.length + remaining < best.length) return;
    if (picked.length + remaining === best.length) {
      if (!allRemainingHaveCandidates[index] || cost + minRemainingCost[index] >= bestCost) return;
    }
    if (index === choices.length) {
      if (picked.length > best.length || picked.length === best.length && cost < bestCost) { best = [...picked]; bestCost = cost; }
      return;
    }
    const { request, candidates } = choices[index];
    for (const { proposal, cost: candidateCost } of candidates) {
      if (limit) break;
      if (picked.some(p => overlaps(proposal.reservation, p.reservation)) || retained.some(r => overlaps(proposal.reservation, r))) {
        if (++states >= maxStates) limit = true;
        continue;
      }
      if (proposal.reservation.equipamientoSolicitado?.length) {
        if (findEquipmentShortage([...base, ...retained, ...picked.map(p => p.reservation), proposal.reservation], snapshot.equipment, new Set([proposal.reservation.id]))) {
          if (++states >= maxStates) limit = true;
          continue;
        }
      }
      picked.push(proposal);
      visit(index + 1, cost + candidateCost);
      picked.pop();
    }
    if (!limit) {
      const source = request.source;
      if (source) {
        if (picked.some(p => overlaps(p.reservation, source))) return;
        if (source.equipamientoSolicitado?.length && picked.some(p => p.reservation.equipamientoSolicitado?.length)) {
          if (findEquipmentShortage([...base, ...retained, source, ...picked.map(p => p.reservation)], snapshot.equipment, new Set(picked.map(p => p.reservation.id)))) return;
        }
        retained.push(source);
        visit(index + 1, cost);
        retained.pop();
      } else {
        visit(index + 1, cost);
      }
    }
  }
  visit(0, 0);
  best.sort((a, b) => requests.findIndex(r => r.id === a.requestId) - requests.findIndex(r => r.id === b.requestId));
  return {
    proposals: best, exploredStates: Math.min(states, maxStates), searchLimitReached: limit,
    unresolved: requests.filter(r => !best.some(p => p.requestId === r.id)).map(r => ({ requestId: r.id,
      reason: limit ? 'Se alcanzó el límite de búsqueda. Ajusta requisitos o reduce actividades; puede existir otra solución.' : reasons.get(r.id) || 'No hay una combinación conjunta compatible.' })),
  };
}
