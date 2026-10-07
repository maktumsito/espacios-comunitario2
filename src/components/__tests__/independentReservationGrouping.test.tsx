// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ allowed: true, rows: [] as any[], apply: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: () => 'reservas',
  getDocsFromServer: async () => ({ docs: state.rows.map(row => ({ id: row.id, data: () => row })) }),
  doc: vi.fn(), runTransaction: vi.fn(),
}));
vi.mock('../../firebase/config', () => ({ getDb: () => ({}) }));
vi.mock('../../services/authService', () => ({ getStoredAuthUser: () => ({ name: 'Solicitante' }), userCanEditReservations: () => state.allowed }));
vi.mock('../../services/migrations/groupIndependentReservations', async importOriginal => ({
  ...await importOriginal<any>(), applyIndependentReservationGroup: state.apply,
}));
import { IndependentReservationGrouping } from '../IndependentReservationGrouping';
beforeEach(() => {
  state.allowed = true; state.apply.mockReset().mockResolvedValue(true);
  state.rows = ['2099-10-06', '2099-10-13'].map((fecha, index) => ({ id: `row-${index}`, fecha, horaInicio: '10:00', horaFin: '11:00',
    espacio: 'SALA 2', descripcion: 'Taller semanal', actividadRecurrente: 'No', estado: 'activa' }));
});
afterEach(cleanup);
it('previews matching sessions and groups them only when the action is chosen', async () => {
  render(<IndependentReservationGrouping />);
  fireEvent.click(screen.getByText('Buscar reservas para agrupar'));
  await screen.findByText('1 grupos · 2 reservas');
  expect(state.apply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Agrupar las reservas detectadas'));
  await screen.findByText(/Agrupación completada: 1 series/);
  expect(state.apply).toHaveBeenCalledWith({}, expect.objectContaining({ reservations: state.rows }), 'Solicitante');
});
it('requires edit permission and reports a failed save without losing the preview', async () => {
  render(<IndependentReservationGrouping />);
  fireEvent.click(screen.getByText('Buscar reservas para agrupar'));
  await screen.findByText('Agrupar las reservas detectadas');
  state.allowed = false;
  fireEvent.click(screen.getByText('Agrupar las reservas detectadas'));
  await screen.findByText(/Debes iniciar sesión/);
  expect(state.apply).not.toHaveBeenCalled();
  state.allowed = true; state.apply.mockRejectedValue(new Error('La reserva cambió'));
  fireEvent.click(screen.getByText('Agrupar las reservas detectadas'));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('La reserva cambió'));
  expect(screen.getByText('Agrupar las reservas detectadas')).toBeTruthy();
});
