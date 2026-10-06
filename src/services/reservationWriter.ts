import { doc, getDoc, runTransaction, type Firestore } from 'firebase/firestore';
import type { Reservation } from '../types';
import { getConstituentSpaces, getTimeIntervalsForReservation, isReservationActiveForAvailability, isDateExemptFromConflicts, isTimeOverlapping, findReservationConflicts } from '../utils/conflictDetector';
import { isChileanHoliday, verifyHolidayOverrideKey } from '../utils/holidayUtils';
import { validateReservationWithZod } from '../schemas/reservationSchema';
import { canReplaceOccurrence, sameReplacementSlot } from '../utils/reservationReplacement';

export interface WriteResult {
  operationId: string;
  confirmedIds: string[];
  deletedIds: string[];
  pendingIds: string[];
  reservations: Reservation[];
}
export interface WriteOptions {
  requireAtomic?: boolean;
  intent?: 'create' | 'update';
  actor?: string;
  operationId?: string;
  deletedIds?: string[];
  allowConflictOverride?: boolean;
  onProgress?: (result: WriteResult) => void;
}
export class ReservationWriteError extends Error {
  constructor(message: string, public result: WriteResult, public cause?: unknown) { super(message); }
}
export class ReservationVersionError extends Error {
  constructor(public current: Reservation) {
    super('La reserva cambió por otro usuario. Recarga la versión actual antes de guardar; tus datos se conservaron.');
  }
}
class ReplacementValidationError extends Error {}
export type SlotBooking = { id: string; startMin: number; endMin: number; horaInicio: string; horaFin: string; responsable: string; estado: string; exempt: boolean };
export type ScheduleSlot = { fecha: string; espacio: string; bookings: SlotBooking[] };
export function reservationSlots(r: Reservation): Map<string, ScheduleSlot> {
  const slots = new Map<string, ScheduleSlot>();
  if (!isReservationActiveForAvailability(r, new Set())) return slots;
  for (const interval of getTimeIntervalsForReservation(r)) {
    for (const space of new Set(getConstituentSpaces(r.espacio))) {
      const key = `${interval.date}_${encodeURIComponent(space)}`;
      slots.set(key, { fecha: interval.date, espacio: space, bookings: [{
        id: r.id, startMin: interval.startMin, endMin: interval.endMin,
        horaInicio: r.horaInicio, horaFin: r.horaFin, responsable: r.responsable,
        estado: r.estado || 'activa', exempt: isDateExemptFromConflicts(r.fecha),
      }] });
    }
  }
  return slots;
}
export function prepareReservation(r: Reservation): Reservation {
  const normalized = { ...r, id: r.id?.trim(), fecha: r.fecha?.trim().split('T')[0],
    horaInicio: r.horaInicio?.trim(), horaFin: r.horaFin?.trim(), espacio: getConstituentSpaces(r.espacio).join(' / '),
    responsable: r.responsable?.trim(), descripcion: r.descripcion?.trim(),
    tipoActividad: r.tipoActividad?.trim(), terminaDiaSiguiente: Boolean(r.terminaDiaSiguiente) };
  const check = validateReservationWithZod(normalized);
  if (!check.success) throw new Error(check.firstError);
  if (isReservationActiveForAvailability(normalized,new Set()) && isChileanHoliday(normalized.fecha) && !verifyHolidayOverrideKey(normalized.claveAutorizacionFeriado || normalized.claveAutorizacion || '')) {
    throw new Error(`La fecha ${normalized.fecha} es feriado y requiere autorización CCD.`);
  }
  return normalized;
}

// Persist the payload before the first write. A reload can retry with the SAME IDs.
const JOURNAL_KEY = 'reservation_pending_operations_v1';
export interface PendingOperation { id: string; actor?: string; reservations: Reservation[]; deletedIds: string[]; confirmedIds: string[]; allowConflictOverride: boolean; intent?: 'create' | 'update'; requireAtomic?: boolean; }
export function getPendingOperations(): PendingOperation[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(JOURNAL_KEY) || '[]');
    return Array.isArray(value) ? value.filter(o => o && typeof o.id === 'string' && Array.isArray(o.reservations) && Array.isArray(o.deletedIds) && Array.isArray(o.confirmedIds)) : [];
  } catch { return []; }
}
function updateJournal(operation: PendingOperation, finished = false) {
  if (typeof localStorage === 'undefined') return;
  const entries = getPendingOperations().filter(o => o.id !== operation.id);
  if (!finished) entries.push(operation);
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('reservation-operations-changed'));
}
function allSlotKeys(r?: Reservation, legacy = false): string[] {
  if (!r) return [];
  // Include the legacy compound key when removing stale entries.
  return [...reservationSlots(legacy ? { ...r, estado: 'activa' } : r).keys(), ...(legacy ? [`${r.fecha}_${encodeURIComponent(r.espacio)}`] : [])];
}

// Connected reservations are kept together, so a swap never leaves overlapping
// confirmed bookings while the rest of a large operation is still pending.
export function planWriteChunks(items: Reservation[], previous: Map<string, Reservation>, deletedIds: string[]): string[][] {
  const incoming = new Map(items.map(r => [r.id, r]));
  const ids = [...new Set([...incoming.keys(), ...deletedIds])];
  const parent = new Map(ids.map(id => [id,id]));
  const root = (id: string): string => { let p = parent.get(id)!; while (p !== parent.get(p)) p = parent.get(p)!; parent.set(id,p); return p; };
  const slotOwner = new Map<string,string>();
  const keysById = new Map<string,Set<string>>();
  for (const id of ids) {
    const keys = new Set([...allSlotKeys(previous.get(id),true), ...allSlotKeys(incoming.get(id))]);
    keysById.set(id,keys);
    for (const key of keys) {
      const owner = slotOwner.get(key);
      if (owner) parent.set(root(id),root(owner)); else slotOwner.set(key,id);
    }
  }
  for (const r of items) {
    for (const linked of [r.reemplazaReservaId, r.reemplazadaPorReservaId]) {
      if (linked && parent.has(linked)) parent.set(root(r.id), root(linked));
    }
  }
  const groups = new Map<string,string[]>();
  for (const id of ids) { const key = root(id); groups.set(key,[...(groups.get(key)||[]), id]); }
  const chunks: string[][] = [];
  let chunk: string[] = []; let slotKeys = new Set<string>(); let chunkBytes = 0;
  for (const group of groups.values()) {
    const keys = new Set(group.flatMap(id => [...keysById.get(id)!]));
    const bytes = group.reduce((total,id)=>total+new TextEncoder().encode(JSON.stringify(incoming.get(id)||{})).byteLength,0);
    if (group.length + keys.size > 450) throw new Error('Este grupo comparte espacios y excede el límite de guardado atómico. Divide la operación antes de guardar.');
    if (bytes > 8_000_000) throw new Error('Los adjuntos de este grupo exceden el tamaño de una transacción. Reduce los adjuntos antes de guardar.');
    const combined = new Set([...slotKeys,...keys]);
    if (chunk.length + group.length + combined.size > 450 || chunkBytes+bytes>8_000_000) { chunks.push(chunk); chunk = []; slotKeys = new Set(); chunkBytes=0; }
    chunkBytes+=bytes;
    chunk.push(...group); keys.forEach(k=>slotKeys.add(k));
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

export async function writeReservations(db: Firestore, input: readonly Reservation[], clean: (r: Reservation) => object, options: WriteOptions = {}): Promise<WriteResult> {
  const items = input.map(r=> {
    try { return prepareReservation(r); }
    catch(error: any) { throw new Error(`Reserva ${r.id} (${r.fecha}): ${error?.message || 'Datos inválidos'}`); }
  });
  for (const r of items) if(new TextEncoder().encode(JSON.stringify(clean(r))).byteLength>900_000) throw new Error(`El adjunto de la reserva ${r.id} es demasiado grande para guardar.`);
  if (new Set(items.map(r=>r.id)).size !== items.length) throw new Error('La operación contiene IDs de reserva duplicados.');
  const deletedIds = [...new Set(options.deletedIds || [])].filter(id => !items.some(r=>r.id===id));
  const fingerprint = (rows: readonly Reservation[]) => JSON.stringify(rows.map(({ createdAt, updatedAt, ...r }) => r));
  const pending = !options.operationId && getPendingOperations().find(o =>
    o.actor === options.actor && fingerprint(o.reservations) === fingerprint(items) && JSON.stringify(o.deletedIds) === JSON.stringify(deletedIds));
  const operationId = options.operationId || (pending && pending.id) || crypto.randomUUID();
  const ids = [...items.map(r=>r.id),...deletedIds];
  const result: WriteResult = { operationId, confirmedIds: [], deletedIds: [], pendingIds: [...ids], reservations: [] };
  if (!ids.length) return result;
  if (!options.allowConflictOverride && findReservationConflicts(items, [], { allowCandidateSelfConflicts: false }).length) throw new Error('Conflicto entre las reservas de la operación.');
  const previous = new Map<string, Reservation>();
  // Bounded preflight reads; the transaction rechecks every document revision.
  if (options.intent === 'create') {
    if(deletedIds.length || items.some(r=>r.version)) throw new Error('La creación solo puede incluir reservas nuevas.');
  } else if (ids.length > 1 || !items.length) {
    for (let i=0;i<ids.length;i+=20) {
      const snapshots = await Promise.all(ids.slice(i,i+20).map(id=>getDoc(doc(db,'reservas',id))));
      snapshots.forEach(s=> { if(s.exists()) previous.set(s.id,s.data() as Reservation); });
    }
  }
  const chunks = planWriteChunks(items, previous, deletedIds);
  if (options.requireAtomic && chunks.length > 1) throw new Error('La serie excede el límite de un movimiento atómico. Usa un alcance más pequeño. No se modificó ninguna reserva.');
  const tracked = getPendingOperations().find(o=>o.id===operationId);
  const operation: PendingOperation = { id: operationId, actor: options.actor, reservations: tracked?.reservations || items, deletedIds: tracked?.deletedIds || deletedIds, confirmedIds: tracked?.confirmedIds || [], allowConflictOverride: Boolean(options.allowConflictOverride), intent: options.intent, ...(options.requireAtomic ? {requireAtomic: true} : {}) };
  updateJournal(operation);
  const byId = new Map(items.map(r=>[r.id,r]));
  try {
    for (const chunk of chunks) {
      const committed = await runTransaction(db, async tx => {
        const incomingKeys = new Set(chunk.flatMap(id=>allSlotKeys(byId.get(id))));
        const [snapshots, incomingSlotSnapshots] = await Promise.all([
          Promise.all(chunk.map(id=>tx.get(doc(db,'reservas',id)))),
          Promise.all([...incomingKeys].map(key=>tx.get(doc(db,'schedule_slots',key)))),
        ]);
        const current = new Map<string,Reservation>();
        snapshots.forEach(s=> { if(s.exists()) current.set(s.id,s.data() as Reservation); });
        const linkedIds = [...new Set([...current.values()].map(r => r.reemplazadaPorReservaId).filter((id): id is string => Boolean(id && !current.has(id))))];
        const linkedSnapshots = await Promise.all(linkedIds.map(id => tx.get(doc(db, 'reservas', id))));
        const linkedCurrent = new Map<string, Reservation>();
        linkedSnapshots.forEach(s => { if (s.exists()) linkedCurrent.set(s.id, s.data() as Reservation); });
        // A newly linked replacement and its cancellation must be confirmed together.
        for (const id of chunk) {
          const next = byId.get(id);
          const existing = current.get(id);
          if (!next || (existing as any)?.lastOperationId === operationId) continue;
          if (existing?.reemplazadaPorReservaId && next.reemplazadaPorReservaId !== existing.reemplazadaPorReservaId ||
              existing?.reemplazaReservaId && next.reemplazaReservaId !== existing.reemplazaReservaId) {
            throw new ReplacementValidationError('No se puede quitar el vínculo de un reemplazo existente.');
          }
          if (next.reemplazaReservaId && !existing) {
            const original = current.get(next.reemplazaReservaId);
            const suspended = byId.get(next.reemplazaReservaId);
            if (!original || !canReplaceOccurrence(original) || !suspended || suspended.estado !== 'cancelada' ||
                suspended.reemplazadaPorReservaId !== next.id || !sameReplacementSlot(original, next) ||
                !sameReplacementSlot(original, suspended) || !next.motivoReemplazo?.trim() ||
                next.motivoReemplazo !== suspended.motivoReemplazo || next.actividadRecurrente !== 'No' ||
                next.serieRecurrente || next.recurrenteId || next.estado !== 'activa' || options.allowConflictOverride) {
              throw new ReplacementValidationError('El reemplazo requiere una sesión activa y el guardado conjunto sin solapamientos.');
            }
          }
          if (next.reemplazadaPorReservaId && !existing?.reemplazadaPorReservaId) {
            const replacement = byId.get(next.reemplazadaPorReservaId);
            if (!existing || !replacement || current.has(replacement.id) || replacement.reemplazaReservaId !== next.id) {
              throw new ReplacementValidationError('La suspensión debe guardarse junto con una actividad excepcional nueva.');
            }
          }
          if (existing?.reemplazadaPorReservaId && isReservationActiveForAvailability(next, new Set())) {
            const linkedId = existing.reemplazadaPorReservaId;
            const replacement = byId.get(linkedId) || current.get(linkedId) || linkedCurrent.get(linkedId);
            if (replacement && findReservationConflicts([next], [replacement]).length) {
              throw new ReplacementValidationError('No se puede reactivar: el horario sigue ocupado por el reemplazo.');
            }
          }
        }
        const keys = new Set(chunk.flatMap(id=>[...allSlotKeys(current.get(id),true),...allSlotKeys(byId.get(id))]));
        if (chunk.length + keys.size > 450) throw new Error('Los datos cambiaron y la operación excede el límite atómico. Reintenta con un grupo más pequeño.');
        const remainingSlotSnapshots = await Promise.all([...keys].filter(key=>!incomingKeys.has(key)).map(key=>tx.get(doc(db,'schedule_slots',key))));
        const slotSnapshots = [...incomingSlotSnapshots,...remainingSlotSnapshots];
        const slots = new Map<string,ScheduleSlot>();
        const affected = new Set(chunk);
        slotSnapshots.forEach(s=> {
          const data = s.data();
          slots.set(s.id,{ fecha: data?.fecha || s.id.slice(0,10), espacio: data?.espacio || decodeURIComponent(s.id.slice(11)),
            bookings: (data?.bookings || []).filter((b: SlotBooking)=>!affected.has(b.id) && isReservationActiveForAvailability(b as any,new Set())) });
        });
        const saved: Reservation[] = [];
        for (const id of chunk) {
          const next = byId.get(id); const existing = current.get(id);
          if (!next) {
            const expected = previous.get(id);
            if (existing && (existing.version||0)!==(expected?.version||0)) throw new ReservationVersionError(existing);
            continue;
          }
          // The operation marker makes retry safe even if acknowledgement was lost.
          if ((existing as any)?.lastOperationId === operationId) { saved.push(existing!); continue; }
          if(options.intent==='create' && existing) throw new ReservationVersionError(existing);
          if(options.intent==='update' && !existing) throw new Error('La reserva fue eliminada por otro usuario. No se volverá a crear.');
          if (!existing && (next.version || 0) > 0) throw new Error('La reserva fue eliminada por otro usuario. No se volverá a crear.');
          if ((existing?.version || 0) !== (next.version || 0)) throw new ReservationVersionError(existing!);
          const confirmed = { ...next, version: (existing?.version||0)+1,
            createdAt: existing?.createdAt || next.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
          for (const [key, candidate] of reservationSlots(confirmed)) {
            const slot = slots.get(key)!;
            for (const booking of candidate.bookings) {
              if (!options.allowConflictOverride && !booking.exempt && slot.bookings.some(b=> !b.exempt && isTimeOverlapping(booking.startMin,booking.endMin,b.startMin,b.endMin))) {
                throw new Error(`Conflicto de disponibilidad en ${candidate.espacio}, ${candidate.fecha}. Otro usuario ya reservó este horario.`);
              }
              slot.bookings.push(booking);
            }
          }
          saved.push(confirmed);
        }
        // Retry of a committed chunk must not remove its already confirmed slots.
        for (const r of saved) if ((r as any).lastOperationId === operationId) {
          for (const [key, candidate] of reservationSlots(r)) slots.get(key)!.bookings.push(...candidate.bookings);
        }
        for (const [key,slot] of slots) {
          if(new TextEncoder().encode(JSON.stringify(slot)).byteLength>900_000) throw new Error(`El índice de ${slot.espacio} en ${slot.fecha} excede el tamaño seguro. Reduce las reservas simultáneas.`);
          tx.set(doc(db,'schedule_slots',key),{ ...slot, updatedAt: new Date().toISOString() });
        }
        for (const id of chunk) {
          const r = saved.find(r=>r.id===id);
          if (r && (r as any).lastOperationId !== operationId) tx.set(doc(db,'reservas',id), { ...clean(r), lastOperationId: operationId });
          else if (!r) tx.delete(doc(db,'reservas',id));
        }
        return saved;
      });
      result.reservations.push(...committed);
      result.confirmedIds.push(...chunk);
      result.deletedIds.push(...chunk.filter(id=>!byId.has(id)));
      result.pendingIds = ids.filter(id=>!result.confirmedIds.includes(id));
      operation.confirmedIds = [...new Set([...operation.confirmedIds,...result.confirmedIds])];
      try { updateJournal(operation, result.pendingIds.length===0); }
      catch (error) { console.warn('No se pudo actualizar el registro de recuperación; el reintento sigue siendo idempotente.', error); }
      try { options.onProgress?.({ ...result }); }
      catch(error) {
        if(result.pendingIds.length) throw error;
        console.warn('Guardado completamente confirmado; actualización local pendiente:',error);
      }
    }
    return result;
  } catch (cause: any) {
    if (cause instanceof ReplacementValidationError && !result.confirmedIds.length) updateJournal(operation, true);
    if (!options.operationId && !pending && !result.confirmedIds.length && (cause instanceof ReservationVersionError || /conflicto|límite/i.test(cause?.message || ''))) updateJournal(operation, true);
    throw new ReservationWriteError(`${cause?.message || 'Error de conexión'}. Confirmadas: ${result.confirmedIds.length}; pendientes: ${result.pendingIds.length}. Puedes reanudar sin duplicar reservas.`, result, cause);
  }
}
