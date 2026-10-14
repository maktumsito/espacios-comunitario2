// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LoginScreen } from '../LoginScreen';
import { PasswordPromptModal } from '../PasswordPromptModal';

const mocks = vi.hoisted(() => ({ accounts: vi.fn(), authenticate: vi.fn() }));
vi.mock('../../services/authService', () => ({
  fetchLoginAccounts: mocks.accounts,
  authenticateUser: mocks.authenticate,
  authenticateGoogleSession: vi.fn(),
  getLockoutStatus: () => ({ isLocked: false, remainingSeconds: 0 }),
}));
const users = [
  { username: 'ana.login', name: 'Ana Pérez', initials: 'AP', role: 'Coordinador', avatarColor: 'bg-blue-600' },
  { username: 'pedro.login', name: 'Pedro González', initials: 'PG', role: 'Auxiliar', avatarColor: 'bg-green-600' },
];
beforeEach(() => { vi.clearAllMocks(); mocks.accounts.mockResolvedValue(users); mocks.authenticate.mockResolvedValue({ success: true, user: users[0] }); });
afterEach(cleanup);

function renderAccess(kind: string, onSuccess = vi.fn()) {
  render(kind === 'login' ? <LoginScreen onLoginSuccess={onSuccess} /> :
    <PasswordPromptModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
  return onSuccess;
}

it.each(['login', 'prompt'])('%s selects the clicked account and asks only for its password', async kind => {
  const onSuccess = renderAccess(kind);
  const password = screen.getByLabelText(/^2\./) as HTMLInputElement;
  expect(password.disabled).toBe(true);
  expect(document.querySelector('input[autocomplete="username"]')).toBeNull();
  expect(document.querySelectorAll('input').length).toBe(1);
  const account = await screen.findByRole('button', { name: 'Ana Pérez' });
  fireEvent.click(account);
  expect(account.getAttribute('aria-pressed')).toBe('true');
  expect(document.activeElement).toBe(password);
  fireEvent.change(password, { target: { value: 'personal-password' } });
  fireEvent.click(screen.getByRole('button', { name: kind === 'login' ? 'Ingresar al Sistema' : 'Habilitar Edición' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(users[0]));
  expect(mocks.authenticate).toHaveBeenCalledExactlyOnceWith('ana.login', 'personal-password');
});

it.each(['login', 'prompt'])('%s clears the password when a different user is selected', async kind => {
  renderAccess(kind);
  fireEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }));
  const password = screen.getByLabelText(/^2\./) as HTMLInputElement;
  fireEvent.change(password, { target: { value: 'anas-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Pedro González' }));
  expect(password.value).toBe('');
  expect(screen.getByRole('button', { name: 'Pedro González' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Ana Pérez' }).getAttribute('aria-pressed')).toBe('false');
  expect(mocks.authenticate).not.toHaveBeenCalled();
});

it.each(['login', 'prompt'])('%s keeps the account selected after a wrong password', async kind => {
  mocks.authenticate.mockResolvedValue({ success: false, error: 'Clave incorrecta' });
  const onSuccess = renderAccess(kind);
  fireEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }));
  fireEvent.change(screen.getByLabelText(/^2\./), { target: { value: 'wrong-password' } });
  fireEvent.click(screen.getByRole('button', { name: kind === 'login' ? 'Ingresar al Sistema' : 'Habilitar Edición' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Clave incorrecta');
  expect(screen.getByRole('button', { name: 'Ana Pérez' }).getAttribute('aria-pressed')).toBe('true');
  expect(onSuccess).not.toHaveBeenCalled();
});

it.each(['login', 'prompt'])('%s can retry loading users without a previously saved session', async kind => {
  mocks.accounts.mockRejectedValueOnce(new Error('Unavailable'));
  renderAccess(kind);
  expect((await screen.findByRole('alert')).textContent).toContain('lista de usuarios');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByRole('button', { name: 'Ana Pérez' });
  expect(mocks.accounts).toHaveBeenCalledTimes(2);
  expect(mocks.authenticate).not.toHaveBeenCalled();
});
