/**
 * Lightweight native IndexedDB storage helper for high-volume reservations caching.
 * Bypasses localStorage 5MB limit and supports 100MB+ datasets without QuotaExceededError.
 */

import { Reservation, AuditChangeLogEntry } from '../types';

const DB_NAME = 'EspaciosComunitariosDB';
const DB_VERSION = 2;
const STORE_NAME = 'reservas_store';
const CACHE_KEY = 'all_reservations';
const AUDIT_STORE_NAME = 'audit_logs_store';
const AUDIT_CACHE_KEY = 'all_audit_logs';

let dbPromise: Promise<IDBDatabase> | null = null;

/**
 * Checks whether the current environment supports IndexedDB without throwing.
 */
export function isIndexedDbSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined' && !!window.indexedDB;
}

function getDbInstance(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  if (!isIndexedDbSupported()) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(AUDIT_STORE_NAME)) {
          db.createObjectStore(AUDIT_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          dbPromise = null;
        };
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        console.warn('Error opening IndexedDB:', request.error);
        reject(request.error);
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

/**
 * Retrieves all cached reservations from IndexedDB asynchronously.
 */
export async function getIndexedDbReservations(): Promise<Reservation[] | null> {
  if (!isIndexedDbSupported()) {
    return null;
  }
  try {
    const db = await getDbInstance();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(CACHE_KEY);

      request.onsuccess = () => {
        const data = request.result;
        if (Array.isArray(data)) {
          resolve(data as Reservation[]);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.warn('Error reading from IndexedDB:', request.error);
        resolve(null);
      };
    });
  } catch (err) {
    if (isIndexedDbSupported()) {
      console.warn('IndexedDB unavailable:', err);
    }
    return null;
  }
}

/**
 * Stores reservations in IndexedDB without blocking or hitting localStorage limits.
 */
export async function setIndexedDbReservations(reservations: readonly Reservation[]): Promise<void> {
  if (!isIndexedDbSupported()) {
    return;
  }
  try {
    const db = await getDbInstance();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(reservations, CACHE_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Error saving to IndexedDB:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    if (isIndexedDbSupported()) {
      console.warn('Could not persist to IndexedDB:', err);
    }
  }
}

/**
 * Retrieves all cached audit log entries from IndexedDB asynchronously.
 * Bypasses browser localStorage ~5MB quota limits.
 */
export async function getIndexedDbAuditLogs(): Promise<AuditChangeLogEntry[] | null> {
  if (!isIndexedDbSupported()) {
    return null;
  }
  try {
    const db = await getDbInstance();
    return new Promise((resolve) => {
      const tx = db.transaction(AUDIT_STORE_NAME, 'readonly');
      const store = tx.objectStore(AUDIT_STORE_NAME);
      const request = store.get(AUDIT_CACHE_KEY);

      request.onsuccess = () => {
        const data = request.result;
        if (Array.isArray(data)) {
          resolve(data as AuditChangeLogEntry[]);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.warn('Error reading audit logs from IndexedDB:', request.error);
        resolve(null);
      };
    });
  } catch (err) {
    if (isIndexedDbSupported()) {
      console.warn('IndexedDB unavailable for audit logs:', err);
    }
    return null;
  }
}

/**
 * Stores audit logs in IndexedDB with quota-safe durability.
 */
export async function setIndexedDbAuditLogs(entries: readonly AuditChangeLogEntry[]): Promise<void> {
  if (!isIndexedDbSupported()) {
    return;
  }
  try {
    const db = await getDbInstance();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AUDIT_STORE_NAME, 'readwrite');
      const store = tx.objectStore(AUDIT_STORE_NAME);
      const request = store.put(entries, AUDIT_CACHE_KEY);

      request.onsuccess = () => resolve();
      request.onerror = () => {
        console.warn('Error saving audit logs to IndexedDB:', request.error);
        reject(request.error);
      };
    });
  } catch (err) {
    if (isIndexedDbSupported()) {
      console.warn('Could not persist audit logs to IndexedDB:', err);
    }
  }
}
