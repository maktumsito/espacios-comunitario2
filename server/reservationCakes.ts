import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Reservation } from '../src/types';
import { CAKE_CAPACITY, CAKE_END, CAKE_START, isCakeDate, isMunicipalActivity } from '../src/utils/reservationCakes';
import { isReservationActiveForAvailability } from '../src/utils/conflictDetector';
import { ApiFailure } from './dataApi';

const STOCK_PATH = '_reservation_inventory/cakes_2026_2027';
const OUTBOX = '_reservation_cake_mail';
type Allocation = { quantity: number; date: string; series: string | null };
type Addition = { title: string; date: string; quantity: number };
type CakeNotice = { additions: Addition[]; available: number };

export async function readCakeStock(db: Firestore) {
  const stock = (await db.doc(STOCK_PATH).get()).data();
  return { capacity: CAKE_CAPACITY, available: stock?.available ?? CAKE_CAPACITY, start: CAKE_START, end: CAKE_END };
}

export async function cakeOperationNeedsAtomic(db: Firestore, rows: Reservation[], deletedIds: string[]) {
  if (rows.some(row => row.cantidadTortas !== undefined && row.cantidadTortas !== 0)) return true;
  if (!rows.length && !deletedIds.length) return false;
  const allocations = (await db.doc(STOCK_PATH).get()).data()?.allocations || {};
  return [...rows.map(row => row.id), ...deletedIds].some(id => Object.hasOwn(allocations, id));
}

export async function prepareCakeAllocation(
  db: Firestore, tx: Transaction, current: Map<string, Reservation>, saved: Reservation[],
  ids: string[], operationId: string, atomic: boolean, restoring: boolean,
) {
  if (![...current.values(), ...saved].some(row => row.cantidadTortas !== undefined && row.cantidadTortas !== 0)) return;
  const stockRef = db.doc(STOCK_PATH);
  const stock = (await tx.get(stockRef)).data();
  const before = new Map<string, Allocation>(Object.entries(stock?.allocations || {}));
  const next = new Map(before);
  const additions: Addition[] = [];
  ids.forEach(id => next.delete(id));
  for (const row of saved) {
    const quantity = row.cantidadTortas === undefined ? 0 : row.cantidadTortas;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > CAKE_CAPACITY)
      throw new ApiFailure(400, 'Ingresa una cantidad entera de tortas entre 0 y 15.');
    if (!quantity) continue;
    if (!isReservationActiveForAvailability(row, new Set())) {
      if (!restoring && quantity !== current.get(row.id)?.cantidadTortas)
        throw new ApiFailure(400, 'La reserva debe estar activa para asignarle tortas.');
      continue;
    }
    if (!isMunicipalActivity(row.tipoActividad) || !isCakeDate(row.fecha)) {
      if (!restoring && before.get(row.id)?.quantity === quantity) {
        delete row.cantidadTortas;
        continue;
      }
      throw new ApiFailure(400, 'Las tortas solo se asignan a actividades municipales dentro del período.');
    }
    next.set(row.id, { quantity, date: row.fecha, series: row.serieRecurrente || row.recurrenteId || null });
    const added = quantity - (before.get(row.id)?.quantity || 0);
    if (added > 0) additions.push({ title: row.descripcion, date: row.fecha, quantity: added });
  }
  const dates = new Set<string>();
  let used = 0;
  for (const allocation of next.values()) {
    used += allocation.quantity;
    if (!allocation.series) continue;
    const key = JSON.stringify([allocation.series, allocation.date]);
    if (dates.has(key)) throw new ApiFailure(409, 'Ya hay una asignación de tortas para esta fecha de la serie.');
    dates.add(key);
  }
  const changed = ids.some(id => JSON.stringify(before.get(id)) !== JSON.stringify(next.get(id)));
  if (!changed) return;
  if (!atomic) throw new ApiFailure(409, 'Cambió la asignación de tortas. Recarga las reservas y vuelve a guardar.');
  const available = CAKE_CAPACITY - used;
  if (available < 0) throw new ApiFailure(409, `No hay tortas suficientes. Saldo actual: ${stock?.available ?? CAKE_CAPACITY}.`);
  return () => {
    tx.set(stockRef, { available, allocations: Object.fromEntries(next) });
    if (additions.length) tx.create(db.doc(`${OUTBOX}/${operationId}`), {
      additions: additions.sort((a, b) => a.date.localeCompare(b.date)),
      available, state: 'pending', nextAttemptAt: Date.now(),
    });
  };
}

export function cakeEmail({ additions, available }: CakeNotice) {
  const bodyText = [
    'Se asignaron tortas a las siguientes actividades municipales:',
    ...additions.map(({ title, date, quantity }) => `• ${date.split('-').reverse().join('/')} · ${title} · ${quantity} ${quantity === 1 ? 'torta' : 'tortas'}`),
    '',
    `Stock disponible al guardar: ${available} de ${CAKE_CAPACITY} tortas.`,
  ].join('\n');
  return {
    to: ['p.flores@lascondes.cl', 'cshute@lascondes.cl', 'magomez@lascondes.cl'],
    subject: 'Tortas asignadas a actividad municipal',
    bodyText,
    html: bodyText.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>'),
    purpose: 'reservation_cakes',
  };
}

export async function dispatchCakeNotices(
  db: Firestore,
  send: (email: ReturnType<typeof cakeEmail>) => Promise<{ success: boolean; safeToRetry?: boolean; messageId?: string }>,
) {
  const now = Date.now();
  const queued = await db.collection(OUTBOX).where('nextAttemptAt', '<=', now).orderBy('nextAttemptAt').limit(10).get();
  for (const item of queued.docs) {
    const notice = await db.runTransaction(async tx => {
      const data = (await tx.get(item.ref)).data();
      if (!data || data.nextAttemptAt > now) return null;
      if (data.state === 'sending') {
        tx.update(item.ref, { state: 'needs_reconciliation', nextAttemptAt: FieldValue.delete() });
        return null;
      }
      if (data.state !== 'pending') return null;
      tx.update(item.ref, { state: 'sending', nextAttemptAt: now + 30 * 60_000 });
      return data as CakeNotice;
    });
    if (!notice) continue;
    const result = await send(cakeEmail(notice)).catch(() => ({ success: false, safeToRetry: false, messageId: undefined }));
    await db.runTransaction(async tx => {
      const data = (await tx.get(item.ref)).data();
      if (data?.state !== 'sending') return;
      tx.update(item.ref, {
        state: result.success ? 'sent' : result.safeToRetry ? 'pending' : 'needs_reconciliation',
        nextAttemptAt: !result.success && result.safeToRetry ? Date.now() + 5 * 60_000 : FieldValue.delete(),
        messageId: result.messageId ?? null,
      });
    });
  }
}
