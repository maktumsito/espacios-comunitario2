import { collection, doc, getDocs, writeBatch, type Firestore } from '../../firebase/gateway';
import type { Reservation } from '../../types';
import { reservationSlots, type ScheduleSlot } from '../reservationWriter';

export function buildCanonicalScheduleSlots(reservations: Reservation[]): Map<string, ScheduleSlot> {
  const expected = new Map<string, ScheduleSlot>();
  for (const r of reservations) for (const [key, slot] of reservationSlots(r)) {
    const existing = expected.get(key);
    if (existing) existing.bookings.push(...slot.bookings); else expected.set(key,slot);
  }
  expected.forEach(s=>s.bookings.sort((a,b)=>a.id.localeCompare(b.id)||a.startMin-b.startMin));
  return expected;
}
function comparable(slot: ScheduleSlot | undefined): string {
  if (!slot) return '';
  return JSON.stringify({ fecha: slot.fecha, espacio: slot.espacio, bookings: [...slot.bookings].sort((a,b)=>a.id.localeCompare(b.id)||a.startMin-b.startMin) });
}
/** Run while reservation writers are stopped. Re-running only writes mismatches. */
export async function rebuildScheduleSlots(db: Firestore, apply = false) {
  const reservations = await getDocs(collection(db,'reservas'));
  const slots = await getDocs(collection(db,'schedule_slots'));
  const expected = buildCanonicalScheduleSlots(reservations.docs.map(d=>({ ...d.data(), id: d.id } as Reservation)));
  const current = new Map(slots.docs.map(d=>[d.id,d.data() as ScheduleSlot]));
  const changed = [...expected].filter(([key,s])=>comparable(current.get(key))!==comparable(s));
  const obsolete = [...current.keys()].filter(key=>!expected.has(key));
  if (apply) {
    const operations = [...changed.map(([key,slot])=>({key,slot})), ...obsolete.map(key=>({key,slot: undefined}))];
    for (let i=0;i<operations.length;i+=400) {
      const batch = writeBatch(db);
      operations.slice(i,i+400).forEach(({key,slot})=> { const ref=doc(db,'schedule_slots',key); if(slot) batch.set(ref,slot); else batch.delete(ref); });
      await batch.commit();
    }
  }
  return { reservations: reservations.size, expectedSlots: expected.size, changed: changed.length, obsolete: obsolete.length, applied: apply };
}
