import { useState, useEffect, useCallback } from 'react';
import { Reservation } from '../types';
import {
  subscribeToReservations,
  subscribeToReservationsByDateRange,
  getLocalCache,
  getLastSyncTime,
  loadHistoricalReservationsMonth,
  loadHistoricalReservationsRange,
  compareReservationsByDate
} from '../services/reservationService';
import { retryDataViews } from '../firebase/gateway';
import { triggerSonnerToast } from '../services/toastNotificationService';
import type { ReservationDateRange } from '../utils/reservationReadScope';

export interface UseReservationsStateReturn {
  isReadScopeReady: boolean;
  readError: boolean;
  readErrorMessage: string | null;
  readErrorCode: string | null;
  isRetryingRead: boolean;
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
  /** @deprecated Los avisos se presentan con triggerSyncToast. */
  syncStatusToast: { message: string; type: 'success' | 'info' | 'error' | 'warning' } | null;
  /** @deprecated Conservado para consumidores anteriores. Usar triggerSyncToast. */
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
  const [readErrorMessage, setReadErrorMessage] = useState<string | null>(null);
  const [readErrorCode, setReadErrorCode] = useState<string | null>(null);
  const [isRetryingRead, setIsRetryingRead] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const retryRead = useCallback(() => {
    setIsRetryingRead(true);
    setReadError(false);
    if (!retryDataViews()) setReadAttempt(attempt => attempt + 1);
  }, []);
  const [reservations, setReservations] = useState<Reservation[]>(() => getLocalCache());
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(false);
  const [isFirebaseSyncing, setIsFirebaseSyncing] = useState(false);
  const [isHistoricalLoading, setIsHistoricalLoading] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(() => getLastSyncTime());
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(() => {
    const cached = getLocalCache();
    return !cached || cached.length === 0;
  });

  // Unified feedback via Sonner (avoids duplicate banner & root App re-renders)
  const syncStatusToast: {
    message: string;
    type: 'success' | 'info' | 'error' | 'warning';
  } | null = null;
  const setSyncStatusToast = useCallback<
    React.Dispatch<React.SetStateAction<{ message: string; type: 'success' | 'info' | 'error' | 'warning' } | null>>
  >(() => {}, []);

  const triggerSyncToast = useCallback(
    (message: string, type: 'success' | 'info' | 'error' | 'warning' = 'success') => {
      triggerSonnerToast(message, type);
    },
    []
  );

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
    setReadErrorMessage(null);
    setReadErrorCode(null);
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
      setReservations(prev => {
        const map = new Map(prev.map(r => [r.id, r]));
        result.deletedIds.forEach((id: string) => map.delete(id));
        result.reservations.forEach((r: Reservation) => {
          map.delete(r.id);
          if (inRange(r)) map.set(r.id, r);
        });
        return [...map.values()].sort(compareReservationsByDate);
      });
    };
    window.addEventListener('reservation-write-progress', handleWriteProgress);
    window.addEventListener('cache-sync-updated', handleCacheSyncUpdated);

    const onData = (data: Reservation[], isLiveFromFirestore: boolean, isRevalidating?: boolean, syncTime?: number | null) => {
        if (!isMounted) return;
        setReservations(data);
        setIsInitialLoading(false);
        setIsFirebaseConnected(isLiveFromFirestore);
        if (isLiveFromFirestore) {
          setConfirmedScope(scopeKey);
          setReadError(false);
          setReadErrorMessage(null);
          setReadErrorCode(null);
          setIsRetryingRead(false);
        }
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
        const errObj = error as { message?: string; code?: string; status?: number } | null;
        setIsInitialLoading(false);
        setIsFirebaseConnected(false);
        setIsFirebaseSyncing(false);
        setIsRetryingRead(false);
        setReadError(true);
        setReadErrorCode(typeof errObj?.code === 'string' ? errObj.code : null);
        setReadErrorMessage(typeof errObj?.message === 'string' && errObj.message.trim() ? errObj.message.trim() : null);
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
    readErrorMessage,
    readErrorCode,
    isRetryingRead,
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
