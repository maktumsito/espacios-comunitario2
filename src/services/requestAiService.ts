import { getAuthSessionToken } from './authService';
import { ACTIVITY_TYPES } from '../data/spacesData';
import { DEFAULT_LOAN_TYPES } from './adminConfigService';
import { requestAiSchema } from '../utils/requestAiSchema';
import { redactRequestPersonalData } from '../utils/requestAiPrivacy';
import type { ParsedRequestOptions, ParsedReservationRequest } from '../utils/requestTextParser';

export async function analyzeReservationRequest(text: string, parsed: ParsedReservationRequest,
  options: ParsedRequestOptions, signal: AbortSignal) {
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
      body: JSON.stringify({
        text: redactRequestPersonalData(text, parsed),
        defaultDate: options.defaultDate || undefined,
        spaces: (options.availableSpaces || []).map(item => item.name),
        activityTypes: options.availableActivityTypes?.length ? options.availableActivityTypes.map(item => item.name) : [...ACTIVITY_TYPES],
        loanTypes: (options.availableLoanTypes?.length ? options.availableLoanTypes : DEFAULT_LOAN_TYPES).map(item => item.name),
        equipment: (options.availableEquipment || []).map(({ id, name }) => ({ id, name })),
      }),
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
