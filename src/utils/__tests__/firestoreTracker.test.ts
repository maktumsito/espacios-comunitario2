// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { recordFirestoreRead, getTotalFirestoreReads, resetFirestoreReadTracker } from '../firestoreTracker';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-06T06:59:00Z'));
  sessionStorage.clear(); resetFirestoreReadTracker();
});
afterEach(() => vi.useRealTimers());

it('resets estimates at midnight Pacific rather than midnight Santiago', () => {
  recordFirestoreRead('reservas', 100);
  expect(getTotalFirestoreReads()).toBe(100);
  vi.setSystemTime(new Date('2026-10-06T07:01:00Z'));
  expect(getTotalFirestoreReads()).toBe(0);
  recordFirestoreRead('reservas', 1);
  expect(getTotalFirestoreReads()).toBe(1);
});

it('rejects nonfinite counts and tolerates invalid session storage', () => {
  recordFirestoreRead('reservas', NaN);
  recordFirestoreRead('reservas', Infinity);
  sessionStorage.setItem('dev_firestore_reads_tracker_v2', '{invalid');
  recordFirestoreRead('reservas', 5);
  expect(getTotalFirestoreReads()).toBe(5);
});
