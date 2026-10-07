import { useState, useEffect, useCallback } from 'react';
import { Reservation } from '../types';
import {
  subscribeToReservations,
  subscribeToReservationsByDateRange,
  getLocalCache,
  getLastSyncTime,
  loadHistoricalReservationsMonth,
  loadHistoricalReservationsRange
} from '../services/reservationService';
import {
  executeMinuteConflictCleanupMigration,
  hasMinuteConflictMigrationRun
} from '../services/migrations/cleanMinuteConflictsMigration';
import { triggerSonnerToast } from '../services/toastNotificationService';
import type { ReservationDateRange } from '../utils/reservationReadScope';

export interface UseReservationsStateReturn {
  isReadScopeReady: boolean;
  readError: boolean;
  retryRead: () => void;
  reservations: Reservation[];
  setReservations: React.Dispatch<React.SetStateAction<Reservation[]>>;
  isFirebaseConnected: boolean;
  setIsFirebaseConnected: React.Dispatch<React.SetStateAction<boolean>>;
  isFirebaseSyncing: boolean;
  setIsFirebaseSyncing: React.Dispatch<React.SetStateAction<boolean>>;
  lastSyncTime: number | null;
  setLastSyncTime: React.Dispatch<React.SetStateAction<number | null>>;
  isInitialLoading: boolean;
  isHistoricalLoading: boolean;
  syncStatusToast: { message: string; type: 'success' | 'info' | 'error' | 'warning' } | null;
  setSyncStatusToast: React.Dispatch<React.SetStateAction<{ message: string; type: 'success' | 'info' | 'error' | 'warning' } | null>>;
  triggerSyncToast: (message: string, type?: 'success' | 'info' | 'error' | 'warning') => void;
  loadHistoricalMonth: (year: number, month: number) => Promise<Reservation[]>;
  loadHistoricalRange: (startDate: string, endDate: string) => Promise<Reservation[]>;
}

export function useReservationsState({ enabled = true, dateRange, allowMaintenance = true }: {
  enabled?: boolean;
  dateRange?: ReservationDateRange;
  allowMaintenance?: boolean;
} = {}): UseReservationsStateReturn {
  const startDate = dateRange?.startDate;
  const endDate = dateRange?.endDate;
  const scopeKey = `${enabled}:${startDate ?? 'active'}:${endDate ?? ''}`;
  const [confirmedScope, setConfirmedScope] = useState<string | null>(null);
  const [readError, setReadError] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const retryRead = useCallback(() => setReadAttempt(attempt => attempt + 1), []);
  const [reservations, setReservations] = useState<Reservation[]>(() => getLocalCache());
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  const [isFirebaseSyncing, setIsFirebaseSyncing] = useState(false);
  const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(() => getLastSyncTime());
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => {
    const cached = getLocalCache();
    return !cached || cached.length === 0;
  });

  // Instant Feedback Toast for Fluid Operations
  const [syncStatusToast, setSyncStatusToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'error' | 'warning';
  } | null>(null);

  const triggerSyncToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' | 'warning' = 'success') => {
      // Trigger sonner modern toast
      triggerSonnerToast(message, type);
      setSyncStatusToast({ message, type });
      setTimeout(() => {
        setSyncStatusToast((prev) => (prev?.message === message ? null : prev));
      }, 4500);
    },
    []
  );

  // One-time automatic idempotent cleanup migration for obsolete minute conflict IDs
  useEffect(() => {
    if (enabled && allowMaintenance && !hasMinuteConflictMigrationRun()) {
      executeMinuteConflictCleanupMigration().catch((err) => {
        console.warn('Background minute conflict migration notice:', err);
      });
    }
  }, [enabled, allowMaintenance]);

  // On-demand historical partition loaders
  const loadHistoricalMonth = useCallback(async (year: number, month: number): Promise<Reservation[]> => {
    setIsHistoricalLoading(true);
    try {
      const fetched = await loadHistoricalReservationsMonth(year, month);
      setReservations(getLocalCache());
      return fetched;
    } finally {
      setIsHistoricalLoading(false);
    }
  }, []);

  const loadHistoricalRange = useCallback(async (startDate: string, endDate: string): Promise<Reservation[]> => {
    setIsHistoricalLoading(true);
    try {
      const fetched = await loadHistoricalReservationsRange(startDate, endDate);
      setReservations(getLocalCache());
      return fetched;
    } finally {
      setIsHistoricalLoading(false);
    }
  }, []);

  // Subscribe to Firebase Firestore real-time updates & cache sync events
  useEffect(() => {
    if (!enabled) {
      setReservations([]);
      setIsFirebaseConnected(false);
      setIsFirebaseSyncing(false);
      return;
    }
    let isMounted = true;
    setReadError(false);
    setConfirmedScope(null);
    const inRange = (r: Reservation) => !startDate || !endDate || (r.fecha >= startDate && r.fecha <= endDate);

    const handleCacheSyncUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ lastSyncTime?: number | null }>;
      if (customEvent.detail?.lastSyncTime && isMounted) {
        setLastSyncTime(customEvent.detail.lastSyncTime);
      }
    };
    const handleWriteProgress = (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (!isMounted || !result) return;
      setReservations(prev=> { const map = new Map(prev.map(r=>[r.id,r])); result.deletedIds.forEach((id: string)=>map.delete(id)); result.reservations.forEach((r: Reservation)=> { map.delete(r.id); if (inRange(r)) map.set(r.id,r); }); return [...map.values()]; });
    };
    window.addEventListener('reservation-write-progress', handleWriteProgress);
    window.addEventListener('cache-sync-updated', handleCacheSyncUpdated);

    const onData = (data: Reservation[], isLiveFromFirestore: boolean, isRevalidating?: boolean, syncTime?: number | null) => {
        if (!isMounted) return;
        setReservations(data);
        setIsInitialLoading(false);
        setIsFirebaseConnected(isLiveFromFirestore);
        if (isLiveFromFirestore) setConfirmedScope(scopeKey);
        setIsFirebaseSyncing(!!isRevalidating);
        if (syncTime) {
          setLastSyncTime(syncTime);
        } else {
          const currentMetaSync = getLastSyncTime();
          if (currentMetaSync) {
            setLastSyncTime(currentMetaSync);
          }
        }
      };
    const onError = (error: unknown) => {
        if (!isMounted) return;
        console.warn('Firebase sync notice:', error);
        setIsInitialLoading(false);
        setIsFirebaseConnected(false);
        setIsFirebaseSyncing(false);
        setReadError(true);
      };
    const unsubscribe = startDate && endDate
      ? subscribeToReservationsByDateRange(startDate, endDate, onData, onError)
      : subscribeToReservations(onData, onError);

    return () => {
      isMounted = false;
      window.removeEventListener('reservation-write-progress', handleWriteProgress);
      window.removeEventListener('cache-sync-updated', handleCacheSyncUpdated);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [enabled, startDate, endDate, scopeKey, readAttempt]);

  return {
    isReadScopeReady: enabled && confirmedScope === scopeKey,
    readError,
    retryRead,
    reservations,
    setReservations,
    isFirebaseConnected,
    setIsFirebaseConnected,
    isFirebaseSyncing,
    setIsFirebaseSyncing,
    lastSyncTime,
    setLastSyncTime,
    isInitialLoading,
    isHistoricalLoading,
    syncStatusToast,
    setSyncStatusToast,
    triggerSyncToast,
    loadHistoricalMonth,
    loadHistoricalRange
  };
}
