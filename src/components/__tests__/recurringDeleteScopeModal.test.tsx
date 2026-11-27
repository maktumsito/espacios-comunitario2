// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RecurringDeleteScopeModal } from '../RecurringDeleteScopeModal';
import type { Reservation } from '../../types';
const query = vi.hoisted(() => vi.fn());
vi.mock('../../services/reservationService', () => ({ queryReservationsBySeries: query }));
const row = { id: 'anchor', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', tipoActividad: 'Taller', actividadRecurrente: 'Sí', estado: 'activa', serieRecurrente: 'series', version: 2 } as Reservation;
const rows = [{ ...row, id: 'past', fecha: '2026-09-01' }, row, { ...row, id: 'same-day', horaInicio: '15:00' }, { ...row, id: 'future', fecha: '2026-12-01', serieRecurrente: undefined, recurrenteId: 'series' }];
beforeEach(() => { vi.clearAllMocks(); query.mockResolvedValue(rows); });
afterEach(cleanup);
it.each([
  ['Solo esta fecha', ['anchor']],
  ['Esta fecha y las siguientes', ['anchor', 'same-day', 'future']],
  ['Toda la serie', ['past', 'anchor', 'same-day', 'future']]
])('confirms the exact selection for %s', async (label, ids) => {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn();
  render(<RecurringDeleteScopeModal reservation={row} onClose={close} canDelete onConfirm={onConfirm} />);
  await waitFor(() => expect((screen.getByLabelText(/Solo esta fecha/i) as HTMLInputElement).disabled).toBe(false));
  expect((screen.getByLabelText(/Solo esta fecha/i) as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByLabelText(new RegExp(`^${label}`)));
  const expectedBtn = ids.length === 1 ? 'Eliminar esta fecha' : `Eliminar ${ids.length} reservas`;
  fireEvent.click(screen.getByRole('button', { name: expectedBtn }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  expect(onConfirm.mock.calls[0][2].map((r: Reservation) => r.id)).toEqual(ids);
});
it('keeps errors visible, prevents double submission and allows refresh and retry', async () => {
  let reject!: (error: Error) => void;
  const onConfirm = vi.fn().mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
  const close = vi.fn();
  render(<RecurringDeleteScopeModal reservation={row} onClose={close} canDelete onConfirm={onConfirm} />);
  const confirm = screen.getByRole('button', { name: /Eliminar/i });
  await waitFor(() => expect((confirm as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  expect(onConfirm).toHaveBeenCalledTimes(1);
  reject(new Error('Las reservas cambiaron.'));
  await screen.findByRole('alert');
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar consulta' }));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Eliminar esta fecha' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar esta fecha' }));
  await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
});
it('cancels without submitting and reports a failed series query', async () => {
  query.mockRejectedValue(new Error('offline'));
  const onConfirm = vi.fn(), close = vi.fn();
  render(<RecurringDeleteScopeModal reservation={row} onClose={close} canDelete={false} onConfirm={onConfirm} />);
  await screen.findByRole('alert');
  expect((screen.getByRole('button', { name: /Solicitar eliminación/i }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('keeps a pending scoped approval open when a version conflict is reported', async () => {
  const { PendingDeletionsModal } = await import('../PendingDeletionsModal');
  const requested = { ...row, solicitudEliminacion: {
    solicitadoPor: 'personal', fechaSolicitud: '2026-10-06T12:00:00Z', esSerie: true,
    alcance: 'future' as const, fechaDesde: row.fecha,
    seleccion: [{ id: row.id, version: 2 }, { id: 'future', version: 2 }]
  } };
  const approve = vi.fn().mockRejectedValue(new Error('Las reservas cambiaron.'));
  render(<PendingDeletionsModal isOpen onClose={vi.fn()} pendingReservations={[requested]}
    onAuthorizeDelete={approve} onRejectDeleteRequest={vi.fn()} onSelectReservation={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Autorizar y Eliminar' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(dialog.textContent).toContain('2 reservas');
  fireEvent.click(Array.from(dialog.querySelectorAll('button')).find(button => button.textContent?.includes('Autorizar y Eliminar'))!);
  await screen.findByText('Las reservas cambiaron.');
  expect(screen.getByRole('alertdialog')).toBeTruthy();
});
