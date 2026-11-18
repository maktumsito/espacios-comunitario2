import { afterEach, expect, it, vi } from 'vitest';
import { analyzeReservationRequest } from '../requestAiService';
import { parseReservationRequestText } from '../../utils/requestTextParser';
import { SPACES_LIST } from '../../data/spacesData';

vi.mock('../authService', () => ({ getAuthSessionToken: () => 'session-token' }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('filters personal data before the HTTP call and never sends the directory or reservations', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'cuota gratuita agotada' }), { status: 429 }));
  vi.stubGlobal('fetch', fetcher);
  const text = 'Solicitante: María Soto, RUT 12.345.678-5, tel +56912345678, maria@example.com, domicilio: Av. Uno 22, yoga el 20/11/2026 de 18 a 20';
  const parsed = parseReservationRequestText(text);
  await expect(analyzeReservationRequest(text, parsed, { availableSpaces: SPACES_LIST,
    allReservations: [{ responsable: 'Other secret applicant' } as any] }, new AbortController().signal)).rejects.toThrow('cuota gratuita');
  const request = fetcher.mock.calls[0][1];
  expect(request.headers.Authorization).toBe('Bearer session-token');
  for (const value of ['María Soto', '12.345.678-5', '912345678', 'maria@example.com', 'Av. Uno 22', 'Other secret applicant', 'allReservations']) expect(request.body).not.toContain(value);
  expect(fetcher).toHaveBeenCalledOnce();
});

it('times out after 20 seconds and aborts the request without retries', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  vi.stubGlobal('fetch', fetcher);
  const promise = analyzeReservationRequest('yoga', parseReservationRequestText('yoga'), {}, new AbortController().signal);
  const assertion = expect(promise).rejects.toThrow('20 segundos');
  await vi.advanceTimersByTimeAsync(20000);
  await assertion;
  expect(fetcher).toHaveBeenCalledOnce();
});
