/**
 * Service for monitoring and safely managing browser local storage quotas (localStorage ~5MB limit).
 * Handles quota measurements, alerts, and safe purging while preserving canonical data in IndexedDB and Firestore.
 */

import { AuditChangeLogEntry } from '../types';

export interface StorageDetail {
  key: string;
  bytes: number;
  kb: number;
}

export interface StorageQuotaStats {
  usedBytes: number;
  usedKb: number;
  usedMb: number;
  totalQuotaBytes: number; // typically 5MB = 5,242,880
  percent: number;
  isWarning: boolean; // >= 60%
  isCritical: boolean; // >= 80%
  details: StorageDetail[];
}

const FIVE_MB_BYTES = 5 * 1024 * 1024; // 5,242,880 bytes

/**
 * Calculates current localStorage usage across all keys.
 */
export function getLocalStorageStats(): StorageQuotaStats {
  let totalBytes = 0;
  const details: StorageDetail[] = [];

  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      usedBytes: 0,
      usedKb: 0,
      usedMb: 0,
      totalQuotaBytes: FIVE_MB_BYTES,
      percent: 0,
      isWarning: false,
      isCritical: false,
      details: []
    };
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key) || '';
        // In UTF-16, each character consumes ~2 bytes
        const keyBytes = (key.length + value.length) * 2;
        totalBytes += keyBytes;
        details.push({
          key,
          bytes: keyBytes,
          kb: Math.round((keyBytes / 1024) * 10) / 10
        });
      }
    }
  } catch (err) {
    console.warn('Error calculating localStorage stats:', err);
  }

  const percent = Math.min(100, Math.round((totalBytes / FIVE_MB_BYTES) * 100));

  return {
    usedBytes: totalBytes,
    usedKb: Math.round(totalBytes / 1024),
    usedMb: Math.round((totalBytes / (1024 * 1024)) * 100) / 100,
    totalQuotaBytes: FIVE_MB_BYTES,
    percent,
    isWarning: percent >= 60,
    isCritical: percent >= 80,
    details: details.sort((a, b) => b.bytes - a.bytes)
  };
}

/**
 * Strips heavy payload objects (previousState, newState, huge diffs) from audit log entries
 * to preserve a lightweight summary in localStorage while IndexedDB and Firestore retain the full objects.
 */
export function sanitizeAuditEntriesForLocalStorage(
  entries: readonly AuditChangeLogEntry[],
  maxCount = 15
): AuditChangeLogEntry[] {
  return entries.slice(0, maxCount).map((entry) => ({
    id: entry.id,
    timestamp: entry.timestamp,
    action: entry.action,
    description: entry.description,
    user: entry.user,
    userRole: entry.userRole,
    reservaId: entry.reservaId,
    reservaTitle: entry.reservaTitle,
    reservaFecha: entry.reservaFecha,
    reservaEspacio: entry.reservaEspacio,
    reservaHorario: entry.reservaHorario,
    reservaResponsable: entry.reservaResponsable,
    isReverted: entry.isReverted,
    revertedAt: entry.revertedAt,
      revertedBy: entry.revertedBy,
      snapshotVersion: entry.snapshotVersion,
      snapshotParts: entry.snapshotParts,
      affectedCount: entry.affectedCount,
    // Do NOT store heavy object graphs in localStorage:
    previousState: undefined,
    newState: undefined,
    diffs: entry.diffs ? entry.diffs.slice(0, 5) : []
  }));
}

export const CLEANABLE_CACHE_KEYS = ['cc_reservas_cache_v1', 'reservations_cache', 'audit_logs_cache'] as const;

export function getCleanableCacheEntries(): StorageDetail[] {
  return getLocalStorageStats().details.filter(entry => (CLEANABLE_CACHE_KEYS as readonly string[]).includes(entry.key));
}

export async function purgeLocalStorageCache(): Promise<{
  freedBytes: number; previousMb: number; currentMb: number; newStats: StorageQuotaStats;
}> {
  const { readPendingOperations } = await import('./reservationOperationJournal');
  const pending = await readPendingOperations();
  if (pending.length) throw new Error('Resuelve los guardados pendientes antes de limpiar la caché.');
  const initialStats = getLocalStorageStats();
  // A fixed allowlist: never clear sessions, drafts, imports, audit history or IndexedDB.
  for (const key of CLEANABLE_CACHE_KEYS) localStorage.removeItem(key);
  const newStats = getLocalStorageStats();
  const freedBytes = Math.max(0, initialStats.usedBytes - newStats.usedBytes);
  window.dispatchEvent(new CustomEvent('app_storage_updated', { detail: { freedBytes, newStats } }));
  return { freedBytes, previousMb: initialStats.usedMb, currentMb: newStats.usedMb, newStats };
}
