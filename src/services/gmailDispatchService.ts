import { formatDisplayTitle } from '../utils/reservationVisuals';
import { gmailServerRequest, waitForGmailPopup, type GmailServerStatus } from './gmailConnectionClient';
import { filterDatesToDispatchWeek, isDispatchLoan } from '../utils/activityDispatchSelection';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User, signOut } from 'firebase/auth';
import { getFirebaseAuth, getDb } from '../firebase/config';
import { doc, getDoc, setDoc } from '../firebase/gateway';
import { format, parseISO, addDays, isAfter, getDay, addMonths, nextSaturday, nextSunday, isSaturday, isSunday } from 'date-fns';
import { es } from 'date-fns/locale';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const DEFAULT_GMAIL_SENDER = 'cristianshute@gmail.com';
const GMAIL_CONFIG_DOC_ID = 'gmail_dispatch_config';
const CONFIG_COLLECTION = 'configuracion_sistema';

/**
 * Calculates the next or upcoming Saturday date formatted as YYYY-MM-DD.
 * If forceNextWeek is false and today is Saturday, returns today.
 * If forceNextWeek is true, returns the following Saturday.
 */
export function getUpcomingSaturdayDate(forceNextWeek = false): string {
  const today = new Date();
  if (isSaturday(today) && !forceNextWeek) {
    return format(today, 'yyyy-MM-dd');
  }
  return format(nextSaturday(today), 'yyyy-MM-dd');
}

/**
 * Calculates the next or upcoming Sunday date formatted as YYYY-MM-DD.
 * If forceNextWeek is false and today is Sunday, returns today.
 * If forceNextWeek is true, returns the following Sunday.
 */
export function getUpcomingSundayDate(forceNextWeek = false): string {
  const today = new Date();
  if (isSunday(today) && !forceNextWeek) {
    return format(today, 'yyyy-MM-dd');
  }
  return format(nextSunday(today), 'yyyy-MM-dd');
}

/**
 * Calculates the dates for the upcoming weekend (Saturday and Sunday).
 */
export function getUpcomingWeekendDate(): { saturday: string; sunday: string } {
  const sat = getUpcomingSaturdayDate(false);
  const sun = format(addDays(parseISO(sat), 1), 'yyyy-MM-dd');
  return { saturday: sat, sunday: sun };
}

export interface GoogleAuthUserInfo {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  uid: string;
}

// In-memory access token cache according to Workspace integration security rules
// (NEVER persisted in localStorage or sessionStorage)
let inMemoryAccessToken: string | null = null;
let currentGoogleUser: GoogleAuthUserInfo | null = null;
let serverConnection: GmailServerStatus | null = null;
let restoringConnection: Promise<void> | null = null;
let tokenExpiresAt = 0;
let connectionGeneration = 0;

export function isPersistentGmailConnection(): boolean {
  return serverConnection?.persistent === true;
}

export function isGmailConnected(): boolean {
  return Boolean(getGmailAccessToken()) || serverConnection?.connected === true;
}

export async function restoreGmailConnection(): Promise<void> {
  if (restoringConnection) return restoringConnection;
  const generation = connectionGeneration;
  restoringConnection = (async () => {
    try {
      const recovered = await gmailServerRequest('gmail/status');
      if (generation !== connectionGeneration) return;
      serverConnection = recovered;
      notifyAuthListeners();
    } catch { /* Temporary network failure does not revoke an existing authorization. */ }
  })();
  try { await restoringConnection; }
  finally { restoringConnection = null; }
}

// Auth state listeners
export type AuthStateCallback = (user: GoogleAuthUserInfo | null, token: string | null, serverConnected?: boolean, persistent?: boolean) => void;
const authListeners: Set<AuthStateCallback> = new Set();

/**
 * Subscribes to Gmail OAuth state changes
 */
export function subscribeGmailAuthState(callback: AuthStateCallback): () => void {
  authListeners.add(callback);
  // Emit current state immediately
  callback(getCurrentGoogleUser(), getGmailAccessToken(), serverConnection?.connected === true, isPersistentGmailConnection());
  return () => {
    authListeners.delete(callback);
  };
}

function notifyAuthListeners() {
  authListeners.forEach(cb => cb(getCurrentGoogleUser(), getGmailAccessToken(), serverConnection?.connected === true, isPersistentGmailConnection()));
}

/**
 * Initializes the Firebase Auth listener for Google authentication
 */
export function initGmailAuthListener(): () => void {
  const auth = getFirebaseAuth();
  void restoreGmailConnection();
  const refresh = () => { void restoreGmailConnection(); };
  window.addEventListener('focus', refresh);
  const interval = setInterval(refresh, 60_000);
  const unsubscribe = onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      currentGoogleUser = {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        uid: user.uid
      };
    } else {
      currentGoogleUser = null;
      inMemoryAccessToken = null;
    }
    notifyAuthListeners();
  });
  return () => {
    unsubscribe();
    window.removeEventListener('focus', refresh);
    clearInterval(interval);
  };
}

/**
 * Triggers interactive Google Sign-In with Gmail Send scope.
 * Pre-fills login hint for cristianshute@gmail.com.
 */
export async function connectGoogleGmailAccount(loginHint: string = DEFAULT_GMAIL_SENDER): Promise<{
  user: { email: string | null; displayName: string | null };
  accessToken: string;
}> {
  // Reserve the OAuth window during the click, before any asynchronous work.
  const popup = serverConnection?.oauthConfigured !== false ? window.open('about:blank', 'diaguitas-gmail', 'width=520,height=680') : null;
  await restoreGmailConnection();
  if (serverConnection?.oauthConfigured) {
    if (!popup) throw new Error('Permite la ventana de Google para conectar Gmail.');
    try {
      const { url } = await gmailServerRequest('gmail/connect', {});
      const completion = waitForGmailPopup(popup);
      popup.location.href = url;
      await completion;
      await restoreGmailConnection();
      if (!serverConnection?.connected) throw new Error('No se pudo recuperar la conexión de Gmail.');
      return { user: getCurrentGoogleUser()!, accessToken: '' };
    } catch (error) {
      if (!popup.closed) popup.close();
      throw error;
    }
  }
  if (popup && !popup.closed) popup.close();
  const auth = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.addScope(GMAIL_SEND_SCOPE);
  provider.setCustomParameters({
    login_hint: loginHint,
    prompt: 'select_account'
  });

  try {
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('No se pudo obtener el token de acceso de Google para enviar correos.');
    }

    if (result.user.email !== DEFAULT_GMAIL_SENDER) {
      throw new Error('Conecta la cuenta emisora oficial ' + DEFAULT_GMAIL_SENDER + '.');
    }
    // Persist the compatibility session in an encrypted HttpOnly cookie.
    await gmailServerRequest('gmail/session', { accessToken: credential.accessToken });
    inMemoryAccessToken = credential.accessToken;
    tokenExpiresAt = Date.now() + 55 * 60_000;
    await restoreGmailConnection();
    currentGoogleUser = {
      email: result.user.email,
      displayName: result.user.displayName,
      photoURL: result.user.photoURL,
      uid: result.user.uid
    };
    notifyAuthListeners();

    return {
      user: currentGoogleUser,
      accessToken: inMemoryAccessToken
    };
  } catch (error: any) {
    console.error('[GmailDispatch] Google sign-in error:', error);
    throw error;
  }
}

/**
 * Returns the in-memory access token, or null if not signed in or expired
 */
export function getGmailAccessToken(): string | null {
  return tokenExpiresAt > Date.now() ? inMemoryAccessToken : null;
}

/**
 * Returns current authenticated Google user details
 */
export function getCurrentGoogleUser() {
  if (serverConnection?.connected && currentGoogleUser?.email !== serverConnection.email) {
    return { email: serverConnection.email, displayName: 'Cuenta emisora de correo', photoURL: null, uid: 'server-gmail' };
  }
  return currentGoogleUser;
}

/**
 * Signs out from Google and clears in-memory token
 */
export async function disconnectGoogleGmail(): Promise<void> {
  await gmailServerRequest('gmail/disconnect', {});
  connectionGeneration += 1;
  serverConnection = null;
  const auth = getFirebaseAuth();
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[GmailDispatch] Signout warning:', err);
  } finally {
    inMemoryAccessToken = null;
    currentGoogleUser = null;
    notifyAuthListeners();
  }
}

export type AlcanceActividadesTipo =
  | 'fin_de_semana' // Sábado y Domingo inmediatamente posteriores (ideal para despachos los días viernes)
  | 'siguiente_sabado' // Sábado siguiente
  | 'siguiente_domingo' // Domingo siguiente
  | 'dia_del_envio' // Mismo día del envío
  | 'semana_en_curso' // Lunes a Domingo de la semana en curso
  | 'proxima_semana' // Lunes a Domingo de la siguiente semana
  | 'dias_especificos'; // Días específicos de la semana seleccionados por el usuario

/**
 * Configuration for recurring automated dispatch:
 * Allows choosing which day of the week it is sent, what days of activities to include, and for how long.
 */
export interface ScheduledDispatchConfig {
  enabled: boolean;
  diasSemana: number[]; // 1=Lunes, 2=Martes, 3=Mié, 4=Jue, 5=Vie, 6=Sáb, 0=Dom (días en que se envía)
  horaEnvio: string; // HH:mm (e.g. "08:30")
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD (por cuánto tiempo se envía)
  duracionMeses?: number; // 1, 2, 3, 6, 12 o undefined si personalizado
  alcanceActividades: AlcanceActividadesTipo;
  diasActividadesEspecificos?: number[]; // Si alcanceActividades === 'dias_especificos', qué días de la semana de actividades se envían cada vez (ej: [6, 0])
  attachDailyPdfs?: boolean; // Default true: envía una planilla PDF por cada día de actividades incluida para imprimir
  ultimoEnvio?: string; // ISO
}

export const DEFAULT_SCHEDULED_CONFIG: ScheduledDispatchConfig = {
  enabled: false,
  diasSemana: [5], // Viernes por defecto (día habitual de envío semanal)
  horaEnvio: '08:30',
  fechaInicio: format(new Date(), 'yyyy-MM-dd'),
  fechaFin: format(addMonths(new Date(), 3), 'yyyy-MM-dd'),
  duracionMeses: 3,
  alcanceActividades: 'fin_de_semana', // Por defecto envía el fin de semana siguiente
  diasActividadesEspecificos: [6, 0], // Sábado y Domingo
  attachDailyPdfs: true // Siempre adjuntar planillas PDF por cada día para imprimir
};

/**
 * Calculates the dates of activities to be sent for a specific dispatch date.
 * E.g., if dispatch is on Friday:
 * - 'fin_de_semana': returns Saturday and Sunday immediately following that Friday.
 * - 'siguiente_sabado': returns the following Saturday.
 * - 'siguiente_domingo': returns the following Sunday.
 * - 'dia_del_envio': returns the dispatch date itself.
 * - 'semana_en_curso': returns Monday through Sunday of that week.
 * - 'proxima_semana': legacy setting, mapped to the current week for dispatch.
 * - 'dias_especificos': returns the selected weekday dates in that cycle.
 */
function calculateUnboundedActivityDatesForDispatchDate(
  dispatchDateStr: string,
  alcance: AlcanceActividadesTipo = 'fin_de_semana',
  diasActividadesEspecificos: number[] = [6, 0]
): string[] {
  if (!dispatchDateStr) return [];
  try {
    const dispatchDate = parseISO(dispatchDateStr);
    const dayOfWeek = getDay(dispatchDate); // 0=Sunday, 1=Monday, ..., 6=Saturday

    if (alcance === 'dia_del_envio') {
      return [dispatchDateStr];
    }

    if (alcance === 'fin_de_semana') {
      let satDate: Date;
      if (dayOfWeek === 0) {
        satDate = addDays(dispatchDate, -1);
      } else if (dayOfWeek === 6) {
        satDate = dispatchDate;
      } else {
        satDate = nextSaturday(dispatchDate);
      }
      const sunDate = addDays(satDate, 1);
      return [format(satDate, 'yyyy-MM-dd'), format(sunDate, 'yyyy-MM-dd')];
    }

    if (alcance === 'siguiente_sabado') {
      let satDate: Date;
      if (dayOfWeek === 0) {
        satDate = addDays(dispatchDate, -1);
      } else if (dayOfWeek === 6) {
        satDate = dispatchDate;
      } else {
        satDate = nextSaturday(dispatchDate);
      }
      return [format(satDate, 'yyyy-MM-dd')];
    }

    if (alcance === 'siguiente_domingo') {
      let sunDate: Date;
      if (dayOfWeek === 0) {
        sunDate = dispatchDate;
      } else {
        sunDate = nextSunday(dispatchDate);
      }
      return [format(sunDate, 'yyyy-MM-dd')];
    }

    if (alcance === 'semana_en_curso') {
      const diffToMonday = (dayOfWeek + 6) % 7;
      const monday = addDays(dispatchDate, -diffToMonday);
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        dates.push(format(addDays(monday, i), 'yyyy-MM-dd'));
      }
      return dates;
    }

    if (alcance === 'proxima_semana') {
      const diffToMonday = (dayOfWeek + 6) % 7;
      const nextMonday = addDays(dispatchDate, -diffToMonday + 7);
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        dates.push(format(addDays(nextMonday, i), 'yyyy-MM-dd'));
      }
      return dates;
    }

    if (alcance === 'dias_especificos') {
      if (!diasActividadesEspecificos || diasActividadesEspecificos.length === 0) {
        return [];
      }
      const diffToMonday = (dayOfWeek + 6) % 7;
      const monday = addDays(dispatchDate, -diffToMonday);
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const candidate = addDays(monday, i);
        const candDay = getDay(candidate);
        if (diasActividadesEspecificos.includes(candDay)) {
          dates.push(format(candidate, 'yyyy-MM-dd'));
        }
      }
      // If none matched in current week (e.g., weekend from Friday), also check next days
      if (dates.length === 0) {
        for (let i = 0; i < 7; i++) {
          const candidate = addDays(dispatchDate, i);
          const candDay = getDay(candidate);
          if (diasActividadesEspecificos.includes(candDay)) {
            dates.push(format(candidate, 'yyyy-MM-dd'));
          }
        }
      }
      return Array.from(new Set(dates)).sort();
    }
  } catch (err) {
    console.error('[calculateActivityDatesForDispatchDate] Error:', err);
  }
  return [dispatchDateStr];
}

/** Each dispatch is restricted to its own Monday-Sunday cycle. */
export function calculateActivityDatesForDispatchDate(
  dispatchDateStr: string,
  alcance: AlcanceActividadesTipo = 'fin_de_semana',
  diasActividadesEspecificos: number[] = [6, 0]
): string[] {
  return filterDatesToDispatchWeek(
    calculateUnboundedActivityDatesForDispatchDate(dispatchDateStr, alcance === 'proxima_semana' ? 'semana_en_curso' : alcance, diasActividadesEspecificos),
    dispatchDateStr
  );
}

/**
 * Given a full schedule (diasSemana de envío, fechaInicio, fechaFin, alcanceActividades, diasActividadesEspecificos),
 * calculates ALL distinct activity dates across all dispatch runs.
 */
export function calculateAllScheduledActivityDates(
  diasSemanaEnvio: number[],
  fechaInicio: string,
  fechaFin: string,
  alcance: AlcanceActividadesTipo,
  diasActividadesEspecificos: number[] = [6, 0]
): string[] {
  const dispatchDates = calculateScheduledDates(diasSemanaEnvio, fechaInicio, fechaFin);
  const activityDatesSet = new Set<string>();

  for (const d of dispatchDates) {
    const actDates = calculateActivityDatesForDispatchDate(d, alcance, diasActividadesEspecificos);
    actDates.forEach(date => activityDatesSet.add(date));
  }

  return Array.from(activityDatesSet).sort();
}

/**
 * Calculates all matching dates for a given recurring schedule
 */
export function calculateScheduledDates(
  diasSemana: number[],
  fechaInicio: string,
  fechaFin: string
): string[] {
  if (!fechaInicio || !fechaFin || !diasSemana || diasSemana.length === 0) return [];
  if (fechaFin < fechaInicio) return [];

  const dates: string[] = [];
  try {
    let runner = parseISO(fechaInicio);
    const endTarget = parseISO(fechaFin);

    while (!isAfter(runner, endTarget)) {
      const dayNum = getDay(runner);
      if (diasSemana.includes(dayNum)) {
        dates.push(format(runner, 'yyyy-MM-dd'));
      }
      runner = addDays(runner, 1);
    }
  } catch (err) {
    console.error('[GmailDispatch] Error calculating scheduled dates:', err);
  }
  return dates;
}

export const WEEKDAY_LABELS: Record<number, { name: string; short: string }> = {
  1: { name: 'Lunes', short: 'Lun' },
  2: { name: 'Martes', short: 'Mar' },
  3: { name: 'Miércoles', short: 'Mié' },
  4: { name: 'Jueves', short: 'Jue' },
  5: { name: 'Viernes', short: 'Vie' },
  6: { name: 'Sábado', short: 'Sáb' },
  0: { name: 'Domingo', short: 'Dom' }
};

/**
 * Determines whether a reservation corresponds to a space or equipment loan ("Préstamo")
 */
export function isLoanReservation(reserva?: { tipoPrestamo?: string; tipoActividad?: string } | null): boolean {
  return reserva ? isDispatchLoan(reserva) : false;
}

/**
 * Filter mode for email dispatch:
 * - 'solo_prestamos': strictly only loan reservations
 * - 'prestamos_y_seleccionadas': all loans plus manually selected activity types
 * - 'actividades_seleccionadas': strictly only the selected activity types
 * - 'todas': all reservations with no filter
 */
export type EmailDispatchFilterMode =
  | 'solo_prestamos'
  | 'prestamos_y_seleccionadas'
  | 'actividades_seleccionadas'
  | 'todas';

/**
 * Configuration schema for Gmail Dispatch stored in Firestore
 */
export interface GmailDispatchConfig {
  senderEmail: string;
  defaultRecipients: string[];
  selectedActivityTypes: string[]; // ['ALL'] or specific names
  dispatchFilterMode?: EmailDispatchFilterMode; // Filtro: solo préstamos o actividades seleccionadas
  subjectTemplate: string;
  customHeaderNote?: string;
  includeObservations: boolean;
  includeResponsibleContact: boolean;
  schedule?: ScheduledDispatchConfig;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_GMAIL_DISPATCH_CONFIG: GmailDispatchConfig = {
  senderEmail: DEFAULT_GMAIL_SENDER,
  defaultRecipients: ['cristianshute@gmail.com'],
  selectedActivityTypes: ['ALL'],
  dispatchFilterMode: 'solo_prestamos', // El correo es solo para préstamos o actividades seleccionadas
  subjectTemplate: 'Actividades Comunitarias - {FECHAS}',
  customHeaderNote: 'Adjuntamos el detalle consolidado de actividades y uso de espacios programados.',
  includeObservations: true,
  includeResponsibleContact: true,
  schedule: DEFAULT_SCHEDULED_CONFIG,
  updatedAt: new Date().toISOString(),
  updatedBy: 'Sistema'
};

/**
 * Loads the saved dispatch configuration from Firestore (or local fallback)
 */
let dispatchConfigCache: { value: GmailDispatchConfig; expiresAt: number } | undefined;
let pendingDispatchConfig: Promise<GmailDispatchConfig> | undefined;
let dispatchConfigGeneration = 0;

export async function loadGmailDispatchConfig(): Promise<GmailDispatchConfig> {
  if (dispatchConfigCache && dispatchConfigCache.expiresAt > Date.now()) return structuredClone(dispatchConfigCache.value);
  if (pendingDispatchConfig) return structuredClone(await pendingDispatchConfig);
  const request = fetchGmailDispatchConfig(dispatchConfigGeneration);
  pendingDispatchConfig = request;
  try { return structuredClone(await request); }
  finally { if (pendingDispatchConfig === request) pendingDispatchConfig = undefined; }
}

async function fetchGmailDispatchConfig(generation: number): Promise<GmailDispatchConfig> {
  try {
    const db = getDb();
    const docRef = doc(db, CONFIG_COLLECTION, GMAIL_CONFIG_DOC_ID);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data && data.data && typeof data.data === 'object') {
        const value = {
          ...DEFAULT_GMAIL_DISPATCH_CONFIG,
          ...(data.data as Partial<GmailDispatchConfig>)
        };
        if (!snap.metadata.fromCache && generation === dispatchConfigGeneration) {
          dispatchConfigCache = { value, expiresAt: Date.now() + 60_000 };
        }
        return generation === dispatchConfigGeneration ? value : loadGmailDispatchConfig();
      }
    }
  } catch (err) {
    console.warn('[GmailDispatch] Could not load config from Firestore, trying localStorage:', err);
  }

  // Fallback to local storage
  try {
    const local = localStorage.getItem('espacios_gmail_dispatch_cfg');
    if (local) {
      return { ...DEFAULT_GMAIL_DISPATCH_CONFIG, ...JSON.parse(local) };
    }
  } catch {
    // ignore
  }

  return DEFAULT_GMAIL_DISPATCH_CONFIG;
}

/**
 * Saves the dispatch configuration to Firestore and localStorage
 */
export async function saveGmailDispatchConfig(config: GmailDispatchConfig, userIdentifier?: string): Promise<boolean> {
  const payloadToSave: GmailDispatchConfig = {
    ...config,
    updatedAt: new Date().toISOString(),
    updatedBy: userIdentifier || 'cristianshute@gmail.com'
  };

  try {
    const db = getDb();
    const docRef = doc(db, CONFIG_COLLECTION, GMAIL_CONFIG_DOC_ID);
    await setDoc(docRef, {
      id: GMAIL_CONFIG_DOC_ID,
      data: payloadToSave,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    dispatchConfigGeneration++;
    pendingDispatchConfig = undefined;
    dispatchConfigCache = { value: structuredClone(payloadToSave), expiresAt: Date.now() + 60_000 };
    try { localStorage.setItem('espacios_gmail_dispatch_cfg', JSON.stringify(payloadToSave)); } catch { /* Cache is optional. */ }
    return true;
  } catch (err) {
    console.error('[GmailDispatch] Failed to save config to Firestore:', err);
    return false;
  }
}

/**
 * Converts a UTF-8 string to base64url format for Gmail API
 */
export function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface EmailAttachment {
  filename: string;
  contentType?: string;
  contentBase64: string;
}

/**
 * Splits base64 string into 76-character chunks according to RFC 2045 MIME specifications.
 */
function splitBase64IntoMimeLines(base64: string, lineLength = 76): string {
  const clean = base64.replace(/\s+/g, '');
  const regex = new RegExp(`.{1,${lineLength}}`, 'g');
  const lines = clean.match(regex);
  return lines ? lines.join('\r\n') : clean;
}

/**
 * Builds RFC 2822 compliant email body in base64url format, supporting attachments
 */
export function buildRfc2822Email({
  from,
  to,
  subject,
  htmlBody,
  textBody,
  attachments = []
}: {
  from: string;
  to: string[];
  subject: string;
  htmlBody: string;
  textBody: string;
  attachments?: EmailAttachment[];
}): string {
  const toHeader = to.join(', ');
  // UTF-8 encoded subject
  const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;

  if (attachments && attachments.length > 0) {
    const mixedBoundary = `__mixed_${Date.now()}_${Math.random().toString(36).substring(2)}__`;
    const altBoundary = `__alt_${Date.now()}_${Math.random().toString(36).substring(2)}__`;

    const lines: string[] = [
      `From: ${from}`,
      `To: ${toHeader}`,
      `Subject: ${utf8Subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      '',
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      textBody,
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      htmlBody,
      '',
      `--${altBoundary}--`
    ];

    for (const att of attachments) {
      const safeFilename = att.filename.replace(/"/g, '').replace(/[\r\n]/g, '');
      const contentType = att.contentType || 'application/pdf';
      lines.push(
        '',
        `--${mixedBoundary}`,
        `Content-Type: ${contentType}; name="${safeFilename}"`,
        `Content-Disposition: attachment; filename="${safeFilename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        splitBase64IntoMimeLines(att.contentBase64)
      );
    }

    lines.push('', `--${mixedBoundary}--`);
    return base64UrlEncode(lines.join('\r\n'));
  }

  const boundary = `__boundary_${Date.now()}_${Math.random().toString(36).substring(2)}__`;
  const lines = [
    `From: ${from}`,
    `To: ${toHeader}`,
    `Subject: ${utf8Subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    textBody,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    htmlBody,
    '',
    `--${boundary}--`
  ];

  return base64UrlEncode(lines.join('\r\n'));
}

export interface ActivityEmailItem {
  id: string;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  espacio: string;
  tipoActividad: string;
  tipoPrestamo?: string;
  responsable: string;
  descripcion: string;
  comentarios?: string;
  cantidadParticipantes?: number;
  telefonoContacto?: string;
  emailContacto?: string;
}

/**
 * Generates plain text and rich HTML email contents for a list of activities
 */
export function generateActivitiesEmailContent({
  dates,
  activities,
  customNote,
  senderEmail = DEFAULT_GMAIL_SENDER,
  includeObservations = true,
  includeResponsibleContact = true
}: {
  dates: string[];
  activities: ActivityEmailItem[];
  customNote?: string;
  senderEmail?: string;
  includeObservations?: boolean;
  includeResponsibleContact?: boolean;
}): { html: string; text: string; totalActivities: number } {
  const sortedDates = [...dates].sort();
  const dateLabels = sortedDates.map(d => {
    try {
      return format(parseISO(d), "EEEE d 'de' MMMM, yyyy", { locale: es });
    } catch {
      return d;
    }
  });

  // Group activities by date
  const activitiesByDate: Record<string, ActivityEmailItem[]> = {};
  sortedDates.forEach(d => {
    activitiesByDate[d] = [];
  });

  activities.forEach(act => {
    if (!activitiesByDate[act.fecha]) {
      activitiesByDate[act.fecha] = [];
    }
    activitiesByDate[act.fecha].push(act);
  });

  // Sort activities chronologically within each date
  sortedDates.forEach(d => {
    activitiesByDate[d].sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
  });

  const total = activities.length;

  // Plain Text Version
  let text = `REPORTE DE ACTIVIDADES COMUNITARIAS\n`;
  text += `Emitido desde: ${senderEmail}\n`;
  text += `Fechas: ${dateLabels.join(' | ')}\n`;
  text += `Total de actividades programadas: ${total}\n\n`;
  if (customNote) {
    text += `${customNote}\n\n`;
  }
  text += `--------------------------------------------------------\n`;

  sortedDates.forEach(date => {
    const list = activitiesByDate[date] || [];
    let formattedDate = date;
    try {
      formattedDate = format(parseISO(date), "EEEE d 'de' MMMM, yyyy", { locale: es }).toUpperCase();
    } catch {
      // ignore
    }
    text += `\n📅 FECHA: ${formattedDate} (${list.length} actividades)\n`;
    if (list.length === 0) {
      text += `  Sin actividades registradas para esta fecha.\n`;
    } else {
      list.forEach((act, idx) => {
        text += `  ${idx + 1}. [${act.horaInicio} - ${act.horaFin}] ${formatDisplayTitle(act.espacio)}\n`;
        text += `     Actividad: ${formatDisplayTitle(act.tipoActividad)}${act.descripcion ? ` - ${formatDisplayTitle(act.descripcion)}` : ''}\n`;
        text += `     Responsable: ${formatDisplayTitle(act.responsable)}`;
        if (includeResponsibleContact && (act.telefonoContacto || act.emailContacto)) {
          text += ` (${[act.telefonoContacto, act.emailContacto].filter(Boolean).join(', ')})`;
        }
        text += `\n`;
        if (act.cantidadParticipantes) {
          text += `     Participantes: ${act.cantidadParticipantes}\n`;
        }
        if (includeObservations && act.comentarios) {
          text += `     Observaciones: ${act.comentarios}\n`;
        }
      });
    }
  });

  text += `\n--------------------------------------------------------\n`;
  text += `Sistema de Gestión de Espacios Comunitarios\n`;

  // HTML Version with elegant, responsive email styling
  let html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte de Actividades</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
    .container { max-width: 680px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 24px 28px; }
    .header h1 { margin: 0 0 6px 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .header p { margin: 0; font-size: 13px; opacity: 0.9; }
    .badge-count { display: inline-block; background-color: rgba(255,255,255,0.2); padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; margin-top: 10px; }
    .content { padding: 24px 28px; }
    .note-box { background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 6px; font-size: 13px; color: #1e40af; margin-bottom: 24px; }
    .date-section { margin-bottom: 24px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
    .date-header { background-color: #f1f5f9; padding: 12px 18px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
    .date-title { font-size: 14px; font-weight: 700; color: #0f172a; text-transform: capitalize; margin: 0; }
    .date-count { font-size: 12px; font-weight: 600; color: #64748b; background: #e2e8f0; padding: 2px 8px; border-radius: 999px; }
    .activity-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .activity-table th { background-color: #f8fafc; color: #475569; font-weight: 600; text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 11px; text-transform: uppercase; }
    .activity-table td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .activity-table tr:last-child td { border-bottom: none; }
    .time-badge { display: inline-block; background-color: #e0e7ff; color: #3730a3; font-weight: 700; padding: 3px 6px; border-radius: 5px; font-size: 11px; white-space: nowrap; }
    .space-name { font-weight: 700; color: #0f172a; }
    .activity-type { color: #2563eb; font-weight: 600; font-size: 12px; }
    .desc-text { color: #475569; font-size: 12px; margin-top: 2px; }
    .resp-text { font-size: 12px; color: #334155; font-weight: 500; }
    .contact-subtext { font-size: 11px; color: #64748b; }
    .comment-box { background: #fefce8; border: 1px solid #fef08a; padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #854d0e; margin-top: 4px; }
    .empty-state { padding: 16px; text-align: center; color: #94a3b8; font-size: 13px; font-style: italic; }
    .footer { background-color: #f8fafc; padding: 18px 28px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; }
    .footer strong { color: #334155; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Reporte de Actividades Comunitarias</h1>
      <p>Enviado desde <strong>${senderEmail}</strong> mediante el Sistema de Gestión de Espacios</p>
      <div class="badge-count">${total} ${total === 1 ? 'actividad programada' : 'actividades programadas'}</div>
    </div>
    
    <div class="content">
      ${customNote ? `<div class="note-box">${customNote}</div>` : ''}
`;

  sortedDates.forEach(date => {
    const list = activitiesByDate[date] || [];
    let formattedDate = date;
    try {
      formattedDate = format(parseISO(date), "EEEE d 'de' MMMM, yyyy", { locale: es });
    } catch {
      // ignore
    }

    html += `
      <div class="date-section">
        <div class="date-header">
          <div class="date-title">📅 ${formattedDate}</div>
          <div class="date-count">${list.length} ${list.length === 1 ? 'actividad' : 'actividades'}</div>
        </div>
    `;

    if (list.length === 0) {
      html += `<div class="empty-state">No hay actividades programadas para este día.</div>`;
    } else {
      html += `
        <table class="activity-table">
          <thead>
            <tr>
              <th style="width: 100px;">Horario</th>
              <th style="width: 140px;">Espacio</th>
              <th>Actividad & Responsable</th>
            </tr>
          </thead>
          <tbody>
      `;

      list.forEach(act => {
        const contactInfo = [act.telefonoContacto, act.emailContacto].filter(Boolean).join(' • ');

        html += `
          <tr>
            <td>
              <span class="time-badge">${act.horaInicio} - ${act.horaFin}</span>
              ${act.cantidadParticipantes ? `<div style="font-size: 10px; color: #64748b; margin-top: 4px;">👥 ${act.cantidadParticipantes} pers.</div>` : ''}
            </td>
            <td>
              <div class="space-name">${formatDisplayTitle(act.espacio)}</div>
              ${act.tipoPrestamo ? `<div style="font-size: 10px; color: #64748b;">${formatDisplayTitle(act.tipoPrestamo)}</div>` : ''}
            </td>
            <td>
              <div class="activity-type">${formatDisplayTitle(act.tipoActividad)}</div>
              ${act.descripcion ? `<div class="desc-text">${formatDisplayTitle(act.descripcion)}</div>` : ''}
              <div class="resp-text" style="margin-top: 4px;"><strong>Resp:</strong> ${formatDisplayTitle(act.responsable)}</div>
              ${includeResponsibleContact && contactInfo ? `<div class="contact-subtext">📞 ${contactInfo}</div>` : ''}
              ${includeObservations && act.comentarios ? `<div class="comment-box">💬 ${act.comentarios}</div>` : ''}
            </td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
    }

    html += `</div>`;
  });

  html += `
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>Sistema de Gestión de Espacios Comunitarios</strong></p>
      <p style="margin: 0; font-size: 11px;">Este mensaje fue generado y enviado automáticamente vía Google Gmail API.</p>
    </div>
  </div>
</body>
</html>
`;

  return { html, text, totalActivities: total };
}

/**
 * Sends the email through Gmail REST API using the in-memory access token.
 */
export async function sendActivitiesViaGmail({
  to,
  subject,
  htmlBody,
  textBody,
  from = DEFAULT_GMAIL_SENDER,
  attachments = []
}: {
  to: string[];
  subject: string;
  htmlBody: string;
  textBody: string;
  from?: string;
  attachments?: EmailAttachment[];
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  await restoreGmailConnection();
  if (serverConnection?.connected) {
    try {
      const result = await gmailServerRequest('send', {
        to, subject, bodyText: textBody, html: htmlBody, purpose: 'manual_daily_pdf_dispatch',
        attachments: attachments.map(attachment => ({ filename: attachment.filename, contentType: attachment.contentType, content: attachment.contentBase64 }))
      });
      if (result.reauthorize) {
        inMemoryAccessToken = null;
        tokenExpiresAt = 0;
        serverConnection = null;
      }
      if (!result.success) await restoreGmailConnection();
      return result;
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }
  const token = getGmailAccessToken();
  if (!token) {
    return {
      success: false,
      error: 'No hay una sesión activa de Google con permisos de Gmail. Por favor conecta tu cuenta de Google.'
    };
  }

  if (!to || to.length === 0) {
    return {
      success: false,
      error: 'Debes ingresar al menos un correo destinatario.'
    };
  }

  try {
    const rawMessage = buildRfc2822Email({
      from,
      to,
      subject,
      htmlBody,
      textBody,
      attachments
    });

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: rawMessage
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errMsg = errorData?.error?.message || `Error HTTP ${response.status}: ${response.statusText}`;
      console.error('[GmailDispatch] Gmail API send failed:', errorData);

      if (response.status === 401) {
        // Token expired, clear cache
        inMemoryAccessToken = null;
        notifyAuthListeners();
        return {
          success: false,
          error: 'La sesión de Google expiró. Por favor vuelve a conectar con Google e intenta nuevamente.'
        };
      }

      return {
        success: false,
        error: `Error al enviar desde Gmail: ${errMsg}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      messageId: data.id
    };
  } catch (err: any) {
    console.error('[GmailDispatch] Unexpected error sending via Gmail API:', err);
    return {
      success: false,
      error: err?.message || 'Error inesperado al comunicarse con Gmail API.'
    };
  }
}
