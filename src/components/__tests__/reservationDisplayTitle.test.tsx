// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalendarView } from '../CalendarView';
import { ReservationDetailModal } from '../ReservationDetailModal';
import { ReservationStep5Review } from '../ReservationStep5Review';
import type { Reservation } from '../../types';

const reservation: Reservation = Object.freeze({
  id: 'reservation_TEST', fecha: '2026-10-14', espacio: 'SALA 2', horaInicio: '10:00', horaFin: '11:00',
  responsable: 'mARÍA DE los áNGELES', tipoActividad: 'TALLER CCD', descripcion: 'tALLER de DANZA áRABE',
  tipoPrestamo: 'PRÉSTAMO VECINAL', actividadRecurrente: 'No', emailContacto: 'vecino.prueba@ejemplo.cl',
});
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

it('formats calendar titles, tooltips and accessible labels while selecting the original record', () => {
  const select = vi.fn();
  render(<CalendarView reservations={[reservation]} selectedDate={new Date(2026, 9, 14)} onSelectReservation={select}
    onNavigateToDay={vi.fn()} onNewReservationForDate={vi.fn()} />);
  const booking = screen.getByRole('button', { name: 'Actividad: Taller De Danza Árabe a las 10:00 en Sala 2' });
  fireEvent.mouseEnter(booking);
  expect(screen.getByText('María De Los Ángeles')).toBeTruthy();
  expect(screen.getByText('Taller Ccd')).toBeTruthy();
  fireEvent.click(booking);
  expect(select).toHaveBeenCalledExactlyOnceWith(reservation);
  expect(reservation.descripcion).toBe('tALLER de DANZA áRABE');
  expect(reservation.espacio).toBe('SALA 2');
});

it('formats reservation detail text without modifying identifiers or email addresses', () => {
  render(<ReservationDetailModal isOpen reservation={reservation} onClose={vi.fn()} onEdit={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Taller De Danza Árabe' })).toBeTruthy();
  expect(screen.getByText('María De Los Ángeles')).toBeTruthy();
  expect(screen.getByText('Préstamo Vecinal')).toBeTruthy();
  expect(screen.getByText('Sala 2').className).not.toContain('uppercase');
  expect(reservation.id).toBe('reservation_TEST');
  expect(reservation.emailContacto).toBe('vecino.prueba@ejemplo.cl');
});

it('formats the review summary without changing the draft or step navigation', () => {
  const goToStep = vi.fn();
  render(<ReservationStep5Review isWizardMode wizardStep={5} formData={reservation} bookingMode="single"
    specificDates={[]} generatedDates={[]} enableSingleSecondSpace={false} conflicts={[]} candidateConflictDates={[]}
    onGoToStep={goToStep} descargarCartaAlCrear={false} />);
  expect(screen.getByText('Taller De Danza Árabe')).toBeTruthy();
  expect(screen.getByText('Sala 2')).toBeTruthy();
  expect(screen.getByText('María De Los Ángeles')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: 'Modificar' })[0]);
  expect(goToStep).toHaveBeenCalledExactlyOnceWith(1);
  expect(reservation.responsable).toBe('mARÍA DE los áNGELES');
});
