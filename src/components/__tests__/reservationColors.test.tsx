// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarView } from '../CalendarView';
import { ReservationStep1Activity } from '../ReservationStep1Activity';
import { DailyUsageView } from '../DailyUsageView';
import { MobileAgendaView } from '../MobileAgendaView';
import { ReservationVisualsProvider } from '../../contexts/ReservationVisualsContext';
import type { ActivityTypeItem, Reservation } from '../../types';

const types: ActivityTypeItem[] = [
  { id: 'A', name: 'CHARLA', color: '#123456', category: 'General' },
  { id: 'B', name: 'CONVENIO', color: '#abcdef', category: 'General' },
];
const reservation: Reservation = {
  id: 'test', fecha: '2026-10-26', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2',
  responsable: 'Persona', tipoActividad: 'CHARLA', descripcion: 'Yoga', actividadRecurrente: 'No',
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('uses the configured type color in the creation preview, calendar pill and legend and reacts to changes', () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const select = vi.fn();
  const change = vi.fn();
  const view = (activityTypes: ActivityTypeItem[]) => (
    <ReservationVisualsProvider activityTypes={activityTypes} reservations={[reservation]}>
      <ReservationStep1Activity isWizardMode formData={reservation} setFormData={change}
        descriptionValidation={{ isValid: true }} effectiveActivityNames={types.map(item => item.name)} availableActivityTypes={activityTypes} />
      <CalendarView reservations={[reservation]} selectedDate={new Date(2026, 9, 26)}
        onSelectReservation={select} onNewReservationForDate={vi.fn()} />
    </ReservationVisualsProvider>
  );
  const { rerender } = render(view(types));
  const pill = () => screen.getByRole('button', { name: 'Actividad: Yoga a las 10:00 en Sala 2' });
  expect(pill().style.backgroundColor).toBe('rgb(18, 52, 86)');
  const preview = screen.getByText(/Color automático para Charla/);
  expect((preview.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(18, 52, 86)');
  expect((screen.getByText('Charla', { selector: 'div > span' }).previousElementSibling as HTMLElement).style.backgroundColor).toBe('rgb(18, 52, 86)');
  fireEvent.change(screen.getByLabelText('Categoría y Tipo de Préstamo *'), { target: { value: 'CONVENIO' } });
  expect(change).toHaveBeenCalledOnce();
  fireEvent.click(pill());
  expect(select).toHaveBeenCalledExactlyOnceWith(reservation);
  rerender(view([{ ...types[0], color: '#654321' }, types[1]]));
  expect(pill().style.backgroundColor).toBe('rgb(101, 67, 33)');
  expect((preview.firstElementChild as HTMLElement).style.backgroundColor).toBe('rgb(101, 67, 33)');
});

it('uses the same type color in the daily matrix and mobile agenda', () => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1200);
  const { container } = render(
    <ReservationVisualsProvider activityTypes={types} reservations={[reservation]}>
      <DailyUsageView reservations={[reservation]} selectedDate={new Date(2026, 9, 26)}
        conflictReservationIds={new Set()} onSelectReservation={vi.fn()} onNewReservationWithSlot={vi.fn()} />
      <MobileAgendaView reservations={[reservation]} spaces={[]} selectedDate={new Date(2026, 9, 26)}
        onDateChange={vi.fn()} onSelectReservation={vi.fn()} onEditReservation={vi.fn()} />
    </ReservationVisualsProvider>
  );
  const daily = container.querySelector<HTMLElement>('[data-reservation-id="test"]')!;
  const mobile = container.querySelector<HTMLElement>('#mobile-reservation-card-test > div')!;
  expect(daily).toBeTruthy();
  expect(mobile).toBeTruthy();
  expect(daily.style.borderLeftColor).toBe('rgb(18, 52, 86)');
  expect(mobile.style.backgroundColor).toBe(daily.style.borderLeftColor);
});
