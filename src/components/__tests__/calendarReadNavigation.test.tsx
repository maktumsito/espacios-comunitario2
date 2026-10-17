// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarView } from '../CalendarView';

afterEach(cleanup);
it('reports month navigation to the subscription owner and preserves historical loading for editors', () => {
  const onMonth = vi.fn(), onHistory = vi.fn().mockResolvedValue([]);
  render(<CalendarView reservations={[]} selectedDate={new Date(2025, 9, 7)}
    onVisibleMonthChange={onMonth} onLoadHistoricalMonth={onHistory}
    onSelectReservation={vi.fn()} onNewReservationForDate={vi.fn()} />);
  expect(onHistory).toHaveBeenCalledWith(2025, 10);
  fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));
  expect(onMonth.mock.calls.at(-1)?.[0].getMonth()).toBe(10);
  expect(onHistory).toHaveBeenCalledWith(2025, 11);
  fireEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
  expect(onMonth.mock.calls.at(-1)?.[0].getMonth()).toBe(9);
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la fecha de hoy' }));
  expect(onMonth.mock.calls.at(-1)?.[0].getFullYear()).toBe(new Date().getFullYear());
});


it('shares the selected day with other agenda presentations without navigating away', () => {
  const selected = vi.fn(), navigate = vi.fn();
  render(<CalendarView reservations={[]} selectedDate={new Date(2026, 9, 17)}
    onSelectedDateChange={selected} onNavigateToDay={navigate}
    onSelectReservation={vi.fn()} onNewReservationForDate={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /^Día 19 octubre 2026:/ }));
  expect(selected.mock.calls[0][0]).toEqual(new Date(2026, 9, 19));
  expect(navigate).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Día 19 octubre 2026: 0 actividades' }).getAttribute('aria-pressed')).toBe('true');
});
