// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), clean: vi.fn(), protect: vi.fn() }));
vi.mock('../../services/systemMaintenanceService', () => ({readSystemDiagnostics:mocks.read}));
vi.mock('../../services/storageService', () => ({getCleanableCacheEntries:()=>[{key:'reservations_cache',kb:42}],purgeLocalStorageCache:mocks.clean}));
vi.mock('../../services/backupService', () => ({setBackupProtection:mocks.protect,fetchFullBackupRecord:vi.fn()}));
import { SystemMaintenanceView } from '../SystemMaintenanceView';
const user = {username:'cristian shute',name:'Cristian Shute',role:'Administrador',initials:'CS',avatarColor:'bg-blue-600'};
const diagnostics = {remote:{checkedAt:'2026-10-24T12:00:00Z',backups:[{id:'backup-1',tipo:'manual',timestamp:'2026-10-24T12:00:00Z',totalReservas:17}],logs:[],limited:false},pendingCount:0,remoteError:'',storage:{usedKb:108}};
beforeEach(() => {vi.clearAllMocks();mocks.read.mockResolvedValue(diagnostics);mocks.clean.mockResolvedValue({freedBytes:4096});});
afterEach(cleanup);

it('performs a read-only diagnostic on mount and requires confirmation for cache cleanup', async () => {
  render(<SystemMaintenanceView currentUser={user} reservations={[]} />);
  await screen.findByText(/Verificada:/);
  expect(mocks.protect).not.toHaveBeenCalled(); expect(mocks.clean).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Revisar limpieza de caché'}));
  expect(mocks.clean).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Limpiar cachés identificadas'}));
  await waitFor(() => expect(mocks.clean).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/4 KB liberados/)).toBeTruthy();
});

it('blocks cleanup when pending recovery exists and limits maintenance actions to Cristian', async () => {
  mocks.read.mockResolvedValue({...diagnostics,pendingCount:1});
  const {rerender} = render(<SystemMaintenanceView currentUser={user} reservations={[]} />);
  await screen.findByText(/Verificada:/);
  expect((screen.getByRole('button',{name:'Revisar limpieza de caché'}) as HTMLButtonElement).disabled).toBe(true);
  rerender(<SystemMaintenanceView currentUser={{...user,username:'other-admin'}} reservations={[]} />);
  expect(screen.queryByRole('button',{name:'Proteger copia'})).toBeNull();
  expect(mocks.clean).not.toHaveBeenCalled();
});

it('reports a failed protection update and permits a retry without false success', async () => {
  mocks.protect.mockRejectedValueOnce(new Error('Servidor no disponible')).mockResolvedValueOnce(undefined);
  render(<SystemMaintenanceView currentUser={user} reservations={[]} />);
  fireEvent.click(await screen.findByRole('button',{name:'Proteger copia'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Servidor no disponible');
  expect(screen.queryByText('Copia protegida contra rotación y eliminación.')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Proteger copia'}));
  expect(await screen.findByText('Copia protegida contra rotación y eliminación.')).toBeTruthy();
  expect(mocks.protect).toHaveBeenCalledTimes(2);
});

it('rechecks recovery at confirmation time and shows the rejection inside the cleanup dialog', async () => {
  mocks.clean.mockRejectedValueOnce(new Error('Resuelve los guardados pendientes antes de limpiar la caché.'));
  render(<SystemMaintenanceView currentUser={user} reservations={[]} />);
  await screen.findByText(/Verificada:/);
  fireEvent.click(screen.getByRole('button',{name:'Revisar limpieza de caché'}));
  const dialog=screen.getByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button',{name:'Limpiar cachés identificadas'}));
  await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('pendientes'));
  expect(screen.queryByText(/KB liberados/)).toBeNull();
});

it('requires confirmation before removing backup protection', async () => {
  mocks.read.mockResolvedValue({...diagnostics,remote:{...diagnostics.remote,backups:[{...diagnostics.remote.backups[0],protected:true}]}});
  mocks.protect.mockResolvedValue(undefined);
  render(<SystemMaintenanceView currentUser={user} reservations={[]} />);
  fireEvent.click(await screen.findByRole('button',{name:'Retirar protección'}));
  expect(mocks.protect).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button',{name:'Retirar protección'}));
  await waitFor(() => expect(mocks.protect).toHaveBeenCalledExactlyOnceWith('backup-1',false));
});
