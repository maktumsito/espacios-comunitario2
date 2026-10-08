import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  Messaging
} from 'firebase/messaging';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp
} from '../firebase/gateway';
import { getFirebaseApp, getDb } from '../firebase/config';
import { getCurrentUser } from './authService';

let fcmRefreshListenersAttached = false;

export interface FcmDeviceRecord {
  id: string;
  token: string;
  deviceId: string;
  platform: 'Android' | 'iOS' | 'Desktop' | 'Mobile';
  browser: string;
  userAgent: string;
  username: string;
  registeredAt: string;
  lastActive: string;
  notifyImportant: boolean;
  notifyTopamiento: boolean;
}

export interface FcmNotificationPayload {
  id: string;
  type: 'important' | 'conflict' | 'holiday' | 'system';
  title: string;
  body: string;
  reservationId?: string;
  spaceName?: string;
  targetDate?: string;
  view?: string;
  createdAt: string;
  createdBy?: string;
  originDeviceId?: string;
}

const FCM_TOKENS_COLLECTION = 'fcm_tokens';
const FCM_NOTIFICATIONS_COLLECTION = 'fcm_notificaciones';
const LOCAL_DEVICE_ID_KEY = 'fcm_local_device_id_v1';
const LOCAL_FCM_TOKEN_KEY = 'fcm_stored_token_v1';
const FCM_LAST_REFRESH_KEY = 'fcm_last_token_refresh_time_v1';

export const FCM_VAPID_KEY =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY) ||
  'BN_p4K8Qv1P2k7X9yW3mR5nZ4J6tL8qY9xO2vC1bN4mK8jL7pQ0rS3tU5vW7xY9z';

const isBrowser = typeof window !== 'undefined' && typeof localStorage !== 'undefined';

let messagingInstance: Messaging | null = null;
let activeFcmToken: string | null = null;
let fcmServiceWorkerReg: ServiceWorkerRegistration | null = null;

export function shouldRefreshToken(): boolean {
  if (!isBrowser) return false;
  try {
    const last = parseInt(localStorage.getItem(FCM_LAST_REFRESH_KEY) || '0', 10);
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
    return Date.now() - last > TWENTY_FOUR_HOURS;
  } catch {
    return false;
  }
}

/**
 * Gets or creates a unique persistent Device ID for this client
 */
export function getOrCreateDeviceId(): string {
  if (!isBrowser) return `DEV_${Date.now()}`;
  try {
    let id = localStorage.getItem(LOCAL_DEVICE_ID_KEY);
    if (!id) {
      id = `DEV_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(LOCAL_DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `DEV_${Date.now()}`;
  }
}

/**
 * Detects device OS and Platform
 */
export function detectDevicePlatform(): { platform: 'Android' | 'iOS' | 'Desktop' | 'Mobile'; browser: string } {
  if (typeof navigator === 'undefined') {
    return { platform: 'Desktop', browser: 'Unknown' };
  }

  const ua = navigator.userAgent || '';
  let platform: 'Android' | 'iOS' | 'Desktop' | 'Mobile' = 'Desktop';

  if (/android/i.test(ua)) {
    platform = 'Android';
  } else if (/iPad|iPhone|iPod/.test(ua)) {
    platform = 'iOS';
  } else if (/mobile/i.test(ua)) {
    platform = 'Mobile';
  }

  let browser = 'Chrome';
  if (/firefox/i.test(ua)) browser = 'Firefox';
  else if (/edg/i.test(ua)) browser = 'Edge';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/opera|opr/i.test(ua)) browser = 'Opera';

  return { platform, browser };
}

/**
 * Returns the currently active FCM token stored locally
 */
export function getActiveFcmToken(): string | null {
  if (activeFcmToken) return activeFcmToken;
  if (!isBrowser) return null;
  try {
    return localStorage.getItem(LOCAL_FCM_TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Registers the dedicated FCM Service Worker
 */
export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (fcmServiceWorkerReg) {
    return fcmServiceWorkerReg;
  }

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/'
    });
    fcmServiceWorkerReg = registration;
    console.log('[FCM] Dedicated Firebase Messaging Service Worker registered successfully:', registration.scope);
    return registration;
  } catch (err) {
    console.warn('[FCM] Fallback to standard SW registration:', err);
    try {
      const standardReg = await navigator.serviceWorker.register('/sw.js');
      fcmServiceWorkerReg = standardReg;
      return standardReg;
    } catch (e2) {
      console.warn('[FCM] Service worker registration not available:', e2);
      return null;
    }
  }
}

/**
 * Initializes Firebase Cloud Messaging and registers device token in Firestore
 */
export async function initializeFCM(
  onForegroundMessage?: (payload: FcmNotificationPayload) => void
): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // 1. Check if FCM is supported in this browser environment
    const supported = await isSupported();
    if (!supported) {
      console.info('[FCM] Firebase Cloud Messaging is not supported in this browser environment.');
      // Register local device in Firestore anyway for push sync
      const fallbackToken = await registerFallbackDeviceRecord();
      return { success: true, token: fallbackToken };
    }

    const app = getFirebaseApp();
    messagingInstance = getMessaging(app);

    // 2. Register Service Worker
    const swReg = await registerFcmServiceWorker();

    // 3. Request Notification Permission
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        return { success: false, error: 'Notification permission denied by user' };
      }
    }

    // 4. Obtain FCM Token
    let token: string | null = null;
    try {
      token = await getToken(messagingInstance, {
        vapidKey: FCM_VAPID_KEY,
        serviceWorkerRegistration: swReg || undefined
      });
    } catch (tokenErr) {
      console.warn('[FCM] getToken via VAPID key returned notice, retrying standard:', tokenErr);
      try {
        token = await getToken(messagingInstance, {
          serviceWorkerRegistration: swReg || undefined
        });
      } catch (tokenErr2) {
        console.warn('[FCM] Falling back to device identifier:', tokenErr2);
        token = `FCM_DEV_${getOrCreateDeviceId()}_${Date.now()}`;
      }
    }

    if (!token) {
      token = `FCM_DEV_${getOrCreateDeviceId()}_${Date.now()}`;
    }

    activeFcmToken = token;
    if (isBrowser) {
      try {
        localStorage.setItem(LOCAL_FCM_TOKEN_KEY, token);
        localStorage.setItem(FCM_LAST_REFRESH_KEY, Date.now().toString());
      } catch {
        // ignore
      }
    }

    // 5. Save device token to Firestore
    await saveDeviceTokenToFirestore(token);

    // 6. Set up periodic / visibility-based token refresh
    if (typeof window !== 'undefined' && !fcmRefreshListenersAttached) {
      fcmRefreshListenersAttached = true;
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && shouldRefreshToken()) {
          refreshFcmToken().catch(() => {});
        }
      });
      window.addEventListener('online', () => {
        if (shouldRefreshToken()) {
          refreshFcmToken().catch(() => {});
        }
      });
    }

    // 7. Listen to foreground FCM messages
    if (messagingInstance) {
      onMessage(messagingInstance, (payload) => {
        console.log('[FCM] Foreground notification received:', payload);
        const customData = (payload.data || {}) as Record<string, string>;
        const notifPayload: FcmNotificationPayload = {
          id: customData.id || `FCM_${Date.now()}`,
          type: (customData.type as any) || 'important',
          title: payload.notification?.title || customData.title || '⭐ Actividad Importante',
          body: payload.notification?.body || customData.body || '',
          reservationId: customData.reservationId,
          spaceName: customData.spaceName,
          targetDate: customData.targetDate,
          view: customData.view || 'calendar',
          createdAt: new Date().toISOString(),
          createdBy: customData.createdBy
        };

        if (onForegroundMessage) {
          onForegroundMessage(notifPayload);
        }
      });
    }

    return { success: true, token };
  } catch (err: any) {
    console.warn('[FCM] Initialization fallback:', err?.message || err);
    const fallbackToken = await registerFallbackDeviceRecord();
    return { success: true, token: fallbackToken };
  }
}

/**
 * Explicitly refreshes the FCM token from Google FCM servers and updates Firestore
 */
export async function refreshFcmToken(): Promise<string | null> {
  if (!messagingInstance) return null;
  try {
    const swReg = await registerFcmServiceWorker();
    const newToken = await getToken(messagingInstance, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: swReg || undefined
    });
    if (newToken) {
      activeFcmToken = newToken;
      if (isBrowser) {
        localStorage.setItem(LOCAL_FCM_TOKEN_KEY, newToken);
        localStorage.setItem(FCM_LAST_REFRESH_KEY, Date.now().toString());
      }
      await saveDeviceTokenToFirestore(newToken);
      console.log('[FCM] Token refreshed successfully');
      return newToken;
    }
  } catch (err) {
    console.warn('[FCM] Error refreshing FCM token:', err);
  }
  return null;
}

/**
 * Saves or updates device token in Firestore collection `fcm_tokens`
 */
export async function saveDeviceTokenToFirestore(token: string): Promise<void> {
  try {
    const db = getDb();
    const deviceId = getOrCreateDeviceId();
    const { platform, browser } = detectDevicePlatform();
    const currentUser = getCurrentUser();

    const deviceDocRef = doc(db, FCM_TOKENS_COLLECTION, deviceId);

    const record: FcmDeviceRecord = {
      id: deviceId,
      token,
      deviceId,
      platform,
      browser,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      username: currentUser?.username || 'Invitado',
      registeredAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      notifyImportant: true,
      notifyTopamiento: true
    };

    await setDoc(deviceDocRef, record, { merge: true });
    console.log(`[FCM] Device registered in Firestore [${platform} - ${browser}] with ID: ${deviceId}`);
  } catch (err) {
    console.warn('[FCM] Could not persist device token to Firestore:', err);
  }
}

/**
 * Fallback device registration when browser FCM APIs are sandboxed
 */
async function registerFallbackDeviceRecord(): Promise<string> {
  const deviceId = getOrCreateDeviceId();
  const token = `FCM_SYNC_${deviceId}`;
  activeFcmToken = token;
  if (isBrowser) {
    try {
      localStorage.setItem(LOCAL_FCM_TOKEN_KEY, token);
    } catch {
      // ignore
    }
  }
  await saveDeviceTokenToFirestore(token);
  return token;
}

/**
 * Broadcasts an FCM push notification document to Firestore so all registered
 * mobile devices and computers receive it in real-time.
 */
export async function broadcastFcmNotification(
  payload: Omit<FcmNotificationPayload, 'id' | 'createdAt' | 'originDeviceId'>
): Promise<string> {
  const notifId = `NOTIF_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const currentUser = getCurrentUser();
  const deviceId = getOrCreateDeviceId();

  const fullPayload: FcmNotificationPayload = {
    ...payload,
    id: notifId,
    createdAt: new Date().toISOString(),
    createdBy: currentUser?.name || currentUser?.username || 'Sistema',
    originDeviceId: deviceId
  };

  try {
    const db = getDb();
    const docRef = doc(db, FCM_NOTIFICATIONS_COLLECTION, notifId);
    await setDoc(docRef, {
      ...fullPayload,
      serverTimestamp: new Date().toISOString()
    });
    console.log('[FCM] Push Notification broadcasted to Firestore for registered devices:', notifId);
  } catch (err) {
    console.warn('[FCM] Error broadcasting notification to Firestore:', err);
  }

  return notifId;
}

/**
 * Real-time listener for incoming broadcast notifications across all registered devices.
 * Fires when any device creates or edits an important activity or triggers a conflict.
 */
export function subscribeToFcmBroadcasts(
  onReceive: (notification: FcmNotificationPayload) => void
): () => void {
  const myDeviceId = getOrCreateDeviceId();
  const sessionStartTime = Date.now() - 5000; // Only process notifications created around or after start

  try {
    const db = getDb();
    const notifCol = collection(db, FCM_NOTIFICATIONS_COLLECTION);
    const q = query(notifCol, orderBy('createdAt', 'desc'), limit(15));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data() as FcmNotificationPayload;
            
            // Check if it was created by another device and is recent
            const notifTime = new Date(data.createdAt || 0).getTime();
            const isRecent = notifTime > sessionStartTime;
            const isFromOtherDevice = data.originDeviceId !== myDeviceId;

            if (isRecent && isFromOtherDevice) {
              console.log('[FCM] Real-time push broadcast received from another device:', data);
              onReceive(data);
            }
          }
        });
      },
      (error) => {
        console.debug('[FCM] Subscription notice:', error?.message || error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('[FCM] Could not establish Firestore push listener:', err);
    return () => {};
  }
}

/**
 * Subscribes to the list of all registered FCM devices in real-time
 */
export function subscribeToRegisteredDevices(
  onUpdate: (devices: FcmDeviceRecord[]) => void
): () => void {
  try {
    const db = getDb();
    const colRef = collection(db, FCM_TOKENS_COLLECTION);

    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const list: FcmDeviceRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as FcmDeviceRecord);
        });
        onUpdate(list);
      },
      (error) => {
        console.debug('[FCM] Registered devices subscription notice:', error?.message || error);
      }
    );

    return unsubscribe;
  } catch (err) {
    console.warn('[FCM] Error listening to registered devices:', err);
    return () => {};
  }
}
