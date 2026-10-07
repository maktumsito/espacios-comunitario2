/** Occupied slots remain necessary for editing historical reservations. */
export function isPurgeableScheduleSlot(id: string, data: { bookings?: unknown }, cutoff: string): boolean {
  const date = id.slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < cutoff && Array.isArray(data.bookings) && data.bookings.length === 0;
}

type CleanupResult = { purgedCount: number; message: string };
/** Startup, daily timer and editor devices share one successful check per Chilean day. */
export function guardedSlotCleanup(execute: (daysOld: number) => Promise<CleanupResult>) {
  const checks = new Map<string, { promise: Promise<CleanupResult>; complete: boolean }>();
  return (daysOld = 30): Promise<CleanupResult> => {
    if (!Number.isInteger(daysOld) || daysOld < 1 || daysOld > 365) {
      return Promise.reject(new Error('El plazo de limpieza debe estar entre 1 y 365 días.'));
    }
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    for (const key of checks.keys()) if (!key.startsWith(`${day}:`)) checks.delete(key);
    const key = `${day}:${daysOld}`;
    const current = checks.get(key);
    if (current) return current.complete
      ? Promise.resolve({ purgedCount: 0, message: 'Los índices ya se comprobaron hoy.' }) : current.promise;
    const entry = { complete: false, promise: Promise.resolve().then(() => execute(daysOld)).then(result => {
      entry.complete = true; return result;
    }, error => { checks.delete(key); throw error; }) };
    checks.set(key, entry);
    return entry.promise;
  };
}
