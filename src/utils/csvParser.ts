import { Reservation } from '../types';
import { normalizeSpaceName } from '../data/spacesData';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

const DEFAULT_START_HOUR = '09:00';
const DEFAULT_END_HOUR = '10:00';
const DEFAULT_PARTICIPANTS_COUNT = 15;
const DEFAULT_FALLBACK_SPACE = 'TATAMI';
const DEFAULT_FALLBACK_ACTIVITY = 'OTROS';
const DEFAULT_FALLBACK_DATE = '2026-08-26';
const RECURRING_YES = 'Sí';
const RECURRING_NO = 'No';

const DAY_OF_WEEK_ALIAS_MAP: Readonly<Record<string, number>> = Object.freeze({
  domingo: 0,
  dom: 0,
  lunes: 1,
  lun: 1,
  l: 1,
  martes: 2,
  mar: 2,
  m: 2,
  miercoles: 3,
  miércoles: 3,
  mie: 3,
  mié: 3,
  jueves: 4,
  jue: 4,
  j: 4,
  viernes: 5,
  vie: 5,
  v: 5,
  sabado: 6,
  sábado: 6,
  sab: 6,
  sáb: 6,
  s: 6
});

// ==========================================
// DATE & FORMAT HELPERS
// ==========================================

/**
 * Flexible date parser supporting DD/MM/YYYY, D/M/YYYY or YYYY-MM-DD strings.
 */
function parseFlexibleDate(dateInput?: string): Date | null {
  if (!dateInput || !dateInput.trim()) {
    return null;
  }

  const cleanString = dateInput.trim();

  // Handle Slash format (DD/MM/YYYY or D/M/YYYY)
  if (cleanString.includes('/')) {
    const segments = cleanString.split('/');
    if (segments.length === 3) {
      const day = parseInt(segments[0], 10);
      const monthIndex = parseInt(segments[1], 10) - 1;
      const year = parseInt(segments[2], 10);

      if (!isNaN(day) && !isNaN(monthIndex) && !isNaN(year)) {
        return new Date(year, monthIndex, day, 12, 0, 0);
      }
    }
  }

  // Handle Dash format (YYYY-MM-DD or DD-MM-YYYY)
  if (cleanString.includes('-')) {
    const segments = cleanString.split('-');
    if (segments.length === 3) {
      if (segments[0].length === 4) {
        // YYYY-MM-DD
        const year = parseInt(segments[0], 10);
        const monthIndex = parseInt(segments[1], 10) - 1;
        const day = parseInt(segments[2], 10);

        if (!isNaN(year) && !isNaN(monthIndex) && !isNaN(day)) {
          return new Date(year, monthIndex, day, 12, 0, 0);
        }
      } else if (segments[2].length === 4) {
        // DD-MM-YYYY
        const day = parseInt(segments[0], 10);
        const monthIndex = parseInt(segments[1], 10) - 1;
        const year = parseInt(segments[2], 10);

        if (!isNaN(year) && !isNaN(monthIndex) && !isNaN(day)) {
          return new Date(year, monthIndex, day, 12, 0, 0);
        }
      }
    }
  }

  return null;
}

/**
 * Serializes a Date object to standard ISO date "YYYY-MM-DD" format.
 */
function formatDateToIsoString(targetDate: Date): string {
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses days of the week string into target day numbers (0 for Sunday, 6 for Saturday).
 */
function parseTargetDays(daysOfWeekInput?: string, defaultDayNumber?: number): number[] {
  if (!daysOfWeekInput || !daysOfWeekInput.trim()) {
    return defaultDayNumber !== undefined ? [defaultDayNumber] : [1];
  }

  const targetDayIndices: number[] = [];
  const normalizedTokens = daysOfWeekInput.toLowerCase().split(/[,;/+&]+/);

  for (const token of normalizedTokens) {
    const cleanToken = token.trim();
    if (cleanToken in DAY_OF_WEEK_ALIAS_MAP) {
      const dayIndex = DAY_OF_WEEK_ALIAS_MAP[cleanToken];
      if (!targetDayIndices.includes(dayIndex)) {
        targetDayIndices.push(dayIndex);
      }
    }
  }

  if (targetDayIndices.length === 0 && defaultDayNumber !== undefined) {
    targetDayIndices.push(defaultDayNumber);
  }

  return targetDayIndices.length > 0 ? targetDayIndices : [1];
}

/**
 * Splits a single CSV row safely handling double-quoted cells containing commas.
 */
function splitCsvLine(csvLine: string): string[] {
  const fields: string[] = [];
  let isInsideQuotes = false;
  let currentToken = '';

  for (let i = 0; i < csvLine.length; i++) {
    const char = csvLine[i];
    if (char === '"') {
      isInsideQuotes = !isInsideQuotes;
    } else if (char === ',' && !isInsideQuotes) {
      fields.push(currentToken.trim());
      currentToken = '';
    } else {
      currentToken += char;
    }
  }
  fields.push(currentToken.trim());

  return fields;
}

/**
 * Unquotes and cleans a CSV field value.
 */
function sanitizeCsvValue(rawFieldValue: string = ''): string {
  let cleaned = rawFieldValue;
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.substring(1, cleaned.length - 1);
  }
  return cleaned.replace(/""/g, '"');
}

// ==========================================
// CSV PARSING & RECURRENCE EXPANSION
// ==========================================

/**
 * Validates and formats time strings (HH:MM).
 */
export function isValidTimeFormat(timeStr?: string): boolean {
  if (!timeStr || !/^\d{1,2}:\d{2}$/.test(timeStr.trim())) return false;
  const [h, m] = timeStr.trim().split(':').map(Number);
  return h >= 0 && h <= 24 && m >= 0 && m <= 59;
}

export function normalizeTimeFormat(timeStr: string | undefined, fallback: string): string {
  if (!timeStr) return fallback;
  const trimmed = timeStr.trim();
  if (isValidTimeFormat(trimmed)) {
    const [h, m] = trimmed.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return fallback;
}

export function normalizeDateFormat(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return DEFAULT_FALLBACK_DATE;
  const trimmed = dateStr.trim();
  const parsed = parseFlexibleDate(trimmed);
  if (!parsed || isNaN(parsed.getTime())) return DEFAULT_FALLBACK_DATE;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface CsvRowValidationError {
  rowNumber: number;
  field: string;
  error: string;
}

/**
 * Parses raw CSV lines into typed Reservation structures with strict field validation.
 */
export function parseRawCsvRows(csvContent: string): Reservation[] {
  const rawLines = csvContent.trim().split('\n');
  if (rawLines.length <= 1) {
    return [];
  }

  const headerKeys = rawLines[0].split(',').map((header) => header.trim());
  const parsedReservations: Reservation[] = [];

  for (let lineNumber = 1; lineNumber < rawLines.length; lineNumber++) {
    const line = rawLines[lineNumber].trim();
    if (!line) {
      continue;
    }

    const rowColumns = splitCsvLine(line);
    const rowRecord: Record<string, string> = {};

    headerKeys.forEach((headerKey, columnIndex) => {
      rowRecord[headerKey] = sanitizeCsvValue(rowColumns[columnIndex]);
    });

    if (!rowRecord.id && !rowRecord.fecha) {
      continue;
    }

    const cleanFecha = normalizeDateFormat(rowRecord.fecha);
    const cleanHoraInicio = normalizeTimeFormat(rowRecord.horaInicio, DEFAULT_START_HOUR);
    const cleanHoraFin = normalizeTimeFormat(rowRecord.horaFin, DEFAULT_END_HOUR);
    const cleanParticipants = Math.max(1, parseInt(rowRecord.cantidadParticipantes, 10) || DEFAULT_PARTICIPANTS_COUNT);

    const randomSuffix = Math.random().toString(36).substring(2, 10).toUpperCase();

    const reservation: Reservation = {
      id: rowRecord.id || `RSV_${randomSuffix}`,
      fecha: cleanFecha,
      horaInicio: cleanHoraInicio,
      horaFin: cleanHoraFin,
      espacio: normalizeSpaceName(rowRecord.espacio || DEFAULT_FALLBACK_SPACE),
      responsable: rowRecord.responsable?.trim() || 'No especificado',
      telefonoContacto: rowRecord.telefonoContacto?.trim() || '',
      emailContacto: rowRecord.emailContacto?.trim() || '',
      tipoActividad: rowRecord.tipoActividad?.trim() || DEFAULT_FALLBACK_ACTIVITY,
      tipoPrestamo: rowRecord.tipoPrestamo?.trim() || '',
      unidadMunicipal: rowRecord.unidadMunicipal?.trim() || undefined,
      descripcion: rowRecord.descripcion?.trim() || '',
      actividadRecurrente: (rowRecord.actividadRecurrente === RECURRING_YES ? RECURRING_YES : RECURRING_NO) as 'Sí' | 'No',
      comentarios: rowRecord.comentarios?.trim() || '',
      editadoPor: rowRecord.editadoPor?.trim() || '',
      fechaEdicion: rowRecord.fechaEdicion?.trim() || '',
      serieRecurrente: rowRecord.serieRecurrente?.trim() || '',
      recurrenteId: rowRecord.recurrenteId?.trim() || '',
      indiceEnSerie: parseInt(rowRecord.indiceEnSerie, 10) || 1,
      totalEnSerie: parseInt(rowRecord.totalEnSerie, 10) || 1,
      tipoRecurrencia: rowRecord.tipoRecurrencia?.trim() || '',
      diasSemana: rowRecord.diasSemana?.trim() || '',
      fechaInicioRecurrencia: rowRecord.fechaInicioRecurrencia?.trim()
        ? normalizeDateFormat(rowRecord.fechaInicioRecurrencia)
        : '',
      fechaFinRecurrencia: rowRecord.fechaFinRecurrencia?.trim()
        ? normalizeDateFormat(rowRecord.fechaFinRecurrencia)
        : '',
      cantidadParticipantes: cleanParticipants,
      realizada: (rowRecord.realizada === RECURRING_YES ? RECURRING_YES : RECURRING_NO) as 'Sí' | 'No',
      rut: rowRecord.rut?.trim() || '',
      domicilio: rowRecord.domicilio?.trim() || '',
      informeSemanal: rowRecord.informeSemanal?.trim() || '',
      googleEventId: rowRecord.googleEventId?.trim() || '',
      importante: (rowRecord.importante === RECURRING_YES ? RECURRING_YES : RECURRING_NO) as 'Sí' | 'No',
      estado: (rowRecord.estado?.trim() as any) || 'activa',
      terminaDiaSiguiente: rowRecord.terminaDiaSiguiente === 'true' || rowRecord.terminaDiaSiguiente === 'Sí'
    };

    parsedReservations.push(reservation);
  }

  return parsedReservations;
}

/**
 * Expands recurring series across date ranges into distinct concrete reservation entries.
 */
export function expandRecurringReservations(rawReservations: readonly Reservation[]): Reservation[] {
  const expandedReservations: Reservation[] = [];
  const processedSeriesIdentifiers = new Set<string>();
  const explicitReservationLookup = new Map<string, Reservation>();

  // Map explicitly configured individual items by Space + Date + StartTime
  for (const reservation of rawReservations) {
    const lookupKey = `${reservation.espacio}_${reservation.fecha}_${reservation.horaInicio}`;
    explicitReservationLookup.set(lookupKey, reservation);
  }

  for (const reservation of rawReservations) {
    if (reservation.actividadRecurrente !== RECURRING_YES) {
      expandedReservations.push(reservation);
      continue;
    }

    const seriesIdentifier =
      reservation.serieRecurrente ||
      reservation.recurrenteId ||
      `${reservation.espacio}_${reservation.responsable}_${reservation.descripcion}_${reservation.horaInicio}`;

    if (processedSeriesIdentifiers.has(seriesIdentifier)) {
      continue;
    }
    processedSeriesIdentifiers.add(seriesIdentifier);

    const startDate =
      parseFlexibleDate(reservation.fechaInicioRecurrencia) ||
      parseFlexibleDate(reservation.fecha) ||
      new Date(2026, 2, 16);

    const endDate = parseFlexibleDate(reservation.fechaFinRecurrencia) || new Date(2026, 11, 31);
    const targetDays = parseTargetDays(reservation.diasSemana, startDate.getDay());

    // Generate matched occurrences within interval
    const matchedIsoDates: string[] = [];
    const iteratorDate = new Date(startDate);

    while (iteratorDate <= endDate) {
      if (targetDays.includes(iteratorDate.getDay())) {
        matchedIsoDates.push(formatDateToIsoString(iteratorDate));
      }
      iteratorDate.setDate(iteratorDate.getDate() + 1);
    }

    const totalSeriesCount = matchedIsoDates.length || 1;
    const resolvedSeriesId =
      reservation.serieRecurrente ||
      reservation.recurrenteId ||
      `SER_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

    matchedIsoDates.forEach((isoDate, index) => {
      const explicitKey = `${reservation.espacio}_${isoDate}_${reservation.horaInicio}`;
      const explicitOccurrence = explicitReservationLookup.get(explicitKey);

      if (explicitOccurrence) {
        expandedReservations.push({
          ...explicitOccurrence,
          serieRecurrente: resolvedSeriesId,
          recurrenteId: resolvedSeriesId,
          indiceEnSerie: index + 1,
          totalEnSerie: totalSeriesCount
        });
      } else {
        const dateNumericSuffix = isoDate.replace(/-/g, '');
        const cleanBaseId = reservation.id.replace(/[^A-Z0-9]/gi, '').substring(0, 10);
        const generatedId = `RSV_${cleanBaseId}_${dateNumericSuffix}`;

        expandedReservations.push({
          ...reservation,
          id: generatedId,
          fecha: isoDate,
          serieRecurrente: resolvedSeriesId,
          recurrenteId: resolvedSeriesId,
          indiceEnSerie: index + 1,
          totalEnSerie: totalSeriesCount
        });
      }
    });
  }

  // Deduplicate and order chronologically
  const deduplicatedMap = new Map<string, Reservation>();
  for (const item of expandedReservations) {
    deduplicatedMap.set(item.id, item);
  }

  return Array.from(deduplicatedMap.values()).sort((a, b) => {
    if (a.fecha !== b.fecha) {
      return a.fecha.localeCompare(b.fecha);
    }
    return a.horaInicio.localeCompare(b.horaInicio);
  });
}

/**
 * Main parser entry point: parses raw CSV strings and expands recurring reservations.
 */
export function parseCsvRows(csvContent: string): Reservation[] {
  const rawRows = parseRawCsvRows(csvContent);
  // Native exports already contain concrete sessions, including exceptions and
  // moved dates. Expanding them again would invent sessions and discard variants.
  const headers = splitCsvLine(csvContent.trim().split(/\r?\n/, 1)[0]);
  if (['id', 'fecha', 'serieRecurrente', 'recurrenteId', 'indiceEnSerie', 'totalEnSerie', 'estado'].every(header => headers.includes(header))) {
    return rawRows;
  }
  return expandRecurringReservations(rawRows);
}
