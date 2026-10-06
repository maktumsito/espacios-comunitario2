import { z } from 'zod';
import { validateRut, validateEmail, validatePhone, validateTimeRange } from '../utils/validationUtils';

/**
 * Zod schema for Chilean RUT validation (Módulo 11)
 */
export const RutSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine(
    (val) => {
      if (!val || val.trim() === '') return true;
      const res = validateRut(val, true);
      return res.isValid;
    },
    {
      message: 'R.U.T. inválido: no cumple con el algoritmo Módulo 11 chileno.'
    }
  );

/**
 * Zod schema for Email validation
 */
export const EmailSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine(
    (val) => {
      if (!val || val.trim() === '') return true;
      const res = validateEmail(val, true);
      return res.isValid;
    },
    {
      message: 'Correo electrónico con formato inválido (ej: nombre@dominio.cl).'
    }
  );

/**
 * Zod schema for Chilean Phone validation (+56 9 XXXX XXXX or similar)
 */
export const PhoneSchema = z
  .string()
  .optional()
  .or(z.literal(''))
  .refine(
    (val) => {
      if (!val || val.trim() === '') return true;
      const res = validatePhone(val, true);
      return res.isValid;
    },
    {
      message: 'Teléfono inválido: debe contener 8 o 9 dígitos numéricos chilenos.'
    }
  );

/**
 * Zod schema for single date format (YYYY-MM-DD)
 */
export const DateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Formato de fecha inválido (debe ser AAAA-MM-DD).' });

/**
 * Zod schema for time string (HH:mm)
 */
export const TimeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Formato de hora inválido (debe ser HH:mm).' });

/**
 * Full Reservation Schema with cross-field validations
 */
export const ReservationSchema = z
  .object({
    id: z.string().min(1, 'El ID de la reserva es obligatorio.'),
    fecha: DateStringSchema,
    horaInicio: TimeStringSchema,
    horaFin: TimeStringSchema,
    espacio: z.string().min(1, 'El espacio o sala es obligatorio.'),
    responsable: z.string().min(2, 'El nombre del solicitante o responsable debe tener al menos 2 caracteres.'),
    tipoActividad: z.string().min(1, 'El tipo de actividad es obligatorio.'),
    descripcion: z.string().min(1, 'La descripción o nombre de la actividad es obligatorio.'),
    actividadRecurrente: z.string().default('No'),
    rut: RutSchema,
    emailContacto: EmailSchema,
    telefonoContacto: PhoneSchema,
    cantidadParticipantes: z.number().nonnegative().optional(),
    realizada: z.string().optional(),
    terminaDiaSiguiente: z.boolean().optional(),
    estado: z.enum(['activa', 'cancelada', 'rechazada', 'eliminada']).or(z.string()).default('activa'),
    comentarios: z.string().optional(),
    serieRecurrente: z.string().optional(),
    recurrenteId: z.string().optional(),
    tipoPrestamo: z.string().optional(),
    domicilio: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional()
  })
  .passthrough()
  .refine(
    (data) => {
      const timeRes = validateTimeRange(data.horaInicio, data.horaFin, Boolean(data.terminaDiaSiguiente));
      return timeRes.isValid;
    },
    {
      message: 'El rango horario no es válido: la hora de término debe ser posterior a la hora de inicio.',
      path: ['horaFin']
    }
  );

export type ValidatedReservation = z.infer<typeof ReservationSchema>;

/**
 * Helper to validate an individual reservation and return user-friendly errors
 */
export function validateReservationWithZod(data: unknown): {
  success: boolean;
  data?: ValidatedReservation;
  errors?: Record<string, string>;
  firstError?: string;
} {
  const result = ReservationSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = issue.path.join('.') || 'general';
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }

  const firstError = result.error.issues[0]?.message || 'Datos de reserva no válidos.';
  return { success: false, errors, firstError };
}
