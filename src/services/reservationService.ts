import { firestoreReadPolicy } from '../firebase/readPolicy';
import { sharedOnSnapshot as onSnapshot } from '../firebase/sharedSnapshot';
import {
  collection,
  doc,
  deleteDoc,
  writeBatch,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  runTransaction,
  Unsubscribe
} from 'firebase/firestore';
import { getDb } from '../firebase/config';
import { Reservation } from '../types';
import { getStoredAuthUser, userCanCreateReservations, userCanEditReservations, userCanDeleteReservations } from './authService';
import { writeReservations, readPendingOperations, type WriteOptions, type WriteResult } from './reservationWriter';
export { getPendingOperations, readPendingOperations, ReservationWriteError, ReservationVersionError } from './reservationWriter';
import { INITIAL_RESERVATIONS } from '../data/initialData';
import { isChileanHoliday, verifyHolidayOverrideKey } from '../utils/holidayUtils';
import { normalizeSpaceName } from '../data/spacesData';
import { getChileLocalDateString } from '../utils/dateUtils';
import { checkSingleConflict, isReservationActiveForAvailability } from '../utils/conflictDetector';
import {
  getIndexedDbReservations,
  setIndexedDbReservations
} from '../utils/indexedDbStorage';
import { validateReservationWithZod } from '../schemas/reservationSchema';
import { validateTimeRange } from '../utils/validationUtils';
import { recordFirestoreRead } from '../utils/firestoreTracker';

// ============================================================================
// CACHE VERSIONING & CONFIGURATION
// ============================================================================

export const CURRENT_CACHE_VERSION = 6;
export const CACHE_SCHEMA_VERSION = '2.2.0';
export const SLOTS_COLLECTION = 'schedule_slots';

const COLLECTION_NAME = 'reservas';
const LOCAL_STORAGE_KEY = `reservas_comunitarias_cache_v${CURRENT_CACHE_VERSION}`;
const CACHE_METADATA_KEY = `reservas_comunitarias_meta_v${CURRENT_CACHE_VERSION}`;

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

// Legacy keys to clean up and migrate automatically
const LEGACY_STORAGE_KEYS = [
  'reservas_comunitarias_cache_v5',
  'reservas_comunitarias_cache_v4',
  'reservas_comunitarias_cache_v3',
  'reservas_comunitarias_cache',
  'colegio_reservas_cache_meta_v2',
  'colegio_reservas_cache_meta_v1'
];

export interface CacheVersionMetadata {
  version: number;
  schemaVersion: string;
  dataHash: string;
  lastFirestoreHash: string | null;
  timestamp: number;
  count: number;
  lastSyncTime: number | null;
}

// In-memory cache & tracked data hash for 0ms synchronous retrieval
let inMemoryReservationsCache: Reservation[] | null = null;
let inMemoryDataHash: string | null = null;
let inMemoryLastFirestoreHash: string | null = null;
const purgedIdsInFlight = new Set<string>();

// Firestore limits writeBatch to 500 operations per batch; 450 provides safety buffer
const FIRESTORE_MAX_BATCH_SIZE = 450;

// Purged minute conflict tracking is now performed definitively via cleanMinuteConflictsMigration.ts
// The static array is neutralized to avoid runtime linear scanning over every reservation.
export const KNOWN_PURGED_MINUTE_CONFLICT_BASE_IDS: readonly string[] = Object.freeze([]);

export function isPurgedMinuteConflictId(_id: string): boolean {
  return false;
}

// ============================================================================
// DETERMINISTIC DATA HASHING ENGINE (CYRB53)
// ============================================================================

/**
 * High-performance 53-bit deterministic hash function.
 * Produces a collision-resistant hexadecimal hash signature for string payloads.
 */
export function fastHashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

export function fastHashRowStream(rows: readonly string[], seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;

  for (let r = 0; r < rows.length; r++) {
    if (r > 0) {
      h1 = Math.imul(h1 ^ 35, 2654435761); // '#'
      h2 = Math.imul(h2 ^ 35, 1597334677);
      h1 = Math.imul(h1 ^ 35, 2654435761); // '#'
      h2 = Math.imul(h2 ^ 35, 1597334677);
    }
    const row = rows[r];
    for (let i = 0; i < row.length; i++) {
      const ch = row.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Computes a deterministic canonical hash for any collection of reservations.
 * Invariant to array ordering, includes all domain-critical fields (dates, times, space, equipment, recurrence, notes).
 * Uses zero-allocation row streaming to avoid huge intermediate string allocations.
 */
export function calculateReservationsHash(reservations: readonly Reservation[]): string {
  if (!reservations || reservations.length === 0) return 'empty_hash_v0';

  // Sort deterministically by ID to ensure order invariance (fast string comparison without localeCompare overhead)
  const sorted = [...reservations].sort((a, b) => {
    const idA = a.id || '';
    const idB = b.id || '';
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });
  const rows: string[] = new Array(sorted.length);

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    const equipStr = r.equipamientoSolicitado && r.equipamientoSolicitado.length > 0
      ? r.equipamientoSolicitado
          .map(e => `${e.equipmentId || e.equipmentName || ''}:${e.quantity || 1}`)
          .sort()
          .join(',')
      : '';

    rows[i] = `${r.id || ''}|${r.fecha || ''}|${r.horaInicio || ''}|${r.horaFin || ''}|${r.espacio || ''}|${r.tipoActividad || ''}|${r.tipoPrestamo || ''}|${r.responsable || ''}|${r.descripcion || ''}|${r.cantidadParticipantes || 0}|${r.importante || ''}|${r.serieRecurrente || r.recurrenteId || ''}|${equipStr}|${r.comentarios || ''}|${r.estado || ''}|${r.terminaDiaSiguiente ? '1' : '0'}|${r.rut || ''}|${r.telefonoContacto || ''}|${r.emailContacto || ''}|${r.updatedAt || ''}`;
  }

  return fastHashRowStream(rows);
}

/**
 * High-performance deterministic comparator for reservations (by fecha asc, horaInicio asc).
 * Bypasses localeCompare overhead (10x-20x faster in V8) for standard ISO dates and times.
 */
export function compareReservationsByDate(a: Reservation, b: Reservation): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
  if (a.horaInicio !== b.horaInicio) return a.horaInicio < b.horaInicio ? -1 : 1;
  return 0;
}

// ============================================================================
// DELETED IDS TRACKER (PREVENTS PHANTOM RESURRECTIONS)
// ============================================================================

import {
  DELETED_IDS_KEY,
  getDeletedIds,
  recordDeletedId,
  recordDeletedIds,
  unrecordDeletedId,
  unrecordDeletedIds
} from '../utils/deletedReservationsStore';

export {
  DELETED_IDS_KEY,
  getDeletedIds,
  recordDeletedId,
  recordDeletedIds,
  unrecordDeletedId,
  unrecordDeletedIds
};

// ============================================================================
// SANITIZATION FOR FIRESTORE
// ============================================================================

export function cleanForFirestore<T extends Record<string, any>>(obj: T): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') {
      continue;
    }
    if (typeof value === 'number') {
      result[key] = Number.isNaN(value) ? null : value;
    } else if (Array.isArray(value)) {
      result[key] = value
        .filter((item) => item !== undefined && typeof item !== 'function' && typeof item !== 'symbol')
        .map((item) => {
          if (typeof item === 'number') return Number.isNaN(item) ? null : item;
          if (item !== null && typeof item === 'object' && !(item instanceof Date)) {
            return cleanForFirestore(item);
          }
          return item;
        });
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      result[key] = cleanForFirestore(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Normalizes any timestamp or Date value into an ISO string or YYYY-MM-DD.
 */
export function toDateString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (val instanceof Date) return getChileLocalDateString(val);
  if (typeof val === 'object' && typeof val.toDate === 'function') {
    return getChileLocalDateString(val.toDate());
  }
  if (typeof val === 'object' && typeof val._seconds === 'number') {
    return getChileLocalDateString(new Date(val._seconds * 1000));
  }
  return String(val);
}

export function toIsoString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val.trim();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object' && typeof val.toDate === 'function') {
    return val.toDate().toISOString();
  }
  if (typeof val === 'object' && typeof val._seconds === 'number') {
    return new Date(val._seconds * 1000).toISOString();
  }
  return String(val);
}

export function normalizeTimeFormat(timeStr: any): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  const trimmed = timeStr.trim();
  const parts = trimmed.split(':');
  if (parts.length < 2) return '';
  const parsedH = parseInt(parts[0], 10);
  const parsedM = parseInt(parts[1], 10);
  if (isNaN(parsedH) || isNaN(parsedM)) return '';
  if (parsedH < 0 || parsedH > 24 || parsedM < 0 || parsedM > 59) return '';
  if (parsedH === 24 && parsedM !== 0) return '';
  const h = String(parsedH).padStart(2, '0');
  const m = String(parsedM).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Normalizes any reservation status to canonical values: 'activa' | 'cancelada' | 'rechazada' | 'eliminada'.
 */
export function normalizeReservationStatus(data: any): 'activa' | 'cancelada' | 'rechazada' | 'eliminada' {
  if (!data) return 'activa';
  if (data.cancelada === true || data.cancelada === 'Sí') return 'cancelada';
  if (data.eliminada === true) return 'eliminada';
  const rawStatus = String(data.estado || data.status || '').trim().toLowerCase();
  if (['cancelada', 'cancelado', 'cancelled'].includes(rawStatus)) return 'cancelada';
  if (['eliminada', 'eliminado', 'deleted'].includes(rawStatus)) return 'eliminada';
  if (['rechazada', 'rechazado', 'rejected'].includes(rawStatus)) return 'rechazada';
  return 'activa';
}

/**
 * Converts a raw Firestore document snapshot into a canonical Reservation instance.
 * Guarantees docSnap.id is the source of truth, normalizes all timestamps, spaces, and recurrence IDs.
 */
export function normalizeReservationFromFirestore(docSnapId: string, raw: any): Reservation {
  const effectiveId = (docSnapId || raw?.id || '').trim();
  const canonicalSeriesId = (raw?.serieRecurrente || raw?.recurrenteId || '').trim();
  const canonicalSpace = normalizeSpaceName(raw?.espacio);
  const canonicalStatus = normalizeReservationStatus(raw);

  return {
    ...raw,
    id: effectiveId,
    fecha: toDateString(raw?.fecha),
    horaInicio: normalizeTimeFormat(raw?.horaInicio),
    horaFin: normalizeTimeFormat(raw?.horaFin),
    espacio: canonicalSpace,
    responsable: (raw?.responsable || '').trim() || 'No especificado',
    tipoActividad: (raw?.tipoActividad || '').trim() || 'OTROS',
    descripcion: (raw?.descripcion || '').trim(),
    estado: canonicalStatus,
    terminaDiaSiguiente: Boolean(raw?.terminaDiaSiguiente),
    serieRecurrente: canonicalSeriesId || undefined,
    recurrenteId: canonicalSeriesId || undefined,
    createdAt: toIsoString(raw?.createdAt) || undefined,
    updatedAt: toIsoString(raw?.updatedAt) || undefined,
    fechaInicioRecurrencia: raw?.fechaInicioRecurrencia ? toDateString(raw.fechaInicioRecurrencia) : undefined,
    fechaFinRecurrencia: raw?.fechaFinRecurrencia ? toDateString(raw.fechaFinRecurrencia) : undefined
  };
}

/**
 * Validates and normalizes domain invariants for a reservation before Firestore persistence:
 * 1. Synchronizes `serieRecurrente` and `recurrenteId` bidirectionally so neither is lost across versions.
 * 2. Guarantees mandatory security rule fields (`id`, `fecha`, `horaInicio`, `horaFin`, `espacio`, `responsable`, `tipoActividad`, `descripcion`) are non-empty strings.
 * 3. Strips non-serializable fields, symbols, and undefined values.
 */
export function cleanReservationForFirestore(reservation: Reservation): Record<string, any> {
  const canonicalSeriesId = (reservation.serieRecurrente || reservation.recurrenteId || '').trim();
  const canonicalSpace = normalizeSpaceName(reservation.espacio);
  const canonicalStatus = normalizeReservationStatus(reservation);

  const normalized: Reservation = {
    ...reservation,
    id: (reservation.id || '').trim() || `RSV_${Date.now().toString(36).toUpperCase()}`,
    fecha: toDateString(reservation.fecha),
    horaInicio: normalizeTimeFormat(reservation.horaInicio),
    horaFin: normalizeTimeFormat(reservation.horaFin),
    espacio: canonicalSpace,
    responsable: (reservation.responsable || '').trim() || 'No especificado',
    tipoActividad: (reservation.tipoActividad || '').trim() || 'OTROS',
    descripcion: (reservation.descripcion || '').trim(),
    estado: canonicalStatus,
    serieRecurrente: canonicalSeriesId || undefined,
    recurrenteId: canonicalSeriesId || undefined,
    updatedAt: reservation.updatedAt || new Date().toISOString()
  };

  return cleanForFirestore(normalized);
}

// ============================================================================
// CACHING & VERSIONED LOCALSTORAGE REPOSITORY
// ============================================================================

/**
 * Cleans up legacy cache keys to prevent localStorage bloating and quota errors.
 */
function cleanupLegacyStorageKeys(): void {
  if (!isBrowser) return;
  try {
    LEGACY_STORAGE_KEYS.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch {
        // Ignore removal error
      }
    });
  } catch {
    // Ignore error
  }
}

/**
 * Returns current cache version and synchronization state.
 */
export function getCacheVersionInfo(): {
  version: number;
  schemaVersion: string;
  dataHash: string;
  lastFirestoreHash: string | null;
  count: number;
  timestamp: number;
  lastSyncTime: number | null;
} {
  const meta = getLocalCacheMetadata();
  return {
    version: meta?.version ?? CURRENT_CACHE_VERSION,
    schemaVersion: meta?.schemaVersion ?? CACHE_SCHEMA_VERSION,
    dataHash: meta?.dataHash ?? inMemoryDataHash ?? '',
    lastFirestoreHash: meta?.lastFirestoreHash ?? inMemoryLastFirestoreHash ?? null,
    count: meta?.count ?? inMemoryReservationsCache?.length ?? 0,
    timestamp: meta?.timestamp ?? Date.now(),
    lastSyncTime: meta?.lastSyncTime ?? null
  };
}

/**
 * Retrieves the timestamp (epoch ms) of the last successful synchronization with Firestore / cloud,
 * or null if no cloud synchronization has occurred yet.
 */
export function getLastSyncTime(): number | null {
  const meta = getLocalCacheMetadata();
  return meta?.lastSyncTime ?? null;
}

/**
 * Updates the last successful sync timestamp in the local cache metadata and dispatches an event.
 */
export function setLastSyncTime(timestamp: number = Date.now()): void {
  const meta = getLocalCacheMetadata();
  if (meta) {
    setLocalCacheMetadata({
      ...meta,
      lastSyncTime: timestamp
    });
  }
}

/**
 * Retrieves the versioned metadata header from LocalStorage.
 */
export function getLocalCacheMetadata(): CacheVersionMetadata | null {
  if (!isBrowser) return null;
  try {
    const raw = localStorage.getItem(CACHE_METADATA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheVersionMetadata;
      if (parsed && typeof parsed.version === 'number' && parsed.dataHash) {
        return parsed;
      }
    }
  } catch {
    // Ignore read error
  }
  return null;
}

/**
 * Writes or updates the versioned metadata header in LocalStorage and notifies active subscribers.
 */
function setLocalCacheMetadata(meta: CacheVersionMetadata): void {
  if (!isBrowser) return;
  try {
    localStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(meta));
    window.dispatchEvent(
      new CustomEvent('cache-sync-updated', {
        detail: {
          lastSyncTime: meta.lastSyncTime,
          timestamp: meta.timestamp,
          count: meta.count,
          dataHash: meta.dataHash
        }
      })
    );
  } catch (err) {
    console.warn('Could not persist cache metadata to localStorage:', err);
  }
}

/**
 * Helper to determine if a reservation was marked as deleted or is inactive.
 */
export function isReservationExplicitlyDeleted(
  r: Partial<Reservation> | null | undefined,
  deletedSet?: Set<string>
): boolean {
  if (!r) return true;
  const set = deletedSet || getDeletedIds();
  if (r.id && set.has(r.id)) return true;
  if ((r as any).eliminada === true) return true;
  const rawStatus = String(r.estado || (r as any).status || '').trim().toLowerCase();
  if (['eliminada', 'eliminado', 'deleted'].includes(rawStatus)) return true;
  if (!isReservationActiveForAvailability(r)) return true;
  return false;
}

/**
 * Reads reservations from the versioned LocalStorage cache (with automatic legacy fallback & migration).
 */
export function getLocalCache(): Reservation[] {
  const deletedSet = getDeletedIds();

  // Fast path: In-memory cache is valid
  if (inMemoryReservationsCache !== null) {
    return inMemoryReservationsCache.filter(
      r => !isReservationExplicitlyDeleted(r, deletedSet) && !isChileanHoliday(r.fecha)
    );
  }

  if (!isBrowser) return [];

  // Attempt reading current version from localStorage
  try {
    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter(
          r => !isReservationExplicitlyDeleted(r, deletedSet) && !isChileanHoliday(r.fecha)
        );
        inMemoryReservationsCache = filtered;
        inMemoryDataHash = calculateReservationsHash(filtered);
        return filtered;
      }
    }
  } catch (e) {
    console.warn(`Error reading local cache (${LOCAL_STORAGE_KEY}) from localStorage:`, e);
  }

  // Attempt automatic migration from previous cache versions (e.g. v5, v4)
  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    try {
      const legacyCached = localStorage.getItem(legacyKey);
      if (legacyCached) {
        const parsed = JSON.parse(legacyCached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const migrated = parsed.filter(
            r => !isReservationExplicitlyDeleted(r, deletedSet) && !isChileanHoliday(r.fecha)
          );
          if (migrated.length > 0) {
            // Write to current version format and cleanup old keys
            setLocalCache(migrated);
            cleanupLegacyStorageKeys();
            return migrated;
          }
        }
      }
    } catch {
      // Continue to next legacy key
    }
  }

  // Fallback to static initial dataset
  const fallback = INITIAL_RESERVATIONS.filter(
    r => !isReservationExplicitlyDeleted(r, deletedSet) && !isChileanHoliday(r.fecha)
  );
  inMemoryReservationsCache = fallback;
  inMemoryDataHash = calculateReservationsHash(fallback);
  return fallback;
}

/**
 * Persists reservations to the versioned LocalStorage cache, IndexedDB, and in-memory cache,
 * updating the versioned data hash and synchronization metadata.
 */
export function setLocalCache(
  data: readonly Reservation[],
  options?: { lastFirestoreHash?: string | null; lastSyncTime?: number | null }
): void {
  try {
    const deletedSet = getDeletedIds();
    const cleanData = data.filter(
      r => !isReservationExplicitlyDeleted(r, deletedSet) && !isChileanHoliday(r.fecha)
    );

    const newDataHash = calculateReservationsHash(cleanData);
    const existingMeta = getLocalCacheMetadata();

    // Update in-memory cache
    inMemoryReservationsCache = cleanData;
    inMemoryDataHash = newDataHash;
    if (options?.lastFirestoreHash !== undefined) {
      inMemoryLastFirestoreHash = options.lastFirestoreHash;
    }

    // Persist full dataset to IndexedDB (asynchronously handles large datasets without quota limit)
    setIndexedDbReservations(cleanData).catch(err => {
      console.warn('Error persisting reservations to IndexedDB:', err);
    });

    // Write versioned payload to LocalStorage safely (stripping heavy base64 attachments to prevent QuotaExceededError)
    const localStoragePayload = cleanData.map(r => {
      if (r.cartaCompromisoAdjunta?.dataUrl && r.cartaCompromisoAdjunta.dataUrl.length > 500) {
        return {
          ...r,
          cartaCompromisoAdjunta: {
            ...r.cartaCompromisoAdjunta,
            dataUrl: '' // Retained fully in IndexedDB and memory
          }
        };
      }
      return r;
    });

    if (isBrowser) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localStoragePayload));
      } catch (storageErr) {
        // If quota exceeded, clear older legacy keys and attempt single retry
        cleanupLegacyStorageKeys();
        try {
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localStoragePayload));
        } catch {
          console.warn('LocalStorage quota limit reached; dataset safely stored in IndexedDB and in-memory.');
        }
      }
    }

    // Update versioned cache metadata header
    const syncTime = options?.lastSyncTime !== undefined
      ? options.lastSyncTime
      : (options?.lastFirestoreHash ? Date.now() : (existingMeta?.lastSyncTime ?? null));

    const metadata: CacheVersionMetadata = {
      version: CURRENT_CACHE_VERSION,
      schemaVersion: CACHE_SCHEMA_VERSION,
      dataHash: newDataHash,
      lastFirestoreHash: options?.lastFirestoreHash !== undefined
        ? options.lastFirestoreHash
        : (existingMeta?.lastFirestoreHash ?? inMemoryLastFirestoreHash),
      timestamp: Date.now(),
      count: cleanData.length,
      lastSyncTime: syncTime
    };

    setLocalCacheMetadata(metadata);
  } catch (e) {
    console.warn('Error in setLocalCache:', e);
  }
}

/**
 * Checks whether the local cache data is in perfect hash synchrony with Firestore.
 */
export function isCacheInSyncWithFirestore(): boolean {
  const meta = getLocalCacheMetadata();
  if (!meta || !meta.lastFirestoreHash || !meta.dataHash) return false;
  return meta.dataHash === meta.lastFirestoreHash;
}

// ============================================================================
// REAL-TIME FIRESTORE SUBSCRIPTIONS (HASH-GATED SYNC)
// ============================================================================

export function subscribeToReservations(
  onData: (reservations: Reservation[], isFromFirestore: boolean, isRevalidating?: boolean, lastSyncTime?: number | null) => void,
  onError: (error: any) => void
): Unsubscribe {
  let subscribed = true;
  let serverConfirmed = false;
  // Emit local versioned cache immediately (0ms perceived UI delay)
  const initial = getLocalCache();
  const initialMeta = getLocalCacheMetadata();
  onData(initial, false, true, initialMeta?.lastSyncTime ?? null);

  // Asynchronously hydrate from IndexedDB if in-memory cache is cold or default
  if (!inMemoryReservationsCache || inMemoryReservationsCache.length <= INITIAL_RESERVATIONS.length) {
    getIndexedDbReservations().then((idbData) => {
      if (!subscribed || serverConfirmed) return;
      if (idbData && idbData.length > 0) {
        const deletedSet = getDeletedIds();
        const filtered = idbData.filter(
          r => !deletedSet.has(r.id) && !isChileanHoliday(r.fecha)
        );
        inMemoryReservationsCache = filtered;
        inMemoryDataHash = calculateReservationsHash(filtered);
        const curMeta = getLocalCacheMetadata();
        onData(filtered, false, true, curMeta?.lastSyncTime ?? null);
      }
    }).catch(err => console.warn('IndexedDB initial hydration error:', err));
  }

  try {
    const db = getDb();
    const reservasCol = collection(db, COLLECTION_NAME);

    const activeWindowStartDate = getActiveWindowStartDate();

    const activeQuery = query(
      reservasCol,
      where('fecha', '>=', activeWindowStartDate),
      orderBy('fecha', 'asc')
    );

    const unsubscribe = onSnapshot(
      activeQuery,
      (snapshot) => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          onData(getLocalCache(), false, !snapshot.metadata.fromCache, getLastSyncTime());
          return;
        }
        serverConfirmed = true;
        const deletedSet = getDeletedIds();
        if (!snapshot.empty) {
          const list: Reservation[] = [];

          snapshot.forEach((docSnap) => {
            const rawData = docSnap.data();
            // Filter out documents deleted in this session or marked as deleted
            if (deletedSet.has(docSnap.id) || isReservationExplicitlyDeleted(rawData, deletedSet)) {
              if (rawData && (rawData.estado === 'eliminada' || rawData.eliminada === true)) {
                recordDeletedId(docSnap.id);
              }
              return;
            }
            list.push(normalizeReservationFromFirestore(docSnap.id, rawData));
          });

          // Non-destructively merge active window with historical cache
          const currentCached = getLocalCache();
          const historical = currentCached.filter(r => r.fecha < activeWindowStartDate);
          const sorted = [...historical, ...list].sort(compareReservationsByDate);

          // Compute incoming snapshot hash
          const incomingFirestoreHash = calculateReservationsHash(sorted);
          const currentMeta = getLocalCacheMetadata();
          const currentLocalHash = currentMeta?.dataHash ?? inMemoryDataHash ?? calculateReservationsHash(getLocalCache());
          const syncTimestamp = Date.now();

          // HASH CHECK: If Firestore payload hash matches local cache hash, skip redundant state churn
          if (incomingFirestoreHash === currentLocalHash && inMemoryReservationsCache && inMemoryReservationsCache.length > 0) {
            if (currentMeta) {
              setLocalCacheMetadata({
                ...currentMeta,
                lastFirestoreHash: incomingFirestoreHash,
                lastSyncTime: syncTimestamp
              });
            }
            inMemoryLastFirestoreHash = incomingFirestoreHash;
            onData(sorted, true, false, syncTimestamp);
            return;
          }

          // Hashes differ: update versioned cache & notify subscribers
          setLocalCache(sorted, {
            lastFirestoreHash: incomingFirestoreHash,
            lastSyncTime: syncTimestamp
          });
          onData(sorted, true, false, syncTimestamp);
        } else {
          const historical = getLocalCache().filter(r => r.fecha < activeWindowStartDate);
          const syncTimestamp = Date.now();
          setLocalCache(historical, { lastSyncTime: syncTimestamp });
          onData(historical, true, false, syncTimestamp);
        }
      },
      (error) => {
        if (error?.code === 'resource-exhausted') {
          console.warn('Firestore quota reached; operating safely with versioned local storage cache.');
        } else {
          console.warn('Firestore subscription notice:', error?.message || error);
        }
        onError(error);
      }
    );

    return () => { subscribed = false; unsubscribe(); };
  } catch (err) {
    console.warn('Firestore initialization error:', err);
    onError(err);
    return () => {};
  }
}

// ============================================================================
// PARTITIONED DATE-WINDOW QUERIES (OPTIMIZATION STEP 2)
// ============================================================================

/**
 * Subscribes only to reservations falling within a specific date interval [startDate, endDate],
 * drastically reducing Firestore read consumption when viewing specific months or quarters.
 */
export function subscribeToReservationsByDateRange(
  startDate: string,
  endDate: string,
  onData: (reservations: Reservation[], isFromFirestore: boolean, isRevalidating?: boolean) => void,
  onError: (error: any) => void
): Unsubscribe {
  // Immediately emit filtered items from local versioned cache
  const localData = getLocalCache();
  const filteredLocal = localData.filter(r => r.fecha >= startDate && r.fecha <= endDate);
  onData(filteredLocal, false, true);

  try {
    const db = getDb();
    const reservasCol = collection(db, COLLECTION_NAME);
    const rangeQuery = query(
      reservasCol,
      where('fecha', '>=', startDate),
      where('fecha', '<=', endDate),
      orderBy('fecha', 'asc')
    );

    const unsubscribe = onSnapshot(
      rangeQuery,
      (snapshot) => {
        if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) {
          onData(getLocalCache().filter(r => r.fecha >= startDate && r.fecha <= endDate), false, false);
          return;
        }
        const deletedSet = getDeletedIds();
        const list: Reservation[] = [];

        snapshot.forEach((docSnap) => {
          const rawData = docSnap.data();
          if (deletedSet.has(docSnap.id) || isReservationExplicitlyDeleted(rawData, deletedSet)) {
            if (rawData && (rawData.estado === 'eliminada' || rawData.eliminada === true)) {
              recordDeletedId(docSnap.id);
            }
            return;
          }
          list.push(normalizeReservationFromFirestore(docSnap.id, rawData));
        });

        const sorted = list.sort(compareReservationsByDate);

        // Merge range slice back into global cache non-destructively
        const currentCache = getLocalCache();
        const otherDates = currentCache.filter(r => r.fecha < startDate || r.fecha > endDate);
        const merged = [...otherDates, ...sorted].sort(compareReservationsByDate);

        setLocalCache(merged, { lastSyncTime: Date.now() });
        onData(sorted, true, false);
      },
      (error) => {
        console.warn('Firestore date-window query notice, falling back to local cache:', error);
        onError(error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Date-window query initialization failed:', err);
    onError(err);
    return () => {};
  }
}

/**
 * Fetches reservations strictly within a date window on demand (one-shot query)
 */
export async function fetchReservationsByDateRange(
  startDate: string,
  endDate: string
): Promise<Reservation[]> {
  if (!startDate || !endDate || startDate > endDate) return [];
  const key = `${startDate}:${endDate}`;
  const local = () => getLocalCache().filter(r => r.fecha >= startDate && r.fecha <= endDate);
  if (isDateRangeFresh(key)) return local();
  // A confirmed parent interval already contains every document needed by this request.
  for (const range of dateRangeSyncTimes.keys()) {
    const [coveredStart, coveredEnd] = range.split(':');
    if (coveredStart <= startDate && coveredEnd >= endDate && isDateRangeFresh(range)) return local();
  }
  const pending = pendingDateRanges.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const rangeQuery = query(collection(getDb(), COLLECTION_NAME),
        where('fecha', '>=', startDate), where('fecha', '<=', endDate), orderBy('fecha', 'asc'));
      const snapshot = await getDocs(rangeQuery);
      if (snapshot.metadata.fromCache) return local();
      recordFirestoreRead('reservas_historicas', Math.max(1, snapshot.size));
      const deletedSet = getDeletedIds();
      const list = snapshot.docs
        .filter(d => {
          const data = d.data();
          if (data.estado === 'eliminada' || data.eliminada === true) recordDeletedId(d.id);
          return !deletedSet.has(d.id) && !isReservationExplicitlyDeleted(data, deletedSet);
        })
        .map(d => normalizeReservationFromFirestore(d.id, d.data()))
        .sort(compareReservationsByDate);
      const otherDates = getLocalCache().filter(r => r.fecha < startDate || r.fecha > endDate);
      setLocalCache([...otherDates, ...list].sort(compareReservationsByDate));
      dateRangeSyncTimes.set(key, Date.now());
      for (const [range, time] of dateRangeSyncTimes) {
        if (Date.now() - time >= firestoreReadPolicy.historicalCacheMs) dateRangeSyncTimes.delete(range);
      }
      if (isBrowser) {
        try {
          // Persist freshness only when the canonical cache is also available after reload.
          if (localStorage.getItem(LOCAL_STORAGE_KEY)) {
            localStorage.setItem(DATE_RANGE_SYNC_KEY, JSON.stringify(Object.fromEntries(dateRangeSyncTimes)));
          }
        } catch { /* Storage unavailable: retain the in-memory cache. */ }
      }
      return list;
    } catch (error) {
      console.warn('Date-range query failed, serving local cache:', error);
      return local();
    }
  })();
  pendingDateRanges.set(key, request);
  try { return await request; }
  finally { pendingDateRanges.delete(key); }
}

// ============================================================================
// HISTORICAL PARTITIONING (ON-DEMAND MONTH / RANGE LOADER)
// ============================================================================

export const DEFAULT_ACTIVE_WINDOW_DAYS = firestoreReadPolicy.activeWindowDays;

export function getActiveWindowStartDate(daysBack: number = DEFAULT_ACTIVE_WINDOW_DAYS): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DATE_RANGE_SYNC_KEY = 'reservas_date_range_sync_v1';
const pendingDateRanges = new Map<string, Promise<Reservation[]>>();
const dateRangeSyncTimes = new Map<string, number>();

function isDateRangeFresh(key: string): boolean {
  if (isBrowser && dateRangeSyncTimes.size === 0) {
    try {
      if (localStorage.getItem(LOCAL_STORAGE_KEY)) {
        const stored = JSON.parse(localStorage.getItem(DATE_RANGE_SYNC_KEY) || '{}');
        for (const [range, time] of Object.entries(stored)) {
          if (typeof time === 'number') dateRangeSyncTimes.set(range, time);
        }
      }
    } catch { /* Ignore corrupt or unavailable storage. */ }
  }
  const time = dateRangeSyncTimes.get(key);
  const age = time === undefined ? Infinity : Date.now() - time;
  return age >= 0 && age < firestoreReadPolicy.historicalCacheMs;
}

export function isHistoricalMonthLoaded(yearMonth: string): boolean {
  const monthKey = yearMonth.slice(0, 7);
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return isDateRangeFresh(`${monthKey}-01:${monthKey}-${String(lastDay).padStart(2, '0')}`);
}

/**
 * Loads reservations for a specific historical month (e.g. year: 2025, month: 11)
 * strictly on demand from Firestore, recording read metrics and merging into the
 * local cache without full-collection scanning.
 */
export async function loadHistoricalReservationsMonth(
  year: number,
  month: number
): Promise<Reservation[]> {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return [];
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const lastDay = new Date(year, month, 0).getDate();
  return fetchReservationsByDateRange(`${monthKey}-01`, `${monthKey}-${String(lastDay).padStart(2, '0')}`);
}

/** Loads a historical range using the same deduplication and freshness policy as months. */
export async function loadHistoricalReservationsRange(startDate: string, endDate: string): Promise<Reservation[]> {
  return fetchReservationsByDateRange(startDate, endDate);
}

// ============================================================================
// MUTATIONS (CONFIRMED WRITES AND CURRENT-CACHE MERGING)
// ============================================================================

export async function commitReservationChanges(reservas: readonly Reservation[], options: WriteOptions = {}): Promise<WriteResult> {
  const db = getDb();
  if (!db) throw new Error('No hay conexión con la base de datos. El borrador se conservará para reintentar.');
  return writeReservations(db, reservas, cleanReservationForFirestore, {
    actor: getStoredAuthUser()?.username,
    ...options,
    onProgress: (result) => {
      const map = new Map(getLocalCache().map(r => [r.id, r]));
      result.deletedIds.forEach(id => map.delete(id));
      recordDeletedIds(result.deletedIds);
      result.reservations.forEach(r => map.set(r.id, r));
      unrecordDeletedIds(result.reservations.map(r => r.id));
      setLocalCache(Array.from(map.values()).sort(compareReservationsByDate));
      setLastSyncTime(Date.now());
      if (isBrowser) window.dispatchEvent(new CustomEvent('reservation-write-progress', { detail: result }));
      options.onProgress?.(result);
    }
  });
}

export async function saveReservation(reserva: Reservation, options: WriteOptions = {}): Promise<WriteResult> {
  return commitReservationChanges([reserva], options);
}

const pendingReservationReads = new Map<string, Promise<Reservation | null>>();
export async function fetchReservationById(id: string): Promise<Reservation | null> {
  const pending = pendingReservationReads.get(id);
  if (pending) return pending;
  const db = getDb();
  if (!db) throw new Error('No hay conexión para consultar la actividad relacionada.');
  const request = getDoc(doc(db, COLLECTION_NAME, id)).then(snapshot =>
    snapshot.exists() ? normalizeReservationFromFirestore(snapshot.id, snapshot.data()) : null);
  pendingReservationReads.set(id, request);
  try { return await request; }
  finally { if (pendingReservationReads.get(id) === request) pendingReservationReads.delete(id); }
}

export async function saveReservationsBatch(reservas: readonly Reservation[], options: WriteOptions = {}): Promise<WriteResult> {
  return commitReservationChanges(reservas, options);
}

export async function resumeReservationOperation(id: string): Promise<WriteResult> {
  const operation = (await readPendingOperations()).find(o => o.id === id);
  if (!operation) throw new Error('La operación ya fue completada o no está disponible.');
  const user = getStoredAuthUser();
  if (operation.reservations.some(r => r.reemplazaReservaId) && (!userCanCreateReservations(user) || !userCanEditReservations(user))) throw new Error('No tienes permisos para reanudar un reemplazo.');
  if (!user || (operation.actor && operation.actor !== user.username) || operation.reservations.some(r=>operation.intent === 'update' || r.version ? !userCanEditReservations(user) : !userCanCreateReservations(user)) || (operation.deletedIds.length && !userCanDeleteReservations(user))) throw new Error('No tienes permisos para reanudar esta operación.');
  return commitReservationChanges(operation.reservations.filter(r=>!operation.confirmedIds.includes(r.id)), {
    operationId: operation.id, deletedIds: operation.deletedIds.filter(id => !operation.confirmedIds.includes(id)),
    allowConflictOverride: operation.allowConflictOverride, intent: operation.intent, requireAtomic: operation.requireAtomic, expectedVersions: operation.expectedVersions
  });
}

export async function deleteReservationById(id: string): Promise<WriteResult> {
  return commitReservationChanges([], { deletedIds: [id] });
}

export async function deleteReservationsBatch(ids: string[]): Promise<number> {
  const result = await commitReservationChanges([], { deletedIds: ids });
  return result.deletedIds.length;
}

export async function deleteSeriesByRecurrenteId(recurrenteId: string, knownIds?: string[]): Promise<number> {
  const ids = new Set(knownIds || []);
  getLocalCache().forEach(r => { if (r.recurrenteId === recurrenteId || r.serieRecurrente === recurrenteId) ids.add(r.id); });
  return deleteReservationsBatch([...ids]);
}

export async function seedAllToFirestore(
  reservations: readonly Reservation[],
  force = false
): Promise<{ count: number; skipped?: boolean; error?: string }> {
  try {
    const targetHash = calculateReservationsHash(reservations);
    const meta = getLocalCacheMetadata();

    // Check if remote is already in sync with this exact hash
    if (!force && meta?.lastFirestoreHash === targetHash) {
      console.log('Dataset hash is already in sync with Firestore; skipping redundant batch writes.');
      return { count: reservations.length, skipped: true };
    }

    const db = getDb();
    const remote = await getDocs(collection(db, COLLECTION_NAME));
    const previous = new Map(remote.docs.map(d=>[d.id,d.data() as Reservation]));
    const targets = reservations.map(r=>({ ...r, version: previous.get(r.id)?.version || 0 }));
    const targetIds = new Set(targets.map(r=>r.id));
    const deletedIds = force ? remote.docs.filter(d=>!targetIds.has(d.id)).map(d=>d.id) : [];
    const result = await commitReservationChanges(targets, { deletedIds, allowConflictOverride: force });
    const confirmed = force ? result.reservations : getLocalCache();
    setLocalCache(confirmed, { lastFirestoreHash: calculateReservationsHash(confirmed), lastSyncTime: Date.now() });

    return { count: reservations.length, skipped: false };
  } catch (error: any) {
    return { count: 0, error: error?.message || 'Error en sincronización masiva con Firestore' };
  }
}

export async function reloadAllFromFirestore(): Promise<Reservation[]> {
  const db = getDb();
  const reservasCol = collection(db, COLLECTION_NAME);
  const snapshot = await getDocs(reservasCol);
  const list: Reservation[] = [];

  snapshot.forEach((docSnap) => {
    list.push(normalizeReservationFromFirestore(docSnap.id, docSnap.data()));
  });

  list.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    return a.horaInicio.localeCompare(b.horaInicio);
  });

  if (list.length > 0) {
    const newHash = calculateReservationsHash(list);
    setLocalCache(list, {
      lastFirestoreHash: newHash,
      lastSyncTime: Date.now()
    });
  }
  return list;
}

// ============================================================================
// TARGETED FIRESTORE QUERIES (OPTIMIZED READS & SERVER-SIDE FILTERING)
// ============================================================================

/**
 * Queries reservations for a specific calendar date directly from Firestore.
 * Requires single-field index on `fecha` (default in Firestore).
 */
export async function queryReservationsByDate(fecha: string): Promise<Reservation[]> {
  const db = getDb();
  const reservasCol = collection(db, COLLECTION_NAME);
  const q = query(reservasCol, where('fecha', '==', fecha.trim()));
  const snapshot = await getDocs(q);
  const results: Reservation[] = [];
  snapshot.forEach((docSnap) => {
    results.push(normalizeReservationFromFirestore(docSnap.id, docSnap.data()));
  });
  return results.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
}

/**
 * Queries reservations within a date range [startDate, endDate], optionally constrained to a space.
 * Efficiently uses Firestore range filter on `fecha`.
 */
export async function queryReservationsByDateRange(
  startDate: string,
  endDate: string,
  espacio?: string
): Promise<Reservation[]> {
  const db = getDb();
  const reservasCol = collection(db, COLLECTION_NAME);
  const canonSpace = espacio ? normalizeSpaceName(espacio) : null;
  const constraints = [
    ...(canonSpace ? [where('espacio', '==', canonSpace)] : []),
    where('fecha', '>=', startDate),
    where('fecha', '<=', endDate),
    orderBy('fecha')
  ];
  const snapshot = await getDocs(query(reservasCol, ...constraints));
  const results: Reservation[] = [];
  snapshot.forEach((docSnap) => {
    results.push(normalizeReservationFromFirestore(docSnap.id, docSnap.data()));
  });
  return results.sort(compareReservationsByDate);
}

/**
 * Queries all occurrences of a recurring series by its canonical series ID.
 * Optionally filters for occurrences on or after a given date ("esta y las siguientes").
 */
export async function queryReservationsBySeries(
  seriesId: string,
  fromDate?: string
): Promise<Reservation[]> {
  if (!seriesId) return [];
  const db = getDb();
  const reservasCol = collection(db, COLLECTION_NAME);
  const constraints = [
    where('serieRecurrente', '==', seriesId),
    ...(fromDate ? [where('fecha', '>=', fromDate)] : []),
    orderBy('fecha')
  ];
  const snapshot = await getDocs(query(reservasCol, ...constraints));
  const results: Reservation[] = [];
  snapshot.forEach((docSnap) => {
    results.push(normalizeReservationFromFirestore(docSnap.id, docSnap.data()));
  });
  return results;
}

/**
 * Targeted availability verification on Firestore:
 * Checks if a specific space is booked during the requested date and time interval,
 * respecting mutual room exclusions and conflict detection rules.
 */
export async function checkFirestoreAvailability(
  espacio: string,
  fecha: string,
  horaInicio: string,
  horaFin: string,
  excludeReservationId?: string,
  terminaDiaSiguiente?: boolean
): Promise<{ available: boolean; conflicts: Reservation[] }> {
  const dateReservations = await queryReservationsByDate(fecha);
  const candidate: Partial<Reservation> = {
    espacio,
    fecha,
    horaInicio,
    horaFin,
    terminaDiaSiguiente: Boolean(terminaDiaSiguiente)
  };

  const conflicts = checkSingleConflict(candidate, dateReservations, excludeReservationId);

  return {
    available: conflicts.length === 0,
    conflicts
  };
}

/**
 * Permanently deletes all reservations scheduled on Chilean holiday dates from both Local Storage and Firestore.
 */
export async function deleteAllHolidayReservations(): Promise<{
  deletedCount: number;
  deletedReservations: Reservation[];
  remainingReservations: Reservation[];
}> {
  const current = getLocalCache();
  // Protect reservations that have explicit authorization (e.g. key CCD or extended schedule)
  const toDelete = current.filter((r) => isChileanHoliday(r.fecha) && !r.claveAutorizacion && !r.claveAutorizacionFeriado && !r.horarioExtendidoAutorizado);
  const remaining = current.filter((r) => !toDelete.some(del => del.id === r.id));

  if (toDelete.length > 0) {
    await deleteReservationsBatch(toDelete.map(r => r.id));
  }

  return {
    deletedCount: toDelete.length,
    deletedReservations: toDelete,
    remainingReservations: remaining
  };
}

function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function isClosedHourTime(timeStr: string): boolean {
  if (!timeStr) return true;
  const m = timeToMinutes(timeStr) % 60;
  return m === 0;
}

function isClosedHourReservation(r: Reservation): boolean {
  return isClosedHourTime(r.horaInicio) && isClosedHourTime(r.horaFin);
}

/**
 * Permanently deletes all reservations that have time conflicts/copamientos with round-hour reservations,
 * ensuring closed-hour reservations (e.g. 10:00-11:00, 18:00-19:00) are preserved and minute-offset duplicates are removed.
 */
export async function cleanConflictingMinuteReservations(currentReservations?: Reservation[]): Promise<{
  deletedCount: number;
  deletedReservations: Reservation[];
  remainingReservations: Reservation[];
}> {
  const current = currentReservations && currentReservations.length > 0 ? currentReservations : getLocalCache();
  
  // Group by space and date
  const groups = new Map<string, Reservation[]>();
  current.forEach((r) => {
    const key = `${r.espacio.trim().toUpperCase()}___${r.fecha.trim()}`;
    const list = groups.get(key) || [];
    list.push(r);
    groups.set(key, list);
  });

  const idsToDelete = new Set<string>();

  // Detect conflicting pairs and identify minute-offset ones to delete
  groups.forEach((items) => {
    if (items.length < 2) return;

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        const sA = timeToMinutes(a.horaInicio);
        const eA = timeToMinutes(a.horaFin);
        const sB = timeToMinutes(b.horaInicio);
        const eB = timeToMinutes(b.horaFin);

        // Check if there is an overlap
        if (sA < eB && sB < eA) {
          const aClosed = isClosedHourReservation(a);
          const bClosed = isClosedHourReservation(b);

          if (aClosed && !bClosed) {
            idsToDelete.add(b.id);
          } else if (!aClosed && bClosed) {
            idsToDelete.add(a.id);
          } else if (!aClosed && !bClosed) {
            const devA = (sA % 60) + (eA % 60);
            const devB = (sB % 60) + (eB % 60);
            if (devB >= devA) {
              idsToDelete.add(b.id);
            } else {
              idsToDelete.add(a.id);
            }
          }
        }
      }
    }
  });

  const toDelete = current.filter((r) => idsToDelete.has(r.id));
  const remaining = current.filter((r) => !idsToDelete.has(r.id));

  if (toDelete.length > 0) {
    await deleteReservationsBatch(toDelete.map(r => r.id));
  }

  return {
    deletedCount: toDelete.length,
    deletedReservations: toDelete,
    remainingReservations: remaining
  };
}

/**
 * Periodically purges historical `schedule_slots` concurrency documents older than
 * `daysOld` (default 30 days) to keep Firestore within quotas and reduce query overhead.
 * Runs at most once every 7 days.
 */
export async function purgeExpiredScheduleSlots(daysOld: number = 30): Promise<number> {
  const PURGE_KEY = 'espacios_last_slot_purge_v1';
  try {
    const lastPurge = localStorage.getItem(PURGE_KEY);
    const now = Date.now();
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    if (lastPurge && now - Number(lastPurge) < SEVEN_DAYS_MS) {
      return 0; // Throttle: already checked within the last 7 days
    }

    // Call backend endpoint to safely purge on server side with Firebase admin permissions
    const token = localStorage.getItem('espacios_auth_token_v2') || sessionStorage.getItem('espacios_auth_token_v2') || '';
    const res = await fetch('/api/admin/purge-expired-slots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ daysOld })
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem(PURGE_KEY, String(now));
      return data.purgedCount || 0;
    }
    
    // Throttled update to avoid spamming
    localStorage.setItem(PURGE_KEY, String(now));
    return 0;
  } catch {
    return 0;
  }
}


