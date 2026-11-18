import type { Express } from 'express';
import { z } from 'zod';
import type { AppSessions } from './appSession';
import { reservationPermission } from '../src/utils/userPermissions';
import { requestAiScheduleSchema } from '../src/utils/requestAiSchema';

// Keep the decoding grammar small; full bounds and date/time validation remain in Zod.
// Large bounded arrays and nullable anyOf branches can exceed Gemini's grammar limits.
export function requestAiGenerationSchema(): Record<string, unknown> {
  const simplify = (schema: any): any => {
    if (schema.anyOf?.length === 2 && schema.anyOf.some((part: any) => part.type === 'null')) {
      const value = simplify(schema.anyOf.find((part: any) => part.type !== 'null'));
      return { ...value, type: [value.type, 'null'], ...(value.enum ? { enum: [...value.enum, null] } : {}) };
    }
    const result: Record<string, unknown> = {};
    for (const key of ['type', 'required', 'additionalProperties', 'enum']) {
      if (schema[key] !== undefined) result[key] = schema[key];
    }
    if (schema.properties) result.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, value]) => [key, simplify(value)]));
    if (schema.items) result.items = simplify(schema.items);
    return result;
  };
  return simplify(z.toJSONSchema(requestAiScheduleSchema, { unrepresentable: 'any' }));
}

export function registerRequestAiApi(app: Express, sessions: AppSessions, options: {
  apiKey?: () => string | undefined;
  fetch?: typeof fetch;
  timeoutMs?: number;
} = {}) {
  app.post('/api/reservations/analyze-request', sessions.requireAuth, async (req, res) => {
    if (!reservationPermission((req as any).user, 'canCreateReservations')) {
      res.status(403).json({ error: 'Esta cuenta no puede crear reservas.' });
      return;
    }
    const input = requestAiScheduleSchema.safeParse(req.body);
    if (!input.success) {
      res.status(400).json({ error: 'Los datos de agenda no son válidos.' });
      return;
    }
    const key = (options.apiKey ? options.apiKey() : process.env.GEMINI_API_KEY)?.trim();
    if (!key) {
      res.status(503).json({ error: 'La IA no está configurada. Puedes continuar con el detector local.' });
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
    const abort = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', abort);
    try {
      const referenceDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Santiago' }).format(new Date());
      const response = await (options.fetch ?? fetch)(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: 'Revisa la estructura de una agenda en Chile. Conserva los datos confirmados y deja en null los datos ausentes. Domingo=0. No inventes fechas, horarios ni cantidades.' }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify({ referenceDate, ...input.data }) }] }],
            generationConfig: {
              temperature: 0,
              maxOutputTokens: 2048,
              responseMimeType: 'application/json',
              responseJsonSchema: requestAiGenerationSchema(),
            },
          }),
        });
      if (!response.ok) {
        res.status(response.status === 429 ? 429 : 503).json({ error: response.status === 429
          ? 'Se alcanzó la cuota gratuita de Gemini. Puedes continuar con el detector local.'
          : 'Gemini no está disponible. Puedes continuar con el detector local.' });
        return;
      }
      const payload = await response.json();
      const candidate = payload.candidates?.[0];
      if (candidate?.finishReason !== 'STOP') throw new Error('Invalid response');
      const extraction = requestAiScheduleSchema.parse(JSON.parse(candidate.content.parts.map((p: any) => p.text || '').join('')));
      res.json({ extraction: { ...extraction, descripcion: null, tipoActividad: null, tipoPrestamo: null,
        espacio: null, equipamientoSolicitado: null, montaje: null } });
    } catch {
      if (!res.destroyed) res.status(503).json({ error: controller.signal.aborted
        ? 'El análisis superó el tiempo de espera. Puedes continuar con el detector local.'
        : 'No se pudo interpretar la respuesta de Gemini. Puedes continuar con el detector local.' });
    } finally {
      clearTimeout(timeout);
      res.off('close', abort);
    }
  });
}
