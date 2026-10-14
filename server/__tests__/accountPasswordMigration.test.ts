import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { expect, it, vi } from 'vitest';
import type { UserAccount } from '../../src/services/authService';
import { migrateAccountPassword } from '../accountPasswordMigration';
import { hashPassword, hashVerifiedLegacyPassword, verifyLegacyPassword, verifyPassword } from '../passwords';

const password = 'Synthetic-only-123!';
const legacy = (value: string) => crypto.createHash('sha256').update(`espacios_community_salt_2026:${value}`).digest('hex');
const account: UserAccount & { sessionVersion: number } = { username: 'synthetic user', name: 'Synthetic User', passwordHash: legacy(password),
  role: 'Auxiliar', initials: 'SU', avatarColor: 'bg-blue-600', canCreateReservations: false, canEditReservations: false, canDeleteReservations: false, sessionVersion: 2 };

function database(current: UserAccount | undefined = { ...account }) {
  let row = current;
  const update = vi.fn();
  const db = { doc: vi.fn((path: string) => ({ path })), runTransaction: async (callback: any) => {
    const staged: any[] = [];
    const result = await callback({ get: async () => ({ data: () => row }), update: (ref: any, changes: any) => staged.push([ref, changes]) });
    for (const [ref, changes] of staged) { update(ref, changes); row = { ...row!, ...changes }; }
    return result;
  } } as unknown as Firestore;
  return { db, update, row: () => row };
}

it('migrates only credentials in a transaction and preserves the exact account profile', async () => {
  const memory = database();
  const migrated = await migrateAccountPassword(memory.db, account, password);
  expect(memory.update).toHaveBeenCalledWith({ path: 'usuarios_sistema/synthetic%20user' }, { passwordHash: migrated.passwordHash, sessionVersion: 3 });
  expect(migrated).toEqual({ ...account, passwordHash: expect.stringMatching(/^scrypt\$/), sessionVersion: 3 });
  expect(await verifyPassword(password, migrated.passwordHash)).toBe(true);
  expect(await verifyPassword(migrated.passwordHash, migrated.passwordHash)).toBe(false);
  expect(memory.row()).toEqual(migrated);
});

it.each(['wrong', account.passwordHash, '', 'x'.repeat(257)])('refuses invalid legacy secrets before writing (%s)', async value => {
  const memory = database();
  await expect(migrateAccountPassword(memory.db, account, value)).rejects.toThrow('clave anterior');
  expect(memory.update).not.toHaveBeenCalled();
});

it('refuses plain text and unsalted digests', () => {
  expect(verifyLegacyPassword(password, password)).toBe(false);
  expect(verifyLegacyPassword(password, crypto.createHash('sha256').update(password).digest('hex'))).toBe(false);
});

it('preserves short legacy passwords while requiring eight characters for newly assigned passwords', async () => {
  const migrated = await hashVerifiedLegacyPassword('old', legacy('old'));
  expect(await verifyPassword('old', migrated)).toBe(true);
  await expect(hashPassword('old')).rejects.toThrow('8 y 256');
});

it('does not overwrite a password changed concurrently', async () => {
  const memory = database({ ...account, passwordHash: await hashPassword('New-password-123!') });
  await expect(migrateAccountPassword(memory.db, account, password)).rejects.toThrow('credenciales cambiaron');
  expect(memory.update).not.toHaveBeenCalled();
});

it('accepts an upgrade completed by another concurrent login without changing it again', async () => {
  const upgraded = { ...account, passwordHash: await hashPassword(password), sessionVersion: 3 };
  const memory = database(upgraded);
  await expect(migrateAccountPassword(memory.db, account, password)).resolves.toEqual(upgraded);
  expect(memory.update).not.toHaveBeenCalled();
});

it('does not recreate an account deleted concurrently', async () => {
  const memory = database();
  const db = { ...memory.db, runTransaction: (callback: any) => callback({ get: async () => ({ data: () => undefined }), update: memory.update }) } as unknown as Firestore;
  await expect(migrateAccountPassword(db, account, password)).rejects.toThrow('cuenta cambió');
  expect(memory.update).not.toHaveBeenCalled();
});
