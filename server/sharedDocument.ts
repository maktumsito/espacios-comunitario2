import { onSnapshot, type DocumentData, type DocumentReference, type Unsubscribe } from 'firebase/firestore';

/** One live configuration document replaces a server read on every timer tick. */
export class SharedServerDocument {
  private stop?: Unsubscribe;
  private value?: DocumentData;
  private confirmed = false;
  private failure?: Error;
  private retryAt = 0;
  private generation = 0;
  private waiters = new Set<{ resolve: (value: DocumentData | undefined) => void; reject: (error: Error) => void }>();

  constructor(private reference: DocumentReference, private timeoutMs = 5000) {}

  read(): Promise<DocumentData | undefined> {
    if (this.failure && Date.now() < this.retryAt) return Promise.reject(this.failure);
    if (!this.stop) {
      this.failure = undefined;
      this.confirmed = false;
      const generation = ++this.generation;
      const stop = onSnapshot(this.reference, { includeMetadataChanges: true }, snapshot => {
        if (generation !== this.generation) return;
        this.confirmed = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites;
        if (!this.confirmed) return;
        this.value = snapshot.exists() ? snapshot.data() : undefined;
        for (const waiter of [...this.waiters]) waiter.resolve(this.value);
      }, error => {
        if (generation !== this.generation) return;
        this.failure = error;
        this.confirmed = false;
        this.retryAt = Date.now() + 60_000;
        this.stop?.(); this.stop = undefined;
        for (const waiter of [...this.waiters]) waiter.reject(error);
      });
      if (this.failure) stop(); else this.stop = stop;
    }
    if (this.failure) return Promise.reject(this.failure);
    if (this.confirmed) return Promise.resolve(this.value);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => waiter.reject(new Error('La configuración no está confirmada por el servidor.')), this.timeoutMs);
      const waiter = {
        resolve: (value: DocumentData | undefined) => { clearTimeout(timer); this.waiters.delete(waiter); resolve(value); },
        reject: (error: Error) => { clearTimeout(timer); this.waiters.delete(waiter); reject(error); },
      };
      this.waiters.add(waiter);
    });
  }

  close() {
    this.generation++;
    this.stop?.(); this.stop = undefined; this.confirmed = false;
    for (const waiter of [...this.waiters]) waiter.reject(new Error('La suscripción de configuración se cerró.'));
  }
}
