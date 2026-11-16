import express from 'express';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { registerRequestAiApi, requestAiGenerationSchema } from '../requestAiApi';
import type { AppSessions } from '../appSession';
import { requestAiSchema } from '../../src/utils/requestAiSchema';

const extraction = {
  descripcion: 'Yoga', tipoActividad: 'TALLER', tipoPrestamo: null, espacio: 'AUDITORIO',
  fecha: '2026-11-20', horaInicio: '18:00', horaFin: '20:00', cantidadParticipantes: 30,
  bookingMode: 'single', selectedDays: null, recurrenceStartDate: null, recurrenceEndDate: null,
  equipamientoSolicitado: null, montaje: null,
};
const body = { text: 'Solicitante: María Soto, correo maria@example.com, RUT 12.345.678-5, tel +56912345678, yoga mañana',
  defaultDate: '2026-11-20', spaces: ['AUDITORIO'], activityTypes: ['TALLER'], loanTypes: [], equipment: [] };
const success = (value: unknown = extraction) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));

async function scenario(run: (post: (body?: unknown, auth?: string) => Promise<Response>, gemini: ReturnType<typeof vi.fn>) => Promise<void>,
  options: { key?: string; writer?: boolean; reply?: () => Promise<Response>; timeoutMs?: number } = {}) {
  const app = express(); app.use(express.json());
  const gemini = vi.fn(options.reply || (async () => success()));
  const sessions = { requireAuth(req: any, res: any, next: any) {
    if (req.headers.authorization !== 'Bearer session') return res.sendStatus(401);
    req.user = { role: 'Auxiliar', canCreateReservations: options.writer !== false };
    next();
  } } as unknown as AppSessions;
  registerRequestAiApi(app, sessions, { apiKey: () => options.key ?? 'test-server-key', fetch: gemini as typeof fetch, timeoutMs: options.timeoutMs });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reservations/analyze-request`;
  try {
    await run((value = body, auth = 'Bearer session') => fetch(url, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(value) }), gemini);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}

it('requires a verified session and create permission before contacting Gemini', async () => {
  await scenario(async (post, gemini) => {
    expect((await post(body, '')).status).toBe(401);
    expect((await post()).status).toBe(403);
    expect(gemini).not.toHaveBeenCalled();
  }, { writer: false });
});

it('extracts structured data with Santiago context and redacts identifiers without exposing the key', async () => {
  await scenario(async (post, gemini) => {
    const response = await post();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.extraction).toEqual(extraction);
    expect(JSON.stringify(result)).not.toContain('test-server-key');
    const [url, config] = gemini.mock.calls[0] as any;
    expect(url).toContain('gemini-3.5-flash-lite:generateContent');
    expect(config.headers['x-goog-api-key']).toBe('test-server-key');
    for (const personal of ['María Soto', 'maria@example.com', '12.345.678-5', '912345678']) expect(config.body).not.toContain(personal);
    const prompt = JSON.parse(JSON.parse(config.body).contents[0].parts[0].text);
    expect(prompt.referenceDate).toBe(new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date()));
    expect(prompt.text).toContain('yoga mañana');
  });
});

it('rejects invalid and oversized requests before contacting the provider', async () => {
  await scenario(async (post, gemini) => {
    expect((await post({ ...body, text: 'x'.repeat(12001) })).status).toBe(400);
    expect((await post({ ...body, allReservations: [] })).status).toBe(400);
    expect(gemini).not.toHaveBeenCalled();
  });
});

it('falls back without a key', async () => {
  await scenario(async (post, gemini) => {
    expect((await post()).status).toBe(503);
    expect(gemini).not.toHaveBeenCalled();
  }, { key: '' });
});

it('reports exhausted free quota without retrying or changing models', async () => {
  await scenario(async (post, gemini) => {
    const response = await post();
    expect(response.status).toBe(429);
    expect((await response.json()).error).toContain('cuota gratuita');
    expect(gemini).toHaveBeenCalledOnce();
  }, { reply: async () => new Response('provider details never forwarded', { status: 429 }) });
});

it.each([
  { ...extraction, fecha: '2026-11-31' },
  { ...extraction, espacio: 'SALA INVENTADA' },
  { ...extraction, horaInicio: '25:00' },
  { ...extraction, hasConflict: false },
  { ...extraction, equipamientoSolicitado: [{ equipmentId: 'unknown', quantity: 1 }] },
])('rejects invalid JSON fields or catalog entries: %j', async value => {
  await scenario(async post => expect((await post()).status).toBe(503), { reply: async () => success(value) });
});

it('aborts a stalled provider request at its deadline', async () => {
  const app = express(); app.use(express.json());
  const gemini = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  registerRequestAiApi(app, { requireAuth(req: any, _res: any, next: any) { req.user = { canCreateReservations: true }; next(); } } as any,
    { apiKey: () => 'key', fetch: gemini as typeof fetch, timeoutMs: 20 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/reservations/analyze-request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain('tiempo de espera');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

it('supports a schema with explicit nulls for missing information', () => {
  expect(requestAiSchema.safeParse(Object.fromEntries(Object.keys(extraction).map(key => [key, null]))).success).toBe(true);
});

it('keeps the provider grammar small while retaining strict validation locally', () => {
  const schema = requestAiGenerationSchema() as any;
  expect(schema.properties.fecha.type).toEqual(['string', 'null']);
  expect(schema.properties.equipamientoSolicitado.type).toEqual(['array', 'null']);
  expect(schema.properties.equipamientoSolicitado.maxItems).toBeUndefined();
  expect(schema.properties.bookingMode.enum).toEqual(['single', 'pattern', null]);
  expect(requestAiSchema.safeParse({ ...extraction, cantidadParticipantes: -1 }).success).toBe(false);
});
