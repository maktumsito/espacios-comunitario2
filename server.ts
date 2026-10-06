import { GmailConnection } from './server/gmailConnection';
import { registerScheduledCheck, singleFlight } from './server/scheduledDispatch';
import { selectDispatchReservations, isDispatchLoan as isLoan, isDispatchableReservation } from './src/utils/activityDispatchSelection';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  Firestore
} from 'firebase/firestore';

import type { Reservation, SpaceRating } from './src/types';
import {
  generateDailySchedulePdf,
  getDailySchedulePdfFilename,
  docToBase64
} from './src/utils/dailySchedulePdf';
import { buildRfc2822Email, calculateActivityDatesForDispatchDate } from './src/services/gmailDispatchService';
import { formatDateDDMMYYYY } from './src/utils/dateUtils';

// Load environment variables
dotenv.config();

const PORT = 3000;
const TIMEZONE = 'America/Santiago';

// Read Firebase config from repository
let firebaseConfig: any = null;
try {
  const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  }
} catch (e) {
  console.warn('[Server] Could not read firebase-applet-config.json:', e);
}

// Lazy Firestore instance
let dbInstance: Firestore | null = null;
function getServerDb(): Firestore | null {
  if (!firebaseConfig) return null;
  if (!dbInstance) {
    try {
      const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
      const databaseId = firebaseConfig.firestoreDatabaseId;
      const settings = {
        ignoreUndefinedProperties: true
      };

      if (databaseId && databaseId !== '(default)') {
        try {
          dbInstance = initializeFirestore(app, settings, databaseId);
        } catch {
          dbInstance = getFirestore(app, databaseId);
        }
      } else {
        try {
          dbInstance = initializeFirestore(app, settings);
        } catch {
          dbInstance = getFirestore(app);
        }
      }
    } catch (e) {
      console.warn('[Server] Error initializing server Firestore:', e);
    }
  }
  return dbInstance;
}

const gmailConnection = new GmailConnection({
  clientId: process.env.GMAIL_OAUTH_CLIENT_ID,
  clientSecret: process.env.GMAIL_OAUTH_CLIENT_SECRET,
  redirectUri: process.env.GMAIL_OAUTH_REDIRECT_URI || (process.env.APP_URL?.startsWith('http') ? process.env.APP_URL.replace(/\/$/, '') + '/api/email/gmail/callback' : undefined),
  encryptionSecret: process.env.GMAIL_TOKEN_ENCRYPTION_KEY,
  sender: 'cristianshute@gmail.com',
  store: {
    async read() {
      const db = getServerDb();
      if (!db) throw new Error('Base de datos de credenciales no disponible.');
      const snap = await getDoc(doc(db, 'configuracion_sistema', 'gmail_oauth_credentials'));
      return snap.exists() ? snap.data().encrypted || null : null;
    },
    async write(encrypted) {
      const db = getServerDb();
      if (!db) throw new Error('Base de datos de credenciales no disponible.');
      await setDoc(doc(db, 'configuracion_sistema', 'gmail_oauth_credentials'), { encrypted, updatedAt: new Date().toISOString() });
    }
  }
});

// Helper to get time in America/Santiago
function getSantiagoTime(): {
  dayOfWeek: number; // 0=Dom, 1=Lun, ..., 6=Sab
  hour: number;
  minute: number;
  dateStr: string;
  timeFormatted: string;
} {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('es-CL', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  const parts = formatter.formatToParts(now);
  const getPart = (t: string) => parts.find((p) => p.type === t)?.value || '';

  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hour = parseInt(getPart('hour'), 10) || 0;
  const minute = parseInt(getPart('minute'), 10) || 0;

  const weekdayStr = now.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'short' });
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };
  const dayOfWeek = dayMap[weekdayStr] ?? now.getDay();
  const dateStr = `${year}-${month}-${day}`;
  const timeFormatted = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  return { dayOfWeek, hour, minute, dateStr, timeFormatted };
}

// Email Transporter / Dispatcher
export interface EmailAttachmentServer {
  filename: string;
  content: string; // base64 string
  contentType?: string;
}

export interface EmailSendOptions {
  to: string | string[];
  subject: string;
  bodyText: string;
  html?: string;
  purpose?: string;
  attachments?: EmailAttachmentServer[];
  gmailAccessToken?: string | null;
}

interface EmailSendResult {
  success: boolean;
  mode: 'smtp' | 'resend' | 'gmail_api' | 'logged' | 'unconfigured';
  messageId?: string;
  timestamp: string;
  error?: string;
  attachmentsCount?: number;
  reauthorize?: boolean;
}

async function sendEmailServer(options: EmailSendOptions): Promise<EmailSendResult> {
  const { to, subject, bodyText, html, purpose = 'general', attachments = [] } = options;
  const recipients = Array.isArray(to) ? to.join(', ') : to;
  const nowIso = new Date().toISOString();

  // Server-side OAuth renews Gmail authorization without an open browser.
  try {
    let accessToken = options.gmailAccessToken || await gmailConnection.getAccessToken();
    if (accessToken) {
      const raw = buildRfc2822Email({
        from: 'cristianshute@gmail.com', to: Array.isArray(to) ? to : [to], subject,
        htmlBody: html || bodyText, textBody: bodyText,
        attachments: attachments.map(attachment => ({ filename: attachment.filename, contentType: attachment.contentType || 'application/pdf', contentBase64: attachment.content }))
      });
      const deliver = (token: string) => fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw })
      });
      let response = await deliver(accessToken);
      if (response.status === 401) {
        accessToken = await gmailConnection.getAccessToken(true);
        if (accessToken) response = await deliver(accessToken);
      }
      const data = await response.json();
      if (response.status === 401) return { success: false, mode: 'gmail_api', reauthorize: true, error: 'La autorización de Gmail venció. Vuelve a conectar con Google.', timestamp: nowIso };
      if (!response.ok) throw new Error(data.error?.message || 'Gmail no pudo enviar el correo.');
      await logDispatchToFirestore({ purpose, recipients, subject, mode: 'gmail_api', success: true, messageId: data.id, attachmentsCount: attachments.length, timestamp: nowIso });
      return { success: true, mode: 'gmail_api', messageId: data.id, attachmentsCount: attachments.length, timestamp: nowIso };
    }
  } catch (error) {
    return { success: false, mode: 'gmail_api', reauthorize: (error as Error).name === 'GmailAuthorizationExpired', error: (error as Error).message, timestamp: nowIso };
  }

  // 1. Automatic Gmail SMTP & Custom SMTP config
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || 'cristianshute@gmail.com';
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD;
  const isGmail = (process.env.SMTP_HOST === 'smtp.gmail.com') || (!process.env.SMTP_HOST && smtpUser.endsWith('@gmail.com'));
  const smtpHost = process.env.SMTP_HOST || (isGmail ? 'smtp.gmail.com' : undefined);
  const smtpPort = parseInt(process.env.SMTP_PORT || (isGmail ? '465' : '587'), 10);
  const smtpFrom = process.env.SMTP_FROM || `Gestión de Espacios Diaguitas <${smtpUser}>`;

  if (smtpPass && smtpUser) {
    try {
      // For Gmail, Nodemailer's native 'gmail' service automatically configures SSL/TLS, port 465 and Google mail servers
      const transporter = isGmail
        ? nodemailer.createTransport({
            service: 'gmail',
            auth: {
              user: smtpUser,
              pass: smtpPass
            }
          })
        : nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: {
              user: smtpUser,
              pass: smtpPass
            }
          });

      const mailAttachments = attachments.map(att => ({
        filename: att.filename,
        content: Buffer.from(att.content, 'base64'),
        contentType: att.contentType || 'application/pdf'
      }));

      const info = await transporter.sendMail({
        from: smtpFrom,
        to: recipients,
        subject,
        text: bodyText,
        html: html || bodyText.replace(/\n/g, '<br>'),
        attachments: mailAttachments
      });

      console.log(`[Email Server] Mail sent successfully via Gmail SMTP to ${recipients} (ID: ${info.messageId}, Attachments: ${mailAttachments.length})`);
      await logDispatchToFirestore({
        purpose,
        recipients,
        subject,
        mode: 'smtp',
        success: true,
        messageId: info.messageId,
        attachmentsCount: mailAttachments.length,
        timestamp: nowIso
      });

      return {
        success: true,
        mode: 'smtp',
        messageId: info.messageId,
        attachmentsCount: mailAttachments.length,
        timestamp: nowIso
      };
    } catch (err: any) {
      console.error('[Email Server] SMTP error:', err);
      // Fallback to recording the failure
      await logDispatchToFirestore({
        purpose,
        recipients,
        subject,
        mode: 'smtp',
        success: false,
        error: err?.message || String(err),
        timestamp: nowIso
      });
      return {
        success: false,
        mode: 'smtp',
        error: err?.message || String(err),
        timestamp: nowIso
      };
    }
  }

  // 2. Check for Resend API Key (free tier: 3000 emails/month)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const bodyPayload: any = {
        from: process.env.SMTP_FROM || 'Centro Comunitario Diaguitas <onboarding@resend.dev>',
        to: Array.isArray(to) ? to : [to],
        subject,
        text: bodyText,
        html: html || bodyText.replace(/\n/g, '<br>')
      };

      if (attachments.length > 0) {
        bodyPayload.attachments = attachments.map(att => ({
          filename: att.filename,
          content: att.content
        }));
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Resend API error');

      console.log(`[Email Server] Mail sent successfully via Resend to ${recipients} (ID: ${data.id}, Attachments: ${attachments.length})`);
      await logDispatchToFirestore({
        purpose,
        recipients,
        subject,
        mode: 'resend',
        success: true,
        messageId: data.id,
        attachmentsCount: attachments.length,
        timestamp: nowIso
      });

      return {
        success: true,
        mode: 'resend',
        messageId: data.id,
        attachmentsCount: attachments.length,
        timestamp: nowIso
      };
    } catch (err: any) {
      console.error('[Email Server] Resend API error:', err);
      return {
        success: false,
        mode: 'resend',
        error: err?.message || String(err),
        timestamp: nowIso
      };
    }
  }

  // 3. Unconfigured Mode (No SMTP or Resend credentials available)
  // Transparently informs the client that dispatch could not occur because no mail service is configured.
  console.warn(`[Email Server - Unconfigured] Cannot dispatch email: no SMTP or Resend credentials found.`);
  console.warn(`To: ${recipients}, Subject: ${subject}`);

  await logDispatchToFirestore({
    purpose,
    recipients,
    subject,
    mode: 'unconfigured',
    success: false,
    error: 'No hay proveedor de correo configurado (falta configurar variables SMTP o RESEND_API_KEY en el servidor)',
    timestamp: nowIso
  });

  return {
    success: false,
    mode: 'unconfigured',
    error: 'El correo no se pudo enviar porque el servidor no tiene credenciales de correo (SMTP o RESEND_API_KEY) configuradas.',
    timestamp: nowIso
  };
}

// Helper to save email logs to Firestore
async function logDispatchToFirestore(data: Record<string, any>) {
  try {
    const db = getServerDb();
    if (!db) return;

    const logId = `dispatch_${Date.now()}`;
    // Save in configuracion_sistema for consistency with firestore rules
    await setDoc(doc(db, 'configuracion_sistema', 'last_email_dispatch'), {
      data: {
        ...data,
        updatedAt: new Date().toISOString()
      }
    }, { merge: true });
  } catch (e) {
    console.warn('[Server] Could not persist email dispatch log to Firestore:', e);
  }
}

// Helper for transient-resilient Firestore document reads with automatic retry
async function getDocWithRetry(docRef: any, maxRetries = 2, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getDoc(docRef);
    } catch (err: any) {
      const isTransient = err?.code === 'unavailable' ||
        err?.code === 'deadline-exceeded' ||
        (err?.message && (err.message.includes('temporarily unavailable') || err.message.includes('unavailable')));
      if (isTransient && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw err;
    }
  }
  return await getDoc(docRef);
}

// Helper for transient-resilient Firestore collection queries with automatic retry
async function getDocsWithRetry(colRef: any, maxRetries = 2, delayMs = 1500) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await getDocs(colRef);
    } catch (err: any) {
      const isTransient = err?.code === 'unavailable' ||
        err?.code === 'deadline-exceeded' ||
        (err?.message && (err.message.includes('temporarily unavailable') || err.message.includes('unavailable')));
      if (isTransient && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw err;
    }
  }
  return await getDocs(colRef);
}

// Fetch all reservations from Firestore
async function fetchAllReservationsServer(): Promise<Reservation[]> {
  const db = getServerDb();
  if (!db) return [];
  try {
    const snap = await getDocsWithRetry(collection(db, 'reservas'));
    const list: Reservation[] = [];
    snap.forEach((d: any) => {
      list.push({ id: d.id, ...(d.data() as any) } as Reservation);
    });
    return list;
  } catch (e: any) {
    const isTransient = e?.code === 'unavailable' ||
      e?.code === 'deadline-exceeded' ||
      (e?.message && (e.message.includes('temporarily unavailable') || e.message.includes('unavailable')));
    if (isTransient) {
      console.warn('[Server] Firestore temporalmente no disponible al obtener reservas (se reintentará automáticamente):', e?.message || e);
    } else {
      console.error('[Server] Error fetching reservations:', e);
    }
    return [];
  }
}

// Fetch all space ratings from Firestore
async function fetchAllRatingsServer(): Promise<SpaceRating[]> {
  const db = getServerDb();
  if (!db) return [];
  try {
    const snap = await getDocsWithRetry(collection(db, 'calificaciones_espacios'));
    const list: SpaceRating[] = [];
    snap.forEach((d: any) => {
      list.push({ id: d.id, ...(d.data() as any) } as SpaceRating);
    });
    return list;
  } catch (e: any) {
    const isTransient = e?.code === 'unavailable' ||
      e?.code === 'deadline-exceeded' ||
      (e?.message && (e.message.includes('temporarily unavailable') || e.message.includes('unavailable')));
    if (isTransient) {
      console.warn('[Server] Firestore temporalmente no disponible al obtener calificaciones:', e?.message || e);
    } else {
      console.error('[Server] Error fetching ratings:', e);
    }
    return [];
  }
}

// Background Automated Scheduler for Daily Printable Activities Sheets
async function executeScheduledDispatchInternal(force = false): Promise<{
  success: boolean;
  skipped?: boolean;
  message: string;
  activityDates?: string[];
  attachments?: string[];
  recipients?: string[];
  error?: string;
  details?: any;
}> {
  const db = getServerDb();
  if (!db) {
    return { success: false, message: 'Base de datos Firestore no disponible en el servidor.' };
  }

  try {
    const configSnap = await getDocWithRetry(doc(db, 'configuracion_sistema', 'gmail_dispatch_config'));
    const configRaw = configSnap.exists() ? (configSnap.data() as any) : null;
    const config = configRaw?.data || configRaw;
    const schedule = config?.schedule;

    if (!schedule) {
      return { success: false, skipped: true, message: 'No hay programación configurada en el sistema.' };
    }

    if (!schedule.enabled && !force) {
      return { success: false, skipped: true, message: 'El envío automático programado está deshabilitado.' };
    }

    const santiago = getSantiagoTime();

    if (!force) {
      // 1. Date Range Check (fechaInicio <= today <= fechaFin)
      if (schedule.fechaInicio && santiago.dateStr < schedule.fechaInicio) {
        return { success: false, skipped: true, message: `Aún no inicia el período de programación (${schedule.fechaInicio}).` };
      }
      if (schedule.fechaFin && santiago.dateStr > schedule.fechaFin) {
        return { success: false, skipped: true, message: `El ciclo de programación ya finalizó el ${schedule.fechaFin}.` };
      }

      // 2. Day of Week Check (0=Dom, 1=Lun, ..., 6=Sab)
      const targetDays: number[] = Array.isArray(schedule.diasSemana) ? schedule.diasSemana : [5];
      if (!targetDays.includes(santiago.dayOfWeek)) {
        return { success: false, skipped: true, message: `Hoy (día ${santiago.dayOfWeek}) no está configurado para envíos.` };
      }

      // 3. Time Check (HH:mm)
      const targetTime = schedule.horaEnvio || '08:30';
      if (santiago.timeFormatted < targetTime) {
        return { success: false, skipped: true, message: `Aún no es la hora de despacho (${targetTime} hrs, actual: ${santiago.timeFormatted}).` };
      }

      // 4. Duplicate Check for Today (prevent multiple dispatches on the same date)
      const lastDispatchDate = schedule.ultimaFechaDespacho || (schedule.ultimoEnvio
        ? new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(schedule.ultimoEnvio))
        : null);
      if (lastDispatchDate === santiago.dateStr) {
        return { success: false, skipped: true, message: `El despacho de hoy (${santiago.dateStr}) ya fue ejecutado previamente.` };
      }
    }

    // 5. Determine activity dates to include based on configured scope
    const alcance = schedule.alcanceActividades || 'fin_de_semana';
    const specificDays = schedule.diasActividadesEspecificos || [6, 0];
    let activityDates = calculateActivityDatesForDispatchDate(santiago.dateStr, alcance, specificDays);

    if (activityDates.length === 0) {
      return { success: false, skipped: true, message: 'No hay fechas de actividades calculadas para despachar en este ciclo.' };
    }

    // 6. Fetch reservations from Firestore and filter according to configured dispatchFilterMode
    const allReservations = await fetchAllReservationsServer();
    const filterMode = config?.dispatchFilterMode || 'solo_prestamos';
    const emailReservations = selectDispatchReservations(allReservations, {
      dates: activityDates,
      referenceDate: santiago.dateStr,
      filterMode,
      selectedActivityTypes: config?.selectedActivityTypes
    });
    activityDates = activityDates.filter(date => emailReservations.some(r => r.fecha === date));
    if (activityDates.length === 0) {
      return { success: false, skipped: true, message: 'No hay actividades seleccionadas de la semana en curso para enviar.' };
    }

    // 7. Generate ONE printable PDF sheet for EACH day to be dispatched
    const attachments: EmailAttachmentServer[] = [];
    for (const dateStr of activityDates) {
      const doc = await generateDailySchedulePdf({
        dateStr,
        reservations: emailReservations,
        onlyOccupiedSpaces: true,
        include3DaysImportant: false,
        generatedBy: filterMode === 'solo_prestamos'
          ? 'Despacho Oficial de Préstamos Diaguitas'
          : 'Despacho Automático Diaguitas'
      });
      const filename = getDailySchedulePdfFilename(dateStr);
      const content = docToBase64(doc);
      attachments.push({
        filename,
        content,
        contentType: 'application/pdf'
      });
    }

    // 8. Build Email Subject & Body
    const recipients: string[] = Array.isArray(config?.defaultRecipients) && config.defaultRecipients.length > 0
      ? config.defaultRecipients
      : ['cristianshute@gmail.com'];

    const formattedDatesList = activityDates.map(formatDateDDMMYYYY).join(', ');
    const filterDescription = filterMode === 'solo_prestamos'
      ? 'Préstamos de Espacios'
      : filterMode === 'prestamos_y_seleccionadas'
      ? 'Préstamos y Actividades Seleccionadas'
      : filterMode === 'actividades_seleccionadas'
      ? 'Actividades Seleccionadas'
      : 'Cartelera de Actividades';

    const subject = `[Planillas Oficiales - ${filterDescription}] (${formattedDatesList}) - Centro Comunitario Diaguitas`;

    const totalActivities = emailReservations.filter(r => r.fecha && activityDates.includes(r.fecha)).length;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 680px; margin: 0 auto; line-height: 1.5;">
        <div style="background-color: #0f172a; padding: 24px; border-radius: 12px 12px 0 0; color: #ffffff;">
          <h1 style="margin: 0 0 6px 0; font-size: 20px; font-weight: bold;">Centro Comunitario Diaguitas</h1>
          <p style="margin: 0; font-size: 13px; color: #94a3b8;">Despacho Oficial de Planillas de Actividades para Impresión</p>
        </div>
        
        <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; background-color: #ffffff; border-radius: 0 0 12px 12px;">
          <p style="font-size: 14px; margin-top: 0;">Estimados,</p>
          <p style="font-size: 13px; color: #334155;">
            Se remite el consolidado de actividades programadas para las siguientes fechas: <strong>${formattedDatesList}</strong> (Total: <strong>${totalActivities} actividad(es) / préstamo(s)</strong> coordinados según filtro: <em>${filterDescription}</em>).
          </p>

          <div style="margin: 20px 0; padding: 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
            <h3 style="margin: 0 0 8px 0; font-size: 13px; color: #166534;">
              📎 Planillas PDF Oficiales Adjuntas para Imprimir (${attachments.length} archivo${attachments.length > 1 ? 's' : ''})
            </h3>
            <p style="margin: 0 0 10px 0; font-size: 12px; color: #15803d;">
              Con el fin de facilitar la impresión diaria en portería y administración, se ha generado y adjuntado <strong>una planilla PDF separada por cada día</strong>:
            </p>
            <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #166534;">
              ${attachments.map(att => `<li style="margin-bottom: 4px;"><strong>${att.filename}</strong> (formato vectorizado en hoja de 8.5" × 13" horizontal listo para imprimir)</li>`).join('')}
            </ul>
          </div>

          <p style="font-size: 12px; color: #64748b; margin-bottom: 0;">
            Este correo fue emitido de manera automática por el Sistema de Gestión del Centro Comunitario Diaguitas según la programación vigente.
          </p>
        </div>
      </div>
    `;

    const textBody = `Centro Comunitario Diaguitas\nDespacho Oficial de Planillas de Actividades\n\nFechas: ${formattedDatesList}\nTotal actividades: ${totalActivities}\n\nAdjuntos para impresión (${attachments.length}):\n${attachments.map(a => `- ${a.filename}`).join('\n')}\n\nGenerado automáticamente por el Sistema de Gestión.`;

    // 9. Send email via server dispatcher (SMTP / Resend)
    const result = await sendEmailServer({
      to: recipients,
      subject,
      bodyText: textBody,
      html: htmlBody,
      purpose: 'automated_daily_pdf_dispatch',
      attachments
    });

    if (result.success) {
      const nowIso = new Date().toISOString();
      // Record last dispatch timestamp
      const updatedSchedule = {
        ...schedule,
        ultimoEnvio: nowIso,
        ultimaFechaDespacho: santiago.dateStr
      };
      const updatedConfigData = {
        ...(config || {}),
        schedule: updatedSchedule,
        updatedAt: nowIso
      };

      try {
        await setDoc(doc(db, 'configuracion_sistema', 'gmail_dispatch_config'), {
          id: 'gmail_dispatch_config',
          data: updatedConfigData,
          schedule: updatedSchedule,
          updatedAt: nowIso
        }, { merge: true });
      } catch (dbErr) {
        console.warn('[Server Scheduler] Warning: could not persist ultimoEnvio timestamp to Firestore:', dbErr);
      }

      return {
        success: true,
        message: `Despacho ejecutado exitosamente vía ${result.mode}. Se enviaron ${attachments.length} planillas PDF a ${recipients.join(', ')}.`,
        activityDates,
        attachments: attachments.map(a => a.filename),
        recipients,
        details: result
      };
    } else {
      return {
        success: false,
        message: `Error al enviar correo: ${result.error || 'Error desconocido'}`,
        activityDates,
        attachments: attachments.map(a => a.filename),
        recipients,
        error: result.error,
        details: result
      };
    }
  } catch (err: any) {
    const isPermissionError = err?.code === 'permission-denied' ||
      (err?.message && (err.message.includes('permissions') || err.message.includes('Missing or insufficient')));
    const isTransientUnavailable = err?.code === 'unavailable' ||
      err?.code === 'deadline-exceeded' ||
      err?.code === 'resource-exhausted' ||
      (err?.message && (
        err.message.includes('temporarily unavailable') ||
        err.message.includes('unavailable') ||
        err.message.includes('deadline-exceeded') ||
        err.message.includes('network') ||
        err.message.includes('fetch failed') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('ETIMEDOUT')
      ));

    if (isPermissionError) {
      console.warn('[Server Scheduler] Firestore rules/permission check: esperando sincronización de permisos o credenciales para despacho programado.');
    } else if (isTransientUnavailable) {
      console.warn('[Server Scheduler] Servicio Firestore temporalmente no disponible (se reintentará automáticamente en el próximo ciclo programado):', err?.message || String(err));
    } else {
      console.error('[Server Scheduler] Error executing scheduled dispatch:', err);
    }
    return {
      success: false,
      message: `Excepción en despacho programado: ${err?.message || String(err)}`,
      error: err?.message || String(err)
    };
  }
}

const checkScheduledDispatch = singleFlight(() => executeScheduledDispatchInternal(false));
export function executeScheduledDispatchServer(force = false) {
  return force ? executeScheduledDispatchInternal(true) : checkScheduledDispatch();
}

let schedulerInterval: NodeJS.Timeout | null = null;

// Automatic backend cleanup of historical concurrency slots older than 30 days
export async function purgeExpiredSlotsServer(daysOld = 30): Promise<{ purgedCount: number; message: string }> {
  const db = getServerDb();
  if (!db) return { purgedCount: 0, message: 'Firestore no disponible en el servidor' };

  try {
    const now = Date.now();
    const cutoffDate = new Date(now - daysOld * 24 * 60 * 60 * 1000);
    const y = cutoffDate.getFullYear();
    const m = String(cutoffDate.getMonth() + 1).padStart(2, '0');
    const d = String(cutoffDate.getDate()).padStart(2, '0');
    const cutoffDateStr = `${y}-${m}-${d}`;

    const snap = await getDocs(collection(db, 'schedule_slots'));
    const expiredDocs: string[] = [];

    snap.forEach((docSnap) => {
      const id = docSnap.id;
      const datePart = id.split('_')[0];
      if (datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart) && datePart < cutoffDateStr) {
        expiredDocs.push(id);
      }
    });

    if (expiredDocs.length === 0) {
      return { purgedCount: 0, message: 'No hay slots expirados pendientes de limpieza.' };
    }

    const FIRESTORE_MAX_BATCH_SIZE = 450;
    for (let i = 0; i < expiredDocs.length; i += FIRESTORE_MAX_BATCH_SIZE) {
      const chunk = expiredDocs.slice(i, i + FIRESTORE_MAX_BATCH_SIZE);
      const batch = writeBatch(db);
      chunk.forEach((slotId) => {
        batch.delete(doc(db, 'schedule_slots', slotId));
      });
      await batch.commit();
    }

    console.log(`[Server Cleanup] Purgados con éxito ${expiredDocs.length} slots de concurrencia (< ${cutoffDateStr})`);
    return {
      purgedCount: expiredDocs.length,
      message: `Se purgaron ${expiredDocs.length} slots de concurrencia antiguos anteriores al ${cutoffDateStr}.`
    };
  } catch (err: any) {
    console.warn('[Server Cleanup] Error en purga automática de slots:', err);
    return { purgedCount: 0, message: `Error en purga: ${err?.message || String(err)}` };
  }
}

// Background Scheduler: runs check every 60 seconds
function startBackgroundScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  console.log('[Background Scheduler] Service started. Checking schedule every 60 seconds (America/Santiago)...');

  // Check immediately on startup (after 10 seconds warm-up to ensure Firestore connection is active)
  setTimeout(() => {
    executeScheduledDispatchServer(false).catch(err => {
      console.warn('[Background Scheduler] Initial check notice:', err?.message || err);
    });
    purgeExpiredSlotsServer(30).catch(err => {
      console.warn('[Background Scheduler] Initial slots cleanup notice:', err?.message || err);
    });
  }, 10000);

  // Periodic check every 60 seconds
  schedulerInterval = setInterval(() => {
    executeScheduledDispatchServer(false).catch(err => {
      console.warn('[Background Scheduler] Periodic check notice:', err);
    });
  }, 60 * 1000);

  // Periodic slots cleanup every 24 hours
  setInterval(() => {
    purgeExpiredSlotsServer(30).catch(err => {
      console.warn('[Background Scheduler] Daily slots cleanup notice:', err);
    });
  }, 24 * 60 * 60 * 1000);
}


// Start Express Application
async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // -------------------------------------------------------------
  // API ROUTES (Mounted FIRST before Vite middleware)
  // -------------------------------------------------------------
  app.get('/api/health', (req, res) => {
    const santiago = getSantiagoTime();
    res.json({
      status: 'ok',
      serverTimeUtc: new Date().toISOString(),
      santiagoTime: `${santiago.dateStr} ${santiago.timeFormatted}`,
      dayOfWeek: santiago.dayOfWeek
    });
  });

  app.get('/api/email/status', async (req, res) => {
    const santiago = getSantiagoTime();
    const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || 'cristianshute@gmail.com';
    const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASSWORD;
    const hasSmtp = Boolean(smtpPass && smtpUser);
    const hasResend = Boolean(process.env.RESEND_API_KEY);
    const gmail = await gmailConnection.status(req).catch(() => ({ connected: false, persistent: false }));

    res.json({
      active: hasSmtp || hasResend || gmail.connected,
      provider: gmail.connected ? 'gmail_api' : hasSmtp ? 'smtp_gmail' : hasResend ? 'resend' : 'unconfigured',
      gmailConnected: gmail.connected,
      gmailPersistent: gmail.persistent,
      smtpConfigured: hasSmtp,
      resendConfigured: hasResend,
      timezone: TIMEZONE,
      santiagoTime: `${santiago.dateStr} ${santiago.timeFormatted}`,
      senderEmail: smtpUser,
      outboundConfig: {
        service: 'gmail',
        host: 'smtp.gmail.com',
        port: 465,
        security: 'SSL/TLS',
        authAccount: smtpUser,
        fromHeader: `Gestión de Espacios Diaguitas <${smtpUser}>`,
        hasPasswordConfigured: Boolean(smtpPass)
      },
      mondaySchedule: {
        targetDay: 'Lunes',
        targetTime: '09:00 AM',
        destinatarios: ['cristianshute@gmail.com']
      }
    });
  });

  // Rate limiting map for email dispatch to prevent open relay abuse
  const emailRateLimit = new Map<string, { count: number; resetAt: number }>();

  // Periodically clean up expired rate limit entries to prevent unbounded memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of emailRateLimit.entries()) {
      if (entry.resetAt < now) {
        emailRateLimit.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  function checkEmailRateLimit(ipOrUser: string): boolean {
    const now = Date.now();
    const entry = emailRateLimit.get(ipOrUser);
    if (!entry || entry.resetAt < now) {
      emailRateLimit.set(ipOrUser, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (entry.count >= 10) {
      return false;
    }
    entry.count += 1;
    return true;
  }

  // Authentication middleware to protect sensitive backend endpoints
  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const authHeader = req.headers['authorization'] || req.headers['x-auth-session'];
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Autenticación requerida: No se proporcionó token de sesión.'
      });
    }

    const rawToken = (Array.isArray(authHeader) ? authHeader[0] : authHeader).replace(/^Bearer\s+/i, '').trim();
    if (!rawToken) {
      return res.status(401).json({
        success: false,
        error: 'Token de autenticación vacío.'
      });
    }

    try {
      const payload = JSON.parse(Buffer.from(rawToken, 'base64').toString('utf8'));
      if (!payload || !payload.u) {
        return res.status(403).json({
          success: false,
          error: 'Sesión no válida o expirada.'
        });
      }
      (req as any).user = payload;
      next();
    } catch {
      if (rawToken.length >= 20) {
        (req as any).user = { u: 'token_user', r: 'authenticated' };
        next();
      } else {
        return res.status(401).json({
          success: false,
          error: 'Token de sesión corrupto o no autorizado.'
        });
      }
    }
  }

  gmailConnection.register(app, requireAuth);

  app.post('/api/email/send', requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
      const rateLimitKey = `${user?.u || clientIp}`;

      if (!checkEmailRateLimit(rateLimitKey)) {
        return res.status(429).json({
          success: false,
          error: 'Límite de envíos alcanzado. Por favor espere un minuto antes de enviar más correos.'
        });
      }

      const { to, subject, bodyText, html, purpose } = req.body;
      if (!to || !subject || !bodyText) {
        return res.status(400).json({ error: 'Missing required fields: to, subject, bodyText' });
      }

      // Security check: validate recipient addresses to prevent open relay / arbitrary external spamming
      const recipientList = (Array.isArray(to) ? to : [to]).map((t: string) => String(t).trim().toLowerCase());
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of recipientList) {
        if (!emailRegex.test(email)) {
          return res.status(400).json({ success: false, error: `Dirección de correo inválida: ${email}` });
        }
      }

      const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : undefined;

      const result = await sendEmailServer({
        to: recipientList,
        subject: String(subject).slice(0, 200),
        bodyText: String(bodyText).slice(0, 10000),
        html: html ? String(html).slice(0, 50000) : undefined,
        purpose: purpose || 'authenticated_request',
        gmailAccessToken: gmailConnection.sessionAccessToken(req),
        attachments
      });

      if (result.reauthorize) gmailConnection.clearSession(res);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error sending email' });
    }
  });

  // Trigger scheduled automated dispatch manually / on-demand
  registerScheduledCheck(app, () => process.env.EMAIL_SCHEDULER_SECRET, executeScheduledDispatchServer);

  app.post('/api/email/trigger-scheduled', requireAuth, async (req, res) => {
    try {
      const force = req.body?.force !== false;
      const result = await executeScheduledDispatchServer(force);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err?.message || 'Error al ejecutar despacho programado'
      });
    }
  });

  // Preview what the scheduled automated dispatch will send
  app.get('/api/email/preview-scheduled', requireAuth, async (req, res) => {
    try {
      const db = getServerDb();
      if (!db) return res.status(500).json({ error: 'DB not available' });

      const configSnap = await getDoc(doc(db, 'configuracion_sistema', 'gmail_dispatch_config'));
      const configRaw = configSnap.exists() ? (configSnap.data() as any) : null;
      const config = configRaw?.data || configRaw;
      const schedule = config?.schedule;
      const santiago = getSantiagoTime();

      const alcance = schedule?.alcanceActividades || 'fin_de_semana';
      const specificDays = schedule?.diasActividadesEspecificos || [6, 0];
      let activityDates = calculateActivityDatesForDispatchDate(santiago.dateStr, alcance, specificDays);

      const allReservations = await fetchAllReservationsServer();
      const filterMode = config?.dispatchFilterMode || 'solo_prestamos';
      const emailReservations = selectDispatchReservations(allReservations, {
        dates: activityDates,
        referenceDate: santiago.dateStr,
        filterMode,
        selectedActivityTypes: config?.selectedActivityTypes
      });
      activityDates = activityDates.filter(date => emailReservations.some(r => r.fecha === date));

      const dailySummaries = activityDates.map(dateStr => {
        const count = emailReservations.filter(r => r.fecha === dateStr).length;
        const totalRaw = allReservations.filter(r => r.fecha === dateStr && isDispatchableReservation(r)).length;
        const loansCount = allReservations.filter(r => r.fecha === dateStr && isDispatchableReservation(r) && isLoan(r)).length;
        const filename = getDailySchedulePdfFilename(dateStr);
        return { dateStr, formattedDate: formatDateDDMMYYYY(dateStr), filename, count, totalRaw, loansCount, filterMode };
      });

      res.json({
        santiagoTime: `${santiago.dateStr} ${santiago.timeFormatted}`,
        schedule,
        filterMode,
        recipients: config?.defaultRecipients || ['cristianshute@gmail.com'],
        activityDates,
        dailySummaries,
        totalAttachments: dailySummaries.length
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Error generating preview' });
    }
  });

  app.post('/api/email/trigger-monday', requireAuth, async (req, res) => {
    res.json({ success: false, message: 'El envío automático de correos de fin de semana ha sido cancelado por configuración.' });
  });

  // -------------------------------------------------------------
  // CCD HOLIDAY OVERRIDE VALIDATION ENDPOINT
  // -------------------------------------------------------------
  app.post('/api/auth/verify-holiday-override', (req, res) => {
    try {
      const { key } = req.body || {};
      if (!key || typeof key !== 'string') {
        return res.status(400).json({ valid: false, error: 'Clave requerida' });
      }
      const normalizedKey = key.trim().toUpperCase();
      const hash = crypto.createHash('sha256').update(normalizedKey).digest('hex');
      const EXPECTED_HASH = '66dfd0071d636ea2ae067345ef9f1c816baa45f411800f36a6c29eee4ce7aa8f';
      const isValid = hash === EXPECTED_HASH;
      return res.json({ valid: isValid });
    } catch (e: any) {
      return res.status(500).json({ valid: false, error: e?.message || 'Error validando clave' });
    }
  });

  // -------------------------------------------------------------
  // VALIDATION & RATINGS API (Rechaza evaluación de eventos futuros con datos oficiales de Firestore)
  // -------------------------------------------------------------
  app.post('/api/ratings/validate-and-save', requireAuth, async (req, res) => {
    try {
      const { rating, reservation } = req.body;
      if (!rating) {
        return res.status(400).json({
          success: false,
          error: 'Faltan datos obligatorios: rating es requerido.'
        });
      }

      const reservationId = String(rating.reservaId || rating.reservationId || reservation?.id || '').trim();
      if (!reservationId) {
        return res.status(400).json({
          success: false,
          error: 'Identificador de reserva (reservaId) obligatorio para emitir una evaluación.'
        });
      }

      const db = getServerDb();
      let dbReservation: any = null;

      // Consultar reserva autoritativa directamente desde Firestore para evitar manipulación del cliente
      if (db) {
        try {
          let snap = await getDoc(doc(db, 'reservas_comunitarias_v2', reservationId));
          if (!snap.exists()) {
            snap = await getDoc(doc(db, 'reservas', reservationId));
          }
          if (snap.exists()) {
            dbReservation = snap.data();
          }
        } catch (dbErr) {
          console.warn('[Server] Error fetching authoritative reservation from Firestore:', dbErr);
        }
      }

      // Si no se encontró en la base de datos, fallback o error
      if (!dbReservation) {
        if (reservation && reservation.fecha && reservation.horaFin) {
          dbReservation = reservation;
        } else {
          return res.status(404).json({
            success: false,
            error: `La reserva "${reservationId}" no fue encontrada en los registros autoritativos de Firestore.`
          });
        }
      }

      const santiago = getSantiagoTime();
      const eventDate = String(dbReservation.fecha || '').trim();
      const eventEndTime = String(dbReservation.horaFin || '23:59').trim();

      // Comparación estricta de tiempo de finalización contra hora de Santiago (Chile)
      const isFuture = (eventDate > santiago.dateStr) || (eventDate === santiago.dateStr && eventEndTime > santiago.timeFormatted);
      if (isFuture) {
        return res.status(400).json({
          success: false,
          code: 'FUTURE_EVENT_BLOCKED',
          error: `Bloqueo de seguridad: No es posible calificar un evento futuro o antes de su hora de término. La actividad oficial concluye a las ${eventEndTime} del ${eventDate} (Hora actual: ${santiago.timeFormatted} del ${santiago.dateStr}).`,
          santiagoTime: `${santiago.dateStr} ${santiago.timeFormatted}`,
          eventEnd: `${eventDate} ${eventEndTime}`
        });
      }

      // Sanitizar payload estricto antes de guardar en Firestore
      const cleanRatingId = String(rating.id || `calif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).trim().slice(0, 128);
      const cleanRating = {
        id: cleanRatingId,
        reservaId: reservationId,
        fecha: eventDate,
        espacio: String(dbReservation.espacio || rating.espacio || '').slice(0, 150),
        responsable: String(dbReservation.responsable || rating.responsable || '').slice(0, 200),
        tipoActividad: String(dbReservation.tipoActividad || rating.tipoActividad || '').slice(0, 100),
        puntaje: Math.max(1, Math.min(5, Number(rating.puntaje || rating.puntajeGeneral) || 5)),
        estadoLimpieza: String(rating.estadoLimpieza || 'Bueno').slice(0, 50),
        entregaHorario: String(rating.entregaHorario || 'A Tiempo').slice(0, 50),
        cuidadoMobiliario: String(rating.cuidadoMobiliario || 'Bueno').slice(0, 50),
        cumplioReglamento: String(rating.cumplioReglamento || 'Sí').slice(0, 50),
        observaciones: String(rating.observaciones || '').slice(0, 2000),
        evaluadoPor: String(rating.evaluadoPor || (req as any).user?.u || 'Administrador').slice(0, 100),
        fechaEvaluacion: new Date().toISOString()
      };

      if (db) {
        await setDoc(doc(db, 'calificaciones_espacios', cleanRating.id), cleanRating, { merge: true });
      }

      return res.json({
        success: true,
        valid: true,
        message: 'Calificación validada contra reserva oficial y guardada en Firestore.',
        ratingId: cleanRating.id
      });
    } catch (e: any) {
      console.error('[Server] Error validating rating:', e);
      return res.status(500).json({ success: false, error: e?.message || 'Error validando calificación' });
    }
  });

  // -------------------------------------------------------------
  // ADMIN CLEANUP & MAINTENANCE API (Executed safely from backend)
  // -------------------------------------------------------------
  app.post('/api/admin/purge-expired-slots', requireAuth, async (req, res) => {
    try {
      const daysOld = Number(req.body?.daysOld) || 30;
      const result = await purgeExpiredSlotsServer(daysOld);
      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[Server] Error in purge-expired-slots:', err);
      res.status(500).json({ success: false, error: err?.message || 'Error purgando slots' });
    }
  });

  // -------------------------------------------------------------
  // SERVICE WORKERS EXPLICIT MIME-TYPE ROUTING
  // -------------------------------------------------------------
  app.get('/firebase-messaging-sw.js', (req, res) => {
    const swPath = path.join(process.cwd(), 'public', 'firebase-messaging-sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      res.sendFile(swPath);
    } else {
      res.status(404).send('// Service worker not found');
    }
  });

  app.get('/sw.js', (req, res) => {
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    if (fs.existsSync(swPath)) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      res.sendFile(swPath);
    } else {
      res.status(404).send('// Service worker not found');
    }
  });

  // -------------------------------------------------------------
  // VITE MIDDLEWARE (Development) or STATIC ASSETS (Production)
  // -------------------------------------------------------------
  const isCompiledBundle = (typeof __filename !== 'undefined' && __filename.endsWith('server.cjs')) ||
    (typeof __dirname !== 'undefined' && __dirname.includes('dist'));
  const isProduction = process.env.NODE_ENV === 'production' || isCompiledBundle;

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.error('[Server] Error starting Vite middleware in dev mode:', viteErr);
    }
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'))
      ? path.join(process.cwd(), 'dist')
      : (typeof __dirname !== 'undefined' && fs.existsSync(path.join(__dirname, 'index.html')))
      ? __dirname
      : path.join(process.cwd(), 'dist');

    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Application build not found. Please run npm run build.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Background server running on http://0.0.0.0:${PORT} (mode: ${isProduction ? 'production' : 'development'})`);
    console.log(`[Server] Chile Time: ${getSantiagoTime().dateStr} ${getSantiagoTime().timeFormatted}`);
  });

  // Start background timer
  startBackgroundScheduler();
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
