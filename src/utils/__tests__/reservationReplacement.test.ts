import { describe, expect, it } from 'vitest';
import { buildReplacementBatch, canReplaceOccurrence, preserveReplacementExceptions } from '../reservationReplacement';
import type { Reservation } from '../../types';
import { cleanReservationForFirestore, normalizeReservationFromFirestore } from '../../services/reservationService';
import { isDispatchableReservation } from '../activityDispatchSelection';
import { findReservationConflicts } from '../conflictDetector';

const original: Reservation = { id: 'source', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', descripcion: 'Taller', tipoActividad: 'Taller', actividadRecurrente: 'Sí', serieRecurrente: 'series', estado: 'activa' };

describe('replacement domain rules', () => {
  it('allows replacing any active single-space activity (recurring or single-day) on the same date and space, with optional schedule adjustment', () => {
    expect(canReplaceOccurrence({ ...original, serieRecurrente: undefined, actividadRecurrente: 'No' })).toBe(true);
    expect(canReplaceOccurrence({ ...original, estado: 'cancelada' })).toBe(false);
    expect(canReplaceOccurrence({ ...original, reemplazadaPorReservaId: 'other' })).toBe(false);
    expect(canReplaceOccurrence({ ...original, reemplazaReservaId: 'other' })).toBe(false);
    expect(canReplaceOccurrence({ ...original, actividadRecurrente: 'No', tipoRecurrencia: 'doble_espacio' })).toBe(false);
    expect(() => buildReplacementBatch(original, original, 'new', '  ')).toThrow(/motivo/);
    expect(() => buildReplacementBatch(original, { ...original, fecha: '2026-10-07' }, 'new', 'Motivo')).toThrow(/conservar/);
    expect(() => buildReplacementBatch(original, { ...original, espacio: 'SALA 3' }, 'new', 'Motivo')).toThrow(/conservar/);
    expect(() => buildReplacementBatch(original, { ...original, horaInicio: '12:00', horaFin: '11:00' }, 'new', 'Motivo')).toThrow(/conservar/);

    const adjusted = buildReplacementBatch(original, { ...original, horaInicio: '10:30', horaFin: '12:00' }, 'new', 'Ajuste por el día', 5);
    expect(adjusted.updatedReservations[1]).toMatchObject({ horaInicio: '10:30', horaFin: '12:00', diasAvisoReemplazo: 5 });
    expect(adjusted.updatedReservations[0]).toMatchObject({ horaInicio: '10:00', horaFin: '11:00', diasAvisoReemplazo: 5 });
  });
  it('preserves the series exception while permitting updates on other dates', () => {
    const [exception, replacement] = buildReplacementBatch(original, original, 'new', 'Motivo').updatedReservations;
    const future = { ...original, id: 'future', fecha: '2026-10-13' };
    expect(preserveReplacementExceptions([original, { ...original, id: 'regenerated' }, future], [exception, { ...replacement, estado: 'cancelada' }])).toEqual([future]);
  });
  it('preserves links and reason across Firestore normalization and excludes the original from dispatch and conflicts', () => {
    const [exception, replacement] = buildReplacementBatch(original, original, 'new', 'Motivo', 4).updatedReservations;
    const restoredOriginal = normalizeReservationFromFirestore(exception.id, cleanReservationForFirestore(exception));
    const restoredReplacement = normalizeReservationFromFirestore(replacement.id, cleanReservationForFirestore(replacement));
    expect(restoredOriginal).toMatchObject({ estado: 'cancelada', motivoReemplazo: 'Motivo', reemplazadaPorReservaId: 'new', serieRecurrente: 'series', diasAvisoReemplazo: 4 });
    expect(restoredReplacement).toMatchObject({ estado: 'activa', motivoReemplazo: 'Motivo', reemplazaReservaId: 'source', diasAvisoReemplazo: 4 });
    expect(isDispatchableReservation(restoredOriginal)).toBe(false);
    expect(isDispatchableReservation(restoredReplacement)).toBe(true);
    expect(findReservationConflicts([restoredOriginal, restoredReplacement], [])).toEqual([]);
  });
});
