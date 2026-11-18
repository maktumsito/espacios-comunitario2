import { getAuthSessionToken } from './authService';
import { requestAiSchema, requestAiScheduleSchema } from '../utils/requestAiSchema';
import type { ParsedRequestOptions, ParsedReservationRequest } from '../utils/requestTextParser';

export async function analyzeReservationRequest(_text: string, parsed: ParsedReservationRequest,
  _options: ParsedRequestOptions, signal: AbortSignal) {
  const schedule = requestAiScheduleSchema.parse({
    fecha: parsed.fecha || null,
    horaInicio: parsed.horaInicio || null,
    horaFin: parsed.horaFin || null,
    cantidadParticipantes: parsed.cantidadParticipantes || null,
    bookingMode: parsed.bookingMode,
    selectedDays: parsed.selectedDays.length ? parsed.selectedDays : null,
    recurrenceStartDate: parsed.recurrenceStartDate || null,
    recurrenceEndDate: parsed.recurrenceEndDate || null,
  });
  if (![schedule.fecha, schedule.horaInicio, schedule.horaFin, schedule.recurrenceStartDate,
    schedule.recurrenceEndDate, schedule.selectedDays, schedule.cantidadParticipantes].some(Boolean)) {
    throw new Error('El detector local no encontró datos de agenda suficientes para el análisis asistido.');
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timeout = setTimeout(cancel, 20000);
  try {
    const response = await fetch('/api/reservations/analyze-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAuthSessionToken()}` },
      signal: controller.signal,
      body: JSON.stringify(schedule),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudo analizar la solicitud. Puedes continuar con el detector local.');
    const result = requestAiSchema.safeParse(payload.extraction);
    if (!result.success) throw new Error('La respuesta de IA no es válida. Puedes continuar con el detector local.');
    return result.data;
  } catch (error) {
    if (controller.signal.aborted && !signal.aborted) throw new Error('El análisis superó 20 segundos. Puedes continuar con el detector local.');
    if (error instanceof SyntaxError) throw new Error('La respuesta de IA no es válida. Puedes continuar con el detector local.');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', cancel);
  }
}
