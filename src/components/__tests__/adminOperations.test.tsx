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

it('deactivates and reactivates a space without deleting its catalog entry', async () => {
  const save = vi.fn().mockResolvedValue(undefined), remove = vi.fn();
  const initial = props({ onSaveSpace: save, onDeleteSpace: remove });
  const { rerender } = render(<AdminView {...initial} />);
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar SALA A' }));
  await waitFor(() => expect(save).toHaveBeenCalledWith({ ...initial.spaces[0], activo: false }));
  expect(remove).not.toHaveBeenCalled();
  rerender(<AdminView {...initial} spaces={[{ ...initial.spaces[0], activo: false }, initial.spaces[1]]} />);
  expect(screen.getByText('Inactivo · Oculto en agenda')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Activar SALA A' }));
  await waitFor(() => expect(save).toHaveBeenLastCalledWith({ ...initial.spaces[0], activo: true }));
});

it('creates an active space with optional capacity and prevents replacing another room with a duplicate name', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AdminView {...props({ onSaveSpace: save })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Crear Nuevo Espacio' }));
  const name = screen.getByPlaceholderText('Ej: SALA 7, SALA MULTIUSO COMUNITARIA');
  fireEvent.change(name, { target: { value: 'SALA A' } });
  fireEvent.submit(name.closest('form')!);
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText(/Ya existe un espacio con ese nombre/)).toBeTruthy();
  fireEvent.change(name, { target: { value: 'SALA NUEVA' } });
  fireEvent.change(screen.getByLabelText('Aforo orientativo (opcional)'), { target: { value: '24' } });
  fireEvent.submit(name.closest('form')!);
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'SALA NUEVA', activo: true, capacity: 24 })));
});

it('keeps a space active when its deactivation is rejected and prevents concurrent toggles', async () => {
  const pending = deferred(), save = vi.fn().mockReturnValueOnce(pending.promise);
  render(<AdminView {...props({ onSaveSpace: save })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar SALA A' }));
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar SALA A' }));
  expect(save).toHaveBeenCalledTimes(1);
  await act(async () => pending.reject(new Error('Cambio rechazado')));
  expect(screen.getByRole('alert').textContent).toBe('Cambio rechazado');
  expect(screen.getByRole('button', { name: 'Desactivar SALA A' })).toBeTruthy();
});
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

it('creates a user with an assigned password and the permissions selected by Cristian', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const currentUser = { ...props().currentUser!, username: 'cristian shute', isMasterAdmin: true };
  render(<AdminView {...props({ initialTab: 'users', currentUser, onSaveUser: save })} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Crear Nuevo Usuario' })[0]);
  fireEvent.change(screen.getByPlaceholderText('Ej: Carla Morales, Roberto Lagos'), { target: { value: 'Ana Prueba' } });
  fireEvent.change(screen.getByLabelText('Clave de Acceso'), { target: { value: 'Assigned-only-123!' } });
  fireEvent.click(screen.getByLabelText('Editar y modificar reservas existentes'));
  fireEvent.click(screen.getByLabelText('Eliminar reservas directamente'));
  expect(form().checkValidity()).toBe(true);
  fireEvent.submit(form());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'Ana Prueba', passwordHash: 'Assigned-only-123!',
    canCreateReservations: true, canEditReservations: false, canDeleteReservations: true }), undefined);
});

it('uses role defaults for new users while non-Cristian permission controls stay disabled', async () => {
  render(<AdminView {...props({ initialTab: 'users', onSaveUser: vi.fn() })} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Crear Nuevo Usuario' })[0]);
  fireEvent.change(screen.getByLabelText('Rol y Nivel de Acceso'), { target: { value: 'Auxiliar' } });
  for (const input of within(screen.getByRole('dialog')).getAllByRole('checkbox') as HTMLInputElement[]) {
    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(false);
  }
});

it('allows the browser to submit an edited profile while retaining its existing password', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<AdminView {...props({ initialTab: 'users', onSaveUser: save })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const password = screen.getByLabelText('Clave de Acceso') as HTMLInputElement;
  expect(password.value).toBe('');
  expect(password.required).toBe(false);
  fireEvent.change(screen.getByPlaceholderText('Ej: Carla Morales, Roberto Lagos'), { target: { value: 'Nombre editado' } });
  expect(form().checkValidity()).toBe(true);
  fireEvent.submit(form());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ name: 'Nombre editado', passwordHash: '' }), 'operator');
});

it('routes a manager password reassignment through the authorized profile editor', () => {
  const openPassword = vi.fn();
  render(<AdminView {...props({ initialTab: 'users', onOpenChangePassword: openPassword })} />);
  fireEvent.click(screen.getByTitle('Restablecer o modificar clave de este usuario'));
  expect(openPassword).not.toHaveBeenCalled();
  expect(screen.getByText('Editar Usuario')).toBeTruthy();
  expect(screen.getByLabelText('Clave de Acceso')).toBeTruthy();
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

it.each([
  { button: 'Activar todos los permisos', create: true, edit: true, remove: true },
  { button: 'Solo Crear Reservas', create: true, edit: false, remove: false },
  { button: 'Desactivar todos los permisos', create: false, edit: false, remove: false },
])('applies $button to every user including master accounts and prevents duplicate requests', async ({ button, create, edit, remove }) => {
  const pending = deferred();
  const save = vi.fn().mockReturnValue(pending.promise);
  const currentUser = { ...props().currentUser!, username: 'cristian shute', isMasterAdmin:true, name: 'Titular de prueba' };
  const users = [operator, { ...operator, username: 'administrator', role: 'Administrador', isMasterAdmin:true },
    { ...operator, username: 'cristian shute', isMasterAdmin:true }, { ...operator, username: 'reader', role: 'Auxiliar' }];
  render(<AdminView {...props({ initialTab: 'users', currentUser, users, onSaveUser: save })} />);
  const action = screen.getByRole('button', { name: button });
  fireEvent.click(action);
  fireEvent.click(action);
  expect(save).toHaveBeenCalledTimes(1);
  expect(screen.queryByText(/aplicado exitosamente/)).toBeNull();
  await act(async () => pending.resolve());
  await waitFor(() => expect(screen.getByText(/aplicado exitosamente a 4 usuarios/)).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(users.length);
  users.forEach((user, index) => expect(save.mock.calls[index]).toEqual([expect.objectContaining({
    ...user, canCreateReservations: create, canEditReservations: edit, canDeleteReservations: remove,
  }), user.username]));
});

it('reports a failed bulk permission change without claiming that all users were updated, and allows retry', async () => {
  const save = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Permisos no guardados')).mockResolvedValue(undefined);
  const currentUser = { ...props().currentUser!, username: 'cristian shute', isMasterAdmin: true };
  const users = [operator, { ...operator, username: 'master', isMasterAdmin: true }];
  render(<AdminView {...props({ initialTab: 'users', currentUser, users, onSaveUser: save })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar todos los permisos' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Permisos no guardados'));
  expect(screen.queryByText(/aplicado exitosamente/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar todos los permisos' }));
  await waitFor(() => expect(screen.getByText(/aplicado exitosamente a 2 usuarios/)).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(4);
});

it('lets Cristian disable and restore each of his own reservation permissions', async () => {
  let user = { ...operator, username: 'cristian shute', name: 'Cristian Shute', role: 'Administrador', isMasterAdmin: true,
    canCreateReservations: true, canEditReservations: true, canDeleteReservations: true };
  const save = vi.fn().mockResolvedValue(undefined);
  const view = () => <AdminView {...props({ initialTab: 'users', currentUser: user, users: [user], onSaveUser: save })} />;
  const { rerender } = render(view());
  expect(screen.queryByText(/Acceso Maestro Permanente/)).toBeNull();
  const keys = ['canCreateReservations', 'canEditReservations', 'canDeleteReservations'] as const;
  let call = 0;
  for (const value of [false, true]) {
    for (const [index, key] of keys.entries()) {
      fireEvent.click(screen.getAllByTitle('Haz clic para activar o desactivar este permiso')[index]);
      call += 1;
      await waitFor(() => expect(save).toHaveBeenCalledTimes(call));
      const [updated, originalUsername] = save.mock.calls[call - 1];
      expect(originalUsername).toBe('cristian shute');
      expect(updated).toMatchObject({ ...user, [key]: value });
      user = updated;
      rerender(view());
    }
    expect(screen.getAllByText(value ? 'Activado' : 'Bloqueado')).toHaveLength(3);
  }
  expect(screen.getByText('Protegido')).toBeTruthy();
});

it('shows Cristian\'s actual reservation permissions to other administrators', () => {
  const user = { ...operator, username: 'cristian shute', name: 'Cristian Shute', role: 'Administrador', isMasterAdmin: true,
    canCreateReservations: false, canEditReservations: true, canDeleteReservations: false };
  render(<AdminView {...props({ initialTab: 'users', users: [user] })} />);
  expect(screen.getAllByText('Restringido')).toHaveLength(2);
  expect(screen.getByText('Permitido')).toBeTruthy();
  expect(screen.queryByTitle('Haz clic para activar o desactivar este permiso')).toBeNull();
});

it('lets the registered Cristian administrator without a master flag enable and disable another user editing permission', async () => {
  const currentUser = { ...props().currentUser!, username: 'cristian shute', name: 'Cristian Shute' };
  let user = { ...operator, canEditReservations: false };
  const save = vi.fn().mockResolvedValue(undefined);
  const view = () => <AdminView {...props({ initialTab: 'users', currentUser, users: [user], onSaveUser: save })} />;
  const { rerender } = render(view());
  expect(screen.getByRole('button', { name: 'Activar todos los permisos' })).toBeTruthy();
  for (const [index, enabled] of [true, false].entries()) {
    fireEvent.click(screen.getAllByTitle('Haz clic para activar o desactivar este permiso')[1]);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(index + 1));
    expect(save.mock.calls[index]).toEqual([expect.objectContaining({ username: 'operator', canEditReservations: enabled }), 'operator']);
    user = save.mock.calls[index][0];
    rerender(view());
    expect(screen.getAllByTitle('Haz clic para activar o desactivar este permiso')[1].textContent).toContain(enabled ? 'Activado' : 'Bloqueado');
  }
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
