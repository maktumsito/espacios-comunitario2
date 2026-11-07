import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { DistributionSnapshot, SpaceInfo } from '../types';
import { doSpacesConflict, findMaintenanceBlockConflicts, formatMinutesToTime, getConstituentSpaces, getTimeIntervalsForReservation, isReservationActiveForAvailability, normalizeSpace } from './conflictDetector';
import { REGULAR_LOAN_END_MINUTES, REGULAR_LOAN_START_MINUTES } from './validationUtils';
import { isChileanHoliday } from './holidayUtils';

/** Old catalog entries remain active until explicitly disabled. */
export const getEnabledSpaces = (spaces: readonly SpaceInfo[]): SpaceInfo[] => spaces.filter(space => space.activo !== false);
export const getDisabledSpaceNames = (spaces: readonly SpaceInfo[]): Set<string> => new Set(spaces.filter(space => space.activo === false).map(space => normalizeSpace(space.name)));

export interface FreeSpaceSlot {
  startTime: string;
  endTime: string;
}

export const MAX_SPACE_AVAILABILITY_DAYS = 31;

export function isSpaceAvailabilityRangeValid(start: string, end: string): boolean {
  const days = differenceInCalendarDays(parseISO(end), parseISO(start));
  return days >= 0 && days < MAX_SPACE_AVAILABILITY_DAYS;
}

export function getDailySpaceAvailability({ fecha, spaces, reservations, blocks }: Pick<DistributionSnapshot, 'fecha' | 'spaces' | 'reservations' | 'blocks'>): { space: SpaceInfo; slots: FreeSpaceSlot[] }[] {
  const enabledSpaces = getEnabledSpaces(spaces);
  if (isChileanHoliday(fecha)) return enabledSpaces.map(space => ({ space, slots: [] }));

  const dayStart = REGULAR_LOAN_START_MINUTES;
  const dayEnd = REGULAR_LOAN_END_MINUTES;
  const deletedIds = new Set<string>(); // The snapshot includes server records only.
  const dayReservations = reservations
    .filter(row => isReservationActiveForAvailability(row, deletedIds))
    .flatMap(row => getTimeIntervalsForReservation(row)
      .filter(slot => slot.date === fecha)
      .map(slot => ({ ...slot, espacio: row.espacio })));
  const dayBlocks = blocks.filter(block => block.activo && block.fechaInicio <= fecha && block.fechaFin >= fecha);

  return enabledSpaces.map(space => {
    const regularDay = { fecha, espacio: space.name, horaInicio: formatMinutesToTime(dayStart), horaFin: formatMinutesToTime(dayEnd) };
    const occupied = dayReservations.filter(slot => doSpacesConflict(space.name, slot.espacio));
    // The validator reports the first maintenance conflict per interval. Check each block to collect them all.
    const blocked = dayBlocks.flatMap(block => findMaintenanceBlockConflicts([regularDay], [block])
      .map(conflict => ({ startMin: conflict.overlapStartMin, endMin: conflict.overlapEndMin })));

    const slots: FreeSpaceSlot[] = [];
    let cursor = dayStart;
    for (const { startMin, endMin } of [...occupied, ...blocked].sort((a, b) => a.startMin - b.startMin)) {
      if (endMin <= cursor || startMin >= dayEnd) continue;
      if (startMin > cursor) slots.push({ startTime: formatMinutesToTime(cursor), endTime: formatMinutesToTime(startMin) });
      cursor = Math.max(cursor, endMin);
    }
    if (cursor < dayEnd) slots.push({ startTime: formatMinutesToTime(cursor), endTime: formatMinutesToTime(dayEnd) });
    return { space, slots };
  });
}

export function hasEnabledSpace(name: string, spaces: readonly SpaceInfo[]): boolean {
  const disabled = getDisabledSpaceNames(spaces);
  return !disabled.has(normalizeSpace(name)) && getConstituentSpaces(name).some(room => !disabled.has(room));
}

/** Keep shared bookings visible in their remaining active rooms, and preserve the
 * original objects for editing, conflict detection and historical reporting. */
export function filterEnabledSpaceReservations<T extends { espacio: string }>(rows: readonly T[], spaces: readonly SpaceInfo[]): T[] {
  const disabled = getDisabledSpaceNames(spaces);
  if (!disabled.size) return [...rows];
  return rows.filter(row => !disabled.has(normalizeSpace(row.espacio)) && getConstituentSpaces(row.espacio).some(room => !disabled.has(room)));
}

/** A daily-view reorder contains only visible columns. Retain all other catalog
 * entries (including inactive ones) at their previous positions. */
export function mergeSpaceOrder(catalog: readonly SpaceInfo[], reordered: readonly SpaceInfo[]): SpaceInfo[] {
  const orderedIds = new Set(reordered.map(space => space.id));
  const existing = new Map(catalog.map(space => [space.id, space]));
  const queue = reordered.filter(space => existing.has(space.id)).map(space => existing.get(space.id)!);
  let index = 0;
  return [...catalog.map(space => orderedIds.has(space.id) ? queue[index++] : space), ...reordered.filter(space => !existing.has(space.id))];
}
