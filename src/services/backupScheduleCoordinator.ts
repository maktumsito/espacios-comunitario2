import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import type { BackupScheduleConfig, DatabaseBackupRecord } from './backupService';

export interface ScheduledBackupClaim { config: BackupScheduleConfig; owner?: string; busy: boolean }
const LEASE_MS = 30 * 60_000;

/** Only one device downloads the full dataset for the same scheduled cycle. */
export async function claimScheduledBackup(db: Firestore, fallback: BackupScheduleConfig): Promise<ScheduledBackupClaim> {
  const ref = doc(db, 'configuracion_sistema', 'backup_schedule_config');
  const now = Date.now();
  const owner = crypto.randomUUID();
  return runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    const stored = snapshot.exists() ? snapshot.data() : undefined;
    const config: BackupScheduleConfig = { ...fallback, ...stored?.data };
    // A browser's local timestamp must not prevent the first shared backup.
    config.lastBackupTimestamp = Number(stored?.data?.lastBackupTimestamp) || 0;
    const interval = Number(config.intervalDays);
    config.intervalDays = Number.isFinite(interval) && interval > 0 ? interval : 15;
    if (!config.enabled || (config.lastBackupTimestamp && now - config.lastBackupTimestamp < config.intervalDays * 86_400_000)) {
      return { config, busy: false };
    }
    if (stored?.lease?.expiresAt > now) return { config, busy: true };
    tx.set(ref, { data: config, lease: { owner, expiresAt: now + LEASE_MS }, updatedAt: new Date(now).toISOString() }, { merge: true });
    return { config, owner, busy: false };
  });
}

/** Clear only our own claim, preserving configuration edits made by other devices. */
export async function finishScheduledBackup(db: Firestore, claim: ScheduledBackupClaim, backup?: DatabaseBackupRecord) {
  if (!claim.owner) return;
  const ref = doc(db, 'configuracion_sistema', 'backup_schedule_config');
  await runTransaction(db, async tx => {
    const snapshot = await tx.get(ref);
    const stored = snapshot.data();
    if (stored?.lease?.owner !== claim.owner) return;
    const completed = backup ? { lastBackupId: backup.id, lastBackupDate: backup.fecha,
      lastBackupTimestamp: Math.max(Number(stored?.data?.lastBackupTimestamp) || 0, Date.parse(backup.timestamp)) } : {};
    tx.set(ref, { ...(backup ? { data: completed } : {}), lease: null, updatedAt: new Date().toISOString() }, { merge: true });
  });
}
