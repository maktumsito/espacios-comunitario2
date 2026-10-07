import {
  collection, documentId, getDocsFromServer, limit, orderBy, query, startAfter, where,
  type Firestore, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { Reservation } from '../src/types';

/** Date selection happens before downloading documents, including preview totals. */
export async function fetchDispatchReservations(db: Firestore, dates: readonly string[]): Promise<Reservation[]> {
  const uniqueDates = [...new Set(dates)];
  if (uniqueDates.some(date => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error('Las fechas del despacho no son válidas.');
  }
  const rows = new Map<string, Reservation>();
  for (let index = 0; index < uniqueDates.length; index += 30) {
    const snapshot = await getDocsFromServer(query(collection(db, 'reservas'),
      where('fecha', 'in', uniqueDates.slice(index, index + 30))));
    snapshot.forEach(document => rows.set(document.id, { ...document.data(), id: document.id } as Reservation));
  }
  return [...rows.values()];
}

/** ID date prefixes are canonical; occupied old slots still require a transaction recheck. */
export async function fetchOldSlotPage(db: Firestore, cutoff: string, cursor?: QueryDocumentSnapshot) {
  return getDocsFromServer(query(collection(db, 'schedule_slots'),
    where(documentId(), '<', `${cutoff}_`), orderBy(documentId()), limit(400),
    ...(cursor ? [startAfter(cursor)] : [])));
}
