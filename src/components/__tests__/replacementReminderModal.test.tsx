// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReplacementReminderModal } from '../ReplacementReminderModal';
import type { Reservation } from '../../types';
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('../../services/reservationService', () => ({ fetchReservationById: mocks.fetch }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const replacement: Reservation = { id: 'new', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', descripcion: 'Reunión excepcional', tipoActividad: 'Reunión', actividadRecurrente: 'No', estado: 'activa', reemplazaReservaId: 'original', motivoReemplazo: 'Reunión de vecinos' };
const original = { ...replacement, id: 'original', descripcion: 'Taller semanal', estado: 'cancelada' };
it('shows both activities, their schedule and reason, and lets the user acknowledge or view details', () => {
  const acknowledge = vi.fn(); const view = vi.fn();
  render(<ReplacementReminderModal replacement={replacement} original={original} pendingCount={2} onAcknowledge={acknowledge} onViewActivity={view} />);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByText('Taller Semanal')).toBeTruthy();
  expect(screen.getByText('Reunión Excepcional')).toBeTruthy();
  expect(screen.getByText('Reunión de vecinos', { exact: false })).toBeTruthy();
  expect(screen.getByText(/10:00–11:00/)).toBeTruthy();
  fireEvent.click(screen.getByText('Ver actividad')); expect(view).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('Entendido')); expect(acknowledge).toHaveBeenCalledOnce();
});
it('loads the original when it is not present in the current agenda', async () => {
  mocks.fetch.mockResolvedValue(original);
  render(<ReplacementReminderModal replacement={replacement} pendingCount={1} onAcknowledge={vi.fn()} onViewActivity={vi.fn()} />);
  await waitFor(() => expect(screen.getByText('Taller Semanal')).toBeTruthy());
  expect(mocks.fetch).toHaveBeenCalledWith('original');
});
