/**
 * Chilean Holidays (Feriados Nacionales de Chile) Utility Engine
 *
 * Implements deterministic calculation for official Chilean national holidays
 * (civil, religious, Fiestas Patrias, and non-waivable laws 19.668, 20.215, 20.299 and 21.357).
 */

// ==========================================
// TYPES & CONSTANTS
// ==========================================

export type HolidayClassification = 'civil' | 'religioso' | 'irrenunciable' | 'patrio';

export interface ChileanHoliday {
  readonly date: string; // 'yyyy-MM-dd'
  readonly name: string;
  readonly type: HolidayClassification;
  readonly isIrrenunciable: boolean;
  readonly description?: string;
}

// SHA-256 hash of the authorized holiday override key (avoids storing key in plaintext)
const HOLIDAY_OVERRIDE_SHA256 = '66dfd0071d636ea2ae067345ef9f1c816baa45f411800f36a6c29eee4ce7aa8f';

/**
 * Standard synchronous SHA-256 implementation to verify authorization keys without plain text secrets
 */
export function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i, j;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  let hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, boolean> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0);
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const a = hash[0], e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0, a, hash[1], hash[2], (hash[3] + temp1) | 0, hash[4], hash[5], hash[6]];
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }
  return result;
}

// Day of week integer indexes (0 = Sunday, 6 = Saturday)
const SUNDAY_INDEX = 0;
const TUESDAY_INDEX = 2;
const WEDNESDAY_INDEX = 3;
const THURSDAY_INDEX = 4;
const FRIDAY_INDEX = 5;

// ==========================================
// CORE DATE FORMATTERS & COMPUTUS
// ==========================================

/**
 * Validates whether an authorization key matches the holiday override rule via one-way SHA-256 hash.
 */
export function verifyHolidayOverrideKey(inputKey: string): boolean {
  if (!inputKey) {
    return false;
  }
  const clean = inputKey.trim().toUpperCase();
  return sha256Sync(clean) === HOLIDAY_OVERRIDE_SHA256;
}

/**
 * Anonymous Gregorian Computus algorithm (Meeus/Jones/Butcher) to calculate Easter Sunday.
 */
function calculateEasterSunday(year: number): { month: number; day: number } {
  const goldenNumber = year % 19;
  const century = Math.floor(year / 100);
  const yearWithinCentury = year % 100;
  const leapCentury = Math.floor(century / 4);
  const nonLeapCenturyRemainder = century % 4;
  const lunarCorrection = Math.floor((century + 8) / 25);
  const solarCorrection = Math.floor((century - lunarCorrection + 1) / 3);
  const epact = (19 * goldenNumber + century - leapCentury - solarCorrection + 15) % 30;
  const leapYearWithinCentury = Math.floor(yearWithinCentury / 4);
  const leapYearRemainder = yearWithinCentury % 4;
  const weekdayIndex = (32 + 2 * nonLeapCenturyRemainder + 2 * leapYearWithinCentury - epact - leapYearRemainder) % 7;
  const fullMoonCorrection = Math.floor((goldenNumber + 11 * epact + 22 * weekdayIndex) / 451);
  const month = Math.floor((epact + weekdayIndex - 7 * fullMoonCorrection + 114) / 31);
  const day = ((epact + weekdayIndex - 7 * fullMoonCorrection + 114) % 31) + 1;

  return { month, day };
}

/**
 * Formats year, month (1-12) and day (1-31) into 'yyyy-MM-dd'.
 */
function formatIsoDate(year: number, month: number, day: number): string {
  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  return `${year}-${paddedMonth}-${paddedDay}`;
}

/**
 * Shifts floating holidays that land on Tuesday, Wednesday, or Thursday to Monday of the same week,
 * or Friday to Monday of the following week (Law 19.668).
 */
function calculateMovedMondayDate(year: number, month: number, day: number): string {
  const baseDate = new Date(year, month - 1, day);
  const dayOfWeek = baseDate.getDay();

  if (dayOfWeek === TUESDAY_INDEX) {
    const movedDate = new Date(year, month - 1, day - 1);
    return formatIsoDate(movedDate.getFullYear(), movedDate.getMonth() + 1, movedDate.getDate());
  }

  if (dayOfWeek === WEDNESDAY_INDEX) {
    const movedDate = new Date(year, month - 1, day - 2);
    return formatIsoDate(movedDate.getFullYear(), movedDate.getMonth() + 1, movedDate.getDate());
  }

  if (dayOfWeek === THURSDAY_INDEX) {
    const movedDate = new Date(year, month - 1, day - 3);
    return formatIsoDate(movedDate.getFullYear(), movedDate.getMonth() + 1, movedDate.getDate());
  }

  if (dayOfWeek === FRIDAY_INDEX) {
    const movedDate = new Date(year, month - 1, day + 3);
    return formatIsoDate(movedDate.getFullYear(), movedDate.getMonth() + 1, movedDate.getDate());
  }

  return formatIsoDate(year, month, day);
}

// ==========================================
// ANNUAL HOLIDAY GENERATION
// ==========================================

/**
 * Computes the complete list of Chilean national holidays for a given year.
 */
export function getChileanHolidays(year: number): ChileanHoliday[] {
  const holidays: ChileanHoliday[] = [];

  // 1. Año Nuevo (01 de Enero - Irrenunciable)
  holidays.push({
    date: formatIsoDate(year, 1, 1),
    name: 'Año Nuevo',
    type: 'irrenunciable',
    isIrrenunciable: true,
    description: 'Feriado Civil e Irrenunciable'
  });

  // Ley 20.983: Feriado adicional 2 de enero si el 1 cae en domingo
  const isJanFirstSunday = new Date(year, 0, 1).getDay() === SUNDAY_INDEX;
  if (isJanFirstSunday) {
    holidays.push({
      date: formatIsoDate(year, 1, 2),
      name: 'Feriado Adicional de Año Nuevo',
      type: 'civil',
      isIrrenunciable: false,
      description: 'Feriado por Ley 20.983'
    });
  }

  // 2. Semana Santa (Viernes Santo y Sábado Santo)
  const easter = calculateEasterSunday(year);
  const easterDate = new Date(year, easter.month - 1, easter.day);

  const goodFriday = new Date(easterDate);
  goodFriday.setDate(easterDate.getDate() - 2);
  holidays.push({
    date: formatIsoDate(goodFriday.getFullYear(), goodFriday.getMonth() + 1, goodFriday.getDate()),
    name: 'Viernes Santo',
    type: 'religioso',
    isIrrenunciable: false,
    description: 'Semana Santa'
  });

  const holySaturday = new Date(easterDate);
  holySaturday.setDate(easterDate.getDate() - 1);
  holidays.push({
    date: formatIsoDate(holySaturday.getFullYear(), holySaturday.getMonth() + 1, holySaturday.getDate()),
    name: 'Sábado Santo',
    type: 'religioso',
    isIrrenunciable: false,
    description: 'Semana Santa'
  });

  // 3. Día Nacional del Trabajo (01 de Mayo - Irrenunciable)
  holidays.push({
    date: formatIsoDate(year, 5, 1),
    name: 'Día Nacional del Trabajo',
    type: 'irrenunciable',
    isIrrenunciable: true,
    description: 'Feriado Civil e Irrenunciable'
  });

  // 4. Día de las Glorias Navales (21 de Mayo)
  holidays.push({
    date: formatIsoDate(year, 5, 21),
    name: 'Día de las Glorias Navales',
    type: 'civil',
    isIrrenunciable: false,
    description: 'Conmemoración del Combate Naval de Iquique'
  });

  // 5. Día Nacional de los Pueblos Indígenas (Ley 21.357 - Solsticio de invierno según SHOA en hora oficial de Chile)
  const solsticeJune20Years = new Set([2024, 2025, 2028, 2029, 2032, 2033, 2036, 2037]);
  const solsticeDay = solsticeJune20Years.has(year) ? 20 : 21;
  holidays.push({
    date: formatIsoDate(year, 6, solsticeDay),
    name: 'Día Nacional de los Pueblos Indígenas',
    type: 'civil',
    isIrrenunciable: false,
    description: 'Solsticio de Invierno / We Tripantu'
  });

  // 6. San Pedro y San Pablo (29 de Junio - Ley 19.668)
  holidays.push({
    date: calculateMovedMondayDate(year, 6, 29),
    name: 'San Pedro y San Pablo',
    type: 'religioso',
    isIrrenunciable: false,
    description: 'Feriado Religioso'
  });

  // 7. Día de la Virgen del Carmen (16 de Julio)
  holidays.push({
    date: formatIsoDate(year, 7, 16),
    name: 'Día de la Virgen del Carmen',
    type: 'religioso',
    isIrrenunciable: false,
    description: 'Reina y Patrona de Chile'
  });

  // 8. Asunción de la Virgen (15 de Agosto)
  holidays.push({
    date: formatIsoDate(year, 8, 15),
    name: 'Asunción de la Virgen',
    type: 'religioso',
    isIrrenunciable: false,
    description: 'Feriado Religioso'
  });

  // 9. Fiestas Patrias (18 y 19 de Septiembre - Irrenunciables)
  holidays.push({
    date: formatIsoDate(year, 9, 18),
    name: 'Fiestas Patrias: Independencia Nacional',
    type: 'irrenunciable',
    isIrrenunciable: true,
    description: 'Conmemoración de la Primera Junta Nacional de Gobierno'
  });

  holidays.push({
    date: formatIsoDate(year, 9, 19),
    name: 'Día de las Glorias del Ejército',
    type: 'irrenunciable',
    isIrrenunciable: true,
    description: 'Celebración de las Glorias del Ejército de Chile'
  });

  // Ley 20.215: Feriados adicionales para Fiestas Patrias
  const sep18Weekday = new Date(year, 8, 18).getDay();
  if (sep18Weekday === TUESDAY_INDEX) {
    holidays.push({
      date: formatIsoDate(year, 9, 17),
      name: 'Feriado Adicional Fiestas Patrias',
      type: 'patrio',
      isIrrenunciable: false,
      description: 'Feriado Ley 20.215'
    });
  } else if (sep18Weekday === WEDNESDAY_INDEX) {
    holidays.push({
      date: formatIsoDate(year, 9, 20),
      name: 'Feriado Adicional Fiestas Patrias',
      type: 'patrio',
      isIrrenunciable: false,
      description: 'Feriado Ley 20.215'
    });
  }

  // 10. Encuentro de Dos Mundos (12 de Octubre - Ley 19.668)
  holidays.push({
    date: calculateMovedMondayDate(year, 10, 12),
    name: 'Encuentro de Dos Mundos',
    type: 'civil',
    isIrrenunciable: false,
    description: 'Feriado Civil'
  });

  // 11. Día Nacional de las Iglesias Evangélicas (31 de Octubre - Ley 20.299)
  const oct31Weekday = new Date(year, 9, 31).getDay();
  let evangelicalHolidayDate = formatIsoDate(year, 10, 31);
  if (oct31Weekday === TUESDAY_INDEX) {
    evangelicalHolidayDate = formatIsoDate(year, 10, 27);
  } else if (oct31Weekday === WEDNESDAY_INDEX) {
    evangelicalHolidayDate = formatIsoDate(year, 11, 2);
  }

  holidays.push({
    date: evangelicalHolidayDate,
    name: 'Día Nacional de las Iglesias Evangélicas',
    type: 'religioso',
    isIrrenunciable: false,
    description: 'Feriado Religioso Ley 20.299'
  });

  // 12. Día de Todos los Santos (01 de Noviembre)
  holidays.push({
    date: formatIsoDate(year, 11, 1),
    name: 'Día de Todos los Santos',
    type: 'religioso',
    isIrrenunciable: false,
    description: 'Feriado Religioso'
  });

  // 13. Inmaculada Concepción (08 de Diciembre)
  holidays.push({
    date: formatIsoDate(year, 12, 8),
    name: 'Inmaculada Concepción',
    type: 'religioso',
    isIrrenunciable: false,
    description: 'Feriado Religioso'
  });

  // 14. Navidad (25 de Diciembre - Irrenunciable)
  holidays.push({
    date: formatIsoDate(year, 12, 25),
    name: 'Navidad',
    type: 'irrenunciable',
    isIrrenunciable: true,
    description: 'Natividad del Señor'
  });

  return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

// In-memory memoization cache for calculated years
const holidayMapByYearCache = new Map<number, Readonly<Record<string, ChileanHoliday>>>();

/**
 * Returns an indexed map of holidays by 'yyyy-MM-dd' for a given year.
 */
export function getChileanHolidayMap(year: number): Readonly<Record<string, ChileanHoliday>> {
  const cachedMap = holidayMapByYearCache.get(year);
  if (cachedMap) {
    return cachedMap;
  }

  const holidaysList = getChileanHolidays(year);
  const holidayMap: Record<string, ChileanHoliday> = {};

  for (const holiday of holidaysList) {
    holidayMap[holiday.date] = holiday;
  }

  holidayMapByYearCache.set(year, Object.freeze(holidayMap));
  return holidayMap;
}

/**
 * Normalizes input date to 'yyyy-MM-dd' format safely.
 */
function extractIsoDateString(dateInput: string | Date | null | undefined): string | null {
  if (!dateInput) {
    return null;
  }

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) {
      return null;
    }
    return formatIsoDate(dateInput.getFullYear(), dateInput.getMonth() + 1, dateInput.getDate());
  }

  const dateSegment = String(dateInput).split('T')[0].trim();
  const segments = dateSegment.split('-');

  if (segments.length !== 3) {
    return null;
  }

  return dateSegment;
}

/**
 * Checks whether a given date is an official Chilean national holiday.
 */
export function isChileanHoliday(dateInput: string | Date | null | undefined): boolean {
  return Boolean(getChileanHolidayInfo(dateInput));
}

/**
 * Retrieves holiday metadata for a given date, or null if it is a regular business day.
 */
export function getChileanHolidayInfo(dateInput: string | Date | null | undefined): ChileanHoliday | null {
  const isoDateString = extractIsoDateString(dateInput);
  if (!isoDateString) {
    return null;
  }

  const year = parseInt(isoDateString.split('-')[0], 10);
  if (isNaN(year)) {
    return null;
  }

  const holidayMap = getChileanHolidayMap(year);
  return holidayMap[isoDateString] || null;
}

export interface HolidayFilterResult {
  readonly validDates: readonly string[];
  readonly omittedHolidays: readonly { readonly date: string; readonly holiday: ChileanHoliday }[];
}

/**
 * Filters a list of dates, omitting official Chilean holidays.
 */
export function filterOutChileanHolidays(dates: readonly string[]): HolidayFilterResult {
  const validDates: string[] = [];
  const omittedHolidays: { date: string; holiday: ChileanHoliday }[] = [];

  for (const date of dates) {
    const holiday = getChileanHolidayInfo(date);
    if (holiday) {
      omittedHolidays.push({ date, holiday });
    } else {
      validDates.push(date);
    }
  }

  return { validDates, omittedHolidays };
}
