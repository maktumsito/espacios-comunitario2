// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Reservation } from '../../types';
import { useReplacementReminders } from '../useReplacementReminders';
import { getDueReplacementReminders } from '../../utils/replacementReminders';

const replacement: Reservation = { id: 'new', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', descripcion: 'Reunión excepcional', tipoActividad: 'Reunión', actividadRecurrente: 'No', estado: 'activa', reemplazaReservaId: 'original', motivoReemplazo: 'Reunión de vecinos' };
const original: Reservation = { ...replacement, id: 'original', descripcion: 'Taller semanal', actividadRecurrente: 'Sí', estado: 'cancelada', reemplazaReservaId: undefined, reemplazadaPorReservaId: 'new' };
const rows = [original, replacement];
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T15:00:00Z')); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('starts three calendar days before, includes today and excludes past dates', () => {
  expect(getDueReplacementReminders(rows, '2026-10-02')).toEqual([]);
  expect(getDueReplacementReminders(rows, '2026-10-03')).toEqual([replacement]);
  expect(getDueReplacementReminders(rows, '2026-10-06')).toEqual([replacement]);
  expect(getDueReplacementReminders(rows, '2026-10-07')).toEqual([]);
});
it('does not remind for a cancelled replacement, unrelated reservation or reactivated original', () => {
  expect(getDueReplacementReminders([original, { ...replacement, estado: 'cancelada' }], '2026-10-03')).toEqual([]);
  expect(getDueReplacementReminders([{ ...replacement, reemplazaReservaId: undefined }], '2026-10-03')).toEqual([]);
  expect(getDueReplacementReminders([{ ...original, estado: 'activa' }, replacement], '2026-10-03')).toEqual([]);
});
it('remembers acknowledgment after reload, independently for each user', () => {
  const first = renderHook(() => useReplacementReminders(rows, 'usuario-a'));
  expect(first.result.current.reminder).toEqual(replacement);
  act(() => first.result.current.acknowledge(replacement));
  expect(first.result.current.reminder).toBeNull(); first.unmount();
  const reopened = renderHook(({ user }) => useReplacementReminders(rows, user), { initialProps: { user: 'usuario-a' } });
  expect(reopened.result.current.reminder).toBeNull();
  reopened.rerender({ user: 'usuario-b' }); expect(reopened.result.current.reminder).toEqual(replacement);
});
it('queues multiple replacements by date and advances after acknowledgment', () => {
  const second = { ...replacement, id: 'second', reemplazaReservaId: 'other-original', fecha: '2026-10-04' };
  const { result } = renderHook(() => useReplacementReminders([...rows, second], 'user'));
  expect(result.current.reminder?.id).toBe('second'); expect(result.current.pendingCount).toBe(2);
  act(() => result.current.acknowledge(second));
  expect(result.current.reminder?.id).toBe('new'); expect(result.current.pendingCount).toBe(1);
});
it('uses the Santiago calendar day and refreshes when the app returns to focus', () => {
  vi.setSystemTime(new Date('2026-10-03T02:30:00Z')); // Still October 2 in Santiago.
  const { result } = renderHook(() => useReplacementReminders(rows, 'user'));
  expect(result.current.reminder).toBeNull();
  act(() => { vi.setSystemTime(new Date('2026-10-03T03:30:00Z')); window.dispatchEvent(new Event('focus')); });
  expect(result.current.reminder).toEqual(replacement);
});
it('defers the popup while another modal is open and suppresses it without a session', () => {
  const { result, rerender } = renderHook(({ enabled, user }) => useReplacementReminders(rows, user, enabled), { initialProps: { enabled: false, user: 'user' as string | undefined } });
  expect(result.current.reminder).toBeNull();
  rerender({ enabled: true, user: 'user' }); expect(result.current.reminder).toEqual(replacement);
  rerender({ enabled: true, user: undefined }); expect(result.current.reminder).toBeNull();
});
it('reissues the reminder if the scheduled change is edited after acknowledgment', () => {
  const { result, rerender } = renderHook(({ reservations }) => useReplacementReminders(reservations, 'user'), { initialProps: { reservations: rows } });
  act(() => result.current.acknowledge(replacement)); expect(result.current.reminder).toBeNull();
  const edited = { ...replacement, descripcion: 'Reunión modificada' };
  rerender({ reservations: [original, edited] }); expect(result.current.reminder).toEqual(edited);
});
it('survives malformed or unavailable browser storage without repeating acknowledged popups in this session', () => {
  localStorage.setItem('cc_replacement_reminders_v1:user', '{bad');
  const { result } = renderHook(() => useReplacementReminders(rows, 'user'));
  expect(result.current.reminder).toEqual(replacement);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage disabled'); });
  act(() => result.current.acknowledge(replacement));
  act(() => window.dispatchEvent(new Event('focus')));
  expect(result.current.reminder).toBeNull();
});
