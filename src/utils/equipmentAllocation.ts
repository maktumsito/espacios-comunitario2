import type { EquipmentItem, Reservation } from '../types';
import { getTimeIntervalsForReservation, isReservationActiveForAvailability } from './conflictDetector';

export const normalizeEquipmentName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

export function resolveEquipment(request: { equipmentId: string; equipmentName: string }, catalog: readonly EquipmentItem[]) {
  return catalog.find(item => item.id === request.equipmentId) ||
    catalog.find(item => normalizeEquipmentName(item.name) === normalizeEquipmentName(request.equipmentName || ''));
}

/** Sweep end events before start events: adjacent bookings can reuse the same item.
 * Only shortage intervals involving a changed row reject an operation; unrelated legacy
 * overbooking must not prevent a cancellation or another day's correction. */
export function findEquipmentShortage(rows: readonly Reservation[], catalog: readonly EquipmentItem[], focusIds: ReadonlySet<string>): string | null {
  type Event = { time: number; quantity: number; id: string };
  const events = new Map<string, { item: EquipmentItem; date: string; events: Event[] }>();
  for (const row of rows) {
    if (!isReservationActiveForAvailability(row, new Set())) continue;
    const amounts = new Map<string, { item: EquipmentItem; quantity: number }>();
    for (const request of row.equipamientoSolicitado || []) {
      const item = resolveEquipment(request, catalog);
      if (!item) {
        if (focusIds.has(row.id)) return `El recurso ${request.equipmentName || request.equipmentId} ya no existe en el inventario.`;
        continue;
      }
      const quantity = Number(request.quantity);
      if ((!Number.isInteger(Number(item.totalQuantity)) || Number(item.totalQuantity) < 0) && focusIds.has(row.id))
        return `Cantidad inválida en el inventario de ${item.name}.`;
      if (!Number.isInteger(quantity) || quantity < 1) {
        if (focusIds.has(row.id)) return `Cantidad inválida para ${item.name}.`;
        continue;
      }
      const entry = amounts.get(item.id);
      amounts.set(item.id, { item, quantity: quantity + (entry?.quantity || 0) });
    }
    for (const { item, quantity } of amounts.values()) {
      for (const interval of getTimeIntervalsForReservation(row)) {
        const key = `${interval.date}|${item.id}`;
        const entry = events.get(key) || { item, date: interval.date, events: [] };
        entry.events.push({ time: interval.startMin, quantity, id: row.id }, { time: interval.endMin, quantity: -quantity, id: row.id });
        events.set(key, entry);
      }
    }
  }
  for (const { item, date, events: changes } of events.values()) {
    changes.sort((a, b) => a.time - b.time || a.quantity - b.quantity);
    let used = 0;
    const active = new Map<string, number>();
    for (let i = 0; i < changes.length;) {
      const time = changes[i].time;
      while (i < changes.length && changes[i].time === time) {
        const event = changes[i++];
        used += event.quantity;
        active.set(event.id, (active.get(event.id) || 0) + event.quantity);
      }
      if (used > item.totalQuantity && [...focusIds].some(id => (active.get(id) || 0) > 0)) {
        return `Equipamiento insuficiente: ${item.name}, ${date} (${used} solicitados, ${item.totalQuantity} disponibles en total).`;
      }
    }
  }
  return null;
}
