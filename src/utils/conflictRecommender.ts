import { Reservation, SpaceInfo } from '../types';
import { SPACES_LIST } from '../data/spacesData';
import { getEnabledSpaces } from './spaceAvailability';
import {
  timeToMinutes,
  formatMinutesToTime,
  normalizeSpace,
  isDateExemptFromConflicts,
  checkSingleConflict
} from './conflictDetector';
import { formatDateDDMMYYYY } from './dateUtils';
import { addDays, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export type RecommendationType =
  | 'same_space_other_time' // Mover de horario en el mismo espacio
  | 'other_space_same_time' // Mover de sala en el mismo horario
  | 'other_day_same_time'   // Mover a otro día cercano (mismo espacio y hora)
  | 'other_space_other_time'; // Otra combinación sugerida

export interface ConflictRecommendation {
  readonly id: string;
  readonly type: RecommendationType;
  readonly categoryLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly badgeText: string;
  readonly badgeVariant: 'emerald' | 'blue' | 'indigo' | 'amber' | 'purple';
  readonly fecha: string; // YYYY-MM-DD
  readonly horaInicio: string; // HH:mm
  readonly horaFin: string; // HH:mm
  readonly espacio: string;
  readonly durationMinutes: number;
  readonly capacity?: number;
  readonly isCapacityFit?: boolean;
  readonly timeDifferenceMinutes?: number; // e.g. +60 min or -30 min relative to original start
  readonly score: number; // Higher is better recommendation
}

export interface RecommendationOptions {
  readonly minStartMinutes?: number; // default 08:00 (480)
  readonly maxEndMinutes?: number;   // default 22:00 (1320)
  readonly stepMinutes?: number;     // default 15 or 30 min increments
  readonly maxSameSpaceSlots?: number;
  readonly maxOtherSpaces?: number;
  readonly maxOtherDays?: number;
  readonly customSpacesList?: SpaceInfo[];
}

const DEFAULT_MIN_START = 480;  // 08:00
const DEFAULT_MAX_END = 1320;   // 22:00
const DEFAULT_STEP = 30;        // 30 min search step

/**
 * Checks if a specific time window [startMin, endMin) on `date` in `space` has zero conflicts.
 */
export function isSlotAvailable(
  date: string,
  startMin: number,
  endMin: number,
  space: string,
  allReservations: readonly Reservation[],
  excludeReservationId?: string | readonly string[],
  excludeSeriesId?: string
): boolean {
  if (endMin <= startMin) return false;
  if (!date || isDateExemptFromConflicts(date)) return true;

  const conflicts = checkSingleConflict(
    {
      fecha: date,
      horaInicio: formatMinutesToTime(startMin),
      horaFin: formatMinutesToTime(endMin),
      espacio: space
    },
    allReservations,
    excludeReservationId,
    excludeSeriesId
  );

  return conflicts.length === 0;
}

/**
 * Finds all available time windows in a given space and date for a requested duration.
 */
export function findAvailableTimeSlotsInSpace(
  date: string,
  space: string,
  durationMinutes: number,
  allReservations: readonly Reservation[],
  originalStartMinutes: number,
  excludeReservationId?: string | readonly string[],
  options?: RecommendationOptions,
  excludeSeriesId?: string
): ConflictRecommendation[] {
  const minStart = options?.minStartMinutes ?? DEFAULT_MIN_START;
  const maxEnd = options?.maxEndMinutes ?? DEFAULT_MAX_END;
  const step = options?.stepMinutes ?? DEFAULT_STEP;
  const limit = options?.maxSameSpaceSlots ?? 6;

  const foundSlots: { start: number; end: number; diff: number }[] = [];

  for (let t = minStart; t + durationMinutes <= maxEnd; t += step) {
    const slotEnd = t + durationMinutes;
    // Skip if it is the exact same requested time (since it's already known to have a conflict or is current)
    if (t === originalStartMinutes) {
      continue;
    }

    if (isSlotAvailable(date, t, slotEnd, space, allReservations, excludeReservationId, excludeSeriesId)) {
      const diff = t - originalStartMinutes;
      foundSlots.push({ start: t, end: slotEnd, diff });
    }
  }

  // Sort by closest time distance to original start time
  foundSlots.sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff));

  return foundSlots.slice(0, limit).map((slot, idx) => {
    const formattedStart = formatMinutesToTime(slot.start);
    const formattedEnd = formatMinutesToTime(slot.end);
    const absDiff = Math.abs(slot.diff);
    const hoursDiff = (absDiff / 60).toFixed(1).replace('.0', '');

    let badgeText = '';
    let badgeVariant: 'emerald' | 'blue' | 'indigo' | 'amber' | 'purple' = 'blue';

    if (slot.diff > 0 && slot.diff <= 60) {
      badgeText = `Inmediatamente después (+${absDiff}m)`;
      badgeVariant = 'emerald';
    } else if (slot.diff > 0) {
      badgeText = `Más tarde (+${hoursDiff}h)`;
      badgeVariant = 'indigo';
    } else if (slot.diff < 0 && absDiff <= 60) {
      badgeText = `Poco antes (-${absDiff}m)`;
      badgeVariant = 'emerald';
    } else {
      badgeText = `Más temprano (-${hoursDiff}h)`;
      badgeVariant = 'blue';
    }

    // High score for closest slots
    const score = 1000 - Math.abs(slot.diff) - idx * 10;

    return {
      id: `slot-${space}-${formattedStart}-${formattedEnd}`,
      type: 'same_space_other_time',
      categoryLabel: 'Mismo Espacio (Otro Horario)',
      title: `${formattedStart} a ${formattedEnd} hrs.`,
      subtitle: `En ${space.toUpperCase()} (${durationMinutes} min)`,
      badgeText,
      badgeVariant,
      fecha: date,
      horaInicio: formattedStart,
      horaFin: formattedEnd,
      espacio: space,
      durationMinutes,
      timeDifferenceMinutes: slot.diff,
      score
    };
  });
}

/**
 * Finds alternative free spaces during the exact same requested time block.
 */
export function findAlternativeFreeSpaces(
  date: string,
  startMinutes: number,
  endMinutes: number,
  currentSpace: string,
  allReservations: readonly Reservation[],
  requestedParticipants?: number,
  excludeReservationId?: string | readonly string[],
  options?: RecommendationOptions,
  excludeSeriesId?: string
): ConflictRecommendation[] {
  const spacesList = getEnabledSpaces(options?.customSpacesList || SPACES_LIST);
  const normalizedCurrent = normalizeSpace(currentSpace);
  const durationMinutes = endMinutes - startMinutes;
  const formattedStart = formatMinutesToTime(startMinutes);
  const formattedEnd = formatMinutesToTime(endMinutes);

  const availableAlternativeSpaces: { space: SpaceInfo; isFit: boolean; score: number }[] = [];

  for (const sp of spacesList) {
    if (normalizeSpace(sp.name) === normalizedCurrent) {
      continue;
    }

    const free = isSlotAvailable(date, startMinutes, endMinutes, sp.name, allReservations, excludeReservationId, excludeSeriesId);
    if (!free) {
      continue;
    }

    const capacity = sp.capacity || 25;
    const reqPart = requestedParticipants || 10;
    const isFit = capacity >= reqPart;

    // Score based on capacity fit and category matching
    let spaceScore = 800;
    if (isFit) spaceScore += 150;
    if (capacity >= reqPart && capacity <= reqPart * 2.5) {
      spaceScore += 50; // Ideal capacity (not overly huge or cramped)
    }

    availableAlternativeSpaces.push({
      space: sp,
      isFit,
      score: spaceScore
    });
  }

  // Sort: capacity fit first, then score
  availableAlternativeSpaces.sort((a, b) => {
    if (a.isFit !== b.isFit) return a.isFit ? -1 : 1;
    return b.score - a.score;
  });

  const limit = options?.maxOtherSpaces ?? 6;

  return availableAlternativeSpaces.slice(0, limit).map(({ space: sp, isFit, score }) => {
    const capacityText = sp.capacity ? `Aforo: ${sp.capacity} personas` : 'Aforo estándar';
    const fitBadge = isFit ? `Mismo Horario • ${capacityText}` : `Aforo limitado (${sp.capacity} pers.)`;

    return {
      id: `space-${sp.name}-${formattedStart}-${formattedEnd}`,
      type: 'other_space_same_time',
      categoryLabel: 'Mismo Horario (Otra Sala Libre)',
      title: `${sp.name.toUpperCase()}`,
      subtitle: `${formattedStart} a ${formattedEnd} hrs. (${sp.category || 'Espacio'})`,
      badgeText: fitBadge,
      badgeVariant: isFit ? 'emerald' : 'amber',
      fecha: date,
      horaInicio: formattedStart,
      horaFin: formattedEnd,
      espacio: sp.name,
      durationMinutes,
      capacity: sp.capacity,
      isCapacityFit: isFit,
      timeDifferenceMinutes: 0,
      score
    };
  });
}

/**
 * Finds alternative adjacent days (tomorrow, next week, etc.) where the same space is 100% free at that same time.
 */
export function findAlternativeDaysInSameSpace(
  date: string,
  startMinutes: number,
  endMinutes: number,
  space: string,
  allReservations: readonly Reservation[],
  excludeReservationId?: string | readonly string[],
  options?: RecommendationOptions,
  excludeSeriesId?: string
): ConflictRecommendation[] {
  const recommendations: ConflictRecommendation[] = [];
  const durationMinutes = endMinutes - startMinutes;
  const formattedStart = formatMinutesToTime(startMinutes);
  const formattedEnd = formatMinutesToTime(endMinutes);

  let baseDate: Date;
  try {
    baseDate = parseISO(date);
    if (isNaN(baseDate.getTime())) baseDate = new Date();
  } catch {
    baseDate = new Date();
  }

  // Test +1 day, +2 days, +3 days, +7 days (next week same day)
  const candidateOffsets = [1, 2, 3, 7];

  for (const offset of candidateOffsets) {
    const candidateDateObj = addDays(baseDate, offset);
    const candidateDateStr = format(candidateDateObj, 'yyyy-MM-dd');

    if (isSlotAvailable(candidateDateStr, startMinutes, endMinutes, space, allReservations, excludeReservationId, excludeSeriesId)) {
      let dayName = '';
      try {
        dayName = format(candidateDateObj, 'EEEE d/MM', { locale: es });
        dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      } catch {
        dayName = formatDateDDMMYYYY(candidateDateStr);
      }

      let badge = '';
      if (offset === 1) badge = 'Mañana';
      else if (offset === 7) badge = 'Mismo día próxima semana (+7d)';
      else badge = `En +${offset} días`;

      const score = 600 - offset * 20;

      recommendations.push({
        id: `day-${candidateDateStr}-${space}-${formattedStart}-${formattedEnd}`,
        type: 'other_day_same_time',
        categoryLabel: 'Mismo Espacio y Horario (Otro Día)',
        title: `${dayName} (${formatDateDDMMYYYY(candidateDateStr)})`,
        subtitle: `${space.toUpperCase()} • ${formattedStart} a ${formattedEnd} hrs.`,
        badgeText: badge,
        badgeVariant: offset === 1 || offset === 7 ? 'purple' : 'indigo',
        fecha: candidateDateStr,
        horaInicio: formattedStart,
        horaFin: formattedEnd,
        espacio: space,
        durationMinutes,
        score
      });
    }

    if (recommendations.length >= (options?.maxOtherDays ?? 3)) {
      break;
    }
  }

  return recommendations;
}

export interface RecommendationSummary {
  readonly hasRecommendations: boolean;
  readonly totalCount: number;
  readonly allRecommendations: ConflictRecommendation[];
  readonly sameSpaceOtherTimes: ConflictRecommendation[];
  readonly otherSpacesSameTime: ConflictRecommendation[];
  readonly otherDaysSameTime: ConflictRecommendation[];
  readonly topRecommendation: ConflictRecommendation | null;
}

/**
 * Main comprehensive recommendation generator when a conflict/copamiento occurs.
 */
export function generateConflictRecommendations(
  candidate: {
    fecha?: string;
    horaInicio?: string;
    horaFin?: string;
    espacio?: string;
    cantidadParticipantes?: number;
  },
  allReservations: readonly Reservation[],
  excludeReservationId?: string | string[],
  options?: RecommendationOptions,
  excludeSeriesId?: string
): RecommendationSummary {
  const {
    fecha = format(new Date(), 'yyyy-MM-dd'),
    horaInicio = '10:00',
    horaFin = '11:00',
    espacio = 'AUDITORIO',
    cantidadParticipantes = 15
  } = candidate;

  const startMinutes = timeToMinutes(horaInicio);
  let endMinutes = timeToMinutes(horaFin);
  if (endMinutes <= startMinutes) {
    endMinutes = startMinutes + 60;
  }
  const durationMinutes = endMinutes - startMinutes;

  // 1. Mover a otro horario en el mismo espacio
  const sameSpaceOtherTimes = findAvailableTimeSlotsInSpace(
    fecha,
    espacio,
    durationMinutes,
    allReservations,
    startMinutes,
    excludeReservationId,
    options,
    excludeSeriesId
  );

  // 2. Mover a otra sala libre en el mismo horario
  const otherSpacesSameTime = findAlternativeFreeSpaces(
    fecha,
    startMinutes,
    endMinutes,
    espacio,
    allReservations,
    cantidadParticipantes,
    excludeReservationId,
    options,
    excludeSeriesId
  );

  // 3. Mover a otro día cercano en el mismo espacio y horario
  const otherDaysSameTime = findAlternativeDaysInSameSpace(
    fecha,
    startMinutes,
    endMinutes,
    espacio,
    allReservations,
    excludeReservationId,
    options,
    excludeSeriesId
  );

  // Combine and sort by score
  const allRecommendations = [
    ...sameSpaceOtherTimes,
    ...otherSpacesSameTime,
    ...otherDaysSameTime
  ].sort((a, b) => b.score - a.score);

  const topRecommendation = allRecommendations[0] || null;

  return {
    hasRecommendations: allRecommendations.length > 0,
    totalCount: allRecommendations.length,
    allRecommendations,
    sameSpaceOtherTimes,
    otherSpacesSameTime,
    otherDaysSameTime,
    topRecommendation
  };
}
