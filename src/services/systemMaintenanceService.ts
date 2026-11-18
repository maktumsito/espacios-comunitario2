import { dataRequest } from '../firebase/gateway';
import { readPendingOperations } from './reservationOperationJournal';
import { getLocalStorageStats } from './storageService';
import type { DatabaseBackupMetadata } from './backupService';

export interface MaintenanceStatus {
  checkedAt: string;
  backups: DatabaseBackupMetadata[];
  limited: boolean;
  slotCleanup?: { checkedAt: string; daysOld: number; purgedCount: number; ok: boolean } | null;
  logs: { id: string; timestamp: string; actor: string; action: string; backupId: string }[];
}

export async function readSystemDiagnostics() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const [remote, pending] = await Promise.allSettled([
      dataRequest('/api/maintenance/status', {}, controller.signal) as Promise<MaintenanceStatus>, readPendingOperations(),
    ]);
    return { remote: remote.status === 'fulfilled' ? remote.value : null,
      remoteError: remote.status === 'rejected' ? remote.reason?.message || 'No se pudo verificar la base de datos.' : '',
      pendingCount: pending.status === 'fulfilled' ? pending.value.length : null,
      pendingError: pending.status === 'rejected' ? 'No se pudo verificar el registro de guardados pendientes.' : '',
      storage: getLocalStorageStats() };
  } finally { clearTimeout(timeout); }
}
