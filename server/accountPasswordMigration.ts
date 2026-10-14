import type { Firestore } from 'firebase-admin/firestore';
import type { UserAccount } from '../src/services/authService';
import { hashVerifiedLegacyPassword, verifyPassword } from './passwords';

/** Upgrade only after verifying the existing secret, without overwriting concurrent changes. */
export async function migrateAccountPassword(db: Firestore, account: UserAccount, password: string): Promise<UserAccount> {
  const nextHash = await hashVerifiedLegacyPassword(password, account.passwordHash);
  const username = account.username.trim().toLowerCase();
  const id = encodeURIComponent(username).replace(/\./g, '_');
  return db.runTransaction(async tx => {
    const ref = db.doc(`usuarios_sistema/${id}`);
    const snapshot = await tx.get(ref);
    const current = snapshot.data() as UserAccount | undefined;
    if (!current || current.username.trim().toLowerCase() !== username) {
      throw new Error('La cuenta cambió durante el acceso. Intenta nuevamente.');
    }
    if (current.passwordHash !== account.passwordHash) {
      // A simultaneous login may already have upgraded the same password.
      if (await verifyPassword(password, current.passwordHash)) return current;
      throw new Error('Las credenciales cambiaron durante el acceso. Intenta nuevamente.');
    }
    const changes = {
      passwordHash: nextHash,
      sessionVersion: ((current as UserAccount & { sessionVersion?: number }).sessionVersion || 0) + 1,
    };
    tx.update(ref, changes);
    return { ...current, ...changes };
  });
}
