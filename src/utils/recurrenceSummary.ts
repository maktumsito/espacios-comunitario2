import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { WEEKDAYS } from './dateUtils';
import { formatDisplayTitle } from './reservationVisuals';
import type { ScheduleSlot } from './recurringSchedule';

const PLURAL_WEEKDAYS: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábados',
  0: 'domingos',
};

function joinSpanishList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function formatNaturalSpanishDate(dateStr?: string, includeYear = true): string {
  if (!dateStr) return 'por definir';
  try {
    const parsed = parseISO(dateStr.split('T')[0]);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    return format(parsed, includeYear ? "d 'de' MMMM 'de' yyyy" : "d 'de' MMMM", { locale: es });
  } catch {
    return dateStr;
  }
}

export function formatNaturalDateRange(startDate?: string, endDate?: string): string {
  if (!startDate && !endDate) return 'en el período seleccionado';
  if (startDate && !endDate) return `desde el ${formatNaturalSpanishDate(startDate, true)}`;
  if (!startDate && endDate) return `hasta el ${formatNaturalSpanishDate(endDate, true)}`;
  if (startDate === endDate) return `el ${formatNaturalSpanishDate(startDate, true)}`;
  const startYear = startDate!.slice(0, 4);
  const endYear = endDate!.slice(0, 4);
  const sameYear = startYear === endYear;
  return `entre el ${formatNaturalSpanishDate(startDate, !sameYear)} y el ${formatNaturalSpanishDate(endDate, true)}`;
}

export interface RecurrenceHumanSummaryInput {
  bookingMode: 'single' | 'specific' | 'pattern';
  espacio?: string;
  fecha?: string;
  horaInicio?: string;
  horaFin?: string;
  selectedDays?: readonly number[];
  recurrenceStartDate?: string;
  recurrenceEndDate?: string;
  generatedDates?: readonly string[];
  specificDates?: readonly string[];
  reviewSlots?: readonly ScheduleSlot[];
  omittedHolidaysCount?: number;
  useCustomSchedulesPerDay?: boolean;
  useCustomSchedulesPerDate?: boolean;
  hasMultipleSpaces?: boolean;
}

export function buildRecurrenceHumanSummary({
  bookingMode,
  espacio,
  fecha,
  horaInicio,
  horaFin,
  selectedDays = [],
  recurrenceStartDate,
  recurrenceEndDate,
  generatedDates = [],
  specificDates = [],
  reviewSlots,
  omittedHolidaysCount = 0,
  useCustomSchedulesPerDay = false,
  useCustomSchedulesPerDate = false,
  hasMultipleSpaces = false,
}: RecurrenceHumanSummaryInput): string {
  const spaceLabel = espacio ? formatDisplayTitle(espacio) : 'el espacio seleccionado';
  const start = horaInicio || '08:30';
  const end = horaFin || '09:30';

  if (bookingMode === 'single') {
    const slotCount = reviewSlots?.length || 1;
    const datePart = fecha ? formatNaturalSpanishDate(fecha, true) : 'la fecha indicada';
    if (hasMultipleSpaces || slotCount > 1) {
      return `Se reservarán ${slotCount} espacios el ${datePart} (incluye ${spaceLabel} de ${start} a ${end}).`;
    }
    return `Se reservará ${spaceLabel} el ${datePart}, de ${start} a ${end}.`;
  }

  const orderedDays = [...selectedDays]
    .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
    .map((dayNum) => PLURAL_WEEKDAYS[dayNum] || WEEKDAYS.find((w) => w.dayNum === dayNum)?.full.toLowerCase() || '')
    .filter(Boolean);
  const daysPhrase = orderedDays.length > 0 ? `todos los ${joinSpanishList(orderedDays)}` : 'en los días seleccionados';

  const holidaysSuffix =
    omittedHolidaysCount > 0
      ? `, omitiendo ${omittedHolidaysCount} ${omittedHolidaysCount === 1 ? 'feriado' : 'feriados'}`
      : '';

  if (bookingMode === 'pattern') {
    const startBound = recurrenceStartDate || generatedDates[0];
    const endBound = recurrenceEndDate || generatedDates[generatedDates.length - 1];
    const rangePhrase = formatNaturalDateRange(startBound, endBound);
    const totalReservations = reviewSlots ? reviewSlots.length : generatedDates.length;
    const countLabel = `${totalReservations} ${totalReservations === 1 ? 'reserva' : 'reservas'}`;

    if (useCustomSchedulesPerDay || hasMultipleSpaces) {
      return `Se reservarán ${countLabel} (${daysPhrase}), ${rangePhrase}, con horarios o espacios diferenciados${holidaysSuffix}.`;
    }

    return `Se reservará ${spaceLabel} ${daysPhrase}, de ${start} a ${end}, ${rangePhrase} (${countLabel}${holidaysSuffix}).`;
  }

  // Specific dates mode
  const sortedDates = [...specificDates].sort();
  const totalReservations = reviewSlots ? reviewSlots.length : sortedDates.length;
  const countLabel = `${totalReservations} ${totalReservations === 1 ? 'reserva' : 'reservas'}`;
  const datesCountLabel = `${sortedDates.length} ${sortedDates.length === 1 ? 'fecha específica' : 'fechas específicas'}`;
  const rangePhrase =
    sortedDates.length > 1
      ? `, ${formatNaturalDateRange(sortedDates[0], sortedDates[sortedDates.length - 1])}`
      : sortedDates.length === 1
      ? ` (${formatNaturalSpanishDate(sortedDates[0], true)})`
      : '';

  if (useCustomSchedulesPerDate || hasMultipleSpaces) {
    return `Se reservarán ${countLabel} en ${datesCountLabel}${rangePhrase}, con horarios o espacios diferenciados${holidaysSuffix}.`;
  }

  return `Se reservará ${spaceLabel} en ${datesCountLabel}, de ${start} a ${end}${rangePhrase} (${countLabel}${holidaysSuffix}).`;
}
