import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Reservation } from '../types';
import { getChileLocalDateString } from '../utils/dateUtils';
import { getDueReplacementReminders, replacementReminderKey } from '../utils/replacementReminders';

function storageKey(username: string): string {
  return `cc_replacement_reminders_v1:${encodeURIComponent(username.trim().toLowerCase())}`;
}

function readAcknowledged(username: string): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(username)) || '[]');
    return Array.isArray(stored) ? stored.filter(k => typeof k === 'string') : [];
  } catch { return []; }
}

export function useReplacementReminders(reservations: Reservation[], username?: string, enabled = true) {
  const [today, setToday] = useState(getChileLocalDateString);
  const [revision, setRevision] = useState(0);
  const acknowledgedInSession = useRef(new Map<string, Set<string>>());
  useEffect(() => {
    const refresh = () => {
      setToday(getChileLocalDateString());
      setRevision(r => r + 1);
    };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('storage', refresh);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  const pending = useMemo(() => {
    if (!username || !enabled) return [];
    const actor = username.trim().toLowerCase();
    const acknowledged = new Set([...readAcknowledged(actor), ...(acknowledgedInSession.current.get(actor) || [])]);
    return getDueReplacementReminders(reservations, today).filter(r => !acknowledged.has(replacementReminderKey(r)));
  }, [reservations, username, enabled, today, revision]);
  const acknowledge = useCallback((reservation: Reservation) => {
    if (!username) return;
    const actor = username.trim().toLowerCase();
    const key = replacementReminderKey(reservation);
    const session = acknowledgedInSession.current.get(actor) || new Set<string>();
    session.add(key);
    acknowledgedInSession.current.set(actor, session);
    try {
      const acknowledged = [...new Set([...readAcknowledged(actor), ...session])].slice(-200);
      localStorage.setItem(storageKey(actor), JSON.stringify(acknowledged));
    } catch { /* Keep acknowledgment for this session if browser storage is unavailable. */ }
    setRevision(r => r + 1);
  }, [username]);
  return { reminder: pending[0] || null, pendingCount: pending.length, acknowledge };
}
