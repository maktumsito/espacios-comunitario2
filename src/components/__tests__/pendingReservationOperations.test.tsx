// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PendingReservationOperations } from '../PendingReservationOperations';
import type { PendingOperation } from '../../services/reservationWriter';
import type { AuthUser } from '../../services/authService';

const state = vi.hoisted(() => ({ rows: [] as PendingOperation[], read: vi.fn(), resume: vi.fn(), discard: vi.fn() }));
vi.mock('../../services/reservationService', () => ({
  getPendingOperations: () => state.rows, readPendingOperations: state.read,
  resumeReservationOperation: state.resume, discardReservationOperation: state.discard,
}));
const user: AuthUser = { username: 'test', name: 'Test', role: 'Administrador', initials: 'T', avatarColor: 'blue' };
const operation = (id = 'pending'): PendingOperation => ({ id, actor: 'test', reservations: [], deletedIds: ['one'], confirmedIds: [], allowConflictOverride: false });
beforeEach(() => {
  vi.clearAllMocks(); state.rows = [operation()]; state.read.mockImplementation(async () => state.rows);
  state.resume.mockImplementation(async () => { state.rows = []; });
  state.discard.mockImplementation(async () => { state.rows = []; });
});
afterEach(cleanup);

it('removes the banner when resume completes', async () => {
  render(<PendingReservationOperations user={user} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Reanudar eliminación' }));
  await waitFor(() => expect(screen.queryByText(/Eliminación pendiente:/)).toBeNull());
});

it('requires confirmation before discarding, and leaves saved reservations unchanged', async () => {
  render(<PendingReservationOperations user={user} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar pendiente' }));
  expect(state.discard).not.toHaveBeenCalled();
  expect(screen.getByText(/Las reservas ya guardadas se conservan/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(state.discard).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Descartar pendiente' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descartar intento' }));
  await waitFor(() => expect(screen.queryByText(/Eliminación pendiente:/)).toBeNull());
  expect(state.discard).toHaveBeenCalledWith('pending');
  expect(state.resume).not.toHaveBeenCalled();
});

it('keeps the banner and exposes an error when storage cannot be cleared', async () => {
  state.discard.mockRejectedValue(new Error('No se pudo actualizar el registro'));
  render(<PendingReservationOperations user={user} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Descartar pendiente' }));
  fireEvent.click(screen.getByRole('button', { name: 'Descartar intento' }));
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo actualizar');
  expect(screen.getByText(/Eliminación pendiente:/)).toBeTruthy();
});

it('does not restore stale initial rows after a journal change', async () => {
  let resolve!: (rows: PendingOperation[]) => void;
  state.read.mockImplementation(() => new Promise<PendingOperation[]>(done => { resolve = done; }));
  render(<PendingReservationOperations user={user} />);
  const stale = state.rows;
  await act(async () => {
    state.rows = []; window.dispatchEvent(new Event('reservation-operations-changed'));
    resolve(stale);
  });
  expect(screen.queryByText(/Eliminación pendiente:/)).toBeNull();
});

it('hides pending operations owned by another account', async () => {
  state.rows = [{ ...operation(), actor: 'other' }];
  render(<PendingReservationOperations user={user} />);
  await act(async () => {});
  expect(screen.queryByRole('button', { name: 'Reanudar eliminación' })).toBeNull();
});
