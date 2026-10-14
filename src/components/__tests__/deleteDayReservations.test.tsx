// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DeleteDayReservationsModal } from '../DeleteDayReservationsModal';
import type { Reservation } from '../../types';

const queryDay = vi.hoisted(() => vi.fn());
vi.mock('../../services/reservationService', () => ({ queryReservationsForDayDeletion: queryDay }));
const row: Reservation = { id: 'one', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', tipoActividad: 'Taller', descripcion: '', actividadRecurrente: 'Sí', serieRecurrente: 'series', version: 3 };
beforeEach(() => { vi.clearAllMocks(); queryDay.mockResolvedValue([row, { ...row, id: 'two', espacio: 'SALA 3' }]); });
afterEach(cleanup);

it('shows the complete day count and only deletes the reviewed date after confirmation', async () => {
  const onConfirm = vi.fn().mockResolvedValue(undefined), onClose = vi.fn();
  render(<DeleteDayReservationsModal initialDate={row.fecha} onConfirm={onConfirm} onClose={onClose} />);
  expect(onConfirm).not.toHaveBeenCalled();
  await screen.findByRole('button', { name: 'Eliminar 2 reservas' });
  expect(queryDay).toHaveBeenCalledWith(row.fecha);
  expect(screen.getByText(/2 reservas del 06-10-2026/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar 2 reservas' }));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(row.fecha, [row, { ...row, id: 'two', espacio: 'SALA 3' }]));
});

it('discards a late response after switching dates and disables deletion for an empty day', async () => {
  let resolve!: (rows: Reservation[]) => void;
  queryDay.mockImplementationOnce(() => new Promise<Reservation[]>(done => { resolve = done; })).mockResolvedValueOnce([]);
  const onConfirm = vi.fn();
  render(<DeleteDayReservationsModal initialDate={row.fecha} onConfirm={onConfirm} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Fecha de las reservas'), { target: { value: '2026-10-07' } });
  await screen.findByText('No hay reservas para eliminar el 07-10-2026.');
  await act(async () => { resolve([row]); });
  expect((screen.getByRole('button', { name: 'Eliminar 0 reservas' }) as HTMLButtonElement).disabled).toBe(true);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('keeps deletion disabled on read errors and permits a fresh query', async () => {
  queryDay.mockRejectedValueOnce(new Error('Sin conexión'));
  render(<DeleteDayReservationsModal initialDate={row.fecha} onConfirm={vi.fn()} onClose={vi.fn()} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión');
  expect((screen.getByRole('button', { name: 'Eliminar 0 reservas' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar reservas del día' }));
  await screen.findByRole('button', { name: 'Eliminar 2 reservas' });
});

it('prevents repeat clicks, date changes and closing while deletion is pending', async () => {
  let resolve!: () => void;
  const onConfirm = vi.fn(() => new Promise<void>(done => { resolve = done; })), onClose = vi.fn();
  render(<DeleteDayReservationsModal initialDate={row.fecha} onConfirm={onConfirm} onClose={onClose} />);
  const remove = await screen.findByRole('button', { name: 'Eliminar 2 reservas' });
  fireEvent.click(remove); fireEvent.click(remove);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Fecha de las reservas') as HTMLInputElement).disabled).toBe(true);
  await act(async () => { resolve(); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('requires a new preview after a write error instead of retrying stale IDs', async () => {
  const onConfirm = vi.fn().mockRejectedValue(new Error('Las reservas del día cambiaron.'));
  render(<DeleteDayReservationsModal initialDate={row.fecha} onConfirm={onConfirm} onClose={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar 2 reservas' }));
  expect((await screen.findByRole('alert')).textContent).toContain('cambiaron');
  expect((screen.getByRole('button', { name: 'Eliminar 0 reservas' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar reservas del día' }));
  await screen.findByRole('button', { name: 'Eliminar 2 reservas' });
  expect(queryDay).toHaveBeenCalledTimes(2);
});

it('rejects an empty date without querying or deleting', async () => {
  render(<DeleteDayReservationsModal initialDate="" onConfirm={vi.fn()} onClose={vi.fn()} />);
  expect((await screen.findByRole('alert')).textContent).toContain('fecha válida');
  expect(queryDay).not.toHaveBeenCalled();
});

it('deletes only checked reservations and supports selecting all or none', async () => {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(<DeleteDayReservationsModal initialDate={row.fecha} onConfirm={onConfirm} onClose={vi.fn()} />);
  await screen.findByRole('button', { name: 'Eliminar 2 reservas' });
  fireEvent.click(screen.getAllByRole('checkbox')[1]);
  expect(screen.getByText('1 de 2 reservas seleccionadas')).toBeTruthy();
  expect((screen.getAllByRole('checkbox')[1] as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Deseleccionar todas' }));
  expect((screen.getByRole('button', { name: 'Eliminar 0 reservas' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar todas' }));
  expect(screen.getAllByRole('checkbox').every(checkbox => (checkbox as HTMLInputElement).checked)).toBe(true);
  fireEvent.click(screen.getAllByRole('checkbox')[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar 1 reservas' }));
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(row.fecha, [{ ...row, id: 'two', espacio: 'SALA 3' }]));
});
