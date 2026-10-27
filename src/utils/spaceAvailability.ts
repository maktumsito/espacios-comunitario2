import type { SpaceInfo } from '../types';
import { getConstituentSpaces, normalizeSpace } from './conflictDetector';

/** Old catalog entries remain active until explicitly disabled. */
export const getEnabledSpaces = (spaces: readonly SpaceInfo[]): SpaceInfo[] => spaces.filter(space => space.activo !== false);
export const getDisabledSpaceNames = (spaces: readonly SpaceInfo[]): Set<string> => new Set(spaces.filter(space => space.activo === false).map(space => normalizeSpace(space.name)));

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
