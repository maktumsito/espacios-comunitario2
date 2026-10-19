import { useEffect, useRef } from 'react';
import { getSessionRemainingMs, getSessionTokenRemainingMs, hasBrowserSessionChanged, isSessionExpired,
  recordSessionActivity, refreshSession, SESSION_DURATION_MS } from '../services/authService';

const RENEW_BEFORE_MS = 5 * 60_000;
const RETRY_MS = 30_000;
const activityEvents = ['mousemove', 'pointermove', 'mousedown', 'pointerdown', 'keydown', 'input', 'change', 'touchstart', 'touchmove', 'wheel'] as const;

/** Deadlines also need checking when browsers resume suspended background tabs. */
export function useSessionExpiry(enabled: boolean, onExpire: (reason: 'expired' | 'changed') => void) {
  const callback = useRef(onExpire);
  callback.current = onExpire;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let expired = false;
    let disposed = false;
    let refreshing = false;
    let retryAfter = 0;
    const check = () => {
      clearTimeout(timer);
      if (expired || disposed) return;
      if (hasBrowserSessionChanged()) {
        expired = true;
        callback.current('changed');
        return;
      }
      if (isSessionExpired()) {
        expired = true;
        callback.current('expired');
        return;
      }
      const now = Date.now();
      const idleRemaining = getSessionRemainingMs(now);
      const tokenRemaining = getSessionTokenRemainingMs(now);
      let nextCheck = Math.min(idleRemaining, tokenRemaining);
      // Only activity can extend the idle deadline. Background renewal keeps
      // the server credential valid without counting as user interaction.
      if (idleRemaining > tokenRemaining) {
        if (!refreshing && Date.now() >= retryAfter && tokenRemaining <= RENEW_BEFORE_MS) {
          refreshing = true;
          void refreshSession(SESSION_DURATION_MS, { preserveIdleDeadline: true })
            .catch(() => { retryAfter = Date.now() + RETRY_MS; })
            .finally(() => { refreshing = false; check(); });
        }
        nextCheck = Math.min(nextCheck, refreshing ? RETRY_MS :
          Math.max(1, retryAfter - Date.now(), tokenRemaining - RENEW_BEFORE_MS));
      }
      timer = setTimeout(check, Math.max(1, nextCheck));
    };
    const activity = () => {
      if (expired || disposed) return;
      recordSessionActivity();
      check();
    };
    check();
    for (const event of activityEvents) window.addEventListener(event, activity, { capture: true, passive: true });
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('storage', check);
    window.addEventListener('auth-session-changed', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      disposed = true;
      clearTimeout(timer);
      for (const event of activityEvents) window.removeEventListener(event, activity, true);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('storage', check);
      window.removeEventListener('auth-session-changed', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled]);
}
