import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ stored: undefined as any, writes: 0, pending: Promise.resolve() as Promise<any> }));
vi.mock('firebase/firestore', () => ({
  doc: () => 'configuracion_sistema/backup_schedule_config',
  runTransaction: (_db: unknown, next: any) => {
    const request = state.pending.then(() => next({
      get: async () => ({ exists: () => !!state.stored, data: () => state.stored }),
      set: (_ref: unknown, value: any) => {
        state.writes++;
        state.stored = { ...state.stored, ...value, data: { ...state.stored?.data, ...value.data } };
      },
    }));
    state.pending = request.catch(() => {});
    return request;
  },
}));
import { claimScheduledBackup, finishScheduledBackup } from '../backupScheduleCoordinator';
import type { BackupScheduleConfig } from '../backupService';
const defaults: BackupScheduleConfig = { enabled: true, intervalDays: 15, lastBackupTimestamp: 0,
  lastBackupDate: '', autoDownloadJson: false, notificarEnCampana: true };
beforeEach(() => { state.stored = undefined; state.writes = 0; state.pending = Promise.resolve(); });

it('three simultaneous devices acquire only one shared scheduled cycle', async () => {
  const claims = await Promise.all(Array.from({ length: 3 }, () => claimScheduledBackup({} as any, defaults)));
  expect(claims.filter(claim => claim.owner)).toHaveLength(1);
  expect(claims.filter(claim => claim.busy)).toHaveLength(2);
  expect(state.writes).toBe(1);
});

it('completion prevents a fresh browser from repeating a backup and preserves settings changed remotely', async () => {
  const claim = await claimScheduledBackup({} as any, defaults);
  state.stored.data.intervalDays = 31;
  await finishScheduledBackup({} as any, claim, { id: 'b1', fecha: '2026-10-07', timestamp: new Date().toISOString() } as any);
  const next = await claimScheduledBackup({} as any, defaults);
  expect(next.owner).toBeUndefined();
  expect(next.busy).toBe(false);
  expect(next.config.intervalDays).toBe(31);
  expect(next.config.lastBackupId).toBe('b1');
  expect(state.stored.lease).toBeNull();
});

it('releases a failed operation and cannot release another device claim', async () => {
  const first = await claimScheduledBackup({} as any, defaults);
  await finishScheduledBackup({} as any, first);
  const second = await claimScheduledBackup({} as any, defaults);
  expect(second.owner).toBeTruthy();
  await finishScheduledBackup({} as any, first);
  expect(state.stored.lease.owner).toBe(second.owner);
});

it('respects remote disabled state and recovers an expired lease', async () => {
  state.stored = { data: { ...defaults, enabled: false } };
  expect((await claimScheduledBackup({} as any, defaults)).owner).toBeUndefined();
  state.stored = { data: defaults, lease: { owner: 'crashed', expiresAt: Date.now() - 1 } };
  expect((await claimScheduledBackup({} as any, defaults)).owner).toBeTruthy();
});
