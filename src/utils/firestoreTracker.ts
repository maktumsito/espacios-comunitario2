/**
 * Estimates observed server reads in this browser session, per Pacific quota day.
 * This is not the project-wide billing counter (rules, indexes and other clients are excluded).
 */

interface FirestoreReadStats {
  [module: string]: number;
}

const READS_STORAGE_KEY = 'dev_firestore_reads_tracker_v2';

let inMemoryReads: FirestoreReadStats = {};
let trackedDay = '';

function quotaDay(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function loadPersistedReads(): FirestoreReadStats {
  const today = quotaDay();
  if (trackedDay !== today) {
    trackedDay = today;
    inMemoryReads = {};
  }
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return inMemoryReads;
  }
  try {
    const raw = sessionStorage.getItem(READS_STORAGE_KEY);
    if (raw) {
      const persisted = JSON.parse(raw);
      if (persisted.day === today && persisted.reads && typeof persisted.reads === 'object') {
        inMemoryReads = Object.fromEntries(Object.entries(persisted.reads)
          .filter(([, count]) => typeof count === 'number' && Number.isFinite(count) && count >= 0)) as FirestoreReadStats;
      }
    }
  } catch {
    // ignore
  }
  return inMemoryReads;
}

function persistReads(): void {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(READS_STORAGE_KEY, JSON.stringify({ day: trackedDay, reads: inMemoryReads }));
  } catch {
    // ignore
  }
}

/**
 * Records a read batch for a given module/collection.
 * In development, prints an informational debug notice.
 */
export function recordFirestoreRead(module: string, count: number): void {
  if (!module || !Number.isFinite(count) || count <= 0) return;
  loadPersistedReads();

  inMemoryReads[module] = (inMemoryReads[module] || 0) + count;
  persistReads();

  if ((import.meta as any).env?.DEV) {
    const totalModule = inMemoryReads[module];
    const totalAll = getTotalFirestoreReads();
    console.debug(
      `📊 [Firestore Read Tracker] ${module}: +${count} lectura(s) | Módulo: ${totalModule} | Estimación diaria de esta sesión: ${totalAll}`
    );
  }
}

/**
 * Returns current read statistics broken down by module.
 */
export function getFirestoreReadStats(): FirestoreReadStats {
  return { ...loadPersistedReads() };
}

/**
 * Returns total cumulative reads across all tracked modules.
 */
export function getTotalFirestoreReads(): number {
  const stats = loadPersistedReads();
  return Object.values(stats).reduce((acc, val) => acc + val, 0);
}

/**
 * Resets the read tracker for the current session.
 */
export function resetFirestoreReadTracker(): void {
  inMemoryReads = {};
  if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(READS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}
