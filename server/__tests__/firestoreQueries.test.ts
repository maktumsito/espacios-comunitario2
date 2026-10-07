import { beforeEach, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, path: string) => path,
  documentId: () => '__name__',
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string) => ({ order: field }), limit: (count: number) => ({ limit: count }),
  startAfter: (cursor: unknown) => ({ cursor }),
  query: (path: string, ...constraints: unknown[]) => ({ path, constraints }),
  getDocsFromServer: sdk.read,
}));
import { fetchDispatchReservations, fetchOldSlotPage } from '../firestoreQueries';
beforeEach(() => vi.clearAllMocks());

it('downloads only the selected dates even when history has thousands of reservations', async () => {
  const history = Array.from({ length: 5000 }, (_, index) => ({ id: `old-${index}`, fecha: '2020-01-01' }));
  const selected = Array.from({ length: 10 }, (_, index) => ({ id: `new-${index}`, fecha: '2026-10-10' }));
  let observedDocuments = 0;
  sdk.read.mockImplementation(async ({ path, constraints }) => {
    expect(path).toBe('reservas');
    const dates = constraints.find((constraint: any) => constraint.field === 'fecha' && constraint.op === 'in')?.value;
    expect(dates).toEqual(['2026-10-10', '2026-10-11']);
    const rows = [...history, ...selected].filter(row => dates.includes(row.fecha));
    observedDocuments += rows.length;
    return { forEach: (next: any) => rows.forEach(row => next({ id: row.id, data: () => ({ ...row, id: 'untrusted-data-id' }) })) };
  });
  const rows = await fetchDispatchReservations({} as any, ['2026-10-10', '2026-10-11', '2026-10-10']);
  expect(rows.map(row => row.id)).toEqual(selected.map(row => row.id));
  expect(observedDocuments).toBe(10);
  expect(sdk.read).toHaveBeenCalledOnce();
});

it('does not query empty/invalid dates and supports more than one IN query', async () => {
  expect(await fetchDispatchReservations({} as any, [])).toEqual([]);
  await expect(fetchDispatchReservations({} as any, ['invalid'])).rejects.toThrow('fechas');
  expect(sdk.read).not.toHaveBeenCalled();
  sdk.read.mockResolvedValue({ forEach: () => {} });
  const dates = Array.from({ length: 31 }, (_, index) => `2026-10-${String(index + 1).padStart(2, '0')}`);
  await fetchDispatchReservations({} as any, dates);
  expect(sdk.read).toHaveBeenCalledTimes(2);
});

it('bounds slot cleanup by cutoff and resumes with a cursor, never an offset', async () => {
  const cursor = { id: '2026-08-01_SALA%202' };
  sdk.read.mockResolvedValue({ docs: [], size: 0 });
  await fetchOldSlotPage({} as any, '2026-09-07', cursor as any);
  expect(sdk.read).toHaveBeenCalledWith({ path: 'schedule_slots', constraints: [
    { field: '__name__', op: '<', value: '2026-09-07_' }, { order: '__name__' }, { limit: 400 }, { cursor },
  ] });
});
