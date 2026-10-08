// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AdminView } from '../AdminView';
import { saveEquipmentItem } from '../../services/equipmentService';

vi.mock('../../services/authService', async original => ({
  ...await original<typeof import('../../services/authService')>(), getAllAuthorizedUsers: () => [],
}));
vi.mock('../../services/equipmentService', () => ({ getStoredEquipment: () => [], saveEquipmentItem: vi.fn(), deleteEquipmentItem: vi.fn(), resetEquipmentToDefaults: vi.fn() }));

const operator = { username: 'operator', name: 'Operador de prueba', role: 'Coordinador', passwordHash: 'fixture-password', initials: 'OP', avatarColor: 'bg-blue-600' };
function props(overrides: Partial<ComponentProps<typeof AdminView>> = {}): ComponentProps<typeof AdminView> {
  return {
    spaces: [
      { id: 'a', name: 'SALA A', category: 'General', iconName: 'Layers', color: '#0284c7', description: '' },
      { id: 'b', name: 'SALA B', category: 'General', iconName: 'Layers', color: '#2563eb', description: '' },
    ],
    loanTypes: [], activityTypes: [], users: [operator],
    equipmentList: [{ id: 'projector', name: 'Proyector', category: 'Audiovisual', totalQuantity: 2, iconName: 'Package' }],
    currentUser: { username: 'admin-test', name: 'Administrador de prueba', role: 'Administrador', initials: 'AD', avatarColor: 'bg-blue-600' },
    onSaveSpace: vi.fn(), onDeleteSpace: vi.fn(), onSaveLoanType: vi.fn(), onDeleteLoanType: vi.fn(),
    onSaveActivityType: vi.fn(), onDeleteActivityType: vi.fn(), onResetDefaults: vi.fn(),
    ...overrides,
  };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
function form() { return screen.getByRole('dialog').querySelector('form')!; }
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(cleanup);

it.each([
  { tab: 'spaces' as const, open: 'Crear Nuevo Espacio', placeholder: 'Ej: SALA 7, SALA MULTIUSO COMUNITARIA', save: 'onSaveSpace' as const, message: 'Por favor, ingresa el nombre del espacio.' },
  { tab: 'activities' as const, open: 'Crear Tipo de Actividad / Préstamo', placeholder: 'Ej: TALLER DE DANZA, PRÉSTAMO VECINAL, CONVENIO MUNICIPAL', save: 'onSaveActivityType' as const, message: 'Por favor, ingresa el nombre de la actividad o préstamo.' },
  { tab: 'equipment' as const, open: 'Nuevo Equipamiento', placeholder: 'Ej: Data Show HD, Telón Móvil, Set de Colchonetas, Micrófono', save: 'onSaveEquipment' as const, message: 'Por favor, ingresa el nombre del equipamiento.' },
])('preserves validation, draft and retry for $tab', async ({ tab, open, placeholder, save, message }) => {
  const write = vi.fn().mockRejectedValueOnce(new Error('Servidor rechazó el guardado')).mockResolvedValue(undefined);
  render(<AdminView {...props({ initialTab: tab, [save]: write })} />);
  fireEvent.click(screen.getByRole('button', { name: open }));
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: '   ' } });
  fireEvent.submit(form());
  expect(screen.getByText(message)).toBeTruthy();
  expect(write).not.toHaveBeenCalled();
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value: '  Nombre conservado  ' } });
  fireEvent.submit(form());
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Servidor rechazó el guardado'));
  expect((screen.getByPlaceholderText(placeholder) as HTMLInputElement).value).toBe('  Nombre conservado  ');
  expect(screen.queryByText('Guardando y esperando confirmación…')).toBeNull();
  fireEvent.submit(form());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(write).toHaveBeenCalledTimes(2);
  expect(write.mock.calls[0][0]).toEqual(write.mock.calls[1][0]);
  expect(write.mock.calls[1][0].name).toBe(tab === 'equipment' ? 'Nombre conservado' : 'NOMBRE CONSERVADO');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('blocks simultaneous submissions and stock changes until the original save confirms', async () => {
  const pending = deferred();
  const save = vi.fn().mockReturnValue(pending.promise);
  render(<AdminView {...props({ initialTab: 'equipment', onSaveEquipment: save })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo Equipamiento' }));
  fireEvent.change(screen.getByPlaceholderText('Ej: Data Show HD, Telón Móvil, Set de Colchonetas, Micrófono'), { target: { value: 'Proyector nuevo' } });
  const submittedForm = form();
  expect(fireEvent.submit(submittedForm)).toBe(false);
  expect(fireEvent.submit(submittedForm)).toBe(false);
  fireEvent.click(screen.getByTitle('Aumentar stock'));
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Guardando y esperando confirmación…')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
  await act(async () => pending.resolve());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByTitle('Aumentar stock'));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1][0]).toMatchObject({ id: 'projector', totalQuantity: 3 });
});

it('confirms both activity and loan catalogue writes in order and retains the form if the second fails', async () => {
  const pending = deferred();
  const saveActivity = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
  const saveLoan = vi.fn().mockRejectedValueOnce(new Error('Préstamo rechazado')).mockResolvedValue(undefined);
  render(<AdminView {...props({ initialTab: 'activities', onSaveActivityType: saveActivity, onSaveLoanType: saveLoan })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Crear Tipo de Actividad / Préstamo' }));
  fireEvent.change(screen.getByPlaceholderText('Ej: TALLER DE DANZA, PRÉSTAMO VECINAL, CONVENIO MUNICIPAL'), { target: { value: 'Taller vecinal' } });
  fireEvent.submit(form());
  expect(saveLoan).not.toHaveBeenCalled();
  await act(async () => pending.resolve());
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Préstamo rechazado'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.submit(form());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(saveActivity).toHaveBeenCalledTimes(2);
  expect(saveLoan).toHaveBeenCalledTimes(2);
  expect(saveLoan.mock.calls[1][0]).toMatchObject({ id: saveActivity.mock.calls[1][0].id, name: 'TALLER VECINAL', defaultDurationMinutes: 120 });
});

it('keeps equipment deletion pending on rejection and allows one confirmed retry', async () => {
  const pending = deferred();
  const remove = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
  render(<AdminView {...props({ initialTab: 'equipment', onDeleteEquipment: remove })} />);
  fireEvent.click(screen.getByTitle('Eliminar equipamiento'));
  const dialog = screen.getByRole('dialog');
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
  expect(remove).toHaveBeenCalledExactlyOnceWith('projector');
  await act(async () => pending.reject(new Error('Eliminación rechazada')));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toBe('Eliminación rechazada');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(remove).toHaveBeenCalledTimes(2);
});

it('preserves drag/drop ordering and prevents concurrent reorder requests', async () => {
  localStorage.setItem('allow_reorder_spaces', 'true');
  const pending = deferred();
  const reorder = vi.fn().mockReturnValue(pending.promise);
  const { container } = render(<AdminView {...props({ onReorderSpaces: reorder })} />);
  const cards = container.querySelectorAll('[draggable="true"]');
  const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
  fireEvent.dragStart(cards[0], { dataTransfer });
  expect(fireEvent.drop(cards[1], { dataTransfer })).toBe(false);
  expect(fireEvent.drop(cards[1], { dataTransfer })).toBe(false);
  expect(reorder).toHaveBeenCalledTimes(1);
  expect(reorder.mock.calls[0][0].map((space: { id: string }) => space.id)).toEqual(['b', 'a']);
  await act(async () => pending.resolve());
  expect(screen.queryByText('Guardando y esperando confirmación…')).toBeNull();
});

it('keeps user-save authorization and entered values when the role changes', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const initial = props({ initialTab: 'users', onSaveUser: save });
  const { rerender } = render(<AdminView {...initial} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Crear Nuevo Usuario' })[0]);
  fireEvent.change(screen.getByPlaceholderText('Ej: Carla Morales, Roberto Lagos'), { target: { value: 'Usuario nuevo' } });
  rerender(<AdminView {...initial} currentUser={{ ...initial.currentUser!, role: 'Gestión' }} />);
  fireEvent.submit(form());
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText(/Permiso denegado: Solo usuarios Administradores/)).toBeTruthy();
  rerender(<AdminView {...initial} />);
  fireEvent.submit(form());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toMatchObject({ name: 'Usuario nuevo', username: 'usuario nuevo', initials: 'UN' });
});

it('retains the managed confirmation when user deletion is declined by the server', async () => {
  const remove = vi.fn().mockResolvedValue({ success: false, message: 'Usuario protegido' });
  render(<AdminView {...props({ initialTab: 'users', onDeleteUser: remove })} />);
  fireEvent.click(screen.getByTitle('Eliminar usuario'));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
  await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());
  expect(screen.getByText('Usuario protegido')).toBeTruthy();
  expect(remove).toHaveBeenCalledExactlyOnceWith('operator');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.getByText('Operador de prueba')).toBeTruthy();
});

it('preserves arrow-based ordering and retries after a rejected reorder', async () => {
  localStorage.setItem('allow_reorder_spaces', 'true');
  const reorder = vi.fn().mockRejectedValueOnce(new Error('Orden rechazado')).mockResolvedValue(undefined);
  render(<AdminView {...props({ onReorderSpaces: reorder })} />);
  fireEvent.click(screen.getAllByTitle('Bajar orden')[0]);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Orden rechazado'));
  fireEvent.click(screen.getAllByTitle('Bajar orden')[0]);
  await waitFor(() => expect(reorder).toHaveBeenCalledTimes(2));
  expect(reorder.mock.calls[1][0].map((space: { id: string }) => space.id)).toEqual(['b', 'a']);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

it('keeps individual permission changes pending, reports rejection and allows retry', async () => {
  const pending = deferred();
  const save = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
  const currentUser = { ...props().currentUser!, username: 'cristian shute', isMasterAdmin:true, name: 'Titular de prueba' };
  render(<AdminView {...props({ initialTab: 'users', currentUser, onSaveUser: save })} />);
  const toggle = screen.getAllByTitle('Haz clic para activar o desactivar este permiso')[0];
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]).toEqual([expect.objectContaining({ username: 'operator', canCreateReservations: false }), 'operator']);
  await act(async () => pending.reject(new Error('Permiso rechazado')));
  expect(screen.getByRole('alert').textContent).toBe('Permiso rechazado');
  expect(screen.queryByText(/DESACTIVADO para/)).toBeNull();
  fireEvent.click(toggle);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText(/Registro de nuevas reservas DESACTIVADO/)).toBeTruthy());
});

it('preserves bulk permission changes, excludes protected accounts and prevents duplicate requests', async () => {
  const pending = deferred();
  const save = vi.fn().mockReturnValue(pending.promise);
  const currentUser = { ...props().currentUser!, username: 'cristian shute', isMasterAdmin:true, name: 'Titular de prueba' };
  const users = [operator, { ...operator, username: 'administrator', role: 'Administrador', isMasterAdmin:true }, { ...operator, username: 'cristian shute', isMasterAdmin:true }];
  render(<AdminView {...props({ initialTab: 'users', currentUser, users, onSaveUser: save })} />);
  const button = screen.getByTitle('Bloquea creación, edición y eliminación para operadores');
  fireEvent.click(button);
  fireEvent.click(button);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]).toEqual([expect.objectContaining({ username: 'operator', canCreateReservations: false, canEditReservations: false, canDeleteReservations: false }), 'operator']);
  await act(async () => pending.resolve());
  expect(screen.getByText(/aplicado exitosamente a 1 usuarios/)).toBeTruthy();
  expect(save).toHaveBeenCalledTimes(1);
});

it('retains the equipment-service fallback when no save callback is supplied', async () => {
  const pending = deferred();
  vi.mocked(saveEquipmentItem).mockImplementationOnce(async item => { await pending.promise; return [item]; });
  render(<AdminView {...props({ initialTab: 'equipment', equipmentList: undefined })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Nuevo Equipamiento' }));
  fireEvent.change(screen.getByPlaceholderText('Ej: Data Show HD, Telón Móvil, Set de Colchonetas, Micrófono'), { target: { value: 'Recurso local' } });
  fireEvent.submit(form());
  expect(saveEquipmentItem).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog')).toBeTruthy();
  await act(async () => pending.resolve());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByText('Recurso local')).toBeTruthy();
});

it('preserves the default error message and releases the write lock for errors without a message', async () => {
  const save = vi.fn().mockRejectedValueOnce(undefined).mockResolvedValue(undefined);
  render(<AdminView {...props({ initialTab: 'equipment', onSaveEquipment: save })} />);
  fireEvent.click(screen.getByTitle('Aumentar stock'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('No se pudo guardar. Tus datos se conservaron.'));
  fireEvent.click(screen.getByTitle('Aumentar stock'));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});
