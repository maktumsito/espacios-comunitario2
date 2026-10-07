// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ write: vi.fn(), fetch: vi.fn() }));
vi.mock('firebase/firestore', async original => ({ ...await original<any>(), setDoc: mocks.write }));
import { getLocalRatingsCache, saveSpaceRating } from '../ratingService';
import { findAuthorizedGoogleAccount } from '../authService';
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.stubGlobal('fetch', mocks.fetch); });

it('keeps the confirmed server rating without issuing a second Firestore write', async () => {
  const rating = { id: 'c1', reservationId: 'r1', limpieza: 2, createdAt: '2026-10-07T00:00:00Z' } as any;
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ success: true, rating })));
  await saveSpaceRating(rating);
  expect(mocks.fetch).toHaveBeenCalledOnce();
  expect(mocks.write).not.toHaveBeenCalled();
  expect(getLocalRatingsCache()).toEqual([rating]);
});

it('does not confirm or write a rejected or unavailable authoritative validation', async () => {
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Future event' }), { status: 400 }));
  await expect(saveSpaceRating({ id: 'c1', reservationId: 'r1' } as any)).rejects.toThrow('Future event');
  mocks.fetch.mockRejectedValueOnce(new TypeError('offline'));
  await expect(saveSpaceRating({ id: 'c1', reservationId: 'r1' } as any)).rejects.toThrow('offline');
  expect(mocks.write).not.toHaveBeenCalled();
  expect(getLocalRatingsCache()).toEqual([]);
});

it('Google login preserves assigned reader permissions and rejects substring/unknown emails', () => {
  const reader = { username: 'lector', email: 'lector@example.com', role: 'Auxiliar', name: 'Lector',
    passwordHash: 'secret', canCreateReservations: false, canEditReservations: false, canDeleteReservations: false } as any;
  expect(findAuthorizedGoogleAccount('LECTOR@example.com', [reader])).toMatchObject({
    canCreateReservations: false, canEditReservations: false, canDeleteReservations: false,
  });
  expect(findAuthorizedGoogleAccount('LECTOR@example.com', [reader])).not.toHaveProperty('passwordHash');
  expect(findAuthorizedGoogleAccount('lector@example.com.evil', [reader])).toBeNull();
  expect(findAuthorizedGoogleAccount('unknown@example.com', [reader])).toBeNull();
});
