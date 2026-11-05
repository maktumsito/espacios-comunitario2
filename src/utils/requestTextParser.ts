import { addMonths, differenceInCalendarDays, eachDayOfInterval, format, isValid, parseISO } from 'date-fns';
import Fuse from 'fuse.js';
import { extractRequestDates, extractRequestTime, RequestParsingWarning } from './requestTextTemporal';
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
import { buildReservationDateIndex } from './reservationIndex';
import { separateRequestFields } from './requestTextFields';
import type { RequestAiExtraction } from './requestAiSchema';

export interface ParsedRequestOptions {
  aiExtraction?: RequestAiExtraction;
  defaultDate?: string; // YYYY-MM-DD
  referenceDate?: string; // Today for relative expressions; independent of calendar selection.
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
  parsingWarnings: RequestParsingWarning[];
}

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
  // Mask the original RUT spelling, not just its formatted representation.
  const cleanText = text
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}\s*[-‐‑–—]\s*[0-9kK]\b/g, ' ')
    .replace(/\b(?:rut|r\.u\.t\.?|run)\s*[:=-]?\s*[0-9.]{7,10}[0-9kK]\b/gi, ' ')
    .replace(excludeRut || /$^/, ' ');
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

  // Explicit introductions take priority over a different person mentioned in the message.
  const introduction = /\b(?:me\s+llamo|mi\s+nombre\s+es|soy|solicita|a\s+nombre\s+de)\s+([a-záéíóúñ]+(?:[ \t]+[a-záéíóúñ]+){1,4}?)(?=[ \t]*(?:[,;\n.(]|$|y\s+|para\s+|rut\b|solicito\b|necesito\b|quiero\b|solicita\b))/i.exec(text);
  if (introduction?.[1] && !/^(?:sala|el|la|un|una|reserva|reservar)\b/i.test(introduction[1])) {
    return introduction[1].trim();
  }

  // 2. Check if any known responsable from history appears in the text
  const normalizedText = stripAccents(text.toLowerCase());
  for (const [, entry] of knownMap) {
    const cleanName = stripAccents(entry.responsable.toLowerCase());
    const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (cleanName.length >= 5 && new RegExp(`\\b${escaped}\\b`).test(normalizedText)) {
      return entry.responsable;
    }
  }

  // 3. Natural language pattern: "Juan Pérez solicita...", "Solicitud de María Soto para..."
  const naturalBeforeVerb = /(?:^|\n|solicitud\s+de\s+|de\s+parte\s+de\s+)([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})\s*(?:\bsolicita\b|\bpide\b|\brequiere\b|\bnecesita\b|\bagenda\b|\breserva\b|\brut\b)/i.exec(text);
  if (naturalBeforeVerb?.[1]) {
    const candidate = naturalBeforeVerb[1].trim();
    const stopWords = /^(hola|buenos|buenas|estimados|estimado|solicito|solicita|reserva|reservar|taller|actividad|reunion|sala|auditorio|gimnasio)$/i;
    const firstWord = candidate.split(/\s+/)[0];
    if (!stopWords.test(firstWord)) {
      return candidate;
    }
  }

  // An isolated name can occur anywhere. Do not guess between multiple names or activity phrases.
  const candidates = text.split(/[,;\n().]/).map(segment => segment.trim()).filter(segment => {
    if (segment.length > 55 || !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+(?:\s+(?:(?:de|del|la|las|los)\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+){1,4}$/.test(segment)) return false;
    return !/\b(taller|clases?|sala|salon|auditorio|gimnasio|tatami|cocina|patio|cancha|reunion|charla|ensayo|cumpleanos|solicito|necesito|reservar|hola|buenos|buenas|montaje|proyector|microfono|sillas?|mesas?|lunes|martes|miercoles|jueves|viernes|sabado|domingo|calle|avenida|pasaje|actividad|club|junta|vecinos)\b/.test(stripAccents(segment.toLowerCase()));
  });
  const uniqueCandidates = [...new Set(candidates)];
  if (uniqueCandidates.length === 1) return uniqueCandidates[0];

  return '';
}

function extractParticipants(text: string): { count: number; detected: boolean } {
  const labeled = /\b(?:aforo|participantes|asistentes|cupo(?:s)?|somos|seremos|cantidad(?:\s+de\s+(?:personas|asistentes|participantes))?)[ \t]*(?::|=|-|de)?[ \t]*([1-9]\d{0,2})\b/i.exec(text);
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

const spaceSearchCache = new WeakMap<readonly SpaceInfo[], Fuse<{ name: string; normalized: string }>>();

function extractSpace(text: string, availableSpaces: readonly SpaceInfo[]): string | null {
  text = text.replace(/\bmontaje\s+(?:tipo\s+|en\s+)?auditorio\b/gi, ' ');
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
      const containing = availableSpaces.filter(s => stripAccents(s.name.toUpperCase()).includes(stripAccents(canonical)));
      if (matchedInCatalog) return matchedInCatalog.name;
      if (containing.length === 1) return containing[0].name;
    }
  }

  // Reuse the catalog index while typing. Only match short windows, never an entire message.
  // Keep room numbers exact: a typo must never turn "Sala 8" into "Sala 3".
  let search = spaceSearchCache.get(availableSpaces);
  if (!search) {
    search = new Fuse(availableSpaces.map(s => ({ name: s.name, normalized: stripAccents(s.name.toLowerCase()) })), {
      keys: ['normalized'], includeScore: true, threshold: 0.2, ignoreLocation: true, ignoreFieldNorm: true
    });
    spaceSearchCache.set(availableSpaces, search);
  }
  const tokens = stripAccents(text.toLowerCase()).match(/[a-z0-9]+/g) || [];
  const matches = new Map<string, number>();
  for (let i = 0; i < tokens.length; i++) {
    for (let length = 1; length <= 5 && i + length <= tokens.length; length++) {
      const phrase = tokens.slice(i, i + length).join(' ');
      if (phrase.length < 5 || /^(?:para|desde|hasta|horario|montaje|sin|no)\b/.test(phrase)) continue;
      for (const result of search.search(phrase, { limit: 2 })) {
        const target = result.item.normalized;
        if ((phrase.match(/\d+/g) || []).join() !== (target.match(/\d+/g) || []).join()) continue;
        // No partial-name guesses ("sala" / "multiuso"); require comparable lengths.
        if (Math.abs(target.length - phrase.length) > Math.max(2, target.length * 0.2)) continue;
        const score = result.score ?? 1;
        if (score <= 0.2) matches.set(result.item.name, Math.min(matches.get(result.item.name) ?? 1, score));
      }
    }
  }
  const ranked = [...matches].sort((a, b) => a[1] - b[1]);
  if (ranked.length && (!ranked[1] || ranked[1][1] - ranked[0][1] >= 0.08)) return ranked[0][0];
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

  text = text.replace(/\b(?:sin|no\s+(?:necesito|necesita|necesitamos|requiero|requiere|requerimos))\s+[^,;\n.]+/gi, ' ');

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

type ApplicantHistoryEntry = Pick<Reservation, 'responsable' | 'rut' | 'telefonoContacto' | 'emailContacto' | 'domicilio'>;
const applicantHistoryCache = new WeakMap<readonly Reservation[], Map<string, ApplicantHistoryEntry>>();
const reservationDateIndexCache = new WeakMap<readonly Reservation[], Map<string, Reservation[]>>();

/** React data arrays are immutable; a new snapshot invalidates the index naturally. */
export function getRequestReservationDateIndex(reservations: readonly Reservation[]) {
  let index = reservationDateIndexCache.get(reservations);
  if (!index) {
    index = buildReservationDateIndex(reservations);
    reservationDateIndexCache.set(reservations, index);
  }
  return index;
}

function getApplicantDirectory(allReservations: readonly Reservation[]): Map<string, ApplicantHistoryEntry> {
  const cached = applicantHistoryCache.get(allReservations);
  if (cached) return cached;
  const knownResponsablesMap = new Map<string, ApplicantHistoryEntry>();
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
  applicantHistoryCache.set(allReservations, knownResponsablesMap);
  return knownResponsablesMap;
}

/**
 * Parses a natural-language or structured request string and returns all extracted reservation fields,
 * enriching applicant data from historical reservations and checking space availability.
 */
export function parseReservationRequestText(
  rawText: string,
  options: ParsedRequestOptions = {}
): ParsedReservationRequest {
  const text = separateRequestFields((rawText || '').normalize('NFC').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim());
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
  const parsingWarnings: RequestParsingWarning[] = [];
  const ai = options.aiExtraction;

  const knownResponsablesMap = getApplicantDirectory(allReservations);
  const reservationDateIndex = getRequestReservationDateIndex(allReservations);

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
  const cleanRut = (value: string) => value.replace(/[^0-9kK]/g, '').toUpperCase();
  if (historicalMatch?.rut && rut && cleanRut(historicalMatch.rut) !== cleanRut(rut)) historicalMatch = undefined;

  if (!historicalMatch && (rut || emailContacto)) {
    const cleanTargetRut = rut.replace(/[^0-9kK]/g, '').toUpperCase();
    for (const [, entry] of knownResponsablesMap) {
      const entryCleanRut = (entry.rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
      if (
        (cleanTargetRut && entryCleanRut === cleanTargetRut) ||
        (!cleanTargetRut && emailContacto && entry.emailContacto?.toLowerCase() === emailContacto.toLowerCase())
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
  const dateExtract = extractRequestDates(text, defaultDate, options.referenceDate || format(new Date(), 'yyyy-MM-dd'));
  const aiDate = ai?.fecha || ai?.recurrenceStartDate;
  if (aiDate) {
    dateExtract.dates = [aiDate];
    dateExtract.startDate = ai?.recurrenceStartDate || aiDate;
    dateExtract.endDate = ai?.recurrenceEndDate || undefined;
    dateExtract.warnings = [];
  }
  const parsedDates = dateExtract.dates;
  parsingWarnings.push(...dateExtract.warnings);
  if (parsedDates.length > 0) detectedFields.push('Fecha');
  const primaryDate = dateExtract.startDate || parsedDates[0] || (dateExtract.warnings.length ? '' : defaultDate);

  // Detect recurring weekdays (e.g. "todos los lunes y miércoles", "cada martes y jueves", "semanal")
  const matchedWeekdays: number[] = [];
  for (const wd of WEEKDAY_PATTERNS) {
    if (wd.regex.test(text)) {
      matchedWeekdays.push(wd.dayNum);
    }
  }
  const weekdayRange = /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\s+(?:a|al|hasta(?:\s+el)?)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/.exec(stripAccents(text.toLowerCase()));
  if (weekdayRange) {
    const start = WEEKDAY_PATTERNS.find(wd => wd.id === weekdayRange[1])!.dayNum;
    const end = WEEKDAY_PATTERNS.find(wd => wd.id === weekdayRange[2])!.dayNum;
    for (let offset = 0; offset <= (end - start + 7) % 7; offset++) {
      const day = (start + offset) % 7;
      if (!matchedWeekdays.includes(day)) matchedWeekdays.push(day);
    }
    matchedWeekdays.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  }
  if (ai?.selectedDays) matchedWeekdays.splice(0, matchedWeekdays.length, ...new Set(ai.selectedDays));

  const hasRecurrenceKeyword =
    /\b(todos\s+los|cada\s+(?:semana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|semanal(?:mente)?|recurrente|serie\s+de|del\s+\d{1,2}[-/]\d{1,2}.*al\s+\d{1,2}[-/]\d{1,2}|desde\s+el.*hasta\s+el)\b/i.test(
      text
    ) || matchedWeekdays.length >= 2;

  const bookingMode: 'single' | 'pattern' =
    ai?.bookingMode || (hasRecurrenceKeyword && matchedWeekdays.length > 0 ? 'pattern' : 'single');

  const selectedDays = bookingMode === 'pattern' ? matchedWeekdays : [1, 3];
  const diasSemana = WEEKDAYS.filter((d) => selectedDays.includes(d.dayNum))
    .map((d) => d.key)
    .join(',');

  const recurrenceStartDate = ai?.recurrenceStartDate || dateExtract.startDate || parsedDates.find(date => date !== dateExtract.endDate) || defaultDate;
  const recurrenceEndDate =
    ai && bookingMode === 'pattern' ? ai.recurrenceEndDate || dateExtract.endDate || '' :
    dateExtract.endDate || (parsedDates.length >= 2
      ? parsedDates.find(date => date !== recurrenceStartDate) || recurrenceStartDate
      : format(addMonths(parseISO(recurrenceStartDate), 2), 'yyyy-MM-dd'));

  let generatedSeriesDates: string[] = [];
  if (ai && bookingMode === 'pattern' && (!ai.recurrenceStartDate || !ai.recurrenceEndDate || !selectedDays.length)) {
    parsingWarnings.push({ field: 'recurrencia', message: 'La serie necesita fecha de inicio, fecha de término y días de la semana. Revísalos en el formulario completo.' });
  }
  if (bookingMode === 'pattern') {
    detectedFields.push('Recurrencia Semanal');
    try {
      const start = parseISO(recurrenceStartDate);
      const end = parseISO(recurrenceEndDate);
      if (end < start || differenceInCalendarDays(end, start) > 366) {
        parsingWarnings.push({ field: 'recurrencia', message: 'Revisa el período de la serie: el término debe ser posterior al inicio y abarcar como máximo un año.' });
      } else if (isValid(start) && isValid(end)) {
        const rawDates = eachDayOfInterval({ start, end })
          .filter((d) => selectedDays.includes(d.getDay()))
          .map((d) => format(d, 'yyyy-MM-dd'));
        const { validDates } = filterOutChileanHolidays(rawDates);
        generatedSeriesDates = [...validDates];
        if (!generatedSeriesDates.length) parsingWarnings.push({ field: 'recurrencia', message: 'El período no contiene sesiones disponibles en los días indicados.' });
      }
    } catch {
      parsingWarnings.push({ field: 'recurrencia', message: 'No se pudo interpretar el período de la serie. Revisa las fechas.' });
    }
  } else if (parsedDates.length > 1) {
    parsingWarnings.push({ field: 'recurrencia', message: 'Hay varias fechas en la solicitud. Define los días de la serie en el formulario completo o deja una sola fecha.' });
  }

  // 3. Extract Time Range
  const timeExtract = extractRequestTime(
    text,
    options.defaultStartTime || '08:30',
    options.defaultEndTime || '09:30'
  );
  if (ai?.horaInicio && ai.horaFin) {
    timeExtract.horaInicio = ai.horaInicio;
    timeExtract.horaFin = ai.horaFin;
    timeExtract.detected = true;
    timeExtract.warnings = [];
  }
  parsingWarnings.push(...timeExtract.warnings);
  if (timeExtract.detected) detectedFields.push('Horario');
  const { horaInicio, horaFin } = timeExtract;

  // 4. Extract Participants
  const partExtract = extractParticipants(text);
  if (partExtract.detected) detectedFields.push('Aforo');
  const cantidadParticipantes = ai?.cantidadParticipantes ?? partExtract.count;
  if (ai && !ai.fecha && !dateExtract.dates.length) parsingWarnings.push({ field: 'fecha', message: 'No se indicó una fecha. Confirma la fecha antes de crear la reserva.' });
  if (ai && (!ai.horaInicio || !ai.horaFin) && !timeExtract.detected) parsingWarnings.push({ field: 'horario', message: 'No se indicó un horario completo. Confirma inicio y término.' });
  if (ai && !ai.cantidadParticipantes && !partExtract.detected) parsingWarnings.push({ field: 'participantes', message: 'Confirma la cantidad de participantes antes de crear la reserva.' });

  // 5. Extract Space & Check Conflicts / Auto-assign Free Space
  const explicitSpace = (ai?.espacio && availableSpaces.some(s => s.name === ai.espacio) ? ai.espacio : undefined) || extractSpace(text, availableSpaces);
  if (explicitSpace) detectedFields.push('Espacio');
  if (!explicitSpace && /\b(?:(?:espacio|sala)\s*[:=-]\s*\S|sala\s+(?:multiuso\s+)?\d+)/i.test(text)) {
    parsingWarnings.push({ field: 'espacio', message: 'No se reconoció el espacio solicitado. Selecciona una sala del catálogo.' });
  }

  const isSpaceFreeForDates = (spaceName: string, datesToCheck: string[]): { free: boolean; reasons: string[] } => {
    const reasons: string[] = [];
    const catalogSpace = availableSpaces.find(s => s.name === spaceName);
    if (catalogSpace?.activo === false) reasons.push(`El espacio ${spaceName} está inactivo.`);
    if (catalogSpace?.capacity && catalogSpace.capacity < cantidadParticipantes) {
      reasons.push(`Aforo insuficiente en ${spaceName}: capacidad ${catalogSpace.capacity}, solicitud ${cantidadParticipantes}.`);
    }
    for (const dt of datesToCheck) {
      const reservationsForDate = reservationDateIndex.get(dt) || [];
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
        reservationsForDate
      );
      if (resConflicts.length > 0) {
        reasons.push(
          `Topamiento en ${spaceName} el ${dt} (${resConflicts[0].horaInicio}–${resConflicts[0].horaFin}: ${resConflicts[0].descripcion || resConflicts[0].tipoActividad})`
        );
      } else {
        const normTargetSpace = normalizeSpaceName(spaceName);
        const directOverlap = reservationsForDate.find(
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
      if (sp.activo === false || (sp.capacity && sp.capacity < cantidadParticipantes)) continue;
      if (checkAvailability(sp.name).free) {
        return sp.name;
      }
    }
    return undefined;
  };

  // Check the selected room first; only scan alternatives when one is needed.
  let espacio =
    explicitSpace ||
    (options.defaultSpace && availableSpaces.some((s) => s.name === options.defaultSpace)
      ? options.defaultSpace
      : undefined) ||
    '';

  const availabilityCache = new Map<string, ReturnType<typeof isSpaceFreeForDates>>();
  const checkAvailability = (name: string) => {
    let result = availabilityCache.get(name);
    if (!result) {
      result = isSpaceFreeForDates(name, targetDatesForCheck);
      availabilityCache.set(name, result);
    }
    return result;
  };
  const suggestedFreeSpace = !espacio || !checkAvailability(espacio).free ? findBestFreeSpace() : undefined;
  espacio ||= suggestedFreeSpace || availableSpaces.find(s => s.activo !== false)?.name || availableSpaces[0]?.name || 'AUDITORIO';

  const spaceWasAutoSelected = !explicitSpace;
  const availabilityCheck = checkAvailability(espacio);

  // 6. Activity Description & Type
  const inferred = inferActivityAndLoanType(
    text,
    availableActivityTypes,
    availableLoanTypes
  );
  const tipoActividad = ai?.tipoActividad || inferred.tipoActividad;
  const tipoPrestamo = ai?.tipoPrestamo || inferred.tipoPrestamo;
  const rawDesc = extractActivityDescription(text, responsable, espacio);
  if (rawDesc) detectedFields.push('Actividad');
  const descripcion = ai?.descripcion || rawDesc || (responsable ? `${tipoActividad} - ${responsable}` : tipoActividad);
  if (ai && !ai.descripcion && !rawDesc) parsingWarnings.push({ field: 'actividad', message: 'Confirma la descripción de la actividad.' });

  // 7. Equipment & Room Setup
  const equipamientoSolicitado = ai?.equipamientoSolicitado?.map(item => ({ ...item,
    equipmentName: availableEquipment.find(eq => eq.id === item.equipmentId)?.name || '',
  })).filter(item => item.equipmentName) ?? extractEquipment(text, availableEquipment);
  if (equipamientoSolicitado.length > 0) detectedFields.push('Equipamiento');

  const montaje = ai?.montaje ?? extractMontaje(text);
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
    comentarios: (rawText || '').trim() ? `Solicitud ingresada por texto: ${(rawText || '').trim()}` : '',
    requiereCartaCompromiso,
    matchedFromHistory,
    hasConflict: !availabilityCheck.free,
    conflictDetails: availabilityCheck.reasons,
    suggestedFreeSpace: !availabilityCheck.free ? suggestedFreeSpace : undefined,
    detectedFields: ai ? [...new Set([...detectedFields, 'Analizado con IA'])] : detectedFields,
    parsingWarnings
  };
}
