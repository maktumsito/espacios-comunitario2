import { collection, doc, setDoc, deleteDoc, onSnapshot, Unsubscribe, query, limit } from 'firebase/firestore';
import { getDb } from '../firebase/config';
import { SpaceRating, Reservation } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { getAuthSessionToken } from './authService';
import { getLocalCache } from './reservationService';

// ==========================================
// CONSTANTS & CONFIGURATION
// ==========================================

const COLLECTION_NAME = 'calificaciones_espacios';
const LOCAL_STORAGE_KEY = 'espacios_calificaciones_cache_v1';
const AUTO_EMAIL_LOG_KEY = 'espacios_monday_email_sent_log_v1';
const PENDING_RATINGS_QUEUE_KEY = 'pending_ratings_sync_v1';

export const RECIPIENT_EMAILS: readonly string[] = Object.freeze([
  'cristianshute@gmail.com'
]);

const BIRTHDAY_KEYWORDS_REGEX = /(cumple|cumplea[nñ]os?|bday|fiesta infantil)/i;

// Offline retry queue helpers
export function getPendingRatingsQueue(): SpaceRating[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PENDING_RATINGS_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function enqueuePendingRating(rating: SpaceRating): void {
  if (typeof window === 'undefined') return;
  try {
    const queue = getPendingRatingsQueue().filter(r => r.id !== rating.id);
    queue.push(rating);
    localStorage.setItem(PENDING_RATINGS_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('Error enqueuing rating for retry:', e);
  }
}

export function dequeuePendingRating(ratingId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const queue = getPendingRatingsQueue().filter(r => r.id !== ratingId);
    localStorage.setItem(PENDING_RATINGS_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
}

export async function syncPendingRatingsQueue(): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;
  const queue = getPendingRatingsQueue();
  if (queue.length === 0) return;

  const db = getDb();
  const remaining: SpaceRating[] = [];

  for (const rating of queue) {
    try {
      const docRef = doc(db, COLLECTION_NAME, rating.id);
      await setDoc(docRef, rating, { merge: true });
    } catch (err) {
      console.warn(`Retry sync failed for rating ${rating.id}:`, err);
      remaining.push(rating);
    }
  }

  try {
    localStorage.setItem(PENDING_RATINGS_QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    // ignore
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPendingRatingsQueue().catch(() => {});
  });
}

// ==========================================
// INTERFACES & DOMAIN TYPES
// ==========================================

export interface RatingEligibilityResult {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface ResponsibleHistoryAlert {
  readonly hasHistory: boolean;
  readonly totalLoans: number;
  readonly averageRating: number;
  readonly hasCriticalIncidents: boolean;
  readonly incidents: readonly SpaceRating[];
  readonly warningMessage?: string;
}

export interface WeekendRatingsResult {
  readonly startDate: string;
  readonly endDate: string;
  readonly weekendRatings: readonly SpaceRating[];
}

export interface MondayEmailReport {
  readonly subject: string;
  readonly body: string;
  readonly mailtoUrl: string;
  readonly weekendCount: number;
  readonly birthdayCount: number;
  readonly incidentsCount: number;
}

export interface AutoTriggerPayload {
  readonly subject: string;
  readonly body: string;
  readonly count: number;
  readonly ratingsCount: number;
  readonly dateRange: string;
  readonly mailtoUrl: string;
  readonly recipients: readonly string[];
}

// ==========================================
// PURE DATE & DOMAIN UTILITIES
// ==========================================

/**
 * Formats a Date object as a local YYYY-MM-DD string without UTC timezone drift.
 */
export function formatToLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if a given YYYY-MM-DD date string represents a weekend day (Saturday or Sunday).
 */
export function isWeekend(dateStr: string): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;

  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;

  const d = new Date(year, month - 1, day);
  const dayOfWeek = d.getDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Rule: Exclude Municipal Activities and any loan mentioning 'CAM'
 * (e.g. Centro de Atención Municipal, actividades municipales) from birthday evaluations.
 */
export function isCamOrMunicipalActivity(r: Reservation): boolean {
  if (!r) return false;
  const desc = r.descripcion || '';
  const resp = r.responsable || '';
  const act = r.tipoActividad || '';
  const prest = r.tipoPrestamo || '';
  const comentarios = r.comentarios || '';

  // Exclude Municipal activities
  if (
    act.toUpperCase().includes('MUNICIPAL') ||
    prest.toUpperCase().includes('MUNICIPAL') ||
    desc.toUpperCase().includes('ACTIVIDAD MUNICIPAL') ||
    desc.toUpperCase().includes('ACTIVIDADES MUNICIPALES')
  ) {
    return true;
  }

  // Exclude CAM (case-insensitive word boundary or standalone acronym)
  const camRegex = /\bCAM\b/i;
  if (
    camRegex.test(desc) ||
    camRegex.test(resp) ||
    camRegex.test(act) ||
    camRegex.test(prest) ||
    camRegex.test(comentarios)
  ) {
    return true;
  }

  return false;
}

/**
 * Determines whether a reservation matches Birthday Loan criteria using optimized regex matching.
 * Excludes municipal activities and CAM loans.
 */
export function isBirthdayReservation(r: Reservation): boolean {
  if (!r) return false;
  if (isCamOrMunicipalActivity(r)) return false;

  const combinedText = `${r.descripcion || ''} ${r.tipoActividad || ''} ${r.tipoPrestamo || ''} ${r.comentarios || ''}`;
  return BIRTHDAY_KEYWORDS_REGEX.test(combinedText);
}

/**
 * Single source of truth: Only Birthday Loans are eligible for rating.
 * Excludes CAM loans and Municipal activities per business rules.
 */
export function isEligibleForRating(r: Reservation): boolean {
  if (isCamOrMunicipalActivity(r)) return false;
  return isBirthdayReservation(r);
}

/**
 * Returns the Sunday of the current week (YYYY-MM-DD) for a reference date.
 */
export function getCurrentWeekendEndStr(referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate);
  const day = d.getDay();
  const diffToSunday = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diffToSunday);
  return formatToLocalDateString(d);
}

/**
 * Validates whether a reservation can be rated at this moment.
 * Strictly prevents rating future events or events that have not concluded yet.
 */
export function isRatingAllowedForReservation(
  r: Reservation,
  referenceDate: Date = new Date()
): RatingEligibilityResult {
  if (!isEligibleForRating(r)) {
    return {
      allowed: false,
      reason: 'Esta actividad no corresponde a un préstamo de cumpleaños evaluable.'
    };
  }

  // Parse reservation date and end time
  const parts = (r.fecha || '').split('-');
  if (parts.length === 3) {
    const [year, month, day] = parts.map(Number);
    const timeParts = (r.horaFin || '23:59').split(':');
    const endH = parseInt(timeParts[0], 10) || 0;
    const endM = parseInt(timeParts[1], 10) || 0;

    const eventEndTime = new Date(year, month - 1, day, endH, endM, 0);

    // If the event hasn't finished yet compared to current reference time
    if (eventEndTime.getTime() > referenceDate.getTime()) {
      return {
        allowed: false,
        reason: `Bloqueo de seguridad: No es posible calificar un evento futuro o en desarrollo. La actividad finaliza a las ${r.horaFin || '23:59'} del ${formatDateDDMMYYYY(r.fecha)}. La evaluación se habilitará automáticamente una vez concluido el evento.`
      };
    }
  }

  return { allowed: true };
}

// ==========================================
// STORAGE & SYNCHRONIZATION SERVICE
// ==========================================

/**
 * Retrieves cached ratings from localStorage safely with error containment.
 */
export function getLocalRatingsCache(): SpaceRating[] {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return [];
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Unable to parse ratings from local cache:', e);
    return [];
  }
}

/**
 * Updates local cache storage.
 */
export function setLocalRatingsCache(ratings: readonly SpaceRating[]): void {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(ratings));
  } catch (e) {
    console.warn('Unable to persist ratings to local cache:', e);
  }
}

/**
 * Subscribes to Firestore collection updates while instantly emitting local cache (Stale-While-Revalidate).
 */
export function subscribeToRatings(
  onData: (ratings: SpaceRating[], isFromFirestore?: boolean) => void,
  onError: (error: unknown) => void
): Unsubscribe {
  // Step 1: Emit local cache immediately for instantaneous UI render
  const initial = getLocalRatingsCache();
  onData(initial, false);

  try {
    const db = getDb();
    const ratingsQuery = query(collection(db, COLLECTION_NAME), limit(150));

    return onSnapshot(
      ratingsQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const list: SpaceRating[] = snapshot.docs.map((docSnap) => ({
            ...(docSnap.data() as SpaceRating),
            id: docSnap.id
          }));

          // Sort descending by creation date
          list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

          setLocalRatingsCache(list);
          onData(list, true);
        } else {
          onData(getLocalRatingsCache(), true);
        }
      },
      (error) => {
        console.warn('Firestore ratings subscription notice:', error?.message || error);
        onError(error);
      }
    );
  } catch (err) {
    console.warn('Firestore unavailable, operating in local-first mode:', err);
    onError(err);
    return () => {};
  }
}

/**
 * Persists a rating immutably in local cache and Firestore.
 * Performs strict client and server-side validation against future event rating.
 */
export async function saveSpaceRating(rating: SpaceRating, reservation?: Reservation): Promise<void> {
  // Resolve reservation from cache if omitted by caller
  const targetReservation = reservation || getLocalCache().find((r) => r.id === rating.reservationId);

  // Perform strict client-side and server-side validation
  if (targetReservation) {
    const check = isRatingAllowedForReservation(targetReservation);
    if (!check.allowed) {
      throw new Error(check.reason || 'No está permitido calificar un evento antes de su término.');
    }

    // Call server endpoint for authoritative time validation
    try {
      const token = getAuthSessionToken();
      const response = await fetch('/api/ratings/validate-and-save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ rating, reservation: targetReservation })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Validación rechazada por el servidor (HTTP ${response.status}).`);
      }
    } catch (apiErr: any) {
      // Re-throw any server rejection or validation failure.
      // Only permit proceeding in local offline mode if device is truly offline.
      const isNetworkOffline = typeof navigator !== 'undefined' && (!navigator.onLine || apiErr instanceof TypeError);
      if (!isNetworkOffline) {
        throw apiErr;
      }
      console.warn('Backend validation deferred (device is offline):', apiErr);
    }
  }

  const current = getLocalRatingsCache();
  const existingIdx = current.findIndex(
    (r) => r.id === rating.id || r.reservationId === rating.reservationId
  );

  const updated =
    existingIdx >= 0
      ? current.map((item, idx) => (idx === existingIdx ? rating : item))
      : [rating, ...current];

  setLocalRatingsCache(updated);

  try {
    const db = getDb();
    const docRef = doc(db, COLLECTION_NAME, rating.id);
    await setDoc(docRef, rating, { merge: true });
    dequeuePendingRating(rating.id);
  } catch (err: any) {
    console.warn('Firestore persistence deferred; queued for automatic retry:', err);
    enqueuePendingRating(rating);
    // If online and rejected due to Firestore permissions or schema, notify caller
    if (typeof navigator !== 'undefined' && navigator.onLine && (err?.code === 'permission-denied' || err?.code === 'invalid-argument')) {
      throw err;
    }
  }
}

/**
 * Removes a rating from cache and Firestore.
 */
export async function deleteSpaceRating(ratingId: string): Promise<void> {
  const current = getLocalRatingsCache();
  const filtered = current.filter((r) => r.id !== ratingId);
  setLocalRatingsCache(filtered);

  try {
    const db = getDb();
    const docRef = doc(db, COLLECTION_NAME, ratingId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firestore deletion deferred; deleted locally:', err);
  }
}

// ==========================================
// BUSINESS INTELLIGENCE & HISTORY ALERTS
// ==========================================

/**
 * Searches applicant loan history and flags prior incidents in $O(N)$ single-pass time.
 */
export function getResponsibleHistoryAlert(
  responsable: string,
  telefono: string | undefined,
  ratings: readonly SpaceRating[]
): ResponsibleHistoryAlert {
  const cleanResp = (responsable || '').trim().toLowerCase();
  const cleanPhone = (telefono || '').replace(/\D/g, '');

  if (!cleanResp && !cleanPhone) {
    return {
      hasHistory: false,
      totalLoans: 0,
      averageRating: 0,
      hasCriticalIncidents: false,
      incidents: []
    };
  }

  const isLongName = cleanResp.length > 3;
  const isLongPhone = cleanPhone.length >= 8;

  const matched: SpaceRating[] = [];
  const incidents: SpaceRating[] = [];
  let scoreSum = 0;
  let ratedCount = 0;

  for (const r of ratings) {
    const rResp = (r.responsable || '').trim().toLowerCase();
    const rPhone = (r.telefonoContacto || '').replace(/\D/g, '');

    const matchName = isLongName && (rResp.includes(cleanResp) || cleanResp.includes(rResp));
    const matchPhone = isLongPhone && rPhone.length >= 8 && rPhone.includes(cleanPhone);

    if (matchName || matchPhone) {
      matched.push(r);
      const score = Number(r.puntajeGeneral);
      if (typeof score === 'number' && !isNaN(score) && score > 0) {
        scoreSum += score;
        ratedCount++;
      }

      if (r.huboDanos || r.dejoBasura || (typeof score === 'number' && score > 0 && score <= 2)) {
        incidents.push(r);
      }
    }
  }

  if (matched.length === 0) {
    return {
      hasHistory: false,
      totalLoans: 0,
      averageRating: 0,
      hasCriticalIncidents: false,
      incidents: []
    };
  }

  const avg = ratedCount > 0 ? scoreSum / ratedCount : 0;
  let warningMessage: string;

  if (incidents.length > 0) {
    warningMessage = `⚠️ ANTECEDENTES PREVIOS: Este solicitante tiene ${incidents.length} evaluación(es) con incidentes previos (daños, basura o bajo puntaje de ${avg.toFixed(1)}/5).`;
  } else if (avg >= 4) {
    warningMessage = `⭐ EXCELENTE HISTORIAL: Este solicitante cuenta con ${matched.length} préstamo(s) previos evaluados con promedio ${avg.toFixed(1)}/5.`;
  } else {
    warningMessage = `ℹ️ HISTORIAL: Cuenta con ${matched.length} préstamo(s) calificado(s) anteriormente con promedio ${avg.toFixed(1)}/5.`;
  }

  return {
    hasHistory: true,
    totalLoans: matched.length,
    averageRating: avg,
    hasCriticalIncidents: incidents.length > 0,
    incidents,
    warningMessage
  };
}

/**
 * Returns birthday ratings from the most recent weekend (Saturday & Sunday).
 */
export function getPastWeekendRatings(
  ratings: readonly SpaceRating[],
  referenceDate: Date = new Date()
): WeekendRatingsResult {
  const d = new Date(referenceDate);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, 6 = Saturday

  let diffToSat: number;
  if (day === 1) diffToSat = -2; // Monday -> past Sat
  else if (day === 0) diffToSat = -1; // Sunday -> past Sat
  else if (day === 6) diffToSat = 0; // Saturday -> today
  else diffToSat = -(day + 1); // Tue-Fri -> previous weekend

  const sat = new Date(d);
  sat.setDate(d.getDate() + diffToSat);

  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);

  const satStr = formatToLocalDateString(sat);
  const sunStr = formatToLocalDateString(sun);

  const weekendRatings = ratings.filter(
    (r) => (r.fecha === satStr || r.fecha === sunStr) && r.esCumpleanos
  );

  return {
    startDate: satStr,
    endDate: sunStr,
    weekendRatings
  };
}

/**
 * Formats and compiles the weekly executive email report.
 */
export function generateMondayEmailReport(
  ratings: readonly SpaceRating[],
  reservations: readonly Reservation[],
  referenceDate: Date = new Date()
): MondayEmailReport {
  const { startDate, endDate, weekendRatings } = getPastWeekendRatings(ratings, referenceDate);
  const birthdayRatings = weekendRatings.filter((r) => r.esCumpleanos);
  const incidents = birthdayRatings.filter(
    (r) => r.huboDanos || r.dejoBasura || r.puntajeGeneral <= 2
  );

  const subject = `Resumen Semanal de Evaluaciones - Préstamos Cumpleaños (${formatDateDDMMYYYY(startDate)} al ${formatDateDDMMYYYY(endDate)})`;

  const avgSatisfaction =
    birthdayRatings.length > 0
      ? `${(birthdayRatings.reduce((sum, r) => sum + r.puntajeGeneral, 0) / birthdayRatings.length).toFixed(1)} / 5.0`
      : 'Sin evaluaciones registradas';

  const bodySections: string[] = [
    `Estimados Cristian Shute y Pato Flores,\n`,
    `Adjuntamos el informe consolidado automático de evaluaciones sobre las actividades de PRÉSTAMOS DE CUMPLEAÑOS realizadas este fin de semana (${formatDateDDMMYYYY(startDate)} al ${formatDateDDMMYYYY(endDate)}).\n`,
    `========================================================`,
    `🎂 RESUMEN EJECUTIVO: PRÉSTAMOS DE CUMPLEAÑOS`,
    `========================================================`,
    `• Total préstamos de cumpleaños evaluados: ${birthdayRatings.length}`,
    `• Evaluaciones con incidentes o daños reportados: ${incidents.length}`,
    `• Promedio general de satisfacción: ${avgSatisfaction}\n`
  ];

  if (birthdayRatings.length === 0) {
    bodySections.push(
      `No se registraron evaluaciones de cumpleaños para el fin de semana indicado.\n`
    );
  } else {
    bodySections.push(
      `========================================================`,
      `📋 DETALLE DE EVALUACIONES DE CUMPLEAÑOS`,
      `========================================================\n`
    );

    birthdayRatings.forEach((r, idx) => {
      const details: string[] = [
        `${idx + 1}. [🎂 CUMPLEAÑOS] ${r.espacio.toUpperCase()} - ${formatDateDDMMYYYY(r.fecha)}`,
        `   • Actividad / Evento: ${r.tipoActividad}`,
        `   • Solicitante / Responsable: ${r.responsable} ${r.telefonoContacto ? `(Tel: ${r.telefonoContacto})` : ''}`,
        `   • Evaluado por: ${r.auxiliarName}`,
        `   • Calificación General: ${r.puntajeGeneral} / 5 ⭐`,
        `     - Limpieza y Entrega del Espacio: ${r.limpieza}/5`,
        `     - Puntualidad en el Horario: ${r.puntualidad}/5`,
        `     - Cuidado de Instalaciones y Mobiliario: ${r.cuidadoInstalaciones}/5`,
        `     - Comportamiento y Normas de Convivencia: ${r.comportamiento}/5`
      ];

      if (r.huboDanos) {
        details.push(`   ⚠️ DAÑOS REPORTADOS: ${r.detalleDanos || 'Sin detalle especificado'}`);
      }
      if (r.dejoBasura) {
        details.push(`   ⚠️ OBSERVACIÓN DE LIMPIEZA: Dejó basura acumulada o suciedad fuera de lugar.`);
      }
      if (r.excedioHorario) {
        details.push(`   ⚠️ TIEMPO: Se excedió en el horario de salida (${r.minutosExceso || 15} minutos).`);
      }
      if (r.observaciones) {
        details.push(`   • Observaciones de la Evaluación: "${r.observaciones}"`);
      }

      bodySections.push(details.join('\n') + '\n');
    });
  }

  bodySections.push(
    `========================================================`,
    `Sistema de Gestión y Control de Espacios Comunitarios`,
    `Corporación Municipal / Municipalidad de Las Condes`,
    `Destinatarios: ${RECIPIENT_EMAILS.join(', ')}\n`
  );

  const body = bodySections.join('\n');
  const mailtoUrl = `mailto:${RECIPIENT_EMAILS.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return {
    subject,
    body,
    mailtoUrl,
    weekendCount: birthdayRatings.length,
    birthdayCount: birthdayRatings.length,
    incidentsCount: incidents.length
  };
}

/**
 * Automates the dispatch trigger for the Monday morning report.
 */
export function checkAutomaticMondayEmail(
  ratings: readonly SpaceRating[],
  reservations: readonly Reservation[],
  onAutoTrigger?: (payload: AutoTriggerPayload) => void
): boolean {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return false;
    }
    const today = new Date();
    const isMonday = today.getDay() === 1;
    const todayStr = formatToLocalDateString(today);
    const lastSentDate = localStorage.getItem(AUTO_EMAIL_LOG_KEY);

    if (isMonday && lastSentDate !== todayStr) {
      const report = generateMondayEmailReport(ratings, reservations, today);

      if (report.weekendCount > 0 || report.birthdayCount > 0) {
        localStorage.setItem(AUTO_EMAIL_LOG_KEY, todayStr);
        if (onAutoTrigger) {
          onAutoTrigger({
            subject: report.subject,
            body: report.body,
            count: report.birthdayCount,
            ratingsCount: report.birthdayCount,
            dateRange: todayStr,
            mailtoUrl: report.mailtoUrl,
            recipients: RECIPIENT_EMAILS
          });
        }
        return true;
      }
    }
  } catch (err) {
    console.warn('Auto Monday email dispatch check error:', err);
  }
  return false;
}
