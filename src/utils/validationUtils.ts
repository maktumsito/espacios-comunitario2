import { sha256Sync } from './holidayUtils';

/**
 * Validation Utilities for Chilean RUT, Email, Dates, and Time ranges.
 */

// ==========================================
// 1. CHILEAN RUT VALIDATION (Módulo 11)
// ==========================================

export interface RutValidationResult {
  isValid: boolean;
  cleanRut: string;
  formatted: string;
  error?: string;
}

/**
 * Calculates verification digit (DV) using Modulo 11 algorithm.
 */
export function calculateRutDv(rutBody: number | string): string {
  const digits = String(rutBody).replace(/\D/g, '');
  let sum = 0;
  let multiplier = 2;

  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = sum % 11;
  const dv = 11 - remainder;

  if (dv === 11) return '0';
  if (dv === 10) return 'K';
  return String(dv);
}

/**
 * Formats a raw RUT string into the official Chilean standard: XX.XXX.XXX-Y
 */
export function formatRut(raw: string): string {
  if (!raw) return '';
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length === 0) return '';
  if (clean.length === 1) return clean;

  const dv = clean.slice(-1);
  const body = clean.slice(0, -1);

  let formattedBody = '';
  let count = 0;

  for (let i = body.length - 1; i >= 0; i--) {
    formattedBody = body[i] + formattedBody;
    count++;
    if (count % 3 === 0 && i > 0) {
      formattedBody = '.' + formattedBody;
    }
  }

  return `${formattedBody}-${dv}`;
}

/**
 * Validates a Chilean RUT with strict Modulo 11 check.
 * If empty and optional, consider calling with allowEmpty = true.
 */
export function validateRut(rut: string, allowEmpty = true): RutValidationResult {
  const trimmed = (rut || '').trim();
  if (!trimmed) {
    if (allowEmpty) {
      return { isValid: true, cleanRut: '', formatted: '' };
    }
    return { isValid: false, cleanRut: '', formatted: '', error: 'El R.U.T. es obligatorio.' };
  }

  const clean = trimmed.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 8 || clean.length > 9) {
    return {
      isValid: false,
      cleanRut: clean,
      formatted: trimmed,
      error: 'R.U.T. inválido: debe tener entre 7 y 8 dígitos más dígito verificador (Ej: 12.345.678-9).'
    };
  }

  const body = clean.slice(0, -1);
  const providedDv = clean.slice(-1);
  const expectedDv = calculateRutDv(body);

  if (providedDv !== expectedDv) {
    return {
      isValid: false,
      cleanRut: clean,
      formatted: formatRut(clean),
      error: `R.U.T. inválido: el dígito verificador ingresado (${providedDv}) no corresponde al número (debería ser ${expectedDv}).`
    };
  }

  return {
    isValid: true,
    cleanRut: clean,
    formatted: formatRut(clean)
  };
}

// ==========================================
// 2. EMAIL VALIDATION
// ==========================================

export interface EmailValidationResult {
  isValid: boolean;
  error?: string;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validates standard email address format.
 */
export function validateEmail(email: string, allowEmpty = true): EmailValidationResult {
  const trimmed = (email || '').trim();
  if (!trimmed) {
    if (allowEmpty) {
      return { isValid: true };
    }
    return { isValid: false, error: 'El correo electrónico es obligatorio.' };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return {
      isValid: false,
      error: 'Correo electrónico inválido (ej: nombre@dominio.cl).'
    };
  }

  return { isValid: true };
}

// ==========================================
// 2.1 CHILEAN PHONE VALIDATION
// ==========================================

export interface PhoneValidationResult {
  isValid: boolean;
  cleanPhone: string;
  error?: string;
}

/**
 * Validates Chilean phone numbers in real time.
 * Accepts mobile (+56 9 XXXX XXXX or 9XXXXXXXX) and landlines (+56 2 XXXXXXXX or 2XXXXXXXX).
 * Allows empty when optional (allowEmpty = true).
 */
export function validatePhone(phone: string, allowEmpty = true): PhoneValidationResult {
  const trimmed = (phone || '').trim();
  if (!trimmed) {
    if (allowEmpty) {
      return { isValid: true, cleanPhone: '' };
    }
    return { isValid: false, cleanPhone: '', error: 'El teléfono es obligatorio.' };
  }

  // Reject text containing letters or special characters (allowed: digits, spaces, hyphens, plus)
  if (/[a-zA-Z!$%^&*|~=`{}\[\]:";'<>?,\/\\#@]/.test(trimmed)) {
    return {
      isValid: false,
      cleanPhone: trimmed,
      error: 'Teléfono inválido: no debe contener letras ni símbolos especiales (ej: +56 9 1234 5678).'
    };
  }

  const cleanDigits = trimmed.replace(/\D/g, '');
  if (cleanDigits.length === 0) {
    return {
      isValid: false,
      cleanPhone: '',
      error: 'Ingrese un número telefónico válido (ej: +56 9 1234 5678).'
    };
  }

  // Check Chilean phone length:
  // With 56 prefix (11 digits: 569XXXXXXXX or 5622XXXXXX)
  if (cleanDigits.startsWith('56')) {
    const withoutCountry = cleanDigits.slice(2);
    if (withoutCountry.length < 8 || withoutCountry.length > 9) {
      return {
        isValid: false,
        cleanPhone: cleanDigits,
        error: `Teléfono inválido: con código +56 debe tener 8 o 9 dígitos (ingresados ${withoutCountry.length} dígitos tras el +56).`
      };
    }
  } else {
    // Without 56: 8 or 9 digits
    if (cleanDigits.length < 8 || cleanDigits.length > 9) {
      return {
        isValid: false,
        cleanPhone: cleanDigits,
        error: `Teléfono inválido: debe contener entre 8 y 9 dígitos numéricos (ingresados ${cleanDigits.length} dígitos).`
      };
    }
  }

  return {
    isValid: true,
    cleanPhone: cleanDigits
  };
}

/**
 * Normalizes any Chilean phone number into E.164 international format (+569XXXXXXXX or +56XXXXXXXX)
 */
export function formatPhoneToInternational(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('56')) {
    return `+${digits}`;
  }
  // Standard Chilean 8 or 9 digit number
  return `+56${digits}`;
}

/**
 * Generates a clean tel: protocol link for a phone number
 */
export function getPhoneTelLink(phone: string): string {
  const intl = formatPhoneToInternational(phone);
  return intl ? `tel:${intl}` : '#';
}

/**
 * Generates a clean WhatsApp link for a phone number
 */
export function getPhoneWhatsAppLink(phone: string, message?: string): string {
  const intl = formatPhoneToInternational(phone);
  if (!intl) return '#';
  const cleanNumber = intl.replace(/\+/g, '');
  const url = `https://wa.me/${cleanNumber}`;
  return message ? `${url}?text=${encodeURIComponent(message)}` : url;
}


// ==========================================
// 3. STRICT CALENDAR DATE VALIDATION
// ==========================================

export interface StrictDateValidationResult {
  isValid: boolean;
  date: Date | null;
  isoString: string; // YYYY-MM-DD
  error?: string;
}

/**
 * Checks if a given year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns exact days count for any month in a specific year.
 */
export function getDaysInMonth(year: number, month: number): number {
  switch (month) {
    case 1: case 3: case 5: case 7: case 8: case 10: case 12:
      return 31;
    case 4: case 6: case 9: case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Strictly parses and validates a calendar date (preventing JS Date rollover like Feb 30 -> Mar 2 or year 2202).
 * Supported formats: YYYY-MM-DD, DD-MM-YYYY or DD/MM/YYYY.
 */
export function validateStrictCalendarDate(
  dateInput: string,
  minYear = 2020,
  maxYear = 2035
): StrictDateValidationResult {
  if (!dateInput || typeof dateInput !== 'string') {
    return { isValid: false, date: null, isoString: '', error: 'Fecha no especificada.' };
  }

  const clean = dateInput.trim();
  let year = 0;
  let month = 0;
  let day = 0;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parts = clean.split('-').map(Number);
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/).map(Number);
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else {
    return {
      isValid: false,
      date: null,
      isoString: '',
      error: 'Formato de fecha inválido. Utilice formato DD/MM/AAAA o AAAA-MM-DD.'
    };
  }

  if (year < minYear || year > maxYear) {
    return {
      isValid: false,
      date: null,
      isoString: '',
      error: `Año ${year} fuera de rango. El sistema opera con fechas entre ${minYear} y ${maxYear}.`
    };
  }

  if (month < 1 || month > 12) {
    return {
      isValid: false,
      date: null,
      isoString: '',
      error: `Mes inválido (${month}). Debe estar entre 01 y 12.`
    };
  }

  const maxDays = getDaysInMonth(year, month);
  if (day < 1 || day > maxDays) {
    const monthNames = [
      '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    return {
      isValid: false,
      date: null,
      isoString: '',
      error: `Fecha inexistente: ${monthNames[month]} de ${year} solo tiene ${maxDays} días (se ingresó día ${day}).`
    };
  }

  const d = new Date(year, month - 1, day, 12, 0, 0);
  if (year < 100) d.setFullYear(year);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const iso = `${String(year).padStart(4, '0')}-${mm}-${dd}`;

  return {
    isValid: true,
    date: d,
    isoString: iso
  };
}

/**
 * Automatically adjusts day if user selects or enters a month with fewer days (e.g. 30 Feb -> 28 Feb).
 * Returns the corrected ISO date string and a flag indicating if it was adjusted.
 */
export function clampAndFixCalendarDate(
  dateInput: string
): { correctedIso: string; wasAdjusted: boolean; message?: string } {
  if (!dateInput || typeof dateInput !== 'string') {
    return { correctedIso: '', wasAdjusted: false };
  }

  const clean = dateInput.trim();
  let year = 0;
  let month = 0;
  let day = 0;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const parts = clean.split('-').map(Number);
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(clean)) {
    const parts = clean.split(/[-/]/).map(Number);
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else {
    return { correctedIso: clean, wasAdjusted: false };
  }

  if (month < 1 || month > 12 || year < 1 || year > 9999) {
    return { correctedIso: clean, wasAdjusted: false };
  }

  const maxDays = getDaysInMonth(year, month);
  if (day > maxDays) {
    const monthNames = [
      '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    const mm = String(month).padStart(2, '0');
    const dd = String(maxDays).padStart(2, '0');
    return {
      correctedIso: `${String(year).padStart(4, '0')}-${mm}-${dd}`,
      wasAdjusted: true,
      message: `El mes de ${monthNames[month]} solo tiene ${maxDays} días. Se ajustó automáticamente al día ${maxDays}.`
    };
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    correctedIso: `${String(year).padStart(4, '0')}-${mm}-${dd}`,
    wasAdjusted: false
  };
}

// ==========================================
// 4. TIME RANGE VALIDATION
// ==========================================

export interface TimeRangeValidationResult {
  isValid: boolean;
  startMinutes: number;
  endMinutes: number;
  durationMinutes: number;
  error?: string;
}

/**
 * Converts HH:MM time string to minutes from midnight.
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return -1;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Validates that End Time is valid. If terminaDiaSiguiente is true, end time can cross midnight into next day.
 */
export function validateTimeRange(
  horaInicio: string,
  horaFin: string,
  terminaDiaSiguiente = false
): TimeRangeValidationResult {
  const startMinutes = timeStringToMinutes(horaInicio);
  const endMinutes = timeStringToMinutes(horaFin);

  if (startMinutes < 0 || endMinutes < 0) {
    return {
      isValid: false,
      startMinutes,
      endMinutes,
      durationMinutes: 0,
      error: 'Formato de hora inválido.'
    };
  }

  // Only crosses midnight if explicitly flagged with terminaDiaSiguiente
  const isOvernight = Boolean(terminaDiaSiguiente);

  if (isOvernight) {
    // Crosses midnight: starts on day 1, ends on day 2
    // E.g. 23:30 (1410 min) to 00:30 (30 min) -> (1440 - 1410) + 30 = 60 minutes
    const duration = (1440 - startMinutes) + endMinutes;
    if (duration <= 0) {
      return {
        isValid: false,
        startMinutes,
        endMinutes,
        durationMinutes: 0,
        error: 'La duración total debe ser mayor a 0 minutos.'
      };
    }
    if (duration > 24 * 60) {
      return {
        isValid: false,
        startMinutes,
        endMinutes,
        durationMinutes: duration,
        error: 'Una reserva continua no puede exceder 24 horas.'
      };
    }
    return {
      isValid: true,
      startMinutes,
      endMinutes,
      durationMinutes: duration
    };
  }

  if (endMinutes <= startMinutes) {
    return {
      isValid: false,
      startMinutes,
      endMinutes,
      durationMinutes: endMinutes - startMinutes,
      error: `La hora de término (${horaFin}) debe ser posterior a la de inicio (${horaInicio}).`
    };
  }

  return {
    isValid: true,
    startMinutes,
    endMinutes,
    durationMinutes: endMinutes - startMinutes
  };
}

// ==========================================
// 4.1 LOAN SCHEDULE OPERATING LIMITS (08:30 - 22:00)
// ==========================================

export const REGULAR_LOAN_START_MINUTES = 8 * 60 + 30; // 08:30 (510 minutes)
export const REGULAR_LOAN_END_MINUTES = 22 * 60; // 22:00 (1320 minutes)
export const EXTENSION_AUTH_SHA256 = 'f239f9cbb8caf3208b86af88b7fa279271b1a65d4c936ad6312c67044bcac4ed';
export const EXTENSION_AUTH_KEY = 'ccd2026';

/**
 * Validates whether an authorization key matches the extended schedule authorization rule via one-way SHA-256 hash.
 */
export function verifyExtensionAuthKey(inputKey: string): boolean {
  if (!inputKey) return false;
  return sha256Sync(inputKey.trim().toLowerCase()) === EXTENSION_AUTH_SHA256;
}

export interface LoanScheduleLimitResult {
  isOutsideRegularHours: boolean;
  requiresAuthorization: boolean;
  reason?: string;
}

/**
 * Checks whether a reservation exceeds regular operating hours (08:30 - 22:00, Monday to Sunday).
 * Requires authorization key 'ccd2026' and admin/coordinator profile when outside regular hours.
 */
export function checkLoanScheduleLimit(
  horaInicio: string,
  horaFin: string,
  terminaDiaSiguiente = false
): LoanScheduleLimitResult {
  const startMinutes = timeStringToMinutes(horaInicio);
  const endMinutes = timeStringToMinutes(horaFin);

  if (startMinutes < 0 || endMinutes < 0) {
    return { isOutsideRegularHours: false, requiresAuthorization: false };
  }

  // Crosses midnight if end time is before start time (e.g. 22:00 to 01:00 or 23:30 to 00:30)
  // or explicitly flagged as terminaDiaSiguiente (only applicable if start is late afternoon/evening or crosses midnight)
  const isOvernight =
    (endMinutes <= startMinutes && endMinutes > 0 && startMinutes >= 18 * 60) ||
    (terminaDiaSiguiente && (endMinutes <= startMinutes || startMinutes >= 20 * 60));

  const startsBefore = startMinutes < REGULAR_LOAN_START_MINUTES;
  const endsAfter = isOvernight || endMinutes > REGULAR_LOAN_END_MINUTES || startMinutes >= REGULAR_LOAN_END_MINUTES;

  if (startsBefore || endsAfter) {
    let reason = '';
    if (isOvernight) {
      reason = `Horario nocturno que cruza medianoche y finaliza a las ${horaFin} hrs del día siguiente.`;
    } else if (startsBefore && endsAfter) {
      reason = `Inicia antes de las 08:30 (${horaInicio} hrs) y finaliza fuera de horario regular (${horaFin} hrs).`;
    } else if (startsBefore) {
      reason = `Inicia a las ${horaInicio} hrs (antes del horario normal de las 08:30 hrs).`;
    } else {
      reason = `Finaliza a las ${horaFin} hrs (después del horario normal de las 22:00 hrs).`;
    }

    return {
      isOutsideRegularHours: true,
      requiresAuthorization: true,
      reason
    };
  }

  return {
    isOutsideRegularHours: false,
    requiresAuthorization: false
  };
}

// ==========================================
// 5. ACTIVITY NAME / DESCRIPTION VALIDATION
// ==========================================

export interface ActivityDescriptionValidationResult {
  isValid: boolean;
  sanitized: string;
  charCount: number;
  maxChars: number;
  error?: string;
  warning?: string;
}

export const MAX_ACTIVITY_DESCRIPTION_LENGTH = 250;

/**
 * Validates and sanitizes activity title/description with character counter and safe string cleaning.
 */
export function validateActivityDescription(
  value: string | undefined | null,
  maxChars = MAX_ACTIVITY_DESCRIPTION_LENGTH
): ActivityDescriptionValidationResult {
  const str = (value || '').trim();
  const charCount = (value || '').length;

  if (!str) {
    return {
      isValid: false,
      sanitized: '',
      charCount: 0,
      maxChars,
      error: 'El nombre de la actividad o evento es obligatorio.'
    };
  }

  if (charCount > maxChars) {
    return {
      isValid: false,
      sanitized: value || '',
      charCount,
      maxChars,
      error: `El nombre de la actividad supera el límite máximo permitido (${charCount}/${maxChars} caracteres). Por favor resúmelo.`
    };
  }

  return {
    isValid: true,
    sanitized: value || '',
    charCount,
    maxChars
  };
}

// ==========================================
// 6. RECOMMENDED SPACE CAPACITY WARNINGS
// ==========================================

export const RECOMMENDED_SPACE_CAPACITIES: Record<string, number> = Object.freeze({
  'AUDITORIO': 150,
  'GIMNASIO': 70,
  'SALA 6': 70,
  'SALA 3': 30,
  'SALA 2': 20,
  'SALA 4': 20,
  'SALA 5': 15,
  'SALA DE ESPEJOS': 35,
  'TATAMI': 25,
  'BIBLIOTECA': 20,
  'PATIO EXTERIOR': 60,
  'COCINA': 15,
  'MULTICANCHA': 80,
  'BOX 1': 8
});

export function getRecommendedSpaceCapacity(spaceName: string, customSpaces?: { name?: string; id?: string; capacity?: number }[]): number {
  if (!spaceName) return 30;
  const clean = spaceName.trim().toUpperCase();

  if (customSpaces && customSpaces.length > 0) {
    const found = customSpaces.find(
      s => s.name?.trim().toUpperCase() === clean || s.id?.trim().toUpperCase() === clean
    );
    if (found && typeof found.capacity === 'number' && found.capacity > 0) {
      return found.capacity;
    }
  }

  return RECOMMENDED_SPACE_CAPACITIES[clean] || 30;
}

export interface SpaceCapacityWarningResult {
  hasWarning: boolean;
  recommendedCapacity: number;
  requestedCount: number;
  message?: string;
}

/**
 * Checks if requested participants exceed recommended room capacity (non-blocking warning).
 */
export function checkSpaceCapacityWarning(
  spaceName: string,
  participants: number | undefined | null,
  customSpaces?: { name?: string; id?: string; capacity?: number }[]
): SpaceCapacityWarningResult {
  const requested = Number(participants) || 0;
  const capacity = getRecommendedSpaceCapacity(spaceName, customSpaces);

  if (requested > capacity) {
    return {
      hasWarning: true,
      recommendedCapacity: capacity,
      requestedCount: requested,
      message: `Aviso de aforo sugerido: ${spaceName} tiene una capacidad recomendada de ${capacity} personas (has indicado ${requested}). Puedes continuar con la reserva.`
    };
  }

  return {
    hasWarning: false,
    recommendedCapacity: capacity,
    requestedCount: requested
  };
}

// ==========================================
// 8. CHILEAN PHONE NUMBER VALIDATION
// ==========================================

export interface ChileanPhoneValidationResult {
  isValid: boolean;
  raw: string;
  cleanDigits: string; // 9 digits (e.g. 912345678)
  formatted: string; // e.g. "+56 9 1234 5678"
  telUrl: string; // e.g. "tel:+56912345678"
  whatsappUrl: string; // e.g. "https://wa.me/56912345678"
  error?: string;
}

/**
 * Validates and formats Chilean phone numbers for reliable tel: and WhatsApp wa.me links.
 * Handles +56 9, 569, 9XXXXXXXX, and legacy 8-digit mobile numbers.
 */
export function validateAndFormatChileanPhone(rawPhone?: string): ChileanPhoneValidationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      isValid: false,
      raw: '',
      cleanDigits: '',
      formatted: '',
      telUrl: '',
      whatsappUrl: '',
      error: 'Número de teléfono no ingresado'
    };
  }

  const raw = rawPhone.trim();
  let digits = raw.replace(/\D/g, '');

  // Strip international country code prefix (56) if present
  if (digits.startsWith('56')) {
    digits = digits.slice(2);
  }

  // Auto-upgrade legacy 8-digit Chilean mobile number to 9 digits (prepending 9)
  if (digits.length === 8) {
    digits = `9${digits}`;
  }

  // Valid Chilean numbers must have exactly 9 digits
  if (digits.length !== 9) {
    return {
      isValid: false,
      raw,
      cleanDigits: digits,
      formatted: raw,
      telUrl: '',
      whatsappUrl: '',
      error: 'Teléfono incompleto o inválido (debe tener 9 dígitos, ej: +56 9 1234 5678)'
    };
  }

  const fullInternational = `56${digits}`;
  const formatted = `+56 9 ${digits.slice(1, 5)} ${digits.slice(5)}`;
  const telUrl = `tel:+${fullInternational}`;
  const whatsappUrl = `https://wa.me/${fullInternational}`;

  return {
    isValid: true,
    raw,
    cleanDigits: digits,
    formatted,
    telUrl,
    whatsappUrl
  };
}

