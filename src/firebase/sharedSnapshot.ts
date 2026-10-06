import {
  onSnapshot, queryEqual, refEqual,
  type Query, type DocumentReference, type DocumentData,
  type QuerySnapshot, type DocumentSnapshot, type FirestoreError, type Unsubscribe,
} from 'firebase/firestore';
import { recordFirestoreRead } from '../utils/firestoreTracker';

type Reference = Query<DocumentData> | DocumentReference<DocumentData>;
type Snapshot = QuerySnapshot<DocumentData> | DocumentSnapshot<DocumentData>;
interface Subscriber { next: (snapshot: any) => void; error?: (error: FirestoreError) => void }
interface Entry {
  ref: Reference;
  subscribers: Set<Subscriber>;
  unsubscribe: Unsubscribe;
  last?: Snapshot;
  failure?: FirestoreError;
  timer?: ReturnType<typeof setTimeout>;
  confirmed: boolean;
  documentFingerprint?: string;
}
const entries = new Set<Entry>();

function sameReference(left: Reference, right: Reference): boolean {
  if (left.type === 'document' && right.type === 'document') return refEqual(left, right);
  if (left.type !== 'document' && right.type !== 'document') return queryEqual(left, right);
  return false;
}

/** One SDK listener per reference, including brief React remounts. Cache events are not billed reads. */
export function sharedOnSnapshot<T extends DocumentData>(ref: Query<T>, next: (snapshot: QuerySnapshot<T>) => void, error?: (error: FirestoreError) => void): Unsubscribe;
export function sharedOnSnapshot<T extends DocumentData>(ref: DocumentReference<T>, next: (snapshot: DocumentSnapshot<T>) => void, error?: (error: FirestoreError) => void): Unsubscribe;
export function sharedOnSnapshot(ref: Reference, next: (snapshot: any) => void, error?: (error: FirestoreError) => void): Unsubscribe {
  let entry = [...entries].find(item => sameReference(item.ref, ref));
  const subscriber = { next, error };
  if (entry) {
    clearTimeout(entry.timer);
    entry.subscribers.add(subscriber);
    if (entry.failure) error?.(entry.failure);
    else if (entry.last) next(entry.last);
  } else {
    entry = { ref, subscribers: new Set([subscriber]), unsubscribe: () => {}, confirmed: false };
    entries.add(entry);
    const current = entry;
    try {
      // The SDK accepts both document references and queries through this overload at runtime.
      current.unsubscribe = onSnapshot(ref as Query<DocumentData>, { includeMetadataChanges: true }, (snapshot: Snapshot) => {
        if (!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites) {
          const first = !current.confirmed;
          const fingerprint = 'docs' in snapshot ? undefined : JSON.stringify(snapshot.data());
          const count = 'docs' in snapshot
            ? (first ? Math.max(1, snapshot.size) : snapshot.docChanges().length)
            : (first || fingerprint !== current.documentFingerprint ? 1 : 0);
          recordFirestoreRead(ref.type === 'document' ? ref.parent.path : 'consultas_en_vivo', count);
          current.documentFingerprint = fingerprint;
          current.confirmed = true;
        }
        current.last = snapshot;
        for (const listener of [...current.subscribers]) listener.next(snapshot);
      }, failure => {
        current.failure = failure;
        for (const listener of [...current.subscribers]) listener.error?.(failure);
      });
    } catch (failure) {
      entries.delete(current);
      throw failure;
    }
  }
  const current = entry;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    current.subscribers.delete(subscriber);
    if (!current.subscribers.size) {
      current.timer = setTimeout(() => {
        current.unsubscribe();
        entries.delete(current);
      }, 1000);
    }
  };
}
