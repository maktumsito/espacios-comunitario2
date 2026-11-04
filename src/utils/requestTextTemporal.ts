import { addDays, format, isValid, parseISO } from 'date-fns';

const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const pad = (n: number) => String(n).padStart(2, '0');
const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const monthNumber = (word: string) => word.startsWith('set') ? 9 : months.findIndex(m => m.startsWith(word)) + 1;

export interface RequestParsingWarning {
  field: 'fecha' | 'horario' | 'recurrencia' | 'espacio';
  message: string;
}

/** Preserve mention order, reject calendar rollovers, and never read a date inside a RUT. */
export function extractRequestDates(text: string, defaultDate: string, referenceDate: string) {
  let normalized = normalize(text);
  const base = parseISO(defaultDate);
  const year = isValid(base) ? base.getFullYear() : new Date().getFullYear();
  const dates: string[] = [];
  const warnings: RequestParsingWarning[] = [];
  const monthPattern = 'enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|setiembre|sep|sept|set|octubre|oct|noviembre|nov|diciembre|dic';
  // Share the month in "del 10 al 30 de noviembre" and "10, 17 y 24 de noviembre".
  normalized = normalized.replace(new RegExp(`\\b(\\d{1,2}(?:\\s*(?:,|y|al|a|hasta(?:\\s+el)?)\\s*\\d{1,2})+)\\s+(?:de\\s+)?(${monthPattern})(?:\\s+(?:(?:de|del)\\s+)?(20\\d{2}))?\\b`, 'g'),
    (_, days: string, month: string, explicitYear: string | undefined) => days.replace(/\d{1,2}/g, day => `${day} de ${month}${explicitYear ? ` de ${explicitYear}` : ''}`));
  // A single scan prevents ISO dates being parsed a second time as DD-MM-YY.
  const pattern = new RegExp(`(?<![\\w.\\d/-])(?:(20\\d{2})[-/](\\d{1,2})[-/](\\d{1,2})|(\\d{1,2})[-/](\\d{1,2})(?:[-/](20\\d{2}|\\d{2}))?|(\\d{1,2})\\s+(?:de\\s+)?(${monthPattern})\\.?(?:\\s+(?:(?:de|del)\\s+)?(20\\d{2}))?)(?![\\w.\\d/-])`, 'g');
  for (const match of normalized.matchAll(pattern)) {
    if (match[4] && !match[6] && match[0].includes('-')) {
      const before = normalized.slice(0, match.index).trimEnd();
      const after = normalized.slice(match.index! + match[0].length);
      if (/\b(?:de(?:sde)?(?:\s+las)?|horario\s*:?)$/.test(before) || /^\s*(?:hrs?|horas?|am|pm)\b/.test(after)) continue;
    }
    const day = Number(match[3] || match[4] || match[7]);
    const month = Number(match[2] || match[5] || monthNumber(match[8] || ''));
    const rawYear = match[1] || match[6] || match[9];
    const fullYear = rawYear ? Number(rawYear.length === 2 ? `20${rawYear}` : rawYear) : year;
    const iso = `${fullYear}-${pad(month)}-${pad(day)}`;
    const parsed = parseISO(iso);
    if (!isValid(parsed) || format(parsed, 'yyyy-MM-dd') !== iso) {
      warnings.push({ field: 'fecha', message: `La fecha «${match[0]}» no es válida. Corrígela antes de reservar.` });
    } else if (!dates.includes(iso)) {
      dates.push(iso);
    }
  }
  if (dates.length === 0 && warnings.length === 0) {
    const ref = parseISO(referenceDate);
    if (!isValid(ref)) return { dates, warnings };
    // Remove time-of-day phrases so "mañana por la mañana" still means tomorrow.
    const relativeText = normalized.replace(/\b(?:por|en|de)\s+la\s+manana\b/g, '');
    const relative = /\bpasado\s+manana\b/.test(relativeText) ? 2
      : /\bmanana\b/.test(relativeText) ? 1 : /\bhoy\b/.test(relativeText) ? 0 : undefined;
    if (relative !== undefined) dates.push(format(addDays(ref, relative), 'yyyy-MM-dd'));
    else {
      const weekdays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
      const weekday = /\b(?:(este|proximo)\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/.exec(normalized);
      const recurrent = /\b(?:cada|todos|todas|semanal|semanalmente)\b/.test(normalized);
      if (weekday && !recurrent) {
        let offset = (weekdays.indexOf(weekday[2]) - ref.getDay() + 7) % 7;
        if (offset === 0 && weekday[1] === 'proximo') offset = 7;
        dates.push(format(addDays(ref, offset), 'yyyy-MM-dd'));
      }
    }
  }
  return { dates, warnings };
}

/** Time grammar deliberately requires context for bare numbers (dates and quantities are not hours). */
export function extractRequestTime(text: string, defaultStart: string, defaultEnd: string) {
  let normalized = normalize(text)
    .replace(/\b([ap])\s*\.\s*m\s*\.?/g, '$1m')
    .replace(/\b(\d{1,2})\s+y\s+media\b/g, '$1:30')
    .replace(/\b(\d{1,2})\s+y\s+cuarto\b/g, '$1:15');
  const numberWords = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuna', 'veintidos', 'veintitres'];
  normalized = normalized.replace(new RegExp(`\\b(${numberWords.join('|')})\\b`, 'g'), word => String(numberWords.indexOf(word)))
    .replace(/\b(\d{1,2})\s+y\s+media\b/g, '$1:30')
    .replace(/\b(\d{1,2})\s+y\s+cuarto\b/g, '$1:15');
  // Dots as time separators only when followed by exactly two minute digits.
  normalized = normalized.replace(/\b(\d{1,2})\.(\d{2})(?!\d)/g, '$1:$2');
  normalized = normalized
    .replace(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2}[-/]\d{1,2}[-/](?:20\d{2}|\d{2})\b/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ');
  const hour = '(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?';
  const range = new RegExp(`\\b(?:de(?:sde)?(?:\\s+las)?\\s+|entre(?:\\s+las)?\\s+|horario\\s*[:=-]?\\s*)${hour}\\s*(?:h(?:rs?)?\\.?|horas?)?\\s*(?:a(?:\\s+las)?|hasta(?:\\s+las)?|y(?:\\s+las)?|[-–—])\\s*${hour}\\b`, 'i').exec(normalized)
    || new RegExp(`\\b${hour}\\s*(?:h(?:rs?)?\\.?|horas?)?\\s*(?:a(?:\\s+las)?|hasta(?:\\s+las)?|[-–—])\\s*${hour}\\s*(?:h(?:rs?)?\\.?|horas?)?\\b`, 'i').exec(normalized);
  const warnings: RequestParsingWarning[] = [];
  const fallback = { horaInicio: defaultStart, horaFin: defaultEnd, detected: false, warnings };
  const period = /\b(?:de|por|en)\s+la\s+(tarde|noche|manana)\b/.exec(normalized)?.[1];
  const toMinutes = (h: string, m: string | undefined, meridiem?: string) => {
    let hours = Number(h);
    const minutes = Number(m || 0);
    if (minutes > 59 || hours > 23 || (meridiem && (hours < 1 || hours > 12))) return null;
    if (meridiem) hours = hours % 12 + (meridiem === 'pm' ? 12 : 0);
    else if ((period === 'tarde' || period === 'noche') && hours < 12) hours += 12;
    return hours * 60 + minutes;
  };
  const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const invalid = () => {
    warnings.push({ field: 'horario', message: 'El horario no es válido o termina antes de comenzar. Indica inicio y término en formato de 24 horas.' });
    return fallback;
  };
  if (range) {
    // Do not mistake "del 10-11-2026" or "de 10 a 12 personas" for a time range.
    const after = normalized.slice((range.index || 0) + range[0].length);
    if (/^\s*(?:[-/]\d|personas\b|participantes\b|sillas\b|mesas\b)/.test(after)) return fallback;
    let start = toMinutes(range[1], range[2], range[3]);
    let end = toMinutes(range[4], range[5], range[6]);
    if (!range[3] && range[6] && Number(range[1]) <= 12) {
      start = toMinutes(range[1], range[2], range[6]);
      // "11 a 1 pm" crosses noon, while "6 a 8 pm" shares PM.
      if (start !== null && end !== null && start >= end && range[6] === 'pm') start -= 12 * 60;
    } else if (range[3] && !range[6] && Number(range[4]) <= 12) {
      end = toMinutes(range[4], range[5], range[3]);
    }
    if (start === null || end === null || end <= start) return invalid();
    return { horaInicio: hhmm(start), horaFin: hhmm(end), detected: true, warnings };
  }
  const single = new RegExp(`\\b(?:a\\s+las|desde\\s+las|hora(?:\\s+inicio)?\\s*[:=-]?)\\s*${hour}\\b`).exec(normalized);
  if (single) {
    const start = toMinutes(single[1], single[2], single[3]);
    const duration = /\b(?:por|durante)\s+(\d+(?:[.,]\d+)?)\s*(horas?|hrs?|minutos?|min)\b/.exec(normalized);
    const minutes = duration ? Number(duration[1].replace(',', '.')) * (/^(hora|hr)/.test(duration[2]) ? 60 : 1) : 60;
    if (start === null || minutes <= 0 || !Number.isInteger(minutes) || start + minutes >= 1440) return invalid();
    return { horaInicio: hhmm(start), horaFin: hhmm(start + minutes), detected: true, warnings };
  }
  return fallback;
}
