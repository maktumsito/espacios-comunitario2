import { useState, useEffect, useCallback } from 'react';
import { Reservation } from '../types';
import {
  subscribeToReservations,
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

export interface UseReservationsStateReturn {
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

export function useReservationsState(): UseReservationsStateReturn {
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
    if (!hasMinuteConflictMigrationRun()) {
      executeMinuteConflictCleanupMigration().catch((err) => {
        console.warn('Background minute conflict migration notice:', err);
      });
    }
  }, []);

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
    let isMounted = true;

    const handleCacheSyncUpdated = (e: Event) => {
      const customEvent = e as CustomEvent<{ lastSyncTime?: number | null }>;
      if (customEvent.detail?.lastSyncTime && isMounted) {
        setLastSyncTime(customEvent.detail.lastSyncTime);
      }
    };
    window.addEventListener('cache-sync-updated', handleCacheSyncUpdated);

    const unsubscribe = subscribeToReservations(
      (data, isLiveFromFirestore, isRevalidating, syncTime) => {
        if (!isMounted) return;
        setReservations(data);
        setIsInitialLoading(false);
        if (isLiveFromFirestore) {
          setIsFirebaseConnected(true);
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
      },
      (error) => {
        if (!isMounted) return;
        console.warn('Firebase sync notice:', error);
        setIsInitialLoading(false);
        setIsFirebaseConnected(false);
        setIsFirebaseSyncing(false);
      }
    );

    return () => {
      isMounted = false;
      window.removeEventListener('cache-sync-updated', handleCacheSyncUpdated);
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  return {
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
