// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalendarView } from '../CalendarView';
import { MobileAgendaView } from '../MobileAgendaView';
import type { Reservation, SpaceInfo } from '../../types';

afterEach(cleanup);
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
const row: Reservation = { id: 'hidden-space-reservation', fecha: '2026-10-15', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', descripcion: 'Taller de sala desactivada', responsable: 'Equipo comunitario', tipoActividad: 'TALLER CCD', actividadRecurrente: 'No' };
const room: SpaceInfo = { id: 'SALA 2', name: 'SALA 2', category: 'General', iconName: 'Layers', color: '#0284c7', description: '' };
it('hides inactive-space events in the monthly calendar and restores them without changing reservations', () => {
  const props = { reservations: [row], selectedDate: new Date(2026, 9, 15), onSelectReservation: vi.fn(), onNewReservationForDate: vi.fn() };
  const { rerender } = render(<CalendarView {...props} spaces={[{ ...room, activo: false }]} />);
  expect(screen.queryByRole('button', { name: /Actividad: Taller De Sala Desactivada/ })).toBeNull();
  rerender(<CalendarView {...props} spaces={[room]} />);
  expect(screen.getByRole('button', { name: /Actividad: Taller De Sala Desactivada/ })).toBeTruthy();
  expect(row.espacio).toBe('SALA 2');
});
it('hides inactive-space events and options in the mobile agenda', () => {
  const props = { reservations: [row], selectedDate: new Date(2026, 9, 15), onDateChange: vi.fn(), onSelectReservation: vi.fn(), onEditReservation: vi.fn() };
  const { rerender } = render(<MobileAgendaView {...props} spaces={[{ ...room, activo: false }]} />);
  expect(screen.queryByText('Taller De Sala Desactivada')).toBeNull();
  expect(screen.queryByRole('option', { name: /Sala 2/i })).toBeNull();
  rerender(<MobileAgendaView {...props} spaces={[room]} />);
  expect(screen.getByText('Taller De Sala Desactivada')).toBeTruthy();
});
