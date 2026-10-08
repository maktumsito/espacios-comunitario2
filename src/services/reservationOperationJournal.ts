import type { AuditChangeLogEntry, Reservation } from '../types';

export interface AuditRestoreContext {
  logId: string;
  timestamp: string;
  actor: string;
  log: AuditChangeLogEntry;
}

export interface PendingOperation {
  id: string;
  actor?: string;
  reservations: Reservation[];
  deletedIds: string[];
  confirmedIds: string[];
  allowConflictOverride: boolean;
  intent?: 'create' | 'update';
  requireAtomic?: boolean;
  expectedVersions?: Record<string, number>;
  auditRestore?: AuditRestoreContext;
}

const LEGACY_KEY = 'reservation_pending_operations_v1';
const DB_NAME = 'ReservationPendingOperations';
const STORE = 'operations';
const MIGRATED_KEY = '__legacy_migrated__';
let snapshot: PendingOperation[] | null = null;

function supportsIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function validOperation(value: any): value is PendingOperation {
  return value && typeof value.id === 'string' && Array.isArray(value.reservations) &&
    Array.isArray(value.deletedIds) && Array.isArray(value.confirmedIds);
}

function legacyOperations(): PendingOperation[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(validOperation)) {
    throw new Error('El registro de operaciones pendientes no es válido. Se conservó para su recuperación.');
  }
  return value;
}

function announce(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('reservation-operations-changed'));
}

/** Synchronous snapshot for React; async reads always consult durable storage. */
export function getPendingOperations(): PendingOperation[] {
  if (supportsIndexedDb() && snapshot) return snapshot;
  try { return legacyOperations(); }
  catch { return []; }
}

function openJournal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Cierra las otras pestañas de la aplicación y vuelve a intentar guardar.'));
  });
}

async function migrateLegacy(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    let failure: unknown;
    const marker = store.get(MIGRATED_KEY);
    marker.onsuccess = () => {
      try {
        const importedIds = new Set<string>(Array.isArray(marker.result) ? marker.result : []);
        for (const operation of legacyOperations()) {
          if (importedIds.has(operation.id)) continue;
          const existing = store.get(operation.id);
          existing.onsuccess = () => {
            if (!existing.result) store.put(operation, operation.id);
          };
          importedIds.add(operation.id);
        }
        store.put([...importedIds], MIGRATED_KEY);
      } catch (error) { failure = error; tx.abort(); }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure || tx.error || new Error('No se pudo migrar el registro de recuperación.'));
    tx.onerror = () => { failure ||= tx.error; };
  });
  // Only remove the old copy after the IndexedDB transaction has committed.
  try { localStorage.removeItem(LEGACY_KEY); }
  catch { /* The migration marker prevents an old copy from being imported again. */ }
}

async function withJournal<T>(action: (db: IDBDatabase) => Promise<T>): Promise<T> {
  const db = await openJournal();
  try { await migrateLegacy(db); return await action(db); }
  finally { db.close(); }
}

function readJournal(db: IDBDatabase): Promise<PendingOperation[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    tx.oncomplete = () => resolve(request.result.filter(validOperation));
    tx.onabort = () => reject(tx.error || request.error);
  });
}

export async function readPendingOperations(): Promise<PendingOperation[]> {
  if (!supportsIndexedDb()) return legacyOperations();
  snapshot = await withJournal(readJournal);
  return snapshot;
}

/** Persist before contacting Firestore; never substitute volatile memory for recovery. */
export async function updateOperationJournal(operation: PendingOperation, finished = false): Promise<void> {
  if (!supportsIndexedDb()) {
    if (typeof localStorage === 'undefined') throw new Error('No hay almacenamiento local disponible para conservar el guardado pendiente.');
    const entries = legacyOperations().filter(o => o.id !== operation.id);
    if (!finished) entries.push(operation);
    try {
      if (entries.length) localStorage.setItem(LEGACY_KEY, JSON.stringify(entries));
      else localStorage.removeItem(LEGACY_KEY);
    } catch {
      throw new Error('No hay espacio local para conservar el guardado pendiente. Usa un navegador con IndexedDB habilitado. No se inició un nuevo guardado.');
    }
  } else {
    await withJournal(async db => {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        const store = tx.objectStore(STORE);
        if (finished) store.delete(operation.id);
        else store.put(operation, operation.id);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('No se pudo conservar la operación pendiente.'));
      });
      snapshot = await readJournal(db);
    });
  }
  announce();
}
