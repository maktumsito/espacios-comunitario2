import { Reservation, BookingConflict } from '../types';
import { DetectedConflictDetail } from '../utils/conflictDetector';
import { formatDateDDMMYYYY, getChileLocalDateString } from '../utils/dateUtils';
import {
  broadcastFcmNotification,
  initializeFCM,
  subscribeToFcmBroadcasts,
  registerFcmServiceWorker,
  FcmNotificationPayload
} from './fcmService';

export interface AppNotificationItem {
  id: string;
  type: 'conflict' | 'important' | 'holiday' | 'system';
  title: string;
  body: string;
  timestamp: string; // ISO date string
  read: boolean;
  reservationId?: string;
  spaceName?: string;
  targetDate?: string;
  view?: string;
}

export interface NotificationSettings {
  enabled: boolean;
  notifyTopamiento: boolean;
  notifyImportant: boolean;
  notifyHolidays: boolean;
  notifyDailyReminder: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

const SETTINGS_STORAGE_KEY = 'cc_notification_settings_v1';
const HISTORY_STORAGE_KEY = 'cc_notification_history_v1';
const LAST_DAILY_CHECK_KEY = 'cc_notification_last_daily_check';

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  notifyTopamiento: true,
  notifyImportant: true,
  notifyHolidays: true,
  notifyDailyReminder: true,
  soundEnabled: true,
  vibrationEnabled: true
};

// 1. Storage Helpers
export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('app_notification_settings_changed', { detail: settings }));
  } catch (err) {
    console.error('Error saving notification settings:', err);
  }
}

export function getNotificationHistory(): AppNotificationItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveNotificationHistory(history: AppNotificationItem[]): void {
  try {
    // Keep last 50 notifications
    const trimmed = history.slice(0, 50);
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent('app_notification_history_changed', { detail: trimmed }));
  } catch (err) {
    console.error('Error saving notification history:', err);
  }
}

export function markNotificationAsRead(id: string): void {
  const current = getNotificationHistory();
  const updated = current.map(item => item.id === id ? { ...item, read: true } : item);
  saveNotificationHistory(updated);
}

export function markAllNotificationsAsRead(): void {
  const current = getNotificationHistory();
  const updated = current.map(item => ({ ...item, read: true }));
  saveNotificationHistory(updated);
}

export function clearNotificationHistory(): void {
  saveNotificationHistory([]);
}

// 2. Android & Browser Capabilities Detection
export function isPushNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent || '');
}

export function isServiceWorkerSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

// 3. Service Worker Registration & FCM Initialization
let swRegistration: ServiceWorkerRegistration | null = null;

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  try {
    const reg = await registerFcmServiceWorker();
    if (reg) {
      swRegistration = reg;
      return reg;
    }
    const fallbackReg = await navigator.serviceWorker.register('/sw.js');
    swRegistration = fallbackReg;
    return fallbackReg;
  } catch (err) {
    console.warn('Service worker registration not available or sandboxed:', err);
    return null;
  }
}

let unsubscribeFcm: (() => void) | null = null;

/**
 * Initializes notification listeners and background FCM sync safely after login.
 * Returns an unsubscribe teardown function.
 */
export function initNotificationListeners(): () => void {
  if (typeof window === 'undefined') return () => {};

  registerServiceWorker().catch(() => {});

  if (!unsubscribeFcm) {
    unsubscribeFcm = subscribeToFcmBroadcasts((payload: FcmNotificationPayload) => {
      dispatchNotification({
        type: payload.type,
        title: payload.title,
        body: payload.body,
        reservationId: payload.reservationId,
        spaceName: payload.spaceName,
        targetDate: payload.targetDate,
        view: payload.view,
        isRemoteBroadcast: true
      });
    });
  }

  // Try silent FCM initialization only if permission was previously granted
  if (isPushNotificationSupported() && Notification.permission === 'granted') {
    initializeFCM().catch(() => {});
  }

  return () => {
    if (unsubscribeFcm) {
      unsubscribeFcm();
      unsubscribeFcm = null;
    }
  };
}

// 4. Permission Request & FCM Device Registration
export async function requestPushPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isPushNotificationSupported()) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const current = getNotificationSettings();
      saveNotificationSettings({ ...current, enabled: true });
      await registerServiceWorker();
      await initializeFCM();
    }
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

// 5. Web Audio API Sound Synthesizer (Zero External Dependencies)
export function playNotificationTone(type: 'important' | 'conflict' | 'holiday' | 'system' | 'test' | 'default' = 'default'): void {
  const settings = getNotificationSettings();
  if (!settings.soundEnabled) return;

  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    if (type === 'conflict') {
      // Urgent double warning tone (A4 -> F4 -> A4)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(349.23, now + 0.12);
      osc.frequency.setValueAtTime(440, now + 0.24);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.start(now);
      osc.stop(now + 0.4);
    } else if (type === 'important') {
      // Pleasant melodic chime for important activities (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);

        gain.gain.setValueAtTime(0.18, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.35);
      });
    } else {
      // Soft pleasant chime for test / general notifications
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    }
  } catch (err) {
    console.warn('Audio tone synthesis not available or blocked:', err);
  }
}

// 6. Haptic Vibration for Android Phones
export function triggerHapticFeedback(type: 'important' | 'conflict' | 'holiday' | 'system' | 'test' | 'default' = 'test'): void {
  const settings = getNotificationSettings();
  if (!settings.vibrationEnabled) return;

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      if (type === 'conflict') {
        // Distinctive warning vibration pattern
        navigator.vibrate([200, 100, 200, 100, 300]);
      } else if (type === 'important') {
        // Double pulse for important activity
        navigator.vibrate([150, 80, 250]);
      } else {
        // Quick feedback vibration
        navigator.vibrate([100, 50, 100]);
      }
    } catch {
      // Haptics suppressed by device policy
    }
  }
}

// 7. Core Dispatcher: Push & In-App Notification
export interface DispatchNotificationParams {
  type: 'conflict' | 'important' | 'holiday' | 'system';
  title: string;
  body: string;
  reservationId?: string;
  spaceName?: string;
  targetDate?: string;
  view?: string;
  silent?: boolean;
  isRemoteBroadcast?: boolean;
}

export async function dispatchNotification({
  type,
  title,
  body,
  reservationId,
  spaceName,
  targetDate,
  view,
  silent = false,
  isRemoteBroadcast = false
}: DispatchNotificationParams): Promise<void> {
  const settings = getNotificationSettings();
  if (!settings.enabled) return;

  // Filter based on specific category settings
  if (type === 'conflict' && !settings.notifyTopamiento) return;
  if (type === 'important' && !settings.notifyImportant) return;
  if (type === 'holiday' && !settings.notifyHolidays) return;

  // 1. Audio and Haptics
  if (!silent) {
    playNotificationTone(type);
    triggerHapticFeedback(type);
  }

  // 2. Save in History
  const historyItem: AppNotificationItem = {
    id: `NOTIF_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    title,
    body,
    timestamp: new Date().toISOString(),
    read: false,
    reservationId,
    spaceName,
    targetDate,
    view
  };

  const history = getNotificationHistory();
  saveNotificationHistory([historyItem, ...history]);

  // 3. Send Firebase Cloud Messaging (FCM) broadcast to other registered mobile devices/computers
  if (!isRemoteBroadcast && (type === 'important' || type === 'conflict')) {
    broadcastFcmNotification({
      type,
      title,
      body,
      reservationId,
      spaceName,
      targetDate,
      view
    }).catch((err) => console.debug('[FCM] Broadcast notice:', err));
  }

  // 4. Web Push / Native Mobile Push Notification
  if (isPushNotificationSupported() && Notification.permission === 'granted') {
    try {
      const notificationOptions: NotificationOptions = {
        body,
        tag: `${type}-${reservationId || Date.now()}`,
        data: {
          url: window.location.origin,
          view: view || (type === 'conflict' ? 'conflicts' : 'calendar'),
          reservationId
        },
        requireInteraction: type === 'conflict' || type === 'important'
      };

      // Service Worker (Mobile Android Chrome / PWA / Desktop)
      if (swRegistration && 'showNotification' in swRegistration) {
        await swRegistration.showNotification(title, {
          ...notificationOptions,
          vibrate: type === 'conflict' ? [200, 100, 200, 100, 300] : [150, 80, 250]
        } as NotificationOptions);
      } else {
        // Fallback to Native Notification
        const notif = new Notification(title, notificationOptions);
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      }
    } catch (err) {
      console.warn('Native notification dispatch failed:', err);
    }
  }
}

// 8. Specialized High-Level Notification Triggers

/**
 * Dispatches notification when Topamiento / Overlap conflicts are detected
 */
export function notifyTopamiento(conflicts: (DetectedConflictDetail | BookingConflict)[]): void {
  if (!conflicts || conflicts.length === 0) return;

  const count = conflicts.length;
  const first = conflicts[0];
  
  const space = 'espacio' in first ? first.espacio : '';
  const date = 'fecha' in first ? first.fecha : '';

  let body = '';
  if (count === 1) {
    if ('reserva' in first && 'conflictingWith' in first) {
      body = `Solapamiento en ${first.espacio} el ${date}: "${first.reserva.descripcion || first.reserva.tipoActividad}" choca con "${first.conflictingWith.descripcion || first.conflictingWith.tipoActividad}".`;
    } else if ('reservaA' in first && 'reservaB' in first) {
      body = `Solapamiento en ${space} el ${date}: "${first.reservaA.descripcion || first.reservaA.tipoActividad}" y "${first.reservaB.descripcion || first.reservaB.tipoActividad}".`;
    }
  } else {
    body = `Se detectaron ${count} choques de horario en ${space ? space + ' y otros espacios' : 'el calendario'}. Revisa y reubica las reservas.`;
  }

  dispatchNotification({
    type: 'conflict',
    title: `⚠️ ${count > 1 ? `${count} Topamientos de Horario` : 'Topamiento de Horario'} Detectado`,
    body,
    spaceName: space,
    targetDate: date,
    view: 'conflicts'
  });
}

/**
 * Dispatches notification for an activity marked as IMPORTANT ⭐
 */
export function notifyImportantActivity(
  reserva: Reservation,
  action: 'created' | 'updated' | 'starting_today' = 'created'
): void {
  if (!reserva || reserva.importante !== 'Sí') return;

  let title = `⭐ Actividad Importante: ${reserva.tipoActividad}`;
  let body = '';

  if (action === 'created') {
    title = `⭐ Nueva Actividad Importante Agendada`;
    body = `"${reserva.descripcion || reserva.tipoActividad}" (${reserva.responsable}) en ${reserva.espacio} para el ${formatDateDDMMYYYY(reserva.fecha)} de ${reserva.horaInicio} a ${reserva.horaFin}.`;
  } else if (action === 'starting_today') {
    title = `⭐ Actividad Importante Programada para HOY`;
    body = `Hoy en ${reserva.espacio}: "${reserva.descripcion || reserva.tipoActividad}" a las ${reserva.horaInicio} - ${reserva.horaFin} (${reserva.responsable}).`;
  } else {
    title = `⭐ Actividad Importante Modificada`;
    body = `Actualizada "${reserva.descripcion || reserva.tipoActividad}" en ${reserva.espacio} (${formatDateDDMMYYYY(reserva.fecha)}, ${reserva.horaInicio} - ${reserva.horaFin}).`;
  }

  dispatchNotification({
    type: 'important',
    title,
    body,
    reservationId: reserva.id,
    spaceName: reserva.espacio,
    targetDate: reserva.fecha,
    view: 'calendar',
    isRemoteBroadcast: action === 'starting_today'
  });
}

/**
 * Daily check for activities marked as important for today
 */
export function checkTodayImportantActivities(reservations: Reservation[]): void {
  const settings = getNotificationSettings();
  if (!settings.enabled || !settings.notifyDailyReminder || !settings.notifyImportant) return;

  const todayStr = getChileLocalDateString();
  const lastCheck = localStorage.getItem(LAST_DAILY_CHECK_KEY);

  // Run at most once per day per session
  if (lastCheck === todayStr) return;

  const todayImportant = reservations.filter(
    r => r.fecha === todayStr && r.importante === 'Sí'
  );

  if (todayImportant.length > 0) {
    localStorage.setItem(LAST_DAILY_CHECK_KEY, todayStr);
    
    if (todayImportant.length === 1) {
      notifyImportantActivity(todayImportant[0], 'starting_today');
    } else {
      dispatchNotification({
        type: 'important',
        title: `⭐ ${todayImportant.length} Actividades Importantes HOY`,
        body: `Tienes ${todayImportant.length} actividades prioritarias programadas para hoy: ${todayImportant.map(t => `${t.espacio} (${t.horaInicio})`).join(', ')}.`,
        targetDate: todayStr,
        view: 'daily',
        isRemoteBroadcast: true
      });
    }
  }
}

/**
 * Sends a full test notification (Push + Android haptic vibration + audio synthesizer)
 */
export async function sendTestNotification(): Promise<void> {
  const isAndroid = isAndroidDevice();
  
  await dispatchNotification({
    type: 'system',
    title: isAndroid ? '📱 Notificación Móvil Android Activa' : '🔔 Notificación de Prueba Exitosa',
    body: isAndroid
      ? '¡Tu celular Android está configurado para recibir alertas de topamiento y actividades importantes!'
      : 'Las alertas de doble reserva y actividades importantes están funcionando correctamente.',
    view: 'calendar'
  });
}
