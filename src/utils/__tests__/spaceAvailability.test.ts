import { expect, it } from 'vitest';
import type { Reservation, SpaceBlock, SpaceInfo } from '../../types';
import { filterEnabledSpaceReservations, getDailySpaceAvailability, getEnabledSpaces, hasEnabledSpace, mergeSpaceOrder } from '../spaceAvailability';
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

it('lists all regular gaps across active rooms with shared bookings, overnight use and multiple maintenance blocks', () => {
  const fecha = '2026-11-10';
  const combined: Reservation = {
    id: 'combined', fecha, espacio: 'SALA 2 / SALA 3', horaInicio: '10:00', horaFin: '11:00',
    responsable: '', tipoActividad: '', descripcion: '', actividadRecurrente: 'No',
  };
  const block: SpaceBlock = {
    id: 'maintenance', espacio: 'SALA 2', fechaInicio: fecha, fechaFin: fecha, horaInicio: '11:00', horaFin: '12:00',
    activo: true, todoElDia: false, motivo: 'Mantención', descripcion: '', createdAt: '',
  };
  const results = getDailySpaceAvailability({
    fecha,
    spaces: [room('SALA 2'), room('SALA 3'), room('SALA 4'), room('SALA 5'), room('SALA 6', false)],
    reservations: [combined,
      { ...combined, id: 'overnight', fecha: '2026-11-09', espacio: 'SALA 2', horaInicio: '21:00', horaFin: '09:00', terminaDiaSiguiente: true },
      { ...combined, id: 'cancelled', espacio: 'SALA 3', horaInicio: '08:30', horaFin: '10:00', estado: 'cancelada' },
    ],
    blocks: [block,
      { ...block, id: 'second', horaInicio: '12:05', horaFin: '15:00' },
      { ...block, id: 'all-day', espacio: 'SALA 4', todoElDia: true },
    ],
  });

  expect(results.map(({ space, slots }) => [space.name, slots.map(({ startTime, endTime }) => `${startTime}-${endTime}`)])).toEqual([
    ['SALA 2', ['09:00-10:00', '12:00-12:05', '15:00-22:00']],
    ['SALA 3', ['08:30-10:00', '11:00-22:00']],
    ['SALA 4', []],
    ['SALA 5', ['08:30-22:00']],
  ]);
});

it('does not offer regular booking slots on a holiday', () => {
  const space = room('SALA 2');
  expect(getDailySpaceAvailability({ fecha: '2026-12-25', spaces: [space], reservations: [], blocks: [] }))
    .toEqual([{ space, slots: [] }]);
});
