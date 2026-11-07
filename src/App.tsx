import { ReservationVisualsProvider } from './contexts/ReservationVisualsContext';
import { NotificationPortal } from './components/common/NotificationPortal';
import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { Reservation, ViewMode, FilterState, SpaceRating } from './types';
import {
  saveReservation,
  purgeExpiredScheduleSlots,
  getLocalCache
} from './services/reservationService';
import { fetchReservationById } from './services/reservationService';
import { queryReservationsBySeries } from './services/reservationService';
import { getChileLocalDateString, parseDateToNoon } from './utils/dateUtils';
import { filterEnabledSpaceReservations, getEnabledSpaces, hasEnabledSpace } from './utils/spaceAvailability';
import { canReplaceOccurrence } from './utils/reservationReplacement';
import { useReplacementReminders } from './hooks/useReplacementReminders';
import { getDueReplacementReminders } from './utils/replacementReminders';
import { isRecurringSeriesReservation } from './utils/recurringEdits';
import { PendingReservationOperations } from './components/PendingReservationOperations';
import { DeleteDayReservationsModal } from './components/DeleteDayReservationsModal';
import { ReservationContextMenu, CalendarContextTarget } from './components/common/ReservationContextMenu';
import { getTopmostDialog } from './utils/dialogKeyboard';
import { Navbar } from './components/Navbar';
import { AgendaToolbar } from './components/AgendaToolbar';
import { SpaceAvailabilityModal } from './components/SpaceAvailabilityModal';
import { isAgendaView, getAgendaPeriodCount, getAgendaPeriodLabel } from './utils/agendaPeriod';
import { FilterBar } from './components/FilterBar';
import { CalendarView } from './components/CalendarView';
import { DailyUsageView } from './components/DailyUsageView';
import { MobileAgendaView } from './components/MobileAgendaView';
import { getInitialViewMode, isMobileDevice, persistViewPreference } from './utils/deviceUtils';
import { RevalidationBanner, CalendarSkeleton, TimelineSkeleton } from './components/common/LoadingSkeleton';

// Custom Hooks for Modular Architecture
import { useReservationsState } from './hooks/useReservationsState';
import { useReservationModals } from './hooks/useReservationModals';
import { useAdminConfig } from './hooks/useAdminConfig';
import { useRatingsState } from './hooks/useRatingsState';
import { useNetworkStatus } from './hooks/useNetworkStatus';
import { useSessionExpiry } from './hooks/useSessionExpiry';
import { useAuditLogs } from './hooks/useAuditLogs';
import { useSpaceBlocks } from './hooks/useSpaceBlocks';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Code-split heavy modals to minimize initial bundle size and boost initial paint performance
const ReservationModal = lazyWithRetry(
  () => import('./components/ReservationModal').then((m) => ({ default: m.ReservationModal })),
  'ReservationModal'
);
const ReservationDetailModal = lazyWithRetry(
  () => import('./components/ReservationDetailModal').then((m) => ({ default: m.ReservationDetailModal })),
  'ReservationDetailModal'
);
const ReplacementReminderModal = lazyWithRetry(
  () => import('./components/ReplacementReminderModal').then(m => ({ default: m.ReplacementReminderModal })),
  'ReplacementReminderModal'
);
const RecurringMoveScopeModal = lazyWithRetry(
  () => import('./components/RecurringMoveScopeModal').then(m => ({ default: m.RecurringMoveScopeModal })),
  'RecurringMoveScopeModal'
);
const GlobalCommandPalette = lazyWithRetry(
  () => import('./components/GlobalCommandPalette').then((m) => ({ default: m.GlobalCommandPalette })),
  'GlobalCommandPalette'
);
const QuickRequestCreatorModal = lazyWithRetry(
  () => import('./components/QuickRequestCreatorModal').then((m) => ({ default: m.QuickRequestCreatorModal })),
  'QuickRequestCreatorModal'
);
const QuickCheckInModal = lazyWithRetry(
  () => import('./components/QuickCheckInModal').then((m) => ({ default: m.QuickCheckInModal })),
  'QuickCheckInModal'
);
import type { ParsedReservationRequest } from './utils/requestTextParser';

// Code-split heavy views & modals with resilient lazyWithRetry to reduce initial bundle size and boost reliability
const SpaceDashboard = lazyWithRetry(
  () => import('./components/SpaceDashboard').then((m) => ({ default: m.SpaceDashboard })),
  'SpaceDashboard'
);
const ConflictsView = lazyWithRetry(
  () => import('./components/ConflictsView').then((m) => ({ default: m.ConflictsView })),
  'ConflictsView'
);
const AdminView = lazyWithRetry(
  () => import('./components/AdminView').then((m) => ({ default: m.AdminView || m.default })),
  'AdminView'
);
const RatingsDashboardView = lazyWithRetry(
  () => import('./components/RatingsDashboardView').then((m) => ({ default: m.RatingsDashboardView })),
  'RatingsDashboardView'
);
const AnalyticsView = lazyWithRetry(
  () => import('./components/AnalyticsView').then((m) => ({ default: m.AnalyticsView })),
  'AnalyticsView'
);
import { AppModalsContainer } from './components/AppModalsContainer';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useFilteredReservations, INITIAL_FILTERS } from './hooks/useFilteredReservations';
import { canWriteReservations, getReservationReadScope } from './utils/reservationReadScope';
import { useReservationCrud } from './hooks/useReservationCrud';
import { initGmailAuthListener } from './services/gmailDispatchService';
import {
  checkTodayImportantActivities,
  checkUpcomingReplacementActivities,
  getNotificationHistory,
  initNotificationListeners,
  AppNotificationItem
} from './services/notificationService';
import { format, addDays, subDays, addMonths, subMonths } from 'date-fns';
import {
  AuthUser,
  getStoredAuthUser,
  getAuthSessionToken,
  updateStoredAuthUser,
  clearAuthUser,
  getAllAuthorizedUsers,
  isCoordinatorOrAdmin,
  userCanCreateReservations,
  userCanEditReservations,
  userCanDeleteReservations
} from './services/authService';
import { LoginScreen } from './components/LoginScreen';
import { AppFooter } from './components/AppFooter';
import { Wifi, WifiOff, Clock, ShieldCheck, Filter, RotateCcw, AlertTriangle } from 'lucide-react';
import { checkAndRunScheduledBackup } from './services/backupService';
import { getActiveDraftSummary, removeStoredDraft, ActiveDraftSummary } from './hooks/useReservationAutosave';

export default function App() {
  const editorLoadRequest = useRef(0);
  const closingSession = useRef(false);
  const [pendingSeriesMove, setPendingSeriesMove] = useState<{ original: Reservation; target: Reservation; resolve: (result: boolean) => void } | null>(null);
  const [replacementSource, setReplacementSource] = useState<Reservation | null>(null);
  const [contextMenuState, setContextMenuState] = useState<{
    reservation?: Reservation | null;
    calendarContext?: CalendarContextTarget | null;
    x: number;
    y: number;
  } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionChanged, setSessionChanged] = useState(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    const stored = getStoredAuthUser();
    if (stored && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(getAuthSessionToken())) {
      clearAuthUser();
      return null;
    }
    return stored;
  });
  const [currentView, setCurrentView] = useState<ViewMode>(() => getInitialViewMode());
  const [isSidebarHidden, setIsSidebarHidden] = useState(() => {
    try {
      const saved = localStorage.getItem('cc_sidebar_hidden_v1');
      return saved ? saved === '1' : true;
    } catch {
      return true;
    }
  });
  const toggleSidebar = useCallback(() => setIsSidebarHidden(hidden => {
    const next = !hidden;
    try { localStorage.setItem('cc_sidebar_hidden_v1', next ? '1' : '0'); } catch {}
    return next;
  }), []);
  const [adminSubTab, setAdminSubTab] = useState<'spaces' | 'activities' | 'equipment' | 'users' | 'maintenance' | 'applicants' | 'gmail' | 'recurring' | 'health'>('spaces');
  const [selectedDailyDate, setSelectedDailyDate] = useState<Date>(() => new Date());
  const [isSpaceAvailabilityOpen, setIsSpaceAvailabilityOpen] = useState(false);
  const [isDeleteDayModalOpen, setIsDeleteDayModalOpen] = useState(false);
  const [comparisonSpaces, setComparisonSpaces] = useState<string[] | null>(null);
  const [reservationFilters, setReservationFilters] = useState<FilterState>(INITIAL_FILTERS);
  const canWrite = canWriteReservations(currentUser);

  // 1. Network Status Hook
  const { isOnline, showReconnectedAlert } = useNetworkStatus();

  // 3. Modals & Dialogs Hook
  const {
    isReservationModalOpen,
    setIsReservationModalOpen,
    isDetailModalOpen,
    setIsDetailModalOpen,
    isImportExportModalOpen,
    setIsImportExportModalOpen,
    isAuditLogOpen,
    setIsAuditLogOpen,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    isPendingDeletionsModalOpen,
    setIsPendingDeletionsModalOpen,
    isChangePasswordOpen,
    setIsChangePasswordOpen,
    isPasswordPromptOpen,
    setIsPasswordPromptOpen,
    isRatingModalOpen,
    setIsRatingModalOpen,
    isGlobalPrintModalOpen,
    setIsGlobalPrintModalOpen,
    isNotificationCenterOpen,
    setIsNotificationCenterOpen,
    selectedReservation,
    setSelectedReservation,
    editingReservation,
    setEditingReservation,
    isDuplicating,
    setIsDuplicating,
    deleteTargetReservation,
    setDeleteTargetReservation,
    ratingTargetReservation,
    setRatingTargetReservation,
    editingRating,
    setEditingRating,
    passwordTargetUser,
    setPasswordTargetUser,
    globalPrintInitialDate,
    setGlobalPrintInitialDate,
    conflictReportData,
    setConflictReportData,
    pendingAuthAction,
    setPendingAuthAction,
    authActionDescription,
    setAuthActionDescription,
    prefillDate,
    setPrefillDate,
    prefillSpace,
    setPrefillSpace,
    prefillStartTime,
    setPrefillStartTime,
    prefillEndTime,
    setPrefillEndTime,
    prefillResponsable,
    setPrefillResponsable,
    prefillRut,
    setPrefillRut,
    prefillPhone,
    setPrefillPhone,
    prefillEmail,
    setPrefillEmail,
    openCreateModal,
    isGmailDispatchModalOpen,
    setIsGmailDispatchModalOpen,
    gmailDispatchInitialDate,
    setGmailDispatchInitialDate,
    gmailDispatchFilterMode,
    setGmailDispatchFilterMode,
    gmailDispatchReservationId,
    setGmailDispatchReservationId,
    openGmailDispatchModal
  } = useReservationModals();

  const [quickRequestModalState, setQuickRequestModalState] = useState<{
    isOpen: boolean;
    date?: string;
    space?: string;
    startTime?: string;
    endTime?: string;
  }>({ isOpen: false });
  const [prefillParsedRequest, setPrefillParsedRequest] = useState<ParsedReservationRequest | null>(null);
  const [checkInReservation, setCheckInReservation] = useState<Reservation | null>(null);
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState(false);

  const reservationReadScope = getReservationReadScope(
    currentUser, currentView, selectedDailyDate, reservationFilters,
    isImportExportModalOpen || isGlobalPrintModalOpen || isGmailDispatchModalOpen || isReservationModalOpen || quickRequestModalState.isOpen,
  );
  const {
    reservations, setReservations, isFirebaseConnected, setIsFirebaseConnected,
    isFirebaseSyncing, setIsFirebaseSyncing, lastSyncTime, setLastSyncTime,
    isInitialLoading, isHistoricalLoading, syncStatusToast, setSyncStatusToast,
    triggerSyncToast, loadHistoricalMonth,
    isReadScopeReady, readError, retryRead,
  } = useReservationsState({
    enabled: Boolean(currentUser), dateRange: reservationReadScope, allowMaintenance: canWrite,
  });
  const generalDataPending = !canWrite && !reservationReadScope && !isReadScopeReady;

  // 4. Admin Configuration Hook
  const {
    spaces,
    loanTypes,
    activityTypes,
    equipment,
    userAccounts,
    setUserAccounts,
    handleSaveSpace,
    handleDeleteSpace,
    handleReorderSpaces,
    handleSaveLoanType,
    handleDeleteLoanType,
    handleSaveActivityType,
    handleDeleteActivityType,
    handleSaveEquipment,
    handleDeleteEquipment,
    handleResetEquipment,
    handleResetDefaults,
    handleSaveUser,
    handleDeleteUser,
    handleResetUsers
  } = useAdminConfig(currentUser, triggerSyncToast, {
    enabled: Boolean(currentUser),
    equipmentEnabled: Boolean(currentUser) && (isReservationModalOpen || quickRequestModalState.isOpen ||
      (currentView === 'admin' && adminSubTab === 'equipment')),
  });

  // 5. Ratings State Hook
  const {
    ratings,
    handleSaveRating: saveRating,
    handleDeleteRating: deleteRating,
    checkRatingAllowed
  } = useRatingsState(reservations, {
    enabled: Boolean(currentUser) && (
      currentView === 'mobile' ||
      currentView === 'ratings' ||
      currentView === 'directory' ||
      currentView === 'analytics' ||
      currentView === 'admin' ||
      currentView === 'maintenance' ||
      isDetailModalOpen ||
      isReservationModalOpen ||
      isRatingModalOpen ||
      (canWrite && new Date().getDay() === 1)
    ),
    automaticEmailEnabled: canWrite,
  });

  // 6. Audit Logs Hook (On-demand listener only when modal is open)
  const handleSaveRating = async (rating: SpaceRating, target?: Reservation | null) => {
    if (!canWrite) throw new Error('Esta cuenta tiene acceso de solo lectura.');
    await saveRating(rating, target);
  };
  const handleDeleteRating = async (id: string) => {
    if (!canWrite) throw new Error('Esta cuenta tiene acceso de solo lectura.');
    await deleteRating(id);
  };
  const { auditLogs } = useAuditLogs(isAuditLogOpen);

  // 7. Space Maintenance Blocks State & Synchronization Hook
  const {
    spaceBlocks,
    handleSaveBlock,
    handleDeleteBlock
  } = useSpaceBlocks({ triggerSyncToast, enabled: Boolean(currentUser), startDate: reservationReadScope?.startDate });

  // Real-time synchronization of currentUser permissions when userAccounts updates in Firestore
  useEffect(() => {
    if (!currentUser || userAccounts.length === 0) return;
    const matchingAccount = userAccounts.find(
      (acc) => acc.username.toLowerCase() === currentUser.username.toLowerCase()
    );
    if (matchingAccount) {
      const hasPermissionChange =
        currentUser.canCreateReservations !== matchingAccount.canCreateReservations ||
        currentUser.canEditReservations !== matchingAccount.canEditReservations ||
        currentUser.canDeleteReservations !== matchingAccount.canDeleteReservations ||
        currentUser.isMasterAdmin !== matchingAccount.isMasterAdmin ||
        currentUser.role !== matchingAccount.role ||
        currentUser.name !== matchingAccount.name;

      if (hasPermissionChange) {
        const updatedUser: AuthUser = {
          ...currentUser,
          role: matchingAccount.role,
          name: matchingAccount.name,
          isMasterAdmin: matchingAccount.isMasterAdmin,
          canCreateReservations: matchingAccount.canCreateReservations,
          canEditReservations: matchingAccount.canEditReservations,
          canDeleteReservations: matchingAccount.canDeleteReservations
        };
        setCurrentUser(updatedUser);
        updateStoredAuthUser(updatedUser);
      }
    }
  }, [userAccounts, currentUser]);

  // 7. Autosaved Reservation Draft state for recovery after reload
  useEffect(() => {
    if (!isReservationModalOpen) setReplacementSource(null);
  }, [isReservationModalOpen]);
  const [activeDraft, setActiveDraft] = useState<ActiveDraftSummary | null>(() => getActiveDraftSummary());

  useEffect(() => {
    if (!isReservationModalOpen) {
      setActiveDraft(getActiveDraftSummary());
    }
  }, [isReservationModalOpen]);

  // Notification history
  const [notificationHistory, setNotificationHistory] = useState<AppNotificationItem[]>(() => getNotificationHistory());

  // Filters and Conflict Calculations Hook
  const {
    filters,
    setFilters,
    isFilterBarOpen,
    setIsFilterBarOpen,
    hasActiveFilters,
    conflictsCount,
    conflictReservationIds,
    filteredReservations
  } = useFilteredReservations(reservations, { filters: reservationFilters, setFilters: setReservationFilters });
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const enabledSpaces = useMemo(() => getEnabledSpaces(spaces), [spaces]);
  const agendaReservations = useMemo(() => filterEnabledSpaceReservations(filteredReservations, spaces), [filteredReservations, spaces]);
  const allAgendaReservations = useMemo(() => filterEnabledSpaceReservations(reservations, spaces), [reservations, spaces]);
  useEffect(() => {
    if (filters.espacio && !hasEnabledSpace(filters.espacio, spaces)) setFilters(previous => ({ ...previous, espacio: '' }));
  }, [filters.espacio, spaces, setFilters]);

  // Global Keyboard Shortcuts (Ctrl+K, Cmd+K, '/', Alt+N)
  const visiblePeriodCounts = useMemo(() => ({
    filtered: getAgendaPeriodCount(isAgendaView(currentView) ? agendaReservations : filteredReservations, currentView, selectedDailyDate),
    all: getAgendaPeriodCount(isAgendaView(currentView) ? allAgendaReservations : reservations, currentView, selectedDailyDate),
  }), [filteredReservations, reservations, agendaReservations, allAgendaReservations, currentView, selectedDailyDate]);
  const visiblePeriodLabel = getAgendaPeriodLabel(currentView, selectedDailyDate);

  useKeyboardShortcuts({
    enabled: Boolean(currentUser),
    onToggleCommandPalette: () => setIsCommandPaletteOpen((prev) => !prev),
    onOpenNewReservation: () => {
      if (!userCanCreateReservations(currentUser)) {
        triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
        return;
      }
      openCreateModal({ date: format(selectedDailyDate || new Date(), 'yyyy-MM-dd') });
    },
    onNavigateView: (view) => {
      persistViewPreference(view);
      setCurrentView(view);
    },
    onGoToday: () => setSelectedDailyDate(new Date()),
    isCommandPaletteOpen
  });

  const handleOpenChangePassword = (targetUser?: AuthUser) => {
    setPasswordTargetUser(targetUser || currentUser || null);
    setIsChangePasswordOpen(true);
  };

  // Automated 15-Day Database Backup Cycle & Periodic Slot Purge
  const [backupToast, setBackupToast] = useState<{
    show: boolean;
    title: string;
    message: string;
    backupId?: string;
  } | null>(null);

  const reservationsRef = useRef(reservations);
  reservationsRef.current = reservations;
  const currentViewRef = useRef(currentView);
  currentViewRef.current = currentView;
  const selectedDailyDateRef = useRef(selectedDailyDate);
  selectedDailyDateRef.current = selectedDailyDate;

  useEffect(() => {
    if (!currentUser) {
      setContextMenuState(null);
      return;
    }

    const extractCalendarContext = (target: Element | null): CalendarContextTarget | null => {
      if (!target) return null;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) {
        return null;
      }
      const surfaceEl = target.closest('[data-calendar-surface], [data-calendar-date], [data-drop-space]');
      const inMainAgenda = isAgendaView(currentViewRef.current) && Boolean(target.closest('#main-content'));
      if (!surfaceEl && !inMainAgenda) return null;

      const dateEl = target.closest('[data-calendar-date]');
      const dateStr =
        dateEl?.getAttribute('data-calendar-date') ||
        format(selectedDailyDateRef.current || new Date(), 'yyyy-MM-dd');
      const spaceName =
        target.closest('[data-calendar-space]')?.getAttribute('data-calendar-space') ||
        target.closest('[data-drop-space]')?.getAttribute('data-drop-space') ||
        undefined;
      const startTime =
        target.closest('[data-calendar-start]')?.getAttribute('data-calendar-start') ||
        undefined;
      const endTime =
        target.closest('[data-calendar-end]')?.getAttribute('data-calendar-end') ||
        undefined;

      return {
        dateStr,
        spaceName,
        startTime,
        endTime,
        viewMode: currentViewRef.current
      };
    };

    const handleGlobalContextMenu = (e: MouseEvent) => {
      if (getTopmostDialog()) return;
      const target = e.target instanceof Element ? e.target : null;
      const cardEl = target?.closest('[data-reservation-id]') as HTMLElement | null;
      if (cardEl) {
        const resId = cardEl.getAttribute('data-reservation-id');
        const matched = resId ? reservationsRef.current.find((r) => r.id === resId) : undefined;
        if (matched) {
          e.preventDefault();
          e.stopPropagation();
          setContextMenuState({
            reservation: matched,
            calendarContext: null,
            x: e.clientX || 120,
            y: e.clientY || 120
          });
          return;
        }
      }

      const calCtx = extractCalendarContext(target);
      if (!calCtx) return;
      e.preventDefault();
      e.stopPropagation();
      setContextMenuState({
        reservation: null,
        calendarContext: calCtx,
        x: e.clientX || 120,
        y: e.clientY || 120
      });
    };

    const handleContextMenuKey = (e: KeyboardEvent) => {
      if (getTopmostDialog()) return;
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        const target = e.target instanceof Element ? e.target : document.activeElement;
        const cardEl = target?.closest('[data-reservation-id]') as HTMLElement | null;
        if (cardEl) {
          const resId = cardEl.getAttribute('data-reservation-id');
          const matched = resId ? reservationsRef.current.find((r) => r.id === resId) : undefined;
          if (matched) {
            e.preventDefault();
            e.stopPropagation();
            const rect = cardEl.getBoundingClientRect();
            setContextMenuState({
              reservation: matched,
              calendarContext: null,
              x: Math.max(16, rect.left + Math.min(rect.width / 2, 120)),
              y: Math.max(16, rect.top + Math.min(rect.height / 2, 48))
            });
            return;
          }
        }

        const calCtx = extractCalendarContext(target);
        if (!calCtx) return;
        e.preventDefault();
        e.stopPropagation();
        const anchorEl = (target?.closest('[data-calendar-date], [data-drop-space], [data-calendar-surface]') || target) as HTMLElement | null;
        const rect = anchorEl?.getBoundingClientRect();
        setContextMenuState({
          reservation: null,
          calendarContext: calCtx,
          x: rect ? Math.max(16, rect.left + Math.min(rect.width / 2, 120)) : 120,
          y: rect ? Math.max(16, rect.top + Math.min(rect.height / 2, 48)) : 120
        });
      }
    };

    document.addEventListener('contextmenu', handleGlobalContextMenu);
    window.addEventListener('keydown', handleContextMenuKey);
    return () => {
      document.removeEventListener('contextmenu', handleGlobalContextMenu);
      window.removeEventListener('keydown', handleContextMenuKey);
    };
  }, [currentUser]);

  // Preload heavy modals on idle to ensure instantaneous 0ms interaction response
  useEffect(() => {
    const preload = () => {
      import('./components/ReservationModal');
      import('./components/ReservationDetailModal');
      import('./components/GlobalCommandPalette');
      import('./components/QuickRequestCreatorModal');
    };
    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(preload, { timeout: 3000 });
      } else {
        setTimeout(preload, 2000);
      }
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const executeScheduledBackupCheck = async () => {
      if (!canWrite) return;
      try {
        const currentResList = reservationsRef.current;
        if (!currentResList || currentResList.length === 0) return;
        const check = await checkAndRunScheduledBackup();
        if (isMounted && check.triggered && check.backup) {
          console.log(`[Copia Automática 15 Días] Ejecutada con éxito: ${check.backup.id} (${check.backup.totalReservas} reservas)`);
          setBackupToast({
            show: true,
            title: 'Copia de Seguridad Automática Realizada',
            message: `Se ha generado automáticamente la copia de seguridad de la base de datos (ciclo de 15 días: ${check.backup.totalReservas} reservas respaldadas en Firebase).`,
            backupId: check.backup.id
          });

          // Auto-hide toast after 9 seconds
          setTimeout(() => {
            if (isMounted) {
              setBackupToast(null);
            }
          }, 9000);
        }
      } catch (err) {
        console.warn('[Copia Automática 15 Días] Error durante la verificación periódica:', err);
      }
    };

    if (canWrite && reservations.length > 0) {
      executeScheduledBackupCheck();
      // Purge expired concurrency schedule_slots (> 30 days old, throttled to run at most once a week)
      purgeExpiredScheduleSlots(30).catch((purgeErr) => {
        console.warn('[ScheduleSlotsPurge] Error purgando slots expirados:', purgeErr);
      });
    }

    // Check periodically every 4 hours while the app is active
    const intervalId = setInterval(() => {
      executeScheduledBackupCheck();
    }, 4 * 60 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [reservations.length > 0, canWrite]);

  const handleOpenRatingModal = (reservation: Reservation, rating?: SpaceRating) => {
    if (!rating) {
      const check = checkRatingAllowed(reservation);
      if (!check.allowed) {
        triggerSyncToast(check.reason || 'No es posible calificar eventos por adelantado.', 'warning');
        return;
      }
    }
    setRatingTargetReservation(reservation);
    setEditingRating(rating || null);
    setIsRatingModalOpen(true);
  };

  // Notification listeners & daily check for important activities
  useEffect(() => {
    const handleHistoryUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<AppNotificationItem[]>;
      setNotificationHistory(customEvent.detail || getNotificationHistory());
    };

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE_VIEW' && event.data?.view) {
        setCurrentView(event.data.view as ViewMode);
      }
    };

    window.addEventListener('app_notification_history_changed', handleHistoryUpdate);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    }

    return () => {
      window.removeEventListener('app_notification_history_changed', handleHistoryUpdate);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
      }
    };
  }, []);

  // Automatically activate mobile-optimized view when loaded from a mobile phone
  useEffect(() => {
    if (isMobileDevice()) {
      try {
        const saved = sessionStorage.getItem('gestindeespacios_preferred_view_mode');
        if (!saved) {
          setCurrentView('mobile');
        }
      } catch {
        setCurrentView('mobile');
      }
    }
  }, []);

  useEffect(() => {
    if (currentUser) {
      const unsub = initNotificationListeners();
      return () => {
        unsub();
      };
    }
  }, [currentUser]);

  const todayImportantSignature = useMemo(() => {
    if (!currentUser || reservations.length === 0) return '';
    const todayStr = getChileLocalDateString();
    const parts: string[] = [];
    for (let i = 0; i < reservations.length; i++) {
      const r = reservations[i];
      if (r.fecha === todayStr && r.importante === 'Sí' && r.estado !== 'cancelada') {
        parts.push(`${r.id}:${r.horaInicio}:${r.horaFin}:${r.espacio}`);
      }
    }
    return parts.join('|');
  }, [reservations, currentUser]);

  useEffect(() => {
    if (todayImportantSignature) {
      checkTodayImportantActivities(reservationsRef.current);
    }
  }, [todayImportantSignature]);

  const dueReplacements = useMemo(() => getDueReplacementReminders(reservations), [reservations]);
  const upcomingReplacementSignature = useMemo(() => {
    if (!currentUser || dueReplacements.length === 0) return '';
    return dueReplacements.map(r => `${r.id}:${r.fecha}:${r.horaInicio}:${r.diasAvisoReemplazo ?? 3}`).join('|');
  }, [dueReplacements, currentUser]);

  useEffect(() => {
    if (upcomingReplacementSignature) {
      checkUpcomingReplacementActivities(reservationsRef.current);
    }
  }, [upcomingReplacementSignature]);

  // Initialize Gmail Workspace OAuth Auth State Listener only when Gmail UI is active
  const gmailUiActive = Boolean(currentUser) && (
    isGmailDispatchModalOpen || (currentView === 'admin' && adminSubTab === 'gmail')
  );
  useEffect(() => {
    if (!gmailUiActive) return;
    const unsubGmail = initGmailAuthListener();
    return () => {
      unsubGmail();
    };
  }, [gmailUiActive]);

  const unreadNotificationsCount = useMemo(() => {
    return notificationHistory.filter(n => !n.read).length;
  }, [notificationHistory]);

  // Pending Deletions waiting for Authorization
  const pendingReservations = useMemo(() => {
    return reservations.filter((r) => Boolean(r.solicitudEliminacion));
  }, [reservations]);

  const handleAuthSuccess = (user: AuthUser) => {
    closingSession.current = false;
    setSessionExpired(false);
    setSessionChanged(false);
    setCurrentUser(user);
    setIsPasswordPromptOpen(false);
    if (pendingAuthAction) {
      const action = pendingAuthAction;
      setPendingAuthAction(null);
      void Promise.resolve(action()).catch((err: any)=>triggerSyncToast(err?.message || "No se pudo completar la operación.", "error"));
    }
  };

  const requireAuth = useCallback(<T,>(action: () => T, description?: string): T | undefined => {
    if (currentUser) {
      return action();
    } else {
      setPendingAuthAction(() => action);
      setAuthActionDescription(description || 'modificar o crear reservas');
      setIsPasswordPromptOpen(true);
    }
  }, [currentUser, setPendingAuthAction, setAuthActionDescription, setIsPasswordPromptOpen]);

  // Reservation CRUD Operations Hook
  const {
    handleCreateOrUpdate,
    handleMoveReservation,
    handleDelete,
    handleDeleteDay,
    handleConfirmDeleteSingle,
    handleConfirmDeleteSeries,
    handleRequestDelete,
    handleSubmitDeleteRequest,
    handleAuthorizeDelete,
    handleRejectDeleteRequest,
    handleClearParticipants,
    handleQuickToggleRealizada,
    handleSyncAllToFirebase,
    handleImportReservations,
    handleDeleteAllHolidays,
    handleDuplicateReservation,
    handleMergeReservations
  } = useReservationCrud({
    spaceBlocks,
    reservations,
    setReservations,
    currentUser,
    triggerSyncToast,
    setIsReservationModalOpen,
    setEditingReservation,
    setSelectedReservation,
    setIsDetailModalOpen,
    setIsDeleteModalOpen,
    setDeleteTargetReservation,
    setConflictReportData,
    setIsDuplicating,
    setPrefillDate,
    setPrefillSpace,
    setPrefillStartTime,
    setPrefillEndTime,
    selectedReservation,
    requireAuth,
    setIsFirebaseSyncing,
    setIsFirebaseConnected,
    setLastSyncTime
  });

  const handleLogout = () => {
    if (closingSession.current) return;
    closingSession.current = true;
    editorLoadRequest.current++;
    clearAuthUser();
    setCurrentUser(null);
    setPendingAuthAction(null);
    pendingSeriesMove?.resolve(false);
    setPendingSeriesMove(null);
    setReplacementSource(null);
    setContextMenuState(null);
    setSelectedReservation(null);
    setEditingReservation(null);
    setIsReservationModalOpen(false);
    setIsDetailModalOpen(false);
    setIsImportExportModalOpen(false);
    setIsAuditLogOpen(false);
    setIsDeleteModalOpen(false);
    setIsPendingDeletionsModalOpen(false);
    setIsChangePasswordOpen(false);
    setIsPasswordPromptOpen(false);
    setIsRatingModalOpen(false);
    setIsGlobalPrintModalOpen(false);
    setIsNotificationCenterOpen(false);
    setIsGmailDispatchModalOpen(false);
    setIsDeleteDayModalOpen(false);
    setIsSpaceAvailabilityOpen(false);
    setIsCommandPaletteOpen(false);
    setQuickRequestModalState({ isOpen: false });
    setPrefillParsedRequest(null);
    setConflictReportData(previous => ({ ...previous, isOpen: false }));
  };

  useSessionExpiry(Boolean(currentUser), reason => {
    if (closingSession.current) return;
    setSessionExpired(reason === 'expired');
    setSessionChanged(reason === 'changed');
    handleLogout();
  });

  const handleCalendarSelectReservation = useCallback((r: Reservation) => {
    setSelectedReservation(r);
    setIsDetailModalOpen(true);
  }, [setSelectedReservation, setIsDetailModalOpen]);

  const handleOpenCheckIn = useCallback((reservation: Reservation) => {
    requireAuth(() => {
      setCheckInReservation(reservation);
      setIsCheckInModalOpen(true);
    }, 'registrar asistencia de la reserva');
  }, [requireAuth]);

  const handleSaveCheckIn = useCallback(async (updated: Reservation) => {
    try {
      const confirmed = await saveReservation(updated);
      const savedRes = confirmed.reservations[0] || updated;
      setReservations((prev) => prev.map((r) => (r.id === savedRes.id ? savedRes : r)));
      if (selectedReservation?.id === savedRes.id) {
        setSelectedReservation(savedRes);
      }
      triggerSyncToast('Asistencia guardada correctamente.', 'success');
    } catch (err: any) {
      triggerSyncToast(err?.message || 'No se pudo guardar la asistencia.', 'error');
      throw err;
    }
  }, [selectedReservation, setReservations, setSelectedReservation, triggerSyncToast]);

  const handleStartReplacement = useCallback((r: Reservation) => {
    requireAuth(() => {
      if (!userCanCreateReservations(currentUser) || !userCanEditReservations(currentUser) || !canReplaceOccurrence(r)) {
        triggerSyncToast('No tienes permisos o esta reserva no admite reemplazo por el día.', 'warning');
        return;
      }
      setReplacementSource(r);
      setEditingReservation(null);
      setIsDuplicating(false);
      setPrefillDate(r.fecha);
      setPrefillSpace(r.espacio);
      setPrefillStartTime(r.horaInicio);
      setPrefillEndTime(r.horaFin);
      setPrefillResponsable(r.responsable);
      setPrefillRut(r.rut || '');
      setPrefillPhone(r.telefonoContacto || '');
      setPrefillEmail(r.emailContacto || '');
      setIsDetailModalOpen(false);
      setIsReservationModalOpen(true);
    }, 'reemplazar esta actividad solo por este día');
  }, [currentUser, requireAuth, triggerSyncToast, setEditingReservation, setIsDuplicating, setPrefillDate, setPrefillSpace, setPrefillStartTime, setPrefillEndTime, setPrefillResponsable, setPrefillRut, setPrefillPhone, setPrefillEmail, setIsDetailModalOpen, setIsReservationModalOpen]);
  const prepareReservationEditor = async (reservation: Reservation) => {
    if (!userCanEditReservations(currentUser)) { triggerSyncToast('No tienes permiso para editar reservas.','error'); return; }
    const request=++editorLoadRequest.current;
    try {
      let current=reservation;
      if (isRecurringSeriesReservation(reservation)) {
        triggerSyncToast('Cargando las sesiones pendientes de la serie…','info');
        const rows=await queryReservationsBySeries(reservation.serieRecurrente||reservation.recurrenteId||'',getChileLocalDateString());
        if(request!==editorLoadRequest.current)return;
        setReservations(previous=>[...new Map([...previous,...rows].map(r=>[r.id,r])).values()]);
        current=rows.find(r=>r.id===reservation.id)||reservation;
      }
      if(request!==editorLoadRequest.current)return;
      setEditingReservation(current);setIsDuplicating(false);
      setPrefillDate(current.fecha);setPrefillSpace(current.espacio);
      setPrefillStartTime(current.horaInicio);setPrefillEndTime(current.horaFin);
      setIsReservationModalOpen(true);
    }catch(error:any){triggerSyncToast(error?.message||'No se pudo cargar la serie. Intenta nuevamente.','error');}
  };
  useEffect(()=>{if(isReservationModalOpen)editorLoadRequest.current++;},[isReservationModalOpen]);

  const handleCalendarNewReservationForDate = useCallback((dateStr: string) => {
    requireAuth(() => {
      if (!userCanCreateReservations(currentUser)) {
        triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
        return;
      }
      setEditingReservation(null);
      setIsDuplicating(false);
      setPrefillDate(dateStr);
      setPrefillSpace(enabledSpaces.some(space => space.name === filters.espacio) ? filters.espacio : enabledSpaces[0]?.name || '');
      setPrefillStartTime('08:30');
      setPrefillEndTime('09:30');
      setIsReservationModalOpen(true);
    }, 'crear una reserva en esta fecha');
  }, [filters.espacio, enabledSpaces, currentUser]);

  const handleOpenQuickRequest = useCallback((params?: { date?: string; space?: string; startTime?: string; endTime?: string }) => {
    requireAuth(() => {
      if (!userCanCreateReservations(currentUser)) {
        triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
        return;
      }
      if (!enabledSpaces.length) {
        triggerSyncToast('No hay espacios activos. Activa o crea un espacio en Administración.', 'warning');
        return;
      }
      const fallbackDate = params?.date || format(selectedDailyDate || new Date(), 'yyyy-MM-dd');
      const fallbackSpace =
        (params?.space && enabledSpaces.some((s) => s.name === params.space) ? params.space : undefined) ||
        (enabledSpaces.some((s) => s.name === filters.espacio) ? filters.espacio : enabledSpaces[0]?.name || '');
      setQuickRequestModalState({
        isOpen: true,
        date: fallbackDate,
        space: fallbackSpace,
        startTime: params?.startTime || '10:00',
        endTime: params?.endTime || '11:00'
      });
    }, 'crear reserva rápida desde solicitud');
  }, [currentUser, enabledSpaces, filters.espacio, requireAuth, selectedDailyDate, triggerSyncToast]);

  const { reminder: replacementReminder, pendingCount: replacementReminderCount, acknowledge: acknowledgeReplacementReminder } = useReplacementReminders(
    reservations, currentUser?.username,
    !isInitialLoading && !isReservationModalOpen && !quickRequestModalState.isOpen && !isDetailModalOpen && !isDeleteModalOpen &&
    !isImportExportModalOpen && !isAuditLogOpen && !isPendingDeletionsModalOpen && !isChangePasswordOpen &&
    !isPasswordPromptOpen && !isRatingModalOpen && !isGlobalPrintModalOpen && !isGmailDispatchModalOpen &&
    !isNotificationCenterOpen && !isSpaceAvailabilityOpen && !conflictReportData.isOpen && !pendingSeriesMove
  );
  useEffect(() => {
    if (!currentUser && pendingSeriesMove) {
      pendingSeriesMove.resolve(false);
      setPendingSeriesMove(null);
    }
  }, [currentUser, pendingSeriesMove]);

  if (!currentUser) {
    return <LoginScreen onLoginSuccess={handleAuthSuccess} sessionExpired={sessionExpired} sessionChanged={sessionChanged} />;
  }

  return (
    <ReservationVisualsProvider activityTypes={activityTypes} reservations={reservations}>
    <div className={`app-shell min-h-[100dvh] bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white pb-20 lg:pb-0 ${isSidebarHidden ? '' : 'lg:pl-56'}`}>
      {/* Network Status Banner (Hallazgo 8) */}
      {!isOnline && (
        <div
          id="offline-status-banner"
          role="status"
          aria-live="polite"
          className="bg-amber-600 text-white px-4 py-2.5 text-xs font-medium flex items-center justify-center gap-2.5 shadow-xs sticky top-0 z-50 animate-fadeIn border-b border-amber-700/40"
        >
          <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/80 ring-1 ring-amber-300/40 shrink-0 text-amber-100 shadow-2xs animate-subtle-pulse">
            <WifiOff className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
          <span className="leading-snug text-center sm:text-left">
            <strong className="font-semibold text-amber-100">Sin conexión a internet:</strong> Puedes consultar datos locales y conservar borradores. El guardado se confirmará al recuperar la conexión.
          </span>
        </div>
      )}

      {showReconnectedAlert && isOnline && (
        <div
          id="online-status-banner"
          role="status"
          aria-live="polite"
          className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-medium flex items-center justify-center gap-2.5 shadow-xs sticky top-0 z-50 animate-fadeIn border-b border-emerald-700/40"
        >
          <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-emerald-700/80 ring-1 ring-emerald-300/40 shrink-0 text-emerald-100 shadow-2xs animate-subtle-pulse">
            <Wifi className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
          <span className="leading-snug text-center sm:text-left">
            <strong className="font-semibold text-emerald-100">Conexión restablecida:</strong> Sincronización en la nube activa y actualizada.
          </span>
        </div>
      )}

      {/* Top Navigation */}
      <Navbar
        isSidebarHidden={isSidebarHidden}
        onToggleSidebar={toggleSidebar}
        currentView={currentView}
        onViewChange={(v) => {
          persistViewPreference(v);
          if (v === 'admin') {
            requireAuth(() => setCurrentView('admin'), 'acceder al panel de administración');
          } else if (v === 'directory') {
            setAdminSubTab('applicants');
            requireAuth(() => setCurrentView('admin'), 'acceder al registro de solicitantes');
          } else if (v === 'maintenance') {
            setAdminSubTab('maintenance');
            requireAuth(() => setCurrentView('admin'), 'acceder a mantención y bloqueos');
          } else {
            setCurrentView(v);
          }
        }}
        onNewReservation={() => {
          requireAuth(() => {
            if (!userCanCreateReservations(currentUser)) {
              triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
              return;
            }
            setEditingReservation(null);
            setIsDuplicating(false);
            setPrefillDate(format(selectedDailyDate || new Date(), 'yyyy-MM-dd'));
            if (!enabledSpaces.length) {
              triggerSyncToast('No hay espacios activos. Activa o crea un espacio en Administración.', 'warning');
              return;
            }
            const initialSpace = enabledSpaces.some(space => space.name === filters.espacio) ? filters.espacio : enabledSpaces[0].name;
            setPrefillSpace(initialSpace);
            setPrefillStartTime('10:00');
            setPrefillEndTime('11:00');
            setPrefillParsedRequest(null);
            setIsReservationModalOpen(true);
          }, 'crear una nueva reserva');
        }}
        onOpenQuickRequest={() => handleOpenQuickRequest()}
        onDeleteDay={userCanDeleteReservations(currentUser) ? () => setIsDeleteDayModalOpen(true) : undefined}
        onOpenImportExport={() => {
          requireAuth(() => setIsImportExportModalOpen(true), 'importar o exportar reservas');
        }}
        onOpenAuditLog={() => {
          if (!isCoordinatorOrAdmin(currentUser)) {
            triggerSyncToast('El sistema de restauración de cambios está disponible únicamente para Administradores y Coordinadores.', 'warning');
            return;
          }
          setIsAuditLogOpen(true);
        }}
        onOpenPrintModal={() => setIsGlobalPrintModalOpen(true)}
        onOpenGmailDispatch={() => openGmailDispatchModal()}
        onOpenNotificationCenter={() => setIsNotificationCenterOpen(true)}
        unreadNotificationsCount={unreadNotificationsCount}
        pendingDeletionsCount={pendingReservations.length}
        onOpenPendingDeletions={() => setIsPendingDeletionsModalOpen(true)}
        isFilterBarOpen={isFilterBarOpen}
        onToggleFilterBar={() => setIsFilterBarOpen((prev) => !prev)}
        hasActiveFilters={hasActiveFilters}
        onOpenPasswordPrompt={() => {
          setPendingAuthAction(null);
          setAuthActionDescription('habilitar permisos de edición');
          setIsPasswordPromptOpen(true);
        }}
        onOpenChangePassword={() => handleOpenChangePassword()}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        totalReservas={reservations.length}
        conflictsCount={conflictsCount}
        currentUser={currentUser}
        onLogout={handleLogout}
        isFirebaseConnected={isFirebaseConnected}
        isFirebaseSyncing={isFirebaseSyncing}
        lastSyncTime={lastSyncTime ? new Date(lastSyncTime) : null}
        onRetrySync={async () => {
          try {
            const res = await handleSyncAllToFirebase();
            if (res && !res.error) {
              triggerSyncToast('Sincronización con la nube completada con éxito', 'success');
            } else if (res?.error) {
              triggerSyncToast(res.error, 'error');
            }
          } catch (err: any) {
            triggerSyncToast(err?.message || 'Error al conectar con Firestore', 'error');
          }
        }}
      />

      {/* Revalidation Banner for cloud synchronization feedback */}
      <RevalidationBanner isRevalidating={isFirebaseSyncing} />
      {generalDataPending && (
        <div role="status" className="p-4 text-center text-slate-600">
          {readError ? 'No se pudieron cargar las reservas. Comprueba tu conexión.' : 'Cargando reservas para esta vista...'}
          {readError && <button type="button" onClick={retryRead} className="ml-3 text-blue-600 underline">Reintentar</button>}
          {(isImportExportModalOpen || isGlobalPrintModalOpen || isGmailDispatchModalOpen) && (
            <button type="button" className="ml-3 text-blue-600 underline" onClick={() => {
              setIsImportExportModalOpen(false); setIsGlobalPrintModalOpen(false); setIsGmailDispatchModalOpen(false);
            }}>Cancelar</button>
          )}
        </div>
      )}

      {/* Main View Area */}
      <main id="main-content" tabIndex={-1} className={`flex-1 min-w-0 w-full mx-auto outline-none ${
        isAgendaView(currentView)
          ? (currentView === 'daily' || currentView === 'timeline'
            ? 'max-w-none px-2 sm:px-3 py-2'
            : `${isSidebarHidden ? 'max-w-none' : 'max-w-[1680px]'} px-3 sm:px-6 py-4`)
          : 'max-w-[1680px] px-3 sm:px-4 md:px-6 py-4'
      }`}>
        {isAgendaView(currentView) && <AgendaToolbar
          view={currentView}
          onViewChange={view => { persistViewPreference(view); setCurrentView(view); }}
          summary={`${visiblePeriodCounts.filtered} ${visiblePeriodCounts.filtered === 1 ? 'reserva' : 'reservas'} en ${visiblePeriodLabel}`}
          filtersOpen={isFilterBarOpen} hasActiveFilters={hasActiveFilters}
          onToggleFilters={() => setIsFilterBarOpen(open => !open)}
          onOpenAvailability={() => setIsSpaceAvailabilityOpen(true)}
          onPrevPeriod={() => setSelectedDailyDate(d => currentView === 'calendar' ? subMonths(d, 1) : subDays(d, 1))}
          onNextPeriod={() => setSelectedDailyDate(d => currentView === 'calendar' ? addMonths(d, 1) : addDays(d, 1))}
          onGoToday={() => setSelectedDailyDate(new Date())}
          onBackToMonth={currentView !== 'calendar' ? () => { persistViewPreference('calendar'); setCurrentView('calendar'); } : undefined}
          upcomingReplacementsCount={dueReplacements.length}
          onOpenUpcomingReplacement={dueReplacements.length > 0 ? () => {
            const nextRep = dueReplacements[0];
            setSelectedReservation(nextRep);
            setIsDetailModalOpen(true);
          } : undefined}
        />}
        {isSpaceAvailabilityOpen && <SpaceAvailabilityModal
          initialDate={format(selectedDailyDate, 'yyyy-MM-dd')}
          onClose={() => setIsSpaceAvailabilityOpen(false)}
          onReserve={userCanCreateReservations(currentUser) ? params => {
            setIsSpaceAvailabilityOpen(false);
            openCreateModal(params);
          } : undefined}
        />}
        {/* Filter and Search Bar - Kept hidden by default, toggled via Navbar or active filter ribbon */}
        {currentView !== 'admin' && isFilterBarOpen && (
          <FilterBar
            filters={filters}
            onFilterChange={setFilters}
            onResetFilters={() =>
              setFilters({
                search: '',
                espacio: '',
                tipoActividad: '',
                fechaDesde: '',
                fechaHasta: '',
                soloRecurrentes: false,
                soloImportantes: false,
                soloConTopamiento: false
              })
            }
            onClose={() => setIsFilterBarOpen(false)}
            totalFiltered={visiblePeriodCounts.filtered}
            totalAll={visiblePeriodCounts.all}
            periodLabel={visiblePeriodLabel}
            conflictsCount={conflictsCount}
            availableSpaces={spaces}
            availableActivityTypes={activityTypes}
          />
        )}

        {/* Subtle indicator banner when filters are active but panel is kept hidden */}
        {currentView !== 'admin' && !isFilterBarOpen && (filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) && (
          <div role="alert" className="mb-3 rounded-lg bg-rose-50 border border-rose-300 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2 animate-fadeIn shadow-2xs text-rose-900 font-semibold">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>La fecha de inicio es posterior a la fecha de término. Corrige las fechas para ver las reservas.</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setIsFilterBarOpen(true)}
                className="min-h-11 text-rose-700 hover:text-rose-900 font-semibold underline"
              >
                Corregir en filtros
              </button>
              <span className="text-rose-300">|</span>
              <button
                type="button"
                onClick={() => setFilters(prev => ({ ...prev, fechaDesde: prev.fechaHasta, fechaHasta: prev.fechaDesde }))}
                className="min-h-11 px-3 bg-rose-600 text-white rounded-lg text-sm font-semibold"
              >
                Invertir fechas
              </button>
            </div>
          </div>
        )}

        {/* Subtle indicator banner when filters are active but panel is kept hidden */}
        {currentView !== 'admin' && !isFilterBarOpen && hasActiveFilters && !(filters.fechaDesde && filters.fechaHasta && filters.fechaDesde > filters.fechaHasta) && (
          <div role="status" className="mb-3 rounded-lg bg-blue-50/95 border border-blue-200 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-2 animate-fadeIn shadow-2xs">
            <div className="flex items-center space-x-2 text-blue-900 font-medium">
              <Filter className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                Filtros activos: {visiblePeriodCounts.filtered} de {visiblePeriodCounts.all} reservas en {visiblePeriodLabel}
              </span>
            </div>
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => setIsFilterBarOpen(true)}
                className="min-h-11 text-blue-700 hover:text-blue-900 font-semibold underline text-sm"
              >
                Abrir panel de filtros
              </button>
              <span className="text-blue-300">|</span>
              <button
                type="button"
                onClick={() =>
                  setFilters({
                    search: '',
                    espacio: '',
                    tipoActividad: '',
                    fechaDesde: '',
                    fechaHasta: '',
                    soloRecurrentes: false,
                    soloImportantes: false,
                    soloConTopamiento: false
                  })
                }
                className="min-h-11 text-blue-700 hover:text-blue-900 font-semibold text-sm"
              >
                Limpiar filtros
              </button>
            </div>
          </div>
        )}

        {!generalDataPending && <>
        <PendingReservationOperations user={currentUser} />
        {/* Banner de Recuperación de Borrador de Reserva tras Recarga Accidental */}
        {activeDraft && !isReservationModalOpen && (
          <div
            id="app-active-draft-banner"
            className="mb-3 p-2.5 sm:p-3 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-xs flex flex-wrap items-center justify-between gap-2 animate-fadeIn"
          >
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-200 text-amber-900 shrink-0">
                <RotateCcw className="w-4 h-4 text-amber-800" />
              </div>
              <div className="text-xs text-amber-950">
                <span className="font-bold">
                  Borrador de reserva no guardado ({activeDraft.timeAgo}):
                </span>
                <span className="text-amber-900 ml-1">
                  Tenías una reserva en progreso ({activeDraft.summaryLabel}). ¿Deseas reanudar tu edición?
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                id="btn-app-resume-draft"
                onClick={() => {
                  if (activeDraft.isEditing && activeDraft.targetId) {
                    if (!userCanEditReservations(currentUser)) {
                      triggerSyncToast('Permiso denegado: No tienes autorización para editar reservas (gestión controlada por Cristian Shute).', 'error');
                      return;
                    }
                    const target = reservations.find((r) => r.id === activeDraft.targetId);
                    if (target) {
                      setEditingReservation(target);
                      setIsDuplicating(false);
                      setIsReservationModalOpen(true);
                      return;
                    }
                  }
                  if (!userCanCreateReservations(currentUser)) {
                    triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
                    return;
                  }
                  openCreateModal();
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Continuar editando</span>
              </button>
              <button
                type="button"
                id="btn-app-discard-draft"
                onClick={() => {
                  removeStoredDraft(activeDraft.key);
                  setActiveDraft(null);
                }}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-amber-800 hover:text-amber-950 hover:bg-amber-100 transition cursor-pointer"
              >
                Descartar
              </button>
            </div>
          </div>
        )}

        {/* Banner de Solicitudes de Eliminación en Espera (Para Administradores y Coordinadores) */}
        {isCoordinatorOrAdmin(currentUser) && pendingReservations.length > 0 && currentView !== 'admin' && (
          <div className="mb-3 p-2.5 sm:p-3 rounded-2xl bg-amber-50 border-2 border-amber-300 shadow-xs flex flex-wrap items-center justify-between gap-2 animate-fadeIn">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-amber-200 text-amber-900 shrink-0">
                <Clock className="w-4 h-4 text-amber-800" />
              </div>
              <div className="text-xs text-amber-950">
                <span className="font-bold">
                  {pendingReservations.length === 1
                    ? 'Hay 1 solicitud de eliminación de reserva en espera de autorización.'
                    : `Hay ${pendingReservations.length} solicitudes de eliminación de reservas en espera de autorización.`}
                </span>
                <span className="hidden sm:inline text-amber-900 ml-1">
                  Requiere revisión y aprobación de un Administrador o Coordinador.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPendingDeletionsModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
            >
              <span>Revisar Solicitudes</span>
              <span className="bg-white text-amber-900 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                {pendingReservations.length}
              </span>
            </button>
          </div>
        )}

        {isDeleteDayModalOpen && userCanDeleteReservations(currentUser) && (
          <DeleteDayReservationsModal initialDate={format(selectedDailyDate, 'yyyy-MM-dd')}
            onClose={() => setIsDeleteDayModalOpen(false)} onConfirm={handleDeleteDay} />
        )}

        {currentView === 'calendar' && (
          isInitialLoading ? (
            <CalendarSkeleton />
          ) : (
            <CalendarView
              reservations={filteredReservations}
              spaces={spaces}
              selectedDate={selectedDailyDate}
              spaceBlocks={spaceBlocks}
              onVisibleMonthChange={setSelectedDailyDate}
              onSelectedDateChange={setSelectedDailyDate}
              onLoadHistoricalMonth={reservationReadScope ? undefined : loadHistoricalMonth}
              isHistoricalLoading={isHistoricalLoading}
              onNavigateToDay={(day) => {
                setSelectedDailyDate(day);
                if (isMobileDevice()) {
                  setCurrentView('mobile');
                } else {
                  setCurrentView('daily');
                }
              }}
              onSelectReservation={handleCalendarSelectReservation}
              onNewReservationForDate={handleCalendarNewReservationForDate}
            />
          )
        )}

        {(currentView === 'timeline' || currentView === 'daily') && (
          isInitialLoading ? (
            <TimelineSkeleton />
          ) : (
            <DailyUsageView
              comparisonSpaces={comparisonSpaces}
              onComparisonSpacesChange={setComparisonSpaces}
              reservations={filteredReservations}
              allReservations={reservations}
              conflictReservationIds={conflictReservationIds}
              globalFilters={filters}
              onFilterChange={setFilters}
              onClearGlobalFilters={() =>
                setFilters({
                  search: '',
                  espacio: '',
                  tipoActividad: '',
                  fechaDesde: '',
                  fechaHasta: '',
                  soloRecurrentes: false,
                  soloImportantes: false,
                  soloConTopamiento: false
                })
              }
              spaces={spaces}
              selectedDate={selectedDailyDate}
              initialDate={selectedDailyDate}
              onDateChange={(date) => setSelectedDailyDate(date)}
              spaceBlocks={spaceBlocks}
              onNavigateToMaintenance={() => {
                setAdminSubTab('maintenance');
                requireAuth(() => setCurrentView('admin'), 'acceder a mantención');
              }}
              onSelectReservation={(r) => {
                setSelectedReservation(r);
                setIsDetailModalOpen(true);
              }}
              onOpenCheckIn={handleOpenCheckIn}
              onDuplicateReservation={(r) => {
                handleDuplicateReservation(r);
              }}
              onReplaceReservation={handleStartReplacement}
              onEditReservation={(r) => { requireAuth(() => void prepareReservationEditor(r), 'editar esta reserva'); }}
              onDeleteReservation={(id, isSeries, seriesId) => {
                return requireAuth(() => handleDelete(id, isSeries, seriesId), 'eliminar esta reserva');
              }}
              onRequestDelete={(r) => {
                requireAuth(() => handleRequestDelete(r), 'eliminar esta reserva');
              }}
              onNewReservationWithSlot={(space, date, start, end) => {
                requireAuth(() => {
                  if (!userCanCreateReservations(currentUser)) {
                    triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
                    return;
                  }
                  setEditingReservation(null);
                  setIsDuplicating(false);
                  setPrefillSpace(space);
                  setPrefillDate(date);
                  // Toda reserva desde temprano: cargar de manera predeterminada desde las 08:30 como inicio
                  const isEarly = !start || start < '08:30';
                  const safeStart = isEarly ? '08:30' : start;
                  const safeEnd = isEarly
                    ? (end && end > '08:30' && end !== '09:00' ? end : '09:30')
                    : (end || '10:00');
                  setPrefillStartTime(safeStart);
                  setPrefillEndTime(safeEnd);
                  setIsReservationModalOpen(true);
                }, 'crear una reserva en este horario');
              }}
              onUpdateReservation={(target) => {
                if (!userCanEditReservations(currentUser) || pendingSeriesMove) {
                  triggerSyncToast('No tienes permiso para mover reservas o hay un movimiento pendiente.', 'error');
                  return false;
                }
                const original = reservations.find(r => r.id === target.id);
                if (!original || (original.version || 0) !== (target.version || 0)) {
                  triggerSyncToast('La reserva cambió. Recarga la agenda antes de moverla.', 'error'); return false;
                }
                if (isRecurringSeriesReservation(original)) {
                  return new Promise<boolean>(resolve => setPendingSeriesMove({ original, target, resolve }));
                }
                return handleMoveReservation(original, target, 'single');
              }}
              onReorderSpaces={(newSpaces) => {
                handleReorderSpaces(newSpaces);
              }}
            />
          )
        )}

        {currentView === 'mobile' && (
          isInitialLoading ? (
            <TimelineSkeleton />
          ) : (
            <MobileAgendaView
              reservations={filteredReservations}
              allReservations={reservations}
              conflictReservationIds={conflictReservationIds}
              spaces={spaces}
              spaceBlocks={spaceBlocks}
              selectedDate={selectedDailyDate}
              onDateChange={(date) => setSelectedDailyDate(date)}
              onSelectReservation={(r) => {
                setSelectedReservation(r);
                setIsDetailModalOpen(true);
              }}
              onEditReservation={(r) => { requireAuth(() => void prepareReservationEditor(r), 'editar esta reserva'); }}
              onDuplicateReservation={(r) => {
                handleDuplicateReservation(r);
              }}
              onReplaceReservation={handleStartReplacement}
              onDeleteReservation={(id, isSeries, seriesId) => {
                return requireAuth(() => handleDelete(id, isSeries, seriesId), 'eliminar esta reserva');
              }}
              onRequestDelete={(r) => {
                requireAuth(() => handleRequestDelete(r), 'eliminar esta reserva');
              }}
              onNewReservationForDate={(dateStr, space) => {
                requireAuth(() => {
                  if (!userCanCreateReservations(currentUser)) {
                    triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
                    return;
                  }
                  setEditingReservation(null);
                  setIsDuplicating(false);
                  if (space) setPrefillSpace(space);
                  setPrefillDate(dateStr);
                  setPrefillStartTime('08:30');
                  setPrefillEndTime('09:30');
                  setIsReservationModalOpen(true);
                }, 'crear una reserva en esta fecha');
              }}
              onToggleRealizada={(r) => {
                if (!currentUser) {
                  setPendingAuthAction(() => () => handleQuickToggleRealizada(r));
                  setAuthActionDescription('actualizar estado de asistencia');
                  setIsPasswordPromptOpen(true);
                  return;
                }
                requireAuth(() => handleQuickToggleRealizada(r), 'actualizar asistencia de reserva');
              }}
              onOpenCheckIn={handleOpenCheckIn}
              onOpenRating={(r, rating) => {
                handleOpenRatingModal(r, rating);
              }}
              ratings={ratings}
              currentUser={currentUser}
              onSwitchToDesktopView={() => {
                persistViewPreference('daily');
                setCurrentView('daily');
              }}
            />
          )
        )}

        {currentView === 'spaces' && (
          <Suspense fallback={<div className="p-12 text-center text-slate-500 font-medium">Cargando panel de espacios...</div>}>
            <SpaceDashboard
              currentUser={currentUser}
              onDistributionCommitted={rows => {
                setReservations(previous => {
                  const merged = new Map(previous.map(row => [row.id, row]));
                  rows.forEach(row => merged.set(row.id, row));
                  return [...merged.values()];
                });
                triggerSyncToast(`Distribución confirmada: ${rows.length} actividades guardadas.`, 'success');
              }}
              reservations={reservations}
              spaces={spaces}
              onSelectSpace={(spaceName) => {
                setFilters({ ...filters, espacio: spaceName });
                if (isMobileDevice()) {
                  setCurrentView('mobile');
                } else {
                  setCurrentView('daily');
                }
              }}
              onNewReservationForSpace={(spaceName) => {
                requireAuth(() => {
                  if (!userCanCreateReservations(currentUser)) {
                    triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
                    return;
                  }
                  setEditingReservation(null);
                  setIsDuplicating(false);
                  setPrefillSpace(spaceName);
                  setPrefillDate(format(new Date(), 'yyyy-MM-dd'));
                  setPrefillStartTime('10:00');
                  setPrefillEndTime('11:00');
                  setIsReservationModalOpen(true);
                }, 'crear una reserva en este espacio');
              }}
              onSelectReservation={(r) => {
                setSelectedReservation(r);
                setIsDetailModalOpen(true);
              }}
            />
          </Suspense>
        )}

        {currentView === 'analytics' && (
          <Suspense fallback={<div className="p-12 text-center text-slate-500 font-medium">Cargando módulo de analíticas avanzadas...</div>}>
            <AnalyticsView reservations={reservations} />
          </Suspense>
        )}

        {currentView === 'ratings' && (
          <Suspense fallback={<div className="p-12 text-center text-slate-500 font-medium">Cargando evaluaciones y satisfacción...</div>}>
            <RatingsDashboardView
              reservations={reservations}
              ratings={ratings}
              currentUser={currentUser}
              onOpenRatingModal={handleOpenRatingModal}
              onDeleteRating={handleDeleteRating}
            />
          </Suspense>
        )}

        {currentView === 'conflicts' && (
          <Suspense fallback={<div className="p-12 text-center text-slate-500 font-medium">Analizando topamientos y conflictos...</div>}>
            <ConflictsView
              reservations={reservations}
              spaceBlocks={spaceBlocks}
              onSelectReservation={(r) => {
                setSelectedReservation(r);
                setIsDetailModalOpen(true);
              }}
              onEditReservation={(r) => { requireAuth(() => void prepareReservationEditor(r), 'editar esta reserva'); }}
            />
          </Suspense>
        )}

        {(currentView === 'admin' || currentView === 'directory' || currentView === 'maintenance') && (
          <Suspense fallback={<div className="p-12 text-center text-slate-500 font-medium">Cargando panel de administración...</div>}>
            <AdminView
              spaces={spaces}
              loanTypes={loanTypes}
              activityTypes={activityTypes}
              equipmentList={equipment}
              users={userAccounts}
              lastSyncTime={lastSyncTime}
              currentUser={currentUser}
              reservations={reservations}
              spaceBlocks={spaceBlocks}
              ratings={ratings}
              initialTab={currentView === 'directory' ? 'applicants' : currentView === 'maintenance' ? 'maintenance' : adminSubTab}
              onTabChange={setAdminSubTab}
              onLogout={handleLogout}
              onSaveSpace={(space) => requireAuth(() => handleSaveSpace(space), 'guardar espacio')}
              onDeleteSpace={(id) => requireAuth(() => handleDeleteSpace(id), 'eliminar espacio')}
              onSaveLoanType={(loan) => requireAuth(() => handleSaveLoanType(loan), 'guardar tipo de préstamo')}
              onDeleteLoanType={(id) => requireAuth(() => handleDeleteLoanType(id), 'eliminar tipo de préstamo')}
              onSaveActivityType={(act) => requireAuth(() => handleSaveActivityType(act), 'guardar tipo de actividad')}
              onDeleteActivityType={(id) => requireAuth(() => handleDeleteActivityType(id), 'eliminar tipo de actividad')}
              onSaveEquipment={(item) => requireAuth(() => handleSaveEquipment(item), 'guardar equipamiento')}
              onDeleteEquipment={(id) => requireAuth(() => handleDeleteEquipment(id), 'eliminar equipamiento')}
              onResetEquipment={() => requireAuth(handleResetEquipment, 'restablecer inventario de equipamiento')}
              onSaveUser={(user, orig) => requireAuth(() => handleSaveUser(user, orig), 'guardar usuario')}
              onDeleteUser={async (username) => {
                return await requireAuth(() => handleDeleteUser(username), 'eliminar usuario') || { success: false, message: 'Debes iniciar sesión.' };
              }}
              onResetUsers={() => requireAuth(handleResetUsers, 'restablecer usuarios')}
              onResetDefaults={() => requireAuth(handleResetDefaults, 'restablecer configuración')}
              onReorderSpaces={(newSpaces) => requireAuth(() => handleReorderSpaces(newSpaces), 'reordenar espacios')}
              onDeleteAllHolidays={handleDeleteAllHolidays}
              onOpenChangePassword={(usr) => handleOpenChangePassword(usr)}
              onOpenImportExport={() => setIsImportExportModalOpen(true)}
              onSaveBlock={async (block) => {
                await requireAuth(async () => {
                  await handleSaveBlock(block);
                }, 'guardar bloqueo de espacio');
              }}
              onDeleteBlock={async (id) => {
                await requireAuth(async () => {
                  await handleDeleteBlock(id);
                }, 'eliminar bloqueo de espacio');
              }}
              onSelectReservation={(r) => {
                setSelectedReservation(r);
                setIsDetailModalOpen(true);
              }}
              onNewReservationForApplicant={(applicant) => {
                requireAuth(() => {
                  if (!userCanCreateReservations(currentUser)) {
                    triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
                    return;
                  }
                  setEditingReservation(null);
                  setIsDuplicating(false);
                  setPrefillSpace(applicant.espaciosMasUsados?.[0]?.espacio || '');
                  setPrefillDate(format(new Date(), 'yyyy-MM-dd'));
                  setPrefillStartTime('10:00');
                  setPrefillEndTime('11:00');
                  setPrefillResponsable(applicant.responsable || '');
                  setPrefillRut(applicant.rut || '');
                  setPrefillPhone(applicant.telefonoContacto || '');
                  setPrefillEmail(applicant.emailContacto || '');
                  setIsReservationModalOpen(true);
                }, 'crear una reserva para este solicitante');
              }}
              onOpenGmailDispatch={(date) => openGmailDispatchModal(date)}
              onSaveReservation={async (reserva, generateSeries, explicitSlots, updateWholeSeries) => {
                let success = false;
                await requireAuth(async () => {
                  success = await handleCreateOrUpdate(reserva, generateSeries, explicitSlots, updateWholeSeries);
                }, 'guardar actividad recurrente');
                return success;
              }}
              onDeleteReservation={async (id, seriesId) => {
                await requireAuth(async () => {
                  await handleDelete(id, !!seriesId, seriesId);
                }, 'eliminar actividad recurrente');
              }}
              onEditReservation={(r) => { requireAuth(() => void prepareReservationEditor(r), 'editar esta reserva'); }}
            />
          </Suspense>
        )}
        </>}
      </main>

      {/* Application Footer with 'Última actualización: [Fecha/Hora]' */}
      <AppFooter
        lastSyncTime={lastSyncTime}
        isSyncing={isFirebaseSyncing}
        isFirebaseConnected={isFirebaseConnected}
        totalReservations={reservations.length}
        onManualSync={async () => {
          if (!canWrite) {
            retryRead();
            return;
          }
          try {
            const res = await handleSyncAllToFirebase();
            if (res && !res.error) {
              triggerSyncToast('Sincronización con la nube completada con éxito', 'success');
            } else if (res?.error) {
              triggerSyncToast(res.error, 'error');
            }
          } catch (err: any) {
            triggerSyncToast(err?.message || 'Error al conectar con Firestore', 'error');
          }
        }}
      />

      {/* Modals */}
      {contextMenuState && (
        <ReservationContextMenu
          reservation={
            contextMenuState.reservation
              ? (reservations.find(r => r.id === contextMenuState.reservation?.id) || contextMenuState.reservation)
              : null
          }
          calendarContext={contextMenuState.calendarContext || null}
          x={contextMenuState.x}
          y={contextMenuState.y}
          currentUser={currentUser}
          existingRating={
            contextMenuState.reservation
              ? (ratings.find((rt) => rt.reservationId === contextMenuState.reservation?.id) || null)
              : null
          }
          isFilterBarOpen={isFilterBarOpen}
          onClose={() => setContextMenuState(null)}
          onViewDetails={(r) => {
            setSelectedReservation(r);
            setIsDetailModalOpen(true);
          }}
          onEdit={(r) => {
            requireAuth(() => void prepareReservationEditor(r), 'editar esta reserva');
          }}
          onReplace={handleStartReplacement}
          onDuplicate={(r) => {
            handleDuplicateReservation(r);
          }}
          onToggleRealizada={(r) => {
            if (!userCanEditReservations(currentUser)) {
              triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas (gestión controlada por Cristian Shute).', 'error');
              return;
            }
            requireAuth(() => handleQuickToggleRealizada(r), 'actualizar asistencia de reserva');
          }}
          onOpenCheckIn={handleOpenCheckIn}
          onOpenRating={(r, rating) => {
            handleOpenRatingModal(r, rating);
          }}
          onViewRelated={async (id) => {
            try {
              const related = reservations.find(r => r.id === id) || await fetchReservationById(id);
              if (!related) throw new Error('La actividad relacionada ya no existe.');
              setSelectedReservation(related);
              setIsDetailModalOpen(true);
            } catch (error: any) {
              triggerSyncToast(error.message || 'No se pudo consultar la actividad relacionada.', 'error');
            }
          }}
          onDelete={(id, isSeries, seriesId) => {
            if (!userCanDeleteReservations(currentUser)) {
              const target = reservations.find((r) => r.id === id);
              if (target) handleRequestDelete(target);
              return;
            }
            return requireAuth(() => handleDelete(id, isSeries, seriesId), 'eliminar esta reserva');
          }}
          onRequestDelete={(r) => {
            requireAuth(() => handleRequestDelete(r), 'eliminar esta reserva');
          }}
          onCreateReservation={({ date, space, startTime, endTime }) => {
            requireAuth(() => {
              if (!userCanCreateReservations(currentUser)) {
                triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
                return;
              }
              if (!enabledSpaces.length) {
                triggerSyncToast('No hay espacios activos. Activa o crea un espacio en Administración.', 'warning');
                return;
              }
              setEditingReservation(null);
              setIsDuplicating(false);
              setPrefillDate(date);
              const resolvedSpace =
                (space && enabledSpaces.some((s) => s.name === space) ? space : undefined) ||
                (enabledSpaces.some((s) => s.name === filters.espacio) ? filters.espacio : enabledSpaces[0]?.name || '');
              setPrefillSpace(resolvedSpace);
              const isEarly = !startTime || startTime < '08:30';
              const safeStart = isEarly ? '08:30' : startTime;
              const safeEnd = isEarly
                ? (endTime && endTime > '08:30' && endTime !== '09:00' ? endTime : '09:30')
                : (endTime || '10:00');
              setPrefillStartTime(safeStart);
              setPrefillEndTime(safeEnd);
              setPrefillParsedRequest(null);
              setIsReservationModalOpen(true);
            }, 'crear una reserva en esta fecha');
          }}
          onOpenQuickRequest={({ date, space, startTime, endTime }) => {
            handleOpenQuickRequest({ date, space, startTime, endTime });
          }}
          onNavigateToDay={(dateStr) => {
            const targetDate = parseDateToNoon(dateStr);
            setSelectedDailyDate(targetDate);
            const nextView: ViewMode = isMobileDevice() ? 'mobile' : 'daily';
            persistViewPreference(nextView);
            setCurrentView(nextView);
          }}
          onSwitchToMonthView={(dateStr) => {
            const targetDate = parseDateToNoon(dateStr);
            setSelectedDailyDate(targetDate);
            persistViewPreference('calendar');
            setCurrentView('calendar');
          }}
          onGoToday={() => {
            setSelectedDailyDate(new Date());
          }}
          onOpenPrintModal={(dateStr) => {
            setGlobalPrintInitialDate(dateStr);
            setIsGlobalPrintModalOpen(true);
          }}
          onOpenGmailDispatch={(dateStr) => {
            openGmailDispatchModal(dateStr);
          }}
          onOpenCommandPalette={() => {
            setIsCommandPaletteOpen(true);
          }}
          onToggleFilters={() => {
            setIsFilterBarOpen((prev) => !prev);
          }}
          onDeleteDay={
            userCanDeleteReservations(currentUser)
              ? (dateStr) => {
                  setSelectedDailyDate(parseDateToNoon(dateStr));
                  setIsDeleteDayModalOpen(true);
                }
              : undefined
          }
        />
      )}
      {pendingSeriesMove && <Suspense fallback={null}>
        <RecurringMoveScopeModal original={pendingSeriesMove.original} target={pendingSeriesMove.target}
          onCancel={() => { pendingSeriesMove.resolve(false); setPendingSeriesMove(null); }}
          onConfirm={async scope => {
            const success = await handleMoveReservation(pendingSeriesMove.original, pendingSeriesMove.target, scope);
            if (success) { pendingSeriesMove.resolve(true); setPendingSeriesMove(null); }
            return success;
          }} />
      </Suspense>}
      {replacementReminder && <Suspense fallback={null}>
        <ReplacementReminderModal key={replacementReminder.id} replacement={replacementReminder}
          original={reservations.find(r => r.id === replacementReminder.reemplazaReservaId)}
          pendingCount={replacementReminderCount}
          onAcknowledge={() => acknowledgeReplacementReminder(replacementReminder)}
          onViewActivity={() => {
            acknowledgeReplacementReminder(replacementReminder);
            setSelectedReservation(replacementReminder);
            setIsDetailModalOpen(true);
          }} />
      </Suspense>}
      {isReservationModalOpen && (
        <Suspense fallback={null}>
          <ReservationModal
            replacementSource={replacementSource}
            isOpen={isReservationModalOpen}
            onClose={() => {
              setIsReservationModalOpen(false);
              setReplacementSource(null);
              setContextMenuState(null);
              setEditingReservation(null);
              setIsDuplicating(false);
              setPrefillDate('');
              setPrefillSpace('');
              setPrefillStartTime('10:00');
              setPrefillEndTime('11:00');
              setPrefillResponsable('');
              setPrefillRut('');
              setPrefillPhone('');
              setPrefillEmail('');
              setPrefillParsedRequest(null);
            }}
            onSave={handleCreateOrUpdate}
            onDelete={handleDelete}
            onRequestDelete={handleRequestDelete}
            editingReservation={editingReservation}
            isDuplicating={isDuplicating}
            onDuplicateReservation={handleDuplicateReservation}
            allReservations={replacementSource ? reservations.filter(r => r.id !== replacementSource.id) : reservations}
            availableSpaces={spaces}
            availableLoanTypes={loanTypes}
            availableActivityTypes={activityTypes}
            availableEquipment={equipment}
            ratings={ratings}
            spaceBlocks={spaceBlocks}
            currentUser={currentUser}
            initialDate={prefillDate}
            initialSpace={prefillSpace}
            initialStartTime={prefillStartTime}
            initialEndTime={prefillEndTime}
            initialResponsable={prefillResponsable}
            initialRut={prefillRut}
            initialPhone={prefillPhone}
            initialEmail={prefillEmail}
            initialParsedRequest={prefillParsedRequest}
            onOpenQuickRequest={() => {
              setIsReservationModalOpen(false);
              handleOpenQuickRequest({
                date: prefillDate || format(selectedDailyDate || new Date(), 'yyyy-MM-dd'),
                space: prefillSpace,
                startTime: prefillStartTime,
                endTime: prefillEndTime
              });
            }}
          />
        </Suspense>
      )}

      {quickRequestModalState.isOpen && (
        <Suspense fallback={null}>
          <QuickRequestCreatorModal
            isOpen={quickRequestModalState.isOpen}
            onClose={() => setQuickRequestModalState({ isOpen: false })}
            allReservations={reservations}
            availableSpaces={enabledSpaces}
            availableActivityTypes={activityTypes}
            availableLoanTypes={loanTypes}
            availableEquipment={equipment}
            spaceBlocks={spaceBlocks}
            defaultDate={quickRequestModalState.date}
            defaultSpace={quickRequestModalState.space}
            defaultStartTime={quickRequestModalState.startTime}
            defaultEndTime={quickRequestModalState.endTime}
            onCreateDirectly={async (reserva, generateSeries, seriesDates) => {
              let saved = false;
              await requireAuth(async () => {
                saved = await handleCreateOrUpdate(reserva, generateSeries, seriesDates);
              }, 'crear reserva desde solicitud rápida');
              return saved;
            }}
            onOpenInFullForm={(parsed) => {
              setQuickRequestModalState({ isOpen: false });
              setEditingReservation(null);
              setIsDuplicating(false);
              setPrefillDate(parsed.fecha);
              setPrefillSpace(parsed.espacio);
              setPrefillStartTime(parsed.horaInicio);
              setPrefillEndTime(parsed.horaFin);
              setPrefillResponsable(parsed.responsable);
              setPrefillRut(parsed.rut);
              setPrefillPhone(parsed.telefonoContacto);
              setPrefillEmail(parsed.emailContacto);
              setPrefillParsedRequest(parsed);
              setIsReservationModalOpen(true);
            }}
          />
        </Suspense>
      )}

      {isDetailModalOpen && (
        <Suspense fallback={null}>
          <ReservationDetailModal
            onReplace={(r) => {
              if (!userCanCreateReservations(currentUser) || !userCanEditReservations(currentUser) || !canReplaceOccurrence(r)) return;
              setReplacementSource(r);
              setEditingReservation(null);
              setIsDuplicating(false);
              setPrefillDate(r.fecha);
              setPrefillSpace(r.espacio);
              setPrefillStartTime(r.horaInicio);
              setPrefillEndTime(r.horaFin);
              setPrefillResponsable(r.responsable);
              setPrefillRut(r.rut || '');
              setPrefillPhone(r.telefonoContacto || '');
              setPrefillEmail(r.emailContacto || '');
              setIsDetailModalOpen(false);
              setIsReservationModalOpen(true);
            }}
            onViewRelated={async (id) => {
              try {
                const related = await fetchReservationById(id);
                if (!related) throw new Error('La actividad relacionada ya no existe.');
                setSelectedReservation(related);
              } catch (error: any) {
                triggerSyncToast(error.message || 'No se pudo consultar la actividad relacionada.', 'error');
              }
            }}
            isOpen={isDetailModalOpen}
            reservation={selectedReservation}
            allReservations={reservations}
            onMergeReservations={handleMergeReservations}
            currentUser={currentUser}
            existingRating={
              selectedReservation
                ? ratings.find((rt) => rt.reservationId === selectedReservation.id) || null
                : null
            }
            onOpenRatingModal={handleOpenRatingModal}
            onOpenCheckIn={handleOpenCheckIn}
            onClose={() => {
              setIsDetailModalOpen(false);
              setSelectedReservation(null);
            }}
            onUpdateReservation={async (updated) => {
              if (!userCanEditReservations(currentUser)) {
                triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas (gestión controlada por Cristian Shute).', 'error');
                return;
              }
              try {
                const result = await saveReservation(updated);
                const confirmed = result.reservations[0];
                setReservations((prev) => prev.map((r) => (r.id === confirmed.id ? confirmed : r)));
                setSelectedReservation(confirmed);
              } catch (error: any) {
                triggerSyncToast(error.message || 'No se pudo actualizar la reserva.', 'error');
              }
            }}
            onEdit={(r) => { requireAuth(() => void prepareReservationEditor(r), 'editar esta reserva'); }}
            onDuplicate={(r) => {
              handleDuplicateReservation(r);
            }}
            onDelete={(id, isSeries, seriesId) => {
              if (!userCanDeleteReservations(currentUser)) {
                const target = reservations.find((r) => r.id === id);
                if (target) handleRequestDelete(target);
                return;
              }
              return requireAuth(() => handleDelete(id, isSeries, seriesId), 'eliminar esta reserva');
            }}
            onRequestDelete={(r) => {
              handleRequestDelete(r);
            }}
            onAuthorizeDelete={handleAuthorizeDelete}
            onRejectDeleteRequest={handleRejectDeleteRequest}
            onToggleRealizada={(reserva) => {
              if (!userCanEditReservations(currentUser)) {
                triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas (gestión controlada por Cristian Shute).', 'error');
                return;
              }
              requireAuth(() => {
                handleQuickToggleRealizada(reserva);
                if (selectedReservation && selectedReservation.id === reserva.id) {
                  setSelectedReservation({
                    ...selectedReservation,
                    realizada: selectedReservation.realizada === 'Sí' ? 'No' : 'Sí'
                  });
                }
              }, 'actualizar asistencia de reserva');
            }}
          />
        </Suspense>
      )}

      {/* Modal de Registro Rápido de Asistencia / Check-in */}
      {isCheckInModalOpen && (
        <Suspense fallback={null}>
          <QuickCheckInModal
            isOpen={isCheckInModalOpen}
            onClose={() => {
              setIsCheckInModalOpen(false);
              setCheckInReservation(null);
            }}
            reservation={checkInReservation}
            currentUser={currentUser}
            onSaveCheckIn={handleSaveCheckIn}
          />
        </Suspense>
      )}

      {/* Container modularizado para todos los modales auxiliares de la aplicación */}
      <AppModalsContainer
        currentUser={currentUser}
        equipment={equipment}
        spaceBlocks={spaceBlocks}
        reservations={reservations}
        spaces={spaces}
        activityTypes={activityTypes}
        loanTypes={loanTypes}
        isRatingModalOpen={isRatingModalOpen}
        ratingTargetReservation={ratingTargetReservation}
        editingRating={editingRating}
        onCloseRatingModal={() => {
          setIsRatingModalOpen(false);
          setRatingTargetReservation(null);
          setEditingRating(null);
        }}
        onSaveRating={handleSaveRating}
        isDeleteModalOpen={isDeleteModalOpen}
        deleteTargetReservation={deleteTargetReservation}
        onCloseDeleteModal={() => {
          setIsDeleteModalOpen(false);
          setDeleteTargetReservation(null);
        }}
        onConfirmDeleteSingle={handleConfirmDeleteSingle}
        onConfirmDeleteSeries={handleConfirmDeleteSeries}
        onClearParticipants={handleClearParticipants}
        onSubmitDeleteRequest={handleSubmitDeleteRequest}
        onAuthorizeDelete={handleAuthorizeDelete}
        onRejectDeleteRequest={handleRejectDeleteRequest}
        isPendingDeletionsModalOpen={isPendingDeletionsModalOpen}
        pendingReservations={pendingReservations}
        onClosePendingDeletionsModal={() => setIsPendingDeletionsModalOpen(false)}
        onSelectPendingReservation={(res) => {
          setSelectedReservation(res);
          setIsDetailModalOpen(true);
        }}
        isImportExportModalOpen={isImportExportModalOpen && !generalDataPending}
        onCloseImportExportModal={() => setIsImportExportModalOpen(false)}
        onImportReservations={handleImportReservations}
        onSyncAllToFirebase={canWrite ? handleSyncAllToFirebase : async () => {
          retryRead();
          return { count: 0, skipped: true };
        }}
        onRestoreFromBackup={(restored) => {
          setReservations(restored);
        }}
        isAuditLogOpen={isAuditLogOpen}
        auditLogs={auditLogs}
        onCloseAuditLog={() => setIsAuditLogOpen(false)}
        onReservationsChanged={async () => {
          const fresh = getLocalCache();
          setReservations(fresh);
        }}
        conflictReportData={conflictReportData}
        onCloseConflictReport={() => setConflictReportData((prev) => ({ ...prev, isOpen: false }))}
        isGlobalPrintModalOpen={isGlobalPrintModalOpen && !generalDataPending}
        globalPrintInitialDate={globalPrintInitialDate}
        onClosePrintModal={() => {
          setIsGlobalPrintModalOpen(false);
          setGlobalPrintInitialDate(undefined);
        }}
        isNotificationCenterOpen={isNotificationCenterOpen}
        onCloseNotificationCenter={() => setIsNotificationCenterOpen(false)}
        onNavigateToView={(view) => setCurrentView(view)}
        onSelectReservationFromNotification={(resId) => {
          const found = reservations.find((r) => r.id === resId);
          if (found) {
            setSelectedReservation(found);
            setIsDetailModalOpen(true);
          }
        }}
        isPasswordPromptOpen={isPasswordPromptOpen}
        authActionDescription={authActionDescription}
        onClosePasswordPrompt={() => {
          setIsPasswordPromptOpen(false);
          setPendingAuthAction(null);
        }}
        onAuthSuccess={handleAuthSuccess}
        isChangePasswordOpen={isChangePasswordOpen}
        passwordTargetUser={passwordTargetUser}
        onCloseChangePassword={() => {
          setIsChangePasswordOpen(false);
          setPasswordTargetUser(null);
        }}
        onPasswordChanged={(updatedUser) => {
          const freshUsers = getAllAuthorizedUsers();
          setUserAccounts(freshUsers);
          if (
            updatedUser &&
            currentUser &&
            updatedUser.username.toLowerCase() === currentUser.username.toLowerCase()
          ) {
            setCurrentUser(updatedUser);
            updateStoredAuthUser(updatedUser);
          }
        }}
        isGmailDispatchModalOpen={isGmailDispatchModalOpen && !generalDataPending}
        gmailDispatchInitialDate={gmailDispatchInitialDate}
        gmailDispatchFilterMode={gmailDispatchFilterMode}
        gmailDispatchReservationId={gmailDispatchReservationId}
        onCloseGmailDispatch={() => {
          setIsGmailDispatchModalOpen(false);
          setGmailDispatchInitialDate(undefined);
          setGmailDispatchFilterMode(undefined);
          setGmailDispatchReservationId(undefined);
        }}
      />

      {/* Global Quick Search & Command Palette (Ctrl+K / Cmd+K / /) */}
      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <GlobalCommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            reservations={reservations}
            spaces={spaces}
            onSelectReservation={(r) => {
              setSelectedReservation(r);
              setIsDetailModalOpen(true);
            }}
            onNavigateToView={(view) => setCurrentView(view)}
            onNewReservation={() => openCreateModal({ date: format(selectedDailyDate || new Date(), 'yyyy-MM-dd') })}
            onOpenPrintModal={() => setIsGlobalPrintModalOpen(true)}
            onOpenGmailDispatch={() => openGmailDispatchModal()}
            onOpenAuditLog={() => {
              if (!isCoordinatorOrAdmin(currentUser)) {
                triggerSyncToast('El sistema de restauración de cambios está disponible únicamente para Administradores y Coordinadores.', 'warning');
                return;
              }
              setIsAuditLogOpen(true);
            }}
            onOpenImportExport={() => {
              requireAuth(() => setIsImportExportModalOpen(true), 'gestionar copias de seguridad');
            }}
            onNavigateToDate={(date) => {
              setSelectedDailyDate(date);
              setCurrentView('daily');
            }}
            onFilterBySpace={(spaceName) => {
              setFilters((prev) => ({ ...prev, espacio: spaceName }));
              if (!isFilterBarOpen) setIsFilterBarOpen(true);
            }}
            onFilterByApplicant={(nameOrRut) => {
              setFilters((prev) => ({ ...prev, search: nameOrRut }));
              if (!isFilterBarOpen) setIsFilterBarOpen(true);
            }}
            onClearFilters={() => {
              setFilters({
                search: '',
                espacio: '',
                tipoActividad: '',
                fechaDesde: '',
                fechaHasta: '',
                soloRecurrentes: false,
                soloImportantes: false,
                soloConTopamiento: false
              });
              triggerSyncToast('Filtros restablecidos', 'info');
            }}
            conflictsCount={conflictsCount}
            hasActiveFilters={hasActiveFilters}
          />
        </Suspense>
      )}

      {/* Instant Sync Status Toast */}
      {syncStatusToast && (
        <NotificationPortal><div
          id="sync-status-toast"
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 left-5 z-[70] max-w-md px-4 py-3 rounded-xl shadow-2xl border flex items-start space-x-3 text-xs sm:text-sm font-semibold backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-4 pointer-events-auto ${
            syncStatusToast.type === 'success'
              ? 'bg-slate-900/95 text-emerald-300 border-emerald-500/50 shadow-emerald-950/20'
              : syncStatusToast.type === 'error'
              ? 'bg-rose-950/95 text-rose-100 border-rose-600/50 shadow-rose-950/30'
              : syncStatusToast.type === 'warning'
              ? 'bg-slate-900/95 text-amber-200 border-amber-500/50 shadow-amber-950/30'
              : 'bg-slate-900/95 text-sky-200 border-sky-500/50 shadow-slate-950/20'
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
              syncStatusToast.type === 'success'
                ? 'bg-emerald-400 animate-pulse'
                : syncStatusToast.type === 'error'
                ? 'bg-rose-400 animate-ping'
                : syncStatusToast.type === 'warning'
                ? 'bg-amber-400'
                : 'bg-sky-400'
            }`}
          />
          <span className="flex-1 whitespace-pre-line leading-relaxed">{syncStatusToast.message}</span>
          <button
            type="button"
            onClick={() => setSyncStatusToast(null)}
            className="text-slate-400 hover:text-white p-1 ml-1 cursor-pointer"
            aria-label="Cerrar notificación"
          >
            ×
          </button>
        </div></NotificationPortal>
      )}

      {/* Floating Notification Toast for Automated 15-day Backups */}
      {backupToast && backupToast.show && (
        <NotificationPortal><div
          id="auto-backup-toast"
          className="fixed bottom-5 right-5 z-50 max-w-md bg-slate-900 text-white rounded-2xl p-4 shadow-2xl border border-emerald-500/40 flex items-start space-x-3 animate-in fade-in slide-in-from-bottom-5"
        >
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold text-emerald-300 flex items-center space-x-1.5">
              <span>{backupToast.title}</span>
            </h4>
            <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
              {backupToast.message}
            </p>
            {backupToast.backupId && (
              <div className="text-[10px] font-mono text-emerald-400/80 mt-1">
                ID Respaldo: {backupToast.backupId}
              </div>
            )}
          </div>
          <button
            onClick={() => setBackupToast(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
          >
            &times;
          </button>
        </div></NotificationPortal>
      )}
    </div>
    </ReservationVisualsProvider>
  );
}

