import { splitBackupPayload } from '../utils/backupChunks';
import { doc, getDoc, setDoc, getDocs, getDocsFromServer, collection, deleteDoc, query, orderBy, limit, where, documentId } from 'firebase/firestore';
import { claimScheduledBackup, finishScheduledBackup } from './backupScheduleCoordinator';
import { getDb } from '../firebase/config';
import { Reservation, SpaceInfo, LoanType, ActivityTypeItem, EquipmentItem, SpaceRating } from '../types';
import { getLocalCache, seedAllToFirestore, setLocalCache, normalizeReservationFromFirestore } from './reservationService';
import { getStoredSpaces, getStoredLoanTypes, getStoredActivityTypes } from './adminConfigService';
import { getStoredEquipment } from './equipmentService';
import { getAllAuthorizedUsers, UserAccount, AuthUser } from './authService';
import { getLocalRatingsCache } from './ratingService';
import { recordAuditEntry } from './auditLogService';

// ============================================================================
// CONSTANTS & STORAGE KEYS
// ============================================================================

export const BACKUP_COLLECTION = 'copias_seguridad';
export const BACKUP_CONFIG_STORAGE_KEY = 'espacios_backup_config_v2';
export const BACKUP_HISTORY_STORAGE_KEY = 'espacios_backup_history_v2';
export const DEFAULT_BACKUP_INTERVAL_DAYS = 15;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// INTERFACES
// ============================================================================

export interface DatabaseBackupMetadata {
  id: string;
  fecha: string; // YYYY-MM-DD
  timestamp: string; // ISO string
  tipo: 'automatica_15_dias' | 'manual';
  creadoPor: string;
  totalReservas: number;
  totalEspacios: number;
  totalUsuarios: number;
  totalCalificaciones: number;
  totalEquipamiento: number;
  checksum: string;
  tamanoBytes: number;
  descripcion: string;
  totalPartes?: number;
  esChunked?: boolean;
  storageStatus?: 'firestore_confirmed' | 'local_only';
}

export interface DatabaseBackupChunk {
  id: string;
  backupId: string;
  index: number;
  totalPartes: number;
  payload: string;
}

export interface DatabaseBackupData {
  version: string;
  exportadoEn: string;
  reservas: Reservation[];
  espacios: SpaceInfo[];
  tiposPrestamo: LoanType[];
  tiposActividad: ActivityTypeItem[];
  equipamiento: EquipmentItem[];
  usuarios: Array<Omit<UserAccount, 'passwordHash'>>;
  calificaciones: SpaceRating[];
}

export interface DatabaseBackupRecord extends DatabaseBackupMetadata {
  data?: DatabaseBackupData;
}

export interface BackupScheduleConfig {
  enabled: boolean;
  intervalDays: number;
  lastBackupDate: string; // YYYY-MM-DD
  lastBackupTimestamp: number; // Unix epoch ms
  lastBackupId?: string;
  autoDownloadJson: boolean;
  notificarEnCampana: boolean;
}

// ============================================================================
// HELPER FUNCTIONS & CHECKSUMS
// ============================================================================

/**
 * Calculates a lightweight deterministic string checksum for the backup data.
 */
function calculateSimpleChecksum(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `CHK_${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function formatLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Generates a deterministic signature to identify duplicate backups having
 * identical date, time (HH:mm), size (in KB), and count of reservations.
 */
export function getBackupIdentitySignature(meta: DatabaseBackupMetadata): string {
  const fecha = meta.fecha || (meta.timestamp ? meta.timestamp.slice(0, 10) : '');
  const hora = meta.timestamp ? meta.timestamp.slice(11, 16) : '';
  const sizeKb = Math.round((meta.tamanoBytes || 0) / 1024);
  const total = meta.totalReservas || 0;
  return `${fecha}_${hora}_${sizeKb}KB_${total}RSV`;
}

export function calculateNextBackupDate(lastTimestamp: number, intervalDays: number = DEFAULT_BACKUP_INTERVAL_DAYS): string {
  if (!lastTimestamp) {
    return 'Hoy (Pendiente)';
  }
  const nextDate = new Date(lastTimestamp + intervalDays * MS_PER_DAY);
  return formatLocalDateString(nextDate);
}

export function getDaysUntilNextBackup(lastTimestamp: number, intervalDays: number = DEFAULT_BACKUP_INTERVAL_DAYS): number {
  if (!lastTimestamp) return 0;
  const elapsedMs = Date.now() - lastTimestamp;
  const targetMs = intervalDays * MS_PER_DAY;
  const remainingMs = targetMs - elapsedMs;
  return Math.max(0, Math.ceil(remainingMs / MS_PER_DAY));
}

// ============================================================================
// CONFIGURATION PERSISTENCE
// ============================================================================

export function getBackupScheduleConfig(): BackupScheduleConfig {
  const defaultCfg: BackupScheduleConfig = {
    enabled: true, // Activo automáticamente por defecto
    intervalDays: DEFAULT_BACKUP_INTERVAL_DAYS, // Cada 15 días
    lastBackupDate: '',
    lastBackupTimestamp: 0,
    autoDownloadJson: false,
    notificarEnCampana: true
  };

  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return defaultCfg;
  }

  try {
    const raw = localStorage.getItem(BACKUP_CONFIG_STORAGE_KEY);
    if (!raw) return defaultCfg;
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed.enabled !== false,
      intervalDays: typeof parsed.intervalDays === 'number' && parsed.intervalDays > 0 ? parsed.intervalDays : DEFAULT_BACKUP_INTERVAL_DAYS,
      lastBackupDate: parsed.lastBackupDate || '',
      lastBackupTimestamp: Number(parsed.lastBackupTimestamp) || 0,
      lastBackupId: parsed.lastBackupId || undefined,
      autoDownloadJson: Boolean(parsed.autoDownloadJson),
      notificarEnCampana: parsed.notificarEnCampana !== false
    };
  } catch (err) {
    console.warn('[BackupService] Error parsing backup config from localStorage:', err);
    return defaultCfg;
  }
}

export async function saveBackupScheduleConfig(cfg: Partial<BackupScheduleConfig>): Promise<BackupScheduleConfig> {
  const current = getBackupScheduleConfig();
  const updated: BackupScheduleConfig = {
    ...current,
    ...cfg,
    // Ensure safety bounds
    intervalDays: typeof cfg.intervalDays === 'number' && cfg.intervalDays > 0 ? cfg.intervalDays : current.intervalDays
  };

  const patch = { ...cfg, ...(cfg.intervalDays !== undefined ? { intervalDays: updated.intervalDays } : {}) };

  // Also sync to Firestore under configuracion_sistema for multi-device agreement
  try {
    const db = getDb();
    const configDocRef = doc(db, 'configuracion_sistema', 'backup_schedule_config');
    await setDoc(configDocRef, {
      ...(Object.keys(patch).length ? { data: patch } : {}),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('[BackupService] Could not persist backup schedule config to Firestore:', err);
    throw err;
  }

  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    localStorage.setItem(BACKUP_CONFIG_STORAGE_KEY, JSON.stringify(updated));
  }


  return updated;
}

// ============================================================================
// LOCAL HISTORY CACHE
// ============================================================================

function getLocalBackupHistory(): DatabaseBackupMetadata[] {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BACKUP_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalBackupHistory(items: DatabaseBackupMetadata[]): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    // Keep at most 30 metadata records in local cache
    const trimmed = items.slice(0, 30);
    localStorage.setItem(BACKUP_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('[BackupService] Failed to cache backup metadata locally:', err);
  }
}

// ============================================================================
// BACKUP CREATION ENGINE
// ============================================================================

export const BACKUP_CHUNK_SIZE = 400_000; // 400KB characters to stay comfortably under Firestore's 1MB limit

// Concurrency lock to prevent duplicate simultaneous backup runs (e.g. from React Strict Mode mount)
let backupInProgressPromise: Promise<DatabaseBackupRecord> | null = null;

export interface CreateBackupOptions {
  tipo?: 'automatica_15_dias' | 'manual';
  creadoPor?: string;
  customReservations?: Reservation[];
  descripcion?: string;
}

/**
 * Creates a complete snapshot of the database (reservations, spaces, loan types, activity types, equipment, ratings, and user profiles).
 * Stores the backup in Firestore `copias_seguridad` using chunking to prevent exceeding Firestore's 1MB document limit, and updates local history.
 */
export async function createDatabaseBackup(options: CreateBackupOptions = {}): Promise<DatabaseBackupRecord> {
  if (backupInProgressPromise) {
    console.log('[BackupService] Hay una creación de copia en curso, reutilizando la misma operación...');
    return backupInProgressPromise;
  }

  backupInProgressPromise = (async () => {
    try {
      const now = new Date();
      const dateStr = formatLocalDateString(now);
      const isoStr = now.toISOString();
      const tipo = options.tipo || 'automatica_15_dias';
      const creadoPor = options.creadoPor || (tipo === 'automatica_15_dias' ? 'Sistema (Automático cada 15 días)' : 'Usuario Administrador');

  // 1. Gather all collections
  let reservations = [...(options.customReservations ?? [])];
  let spaces = getStoredSpaces();
  let loanTypes = getStoredLoanTypes();
  let activityTypes = getStoredActivityTypes();
  let equipment = getStoredEquipment();
  let ratings = getLocalRatingsCache();
  let allUsers = getAllAuthorizedUsers();
  if (options.customReservations === undefined) {
    const db = getDb();
    // Backups must include history and ratings outside the visible/limited listeners.
    const [reservationSnapshot, ratingSnapshot, userSnapshot, configSnapshot] = await Promise.all([
      getDocsFromServer(collection(db, 'reservas')),
      getDocsFromServer(collection(db, 'calificaciones_espacios')),
      getDocsFromServer(collection(db, 'usuarios_sistema')),
      getDocsFromServer(query(collection(db, 'configuracion_sistema'),
        where(documentId(), 'in', ['espacios', 'tipos_prestamo', 'tipos_actividad', 'equipamiento']))),
    ]);
    reservations = reservationSnapshot.docs.map(d => normalizeReservationFromFirestore(d.id, d.data()));
    ratings = ratingSnapshot.docs.map(d => ({ ...d.data(), id: d.id } as SpaceRating));
    allUsers = userSnapshot.docs.map(d => d.data() as UserAccount);
    for (const document of configSnapshot.docs) {
      const data = document.data();
      if (document.id === 'espacios' && Array.isArray(data.data)) spaces = data.data;
      if (document.id === 'tipos_prestamo' && Array.isArray(data.data)) loanTypes = data.data;
      if (document.id === 'tipos_actividad' && Array.isArray(data.data)) activityTypes = data.data;
      if (document.id === 'equipamiento' && Array.isArray(data.items)) equipment = data.items;
    }
  }

  // Sanitize user accounts (remove password hashes from export)
  const sanitizedUsers = allUsers.map(({ passwordHash, ...safeUser }) => safeUser);

  // 2. Assemble data payload
  const backupData: DatabaseBackupData = {
    version: '2.2.0',
    exportadoEn: isoStr,
    reservas: reservations,
    espacios: spaces,
    tiposPrestamo: loanTypes,
    tiposActividad: activityTypes,
    equipamiento: equipment,
    usuarios: sanitizedUsers,
    calificaciones: ratings
  };

  const serializedData = JSON.stringify(backupData);
  const tamanoBytes = new Blob([serializedData]).size;
  const checksum = calculateSimpleChecksum(serializedData);

  const cleanDateForId = dateStr.replace(/-/g, '');
  const timeSuffix = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const id = `BACKUP_${cleanDateForId}_${timeSuffix}_${tipo === 'automatica_15_dias' ? 'AUTO15D' : 'MANUAL'}_${crypto.randomUUID().slice(0, 8)}`;

  // Idempotency check: if an identical backup was already created (same date, minute, size KB, and reservations count), reuse it
  const candidateSig = `${dateStr}_${isoStr.slice(11, 16)}_${Math.round(tamanoBytes / 1024)}KB_${reservations.length}RSV`;
  const localHistory = getLocalBackupHistory();
  const existingDuplicate = localHistory.find(b => getBackupIdentitySignature(b) === candidateSig && b.checksum === checksum);

  if (existingDuplicate) {
    console.log(`[BackupService] Respaldo idéntico detectado (${existingDuplicate.id}, ${candidateSig}), omitiendo creación duplicada por idempotencia.`);
    return {
      ...existingDuplicate,
      data: backupData
    };
  }

  const defaultDesc = tipo === 'automatica_15_dias'
    ? `Copia de seguridad automática periódica (ciclo cada 15 días) con ${reservations.length} reservas y catálogos completos`
    : `Copia de seguridad manual generada por ${creadoPor} con ${reservations.length} reservas`;

  // Partition serialized backup payload into chunks to respect Firestore 1MB document size limit
  const payloads = splitBackupPayload(serializedData, BACKUP_CHUNK_SIZE);
  const totalPartes = payloads.length;
  const chunks: DatabaseBackupChunk[] = payloads.map((payload,index) => ({
    id: `parte_${String(index).padStart(3, '0')}`, backupId: id, index, totalPartes, payload
  }));

  const metadata: DatabaseBackupMetadata = {
    id,
    fecha: dateStr,
    timestamp: isoStr,
    tipo,
    creadoPor,
    totalReservas: reservations.length,
    totalEspacios: spaces.length,
    totalUsuarios: sanitizedUsers.length,
    totalCalificaciones: ratings.length,
    totalEquipamiento: equipment.length,
    checksum,
    tamanoBytes,
    descripcion: options.descripcion || defaultDesc,
    totalPartes,
    esChunked: true
  };

  const fullRecord: DatabaseBackupRecord = {
    ...metadata,
    data: backupData
  };

  // 3. Persist to Firestore collection `copias_seguridad`
  // IMPORTANT: We do NOT store the multi-megabyte `data` object directly inside the root document to avoid exceeding 1MB.
  // Instead, the metadata resides in `copias_seguridad/{id}` and parts are saved in subcollection `copias_seguridad/{id}/partes/{parteId}`.
  try {
    const db = getDb();

    // Save chunks to subcollection
    for (let i = 0; i < chunks.length; i += 4) {
      await Promise.all(chunks.slice(i,i+4).map(chunk =>
        setDoc(doc(db, BACKUP_COLLECTION, id, 'partes', chunk.id), chunk)));
    }

    // Save metadata to main document (size is < 2 KB, well below 1 MB)
    const backupDocRef = doc(db, BACKUP_COLLECTION, id);
    await setDoc(backupDocRef, metadata);

    console.log(`[BackupService] Copia de seguridad guardada exitosamente en Firestore (${id}, ${tamanoBytes} bytes en ${totalPartes} partes, ${reservations.length} reservas)`);
  } catch (err) {
    console.error('[BackupService] Error al guardar copia de seguridad en Firestore:', err);
    throw err;
  }

  // 4. Update local history and schedule config
  const existingHistory = getLocalBackupHistory().filter(b => b.id !== id);
  saveLocalBackupHistory([metadata, ...existingHistory]);

  try {
  await saveBackupScheduleConfig({
    lastBackupDate: dateStr,
    lastBackupTimestamp: now.getTime(),
    lastBackupId: id
  });
  } catch (err) { console.warn('Respaldo confirmado; no se pudo actualizar su programación:', err); }

  // 5. Audit Log Entry
  try {
    await recordAuditEntry({
      reservaId: id,
      action: 'BACKUP_CREATED',
      description: metadata.descripcion,
      user: creadoPor,
      diffs: [
        { field: 'tipo', label: 'Tipo de Respaldo', oldValue: null, newValue: tipo },
        { field: 'totalReservas', label: 'Reservas Respaldadas', oldValue: null, newValue: reservations.length },
        { field: 'tamanoBytes', label: 'Tamaño en Bytes', oldValue: null, newValue: tamanoBytes }
      ]
    });
  } catch (auditErr) {
    console.warn('[BackupService] Could not log audit action for backup:', auditErr);
  }

  // 6. Notify App components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app_database_backup_created', { detail: metadata }));
  }

  // 7. Automated FIFO Rotation: keep only the latest 5 backups to prevent storage bloat
  rotateOldBackups(5).catch((rotErr) => {
    console.warn('[BackupService] Background backup rotation warning:', rotErr);
  });

  return fullRecord;
    } finally {
      backupInProgressPromise = null;
    }
  })();

  return backupInProgressPromise;
}

// ============================================================================
// AUTOMATED 15-DAY SCHEDULER ENGINE
// ============================================================================

export interface ScheduledBackupCheckResult {
  triggered: boolean;
  backup?: DatabaseBackupRecord;
  reason: string;
  nextScheduledDate: string;
  daysRemaining: number;
}

/**
 * Checks if 15 days (or the configured interval) have elapsed since the last backup.
 * If so, triggers an automatic full database backup in the background.
 */
export async function checkAndRunScheduledBackup(
  customReservations?: Reservation[]
): Promise<ScheduledBackupCheckResult> {
  const db = getDb();
  if (!db) throw new Error('No hay conexión para comprobar la programación de respaldos.');
  const claim = await claimScheduledBackup(db, getBackupScheduleConfig());
  const config = claim.config;
  try { localStorage.setItem(BACKUP_CONFIG_STORAGE_KEY, JSON.stringify(config)); } catch { /* Memory/storage may be unavailable. */ }

  if (claim.busy) return {
    triggered: false, reason: 'Otro dispositivo está creando la copia programada.',
    nextScheduledDate: calculateNextBackupDate(config.lastBackupTimestamp, config.intervalDays), daysRemaining: 0,
  };

  if (!config.enabled) {
    return {
      triggered: false,
      reason: 'Copias automáticas desactivadas en la configuración.',
      nextScheduledDate: 'Desactivado',
      daysRemaining: -1
    };
  }

  const nowMs = Date.now();
  const intervalMs = (config.intervalDays || DEFAULT_BACKUP_INTERVAL_DAYS) * MS_PER_DAY;
  const elapsedMs = config.lastBackupTimestamp ? nowMs - config.lastBackupTimestamp : Infinity;
  const nextDateStr = calculateNextBackupDate(config.lastBackupTimestamp, config.intervalDays);
  const daysRemaining = getDaysUntilNextBackup(config.lastBackupTimestamp, config.intervalDays);

  // If never run or if interval has elapsed
  if (claim.owner && (!config.lastBackupTimestamp || elapsedMs >= intervalMs)) {
    console.log(`[BackupService] Ejecutando copia de seguridad automática de 15 días (Tiempo transcurrido: ${Math.round(elapsedMs / MS_PER_DAY)} días)...`);
    
    try {
      const backup = await createDatabaseBackup({
        tipo: 'automatica_15_dias',
        creadoPor: 'Sistema (Automático cada 15 días)',
        customReservations
      });

      await finishScheduledBackup(db, claim, backup).catch(error => {
        console.warn('Copia confirmada; no se pudo liberar la comprobación programada:', error);
      });

      return {
        triggered: true,
        backup,
        reason: `Copia de seguridad automática cada 15 días generada exitosamente (${backup.totalReservas} reservas respaldadas).`,
        nextScheduledDate: calculateNextBackupDate(Date.now(), config.intervalDays),
        daysRemaining: config.intervalDays
      };
    } catch (err: any) {
      await finishScheduledBackup(db, claim).catch(() => {});
      console.error('[BackupService] Falló la creación de la copia de seguridad programada:', err);
      return {
        triggered: false,
        reason: `Error al crear copia programada: ${err?.message || 'Falla desconocida'}`,
        nextScheduledDate: nextDateStr,
        daysRemaining
      };
    }
  }

  return {
    triggered: false,
    reason: `Copia de seguridad al día. Próxima copia programada en ${daysRemaining} día(s) (${nextDateStr}).`,
    nextScheduledDate: nextDateStr,
    daysRemaining
  };
}

// ============================================================================
// QUERY & RESTORATION
// ============================================================================

/**
 * Fetches all available database backup metadata records from Firestore and local cache.
 */
export async function getDatabaseBackupsList(): Promise<DatabaseBackupMetadata[]> {
  const localItems = getLocalBackupHistory();
  const map = new Map<string, DatabaseBackupMetadata>();

  localItems.forEach(item => map.set(item.id, {
    ...item,
    storageStatus: 'local_only'
  }));

  try {
    const db = getDb();
    const colRef = collection(db, BACKUP_COLLECTION);
    const q = query(colRef, orderBy('timestamp', 'desc'), limit(50));
    const snap = await getDocs(q);

    snap.forEach(docSnap => {
      const data = docSnap.data() as DatabaseBackupRecord;
      map.set(docSnap.id, {
        id: docSnap.id,
        fecha: data.fecha || '',
        timestamp: data.timestamp || '',
        tipo: data.tipo || 'manual',
        creadoPor: data.creadoPor || 'Sistema',
        totalReservas: data.totalReservas || 0,
        totalEspacios: data.totalEspacios || 0,
        totalUsuarios: data.totalUsuarios || 0,
        totalCalificaciones: data.totalCalificaciones || 0,
        totalEquipamiento: data.totalEquipamiento || 0,
        checksum: data.checksum || '',
        tamanoBytes: data.tamanoBytes || 0,
        descripcion: data.descripcion || '',
        totalPartes: data.totalPartes,
        esChunked: data.esChunked,
        storageStatus: 'firestore_confirmed'
      });
    });
  } catch (err) {
    console.warn('[BackupService] Could not list backups from Firestore, falling back to local history:', err);
  }

  const list = Array.from(map.values());
  list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Deduplicate entries that share identical signature (misma fecha, hora, tamaño KB y cantidad de reservas)
  const deduplicated: DatabaseBackupMetadata[] = [];
  const signatureMap = new Map<string, DatabaseBackupMetadata>();

  for (const item of list) {
    const signature = `${getBackupIdentitySignature(item)}:${item.checksum || item.id}`;

    const existing = signatureMap.get(signature);
    if (!existing) {
      signatureMap.set(signature, item);
      deduplicated.push(item);
    } else if (existing.storageStatus === 'local_only' && item.storageStatus === 'firestore_confirmed') {
      // Prioritize the firestore-confirmed record
      const idx = deduplicated.indexOf(existing);
      if (idx >= 0) {
        deduplicated[idx] = item;
      }
      signatureMap.set(signature, item);
    }
  }

  return deduplicated;
}

/**
 * Reassembles a full backup record from Firestore, fetching partitioned chunks if necessary.
 */
export async function fetchFullBackupRecord(
  backupId: string,
  fallbackMeta?: DatabaseBackupMetadata
): Promise<DatabaseBackupRecord | null> {
  try {
    const db = getDb();
    const docRef = doc(db, BACKUP_COLLECTION, backupId);
    const docSnap = await getDoc(docRef);

    let meta: DatabaseBackupMetadata = fallbackMeta || ({} as DatabaseBackupMetadata);
    let inlineData: DatabaseBackupData | undefined;

    if (docSnap.exists()) {
      const docData = docSnap.data() as DatabaseBackupRecord;
      meta = {
        id: docSnap.id,
        fecha: docData.fecha || meta.fecha || '',
        timestamp: docData.timestamp || meta.timestamp || '',
        tipo: docData.tipo || meta.tipo || 'manual',
        creadoPor: docData.creadoPor || meta.creadoPor || 'Sistema',
        totalReservas: docData.totalReservas || meta.totalReservas || 0,
        totalEspacios: docData.totalEspacios || meta.totalEspacios || 0,
        totalUsuarios: docData.totalUsuarios || meta.totalUsuarios || 0,
        totalCalificaciones: docData.totalCalificaciones || meta.totalCalificaciones || 0,
        totalEquipamiento: docData.totalEquipamiento || meta.totalEquipamiento || 0,
        checksum: docData.checksum || meta.checksum || '',
        tamanoBytes: docData.tamanoBytes || meta.tamanoBytes || 0,
        descripcion: docData.descripcion || meta.descripcion || '',
        totalPartes: docData.totalPartes,
        esChunked: docData.esChunked
      };
      if (docData.data && docData.data.reservas) {
        inlineData = docData.data;
      }
    }

    // 1. If inline data exists (legacy backup format), return it directly
    if (inlineData) {
      return { ...meta, data: inlineData };
    }

    // 2. Fetch and join partitioned chunks from subcollection 'partes'
    const partesRef = collection(db, BACKUP_COLLECTION, backupId, 'partes');
    const partesSnap = await getDocs(partesRef);

    if (!partesSnap.empty) {
      const partes = partesSnap.docs.map(d => d.data() as DatabaseBackupChunk);
      partes.sort((a, b) => a.index - b.index);
      const joinedSerialized = partes.map(p => p.payload).join('');
      const parsedData = JSON.parse(joinedSerialized) as DatabaseBackupData;
      return { ...meta, data: parsedData };
    }

    if (docSnap.exists()) {
      return { ...meta };
    }

    return null;
  } catch (err) {
    console.error('[BackupService] Error al recuperar contenido completo de la copia:', err);
    return null;
  }
}

/**
 * Downloads a backup as a structured JSON file.
 */
export async function downloadBackupFile(backupId: string, backupData?: DatabaseBackupRecord): Promise<void> {
  let recordToDownload = backupData;

  if (!recordToDownload || !recordToDownload.data) {
    const fetched = await fetchFullBackupRecord(backupId, backupData);
    if (fetched && fetched.data) {
      recordToDownload = fetched;
    }
  }

  if (!recordToDownload || !recordToDownload.data) {
    console.error('No se pudo encontrar la información completa de la copia de seguridad para descargar.');
    throw new Error('No se pudo encontrar la información completa de la copia de seguridad para descargar.');
  }

  const jsonStr = JSON.stringify(recordToDownload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `copia_seguridad_espacios_${recordToDownload.fecha}_${recordToDownload.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Restores a full backup into the current database state.
 */
export async function restoreDatabaseFromBackup(
  backupRecord: DatabaseBackupRecord,
  currentUser?: AuthUser | null
): Promise<{ success: boolean; count: number; restoredReservations?: Reservation[]; error?: string }> {
  let recordToRestore = backupRecord;

  if (!recordToRestore.data || !Array.isArray(recordToRestore.data.reservas)) {
    const fetched = await fetchFullBackupRecord(backupRecord.id, backupRecord);
    if (fetched && fetched.data) {
      recordToRestore = fetched;
    }
  }

  if (!recordToRestore.data || !Array.isArray(recordToRestore.data.reservas)) {
    return { success: false, count: 0, error: 'La copia de seguridad no contiene una lista válida de reservas.' };
  }

  try {
    const reservationsToRestore = recordToRestore.data.reservas;
    const res = await seedAllToFirestore(reservationsToRestore, true);
    if (res.error) return { success: false, count: 0, error: res.error };

    void recordAuditEntry({
      reservaId: recordToRestore.id,
      action: 'BACKUP_RESTORED',
      description: `Base de datos restaurada a partir de copia de seguridad ${recordToRestore.id} (${recordToRestore.fecha})`,
      user: currentUser?.name || currentUser?.username || 'Administrador',
      userRole: currentUser?.role || 'Admin',
      diffs: [
        { field: 'id', label: 'ID de Copia', oldValue: null, newValue: recordToRestore.id },
        { field: 'totalReservas', label: 'Reservas Restauradas', oldValue: null, newValue: reservationsToRestore.length }
      ]
    }).catch(error=>console.warn("Respaldo restaurado; auditoría pendiente:", error));

    return { success: true, count: res.count, restoredReservations: getLocalCache() };
  } catch (err: any) {
    return { success: false, count: 0, error: err?.message || 'Error al restaurar copia de seguridad' };
  }
}

/**
 * Permanently deletes a backup record and its partitioned chunks.
 */
export async function deleteDatabaseBackup(backupId: string): Promise<boolean> {
  try {
    const db = getDb();
    // 1. Delete all chunk documents from subcollection 'partes'
    const partesRef = collection(db, BACKUP_COLLECTION, backupId, 'partes');
    const partesSnap = await getDocs(partesRef);
    if (!partesSnap.empty) {
      for (let i = 0; i < partesSnap.docs.length; i += 4) {
        await Promise.all(partesSnap.docs.slice(i,i+4).map(d => deleteDoc(d.ref)));
      }
    }

    // 2. Delete parent metadata document
    await deleteDoc(doc(db, BACKUP_COLLECTION, backupId));
  } catch (err) {
    throw err;
  }

  const current = getLocalBackupHistory().filter(b => b.id !== backupId);
  saveLocalBackupHistory(current);
  return true;
}

/**
 * Automatically rotates backups, keeping only the latest `maxBackupsToKeep` (default: 5)
 * in Firestore and localStorage, permanently deleting older backups to prevent storage bloat.
 */
export async function rotateOldBackups(maxBackupsToKeep: number = 5): Promise<number> {
  try {
    const list = await getDatabaseBackupsList();
    if (!list || list.length <= maxBackupsToKeep) {
      return 0;
    }

    // Sort newest first by timestamp
    const sorted = [...list].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const backupsToDelete = sorted.slice(maxBackupsToKeep);
    let deletedCount = 0;

    for (const b of backupsToDelete) {
      console.log(`[BackupService] Rotación FIFO: eliminando copia antigua ${b.id} (${b.fecha})`);
      await deleteDatabaseBackup(b.id);
      deletedCount++;
    }

    return deletedCount;
  } catch (err) {
    console.warn('[BackupService] Error during automated backup rotation:', err);
    return 0;
  }
}

