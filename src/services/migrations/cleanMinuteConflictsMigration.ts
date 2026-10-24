/**
 * Identificadores de una migración histórica retirada. Se conservan únicamente
 * por compatibilidad; este módulo ya no elimina reservas ni modifica datos locales.
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

/** Historical migration retired: detection and manual review replace automatic deletion. */
export async function executeMinuteConflictCleanupMigration(_options?: { force?: boolean }): Promise<MinuteConflictMigrationResult> {
  return { success: true, alreadyRun: true, deletedFromFirestore: 0, deletedFromLocal: 0, timestamp: Date.now() };
}
