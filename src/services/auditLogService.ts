import { dataRequest, usesDataApi } from '../firebase/gateway';
import { getLastReservationAuditEntry } from './reservationWriter';
import { sharedOnSnapshot as onSnapshot } from '../firebase/sharedSnapshot';
import {
  collection,
  doc,
  query,
  orderBy,
  limit,
  Unsubscribe
} from '../firebase/gateway';
import { getDb } from '../firebase/config';
import {
  Reservation,
  AuditChangeLogEntry,
  AuditActionType,
  AuditFieldDiff
} from '../types';
import { AuthUser, getCurrentUser, isCoordinatorOrAdmin } from './authService';
import {
  commitReservationChanges,
  cleanForFirestore
} from './reservationService';
import {
  getIndexedDbAuditLogs,
  setIndexedDbAuditLogs
} from '../utils/indexedDbStorage';
import { sanitizeAuditEntriesForLocalStorage } from './storageService';
import { AuditNotSyncedError, fetchFullAuditEntry, persistAuditEntry } from './auditSnapshotService';
import { auditStateRows, buildAuditRestorePlan, isDeletionAction } from '../utils/auditRestore';
import { getDocFromServer } from '../firebase/gateway';

const AUDIT_COLLECTION_NAME = 'audit_logs';
const AUDIT_STORAGE_KEY = 'cc_audit_changelog_v1';
const MAX_LOCAL_AUDIT_ENTRIES = 15;

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

let inMemoryAuditLogs: AuditChangeLogEntry[] | null = null;
let hydration: Promise<void> | null = null;
let restoreInFlight = false;

/** Preserve full snapshots and monotonic revert status when merging caches. */
function mergeAuditHistory(...sources: AuditChangeLogEntry[][]): AuditChangeLogEntry[] {
  const byId = new Map<string, AuditChangeLogEntry>();
  for (const source of sources) for (const entry of source) {
    const old = byId.get(entry.id);
    byId.set(entry.id, { ...old, ...entry,
      previousState: entry.previousState ?? old?.previousState,
      newState: entry.newState ?? old?.newState,
      isReverted: Boolean(old?.isReverted || entry.isReverted),
      revertedAt: entry.revertedAt || old?.revertedAt,
      revertedBy: entry.revertedBy || old?.revertedBy });
  }
  return [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function hydrateAuditHistory(): Promise<void> {
  if (!hydration) hydration = getIndexedDbAuditLogs().then(entries => {
    if (entries?.length) saveAuditHistory(mergeAuditHistory(entries, inMemoryAuditLogs || []));
  }).catch(err => console.warn('Error hydrating audit logs from IndexedDB:', err));
  return hydration;
}

const FIELD_LABELS: Record<string, string> = {
  fecha: 'Fecha',
  horaInicio: 'Hora Inicio',
  horaFin: 'Hora Término',
  espacio: 'Espacio / Sala',
  responsable: 'Responsable',
  tipoActividad: 'Tipo de Actividad',
  tipoPrestamo: 'Tipo de Préstamo',
  descripcion: 'Descripción',
  cantidadParticipantes: 'Aforo / Participantes',
  realizada: 'Estado Realizada',
  telefonoContacto: 'Teléfono',
  emailContacto: 'Email',
  rut: 'RUT',
  domicilio: 'Domicilio',
  comentarios: 'Comentarios',
  importante: 'Actividad Importante',
  requiereCartaCompromiso: 'Carta de Compromiso'
};

/**
 * Computes human-readable differences between old and new state of a reservation
 */
export function computeReservationDiff(
  oldRes?: Reservation | null,
  newRes?: Reservation | null
): AuditFieldDiff[] {
  if (!oldRes || !newRes) return [];
  const diffs: AuditFieldDiff[] = [];

  const keysToCheck: (keyof Reservation)[] = [
    'fecha',
    'horaInicio',
    'horaFin',
    'espacio',
    'responsable',
    'tipoActividad',
    'tipoPrestamo',
    'descripcion',
    'cantidadParticipantes',
    'realizada',
    'telefonoContacto',
    'emailContacto',
    'rut',
    'domicilio',
    'comentarios',
    'importante'
  ];

  for (const key of keysToCheck) {
    const oldVal = oldRes[key];
    const newVal = newRes[key];

    // Normalize empty strings / undefined
    const normOld = oldVal === undefined || oldVal === null ? '' : oldVal;
    const normNew = newVal === undefined || newVal === null ? '' : newVal;

    if (String(normOld) !== String(normNew)) {
      diffs.push({
        field: key,
        label: FIELD_LABELS[key] || key,
        oldValue: normOld,
        newValue: normNew
      });
    }
  }

  return diffs;
}

/**
 * Gets audit history from in-memory cache, IndexedDB, or local storage cache
 */
export function getAuditHistory(): AuditChangeLogEntry[] {
  if (inMemoryAuditLogs && inMemoryAuditLogs.length > 0) {
    return inMemoryAuditLogs;
  }

  if (isBrowser) void hydrateAuditHistory();

  if (isBrowser) {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (!inMemoryAuditLogs) {
            inMemoryAuditLogs = parsed;
          }
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Error loading audit log cache:', err);
    }
  }
  return inMemoryAuditLogs || [];
}

/**
 * Saves audit history to IndexedDB (unlimited) and localStorage (pruned, quota-safe)
 */
export function saveAuditHistory(entries: AuditChangeLogEntry[]): void {
  inMemoryAuditLogs = entries;

  // 1. Durably save full audit history in native IndexedDB without 5MB quota limit
  setIndexedDbAuditLogs(entries).catch((err) =>
    console.warn('IndexedDB audit background save warning:', err)
  );

  // 2. Safe localStorage cache: strictly store only lightweight entries without heavy previousState/newState payloads
  if (isBrowser) {
    try {
      const lightEntries = sanitizeAuditEntriesForLocalStorage(entries, MAX_LOCAL_AUDIT_ENTRIES);
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(lightEntries));
    } catch (err: any) {
      console.warn('Quota warning on localStorage for audit log; safely retaining in IndexedDB:', err);
      try {
        localStorage.removeItem(AUDIT_STORAGE_KEY);
      } catch (innerErr) {}

      window.dispatchEvent(
        new CustomEvent('app_storage_quota_warning', {
          detail: {
            service: 'audit_logs',
            message: 'Cuota de almacenamiento local (localStorage) ajustada preventivamente. Todos los registros continúan respaldados en IndexedDB y Firestore.'
          }
        })
      );
    }
  }

  if (isBrowser) window.dispatchEvent(
    new CustomEvent('app_audit_changelog_changed', { detail: entries })
  );
}

/**
 * Records a new audit entry in localStorage and Firestore
 */
export async function recordAuditEntry(params: {
  action: AuditActionType;
  description: string;
  reservaId: string;
  user?: AuthUser | null | string;
  userRole?: string;
  reservaTitle?: string;
  reservaFecha?: string;
  reservaEspacio?: string;
  reservaHorario?: string;
  reservaResponsable?: string;
  previousState?: Reservation | Reservation[];
  newState?: Reservation | Reservation[];
  diffs?: AuditFieldDiff[];
  newStateIsConfirmed?: boolean;
}): Promise<AuditChangeLogEntry> {
  if(usesDataApi()){
    const receipt=params.previousState||params.newState?getLastReservationAuditEntry():(await dataRequest('/api/audit/record',{action:params.action,description:params.description,reservaId:params.reservaId})).entry;
    if(!receipt)throw new Error('La evidencia se crea al confirmar la operación de reservas.');
    saveAuditHistory(mergeAuditHistory(getAuditHistory(),[receipt]));return receipt;
  }
  await hydrateAuditHistory();
  const authorName =
    typeof params.user === 'string'
      ? params.user
      : params.user?.name || params.user?.username || 'Sistema';

  const authorRole =
    params.userRole ||
    (typeof params.user === 'object' && params.user?.role) ||
    'Usuario';

  const entry: AuditChangeLogEntry = {
    id: `AUDIT_${Date.now()}_${Math.random().toString(36).substr(2, 7).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    user: authorName,
    userRole: authorRole,
    action: params.action,
    description: params.description,
    reservaId: params.reservaId,
    reservaTitle: params.reservaTitle,
    reservaFecha: params.reservaFecha,
    reservaEspacio: params.reservaEspacio,
    reservaHorario: params.reservaHorario,
    reservaResponsable: params.reservaResponsable,
    diffs: params.diffs,
    previousState: params.previousState ? JSON.parse(JSON.stringify(params.previousState)) : undefined,
    newState: params.newState ? JSON.parse(JSON.stringify(params.newState)) : undefined,
    snapshotVersion: params.newStateIsConfirmed || !params.newState ? 2 : undefined,
    affectedCount: new Set([...auditStateRows(params.previousState), ...auditStateRows(params.newState)].map(r => r.id)).size,
    isReverted: false
  };

  // 1. Optimistic Local Save
  const current = getAuditHistory();
  const next = mergeAuditHistory(current, [entry]);
  saveAuditHistory(next);

  // 2. Firestore Sync (non-blocking)
  try {
    await persistAuditEntry(entry);
  } catch (err: any) {
    console.warn('Audit log saved locally (Firestore notice):', err?.message || err);
  }

  return entry;
}

/**
 * Subscribes to real-time audit logs from Firestore, IndexedDB and local cache
 */
export function subscribeToAuditLogs(
  onData: (entries: AuditChangeLogEntry[]) => void,
  onError?: (err: any) => void
): Unsubscribe {
  // Emit local cache immediately
  const initial = getAuditHistory();
  onData(initial);

  let active = true;
  void hydrateAuditHistory().then(() => { if (active) onData(getAuditHistory()); });

  try {
    const db = getDb();
    const auditCol = collection(db, AUDIT_COLLECTION_NAME);
    const q = query(auditCol, orderBy('timestamp', 'desc'), limit(150));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: AuditChangeLogEntry[] = [];
          snapshot.forEach((docSnap) => {
            list.push({
              ...(docSnap.data() as AuditChangeLogEntry),
              id: docSnap.id
            });
          });
          list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
          const merged = mergeAuditHistory(getAuditHistory(), list);
          saveAuditHistory(merged);
          if (active) onData(merged);
        }
      },
      (error) => {
        console.warn('Audit logs subscription fallback to local cache:', error?.message || error);
        if (onError) onError(error);
      }
    );

    return () => { active = false; unsubscribe(); };
  } catch (err) {
    console.warn('Audit logs initialization error:', err);
    if (onError) onError(err);
    return () => { active = false; };
  }
}

/**
 * Restores a change (reverts an edit or recovers deleted reservations)
 */
export async function restoreAuditChange(
  logId: string,
  currentUser?: AuthUser | null
): Promise<{ success: boolean; message: string; restoredCount: number }> {
  const failure = (message: string) => ({ success: false, message, restoredCount: 0 });
  if (!isCoordinatorOrAdmin(currentUser)) return failure('Solo Administradores o Coordinadores pueden restaurar cambios.');
  if (restoreInFlight) return failure('Hay una restauración en curso. Espera a que termine.');
  restoreInFlight = true;
  try {
    await hydrateAuditHistory();
    // Restoration requires authoritative data; a local summary cannot overwrite a newer change.
    let entry: AuditChangeLogEntry;
    try { entry = await fetchFullAuditEntry(logId); }
    catch (error) {
      const local = getAuditHistory().find(item => item.id === logId);
      if (!(error instanceof AuditNotSyncedError) || !local || (!local.previousState && !local.newState) || local.id.startsWith('AUDIT_BASELINE_')) throw error;
      await persistAuditEntry(local);
      entry = await fetchFullAuditEntry(logId);
    }
    saveAuditHistory(mergeAuditHistory(getAuditHistory(), [entry]));
    if (entry.isReverted) return failure('Este cambio ya fue restaurado previamente.');
    const rows = [...auditStateRows(entry.previousState), ...auditStateRows(entry.newState)];
    const ids = [...new Set(rows.map(r => r.id))];
    const db = getDb();
    const current = new Map<string, Reservation>();
    for (let start = 0; start < ids.length; start += 20) {
      const snapshots = await Promise.all(ids.slice(start, start + 20).map(id => getDocFromServer(doc(db, 'reservas', id))));
      snapshots.forEach(snapshot => {
        if (snapshot.exists()) current.set(snapshot.id, { ...snapshot.data(), id: snapshot.id } as Reservation);
      });
    }
    const plan = buildAuditRestorePlan(entry, current);
    const nowIso = new Date().toISOString();
    const authorName = currentUser!.name || currentUser!.username;
    const restoration: AuditChangeLogEntry = {
      id: `AUDIT_RESTORE_${logId}`, timestamp: nowIso, user: authorName,
      userRole: currentUser!.role, action: 'RESTORE',
      description: `Restaurado cambio de ${entry.action}: "${entry.description}" por ${authorName}`,
      reservaId: entry.reservaId, affectedCount: plan.affectedCount, isReverted: false
    };
    await commitReservationChanges(plan.reservations, {
      requireAtomic: true, expectedVersions: plan.expectedVersions, deletedIds: plan.deletedIds,
      operationId: `RESTORE_${logId}`,
      auditRestore: { logId, timestamp: nowIso, actor: authorName, log: cleanForFirestore(restoration) as AuditChangeLogEntry }
    });
    // Merge with the latest cache, preserving audit entries received while restoring.
    saveAuditHistory(mergeAuditHistory(getAuditHistory(), [
      { ...entry, isReverted: true, revertedAt: nowIso, revertedBy: authorName }, restoration
    ]));
    return { success: true, restoredCount: plan.affectedCount,
      message: isDeletionAction(entry.action)
        ? `Se recuperaron ${plan.affectedCount} reserva(s).`
        : `Se revirtió el cambio en ${plan.affectedCount} reserva(s).` };
  } catch (err: any) {
    console.error('Error restoring audit change:', err);
    return failure(`Error al restaurar: ${err?.message || 'Fallo desconocido'}`);
  } finally { restoreInFlight = false; }
}

/**
 * Synchronizes baseline audit log records for existing master reservations.
 * Does NOT invent fake users, fake previous states, or fabricated diffs.
 */
export function initializeAuditBaselineFromReservations(
  reservations: Reservation[],
  force: boolean = false
): AuditChangeLogEntry[] {
  const current = getAuditHistory();
  // Filter out any previously fabricated dummy entries
  const sanitizedCurrent = current.filter(entry => !entry.id.startsWith('AUDIT_INIT_'));
  if (sanitizedCurrent.length !== current.length) {
    saveAuditHistory(sanitizedCurrent);
  }

  if (sanitizedCurrent.length > 0 && !force) {
    return sanitizedCurrent;
  }

  if (!reservations || reservations.length === 0) {
    return sanitizedCurrent;
  }

  // Only create authentic baseline entries for real reservations without inventing fake diffs or fake users
  const currentUser = getCurrentUser();
  const actorName = currentUser?.name || currentUser?.username || 'Sistema';
  const actorRole = currentUser?.role || 'Administrador';
  const nowIso = new Date().toISOString();

  const baselineLogs: AuditChangeLogEntry[] = reservations.map((res) => ({
    id: `AUDIT_BASELINE_${res.id}`,
    timestamp: res.createdAt || nowIso,
    user: actorName,
    userRole: actorRole,
    action: 'BULK_IMPORT',
    description: `Registro inicial de reserva para ${res.espacio} (${res.horaInicio} - ${res.horaFin})`,
    reservaId: res.id,
    reservaTitle: res.descripcion || res.tipoActividad || 'Reserva',
    reservaFecha: res.fecha,
    reservaEspacio: res.espacio,
    reservaHorario: `${res.horaInicio} - ${res.horaFin}`,
    reservaResponsable: res.responsable,
    diffs: [],
    newState: res,
    isReverted: false
  }));

  const merged = [...baselineLogs, ...sanitizedCurrent];
  merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  saveAuditHistory(merged);
  return merged;
}

/**
 * Remote audit records are immutable. Kept for callers from older UI versions.
 */
export async function purgeAuditLogs(): Promise<void> {
  throw new Error('Los registros de auditoría se conservan y no pueden eliminarse.');
}
