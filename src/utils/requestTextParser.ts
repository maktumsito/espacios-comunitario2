import { addDays, addMonths, eachDayOfInterval, format, isValid, parseISO } from 'date-fns';
import {
  ActivityTypeItem,
  EquipmentItem,
  LoanType,
  Reservation,
  ReservationEquipmentRequest,
  RoomSetup,
  RoomSetupType,
  SpaceBlock,
  SpaceInfo
} from '../types';
import { ACTIVITY_TYPES, SPACES_LIST, normalizeSpaceName } from '../data/spacesData';
import { DEFAULT_LOAN_TYPES } from '../services/adminConfigService';
import { formatRut, validateRut } from './validationUtils';
import { checkSingleConflict, findMaintenanceBlockConflicts } from './conflictDetector';
import { filterOutChileanHolidays, getChileanHolidayInfo } from './holidayUtils';
import { isCommitmentLetterEligible } from './commitmentLetterPdf';
import { WEEKDAYS } from './dateUtils';

export interface ParsedRequestOptions {
  defaultDate?: string; // YYYY-MM-DD
  defaultSpace?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  availableSpaces?: readonly SpaceInfo[];
  availableActivityTypes?: readonly ActivityTypeItem[];
  availableLoanTypes?: readonly LoanType[];
  availableEquipment?: readonly EquipmentItem[];
  allReservations?: readonly Reservation[];
  spaceBlocks?: readonly SpaceBlock[];
}

export interface ParsedReservationRequest {
  responsable: string;
  rut: string;
  telefonoContacto: string;
  emailContacto: string;
  domicilio: string;
  descripcion: string;
  tipoActividad: string;
  tipoPrestamo: string;
  espacio: string;
  spaceWasAutoSelected: boolean;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  cantidadParticipantes: number;
  bookingMode: 'single' | 'pattern';
  selectedDays: number[]; // 1=Lun .. 0=Dom
  diasSemana: string;
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  generatedSeriesDates: string[];
  equipamientoSolicitado: ReservationEquipmentRequest[];
  montaje?: RoomSetup;
  comentarios: string;
  requiereCartaCompromiso: boolean;
  matchedFromHistory: boolean;
  hasConflict: boolean;
  conflictDetails: string[];
  suggestedFreeSpace?: string;
  detectedFields: string[];
}

const MONTH_NAME_MAP: Record<string, number> = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sep: 9,
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12
};

const WEEKDAY_PATTERNS: Array<{ dayNum: number; id: string; regex: RegExp }> = [
  { dayNum: 1, id: 'lunes', regex: /\blunes\b/i },
  { dayNum: 2, id: 'martes', regex: /\bmartes\b/i },
  { dayNum: 3, id: 'miercoles', regex: /\bmi[eé]rcoles\b/i },
  { dayNum: 4, id: 'jueves', regex: /\bjueves\b/i },
  { dayNum: 5, id: 'viernes', regex: /\bviernes\b/i },
  { dayNum: 6, id: 'sabado', regex: /\bs[aá]bados?\b/i },
  { dayNum: 0, id: 'domingo', regex: /\bdomingos?\b/i }
];

const SPACE_ALIASES: Array<{ canonical: string; regex: RegExp }> = [
  { canonical: 'AUDITORIO', regex: /\bauditorio\b/i },
  { canonical: 'GIMNASIO', regex: /\bgimnasio\b/i },
  { canonical: 'SALA DE ESPEJOS', regex: /\b(sala\s+de\s+espejos?|sala\s+espejos?|espejos)\b/i },
  { canonical: 'TATAMI', regex: /\btatami\b/i },
  { canonical: 'SALA 2', regex: /\bsala\s*[-#]?\s*2\b/i },
  { canonical: 'SALA 3', regex: /\bsala\s*[-#]?\s*3\b/i },
  { canonical: 'SALA 4', regex: /\bsala\s*[-#]?\s*4\b/i },
  { canonical: 'SALA 5', regex: /\bsala\s*[-#]?\s*5\b/i },
  { canonical: 'SALA 6', regex: /\bsala\s*[-#]?\s*6\b/i },
  { canonical: 'BIBLIOTECA', regex: /\bbiblioteca\b/i },
  { canonical: 'PATIO EXTERIOR', regex: /\b(patio\s+exterior|patio\s+externo|patio)\b/i },
  { canonical: 'COCINA', regex: /\bcocina\b/i },
  { canonical: 'MULTICANCHA', regex: /\b(multicancha|cancha)\b/i },
  { canonical: 'BOX 1', regex: /\bbox\s*[-#]?\s*1\b/i }
];

function stripAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function extractRut(text: string): string {
  // Match Chilean RUT patterns: 12.345.678-9, 12345678-9, 9.876.543-K
  const rutWithDash = /\b(\d{1,2}\.?\d{3}\.?\d{3})\s*[-‐‑–—]\s*([0-9kK])\b/g;
  let match: RegExpExecArray | null;
  while ((match = rutWithDash.exec(text)) !== null) {
    const raw = `${match[1]}${match[2]}`;
    const res = validateRut(raw);
    if (res.isValid && res.formatted) {
      return res.formatted;
    }
    return formatRut(raw);
  }

  // Also check explicit "RUT: 123456789" without dash
  const labeledRut = /\b(?:rut|r\.u\.t\.?|run)\s*[:=-]?\s*([0-9.]{7,10}[0-9kK])\b/i.exec(text);
  if (labeledRut) {
    return formatRut(labeledRut[1]);
  }
  return '';
}

function extractEmail(text: string): string {
  const m = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/.exec(text);
  return m ? m[1].trim().toLowerCase() : '';
}

function extractPhone(text: string, excludeRut: string): string {
  const cleanText = excludeRut ? text.replace(excludeRut, ' ') : text;
  // Match +56 9 XXXX XXXX, 569XXXXXXXX, 9 XXXX XXXX, +56 2 XXXX XXXX
  const phoneRegexes = [
    /(?:\+?56\s*)?([92])\s*(\d{4})\s*[-.\s]?\s*(\d{4})\b/,
    /\b(?:tel(?:[eé]fono)?|cel(?:ular)?|fono|contacto|whatsapp|m[oó]vil)\s*[:=-]?\s*(\+?56\s*[92]\s*\d{4}\s*\d{4}|[92]\d{8})\b/i
  ];
  for (const rx of phoneRegexes) {
    const m = rx.exec(cleanText);
    if (m) {
      const digits = m[0].replace(/\D/g, '');
      const last9 = digits.slice(-9);
      if (last9.length === 9 && (last9.startsWith('9') || last9.startsWith('2'))) {
        return `+56 ${last9[0]} ${last9.slice(1, 5)} ${last9.slice(5)}`;
      }
    }
  }
  return '';
}

function extractDomicilio(text: string): string {
  const labeled = /(?:domicilio|direcci[oó]n|calle|ubicaci[oó]n|vive\s+en)\s*[:=-]\s*([^\n,;]+)/i.exec(text);
  if (labeled?.[1]) {
    return labeled[1].trim();
  }
  const streetMatch = /\b((?:Av\.?|Avenida|Calle|Pasaje|Psje\.?|Camino|Paseo)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s.#°-]{4,45}?\s+\d{1,5}(?:\s*,?\s*(?:depto|dpto|casa|oficina|of\.?)\s*\w+)?)\b/i.exec(text);
  if (streetMatch?.[1]) {
    return streetMatch[1].trim();
  }
  return '';
}

function extractResponsable(
  text: string,
  knownMap: Map<string, { responsable: string; rut?: string; telefonoContacto?: string; emailContacto?: string; domicilio?: string }>
): string {
  // 1. Explicit label: Nombre:, Solicitante:, Responsable:, Profesor:, Vecino:, Encargado:
  const labelMatch = /(?:nombre(?:\s+completo)?|solicitante|responsable|profesor(?:a)?|vecin[oa]|encargad[oa]|persona)\s*[:=-]\s*([A-ZÁÉÍÓÚÑa-záéíóúñ][A-ZÁÉÍÓÚÑa-záéíóúñ\s.'-]{2,50}?)(?=\s*(?:$|\n|,|;|\.|rut\b|r\.u\.t|tel|cel|fono|correo|email|mail|domicilio|direcci|solicita|pide|requiere|para\b|\d))/i.exec(text);
  if (labelMatch?.[1]) {
    return labelMatch[1].trim();
  }

  // 2. Check if any known responsable from history appears in the text
  const normalizedText = stripAccents(text.toLowerCase());
  for (const [, entry] of knownMap) {
    const cleanName = stripAccents(entry.responsable.toLowerCase());
    if (cleanName.length >= 5 && normalizedText.includes(cleanName)) {
      return entry.responsable;
    }
  }

  // 3. Natural language pattern: "Juan Pérez solicita...", "Solicitud de María Soto para..."
  const naturalBeforeVerb = /(?:^|\n|solicitud\s+de\s+|de\s+parte\s+de\s+)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\s*(?:,|\(|\bsolicita\b|\bpide\b|\brequiere\b|\bnecesita\b|\bagenda\b|\breserva\b|\brut\b)/i.exec(text);
  if (naturalBeforeVerb?.[1]) {
    const candidate = naturalBeforeVerb[1].trim();
    const stopWords = /^(hola|buenos|buenas|estimados|estimado|solicito|solicita|reserva|reservar|taller|actividad|reunion|sala|auditorio|gimnasio)$/i;
    const firstWord = candidate.split(/\s+/)[0];
    if (!stopWords.test(firstWord)) {
      return candidate;
    }
  }

  // 4. First segment if formatted like "Juan Pérez, RUT 12.345..."
  const firstSegment = text.trim().split(/[,;\n(]/)[0]?.trim() || '';
  if (/^[A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,3}$/.test(firstSegment) && firstSegment.length <= 45) {
    const lower = stripAccents(firstSegment.toLowerCase());
    if (!/\b(taller|sala|auditorio|gimnasio|tatami|cocina|patio|cancha|reunion|charla|ensayo|cumpleanos|solicito|necesito|reservar)\b/.test(lower)) {
      return firstSegment;
    }
  }

  return '';
}

function parseAllDatesFromText(text: string, baseDateIso: string): string[] {
  const results: string[] = [];
  const baseDate = parseISO(baseDateIso);
  const currentYear = isValid(baseDate) ? baseDate.getFullYear() : new Date().getFullYear();

  // 1. ISO YYYY-MM-DD
  const isoRegex = /\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/g;
  let m: RegExpExecArray | null;
  while ((m = isoRegex.exec(text)) !== null) {
    results.push(`${m[1]}-${m[2]}-${m[3]}`);
  }

  // 2. DD/MM/YYYY or DD-MM-YYYY
  const dmyRegex = /\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2}|\d{2})\b/g;
  while ((m = dmyRegex.exec(text)) !== null) {
    const day = pad2(parseInt(m[1], 10));
    const month = pad2(parseInt(m[2], 10));
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${yr}-${month}-${day}`;
    if (!results.includes(iso)) results.push(iso);
  }

  // 3. Natural Spanish date: "15 de noviembre de 2026" or "15 de noviembre"
  const naturalDateRegex = /\b(0?[1-9]|[12]\d|3[01])\s+de\s+([a-záéíóú]+)(?:\s+(?:de|del)\s+(20\d{2}))?\b/gi;
  while ((m = naturalDateRegex.exec(text)) !== null) {
    const day = pad2(parseInt(m[1], 10));
    const monthKey = stripAccents(m[2].toLowerCase());
    const monthNum = MONTH_NAME_MAP[monthKey];
    if (monthNum) {
      const yr = m[3] || String(currentYear);
      const iso = `${yr}-${pad2(monthNum)}-${day}`;
      if (!results.includes(iso)) results.push(iso);
    }
  }

  // 4. Relative words if no explicit date found yet
  if (results.length === 0) {
    const lower = stripAccents(text.toLowerCase());
    const refToday = new Date();
    if (/\bpasado\s+manana\b/.test(lower)) {
      results.push(format(addDays(refToday, 2), 'yyyy-MM-dd'));
    } else if (/\bmanana\b/.test(lower) && !/\bpor\s+la\s+manana\b/.test(lower) && !/\ben\s+la\s+manana\b/.test(lower)) {
      results.push(format(addDays(refToday, 1), 'yyyy-MM-dd'));
    } else if (/\bhoy\b/.test(lower)) {
      results.push(format(refToday, 'yyyy-MM-dd'));
    } else {
      for (const wd of WEEKDAY_PATTERNS) {
        const nextWdRegex = new RegExp(`\\b(?:pr[oó]ximo|este)\\s+${wd.regex.source.replace(/\\b/g, '')}\\b`, 'i');
        if (nextWdRegex.test(text)) {
          const base = isValid(baseDate) ? baseDate : refToday;
          const currentDow = base.getDay();
          let diff = (wd.dayNum - currentDow + 7) % 7;
          if (diff === 0) diff = 7;
          results.push(format(addDays(base, diff), 'yyyy-MM-dd'));
          break;
        }
      }
    }
  }

  return results;
}

function normalizeHourMinute(rawH: string, rawM?: string, meridiem?: string): string | null {
  let h = parseInt(rawH, 10);
  const m = rawM ? parseInt(rawM, 10) : 0;
  if (isNaN(h) || isNaN(m) || m < 0 || m > 59) return null;
  if (meridiem) {
    const mer = meridiem.toLowerCase();
    if (mer.includes('p') && h < 12) h += 12;
    if (mer.includes('a') && h === 12) h = 0;
  }
  if (h < 0 || h > 23) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

function extractTimeRange(
  text: string,
  defaultStart = '10:00',
  defaultEnd = '11:00'
): { horaInicio: string; horaFin: string; detected: boolean } {
  // 1. Explicit range with colons: "10:00 a 12:00", "de 15:30 a 17:00", "09:00 - 11:30"
  const colonRange = /\b(?:de(?:sde)?(?:\s+las)?\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*(?:a|hasta(?:\s+las)?|[-–—])\s*([01]?\d|2[0-3]):([0-5]\d)(?:\s*(?:hrs?\.?|horas?))?\b/i.exec(text);
  if (colonRange) {
    const start = normalizeHourMinute(colonRange[1], colonRange[2]);
    const end = normalizeHourMinute(colonRange[3], colonRange[4]);
    if (start && end) {
      return { horaInicio: start, horaFin: end, detected: true };
    }
  }

  // 2. Range without colons or mixed: "de 10 a 12 hrs", "de 9:30 a 11 hrs", "de 15 a 17 horas", "10 a 12pm"
  const shortRange = /\b(?:de(?:sde)?(?:\s+las)?|horario\s*[:=-]?|entre(?:\s+las)?)\s*([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm)?\s*(?:a|y|hasta(?:\s+las)?|[-–—])\s*([01]?\d|2[0-3])(?::([0-5]\d))?\s*(am|pm|hrs?\.?|horas?)?\b/i.exec(text);
  if (shortRange) {
    const start = normalizeHourMinute(shortRange[1], shortRange[2], shortRange[3]);
    const end = normalizeHourMinute(
      shortRange[4],
      shortRange[5],
      shortRange[6] && /am|pm/i.test(shortRange[6]) ? shortRange[6] : undefined
    );
    if (start && end) {
      return { horaInicio: start, horaFin: end, detected: true };
    }
  }

  // 3. Single start time + duration or single "a las HH:MM"
  const singleTime = /\b(?:a\s+las|desde\s+las|hora(?:\s+inicio)?\s*[:=-]?)\s*([01]?\d|2[0-3]):([0-5]\d)\b/i.exec(text);
  if (singleTime) {
    const start = normalizeHourMinute(singleTime[1], singleTime[2]);
    if (start) {
      const [sh, sm] = start.split(':').map(Number);
      const endTotal = Math.min(23 * 60 + 59, (sh * 60 + sm) + 60);
      const end = `${pad2(Math.floor(endTotal / 60))}:${pad2(endTotal % 60)}`;
      return { horaInicio: start, horaFin: end, detected: true };
    }
  }

  return { horaInicio: defaultStart, horaFin: defaultEnd, detected: false };
}

function extractParticipants(text: string): { count: number; detected: boolean } {
  const labeled = /\b(?:aforo(?:\s+de)?|participantes|asistentes|cupo(?:s)?|cantidad(?:\s+de\s+(?:personas|asistentes|participantes))?)[ \t]*[:=-][ \t]*([1-9]\d{0,2})\b/i.exec(text);
  if (labeled?.[1]) {
    const val = parseInt(labeled[1], 10);
    if (val > 0 && val <= 500) {
      return { count: val, detected: true };
    }
  }
  const inline = /\b([1-9]\d{0,2})[ \t]+(?:personas|participantes|asistentes|vecinos|alumnos|ni[ñn]os|adultos|cupos)\b/i.exec(text);
  if (inline?.[1]) {
    const val = parseInt(inline[1], 10);
    if (val > 0 && val <= 500) {
      return { count: val, detected: true };
    }
  }
  return { count: 15, detected: false };
}

function extractSpace(text: string, availableSpaces: readonly SpaceInfo[]): string | null {
  // Check custom spaces in availableSpaces first (longest name first so "SALA DE ESPEJOS" matches before "SALA")
  const sortedSpaces = [...availableSpaces].sort((a, b) => b.name.length - a.name.length);
  const normText = stripAccents(text.toUpperCase());
  for (const sp of sortedSpaces) {
    const normSp = stripAccents(sp.name.toUpperCase());
    const escaped = normSp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(normText)) {
      return sp.name;
    }
  }
  for (const alias of SPACE_ALIASES) {
    if (alias.regex.test(text)) {
      const canonical = normalizeSpaceName(alias.canonical);
      const matchedInCatalog = availableSpaces.find(
        (s) => normalizeSpaceName(s.name) === canonical
      );
      return matchedInCatalog ? matchedInCatalog.name : canonical;
    }
  }
  return null;
}

function inferActivityAndLoanType(
  text: string,
  availableActivityTypes: readonly ActivityTypeItem[],
  availableLoanTypes: readonly LoanType[]
): { tipoActividad: string; tipoPrestamo: string } {
  const lower = stripAccents(text.toLowerCase());
  const actNames = availableActivityTypes.length > 0
    ? availableActivityTypes.map((a) => a.name)
    : ACTIVITY_TYPES;
  const loanNames = availableLoanTypes.length > 0
    ? availableLoanTypes.map((l) => l.name)
    : DEFAULT_LOAN_TYPES.map((l) => l.name);

  const pickAct = (preferred: string) =>
    actNames.find((a) => stripAccents(a.toUpperCase()) === stripAccents(preferred.toUpperCase())) || actNames[0] || 'TALLER CCD';
  const pickLoan = (preferredKeyword: string) =>
    loanNames.find((l) => stripAccents(l.toUpperCase()).includes(stripAccents(preferredKeyword.toUpperCase()))) || loanNames[0] || 'TALLER FORMATIVO CCD';

  if (/\b(cumplea[nñ]os|celebraci[oó]n\s+infantil|fiesta)\b/.test(lower)) {
    return { tipoActividad: pickAct('CUMPLEAÑOS'), tipoPrestamo: pickLoan('EXTERNO') };
  }
  if (/\b(junta\s+de\s+vecinos|jj\.?\s*vv\.?|jjvv|comit[eé]\s+vecinal|vecinal)\b/.test(lower)) {
    return { tipoActividad: pickAct('TALLER JJV'), tipoPrestamo: pickLoan('COMUNITARIO') };
  }
  if (/\b(ensayo|elenco|banda|coro|coreograf[ií]a|teatro)\b/.test(lower)) {
    return { tipoActividad: pickAct('ENSAYO'), tipoPrestamo: pickLoan('ENSAYO') };
  }
  if (/\b(charla|conferencia|seminario|capacitaci[oó]n|exposici[oó]n|asamblea)\b/.test(lower)) {
    return { tipoActividad: pickAct('CHARLA'), tipoPrestamo: pickLoan('INSTITUCIONAL') };
  }
  if (/\b(taller\s+municipal|corporaci[oó]n|direcci[oó]n\s+municipal|depto\.?\s+municipal)\b/.test(lower)) {
    return { tipoActividad: pickAct('TALLER MUNICIPAL'), tipoPrestamo: pickLoan('MUNICIPAL') };
  }
  if (/\b(actividad\s+municipal|operativo|municipio|ceremonia\s+municipal)\b/.test(lower)) {
    return { tipoActividad: pickAct('ACTIVIDAD MUNICIPAL'), tipoPrestamo: pickLoan('MUNICIPAL') };
  }
  if (/\b(pr[eé]stamo|reuni[oó]n|club\s+de\s+adulto\s+mayor|cam\b|agrupaci[oó]n)\b/.test(lower)) {
    return { tipoActividad: pickAct('PRÉSTAMO'), tipoPrestamo: pickLoan('EXTERNO') };
  }
  if (/\b(f[uú]tbol|v[oó]leibol|b[aá]squetbol|partido|entrenamiento|deporte)\b/.test(lower)) {
    return { tipoActividad: pickAct('TALLER CCD'), tipoPrestamo: pickLoan('DEPORTIVO') };
  }

  return {
    tipoActividad: pickAct('TALLER CCD'),
    tipoPrestamo: pickLoan('FORMATIVO')
  };
}

function extractActivityDescription(text: string, responsable: string, espacio: string): string {
  // 1. Explicit label: Actividad:, Taller:, Motivo:, Descripción:, Evento:, Solicitud:
  const labeled = /(?:actividad|taller|motivo|descripci[oó]n|evento|asunto)\s*[:=-]\s*([^\n,;]+)/i.exec(text);
  if (labeled?.[1]) {
    return labeled[1].trim();
  }

  // 2. Pattern: "para [realizar/hacer] <Actividad>"
  const paraMatch = /\bpara\s+(?:realizar\s+|hacer\s+|dictar\s+|el\s+|la\s+|un\s+|una\s+)?((?:taller|clase|clases|reuni[oó]n|charla|ensayo|cumplea[nñ]os|entrenamiento|curso|jornada|asamblea|operativo|actividad|bingo|encuentro|pr[aá]ctica)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s-]{2,45}?)(?=\s*(?:$|\n|,|;|\.|el\s+\d|el\s+d[ií]a|los\s+d[ií]as|todos\s+los|de\s+\d|desde\s+las|a\s+las|en\s+sala|en\s+el|en\s+la|para\s+\d|con\s+\d|requiere|necesita))/i.exec(text);
  if (paraMatch?.[1]) {
    return paraMatch[1].trim();
  }

  // 3. Direct mention of known activity phrases: "Taller de ...", "Reunión de ...", "Clases de ..."
  const phraseMatch = /\b((?:taller|clases?|reuni[oó]n|charla|ensayo|cumplea[nñ]os|entrenamiento|curso|jornada|asamblea|encuentro)\s+(?:de\s+|del\s+|sobre\s+)?[A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s]{2,40}?)(?=\s*(?:$|\n|,|;|\.|el\s+\d|el\s+d[ií]a|los\s+|todos\s+los|de\s+\d|desde|a\s+las|en\s+|para\s+\d|rut\b|tel|correo|requiere|necesita))/i.exec(text);
  if (phraseMatch?.[1]) {
    return phraseMatch[1].trim();
  }

  // 4. Fallback if short description
  const cleaned = text
    .replace(/\b(?:rut|tel[eé]fono|fono|cel|correo|email|domicilio|direcci[oó]n)\s*[:=-]?\s*[^\n,;]+/gi, '')
    .trim();
  if (cleaned.length >= 4 && cleaned.length <= 60 && cleaned !== responsable && cleaned !== espacio) {
    return cleaned;
  }

  return '';
}

function extractEquipment(
  text: string,
  availableEquipment: readonly EquipmentItem[]
): ReservationEquipmentRequest[] {
  const requests: ReservationEquipmentRequest[] = [];
  if (!availableEquipment || availableEquipment.length === 0) return requests;

  const normText = stripAccents(text.toLowerCase());

  const keywordAliases: Array<{ keywords: RegExp; matchNamePart: string }> = [
    { keywords: /\b(\d{1,3})?\s*(?:proyector(?:es)?|data(?:\s*show)?)\b/i, matchNamePart: 'proyector' },
    { keywords: /\b(\d{1,3})?\s*(?:micr[oó]fonos?|mic)\b/i, matchNamePart: 'microfono' },
    { keywords: /\b(\d{1,3})?\s*(?:parlantes?|sistema\s+de\s+audio|amplificaci[oó]n|audio)\b/i, matchNamePart: 'parlante' },
    { keywords: /\b(\d{1,3})?\s*(?:notebooks?|computador(?:es)?|laptops?)\b/i, matchNamePart: 'notebook' },
    { keywords: /\b(\d{1,3})?\s*(?:tel[oó]n(?:es)?|pantalla\s+de\s+proyecci[oó]n)\b/i, matchNamePart: 'telon' },
    { keywords: /\b(\d{1,3})?\s*(?:pizarras?|plumones)\b/i, matchNamePart: 'pizarra' },
    { keywords: /\b(\d{1,3})?\s*(?:alargador(?:es)?|zapatillas?\s+el[eé]ctricas?|extension(?:es)?)\b/i, matchNamePart: 'alargador' },
    { keywords: /\b(\d{1,3})?\s*(?:sillas?)\b/i, matchNamePart: 'silla' },
    { keywords: /\b(\d{1,3})?\s*(?:mesas?|mesones?)\b/i, matchNamePart: 'mesa' },
    { keywords: /\b(\d{1,3})?\s*(?:colchonetas?|mats?)\b/i, matchNamePart: 'colchoneta' },
    { keywords: /\b(\d{1,3})?\s*(?:termos?|hervidor(?:es)?|cafetera)\b/i, matchNamePart: 'termo' },
    { keywords: /\b(\d{1,3})?\s*(?:atril(?:es)?|podio)\b/i, matchNamePart: 'atril' }
  ];

  const addedIds = new Set<string>();

  // Check catalog items directly
  for (const item of availableEquipment) {
    const normItemName = stripAccents(item.name.toLowerCase());
    const escaped = normItemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const directRx = new RegExp(`(?:(\\d{1,3})\\s*)?\\b${escaped}s?\\b`, 'i');
    const m = directRx.exec(normText);
    if (m) {
      const qty = m[1] ? Math.min(item.totalQuantity || 99, Math.max(1, parseInt(m[1], 10))) : 1;
      requests.push({
        equipmentId: item.id,
        equipmentName: item.name,
        quantity: qty
      });
      addedIds.add(item.id);
    }
  }

  // Check common aliases
  for (const alias of keywordAliases) {
    const m = alias.keywords.exec(text);
    if (m) {
      const targetItem = availableEquipment.find((eq) =>
        stripAccents(eq.name.toLowerCase()).includes(alias.matchNamePart)
      );
      if (targetItem && !addedIds.has(targetItem.id)) {
        const qty = m[1] ? Math.min(targetItem.totalQuantity || 99, Math.max(1, parseInt(m[1], 10))) : 1;
        requests.push({
          equipmentId: targetItem.id,
          equipmentName: targetItem.name,
          quantity: qty
        });
        addedIds.add(targetItem.id);
      }
    }
  }

  return requests;
}

function extractMontaje(text: string): RoomSetup | undefined {
  const lower = stripAccents(text.toLowerCase());
  let tipo: RoomSetupType | undefined;
  if (/\bmontaje\s+(?:en\s+)?u\b|\bdisposici[oó]n\s+en\s+u\b|\bforma\s+de\s+u\b/.test(lower)) {
    tipo = 'u';
  } else if (/\bmontaje\s+(?:tipo\s+)?auditorio\b|\bsillas\s+en\s+filas\b/.test(lower)) {
    tipo = 'auditorio';
  } else if (/\bmontaje\s+(?:tipo\s+)?aula\b|\bdisposici[oó]n\s+escolar\b/.test(lower)) {
    tipo = 'aula';
  } else if (/\ben\s+c[ií]rculo\b|\bmontaje\s+circular\b/.test(lower)) {
    tipo = 'circulo';
  } else if (/\bdespejado\b|\bsin\s+sillas\b|\bsala\s+despejada\b/.test(lower)) {
    tipo = 'despejado';
  } else if (/\bmesas\s+de\s+trabajo\b|\bmontaje\s+con\s+mesas\b/.test(lower)) {
    tipo = 'mesas';
  }

  if (!tipo) return undefined;
  return {
    tipo,
    instrucciones: ''
  };
}

/**
 * Parses a natural-language or structured request string and returns all extracted reservation fields,
 * enriching applicant data from historical reservations and checking space availability.
 */
export function parseReservationRequestText(
  rawText: string,
  options: ParsedRequestOptions = {}
): ParsedReservationRequest {
  const text = (rawText || '').trim();
  const availableSpaces = options.availableSpaces && options.availableSpaces.length > 0
    ? options.availableSpaces
    : SPACES_LIST;
  const availableActivityTypes = options.availableActivityTypes || [];
  const availableLoanTypes = options.availableLoanTypes || DEFAULT_LOAN_TYPES;
  const availableEquipment = options.availableEquipment || [];
  const allReservations = options.allReservations || [];
  const spaceBlocks = options.spaceBlocks || [];
  const defaultDate = options.defaultDate || format(new Date(), 'yyyy-MM-dd');

  const detectedFields: string[] = [];

  // Build historical applicant directory
  const knownResponsablesMap = new Map<
    string,
    {
      responsable: string;
      rut?: string;
      telefonoContacto?: string;
      emailContacto?: string;
      domicilio?: string;
    }
  >();

  for (const r of allReservations) {
    const name = (r.responsable || '').trim();
    if (!name) continue;
    const key = stripAccents(name.toLowerCase());
    const existing = knownResponsablesMap.get(key);
    if (!existing) {
      knownResponsablesMap.set(key, {
        responsable: name,
        rut: r.rut,
        telefonoContacto: r.telefonoContacto,
        emailContacto: r.emailContacto,
        domicilio: r.domicilio
      });
    } else {
      if (!existing.rut && r.rut) existing.rut = r.rut;
      if (!existing.telefonoContacto && r.telefonoContacto) existing.telefonoContacto = r.telefonoContacto;
      if (!existing.emailContacto && r.emailContacto) existing.emailContacto = r.emailContacto;
      if (!existing.domicilio && r.domicilio) existing.domicilio = r.domicilio;
    }
  }

  // 1. Extract Applicant Info
  let rut = extractRut(text);
  if (rut) detectedFields.push('RUT');

  let emailContacto = extractEmail(text);
  if (emailContacto) detectedFields.push('Correo');

  let telefonoContacto = extractPhone(text, rut);
  if (telefonoContacto) detectedFields.push('Teléfono');

  let domicilio = extractDomicilio(text);
  if (domicilio) detectedFields.push('Domicilio');

  let responsable = extractResponsable(text, knownResponsablesMap);
  if (responsable) detectedFields.push('Solicitante');

  // Enrich from historical records by name, RUT, or email
  let matchedFromHistory = false;
  let historicalMatch = responsable
    ? knownResponsablesMap.get(stripAccents(responsable.toLowerCase()))
    : undefined;

  if (!historicalMatch && (rut || emailContacto)) {
    const cleanTargetRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    for (const [, entry] of knownResponsablesMap) {
      const entryCleanRut = (entry.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
      if (
        (cleanTargetRut && entryCleanRut === cleanTargetRut) ||
        (emailContacto && entry.emailContacto?.toLowerCase() === emailContacto.toLowerCase())
      ) {
        historicalMatch = entry;
        break;
      }
    }
  }

  if (historicalMatch) {
    matchedFromHistory = true;
    if (!responsable) responsable = historicalMatch.responsable;
    if (!rut && historicalMatch.rut) rut = formatRut(historicalMatch.rut);
    if (!telefonoContacto && historicalMatch.telefonoContacto) telefonoContacto = historicalMatch.telefonoContacto;
    if (!emailContacto && historicalMatch.emailContacto) emailContacto = historicalMatch.emailContacto;
    if (!domicilio && historicalMatch.domicilio) domicilio = historicalMatch.domicilio;
  }

  // 2. Extract Dates & Recurrence
  const parsedDates = parseAllDatesFromText(text, defaultDate);
  if (parsedDates.length > 0) detectedFields.push('Fecha');
  const primaryDate = parsedDates[0] || defaultDate;

  // Detect recurring weekdays (e.g. "todos los lunes y miércoles", "cada martes y jueves", "semanal")
  const matchedWeekdays: number[] = [];
  for (const wd of WEEKDAY_PATTERNS) {
    if (wd.regex.test(text)) {
      matchedWeekdays.push(wd.dayNum);
    }
  }

  const hasRecurrenceKeyword =
    /\b(todos\s+los|cada\s+(?:semana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|semanal(?:mente)?|recurrente|serie\s+de|del\s+\d{1,2}[-/]\d{1,2}.*al\s+\d{1,2}[-/]\d{1,2}|desde\s+el.*hasta\s+el)\b/i.test(
      text
    ) || matchedWeekdays.length >= 2;

  const bookingMode: 'single' | 'pattern' =
    hasRecurrenceKeyword && matchedWeekdays.length > 0 ? 'pattern' : 'single';

  const selectedDays = bookingMode === 'pattern' ? matchedWeekdays : [1, 3];
  const diasSemana = WEEKDAYS.filter((d) => selectedDays.includes(d.dayNum))
    .map((d) => d.key)
    .join(',');

  const recurrenceStartDate = parsedDates[0] || defaultDate;
  const recurrenceEndDate =
    parsedDates.length >= 2 && parsedDates[1] > recurrenceStartDate
      ? parsedDates[1]
      : format(addMonths(parseISO(recurrenceStartDate), 2), 'yyyy-MM-dd');

  let generatedSeriesDates: string[] = [];
  if (bookingMode === 'pattern') {
    detectedFields.push('Recurrencia Semanal');
    try {
      const start = parseISO(recurrenceStartDate);
      const end = parseISO(recurrenceEndDate);
      if (isValid(start) && isValid(end) && end >= start) {
        const rawDates = eachDayOfInterval({ start, end })
          .filter((d) => selectedDays.includes(d.getDay()))
          .map((d) => format(d, 'yyyy-MM-dd'));
        const { validDates } = filterOutChileanHolidays(rawDates);
        generatedSeriesDates = [...validDates];
      }
    } catch {
      generatedSeriesDates = [primaryDate];
    }
  }

  // 3. Extract Time Range
  const timeExtract = extractTimeRange(
    text,
    options.defaultStartTime || '08:30',
    options.defaultEndTime || '09:30'
  );
  if (timeExtract.detected) detectedFields.push('Horario');
  const { horaInicio, horaFin } = timeExtract;

  // 4. Extract Participants
  const partExtract = extractParticipants(text);
  if (partExtract.detected) detectedFields.push('Aforo');
  const cantidadParticipantes = partExtract.count;

  // 5. Extract Space & Check Conflicts / Auto-assign Free Space
  const explicitSpace = extractSpace(text, availableSpaces);
  if (explicitSpace) detectedFields.push('Espacio');

  const isSpaceFreeForDates = (spaceName: string, datesToCheck: string[]): { free: boolean; reasons: string[] } => {
    const reasons: string[] = [];
    for (const dt of datesToCheck) {
      const holiday = getChileanHolidayInfo(dt);
      if (holiday && datesToCheck.length === 1) {
        reasons.push(`Feriado el ${dt} (${holiday.name})`);
      }
      const candidateSlot: Partial<Reservation> = {
        espacio: spaceName,
        fecha: dt,
        horaInicio,
        horaFin
      };
      const blockConflicts = findMaintenanceBlockConflicts(
        [candidateSlot],
        spaceBlocks
      );
      if (blockConflicts.length > 0) {
        reasons.push(`Mantención en ${spaceName} el ${dt}`);
      }
      const resConflicts = checkSingleConflict(
        candidateSlot,
        allReservations
      );
      if (resConflicts.length > 0) {
        reasons.push(
          `Topamiento en ${spaceName} el ${dt} (${resConflicts[0].horaInicio}–${resConflicts[0].horaFin}: ${resConflicts[0].descripcion || resConflicts[0].tipoActividad})`
        );
      } else {
        const normTargetSpace = normalizeSpaceName(spaceName);
        const directOverlap = allReservations.find(
          (r) =>
            r.fecha === dt &&
            r.estado !== 'cancelada' &&
            r.estado !== 'eliminada' &&
            r.estado !== 'rechazada' &&
            normalizeSpaceName(r.espacio) === normTargetSpace &&
            r.horaInicio < horaFin &&
            r.horaFin > horaInicio
        );
        if (directOverlap) {
          reasons.push(
            `Topamiento en ${spaceName} el ${dt} (${directOverlap.horaInicio}–${directOverlap.horaFin}: ${directOverlap.descripcion || directOverlap.tipoActividad})`
          );
        }
      }
    }
    return { free: reasons.length === 0, reasons };
  };

  const targetDatesForCheck =
    bookingMode === 'pattern' && generatedSeriesDates.length > 0
      ? generatedSeriesDates
      : [primaryDate];

  // Find a free space that fits capacity
  const findBestFreeSpace = (): string | undefined => {
    const candidates = [...availableSpaces].sort((a, b) => {
      const capA = a.capacity || 30;
      const capB = b.capacity || 30;
      const fitsA = capA >= cantidadParticipantes ? 0 : 1;
      const fitsB = capB >= cantidadParticipantes ? 0 : 1;
      if (fitsA !== fitsB) return fitsA - fitsB;
      return capA - capB;
    });
    for (const sp of candidates) {
      if (isSpaceFreeForDates(sp.name, targetDatesForCheck).free) {
        return sp.name;
      }
    }
    return undefined;
  };

  const suggestedFreeSpace = findBestFreeSpace();
  let espacio =
    explicitSpace ||
    (options.defaultSpace && availableSpaces.some((s) => s.name === options.defaultSpace)
      ? options.defaultSpace
      : undefined) ||
    suggestedFreeSpace ||
    availableSpaces[0]?.name ||
    'AUDITORIO';

  const spaceWasAutoSelected = !explicitSpace;
  const availabilityCheck = isSpaceFreeForDates(espacio, targetDatesForCheck);

  // 6. Activity Description & Type
  const { tipoActividad, tipoPrestamo } = inferActivityAndLoanType(
    text,
    availableActivityTypes,
    availableLoanTypes
  );
  const rawDesc = extractActivityDescription(text, responsable, espacio);
  if (rawDesc) detectedFields.push('Actividad');
  const descripcion = rawDesc || (responsable ? `${tipoActividad} - ${responsable}` : tipoActividad);

  // 7. Equipment & Room Setup
  const equipamientoSolicitado = extractEquipment(text, availableEquipment);
  if (equipamientoSolicitado.length > 0) detectedFields.push('Equipamiento');

  const montaje = extractMontaje(text);
  if (montaje) detectedFields.push('Montaje');

  const requiereCartaCompromiso = isCommitmentLetterEligible(tipoActividad, tipoPrestamo);

  return {
    responsable,
    rut,
    telefonoContacto,
    emailContacto,
    domicilio,
    descripcion,
    tipoActividad,
    tipoPrestamo,
    espacio,
    spaceWasAutoSelected,
    fecha: primaryDate,
    horaInicio,
    horaFin,
    cantidadParticipantes,
    bookingMode,
    selectedDays,
    diasSemana,
    recurrenceStartDate,
    recurrenceEndDate,
    generatedSeriesDates,
    equipamientoSolicitado,
    montaje,
    comentarios: text ? `Solicitud ingresada por texto: ${text}` : '',
    requiereCartaCompromiso,
    matchedFromHistory,
    hasConflict: !availabilityCheck.free,
    conflictDetails: availabilityCheck.reasons,
    suggestedFreeSpace: !availabilityCheck.free ? suggestedFreeSpace : undefined,
    detectedFields
  };
}
