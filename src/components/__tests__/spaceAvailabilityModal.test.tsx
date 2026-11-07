// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SpaceAvailabilityModal } from '../SpaceAvailabilityModal';
import type { DistributionSnapshot, SpaceInfo } from '../../types';

const loadSnapshot = vi.hoisted(() => vi.fn());
vi.mock('../../services/distributionService', () => ({ loadDistributionSnapshot: loadSnapshot }));
afterEach(() => { cleanup(); loadSnapshot.mockReset(); vi.restoreAllMocks(); });
const space: SpaceInfo = { id: '2', name: 'SALA 2', category: 'General', description: '', iconName: '', color: '' };

it('loads all rooms together, retries failed reads, and passes the chosen date and times to the reservation form', async () => {
  const date = '2099-11-10';
  loadSnapshot.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue({
    fecha: date, spaces: [space, { ...space, id: '3', name: 'SALA 3' }], reservations: [], blocks: [],
  });
  const onReserve = vi.fn();
  render(<SpaceAvailabilityModal initialDate={date} onClose={vi.fn()} onReserve={onReserve} />);

  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: /^Reservar/ })).toBeNull();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Imprimir' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Reservar SALA 2 de 08:30–22:00' }));
  expect(screen.getByRole('button', { name: 'Reservar SALA 3 de 08:30–22:00' })).toBeTruthy();
  expect(onReserve).toHaveBeenCalledWith({ date, space: 'SALA 2', startTime: '08:30', endTime: '22:00' });
  expect(loadSnapshot).toHaveBeenCalledTimes(2);
});

it('keeps the new date visible if a previous request finishes late', async () => {
  let finishFirst!: (snapshot: DistributionSnapshot) => void;
  loadSnapshot.mockImplementationOnce(() => new Promise<DistributionSnapshot>(resolve => { finishFirst = resolve; }))
    .mockResolvedValueOnce({ fecha: '2099-11-11', spaces: [space], reservations: [], blocks: [], equipment: [] });
  render(<SpaceAvailabilityModal initialDate="2099-11-10" onClose={vi.fn()} />);

  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '11/11/2099' } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar' }));
  await screen.findByText('08:30–22:00');
  await act(async () => finishFirst({ fecha: '2099-11-10', loadedAt: '', spaces: [], reservations: [], blocks: [], equipment: [] }));
  expect(screen.getByText('08:30–22:00')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Reservar/ })).toBeNull();
});

it('includes both ends of the range and prefills the day of the selected slot', async () => {
  const start = '2099-11-10';
  const end = '2099-11-12';
  loadSnapshot.mockResolvedValue({ fecha: start, spaces: [space], reservations: [], blocks: [] });
  const onReserve = vi.fn();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  render(<SpaceAvailabilityModal initialDate={start} onClose={vi.fn()} onReserve={onReserve} />);
  await screen.findByRole('region', { name: 'Martes, 10-11-2099' });
  const until = screen.getByLabelText('Hasta');
  const consult = screen.getByRole<HTMLButtonElement>('button', { name: 'Consultar' });
  const printButton = screen.getByRole<HTMLButtonElement>('button', { name: 'Imprimir' });
  fireEvent.change(until, { target: { value: '09/11/2099' } });
  expect(consult.disabled).toBe(true);
  expect(printButton.disabled).toBe(true);
  fireEvent.change(until, { target: { value: '11/12/2099' } });
  expect(consult.disabled).toBe(true);
  fireEvent.change(until, { target: { value: '12/11/2099' } });
  fireEvent.click(consult);

  const lastDay = await screen.findByRole('region', { name: 'Jueves, 12-11-2099' });
  expect(screen.getByRole('region', { name: 'Martes, 10-11-2099' })).toBeTruthy();
  expect(screen.getByRole('region', { name: 'Miércoles, 11-11-2099' })).toBeTruthy();
  fireEvent.click(printButton);
  expect(print).toHaveBeenCalledOnce();
  expect(screen.getByText(/10-11-2099 al 12-11-2099/)).toBeTruthy();
  fireEvent.click(within(lastDay).getByRole('button', { name: 'Reservar SALA 2 de 08:30–22:00' }));
  expect(onReserve).toHaveBeenCalledWith({ date: end, space: 'SALA 2', startTime: '08:30', endTime: '22:00' });
  expect(loadSnapshot).toHaveBeenCalledTimes(2);
  expect(loadSnapshot).toHaveBeenLastCalledWith(start, expect.any(AbortSignal), end);
});
