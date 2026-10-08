import { Reservation } from '../types';

export type ReservationVisualKey =
  | 'municipal'
  | 'ccd'
  | 'jjv'
  | 'prestamo'
  | 'ensayo'
  | 'other';

export interface ReservationTypeVisual {
  key: ReservationVisualKey;
  label: string;
  accent: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  softTextClass: string;
}

export const RESERVATION_TYPE_VISUALS: Record<ReservationVisualKey, ReservationTypeVisual> = {
  municipal: {
    key: 'municipal',
    label: 'Taller municipal',
    accent: '#b96516',
    bgClass: 'bg-orange-50',
    borderClass: 'border-orange-200',
    textClass: 'text-orange-950',
    softTextClass: 'text-orange-700'
  },
  ccd: {
    key: 'ccd',
    label: 'Taller CCD / Deporte',
    accent: '#3169e8',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-200',
    textClass: 'text-blue-950',
    softTextClass: 'text-blue-700'
  },
  jjv: {
    key: 'jjv',
    label: 'Taller JJV',
    accent: '#7950b7',
    bgClass: 'bg-violet-50',
    borderClass: 'border-violet-200',
    textClass: 'text-violet-950',
    softTextClass: 'text-violet-700'
  },
  prestamo: {
    key: 'prestamo',
    label: 'Préstamo / CAM',
    accent: '#168064',
    bgClass: 'bg-emerald-50',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-950',
    softTextClass: 'text-emerald-700'
  },
  ensayo: {
    key: 'ensayo',
    label: 'Ensayo / Danza',
    accent: '#b64669',
    bgClass: 'bg-rose-50',
    borderClass: 'border-rose-200',
    textClass: 'text-rose-950',
    softTextClass: 'text-rose-700'
  },
  other: {
    key: 'other',
    label: 'Otras actividades',
    accent: '#64748b',
    bgClass: 'bg-slate-50',
    borderClass: 'border-slate-200',
    textClass: 'text-slate-950',
    softTextClass: 'text-slate-600'
  }
};

export const RESERVATION_TYPE_LEGEND: ReservationTypeVisual[] = [
  RESERVATION_TYPE_VISUALS.municipal,
  RESERVATION_TYPE_VISUALS.ccd,
  RESERVATION_TYPE_VISUALS.jjv,
  RESERVATION_TYPE_VISUALS.prestamo,
  RESERVATION_TYPE_VISUALS.ensayo,
  RESERVATION_TYPE_VISUALS.other
];

const normalize = (value?: string): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

export function getReservationTypeVisual(
  reservation: Pick<Reservation, 'tipoActividad' | 'descripcion'>
): ReservationTypeVisual {
  const type = normalize(reservation.tipoActividad);
  const description = normalize(reservation.descripcion);

  if (type.includes('MUNICIPAL')) return RESERVATION_TYPE_VISUALS.municipal;
  if (type.includes('JJV') || type.includes('VECINAL')) return RESERVATION_TYPE_VISUALS.jjv;
  if (
    type.includes('CCD') ||
    type.includes('DEPORTE') ||
    description.includes('YOGA') ||
    description.includes('PILATES') ||
    description.includes('ZUMBA')
  ) {
    return RESERVATION_TYPE_VISUALS.ccd;
  }
  if (type.includes('PRESTAMO') || type.includes('CAM') || description.includes('CAM ')) {
    return RESERVATION_TYPE_VISUALS.prestamo;
  }
  if (
    type.includes('ENSAYO') ||
    type.includes('DANZA') ||
    type.includes('CUMPLEANOS') ||
    description.includes('ENSAYO') ||
    description.includes('DANZA')
  ) {
    return RESERVATION_TYPE_VISUALS.ensayo;
  }

  return RESERVATION_TYPE_VISUALS.other;
}

/** Formats visible reservation text without changing stored or editable values. */
export function formatDisplayTitle(raw?: string): string {
  return (raw || '').trim().normalize('NFC').toLocaleLowerCase('es-CL')
    .replace(/(^|[^\p{L}\p{M}])(\p{L})/gu, (_match, separator: string, letter: string) => separator + letter.toLocaleUpperCase('es-CL'));
}
