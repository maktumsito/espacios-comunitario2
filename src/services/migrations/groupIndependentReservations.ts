import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import type { Reservation } from '../../types';
import { isReservationActiveForAvailability } from '../../utils/conflictDetector';
import { getChileLocalDateString, WEEKDAYS } from '../../utils/dateUtils';

export interface IndependentReservationGroup {
  seriesId: string;
  weekday: number;
  reservations: Reservation[];
}

function weekdayForDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : parsed.getUTCDay();
}

export function normalizeReservationGroupName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/** Ignore accents/punctuation and small typos, but preserve levels and qualifiers. */
export function areReservationGroupNamesSimilar(first: string, second: string): boolean {
  const a = normalizeReservationGroupName(first);
  const b = normalizeReservationGroupName(second);
  if (!a || !b) return false;
  if (a === b) return true;
  const left = a.split(' '), right = b.split(' ');
  if (left.length !== right.length || JSON.stringify(a.match(/\d+/g)) !== JSON.stringify(b.match(/\d+/g))) return false;
  if (Math.min(a.length, b.length) < 6) return false;
  const limit = Math.max(1, Math.floor(Math.min(a.length, b.length) * 0.1));
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(
      next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = next;
  }
  return previous[b.length] <= limit;
}

/** Only link existing future sessions; never generate dates or merge established series. */
export function planIndependentReservationGroups(reservations: Reservation[], today = getChileLocalDateString(),
  createId = () => `SER_${crypto.randomUUID()}`): IndependentReservationGroup[] {
  const candidates = new Map<string, Reservation[]>();
  // Some imports marked each individual date as a different one-member series.
  // Count the full history, including cancelled sessions and replacement exceptions.
  const seriesMembers = new Map<string, Set<string>>();
  for (const row of reservations) for (const id of new Set([row.serieRecurrente, row.recurrenteId].filter(Boolean))) {
    const members = seriesMembers.get(id!) || new Set<string>();
    members.add(row.id); seriesMembers.set(id!, members);
  }
  for (const row of reservations) {
    const establishedSeries = [row.serieRecurrente, row.recurrenteId].some(id => id && (seriesMembers.get(id)?.size || 0) > 1);
    if (row.fecha < today || establishedSeries || row.tipoRecurrencia === 'doble_espacio' ||
      row.reemplazaReservaId || row.reemplazadaPorReservaId || row.solicitudEliminacion || !isReservationActiveForAvailability(row, new Set())) continue;
    const weekday = weekdayForDate(row.fecha);
    const name = normalizeReservationGroupName(row.descripcion || '');
    if (weekday === null || !name || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.horaInicio) ||
      !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(row.horaFin)) continue;
    const key = JSON.stringify([weekday, row.horaInicio, row.horaFin, Boolean(row.terminaDiaSiguiente)]);
    const list = candidates.get(key) || [];
    if (!list.some(existing => existing.id === row.id)) list.push(row);
    candidates.set(key, list);
  }
  const clusters: Reservation[][] = [];
  for (const rows of candidates.values()) {
    const matching: Reservation[][] = [];
    for (const row of [...rows].sort((a, b) => a.descripcion.localeCompare(b.descripcion) || a.id.localeCompare(b.id))) {
      // All names in a group must agree; a chain of weak matches cannot join unrelated activities.
      const cluster = matching.find(group => group.every(member => areReservationGroupNamesSimilar(member.descripcion, row.descripcion)));
      if (cluster) cluster.push(row); else matching.push([row]);
    }
    clusters.push(...matching);
  }
  return clusters.filter(rows => new Set(rows.map(row => row.fecha)).size >= 2)
    .map(rows => ({ seriesId: createId(), weekday: weekdayForDate(rows[0].fecha)!, reservations: [...rows]
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.espacio.localeCompare(b.espacio) || a.id.localeCompare(b.id)) }));
}

export function groupingPatch(group: IndependentReservationGroup, row: Reservation): Partial<Reservation> {
  const index = group.reservations.findIndex(candidate => candidate.id === row.id);
  if (index < 0) throw new Error('La reserva no pertenece al grupo.');
  return { actividadRecurrente: 'Sí', serieRecurrente: group.seriesId, recurrenteId: group.seriesId,
    indiceEnSerie: index + 1, totalEnSerie: group.reservations.length,
    // Explicit dates preserve gaps, omitted holidays and each session's exact schedule.
    tipoRecurrencia: 'especificas', diasSemana: WEEKDAYS.find(day => day.dayNum === group.weekday)!.key,
    fechaInicioRecurrencia: group.reservations[0].fecha,
    fechaFinRecurrencia: group.reservations.at(-1)!.fecha };
}

/** Order-independent revision check also protects legacy documents without versions. */
export function groupingRevision(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

/** Metadata-only transaction: existing occupancy and Google Calendar IDs stay intact. */
export async function applyIndependentReservationGroup(db: Firestore, group: IndependentReservationGroup, actor: string): Promise<boolean> {
  if (!actor.trim()) throw new Error('Indica quién solicitó la agrupación.');
  if (group.reservations.length < 2 || group.reservations.length > 400) throw new Error('El grupo debe contener entre 2 y 400 reservas para guardarse íntegramente.');
  return runTransaction(db, async transaction => {
    const snapshots = await Promise.all(group.reservations.map(row => transaction.get(doc(db, 'reservas', row.id))));
    const current = snapshots.map(snapshot => snapshot.exists() ? { ...snapshot.data(), id: snapshot.id } as Reservation : null);
    if (current.every(row => row?.serieRecurrente === group.seriesId && row.recurrenteId === group.seriesId)) return false;
    current.forEach((row, index) => {
      if (!row || groupingRevision(row) !== groupingRevision(group.reservations[index])) {
        throw new Error(`La reserva ${group.reservations[index].id} cambió o fue eliminada. Este grupo no se modificó.`);
      }
    });
    const today = getChileLocalDateString();
    const verified = planIndependentReservationGroups(current as Reservation[], today, () => group.seriesId);
    if (verified.length !== 1 || verified[0].reservations.length !== group.reservations.length) {
      throw new Error('El grupo ya no cumple las condiciones de nombre, día y horario. No se modificó.');
    }
    const timestamp = new Date().toISOString();
    group.reservations.forEach(row => transaction.update(doc(db, 'reservas', row.id), {
      ...groupingPatch(group, row), version: (row.version || 0) + 1, updatedAt: timestamp,
      editadoPor: actor, fechaEdicion: timestamp,
    }));
    transaction.set(doc(db, 'audit_logs', `GROUP_${group.seriesId}`), {
      id: `GROUP_${group.seriesId}`, timestamp, user: actor, action: 'UPDATE',
      description: `Agrupadas ${group.reservations.length} reservas independientes de '${group.reservations[0].descripcion}' con el mismo día semanal y horario. Se conservaron sus fechas, identificadores y ocupación.`,
      reservaId: group.reservations[0].id, serieRecurrente: group.seriesId,
      groupedReservationIds: group.reservations.map(row => row.id),
    });
    return true;
  });
}
