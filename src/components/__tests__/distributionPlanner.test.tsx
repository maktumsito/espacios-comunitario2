// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DistributionPlannerModal } from '../DistributionPlannerModal';
import type { AuthUser } from '../../services/authService';
import type { DistributionSnapshot } from '../../types';
import { getChileLocalDateString } from '../../utils/dateUtils';
import { ReservationWriteError } from '../../services/reservationWriter';

const api = vi.hoisted(() => ({ load: vi.fn(), commit: vi.fn() }));
vi.mock('../../services/distributionService', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/distributionService')>(),
  loadDistributionSnapshot: api.load, commitDistribution: api.commit,
}));
const user: AuthUser = { username: 'coordinacion', name: 'Coordinación', role: 'Coordinador', initials: 'CO', avatarColor: 'blue', canCreateReservations: true, canEditReservations: true };
const snapshot: DistributionSnapshot = { fecha: getChileLocalDateString(), loadedAt: new Date().toISOString(), reservations: [], equipment: [], blocks: [],
  spaces: ['SALA 2', 'SALA 3'].map(name => ({ id: name, name, capacity: 20, description: 'Talleres comunitarios', category: 'Salas de Clases', iconName: 'Users', color: '#64748b' })) };
beforeEach(() => {
  localStorage.clear(); api.load.mockReset(); api.commit.mockReset();
  api.load.mockResolvedValue(snapshot);
  api.commit.mockImplementation(async (_date, proposals, _versions, operationId) => ({ operationId, confirmedIds: proposals.map((p: any) => p.reservation.id), pendingIds: [], deletedIds: [], reservations: proposals.map((p: any) => ({ ...p.reservation, version: 1 })) }));
});
afterEach(cleanup);
async function addActivity(description = 'Taller de lectura') {
  await screen.findByRole('button', { name: 'Agregar actividad nueva' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Agregar actividad nueva' }).closest('fieldset[disabled]')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Agregar actividad nueva' }));
  const descriptions = screen.getAllByLabelText('Actividad o necesidad');
  fireEvent.change(descriptions.at(-1)!, { target: { value: description } });
  fireEvent.change(screen.getAllByLabelText('Responsable').at(-1)!, { target: { value: 'Equipo comunitario' } });
}
async function calculate() {
  fireEvent.click(screen.getByRole('button', { name: 'Calcular distribución' }));
  await screen.findByRole('heading', { name: 'Distribución propuesta' });
}
it('reviews the joint proposal before applying it once and clears the successful draft', async () => {
  const committed = vi.fn();
  render(<DistributionPlannerModal user={user} onClose={vi.fn()} onCommitted={committed} />);
  await addActivity(); await addActivity('Taller de escritura');
  expect(api.commit).not.toHaveBeenCalled();
  await calculate();
  expect(screen.getByRole('table')).toBeTruthy();
  expect(screen.getAllByRole('img', { name: /Esquema conceptual/ })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar todo el plan' }));
  await waitFor(() => expect(committed).toHaveBeenCalledOnce());
  expect(api.commit.mock.calls[0][1]).toHaveLength(2);
  expect(Object.values(api.commit.mock.calls[0][2])).toEqual([-1, -1]);
  expect(screen.getByText(/Distribución confirmada: 2 actividades guardadas/)).toBeTruthy();
});
it('keeps the exact operation and payload across lost acknowledgement, closing and reopening', async () => {
  const first = render(<DistributionPlannerModal user={user} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await addActivity(); await calculate();
  api.commit.mockRejectedValueOnce(new Error('Se perdió la confirmación'));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar todo el plan' }));
  await screen.findByRole('button', { name: 'Reintentar confirmación' });
  const original = api.commit.mock.calls[0];
  first.unmount();
  render(<DistributionPlannerModal user={user} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await screen.findByRole('button', { name: 'Reintentar confirmación' });
  expect((screen.getByLabelText('Actividad o necesidad') as HTMLTextAreaElement).disabled || screen.getByLabelText('Actividad o necesidad').closest('fieldset[disabled]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar confirmación' }));
  await waitFor(() => expect(api.commit).toHaveBeenCalledTimes(2));
  expect(api.commit.mock.calls[1]).toEqual(original);
});
it('requires recalculation after a definitive stale-version rejection and keeps the activities', async () => {
  render(<DistributionPlannerModal user={user} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await addActivity(); await calculate();
  api.commit.mockRejectedValueOnce(new ReservationWriteError('La reserva cambió por otro usuario', { operationId: 'stale', reservations: [], pendingIds: [], confirmedIds: [], deletedIds: [] }, undefined, true));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar todo el plan' }));
  await screen.findByRole('alert');
  expect((screen.getByRole('button', { name: 'Aplicar todo el plan' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText('Actividad o necesidad') as HTMLTextAreaElement).value).toBe('Taller de lectura');
});
it('blocks partial plans and never treats a failed read as empty availability', async () => {
  api.load.mockRejectedValueOnce(new Error('Lectura incompleta de la jornada'));
  render(<DistributionPlannerModal user={user} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Agregar actividad nueva' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar lectura de la jornada' }));
  await addActivity();
  fireEvent.change(screen.getByLabelText('Participantes'), { target: { value: '100' } });
  await calculate();
  expect((screen.getByRole('button', { name: 'Aplicar todo el plan' }) as HTMLButtonElement).disabled).toBe(true);
  expect(api.commit).not.toHaveBeenCalled();
});
it('honors revoked permissions and scopes persisted drafts to each account', async () => {
  const first = render(<DistributionPlannerModal user={user} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await addActivity(); await calculate();
  first.rerender(<DistributionPlannerModal user={{ ...user, canCreateReservations: false }} onClose={vi.fn()} onCommitted={vi.fn()} />);
  expect((screen.getByRole('button', { name: 'Aplicar todo el plan' }) as HTMLButtonElement).disabled).toBe(true);
  first.unmount();
  render(<DistributionPlannerModal user={{ ...user, username: 'otro-equipo' }} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await screen.findByRole('button', { name: 'Agregar actividad nueva' });
  expect(screen.queryByLabelText('Actividad o necesidad')).toBeNull();
});

it('requires explicit approval to activate recommended rooms and saves the approved IDs with the plan', async () => {
  const data = { ...snapshot, spaces: [{ ...snapshot.spaces[0], capacity: 5 }, { ...snapshot.spaces[1], capacity: 40, activo: false }] };
  api.load.mockResolvedValue(data);
  render(<DistributionPlannerModal user={user} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await addActivity();
  fireEvent.change(screen.getByLabelText('Participantes'), { target: { value: '30' } });
  await calculate();
  expect(screen.getByLabelText('Recomendaciones de activación')).toBeTruthy();
  expect(api.commit).not.toHaveBeenCalled();
  const apply = screen.getByRole('button', { name: 'Activar y aplicar todo el plan' }) as HTMLButtonElement;
  expect(apply.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo activar los espacios recomendados/ }));
  fireEvent.click(apply);
  await waitFor(() => expect(api.commit).toHaveBeenCalledOnce());
  expect(api.commit.mock.calls[0][4]).toEqual(['SALA 3']);
  expect(data.spaces[1].activo).toBe(false);
});

it('allows reception to review activation recommendations but reserves activation for managers', async () => {
  api.load.mockResolvedValue({ ...snapshot, spaces: [{ ...snapshot.spaces[0], capacity: 5 }, { ...snapshot.spaces[1], capacity: 40, activo: false }] });
  render(<DistributionPlannerModal user={{ ...user, role: 'Recepción' }} onClose={vi.fn()} onCommitted={vi.fn()} />);
  await addActivity();
  fireEvent.change(screen.getByLabelText('Participantes'), { target: { value: '30' } });
  await calculate();
  expect((screen.getByRole('checkbox', { name: /Confirmo activar los espacios recomendados/ }) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Activar y aplicar todo el plan' }) as HTMLButtonElement).disabled).toBe(true);
  expect(api.commit).not.toHaveBeenCalled();
});
