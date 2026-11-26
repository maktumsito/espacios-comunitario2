// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalendarView } from '../CalendarView';
import { MobileAgendaView } from '../MobileAgendaView';
import { DailyUsageView } from '../DailyUsageView';
import { GlobalCommandPalette } from '../GlobalCommandPalette';
import { AnalyticsView } from '../AnalyticsView';
import { PrintScheduleModal } from '../PrintScheduleModal';
import { findAlternativeFreeSpaces } from '../../utils/conflictRecommender';
import type { Reservation, SpaceInfo } from '../../types';

vi.mock('../D3AnalyticsCharts', () => ({
  D3SpaceBarChart: () => null,
  D3ActivityDonutChart: () => null,
  D3HourlyOccupancyChart: () => null,
}));

afterEach(cleanup);
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
const row: Reservation = { id: 'hidden-space-reservation', fecha: '2026-10-15', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', descripcion: 'Taller de sala desactivada', responsable: 'Equipo comunitario', tipoActividad: 'TALLER CCD', actividadRecurrente: 'No' };
const room: SpaceInfo = { id: 'SALA 2', name: 'SALA 2', category: 'General', iconName: 'Layers', color: '#0284c7', description: '' };
const customActiveRoom: SpaceInfo = { id: 'AUDIO_VIDEO', name: 'SALA AUDIO / VIDEO', category: 'Especiales', iconName: 'Layers', color: '#7c3aed', description: '', activo: true };
const inactiveRoom: SpaceInfo = { id: 'BOX_1', name: 'BOX 1', category: 'Especiales', iconName: 'Layers', color: '#dc2626', description: '', activo: false };

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
it('shows all activated spaces immediately in DailyUsageView, including standalone rooms with "/" in their name', () => {
  const { container, rerender } = render(
    <DailyUsageView
      reservations={[]}
      spaces={[room, inactiveRoom, customActiveRoom]}
      selectedDate={new Date(2026, 9, 15)}
      conflictReservationIds={new Set()}
      onSelectReservation={vi.fn()}
      onNewReservationWithSlot={vi.fn()}
    />
  );
  const headers = () => Array.from(container.querySelectorAll('[title$="(orden fijo)"]')).map(el => el.textContent);
  expect(headers()).toEqual(['SALA 2', 'SALA AUDIO / VIDEO']);
  rerender(
    <DailyUsageView
      reservations={[]}
      spaces={[room, { ...inactiveRoom, activo: true }, customActiveRoom]}
      selectedDate={new Date(2026, 9, 15)}
      conflictReservationIds={new Set()}
      onSelectReservation={vi.fn()}
      onNewReservationWithSlot={vi.fn()}
    />
  );
  expect(headers()).toEqual(['SALA 2', 'BOX 1', 'SALA AUDIO / VIDEO']);
});
it('excludes deactivated spaces from conflict recommendations and includes custom active spaces', () => {
  const recs = findAlternativeFreeSpaces(
    '2026-10-15', 600, 660, 'SALA 2', [], 10, undefined,
    { customSpacesList: [room, inactiveRoom, customActiveRoom] }
  );
  expect(recs.map(r => r.espacio)).toEqual(['SALA AUDIO / VIDEO']);
});
it('excludes deactivated spaces from GlobalCommandPalette search results', () => {
  render(
    <GlobalCommandPalette
      isOpen
      onClose={vi.fn()}
      reservations={[]}
      spaces={[room, inactiveRoom, customActiveRoom]}
      onSelectReservation={vi.fn()}
      onNavigateToView={vi.fn()}
      onNewReservation={vi.fn()}
    />
  );
  fireEvent.change(screen.getByLabelText('Buscar reservas y comandos'), { target: { value: 'BOX 1' } });
  expect(screen.queryByText('Box 1')).toBeNull();
});
it('hides unused deactivated spaces in AnalyticsView while preserving deactivated spaces with historical bookings', () => {
  render(
    <AnalyticsView
      reservations={[{ ...row, espacio: 'SALA 2' }]}
      spaces={[{ ...room, activo: false }, inactiveRoom, customActiveRoom]}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Lista / Barras Simples' }));
  const listCard = screen.getByRole('heading', { name: 'Uso y Demanda por Espacio' }).closest('.rounded-2xl') as HTMLElement;
  expect(within(listCard).getByText('SALA 2')).toBeTruthy();
  expect(within(listCard).getByText('SALA AUDIO / VIDEO')).toBeTruthy();
  expect(within(listCard).queryByText('BOX 1')).toBeNull();
});
it('excludes deactivated spaces from PrintScheduleModal even when showing all spaces', () => {
  render(
    <PrintScheduleModal
      isOpen
      onClose={vi.fn()}
      reservations={[]}
      spaces={[room, inactiveRoom, customActiveRoom]}
      initialDate="2026-10-15"
    />
  );
  fireEvent.click(screen.getByLabelText(/Solo espacios con reservas/i));
  const report = document.getElementById('printable-schedule-report')!;
  expect(within(report).getByText(/Sala 2/i)).toBeTruthy();
  expect(within(report).getByText(/Sala Audio \/ Video/i)).toBeTruthy();
  expect(within(report).queryByText(/Box 1/i)).toBeNull();
});
