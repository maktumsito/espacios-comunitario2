// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DailyUsageView } from '../DailyUsageView';
import { SPACES_LIST } from '../../data/spacesData';
import type { FilterState, Reservation, SpaceInfo } from '../../types';

vi.mock('../../hooks/useTimelineViewport', () => ({
  useTimelineViewport: () => ({ start: 0, end: 2000 }),
  intersectsViewport: (top: number, height: number, start: number, end: number) => top < end && top + height > start,
}));

afterEach(cleanup);

const shared: Reservation = {
  id: 'shared', fecha: '2026-10-15', espacio: 'SALA 2 / SALA 5 / SALA 6 / SALA 4',
  horaInicio: '09:00', horaFin: '19:00', responsable: 'Prueba',
  tipoActividad: 'OTROS', descripcion: 'Centro de aprendizaje 2', actividadRecurrente: 'No',
};
const patchwork: Reservation = {
  ...shared, id: 'patchwork', espacio: 'SALA 5', horaInicio: '19:00', horaFin: '21:00', descripcion: 'Patchwork',
};
const configured = ['SALA 5', 'SALA 2', 'SALA 3', 'SALA 4', 'SALA 6']
  .map((name) => SPACES_LIST.find((space) => space.name === name)!);

function renderDay(reservations: Reservation[], spaces: SpaceInfo[] = configured, globalFilters?: FilterState) {
  const onSelectReservation = vi.fn();
  const result = render(<DailyUsageView reservations={reservations} spaces={spaces}
    selectedDate={new Date(2026, 9, 15)} conflictReservationIds={new Set()}
    globalFilters={globalFilters} onSelectReservation={onSelectReservation} onNewReservationWithSlot={vi.fn()} />);
  const headers = Array.from(result.container.querySelectorAll('[title$="(orden fijo)"]'))
    .map((element) => element.textContent);
  const columns = Array.from(result.container.querySelectorAll('.group\\/col'));
  return { ...result, headers, columns, onSelectReservation };
}

it.each([' / ', ' + '])('renders a shared booking only in its constituent rooms with separator %s', (separator) => {
  const reservation = { ...shared, espacio: ['SALA 2', 'SALA 5', 'SALA 6', 'SALA 4'].join(separator) };
  const { headers, columns, container, onSelectReservation } = renderDay([reservation, patchwork]);
  expect(headers).toEqual(configured.map((space) => space.name));
  expect(container.querySelectorAll('[data-reservation-id="shared"]')).toHaveLength(4);
  columns.forEach((column, index) => {
    expect(Boolean(column.querySelector('[data-reservation-id="shared"]'))).toBe(headers[index] !== 'SALA 3');
    expect(Boolean(column.querySelector('[data-reservation-id="patchwork"]'))).toBe(headers[index] === 'SALA 5');
  });
  fireEvent.click(container.querySelector('[data-reservation-id="shared"]')!);
  expect(onSelectReservation).toHaveBeenCalledExactlyOnceWith(reservation);
});

it('discovers missing individual rooms and preserves existing custom rooms without duplicate columns', () => {
  const customRoom = { ...configured[0], id: 'custom', name: 'SALÓN ÁRBOL' };
  const reservation = { ...shared, espacio: 'SALA2 / SALA 6 / SALÓN ÁRBOL / SALA 6' };
  const { headers, container } = renderDay([reservation], [configured[1], customRoom]);
  expect(headers).toEqual(['SALA 2', 'SALÓN ÁRBOL', 'SALA 6']);
  expect(container.querySelectorAll('[data-reservation-id="shared"]')).toHaveLength(3);
});

it('removes a compound column saved by reordering and keeps its missing rooms visible', () => {
  const savedCompound = { ...configured[0], id: shared.espacio, name: shared.espacio };
  const { headers, container } = renderDay([shared], [configured[0], savedCompound, configured[1]]);
  expect(headers).toEqual(['SALA 5', 'SALA 2', 'SALA 6', 'SALA 4']);
  expect(container.querySelectorAll('[data-reservation-id="shared"]')).toHaveLength(4);
});

it.each(['SALA 2', 'SALA 2 / SALA 5'])('keeps the room filter working for %s', (espacio) => {
  const { headers, container } = renderDay([shared], configured, { espacio } as FilterState);
  expect(headers).toEqual(espacio === 'SALA 2' ? ['SALA 2'] : ['SALA 5', 'SALA 2']);
  expect(container.querySelectorAll('[data-reservation-id="shared"]')).toHaveLength(headers.length);
  expect(screen.queryByTitle(`${shared.espacio} (orden fijo)`)).toBeNull();
});


it('filters comparison columns without modifying bookings or room configuration', () => {
  const { container } = renderDay([shared], configured);
  const before = container.querySelectorAll('[title$="(orden fijo)"]').length;
  fireEvent.click(screen.getByText(/Espacios a comparar:/));
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar selección' }));
  expect(container.querySelectorAll('[title$="(orden fijo)"]')).toHaveLength(0);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sala 2' }));
  expect(container.querySelectorAll('[title$="(orden fijo)"]')).toHaveLength(1);
  expect(container.querySelectorAll('[data-reservation-id="shared"]')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
  expect(container.querySelectorAll('[title$="(orden fijo)"]')).toHaveLength(before);
});

it('preserves hidden rooms when reordering comparison columns', () => {
  localStorage.setItem('allow_reorder_spaces', 'true');
  const reorder = vi.fn();
  render(<DailyUsageView reservations={[shared]} allReservations={[shared]} spaces={configured}
    selectedDate={new Date(2026, 9, 15)} comparisonSpaces={['SALA 5', 'SALA 2']}
    onSelectReservation={vi.fn()} onNewReservationWithSlot={vi.fn()} onReorderSpaces={reorder} />);
  fireEvent.click(screen.getByRole('button', { name: 'Mover "SALA 2" a la izquierda' }));
  expect(reorder.mock.calls[0][0].map((space: SpaceInfo) => space.name)).toEqual(['SALA 2', 'SALA 5', 'SALA 3', 'SALA 4', 'SALA 6']);
  localStorage.removeItem('allow_reorder_spaces');
});
