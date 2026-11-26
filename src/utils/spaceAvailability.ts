import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { DistributionSnapshot, Reservation, SpaceBlock, SpaceInfo } from '../types';
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

export interface DetailedFreeSlot extends FreeSpaceSlot {
  startMin: number;
  endMin: number;
  durationMinutes: number;
}

export interface RoomDayAvailabilitySummary {
  slots: DetailedFreeSlot[];
  freeMinutes: number;
  occupiedMinutes: number;
  totalMinutes: number;
  occupancyPct: number;
  isHoliday: boolean;
  isFullyBlocked: boolean;
}

export interface RoomLiveStatus {
  status: 'free' | 'occupied' | 'maintenance' | 'closed';
  label: string;
  shortLabel: string;
  untilTime?: string;
  nextFreeSlot?: DetailedFreeSlot;
}

export function formatDurationCompact(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function computeRoomDayFreeSlots(
  spaceName: string,
  dateStr: string,
  reservations: readonly Reservation[],
  blocks: readonly SpaceBlock[] = [],
  options?: { dayStartMin?: number; dayEndMin?: number; minSlotMinutes?: number; ignoreHoliday?: boolean }
): RoomDayAvailabilitySummary {
  const dayStart = options?.dayStartMin ?? REGULAR_LOAN_START_MINUTES;
  const dayEnd = options?.dayEndMin ?? REGULAR_LOAN_END_MINUTES;
  const minSlotMinutes = options?.minSlotMinutes ?? 30;
  const totalMinutes = Math.max(1, dayEnd - dayStart);
  const isHoliday = !options?.ignoreHoliday && isChileanHoliday(dateStr);

  const deletedIds = new Set<string>();
  const occupiedIntervals = reservations
    .filter(row => isReservationActiveForAvailability(row, deletedIds) && doSpacesConflict(spaceName, row.espacio))
    .flatMap(row => getTimeIntervalsForReservation(row).filter(slot => slot.date === dateStr))
    .map(slot => ({ startMin: slot.startMin, endMin: slot.endMin }));

  const regularDay = {
    fecha: dateStr,
    espacio: spaceName,
    horaInicio: formatMinutesToTime(dayStart),
    horaFin: formatMinutesToTime(dayEnd),
  };
  const blockedIntervals = blocks
    .filter(block => block.activo && block.fechaInicio <= dateStr && block.fechaFin >= dateStr)
    .flatMap(block =>
      findMaintenanceBlockConflicts([regularDay], [block]).map(conflict => ({
        startMin: conflict.overlapStartMin,
        endMin: conflict.overlapEndMin,
      }))
    );

  const busySorted = [...occupiedIntervals, ...blockedIntervals].sort((a, b) => a.startMin - b.startMin);

  // Merge busy intervals clipped to [dayStart, dayEnd]
  let occupiedMinutes = 0;
  const slots: DetailedFreeSlot[] = [];
  let cursor = dayStart;

  for (const interval of busySorted) {
    const s = Math.max(dayStart, Math.min(dayEnd, interval.startMin));
    const e = Math.max(dayStart, Math.min(dayEnd, interval.endMin));
    if (e <= cursor || s >= dayEnd) continue;
    if (s > cursor) {
      const durationMinutes = s - cursor;
      if (durationMinutes >= minSlotMinutes) {
        slots.push({
          startMin: cursor,
          endMin: s,
          startTime: formatMinutesToTime(cursor),
          endTime: formatMinutesToTime(s),
          durationMinutes,
        });
      }
    }
    const addedBusyStart = Math.max(cursor, s);
    if (e > addedBusyStart) {
      occupiedMinutes += e - addedBusyStart;
    }
    cursor = Math.max(cursor, e);
  }

  if (cursor < dayEnd) {
    const durationMinutes = dayEnd - cursor;
    if (durationMinutes >= minSlotMinutes) {
      slots.push({
        startMin: cursor,
        endMin: dayEnd,
        startTime: formatMinutesToTime(cursor),
        endTime: formatMinutesToTime(dayEnd),
        durationMinutes,
      });
    }
  }

  if (isHoliday) {
    return {
      slots: [],
      freeMinutes: 0,
      occupiedMinutes,
      totalMinutes,
      occupancyPct: Math.min(100, Math.round((occupiedMinutes / totalMinutes) * 100)),
      isHoliday: true,
      isFullyBlocked: false,
    };
  }

  const freeMinutes = Math.max(0, totalMinutes - occupiedMinutes);
  const occupancyPct = Math.min(100, Math.round((occupiedMinutes / totalMinutes) * 100));
  const isFullyBlocked =
    blockedIntervals.length > 0 &&
    slots.length === 0 &&
    blockedIntervals.some(b => b.startMin <= dayStart && b.endMin >= dayEnd);

  return {
    slots,
    freeMinutes,
    occupiedMinutes,
    totalMinutes,
    occupancyPct,
    isHoliday: false,
    isFullyBlocked,
  };
}

export function getRoomLiveStatus(
  spaceName: string,
  dateStr: string,
  nowMinutes: number,
  reservations: readonly Reservation[],
  blocks: readonly SpaceBlock[] = []
): RoomLiveStatus {
  const summary = computeRoomDayFreeSlots(spaceName, dateStr, reservations, blocks, { minSlotMinutes: 15 });
  const dayStart = REGULAR_LOAN_START_MINUTES;
  const dayEnd = REGULAR_LOAN_END_MINUTES;

  const regularDay = {
    fecha: dateStr,
    espacio: spaceName,
    horaInicio: formatMinutesToTime(dayStart),
    horaFin: formatMinutesToTime(dayEnd),
  };
  const activeBlockNow = blocks
    .filter(block => block.activo && block.fechaInicio <= dateStr && block.fechaFin >= dateStr)
    .flatMap(block => findMaintenanceBlockConflicts([regularDay], [block]))
    .find(conflict => nowMinutes >= conflict.overlapStartMin && nowMinutes < conflict.overlapEndMin);

  if (activeBlockNow) {
    const untilTime = formatMinutesToTime(activeBlockNow.overlapEndMin);
    const nextFreeSlot = summary.slots.find(slot => slot.startMin >= activeBlockNow.overlapEndMin);
    return {
      status: 'maintenance',
      shortLabel: 'Mantención',
      label: `En mantención hasta ${untilTime}`,
      untilTime,
      nextFreeSlot,
    };
  }

  if (nowMinutes < dayStart) {
    const firstSlot = summary.slots[0];
    return {
      status: firstSlot ? 'free' : 'closed',
      shortLabel: firstSlot ? `Abre ${firstSlot.startTime}` : 'Sin tramos',
      label: firstSlot ? `Próximo tramo libre ${firstSlot.startTime}–${firstSlot.endTime}` : 'Sin disponibilidad regular hoy',
      untilTime: firstSlot?.endTime,
      nextFreeSlot: firstSlot,
    };
  }

  if (nowMinutes >= dayEnd) {
    return {
      status: 'closed',
      shortLabel: 'Cerrado',
      label: 'Fuera de horario regular (08:30–22:00)',
    };
  }

  const currentFreeSlot = summary.slots.find(slot => nowMinutes >= slot.startMin && nowMinutes < slot.endMin);
  if (currentFreeSlot) {
    return {
      status: 'free',
      shortLabel: 'Libre ahora',
      label: `Libre ahora · hasta ${currentFreeSlot.endTime}`,
      untilTime: currentFreeSlot.endTime,
      nextFreeSlot: currentFreeSlot,
    };
  }

  const deletedIds = new Set<string>();
  const currentRes = reservations
    .filter(row => isReservationActiveForAvailability(row, deletedIds) && doSpacesConflict(spaceName, row.espacio))
    .flatMap(row => getTimeIntervalsForReservation(row).filter(slot => slot.date === dateStr))
    .find(slot => nowMinutes >= slot.startMin && nowMinutes < slot.endMin);

  const nextFreeSlot = summary.slots.find(slot => slot.startMin >= nowMinutes);
  const untilTime = currentRes ? formatMinutesToTime(currentRes.endMin) : nextFreeSlot?.startTime;

  return {
    status: 'occupied',
    shortLabel: untilTime ? `En uso · ${untilTime}` : 'Ocupado',
    label: nextFreeSlot
      ? `En uso · libre a las ${nextFreeSlot.startTime}`
      : untilTime
        ? `En uso hasta ${untilTime}`
        : 'Sin tramos libres hoy',
    untilTime,
    nextFreeSlot,
  };
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
