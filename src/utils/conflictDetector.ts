import { Reservation, BookingConflict, SpaceBlock } from '../types';
import { getDeletedIds } from './deletedReservationsStore';

// ==========================================
// CONSTANTS & RULES
// ==========================================

/**
 * Historical cutoff date for conflict detection exemption.
 * Reservations scheduled on or prior to 2026-08-27 (27-08-2026) are exempt from overlap errors.
 */
export const CONFLICT_EXEMPT_UNTIL_DATE = '2026-08-27';

const MINUTES_PER_HOUR = 60;

/**
 * Calculates the next calendar day in YYYY-MM-DD format.
 */
export function getNextDayIso(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.trim().split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return dateStr;
  }
}

// ==========================================
// PURE UTILITY FUNCTIONS (WITH MEMOIZATION CACHES)
// ==========================================

const spaceNormCache = new Map<string, string>();
const spaceConstituentsCache = new Map<string, string[]>();

/**
 * Normalizes space name by trimming, uppercasing, stripping diacritical accents,
 * and collapsing multiple whitespace characters into single spaces.
 */
export function normalizeSpace(spaceName?: string): string {
  if (!spaceName) {
    return '';
  }
  const cached = spaceNormCache.get(spaceName);
  if (cached !== undefined) return cached;

  const result = spaceName
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

  if (spaceNormCache.size < 500) {
    spaceNormCache.set(spaceName, result);
  }
  return result;
}

/**
 * Splits compound spaces into their individual constituent rooms (e.g. "SALA 3 / SALA 2").
 */
export function getConstituentSpaces(spaceName?: string): string[] {
  if (!spaceName) return [];
  const cached = spaceConstituentsCache.get(spaceName);
  if (cached !== undefined) return cached;

  const parts = spaceName.split(/\s*(?:\/|\+)\s*/);
  const result = parts.map(p => normalizeSpace(p)).filter(Boolean);

  if (spaceConstituentsCache.size < 500) {
    spaceConstituentsCache.set(spaceName, result);
  }
  return result;
}

/**
 * Evaluates whether two space representations overlap or conflict.
 * Returns true if identical OR if either space shares any constituent room with the other.
 */
export function doSpacesConflict(spaceA?: string, spaceB?: string): boolean {
  if (!spaceA || !spaceB) return false;
  if (spaceA === spaceB) return true;
  const normA = normalizeSpace(spaceA);
  const normB = normalizeSpace(spaceB);
  if (normA === normB) return true;

  const constituentsA = getConstituentSpaces(spaceA);
  const constituentsB = getConstituentSpaces(spaceB);

  for (const partA of constituentsA) {
    for (const partB of constituentsB) {
      if (partA === partB) return true;
    }
  }
  return false;
}

const INACTIVE_STATUSES = new Set([
  'cancelada', 'cancelado', 'cancelled',
  'rechazada', 'rechazado', 'rejected',
  'eliminada', 'eliminado', 'deleted',
  'anulada', 'anulado',
  'suspendida', 'suspendido',
  'descartada', 'descartado',
  'borrada', 'borrado',
  'inactiva', 'inactivo'
]);

/**
 * Checks whether a given reservation is active and should block schedule availability.
 * Inactive states (cancelada, rechazada, eliminada, deleted tracker) DO NOT block availability.
 */
export function isReservationActiveForAvailability(
  reservation?: Partial<Reservation> | null,
  deletedIds?: Set<string>
): boolean {
  if (!reservation) return false;

  const deletedSet = deletedIds || getDeletedIds();
  if (reservation.id && deletedSet.has(reservation.id)) {
    return false;
  }

  if (
    (reservation as any).cancelada === true ||
    (reservation as any).cancelada === 'Sí' ||
    (reservation as any).eliminada === true ||
    (reservation as any).deleted === true ||
    (reservation as any).isDeleted === true ||
    (reservation as any).borrada === true ||
    (reservation as any).activo === false ||
    (reservation as any).solicitudEliminacion?.aprobada === true
  ) {
    return false;
  }

  const estado = String(reservation.estado || '').trim().toLowerCase();
  if (estado && INACTIVE_STATUSES.has(estado)) {
    return false;
  }

  const st = String((reservation as any).status || '').trim().toLowerCase();
  if (st && INACTIVE_STATUSES.has(st)) {
    return false;
  }

  return true;
}

/**
 * Normalizes any common calendar date format (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY) into canonical ISO YYYY-MM-DD.
 * Returns empty string if invalid.
 */
export function normalizeDateToIso(dateStr?: string): string {
  if (!dateStr) return '';
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const dmy = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, '0');
    const m = dmy[2].padStart(2, '0');
    const y = dmy[3];
    return `${y}-${m}-${d}`;
  }
  const ymd = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymd) {
    const y = ymd[1];
    const m = ymd[2].padStart(2, '0');
    const d = ymd[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
}

/**
 * Checks whether a given reservation date is exempt from conflict checks.
 * Requires strict ISO date normalization to prevent non-ISO string comparison bypass (e.g. DD-MM-YYYY).
 */
export function isDateExemptFromConflicts(dateString?: string): boolean {
  if (!dateString) {
    return false;
  }
  // Zero-allocation fast path for canonical YYYY-MM-DD
  if (
    dateString.length === 10 &&
    dateString.charCodeAt(4) === 45 &&
    dateString.charCodeAt(7) === 45
  ) {
    return dateString <= CONFLICT_EXEMPT_UNTIL_DATE;
  }
  const iso = normalizeDateToIso(dateString);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false;
  }
  return iso <= CONFLICT_EXEMPT_UNTIL_DATE;
}

/**
 * Converts a "HH:mm" time string into total minutes since midnight.
 */
export function timeToMinutes(timeString: string): number {
  if (!timeString) {
    return 0;
  }

  // Zero-allocation fast path for canonical "HH:mm" time strings (e.g. "08:30", "14:00")
  if (timeString.length === 5 && timeString.charCodeAt(2) === 58) {
    const c0 = timeString.charCodeAt(0) - 48;
    const c1 = timeString.charCodeAt(1) - 48;
    const c3 = timeString.charCodeAt(3) - 48;
    const c4 = timeString.charCodeAt(4) - 48;
    if (c0 >= 0 && c0 <= 9 && c1 >= 0 && c1 <= 9 && c3 >= 0 && c3 <= 9 && c4 >= 0 && c4 <= 9) {
      return (c0 * 10 + c1) * MINUTES_PER_HOUR + (c3 * 10 + c4);
    }
  }

  const [rawHours, rawMinutes] = timeString.trim().split(':');
  const hours = parseInt(rawHours, 10) || 0;
  const minutes = parseInt(rawMinutes, 10) || 0;

  return hours * MINUTES_PER_HOUR + minutes;
}

/**
 * Formats total minutes since midnight into a zero-padded "HH:mm" string.
 */
export function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Validates start and end time order.
 * Rejects horaInicio >= horaFin unless terminaDiaSiguiente is explicitly indicated.
 */
export function validateTimeOrder(
  horaInicio?: string,
  horaFin?: string,
  terminaDiaSiguiente?: boolean
): { isValid: boolean; error?: string } {
  if (!horaInicio || !horaFin) {
    return { isValid: false, error: 'Horario de inicio y término son obligatorios.' };
  }
  const sMin = timeToMinutes(horaInicio);
  const eMin = timeToMinutes(horaFin);

  if (!terminaDiaSiguiente && eMin <= sMin) {
    return {
      isValid: false,
      error: `La hora de término (${horaFin}) debe ser estrictamente posterior a la hora de inicio (${horaInicio}).`
    };
  }

  if (terminaDiaSiguiente && sMin === eMin) {
    return {
      isValid: false,
      error: 'La hora de inicio y término no pueden ser idénticas.'
    };
  }

  return { isValid: true };
}

/**
 * Evaluates whether two continuous time intervals [startA, endA) and [startB, endB) overlap.
 * Mathematical rule: nuevoInicio < reservaExistenteFin AND nuevoFin > reservaExistenteInicio.
 * Consecutive intervals (e.g. 18:00–19:00 and 19:00–20:00) DO NOT overlap.
 */
export function isTimeOverlapping(
  startMinutesA: number,
  endMinutesA: number,
  startMinutesB: number,
  endMinutesB: number
): boolean {
  return startMinutesA < endMinutesB && startMinutesB < endMinutesA;
}

export interface TimeIntervalSlot {
  readonly date: string;
  readonly startMin: number;
  readonly endMin: number;
}

/**
 * Extracts continuous time intervals for a reservation, properly handling overnight/midnight crossings.
 */
export function getTimeIntervalsForReservation(reservation: Partial<Reservation>): TimeIntervalSlot[] {
  const fecha = reservation.fecha?.trim();
  const horaInicio = reservation.horaInicio?.trim();
  const horaFin = reservation.horaFin?.trim();
  if (!fecha || !horaInicio || !horaFin) return [];

  const startMin = timeToMinutes(horaInicio);
  let endMin = timeToMinutes(horaFin);

  // If horaFin is '00:00' or '24:00' and startMin > 0, and not explicitly designated as next day,
  // it denotes the end of the day / midnight (1440 min). Do NOT return empty array!
  if ((horaFin === '00:00' || horaFin === '24:00' || endMin === 0) && startMin > 0 && !reservation.terminaDiaSiguiente) {
    return [{ date: fecha, startMin, endMin: 1440 }];
  }

  const crossesMidnight = Boolean(reservation.terminaDiaSiguiente || (endMin <= startMin && endMin > 0));

  if (!crossesMidnight) {
    if (endMin <= startMin) return [];
    return [{ date: fecha, startMin, endMin }];
  }

  // Crosses midnight: Day 1: [startMin, 1440), Day 2: [0, endMin)
  const nextDay = getNextDayIso(fecha);
  const slots: TimeIntervalSlot[] = [
    { date: fecha, startMin, endMin: 1440 }
  ];
  if (endMin > 0 && nextDay) {
    slots.push({ date: nextDay, startMin: 0, endMin });
  }
  return slots;
}

// ==========================================
// CONFLICT DETECTION ENGINE
// ==========================================

export interface DetectedConflictDetail {
  readonly reserva: Reservation;
  readonly conflictingWith: Reservation;
  readonly espacio: string;
  readonly fecha: string;
  readonly horaInicio?: string;
  readonly horaFin?: string;
  readonly overlap: string;
  readonly reason?: string;
}

export interface DetectedBlockConflictDetail {
  readonly reserva: Partial<Reservation>;
  readonly block: SpaceBlock;
  readonly espacio: string;
  readonly fecha: string;
  readonly horaInicio?: string;
  readonly horaFin?: string;
  readonly overlap: string;
  readonly reason: string;
}

export interface ReservationFeasibilityResult {
  readonly isValid: boolean;
  readonly reservationConflicts: DetectedConflictDetail[];
  readonly blockConflicts: DetectedBlockConflictDetail[];
  readonly firstErrorMessage?: string;
}

export interface FindConflictsOptions {
  excludeReservationIds?: readonly string[] | Set<string>;
  excludeSeriesId?: string;
  allowCandidateSelfConflicts?: boolean;
  spaceBlocks?: readonly SpaceBlock[];
}

/**
 * Formats a user-friendly, descriptive error message for a detected maintenance block conflict.
 */
export function formatBlockConflictMessage(conflict: DetectedBlockConflictDetail): string {
  const timeInfo = conflict.block.todoElDia
    ? 'todo el día'
    : `de ${conflict.block.horaInicio || '08:00'} a ${conflict.block.horaFin || '22:30'}`;
  return `El espacio '${conflict.espacio}' se encuentra BLOQUEADO por mantención/obras el ${conflict.fecha} (${conflict.block.motivo}, ${timeInfo}). No es posible agendar en este horario.`;
}

/**
 * Checks candidate reservations against active space maintenance blocks.
 */
export function findMaintenanceBlockConflicts(
  candidates: readonly Partial<Reservation>[],
  spaceBlocks: readonly SpaceBlock[]
): DetectedBlockConflictDetail[] {
  const conflicts: DetectedBlockConflictDetail[] = [];
  if (!candidates || candidates.length === 0 || !spaceBlocks || spaceBlocks.length === 0) {
    return conflicts;
  }

  const activeBlocks = spaceBlocks.filter((b) => b.activo);
  if (activeBlocks.length === 0) return conflicts;

  for (const cand of candidates) {
    if (!cand.espacio || !cand.fecha) continue;
    const intervals = getTimeIntervalsForReservation(cand);
    if (intervals.length === 0) continue;

    const candSpaceNorm = normalizeSpace(cand.espacio);
    const candConstituents = getConstituentSpaces(cand.espacio);

    for (const slot of intervals) {
      for (const block of activeBlocks) {
        // Date range check: slot.date must fall in [fechaInicio, fechaFin]
        if (slot.date < block.fechaInicio || slot.date > block.fechaFin) continue;

        // Space match check
        const blockSpaceNorm = normalizeSpace(block.espacio);
        let spaceMatches = false;
        if (candSpaceNorm === blockSpaceNorm) {
          spaceMatches = true;
        } else if (block.bloquearSubEspacios) {
          if (candConstituents.some((c) => c === blockSpaceNorm || c.includes(blockSpaceNorm) || blockSpaceNorm.includes(c))) {
            spaceMatches = true;
          }
        } else if (candConstituents.includes(blockSpaceNorm)) {
          spaceMatches = true;
        }

        if (!spaceMatches) continue;

        // Time collision check
        if (block.todoElDia) {
          conflicts.push({
            reserva: cand,
            block,
            espacio: cand.espacio,
            fecha: slot.date,
            horaInicio: formatMinutesToTime(slot.startMin),
            horaFin: formatMinutesToTime(slot.endMin),
            overlap: 'Todo el día',
            reason: `Bloqueo total por ${block.motivo}`
          });
          break;
        }

        const bStartMin = timeToMinutes(block.horaInicio || '08:00');
        const bEndMin = timeToMinutes(block.horaFin || '22:30');

        if (isTimeOverlapping(slot.startMin, slot.endMin, bStartMin, bEndMin)) {
          const overlapStart = Math.max(slot.startMin, bStartMin);
          const overlapEnd = Math.min(slot.endMin, bEndMin);
          conflicts.push({
            reserva: cand,
            block,
            espacio: cand.espacio,
            fecha: slot.date,
            horaInicio: formatMinutesToTime(slot.startMin),
            horaFin: formatMinutesToTime(slot.endMin),
            overlap: `${formatMinutesToTime(overlapStart)} - ${formatMinutesToTime(overlapEnd)}`,
            reason: `Bloqueo parcial por ${block.motivo}`
          });
          break;
        }
      }
    }
  }

  return conflicts;
}

/**
 * Formats a user-friendly, descriptive error message for a detected conflict.
 */
export function formatConflictMessage(conflict: DetectedConflictDetail): string {
  const dateStr = conflict.fecha;
  const existingTitle = conflict.conflictingWith.tipoActividad || conflict.conflictingWith.descripcion || 'Reserva existente';
  const existingResp = conflict.conflictingWith.responsable || 'Otro solicitante';
  return `No se puede guardar la reserva porque '${conflict.espacio}' ya está ocupado el ${dateStr} entre ${conflict.conflictingWith.horaInicio} y ${conflict.conflictingWith.horaFin} por '${existingTitle}' (${existingResp}). Solapamiento: ${conflict.overlap}`;
}

/**
 * Unified feasibility evaluator:
 * Simultaneously validates candidate reservations against both database reservation conflicts AND maintenance blocks.
 */
export function checkReservationFeasibility(
  candidates: readonly Reservation[],
  allReservations: readonly Reservation[],
  options?: FindConflictsOptions
): ReservationFeasibilityResult {
  // 1. Maintenance block conflicts
  const blockConflicts = options?.spaceBlocks
    ? findMaintenanceBlockConflicts(candidates, options.spaceBlocks)
    : [];

  if (blockConflicts.length > 0) {
    return {
      isValid: false,
      reservationConflicts: [],
      blockConflicts,
      firstErrorMessage: formatBlockConflictMessage(blockConflicts[0])
    };
  }

  // 2. Reservation overlap conflicts
  const reservationConflicts = findReservationConflicts(candidates, allReservations, options);
  if (reservationConflicts.length > 0) {
    return {
      isValid: false,
      reservationConflicts,
      blockConflicts: [],
      firstErrorMessage: formatConflictMessage(reservationConflicts[0])
    };
  }

  return {
    isValid: true,
    reservationConflicts: [],
    blockConflicts: []
  };
}

/**
 * Centralized, rigorous conflict detector.
 * Validates candidates against existing database reservations and intra-batch candidates.
 */
export function findReservationConflicts(
  candidates: readonly Reservation[],
  allReservations: readonly Reservation[],
  options?: FindConflictsOptions
): DetectedConflictDetail[] {
  const detectedConflicts: DetectedConflictDetail[] = [];
  const deletedSet = getDeletedIds();
  const excludeSet = options?.excludeReservationIds
    ? (options.excludeReservationIds instanceof Set ? options.excludeReservationIds : new Set(options.excludeReservationIds))
    : new Set<string>();

  const targetExcludeSeriesId = options?.excludeSeriesId;

  // Active, non-exempt reservations from database
  const activeExisting = allReservations.filter((r) => {
    if (!r || !r.id) return false;
    if (excludeSet.has(r.id) || deletedSet.has(r.id)) return false;
    if (targetExcludeSeriesId && (r.serieRecurrente === targetExcludeSeriesId || r.recurrenteId === targetExcludeSeriesId)) {
      return false;
    }
    if (!r.fecha || isDateExemptFromConflicts(r.fecha)) return false;
    if (!isReservationActiveForAvailability(r, deletedSet)) return false;
    return true;
  });

  interface ExistingSlotEntry {
    readonly reservation: Reservation;
    readonly slot: TimeIntervalSlot;
  }
  const existingByDate = new Map<string, ExistingSlotEntry[]>();
  for (const ex of activeExisting) {
    const intervals = getTimeIntervalsForReservation(ex);
    for (const slot of intervals) {
      let list = existingByDate.get(slot.date);
      if (!list) {
        list = [];
        existingByDate.set(slot.date, list);
      }
      list.push({ reservation: ex, slot });
    }
  }

  // 1. Validate each candidate against existing database reservations (indexed by date)
  for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
    const candidate = candidates[cIdx];
    if (!candidate.fecha || isDateExemptFromConflicts(candidate.fecha) || !candidate.espacio) {
      continue;
    }
    if (candidate.id && deletedSet.has(candidate.id)) {
      continue;
    }
    if (!isReservationActiveForAvailability(candidate, deletedSet)) {
      continue;
    }

    const candidateIntervals = getTimeIntervalsForReservation(candidate);
    if (candidateIntervals.length === 0) {
      continue;
    }

    for (const cSlot of candidateIntervals) {
      const existingEntries = existingByDate.get(cSlot.date);
      if (!existingEntries || existingEntries.length === 0) continue;

      for (const { reservation: existing, slot: eSlot } of existingEntries) {
        // Avoid self-collision if candidate has same id as existing
        if (candidate.id && candidate.id === existing.id) {
          continue;
        }

        // Check space conflict (handles compound and normalized matching)
        if (!doSpacesConflict(candidate.espacio, existing.espacio)) {
          continue;
        }

        // Check time intervals overlap
        if (isTimeOverlapping(cSlot.startMin, cSlot.endMin, eSlot.startMin, eSlot.endMin)) {
          const overlapStart = Math.max(cSlot.startMin, eSlot.startMin);
          const overlapEnd = Math.min(cSlot.endMin, eSlot.endMin);
          const overlapMin = overlapEnd - overlapStart;

          detectedConflicts.push({
            reserva: candidate,
            conflictingWith: existing,
            espacio: candidate.espacio,
            fecha: cSlot.date,
            horaInicio: formatMinutesToTime(cSlot.startMin),
            horaFin: formatMinutesToTime(cSlot.endMin),
            overlap: `${formatMinutesToTime(overlapStart)} - ${formatMinutesToTime(overlapEnd)} (${overlapMin} min)`,
            reason: `Espacio '${candidate.espacio}' ya ocupado por '${existing.tipoActividad || 'Actividad'}' (${existing.responsable || 'Responsable'})`
          });
        }
      }
    }
  }

  // 2. Intra-batch validation: Validate candidates against other candidates in the same batch
  if (!options?.allowCandidateSelfConflicts && candidates.length > 1) {
    interface CandidateSlotEntry {
      readonly candidate: Reservation;
      readonly slot: TimeIntervalSlot;
      readonly index: number;
    }
    const candidatesByDate = new Map<string, CandidateSlotEntry[]>();
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      if (!cand.fecha || isDateExemptFromConflicts(cand.fecha) || !cand.espacio) continue;
      const intervals = getTimeIntervalsForReservation(cand);
      for (const slot of intervals) {
        let list = candidatesByDate.get(slot.date);
        if (!list) {
          list = [];
          candidatesByDate.set(slot.date, list);
        }
        list.push({ candidate: cand, slot, index: i });
      }
    }

    candidatesByDate.forEach((entries) => {
      const len = entries.length;
      if (len < 2) return;

      for (let i = 0; i < len; i++) {
        const itemA = entries[i];
        for (let j = i + 1; j < len; j++) {
          const itemB = entries[j];
          if (itemA.index === itemB.index) continue; // Same candidate instance
          if (!doSpacesConflict(itemA.candidate.espacio, itemB.candidate.espacio)) continue;

          if (isTimeOverlapping(itemA.slot.startMin, itemA.slot.endMin, itemB.slot.startMin, itemB.slot.endMin)) {
            const overlapStart = Math.max(itemA.slot.startMin, itemB.slot.startMin);
            const overlapEnd = Math.min(itemA.slot.endMin, itemB.slot.endMin);
            const overlapMin = overlapEnd - overlapStart;

            detectedConflicts.push({
              reserva: itemA.candidate,
              conflictingWith: itemB.candidate,
              espacio: itemA.candidate.espacio,
              fecha: itemA.slot.date,
              horaInicio: formatMinutesToTime(itemA.slot.startMin),
              horaFin: formatMinutesToTime(itemA.slot.endMin),
              overlap: `${formatMinutesToTime(overlapStart)} - ${formatMinutesToTime(overlapEnd)} (${overlapMin} min)`,
              reason: `Conflicto interno entre reservas del mismo lote en '${itemA.candidate.espacio}'`
            });
          }
        }
      }
    });
  }

  return detectedConflicts;
}

/**
 * Checks a batch of candidate reservations against existing reservations.
 */
export function detectBatchConflicts(
  candidates: readonly Reservation[],
  allReservations: readonly Reservation[],
  excludeReservationIds?: readonly string[] | Set<string>,
  excludeSeriesId?: string
): DetectedConflictDetail[] {
  return findReservationConflicts(candidates, allReservations, {
    excludeReservationIds,
    excludeSeriesId,
    allowCandidateSelfConflicts: false
  });
}

/**
 * Checks a single candidate reservation against the database.
 * Returns array of conflicting reservations.
 */
export function checkSingleConflict(
  candidate: Partial<Reservation>,
  allReservations: readonly Reservation[],
  excludeReservationId?: string | readonly string[] | Set<string>,
  excludeSeriesId?: string
): Reservation[] {
  if (!candidate.fecha || !candidate.horaInicio || !candidate.horaFin || !candidate.espacio) {
    return [];
  }
  if (isDateExemptFromConflicts(candidate.fecha)) {
    return [];
  }

  const dummyReserva: Reservation = {
    id: candidate.id || '__candidate_check__',
    fecha: candidate.fecha,
    horaInicio: candidate.horaInicio,
    horaFin: candidate.horaFin,
    espacio: candidate.espacio,
    tipoActividad: candidate.tipoActividad || 'Comprobación',
    responsable: candidate.responsable || 'Usuario',
    terminaDiaSiguiente: candidate.terminaDiaSiguiente,
    serieRecurrente: candidate.serieRecurrente,
    recurrenteId: candidate.recurrenteId
  } as Reservation;

  const excludeSet = new Set<string>();
  if (typeof excludeReservationId === 'string') {
    excludeSet.add(excludeReservationId);
  } else if (excludeReservationId instanceof Set) {
    excludeReservationId.forEach((id) => excludeSet.add(id));
  } else if (excludeReservationId) {
    excludeReservationId.forEach((id) => id && excludeSet.add(id));
  }
  if (candidate.id) {
    excludeSet.add(candidate.id);
  }

  const conflicts = findReservationConflicts(
    [dummyReserva],
    allReservations,
    {
      excludeReservationIds: excludeSet,
      excludeSeriesId,
      allowCandidateSelfConflicts: true
    }
  );

  const seenIds = new Set<string>();
  const conflictingReservations: Reservation[] = [];

  for (const c of conflicts) {
    if (!seenIds.has(c.conflictingWith.id)) {
      seenIds.add(c.conflictingWith.id);
      conflictingReservations.push(c.conflictingWith);
    }
  }

  return conflictingReservations;
}

/**
 * Optimally detects all pairwise conflicts across existing reservations in the system.
 * Uses O(N) date-based bucketing and interval precomputation instead of quadratic all-pairs scan.
 */
export function detectAllConflicts(reservations: readonly Reservation[]): BookingConflict[] {
  const detectedConflicts: BookingConflict[] = [];
  if (!reservations || reservations.length < 2) return detectedConflicts;

  const deletedSet = getDeletedIds();
  const hasDeleted = deletedSet.size > 0;

  // Pre-calculate date-bucketed slots directly to avoid repeated parsing and inner loop filtering
  interface DaySlotItem {
    readonly res: Reservation;
    readonly slot: TimeIntervalSlot;
    readonly normSpace: string;
    readonly constituents: readonly string[];
  }

  // Partition by date so we only compare reservations active on the same date
  const byDate = new Map<string, DaySlotItem[]>();

  const resLen = reservations.length;
  for (let rIdx = 0; rIdx < resLen; rIdx++) {
    const res = reservations[rIdx];
    if (!res || !res.id || !res.fecha || !res.espacio) continue;
    if (hasDeleted && deletedSet.has(res.id)) continue;
    if (isDateExemptFromConflicts(res.fecha)) continue;
    if (!isReservationActiveForAvailability(res, deletedSet)) continue;

    const intervals = getTimeIntervalsForReservation(res);
    if (intervals.length === 0) continue;

    const normSpace = normalizeSpace(res.espacio);
    const constituents = getConstituentSpaces(res.espacio);

    for (let k = 0; k < intervals.length; k++) {
      const slot = intervals[k];
      let list = byDate.get(slot.date);
      if (!list) {
        list = [];
        byDate.set(slot.date, list);
      }
      list.push({ res, slot, normSpace, constituents });
    }
  }

  const processedPairs = new Set<string>();

  byDate.forEach((dayItems, date) => {
    const len = dayItems.length;
    if (len < 2) return;

    // Sweep-line sort by startMin: enables O(N) early exit when slotB.startMin >= slotA.endMin
    dayItems.sort((a, b) => a.slot.startMin - b.slot.startMin);

    for (let i = 0; i < len; i++) {
      const itemA = dayItems[i];
      const resA = itemA.res;
      const slotA = itemA.slot;

      for (let j = i + 1; j < len; j++) {
        const itemB = dayItems[j];
        const slotB = itemB.slot;

        // Sweep-line early exit: all subsequent items k > j have slotK.startMin >= slotB.startMin >= slotA.endMin
        if (slotB.startMin >= slotA.endMin) {
          break;
        }

        const resB = itemB.res;
        if (resA.id === resB.id) continue;

        // Fast space conflict check using precomputed normalized names and constituents
        let sharesSpace = itemA.normSpace === itemB.normSpace;
        if (!sharesSpace) {
          const cA = itemA.constituents;
          const cB = itemB.constituents;
          const lenA = cA.length;
          const lenB = cB.length;
          for (let a = 0; a < lenA; a++) {
            const pA = cA[a];
            for (let b = 0; b < lenB; b++) {
              if (pA === cB[b]) {
                sharesSpace = true;
                break;
              }
            }
            if (sharesSpace) break;
          }
        }

        if (!sharesSpace) continue;

        // Check interval overlap
        if (isTimeOverlapping(slotA.startMin, slotA.endMin, slotB.startMin, slotB.endMin)) {
          const pairKey = resA.id < resB.id ? `${resA.id}_${resB.id}_${date}` : `${resB.id}_${resA.id}_${date}`;
          if (processedPairs.has(pairKey)) continue;
          processedPairs.add(pairKey);

          const overlapStart = Math.max(slotA.startMin, slotB.startMin);
          const overlapEnd = Math.min(slotA.endMin, slotB.endMin);
          const overlapDurationMinutes = overlapEnd - overlapStart;

          detectedConflicts.push({
            reservaA: resA,
            reservaB: resB,
            espacio: resA.espacio,
            fecha: date,
            solapamiento: `${formatMinutesToTime(overlapStart)} - ${formatMinutesToTime(overlapEnd)} (${overlapDurationMinutes} min)`
          });
        }
      }
    }
  });

  return detectedConflicts;
}

/**
 * Returns a Set of reservation IDs involved in at least one conflict.
 * Accepts optional precomputed conflicts to avoid running detection twice.
 */
export function getConflictReservationIds(
  reservations: readonly Reservation[],
  precomputedConflicts?: BookingConflict[]
): Set<string> {
  const conflicts = precomputedConflicts ?? detectAllConflicts(reservations);
  const conflictingIds = new Set<string>();

  for (const conflict of conflicts) {
    conflictingIds.add(conflict.reservaA.id);
    conflictingIds.add(conflict.reservaB.id);
  }

  return conflictingIds;
}

export interface EquipmentConflict {
  equipmentId: string;
  equipmentName: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  requestedTotal: number;
  availableTotal: number;
  deficit: number;
  reservations: Array<{
    reservation: Reservation;
    quantityRequested: number;
  }>;
}

/**
 * Detects any equipment deficit / conflicts across reservations on a specific date or overall.
 */
export function detectEquipmentConflicts(
  reservations: readonly Reservation[],
  equipmentStockMap: Record<string, number>
): EquipmentConflict[] {
  const conflicts: EquipmentConflict[] = [];
  const dateMap = new Map<string, Reservation[]>();

  // Group by non-exempt dates
  for (const r of reservations) {
    if (!r.fecha || isDateExemptFromConflicts(r.fecha) || !isReservationActiveForAvailability(r) || !r.equipamientoSolicitado || r.equipamientoSolicitado.length === 0) {
      continue;
    }
    const current = dateMap.get(r.fecha) || [];
    current.push(r);
    dateMap.set(r.fecha, current);
  }

  dateMap.forEach((dayRes, fecha) => {
    // Check each pair of overlapping reservations
    for (let i = 0; i < dayRes.length; i++) {
      const resA = dayRes[i];
      const startA = timeToMinutes(resA.horaInicio);
      const endA = timeToMinutes(resA.horaFin);

      // Collect all concurrent reservations overlapping with resA
      const concurrent = dayRes.filter((resB) => {
        const startB = timeToMinutes(resB.horaInicio);
        const endB = timeToMinutes(resB.horaFin);
        return isTimeOverlapping(startA, endA, startB, endB);
      });

      // Sum quantities per equipment
      const eqMap = new Map<string, { name: string; totalReq: number; list: Array<{ reservation: Reservation; quantityRequested: number }> }>();

      for (const res of concurrent) {
        if (!res.equipamientoSolicitado) continue;
        for (const eq of res.equipamientoSolicitado) {
          if (eq.quantity <= 0) continue;
          const currentEq = eqMap.get(eq.equipmentId) || { name: eq.equipmentName, totalReq: 0, list: [] };
          currentEq.totalReq += eq.quantity;
          currentEq.list.push({ reservation: res, quantityRequested: eq.quantity });
          eqMap.set(eq.equipmentId, currentEq);
        }
      }

      eqMap.forEach((data, eqId) => {
        const stock = equipmentStockMap[eqId] ?? 999;
        if (data.totalReq > stock) {
          const conflictId = `${fecha}_${eqId}_${resA.horaInicio}_${resA.horaFin}`;
          const alreadyAdded = conflicts.some(c => c.fecha === fecha && c.equipmentId === eqId && isTimeOverlapping(timeToMinutes(c.horaInicio), timeToMinutes(c.horaFin), startA, endA));
          if (!alreadyAdded) {
            conflicts.push({
              equipmentId: eqId,
              equipmentName: data.name,
              fecha,
              horaInicio: resA.horaInicio,
              horaFin: resA.horaFin,
              requestedTotal: data.totalReq,
              availableTotal: stock,
              deficit: data.totalReq - stock,
              reservations: data.list
            });
          }
        }
      });
    }
  });

  return conflicts;
}

/**
 * Detects all active reservations that overlap with active space maintenance blocks.
 */
export function detectReservationsBlockedByMaintenance(
  reservations: readonly Reservation[],
  spaceBlocks: readonly SpaceBlock[]
): DetectedBlockConflictDetail[] {
  return findMaintenanceBlockConflicts(reservations, spaceBlocks);
}

