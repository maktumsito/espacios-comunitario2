import { expect, it } from 'vitest';
import { resolveReservationAttachment } from '../reservationWriter';
import type { Reservation } from '../../types';
const full = { name: 'carta.pdf', type: 'application/pdf', size: 100, uploadedAt: '2026-11-01', dataUrl: 'data:application/pdf;base64,YWJj' };
const existing = { id: 'one', version: 3, cartaCompromisoAdjunta: full } as Reservation;
const next = { ...existing, cartaCompromisoAdjunta: { ...full, dataUrl: '' } };
it('preserves the signed document byte for byte when editing metadata from cache', () => {
  expect(resolveReservationAttachment(next, existing)).toEqual(full);
  expect(next.cartaCompromisoAdjunta.dataUrl).toBe('');
});
it('rejects stale metadata and new reservations without an actual file', () => {
  expect(() => resolveReservationAttachment(next)).toThrow('carta');
  expect(() => resolveReservationAttachment({ ...next, version: 2 }, existing)).toThrow('carta');
  expect(() => resolveReservationAttachment(next, { ...existing, cartaCompromisoAdjunta: { ...full, uploadedAt: '2026-11-02' } })).toThrow('carta');
});
it('accepts explicit removal and a replacement file', () => {
  expect(resolveReservationAttachment({ ...existing, cartaCompromisoAdjunta: undefined }, existing)).toBeUndefined();
  const replacement = { ...full, dataUrl: 'data:application/pdf;base64,ZGVm' };
  expect(resolveReservationAttachment({ ...existing, cartaCompromisoAdjunta: replacement }, existing)).toEqual(replacement);
});
