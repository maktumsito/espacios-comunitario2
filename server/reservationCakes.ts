import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import type { Reservation } from '../src/types';
import { CAKE_CAPACITY, CAKE_END, CAKE_START, isCakeDate, isMunicipalActivity } from '../src/utils/reservationCakes';
import { isReservationActiveForAvailability } from '../src/utils/conflictDetector';
import { ApiFailure } from './dataApi';

const STOCK_PATH = '_reservation_inventory/cakes_2026_2027';
const OUTBOX = '_reservation_cake_mail';
type Allocation = { quantity: number; date: string; series: string | null };
type Addition = { title: string; date: string; quantity: number; createdBy?: string; previous?: number; assigned?: number };
type StockAdjustment = { delta: number; actor: string; reason: string };
type CakeNotice = { additions: Addition[]; available: number; capacity?: number; adjustment?: StockAdjustment; editedBy?: string };

export async function readCakeStock(db: Firestore) {
  const stock = (await db.doc(STOCK_PATH).get()).data();
  return { capacity: stock?.capacity ?? CAKE_CAPACITY, available: stock?.available ?? CAKE_CAPACITY, start: CAKE_START, end: CAKE_END };
}

export async function adjustCakeStock(
  db: Firestore, operationId: string, adjustment: StockAdjustment,
  authorize: (tx: Transaction) => Promise<void>,
) {
  const ref = db.doc(STOCK_PATH);
  const receipt = db.doc(`${OUTBOX}/stock-${operationId}`);
  return db.runTransaction(async tx => {
    await authorize(tx);
    const [stockSnap, receiptSnap] = await Promise.all([tx.get(ref), tx.get(receipt)]);
    const stock = stockSnap.data();
    const capacity = stock?.capacity ?? CAKE_CAPACITY;
    const available = stock?.available ?? CAKE_CAPACITY;
    const previous = receiptSnap.data()?.adjustment;
    if (previous) {
      if (previous.delta !== adjustment.delta || previous.actor !== adjustment.actor || previous.reason !== adjustment.reason)
        throw new ApiFailure(409, 'Ya se registró otro ajuste con este identificador.');
      return { capacity, available };
    }
    const next = { capacity: capacity + adjustment.delta, available: available + adjustment.delta };
    if (next.available < 0)
      throw new ApiFailure(409, `Solo quedan ${available} tortas disponibles para retirar.`);
    if (!Number.isSafeInteger(next.capacity)) throw new ApiFailure(400, 'El total de tortas excede el límite permitido.');
    tx.set(ref, { ...next, allocations: stock?.allocations || {} });
    tx.create(receipt, { ...next, adjustment, additions: [], state: 'pending', nextAttemptAt: Date.now() });
    return next;
  });
}

export async function cakeOperationNeedsAtomic(db: Firestore, rows: Reservation[], deletedIds: string[]) {
  if (rows.some(row => row.cantidadTortas !== undefined && row.cantidadTortas !== 0)) return true;
  if (!rows.length && !deletedIds.length) return false;
  const allocations = (await db.doc(STOCK_PATH).get()).data()?.allocations || {};
  return [...rows.map(row => row.id), ...deletedIds].some(id => Object.hasOwn(allocations, id));
}

export async function prepareCakeAllocation(
  db: Firestore, tx: Transaction, current: Map<string, Reservation>, saved: Reservation[],
  ids: string[], operationId: string, atomic: boolean, restoring: boolean, editedBy: string,
) {
  if (![...current.values(), ...saved].some(row => row.cantidadTortas !== undefined && row.cantidadTortas !== 0)) return;
  const stockRef = db.doc(STOCK_PATH);
  const stock = (await tx.get(stockRef)).data();
  const capacity = stock?.capacity ?? CAKE_CAPACITY;
  const before = new Map<string, Allocation>(Object.entries(stock?.allocations || {}));
  const next = new Map(before);
  ids.forEach(id => next.delete(id));
  for (const row of saved) {
    const quantity = row.cantidadTortas === undefined ? 0 : row.cantidadTortas;
    if (!Number.isSafeInteger(quantity) || quantity < 0)
      throw new ApiFailure(400, 'Ingresa una cantidad entera de tortas igual o mayor que cero.');
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
  const available = capacity - used;
  if (available < 0) throw new ApiFailure(409, `No hay tortas suficientes. Saldo actual: ${stock?.available ?? capacity}.`);
  const savedById = new Map(saved.map(row => [row.id, row]));
  const additions = ids.flatMap(id => {
    const previous = before.get(id)?.quantity || 0;
    const assigned = next.get(id)?.quantity || 0;
    const existing = current.get(id);
    const row = (assigned ? savedById.get(id) : existing);
    if (previous === assigned || !row) return [];
    return [{
      title: row.descripcion, date: row.fecha, quantity: assigned - previous, previous, assigned,
      createdBy: (existing ? existing.createdBy : row.createdBy) || 'No registrado',
    }];
  });
  return () => {
    tx.set(stockRef, { capacity, available, allocations: Object.fromEntries(next) });
    if (additions.length) tx.create(db.doc(`${OUTBOX}/reservation-${operationId}`), {
      additions: additions.sort((a, b) => a.date.localeCompare(b.date)),
      capacity, available, editedBy, state: 'pending', nextAttemptAt: Date.now(),
    });
  };
}

export function cakeEmail({ additions, available, capacity = CAKE_CAPACITY, adjustment, editedBy }: CakeNotice) {
  const isEdit = additions.some(({ previous }) => Boolean(previous));
  const total = additions.reduce((sum, addition) => sum + addition.quantity, 0);
  const bodyText = [
    ...(adjustment ? [
      `Ajuste de stock realizado por: ${adjustment.actor}`,
      `${adjustment.delta > 0 ? 'Tortas agregadas al stock' : 'Tortas retiradas del stock'}: ${Math.abs(adjustment.delta)}`,
      ...(adjustment.reason ? [`Motivo: ${adjustment.reason}`] : []),
    ] : additions.flatMap(({ title, date, quantity, createdBy, previous, assigned }) => [
      `Actividad municipal: ${title}`,
      `Fecha del evento: ${date.split('-').reverse().join('/')}`,
      `Reserva creada por: ${createdBy || 'No registrado'}`,
      quantity > 0 ? `Tortas solicitadas en este registro: ${quantity}` : `Tortas devueltas al stock: ${Math.abs(quantity)}`,
      ...(previous ? [`Tortas asignadas antes: ${previous}`, `Tortas asignadas ahora: ${assigned}`] : []),
      '',
    ])),
    ...(isEdit && editedBy ? [`Cambio realizado por: ${editedBy}`] : []),
    ...(additions.length > 1 && !isEdit ? [`Total solicitado en este registro: ${total}`] : []),
    `Tortas que quedan en stock: ${available} de ${capacity}.`,
  ].join('\n');
  return {
    to: ['p.flores@lascondes.cl', 'cshute@lascondes.cl', 'magomez@lascondes.cl'],
    subject: adjustment ? 'Ajuste de stock de tortas' : isEdit ? 'Cambio de tortas para actividad municipal' : 'Solicitud de tortas para actividad municipal',
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
