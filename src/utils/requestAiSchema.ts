import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const label = z.string().trim().min(1).max(300);

// Only extraction fields: the model cannot supply identity, availability or write options.
export const requestAiSchema = z.strictObject({
  descripcion: label.nullable(),
  tipoActividad: label.nullable(),
  tipoPrestamo: label.nullable(),
  espacio: label.nullable(),
  fecha: date.nullable(),
  horaInicio: time.nullable(),
  horaFin: time.nullable(),
  cantidadParticipantes: z.number().int().min(1).max(100000).nullable(),
  bookingMode: z.enum(['single', 'pattern']).nullable(),
  selectedDays: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  recurrenceStartDate: date.nullable(),
  recurrenceEndDate: date.nullable(),
  equipamientoSolicitado: z.array(z.strictObject({
    equipmentId: label,
    quantity: z.number().int().min(1).max(100000),
  })).max(100).nullable(),
  montaje: z.strictObject({
    tipo: z.enum(['auditorio', 'aula', 'u', 'circulo', 'mesas', 'despejado']),
    instrucciones: z.string().max(1000),
  }).nullable(),
});

export type RequestAiExtraction = z.infer<typeof requestAiSchema>;
