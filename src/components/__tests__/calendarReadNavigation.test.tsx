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
