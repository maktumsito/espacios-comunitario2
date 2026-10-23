// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChangePasswordModal } from '../ChangePasswordModal';
import { changeUserPassword } from '../../services/authService';

vi.mock('../../services/authService', async original => ({
  ...await original<typeof import('../../services/authService')>(), changeUserPassword: vi.fn(),
}));
const reader = { username: 'reader', name: 'Lector', role: 'Auxiliar', initials: 'LE', avatarColor: 'bg-blue-600' };
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it('requires eight characters and matching confirmation before enabling the password save', () => {
  render(<ChangePasswordModal isOpen onClose={vi.fn()} currentUser={reader} />);
  fireEvent.change(screen.getByPlaceholderText('Ingresa tu clave actual'), { target: { value: 'Current-123!' } });
  const save = screen.getByRole('button', { name: 'Guardar Nueva Clave' }) as HTMLButtonElement;
  for (const password of ['123', '1234567', '12345678', 'a'.repeat(257)]) {
    fireEvent.change(screen.getByPlaceholderText('Nueva clave deseada'), { target: { value: password } });
    fireEvent.change(screen.getByPlaceholderText('Vuelve a escribir la nueva clave'), { target: { value: password } });
    expect(save.disabled).toBe(password.length < 8 || password.length > 256);
  }
  expect(changeUserPassword).not.toHaveBeenCalled();
});

it('keeps an unsuccessful password change open and allows a corrected retry', async () => {
  vi.mocked(changeUserPassword).mockResolvedValueOnce({ success: false, message: 'La contraseña actual no es válida.' })
    .mockResolvedValueOnce({ success: true, message: 'Contraseña actualizada.' });
  const changed = vi.fn();
  render(<ChangePasswordModal isOpen onClose={vi.fn()} currentUser={reader} onPasswordChanged={changed} />);
  fireEvent.change(screen.getByPlaceholderText('Ingresa tu clave actual'), { target: { value: '  Current-123!  ' } });
  fireEvent.change(screen.getByPlaceholderText('Nueva clave deseada'), { target: { value: '  Next-123!  ' } });
  fireEvent.change(screen.getByPlaceholderText('Vuelve a escribir la nueva clave'), { target: { value: '  Next-123!  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Nueva Clave' }));
  expect(await screen.findByText('La contraseña actual no es válida.')).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Nueva Clave' }));
  await waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
  expect(changeUserPassword).toHaveBeenLastCalledWith('reader', 'Current-123!', 'Next-123!', false);
});

it('allows a master to reset another account without requesting its current password', async () => {
  vi.mocked(changeUserPassword).mockResolvedValue({ success: true, message: 'Contraseña actualizada.' });
  render(<ChangePasswordModal isOpen onClose={vi.fn()} currentUser={{ ...reader, username: 'master', isMasterAdmin: true }} targetUser={reader} />);
  expect(screen.queryByPlaceholderText('Ingresa tu clave actual')).toBeNull();
  fireEvent.change(screen.getByPlaceholderText('Nueva clave deseada'), { target: { value: 'Next-123!' } });
  fireEvent.change(screen.getByPlaceholderText('Vuelve a escribir la nueva clave'), { target: { value: 'Next-123!' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar Nueva Clave' }));
  await waitFor(() => expect(changeUserPassword).toHaveBeenCalledExactlyOnceWith('reader', '', 'Next-123!', true));
});
