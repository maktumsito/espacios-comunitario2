import type { Reservation } from '../types';
import { isReservationActiveForAvailability } from './conflictDetector';
import { normalizeSpaceName } from '../data/spacesData';

export interface DuplicateCandidate { key: string; reservations: Reservation[]; }
const normalized = (value?: string) => (value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');

/** Candidates require matching event identity and interval; a collision alone is not a duplicate. */
export function findDuplicateCandidates(rows: Reservation[]): DuplicateCandidate[] {
  const groups = new Map<string, Reservation[]>();
  for (const row of rows) {
    if (!row.id || !row.espacio || !isReservationActiveForAvailability(row) || !row.fecha || !row.horaInicio || !row.horaFin ||
      !normalized(row.responsable) || !normalized(row.descripcion)) continue;
    const key = JSON.stringify([row.fecha, normalized(normalizeSpaceName(row.espacio)), row.horaInicio, row.horaFin,
      Boolean(row.terminaDiaSiguiente), normalized(row.responsable), normalized(row.descripcion), normalized(row.tipoActividad), row.serieRecurrente || '']);
    const group = groups.get(key) || [];
    if (!group.some(existing => existing.id === row.id)) group.push(row);
    groups.set(key, group);
  }
  return [...groups.entries()].filter(([, group]) => group.length > 1)
    .map(([key, reservations]) => ({ key, reservations })).sort((a, b) => a.reservations[0].fecha.localeCompare(b.reservations[0].fecha));
}

export function automaticBackupsToRotate<T extends { id: string; tipo: string; timestamp: string; protected?: boolean; storageStatus?: string }>(rows: T[], keep = 5): T[] {
  if (!Number.isInteger(keep) || keep < 1) throw new Error('Debe conservarse al menos una copia automática.');
  return rows.filter(row => row.tipo === 'automatica_15_dias' && !row.protected &&
    row.storageStatus !== 'local_only' && Number.isFinite(Date.parse(row.timestamp)))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(keep);
}
