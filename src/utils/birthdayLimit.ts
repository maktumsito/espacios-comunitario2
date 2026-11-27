import { isSingleDayMultiSpaceReservation, type Reservation } from '../types';
import { isReservationActiveForAvailability } from './conflictDetector';
import { formatDateDDMMYYYY } from './dateUtils';
import { normalizeActivityType } from './reservationVisuals';

export const MAX_DAILY_BIRTHDAYS = 2;

export interface DailyBirthdayLimitViolation {
  fecha: string;
  existingCount: number;
  candidateCount: number;
  totalCount: number;
  maxAllowed: number;
  existingReservations: Reservation[];
}

export function isBirthdayActivityType(tipoActividad?: string): boolean {
  return normalizeActivityType(tipoActividad) === 'CUMPLEANOS';
}

function birthdayEventKey(row: Partial<Reservation>): string {
  const seriesId = (row.serieRecurrente || row.recurrenteId || '').trim();
  if (seriesId) {
    return `series:${seriesId}:${row.fecha || ''}`;
  }
  if (row.id) {
    return `id:${row.id}`;
  }
  return `candidate:${row.fecha || ''}`;
}

export function findDailyBirthdayLimitViolations(
  candidates: readonly Partial<Reservation>[],
  existing: readonly Reservation[],
  options: {
    excludeReservationIds?: ReadonlySet<string> | readonly string[];
    maxPerDay?: number;
  } = {},
): DailyBirthdayLimitViolation[] {
  const maxAllowed = options.maxPerDay ?? MAX_DAILY_BIRTHDAYS;
  const excludeSet =
    options.excludeReservationIds instanceof Set
      ? options.excludeReservationIds
      : new Set(options.excludeReservationIds || []);

  const activeCandidateBirthdays = candidates.filter(
    (row) =>
      Boolean(row.fecha) &&
      isBirthdayActivityType(row.tipoActividad) &&
      isReservationActiveForAvailability(row as Reservation, new Set()),
  );

  if (activeCandidateBirthdays.length === 0) {
    return [];
  }

  const candidatesByDate = new Map<string, Map<string, Partial<Reservation>>>();
  for (const row of activeCandidateBirthdays) {
    const fecha = row.fecha!.trim().split('T')[0];
    if (!candidatesByDate.has(fecha)) candidatesByDate.set(fecha, new Map());
    const map = candidatesByDate.get(fecha)!;
    const key = birthdayEventKey(row);
    if (!map.has(key)) map.set(key, row);
    if (row.id) excludeSet.add(row.id);
  }

  const existingByDate = new Map<string, Map<string, Reservation>>();
  for (const row of existing) {
    if (!row.fecha || excludeSet.has(row.id)) continue;
    if (!isBirthdayActivityType(row.tipoActividad)) continue;
    if (!isReservationActiveForAvailability(row, new Set())) continue;
    const fecha = row.fecha.trim().split('T')[0];
    if (!candidatesByDate.has(fecha)) continue;
    if (!existingByDate.has(fecha)) existingByDate.set(fecha, new Map());
    const map = existingByDate.get(fecha)!;
    const key = birthdayEventKey(row);
    if (!map.has(key)) map.set(key, row);
  }

  const violations: DailyBirthdayLimitViolation[] = [];
  for (const [fecha, candidateMap] of [...candidatesByDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const existingMap = existingByDate.get(fecha);
    const existingList = existingMap ? [...existingMap.values()] : [];
    const existingCount = existingList.length;
    const candidateCount = candidateMap.size;
    const totalCount = existingCount + candidateCount;
    if (totalCount > maxAllowed) {
      violations.push({
        fecha,
        existingCount,
        candidateCount,
        totalCount,
        maxAllowed,
        existingReservations: existingList,
      });
    }
  }

  return violations;
}

export function formatBirthdayLimitMessage(violations: readonly DailyBirthdayLimitViolation[]): string {
  if (violations.length === 0) return '';
  if (violations.length === 1) {
    const v = violations[0];
    const dateLabel = formatDateDDMMYYYY(v.fecha);
    if (v.existingCount >= v.maxAllowed) {
      return `Ya hay ${v.existingCount} cumpleaños reservados para el ${dateLabel} (máximo ${v.maxAllowed} por día). Cambia la fecha o el tipo de actividad.`;
    }
    return `Con esta reserva se superarían los ${v.maxAllowed} cumpleaños permitidos para el ${dateLabel}. Cambia la fecha o ajusta las reservas del día.`;
  }
  const datesPreview = violations
    .slice(0, 3)
    .map((v) => formatDateDDMMYYYY(v.fecha))
    .join(', ');
  const extra = violations.length > 3 ? ` y ${violations.length - 3} fecha(s) más` : '';
  return `Se supera el máximo de ${violations[0].maxAllowed} cumpleaños por día en ${violations.length} fechas (${datesPreview}${extra}). Cambia las fechas afectadas para continuar.`;
}
