function integerSetting(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}

const env = (import.meta as any).env ?? {};

export const firestoreReadPolicy = Object.freeze({
  activeWindowDays: integerSetting(env.VITE_FIRESTORE_ACTIVE_WINDOW_DAYS, 30, 1, 365),
  historicalCacheMs: integerSetting(env.VITE_FIRESTORE_HISTORY_CACHE_MINUTES, 60, 1, 1440) * 60_000,
  persistentCache: env.VITE_FIRESTORE_PERSISTENT_CACHE !== 'false',
  cacheSizeBytes: 40 * 1024 * 1024,
});
