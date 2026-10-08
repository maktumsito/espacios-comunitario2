import type { AuditChangeLogEntry, Reservation } from '../types';
import { normalizeSpaceName } from '../data/spacesData';

const persistenceFields = new Set(['version', 'restoredStateVersion', 'createdAt', 'updatedAt', 'lastOperationId']);
function comparableState(row: Reservation): string {
  const series = row.serieRecurrente || row.recurrenteId;
  const normalized = { ...row, espacio: normalizeSpaceName(row.espacio), estado: row.estado || 'activa',
    terminaDiaSiguiente: Boolean(row.terminaDiaSiguiente), serieRecurrente: series, recurrenteId: series };
  const stable = (value: any): any => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined && value[key] !== null && value[key] !== '').map(key =>
      [key, key === 'dataUrl' && String(value[key]).startsWith('[ATTACHMENT_') ? '[LEGACY_ATTACHMENT]' : stable(value[key])])) : value;
  return JSON.stringify(stable(Object.fromEntries(Object.entries(normalized).filter(([key]) => !persistenceFields.has(key)))));
}

export const isDeletionAction = (action: string) => action.startsWith('DELETE') || action === 'AUTHORIZE_DELETE';
export const auditStateRows = (state?: Reservation | Reservation[]) => state ? (Array.isArray(state) ? state : [state]) : [];
export function canRestoreAuditEntry(entry: AuditChangeLogEntry): boolean {
  return !entry.isReverted && entry.affectedCount !== 0 && !entry.id.startsWith('AUDIT_BASELINE_') &&
    (isDeletionAction(entry.action) || ['UPDATE', 'CLEAR_PARTICIPANTS', 'TOGGLE_REALIZADA', 'CREATE', 'BULK_IMPORT'].includes(entry.action));
}

export function buildAuditRestorePlan(entry: AuditChangeLogEntry, current: Map<string, Reservation>) {
  if (!canRestoreAuditEntry(entry)) throw new Error('Este registro no admite restauración o ya fue restaurado.');
  const before = auditStateRows(entry.previousState);
  const after = auditStateRows(entry.newState);
  const deletion = isDeletionAction(entry.action);
  if (deletion && !before.length || !deletion && !after.length ||
      ['UPDATE', 'CLEAR_PARTICIPANTS', 'TOGGLE_REALIZADA'].includes(entry.action) && !before.length) {
    throw new Error('El registro no contiene el respaldo completo necesario para restaurar.');
  }
  // Older versions truncated arrays and replaced attachment bytes irreversibly.
  if (!entry.snapshotVersion && (before.length === 25 || after.length === 25 || before.some(r =>
    r.cartaCompromisoAdjunta?.dataUrl?.startsWith('[ATTACHMENT_')))) {
    throw new Error('El respaldo antiguo está incompleto. Recupera esta operación desde una copia de seguridad completa.');
  }
  if (!entry.snapshotVersion && entry.action === 'BULK_IMPORT' && !before.length && after.some(r => (r.version || 0) > 0)) {
    throw new Error('Esta importación antigua no conserva las versiones anteriores. Usa una copia de seguridad completa.');
  }
  const all = [...before, ...after];
  if (all.some(r => !r?.id) || new Set(before.map(r => r.id)).size !== before.length || new Set(after.map(r => r.id)).size !== after.length) {
    throw new Error('El respaldo contiene identificadores inválidos o duplicados.');
  }
  const previous = new Map(before.map(r => [r.id, r]));
  const next = new Map(after.map(r => [r.id, r]));
  const ids = [...new Set(all.map(r => r.id))];
  const expectedVersions: Record<string, number> = {};
  for (const id of ids) {
    const live = current.get(id);
    const saved = next.get(id);
    if (!saved) {
      if (live) throw new Error('Una reserva eliminada ya existe nuevamente. No se sobrescribió.');
      expectedVersions[id] = -1;
      continue;
    }
    if (!live) throw new Error('Una reserva de este cambio fue eliminada posteriormente. No se volvió a crear.');
    const expected = saved.version || 0;
    const liveStateVersion = live.restoredStateVersion ?? live.version ?? 0;
    const legacyMatches = (live.version || 0) === expected || (live.version || 0) === expected + 1;
    if (entry.snapshotVersion ? liveStateVersion !== expected : !legacyMatches || comparableState(live) !== comparableState(saved)) {
      throw new Error('Hay modificaciones posteriores a este cambio. Revierte primero los cambios más recientes.');
    }
    expectedVersions[id] = live.version || 0;
  }
  return {
    reservations: before.map(r => ({ ...r, version: current.get(r.id)?.version || 0,
      restoredStateVersion: r.restoredStateVersion ?? r.version ?? 0 })),
    deletedIds: after.filter(r => !previous.has(r.id)).map(r => r.id),
    expectedVersions,
    affectedCount: ids.length,
  };
}
