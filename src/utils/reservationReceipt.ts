import type { Reservation } from '../types';
import { formatDateDDMMYYYY } from './dateUtils';
import { formatDisplayTitle } from './reservationVisuals';

const VENUE_NAME = 'Centro Comunitario Diaguitas';
const TIMEZONE = 'America/Santiago';

function toIcsDateTime(isoDate: string, timeHHmm: string, addOneDay = false): string {
  const [y, m, d] = (isoDate || '').split('-').map(Number);
  const [hh = 0, mm = 0] = (timeHHmm || '00:00').split(':').map(Number);
  const dt = new Date(Date.UTC(y || 2026, (m || 1) - 1, (d || 1) + (addOneDay ? 1 : 0), hh, mm, 0));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function getTitle(reservation: Reservation): string {
  return formatDisplayTitle((reservation.descripcion || '').trim() || reservation.tipoActividad || 'Reserva de Espacio');
}

/**
 * Generates an RFC 5545 .ics calendar invite for a community space reservation,
 * including a 24-hour reminder alarm.
 */
export function buildReservationIcs(reservation: Reservation): string {
  const title = getTitle(reservation);
  const startStr = toIcsDateTime(reservation.fecha, reservation.horaInicio);
  const endAddDay = Boolean(
    reservation.terminaDiaSiguiente ||
    (reservation.horaFin && reservation.horaInicio && reservation.horaFin <= reservation.horaInicio)
  );
  const endStr = toIcsDateTime(reservation.fecha, reservation.horaFin, endAddDay);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const location = `${VENUE_NAME} — ${reservation.espacio}`;
  const descriptionLines = [
    `Actividad: ${title}`,
    `Tipo: ${reservation.tipoActividad}`,
    `Espacio: ${reservation.espacio}`,
    `Responsable: ${reservation.responsable || 'No especificado'}`,
    reservation.cantidadParticipantes ? `Aforo estimado: ${reservation.cantidadParticipantes} personas` : '',
    reservation.comentarios ? `Observaciones: ${reservation.comentarios}` : '',
    'Recuerda llegar puntual y dejar el espacio en buenas condiciones.'
  ].filter(Boolean);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Centro Comunitario Diaguitas//Agenda CCD//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${reservation.id}@espacios-diaguitas.lascondes.cl`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${TIMEZONE}:${startStr}`,
    `DTEND;TZID=${TIMEZONE}:${endStr}`,
    `SUMMARY:${escapeIcsText(title)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(descriptionLines.join('\n'))}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Recordatorio: ${title} en ${reservation.espacio}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    ''
  ].join('\r\n');
}

export function downloadReservationIcs(reservation: Reservation): void {
  const ics = buildReservationIcs(reservation);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeSpace = (reservation.espacio || 'espacio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const a = document.createElement('a');
  a.href = url;
  a.download = `reserva-${safeSpace}-${reservation.fecha}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Builds a Google Calendar deep-link pre-populated with reservation details in America/Santiago timezone.
 */
export function buildGoogleCalendarUrl(reservation: Reservation): string {
  const title = getTitle(reservation);
  const startStr = toIcsDateTime(reservation.fecha, reservation.horaInicio);
  const endAddDay = Boolean(
    reservation.terminaDiaSiguiente ||
    (reservation.horaFin && reservation.horaInicio && reservation.horaFin <= reservation.horaInicio)
  );
  const endStr = toIcsDateTime(reservation.fecha, reservation.horaFin, endAddDay);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${title} (${reservation.espacio})`,
    dates: `${startStr}/${endStr}`,
    ctz: TIMEZONE,
    location: `${VENUE_NAME} — ${reservation.espacio}`,
    details: buildReservationReceiptText(reservation),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Builds a clean, neighbor-friendly text receipt suitable for WhatsApp or email sharing.
 */
export function buildReservationReceiptText(reservation: Reservation): string {
  const title = getTitle(reservation);
  const formattedDate = formatDateDDMMYYYY(reservation.fecha);
  const lines = [
    `*Comprobante de Reserva — ${VENUE_NAME}*`,
    `• Actividad: ${title}`,
    `• Tipo: ${reservation.tipoActividad}`,
    `• Espacio: ${reservation.espacio}`,
    `• Fecha: ${formattedDate}`,
    `• Horario: ${reservation.horaInicio} a ${reservation.horaFin} hrs${reservation.terminaDiaSiguiente ? ' (día siguiente)' : ''}`,
    `• Responsable: ${reservation.responsable || 'No especificado'}`,
    reservation.cantidadParticipantes ? `• Aforo estimado: ${reservation.cantidadParticipantes} personas` : '',
    '',
    'Por favor, recuerda respetar el horario asignado y avisar con anticipación si necesitas cancelar o reprogramar.'
  ].filter((line) => line !== '');
  return lines.join('\n');
}

export function buildWhatsAppReceiptUrl(reservation: Reservation): string {
  const digits = (reservation.telefonoContacto || '').replace(/\D/g, '');
  const phone = digits.length === 9 && digits.startsWith('9')
    ? `56${digits}`
    : digits.length === 8
    ? `569${digits}`
    : digits.length >= 11
    ? digits
    : '';
  const text = encodeURIComponent(buildReservationReceiptText(reservation));
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
