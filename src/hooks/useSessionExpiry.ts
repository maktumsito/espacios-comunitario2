import { useEffect, useRef } from 'react';
import { getSessionRemainingMs, hasBrowserSessionChanged, isSessionExpired, SESSION_DURATION_MS } from '../services/authService';

/** Deadlines also need checking when browsers resume suspended background tabs. */
export function useSessionExpiry(enabled: boolean, onExpire: (reason: 'expired' | 'changed') => void) {
  const callback = useRef(onExpire);
  callback.current = onExpire;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let expired = false;
    const check = () => {
      clearTimeout(timer);
      if (expired) return;
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
      timer = setTimeout(check, Math.max(1, Math.min(SESSION_DURATION_MS, getSessionRemainingMs())));
    };
    check();
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    window.addEventListener('storage', check);
    window.addEventListener('auth-session-changed', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      window.removeEventListener('storage', check);
      window.removeEventListener('auth-session-changed', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [enabled]);
}
