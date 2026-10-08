/**
 * Service for monitoring and safely managing browser local storage quotas (localStorage ~5MB limit).
 * Handles quota measurements, alerts, and safe purging while preserving canonical data in IndexedDB and Firestore.
 */

import {
  getIndexedDbAuditLogs,
  setIndexedDbAuditLogs
} from '../utils/indexedDbStorage';
import { AuditChangeLogEntry } from '../types';

const AUDIT_STORAGE_KEY = 'cc_audit_changelog_v1';
const RESERVATIONS_STORAGE_KEY = 'cc_reservas_cache_v2';
const LEGACY_STORAGE_KEYS = [
  'cc_reservas_cache_v1',
  'reservations_cache',
  'audit_logs_cache',
  'cc_temp_import_cache'
];

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

/**
 * Safely purges redundant and legacy data from localStorage.
 * 1. Ensures full audit history is backed up to IndexedDB.
 * 2. Prunes localStorage audit changelog to a lightweight summary.
 * 3. Clears legacy keys.
 * 4. Dispatches update event.
 */
export async function purgeLocalStorageCache(): Promise<{
  freedBytes: number;
  previousMb: number;
  currentMb: number;
  newStats: StorageQuotaStats;
}> {
  const initialStats = getLocalStorageStats();

  try {
    // 1. Ensure current audit log from localStorage is backed up to IndexedDB if not already present
    const rawAudit = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (rawAudit) {
      try {
        const parsed = JSON.parse(rawAudit);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const idbLogs = await getIndexedDbAuditLogs();
          if (!idbLogs || idbLogs.length < parsed.length) {
            await setIndexedDbAuditLogs(parsed);
          }
        }
      } catch {
        // ignore parse error
      }
    }

    // 2. Clear legacy storage keys
    LEGACY_STORAGE_KEYS.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });

    // 3. Compress audit log in localStorage: keep only lightweight summary
    if (rawAudit) {
      try {
        const parsed = JSON.parse(rawAudit);
        if (Array.isArray(parsed)) {
          const minimal = sanitizeAuditEntriesForLocalStorage(parsed, 10);
          localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(minimal));
        }
      } catch {
        localStorage.removeItem(AUDIT_STORAGE_KEY);
      }
    }
  } catch (err) {
    console.warn('Error during purgeLocalStorageCache:', err);
  }

  const newStats = getLocalStorageStats();
  const freedBytes = Math.max(0, initialStats.usedBytes - newStats.usedBytes);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app_storage_updated', {
        detail: { freedBytes, newStats }
      })
    );
  }

  return {
    freedBytes,
    previousMb: initialStats.usedMb,
    currentMb: newStats.usedMb,
    newStats
  };
}
