// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useFilteredReservations, INITIAL_FILTERS } from '../useFilteredReservations';
import { getFuzzyMatchIds } from '../../utils/fuzzySearch';
import type { Reservation } from '../../types';

vi.mock('../../utils/fuzzySearch', async original => {
  const actual = await original<typeof import('../../utils/fuzzySearch')>();
  return { ...actual, getFuzzyMatchIds: vi.fn(actual.getFuzzyMatchIds) };
});
const rows = [
  { id: 'a', descripcion: 'Cerámica', espacio: 'SALA 2', fecha: '2026-11-10', horaInicio: '10:00', horaFin: '11:00', responsable: 'Ana', tipoActividad: 'Taller', actividadRecurrente: 'No' },
  { id: 'b', descripcion: 'Yoga', espacio: 'SALA 3', fecha: '2026-11-11', horaInicio: '10:00', horaFin: '11:00', responsable: 'Luis', tipoActividad: 'Taller', actividadRecurrente: 'No' },
] as Reservation[];
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('runs the real fuzzy search once per changed search, keeping the same matching reservations', () => {
  const { result } = renderHook(() => useFilteredReservations(rows));
  act(() => result.current.setFilters({ ...INITIAL_FILTERS, search: 'Cerámica' }));
  expect(result.current.filteredReservations.map(r => r.id)).toEqual(['a']);
  vi.mocked(getFuzzyMatchIds).mockClear();
  act(() => result.current.setFilters(previous => ({ ...previous, search: 'Yoga' })));
  expect(result.current.filteredReservations.map(r => r.id)).toEqual(['b']);
  expect(getFuzzyMatchIds).toHaveBeenCalledTimes(1);
});

it('reuses results for equal filter values and invalidates on filters or reservation changes', () => {
  const { result, rerender } = renderHook(({ data }) => useFilteredReservations(data), { initialProps: { data: rows } });
  act(() => result.current.setFilters({ ...INITIAL_FILTERS, search: 'Yoga' }));
  const previous = result.current.filteredReservations;
  vi.mocked(getFuzzyMatchIds).mockClear();
  act(() => result.current.setFilters(current => ({ ...current })));
  expect(result.current.filteredReservations).toBe(previous);
  expect(getFuzzyMatchIds).not.toHaveBeenCalled();
  act(() => result.current.setFilters(current => ({ ...current, espacio: 'SALA 2' })));
  expect(result.current.filteredReservations).toEqual([]);
  act(() => result.current.resetFilters());
  expect(result.current.filteredReservations).toEqual(rows);
  rerender({ data: rows.slice(0, 1) });
  expect(result.current.filteredReservations.map(r => r.id)).toEqual(['a']);
  act(() => result.current.setFilters({ ...INITIAL_FILTERS, fechaDesde: '2026-11-12', fechaHasta: '2026-11-10' }));
  expect(result.current.filteredReservations).toEqual([]);
});
