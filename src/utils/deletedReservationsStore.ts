const inMemoryDeletedSet = new Set<string>();

const isBrowser = (): boolean => typeof window !== 'undefined' && typeof localStorage !== 'undefined';
export const DELETED_IDS_KEY = 'reservas_comunitarias_deleted_v1';

/**
 * Retrieves the Set of reservation IDs marked as deleted or soft-deleted.
 * Works both in browser (with localStorage backing) and in-memory fallback.
 */
export function getDeletedIds(): Set<string> {
  const set = new Set<string>(inMemoryDeletedSet);
  if (isBrowser()) {
    try {
      const raw = localStorage.getItem(DELETED_IDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => id && set.add(id));
        }
      }
    } catch (e) {
      console.warn('Error reading deleted IDs cache', e);
    }
  }
  return set;
}

/**
 * Records a reservation ID in the local storage deleted tracker to prevent ghost resurrection.
 */
export function recordDeletedId(id: string): void {
  if (!id) return;
  inMemoryDeletedSet.add(id);
  if (isBrowser()) {
    try {
      const set = getDeletedIds();
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {
      console.warn('Error saving deleted ID', e);
    }
  }
}

/**
 * Records multiple reservation IDs in the local storage deleted tracker.
 */
export function recordDeletedIds(ids: string[]): void {
  if (!ids || !ids.length) return;
  ids.forEach((id) => id && inMemoryDeletedSet.add(id));
  if (isBrowser()) {
    try {
      const set = getDeletedIds();
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {
      console.warn('Error saving deleted IDs', e);
    }
  }
}

/**
 * Removes a reservation ID from the deleted tracker (e.g. on restoration or resurrection).
 */
export function unrecordDeletedId(id: string): void {
  if (!id) return;
  inMemoryDeletedSet.delete(id);
  if (isBrowser()) {
    try {
      const set = getDeletedIds();
      set.delete(id);
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {
      console.warn('Error removing deleted ID', e);
    }
  }
}

/**
 * Removes multiple reservation IDs from the deleted tracker.
 */
export function unrecordDeletedIds(ids: string[]): void {
  if (!ids || !ids.length) return;
  ids.forEach((id) => id && inMemoryDeletedSet.delete(id));
  if (isBrowser()) {
    try {
      const set = getDeletedIds();
      ids.forEach((id) => id && set.delete(id));
      localStorage.setItem(DELETED_IDS_KEY, JSON.stringify(Array.from(set)));
    } catch (e) {
      console.warn('Error removing deleted IDs batch', e);
    }
  }
}
