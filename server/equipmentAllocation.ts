import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import type { EquipmentItem, Reservation } from '../src/types';
import { DEFAULT_EQUIPMENT_ITEMS } from '../src/data/equipmentData';
import { findEquipmentShortage, resolveEquipment } from '../src/utils/equipmentAllocation';
import { getTimeIntervalsForReservation, isReservationActiveForAvailability } from '../src/utils/conflictDetector';
import { reservationSlots } from '../src/services/reservationWriter';

const previousDate = (date: string) => new Date(Date.parse(`${date}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export function equipmentAllocationSignature(r?: Reservation): string {
  if (!r || !isReservationActiveForAvailability(r, new Set()) || !r.equipamientoSolicitado?.length) return '';
  const items = r.equipamientoSolicitado
    .map(item => ({
      id: (item.equipmentId || '').trim().toLowerCase(),
      name: (item.equipmentName || '').trim().toLowerCase(),
      quantity: Number(item.quantity) || 0,
    }))
    .filter(item => item.quantity > 0)
    .sort((a, b) => (a.id || a.name).localeCompare(b.id || b.name));
  if (!items.length) return '';
  return JSON.stringify([r.fecha, r.horaInicio, r.horaFin, Boolean(r.terminaDiaSiguiente), items]);
}

/** Read before any transaction writes. Query canonical reservations so old bookings
 * need no index migration. Per-resource/day guards serialize competitors in different
 * rooms, including the first two users racing to create a previously missing guard. */
export async function prepareEquipmentAllocation(db: Firestore, tx: Transaction, current: Map<string, Reservation>, saved: Reservation[], changedIds: string[]): Promise<() => void> {
  const savedById = new Map(saved.map(r => [r.id, r]));
  const equipmentChangedIds = changedIds.filter(
    id => equipmentAllocationSignature(current.get(id)) !== equipmentAllocationSignature(savedById.get(id))
  );
  if (!equipmentChangedIds.length) return () => {};
  const relevant = equipmentChangedIds
    .flatMap(id => [current.get(id), savedById.get(id)])
    .filter((r): r is Reservation => Boolean(r && isReservationActiveForAvailability(r, new Set()) && r.equipamientoSolicitado?.length));
  if (!relevant.length) return () => {};
  const config = await tx.get(db.doc('configuracion_sistema/equipamiento'));
  const catalog: EquipmentItem[] = config.exists && Array.isArray(config.get('items')) ? config.get('items') : DEFAULT_EQUIPMENT_ITEMS;
  const guards = new Map<string, { date: string }>();
  for (const row of relevant) for (const interval of getTimeIntervalsForReservation(row)) {
    for (const request of row.equipamientoSolicitado || []) {
      const item = resolveEquipment(request, catalog);
      if (item) guards.set(`${interval.date}_${createHash('sha256').update(item.id).digest('hex')}`, { date: interval.date });
    }
  }
  const roomKeys = new Set([...current.values(), ...saved].flatMap(r => [...reservationSlots(r).keys()]));
  if (changedIds.length + roomKeys.size + guards.size + 40 > 450) throw new Error('El grupo excede el límite atómico de equipamiento. Reduce el número de actividades.');
  const guardRefs = [...guards.keys()].map(id => db.doc(`equipment_day_guards/${id}`));
  const dates = [...new Set([...guards.values()].map(g => g.date))];
  const [guardSnapshots, bookings] = await Promise.all([
    guardRefs.length ? tx.getAll(...guardRefs) : Promise.resolve([]),
    Promise.all(dates.map(date => tx.get(db.collection('reservas').where('fecha', '>=', previousDate(date)).where('fecha', '<=', date)))),
  ]);
  const agenda = new Map<string, Reservation>();
  bookings.forEach(snapshot => snapshot.docs.forEach(doc => agenda.set(doc.id, { ...doc.data(), id: doc.id } as Reservation)));
  changedIds.forEach(id => agenda.delete(id));
  saved.forEach(row => agenda.set(row.id, row));
  const shortage = findEquipmentShortage([...agenda.values()], catalog, new Set(saved.map(r => r.id)));
  if (shortage) throw new Error(shortage);
  return () => guardSnapshots.forEach((snapshot, i) => tx.set(guardRefs[i], { revision: Number(snapshot.get('revision') || 0) + 1 }));
}
