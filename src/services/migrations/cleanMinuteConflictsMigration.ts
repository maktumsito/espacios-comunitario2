import {usesDataApi} from '../../firebase/gateway';
import { doc, writeBatch } from '../../firebase/gateway';
import { getDb } from '../../firebase/config';
import { Reservation } from '../../types';
import {
  getIndexedDbReservations,
  setIndexedDbReservations
} from '../../utils/indexedDbStorage';

/**
 * 22 ID base y prefijos que correspondían a registros duplicados/solapados históricos
 * originados por desfase de minutos. Esta lista reside únicamente en este módulo de migración
 * para ser purgada de raíz en la base de datos y depósitos locales.
 */
export const OBSOLETE_MINUTE_CONFLICT_IDS: readonly string[] = Object.freeze([
  'RSV_C16DD34DB5B7',
  'RSV_99CE0543F176',
  'RSV_B03B8847D543',
  'RSV_36028BD587BE',
  'RSV_71C86219CEAF',
  'RSV_F5D905C79E3A',
  'RSV_1E5772637921',
  'RSV_31C199C6E43C',
  'RSV_77A256F60E60',
  'RSV_C4EB393BBE33',
  'RSV_D42334C65E94',
  'RSV_RSVC16DD34',
  'RSV_RSV99CE054',
  'RSV_RSVB03B884',
  'RSV_RSV36028BD',
  'RSV_RSV71C8621',
  'RSV_RSVF5D905C',
  'RSV_RSV1E57726',
  'RSV_RSV31C199C',
  'RSV_RSV77A256F',
  'RSV_RSVC4EB393',
  'RSV_RSVD42334C'
]);

export const MINUTE_CONFLICT_MIGRATION_KEY = 'espacios_migration_purged_minute_conflicts_v1';
const COLLECTION_NAME = 'reservas';

/**
 * Comprueba si un ID corresponde a los registros obsoletos a depurar.
 */
export function isObsoleteConflictId(id: string): boolean {
  if (!id) return false;
  return OBSOLETE_MINUTE_CONFLICT_IDS.some((base) => id === base || id.includes(base));
}

/**
 * Verifica si la migración de depuración ya fue ejecutada en este cliente.
 */
export function hasMinuteConflictMigrationRun(): boolean {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return false;
  return Boolean(localStorage.getItem(MINUTE_CONFLICT_MIGRATION_KEY));
}

export interface MinuteConflictMigrationResult {
  success: boolean;
  alreadyRun?: boolean;
  deletedFromFirestore: number;
  deletedFromLocal: number;
  error?: string;
  timestamp: number;
}

/**
 * Ejecuta la migración definitiva de depuración:
 * 1. Envía un batch delete atómico a Firestore para remover los documentos obsoletos.
 * 2. Limpia los registros de LocalStorage e IndexedDB.
 * 3. Registra una marca persistente para evitar ejecuciones repetidas a menos que se fuerce.
 */
export async function executeMinuteConflictCleanupMigration(
  options?: { force?: boolean }
): Promise<MinuteConflictMigrationResult> {
  if(usesDataApi()){
    if(!options?.force)return {success:true,alreadyRun:true,deletedFromFirestore:0,deletedFromLocal:0,timestamp:Date.now()};
    const {cleanConflictingMinuteReservations}=await import('../reservationService');const result=await cleanConflictingMinuteReservations();
    return {success:true,alreadyRun:false,deletedFromFirestore:result.deletedCount,deletedFromLocal:result.deletedCount,timestamp:Date.now()};
  }
  const force = Boolean(options?.force);

  if (!force && hasMinuteConflictMigrationRun()) {
    return {
      success: true,
      alreadyRun: true,
      deletedFromFirestore: 0,
      deletedFromLocal: 0,
      timestamp: Date.now()
    };
  }

  let deletedFromFirestore = 0;
  let deletedFromLocal = 0;

  // 1. Limpieza atómica en Firestore
  try {
    const db = getDb();
    if (db) {
      const batch = writeBatch(db);
      for (const id of OBSOLETE_MINUTE_CONFLICT_IDS) {
        const docRef = doc(db, COLLECTION_NAME, id);
        batch.delete(docRef);
      }
      await batch.commit();
      deletedFromFirestore = OBSOLETE_MINUTE_CONFLICT_IDS.length;
    }
  } catch (err: any) {
    console.warn('Firestore minute conflict migration batch delete notice:', err?.message || err);
    // Si falla Firestore (ej. sin conexión), proseguimos con la limpieza local
  }

  // 2. Limpieza de LocalStorage
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('reservas_comunitarias_cache') || key.startsWith('espacios_reservas_cache'))) {
          const raw = localStorage.getItem(key);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                const cleaned = parsed.filter((r: Reservation) => !isObsoleteConflictId(r.id));
                if (cleaned.length !== parsed.length) {
                  deletedFromLocal += parsed.length - cleaned.length;
                  localStorage.setItem(key, JSON.stringify(cleaned));
                }
              }
            } catch {
              // ignore json parse error
            }
          }
        }
      }
    } catch (err) {
      console.warn('LocalStorage minute conflict cleanup error:', err);
    }
  }

  // 3. Limpieza de IndexedDB
  try {
    const idbData = await getIndexedDbReservations();
    if (idbData && idbData.length > 0) {
      const cleaned = idbData.filter((r) => !isObsoleteConflictId(r.id));
      if (cleaned.length !== idbData.length) {
        deletedFromLocal += idbData.length - cleaned.length;
        await setIndexedDbReservations(cleaned);
      }
    }
  } catch (err) {
    console.warn('IndexedDB minute conflict cleanup error:', err);
  }

  // 4. Marcar migración como completada
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(MINUTE_CONFLICT_MIGRATION_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  return {
    success: true,
    alreadyRun: false,
    deletedFromFirestore,
    deletedFromLocal,
    timestamp: Date.now()
  };
}
