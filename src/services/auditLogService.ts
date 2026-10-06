import { sharedOnSnapshot as onSnapshot } from '../firebase/sharedSnapshot';
import {
  collection,
  doc,
  setDoc,
  writeBatch,
  getDocs,
  query,
  orderBy,
  limit,
  Unsubscribe
} from 'firebase/firestore';
import { getDb } from '../firebase/config';
import {
  Reservation,
  AuditChangeLogEntry,
  AuditActionType,
  AuditFieldDiff
} from '../types';
import { AuthUser, getCurrentUser } from './authService';
import {
  saveReservation,
  saveReservationsBatch,
  deleteReservationsBatch,
  unrecordDeletedId,
  unrecordDeletedIds,
  getLocalCache,
  cleanForFirestore
} from './reservationService';
import {
  getIndexedDbAuditLogs,
  setIndexedDbAuditLogs,
  clearIndexedDbAuditLogs
} from '../utils/indexedDbStorage';
import { sanitizeAuditEntriesForLocalStorage } from './storageService';

const AUDIT_COLLECTION_NAME = 'audit_logs';
const AUDIT_STORAGE_KEY = 'cc_audit_changelog_v1';
const MAX_LOCAL_AUDIT_ENTRIES = 15;

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

let inMemoryAuditLogs: AuditChangeLogEntry[] | null = null;
let isHydratingFromIndexedDb = false;

/**
 * Sanitizes a reservation state for audit logging to prevent browser QuotaExceededError.
 * Strips huge base64 data URLs from attachments and limits array sizes.
 */
function sanitizeStateForAudit(
  state?: Reservation | Reservation[]
): Reservation | Reservation[] | undefined {
  if (!state) return undefined;

  const sanitizeSingle = (r: Reservation): Reservation => {
    if (!r) return r;
    const copy = { ...r };
    if (copy.cartaCompromisoAdjunta?.dataUrl) {
      copy.cartaCompromisoAdjunta = {
        ...copy.cartaCompromisoAdjunta,
        dataUrl: `[ATTACHMENT_${copy.cartaCompromisoAdjunta.name || 'FILE'}]`
      };
    }
    return copy;
  };

  if (Array.isArray(state)) {
    return state.slice(0, 25).map(sanitizeSingle);
  }

  return sanitizeSingle(state);
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

  // Hydrate asynchronously from IndexedDB if in-memory cache is empty
  if (!isHydratingFromIndexedDb && typeof window !== 'undefined') {
    isHydratingFromIndexedDb = true;
    getIndexedDbAuditLogs().then((idbEntries) => {
      if (idbEntries && idbEntries.length > 0) {
        inMemoryAuditLogs = idbEntries;
        window.dispatchEvent(
          new CustomEvent('app_audit_changelog_changed', { detail: idbEntries })
        );
      }
    }).catch((err) => {
      console.warn('Error hydrating audit logs from IndexedDB:', err);
    });
  }

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

  window.dispatchEvent(
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
}): Promise<AuditChangeLogEntry> {
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
    previousState: sanitizeStateForAudit(params.previousState),
    newState: sanitizeStateForAudit(params.newState),
    isReverted: false
  };

  // 1. Optimistic Local Save
  const current = getAuditHistory();
  const next = [entry, ...current.filter((e) => e.id !== entry.id)].slice(
    0,
    MAX_LOCAL_AUDIT_ENTRIES
  );
  saveAuditHistory(next);

  // 2. Firestore Sync (non-blocking)
  try {
    const db = getDb();
    const docRef = doc(db, AUDIT_COLLECTION_NAME, entry.id);
    const cleaned = cleanForFirestore(entry);
    await setDoc(docRef, cleaned, { merge: true });
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

  // Hydrate from IndexedDB in background
  getIndexedDbAuditLogs()
    .then((idbEntries) => {
      if (idbEntries && idbEntries.length > initial.length) {
        onData(idbEntries);
      }
    })
    .catch((e) => console.warn('IndexedDB audit hydration warning:', e));

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
          saveAuditHistory(list);
          onData(list);
        }
      },
      (error) => {
        console.warn('Audit logs subscription fallback to local cache:', error?.message || error);
        if (onError) onError(error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('Audit logs initialization error:', err);
    if (onError) onError(err);
    return () => {};
  }
}

/**
 * Restores a change (reverts an edit or recovers deleted reservations)
 */
export async function restoreAuditChange(
  logId: string,
  currentUser?: AuthUser | null
): Promise<{
  success: boolean;
  message: string;
  restoredCount: number;
}> {
  let history = inMemoryAuditLogs || getAuditHistory();
  let entry = history.find((e) => e.id === logId);

  // If entry not found or missing previousState, hydrate fully from native IndexedDB
  if (!entry || !entry.previousState) {
    try {
      const idbEntries = await getIndexedDbAuditLogs();
      if (idbEntries && idbEntries.length > 0) {
        inMemoryAuditLogs = idbEntries;
        entry = idbEntries.find((e) => e.id === logId) || entry;
      }
    } catch (err) {
      console.warn('Could not read IndexedDB during audit restore:', err);
    }
  }

  if (!entry) {
    return { success: false, message: 'No se encontró el registro de cambio solicitado.', restoredCount: 0 };
  }

  if (entry.isReverted) {
    return { success: false, message: 'Este cambio ya fue restaurado previamente.', restoredCount: 0 };
  }

  const authorName = currentUser?.name || currentUser?.username || 'Administrador';
  const nowIso = new Date().toISOString();

  try {
    let restoredCount = 0;

    switch (entry.action) {
      case 'DELETE': {
        if (!entry.previousState) {
          return { success: false, message: 'No se encontró el respaldo de la reserva eliminada.', restoredCount: 0 };
        }
        const reservaToRestore = entry.previousState as Reservation;
        unrecordDeletedId(reservaToRestore.id);
        await new Promise((r) => setTimeout(r, 0));
        await saveReservation({
          ...reservaToRestore,
          updatedAt: nowIso
        });
        restoredCount = 1;
        break;
      }

      case 'DELETE_SERIES':
      case 'DELETE_ALL_HOLIDAYS': {
        if (!entry.previousState) {
          return { success: false, message: 'No se encontró el respaldo de las reservas eliminadas.', restoredCount: 0 };
        }
        const listToRestore = Array.isArray(entry.previousState)
          ? entry.previousState
          : [entry.previousState as Reservation];

        if (listToRestore.length === 0) {
          return { success: false, message: 'No hay reservas para restaurar en este registro.', restoredCount: 0 };
        }

        unrecordDeletedIds(listToRestore.map((r) => r.id));
        await new Promise((r) => setTimeout(r, 0));
        await saveReservationsBatch(listToRestore);
        restoredCount = listToRestore.length;
        break;
      }

      case 'UPDATE':
      case 'CLEAR_PARTICIPANTS':
      case 'TOGGLE_REALIZADA': {
        if (!entry.previousState) {
          return { success: false, message: 'No se encontró la versión anterior de la reserva para revertir.', restoredCount: 0 };
        }
        const prevReserva = entry.previousState as Reservation;
        await new Promise((r) => setTimeout(r, 0));
        await saveReservation({
          ...prevReserva,
          updatedAt: nowIso
        });
        restoredCount = 1;
        break;
      }

      case 'CREATE': {
        // Undoing a creation means removing the created reservation or all reservations in the series
        await new Promise((r) => setTimeout(r, 0));
        let idsToDelete: string[] = [];

        if (Array.isArray(entry.newState) && entry.newState.length > 0) {
          idsToDelete = entry.newState.map((r: any) => r.id);
        } else if (entry.newState && typeof entry.newState === 'object' && 'id' in entry.newState) {
          const singleId = (entry.newState as Reservation).id;
          // Check if it belongs to a series created simultaneously
          const current = getLocalCache();
          const target = current.find(r => r.id === singleId);
          const seriesId = target?.serieRecurrente || target?.recurrenteId;
          if (seriesId) {
            const seriesItems = current.filter(r => r.serieRecurrente === seriesId || r.recurrenteId === seriesId);
            if (seriesItems.length > 1) {
              idsToDelete = seriesItems.map(r => r.id);
            } else {
              idsToDelete = [singleId];
            }
          } else {
            idsToDelete = [singleId];
          }
        } else if (entry.reservaId) {
          const current = getLocalCache();
          const seriesMatches = current.filter(
            (r) => r.serieRecurrente === entry.reservaId || r.recurrenteId === entry.reservaId
          );
          if (seriesMatches.length > 0) {
            idsToDelete = seriesMatches.map((r) => r.id);
          } else {
            idsToDelete = [entry.reservaId];
          }
        }

        if (idsToDelete.length > 0) {
          await deleteReservationsBatch(idsToDelete);
          restoredCount = idsToDelete.length;
        } else {
          return { success: false, message: 'No se pudo identificar la reserva creada para deshacer.', restoredCount: 0 };
        }
        break;
      }

      case 'BULK_IMPORT': {
        // Undoing a bulk import means deleting the imported reservations
        await new Promise((r) => setTimeout(r, 0));
        let idsToDelete: string[] = [];
        if (Array.isArray(entry.newState)) {
          idsToDelete = entry.newState.map((r: any) => r.id);
        } else if (entry.reservaId) {
          idsToDelete = [entry.reservaId];
        }
        if (idsToDelete.length > 0) {
          await deleteReservationsBatch(idsToDelete);
          restoredCount = idsToDelete.length;
        }
        break;
      }

      default:
        return { success: false, message: `Tipo de acción '${entry.action}' no admite reversión automática.`, restoredCount: 0 };
    }

    // Mark log as reverted
    const updatedHistory = history.map((item) => {
      if (item.id === logId) {
        return {
          ...item,
          isReverted: true,
          revertedAt: nowIso,
          revertedBy: authorName
        };
      }
      return item;
    });
    saveAuditHistory(updatedHistory);

    // Sync revert status to Firestore
    try {
      const db = getDb();
      const docRef = doc(db, AUDIT_COLLECTION_NAME, logId);
      await setDoc(
        docRef,
        {
          isReverted: true,
          revertedAt: nowIso,
          revertedBy: authorName
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Could not update Firestore revert flag:', err);
    }

    // Record new RESTORE audit entry
    await recordAuditEntry({
      action: 'RESTORE',
      description: `Restaurado cambio de ${entry.action}: "${entry.description}" por ${authorName}`,
      reservaId: entry.reservaId,
      user: authorName,
      userRole: currentUser?.role || 'Administrador',
      reservaTitle: entry.reservaTitle,
      reservaFecha: entry.reservaFecha,
      reservaEspacio: entry.reservaEspacio,
      reservaHorario: entry.reservaHorario,
      reservaResponsable: entry.reservaResponsable
    });

    return {
      success: true,
      message:
        entry.action.startsWith('DELETE')
          ? `Se recuperó exitosamente ${restoredCount === 1 ? 'la reserva' : `${restoredCount} reservas`}.`
          : `Se revirtió exitosamente el cambio a su estado anterior.`,
      restoredCount
    };
  } catch (err: any) {
    console.error('Error restoring audit change:', err);
    return {
      success: false,
      message: `Error al restaurar: ${err?.message || 'Fallo desconocido'}`,
      restoredCount: 0
    };
  }
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
 * Clears or purges audit history from memory, localStorage, IndexedDB and Firestore.
 */
export async function purgeAuditLogs(): Promise<void> {
  saveAuditHistory([]);
  try {
    await clearIndexedDbAuditLogs();
  } catch (e) {
    console.warn('Error clearing IndexedDB audit logs:', e);
  }
  try {
    const db = getDb();
    const auditCol = collection(db, AUDIT_COLLECTION_NAME);
    const snapshot = await getDocs(auditCol);
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const chunk = docs.slice(i, i + 450);
      const batch = writeBatch(db);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (err) {
    console.warn('Error purging Firestore audit logs:', err);
  }
}
