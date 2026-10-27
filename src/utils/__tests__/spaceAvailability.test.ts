import { expect, it } from 'vitest';
import type { SpaceInfo } from '../../types';
import { filterEnabledSpaceReservations, getEnabledSpaces, hasEnabledSpace, mergeSpaceOrder } from '../spaceAvailability';
const room = (name: string, activo?: boolean): SpaceInfo => ({ id: name, name, activo, description: '', category: 'General', iconName: 'Layers', color: '#0284c7' });
it('treats legacy spaces as active and keeps explicit inactive entries out of choices', () => {
  const catalog = [room('SALA 2'), room('SALA 3', false), room('SALA 4', true)];
  expect(getEnabledSpaces(catalog).map(s => s.name)).toEqual(['SALA 2', 'SALA 4']);
  expect(hasEnabledSpace('sala3', catalog)).toBe(false);
});
it('hides inactive-only bookings while preserving shared bookings and their original data', () => {
  const catalog = [room('SALA 2', false), room('SALA 3')];
  const rows = [{ espacio: 'sala2', id: 'hidden' }, { espacio: 'SALA 2 / SALA 3', id: 'shared' }, { espacio: 'SALA ANTIGUA', id: 'legacy' }];
  const visible = filterEnabledSpaceReservations(rows, catalog);
  expect(visible.map(r => r.id)).toEqual(['shared', 'legacy']);
  expect(visible[0]).toBe(rows[1]);
  expect(filterEnabledSpaceReservations(rows, catalog.map(s => ({ ...s, activo: true })))).toEqual(rows);
});
it('preserves inactive spaces and their metadata during visible-column reordering', () => {
  const catalog = [room('A'), room('B', false), room('C')];
  const reordered = mergeSpaceOrder(catalog, [catalog[2], catalog[0]]);
  expect(reordered.map(s => s.id)).toEqual(['C', 'B', 'A']);
  expect(reordered[1]).toBe(catalog[1]);
  expect(mergeSpaceOrder(catalog, [])).toEqual(catalog);
});
