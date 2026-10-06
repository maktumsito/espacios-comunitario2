import { describe, expect, it } from 'vitest';
import { buildReplacementBatch, canReplaceOccurrence, preserveReplacementExceptions } from '../reservationReplacement';
import type { Reservation } from '../../types';
import { cleanReservationForFirestore, normalizeReservationFromFirestore } from '../../services/reservationService';
import { isDispatchableReservation } from '../activityDispatchSelection';
import { findReservationConflicts } from '../conflictDetector';
const original: Reservation = { id: 'source', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', descripcion: 'Taller', tipoActividad: 'Taller', actividadRecurrente: 'Sí', serieRecurrente: 'series', estado: 'activa' };
describe('replacement domain rules', () => {
  it('requires an active recurring occurrence, a reason and the exact original slot', () => {
    expect(canReplaceOccurrence({ ...original, serieRecurrente: undefined })).toBe(false);
    expect(canReplaceOccurrence({ ...original, estado: 'cancelada' })).toBe(false);
    expect(canReplaceOccurrence({ ...original, actividadRecurrente: 'No', tipoRecurrencia: 'doble_espacio' })).toBe(false);
    expect(() => buildReplacementBatch(original, original, 'new', '  ')).toThrow(/motivo/);
    expect(() => buildReplacementBatch(original, { ...original, fecha: '2026-10-07' }, 'new', 'Motivo')).toThrow(/conservar/);
    expect(() => buildReplacementBatch(original, { ...original, horaFin: '12:00' }, 'new', 'Motivo')).toThrow(/conservar/);
    expect(() => buildReplacementBatch(original, { ...original, terminaDiaSiguiente: true }, 'new', 'Motivo')).toThrow(/conservar/);
  });
  it('preserves the series exception while permitting updates on other dates', () => {
    const [exception, replacement] = buildReplacementBatch(original, original, 'new', 'Motivo').updatedReservations;
    const future = { ...original, id: 'future', fecha: '2026-10-13' };
    expect(preserveReplacementExceptions([original, { ...original, id: 'regenerated' }, future], [exception, { ...replacement, estado: 'cancelada' }])).toEqual([future]);
  });
  it('preserves links and reason across Firestore normalization and excludes the original from dispatch and conflicts', () => {
    const [exception, replacement] = buildReplacementBatch(original, original, 'new', 'Motivo').updatedReservations;
    const restoredOriginal = normalizeReservationFromFirestore(exception.id, cleanReservationForFirestore(exception));
    const restoredReplacement = normalizeReservationFromFirestore(replacement.id, cleanReservationForFirestore(replacement));
    expect(restoredOriginal).toMatchObject({ estado: 'cancelada', motivoReemplazo: 'Motivo', reemplazadaPorReservaId: 'new', serieRecurrente: 'series' });
    expect(restoredReplacement).toMatchObject({ estado: 'activa', motivoReemplazo: 'Motivo', reemplazaReservaId: 'source' });
    expect(isDispatchableReservation(restoredOriginal)).toBe(false);
    expect(isDispatchableReservation(restoredReplacement)).toBe(true);
    expect(findReservationConflicts([restoredOriginal, restoredReplacement], [])).toEqual([]);
  });
});
