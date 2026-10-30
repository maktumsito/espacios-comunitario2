import type { AdditionalSpaceSlot } from '../types';
import { useState, useEffect, useRef, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Reservation, CustomScheduleSlot, UpdateScope } from '../types';

export interface DraftEditScope {
  updateScope: UpdateScope;
  rangeStartDate: string;
  rangeEndDate: string;
  selectedOccurrenceIds: string[];
}

export interface DraftFormSettings {
  holidayOverrideKey: string;
  extendedAuthKey: string;
  includeHolidaysInSeries: boolean;
  generateFullSeries: boolean;
}

export interface AutosavedReservationDraft {
  version: number;
  savedAt: number;
  contextKey: string;
  isEditing: boolean;
  isDuplicating: boolean;
  targetId?: string;
  summaryLabel: string;

  formData: Partial<Reservation>;
  bookingMode: 'single' | 'specific' | 'pattern';
  specificDates: string[];
  selectedDays: number[];
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  useCustomSchedulesPerDate: boolean;
  dateSchedules: Record<string, CustomScheduleSlot>;
  useCustomSchedulesPerDay: boolean;
  daySchedules: Record<number, CustomScheduleSlot>;
  enableSingleSecondSpace: boolean;
  singleSecondSpace: string;
  singleSecondStartTime: string;
  singleSecondEndTime: string;
  additionalSpaces?: AdditionalSpaceSlot[];
  descargarCartaAlCrear?: boolean;
  editScope?: DraftEditScope;
  settings?: DraftFormSettings;
}

export interface ActiveDraftSummary {
  key: string;
  savedAt: number;
  timeAgo: string;
  summaryLabel: string;
  isEditing: boolean;
  targetId?: string;
  draft: AutosavedReservationDraft;
}

export const STORAGE_PREFIX = 'ccd_reservation_draft_';
export const ACTIVE_CONTEXT_KEY = 'ccd_reservation_draft_active_context';
const MAX_DRAFT_AGE_MS = 48 * 60 * 60 * 1000; // 48 horas

export function getDraftStorageKey(editingReservation?: Reservation | null, isDuplicating?: boolean): string {
  if (editingReservation?.id && isDuplicating) return `${STORAGE_PREFIX}duplicate_${editingReservation.id}`;
  if (editingReservation && !isDuplicating && editingReservation.id) {
    return `${STORAGE_PREFIX}edit_${editingReservation.id}`;
  }
  return `${STORAGE_PREFIX}create`;
}

/**
 * Checks if a stored draft exists for the given context and is not expired.
 */
export function getStoredDraft(storageKey: string): AutosavedReservationDraft | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed: AutosavedReservationDraft = JSON.parse(raw);
    if (!parsed || !parsed.savedAt) return null;

    // Discard drafts older than 48 hours
    if (Date.now() - parsed.savedAt > MAX_DRAFT_AGE_MS) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch (err) {
    console.warn('Error al leer borrador de localStorage:', err);
    return null;
  }
}

/**
 * Safely removes a stored draft.
 */
export function removeStoredDraft(storageKey: string): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(storageKey);
    const activeContext = localStorage.getItem(ACTIVE_CONTEXT_KEY);
    if (activeContext === storageKey) {
      localStorage.removeItem(ACTIVE_CONTEXT_KEY);
    }
  } catch (err) {
    console.warn('Error al remover borrador de localStorage:', err);
  }
}

/**
 * Inspects localStorage to find any active or recent draft from the user's session.
 */
export function getActiveDraftSummary(): ActiveDraftSummary | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return null;
  try {
    const activeKey = localStorage.getItem(ACTIVE_CONTEXT_KEY);
    const targetKey = activeKey || `${STORAGE_PREFIX}create`;

    let draft = getStoredDraft(targetKey);

    // If activeKey didn't yield a draft, look for any draft starting with STORAGE_PREFIX
    if (!draft) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX) && key !== ACTIVE_CONTEXT_KEY) {
          const found = getStoredDraft(key);
          if (found) {
            draft = found;
            break;
          }
        }
      }
    }

    if (!draft) return null;

    // Only suggest drafts saved in the last 24 hours
    if (Date.now() - draft.savedAt > 24 * 60 * 60 * 1000) {
      return null;
    }

    const timeAgo = formatDistanceToNow(draft.savedAt, { addSuffix: true, locale: es });
    return {
      key: draft.contextKey,
      savedAt: draft.savedAt,
      timeAgo,
      summaryLabel: draft.summaryLabel || 'Reserva en progreso',
      isEditing: draft.isEditing,
      targetId: draft.targetId,
      draft
    };
  } catch (err) {
    console.warn('Error al verificar borradores activos:', err);
    return null;
  }
}

/**
 * Clears all reservation drafts from localStorage.
 */
export function clearAllReservationDrafts(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(STORAGE_PREFIX) || key === ACTIVE_CONTEXT_KEY)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (err) {
    console.warn('Error al limpiar borradores:', err);
  }
}

interface UseReservationAutosaveOptions {
  editScope?: DraftEditScope;
  settings?: DraftFormSettings;
  isOpen: boolean;
  editingReservation?: Reservation | null;
  isDuplicating?: boolean;
  formData: Partial<Reservation>;
  bookingMode: 'single' | 'specific' | 'pattern';
  specificDates: string[];
  selectedDays: number[];
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  useCustomSchedulesPerDate: boolean;
  dateSchedules: Record<string, CustomScheduleSlot>;
  useCustomSchedulesPerDay: boolean;
  daySchedules: Record<number, CustomScheduleSlot>;
  enableSingleSecondSpace: boolean;
  singleSecondSpace: string;
  singleSecondStartTime: string;
  singleSecondEndTime: string;
  additionalSpaces?: AdditionalSpaceSlot[];
  descargarCartaAlCrear?: boolean;
  onRestore: (draft: AutosavedReservationDraft) => void;
}

export interface UseReservationAutosaveReturn {
  hasDraft: boolean;
  draftData: AutosavedReservationDraft | null;
  draftTimeAgo: string;
  isSaving: boolean;
  lastSavedAt: number | null;
  restoreDraft: () => void;
  discardDraft: () => void;
  clearDraft: () => void;
  saveNow: () => void;
}

export function useReservationAutosave({
  isOpen,
  editingReservation,
  isDuplicating = false,
  formData,
  bookingMode,
  specificDates,
  selectedDays,
  recurrenceStartDate,
  recurrenceEndDate,
  useCustomSchedulesPerDate,
  dateSchedules,
  useCustomSchedulesPerDay,
  daySchedules,
  enableSingleSecondSpace,
  singleSecondSpace,
  singleSecondStartTime,
  singleSecondEndTime,
  additionalSpaces,
  descargarCartaAlCrear,
  onRestore,
  editScope,
  settings
}: UseReservationAutosaveOptions): UseReservationAutosaveReturn {
  const storageKey = getDraftStorageKey(editingReservation, isDuplicating);
  const isEditing = Boolean(editingReservation && !isDuplicating);

  const [hasDraft, setHasDraft] = useState<boolean>(false);
  const [draftData, setDraftData] = useState<AutosavedReservationDraft | null>(null);
  const [draftTimeAgo, setDraftTimeAgo] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Ref to hold the latest state so beforeunload and debounce can access current data without stale closure
  const latestStateRef = useRef({
    formData,
    bookingMode,
    specificDates,
    selectedDays,
    recurrenceStartDate,
    recurrenceEndDate,
    useCustomSchedulesPerDate,
    dateSchedules,
    useCustomSchedulesPerDay,
    daySchedules,
    enableSingleSecondSpace,
    singleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    additionalSpaces,
    descargarCartaAlCrear,
    storageKey,
    isEditing,
    isDuplicating,
    targetId: editingReservation?.id,
    editScope,
    settings
  });

  useEffect(() => {
    latestStateRef.current = {
      formData,
      bookingMode,
      specificDates,
      selectedDays,
      recurrenceStartDate,
      recurrenceEndDate,
      useCustomSchedulesPerDate,
      dateSchedules,
      useCustomSchedulesPerDay,
      daySchedules,
      enableSingleSecondSpace,
      singleSecondSpace,
      singleSecondStartTime,
      singleSecondEndTime,
      additionalSpaces,
      descargarCartaAlCrear,
      storageKey,
      isEditing,
      isDuplicating,
      targetId: editingReservation?.id,
      editScope,
      settings
    };
  }, [
    formData,
    bookingMode,
    specificDates,
    selectedDays,
    recurrenceStartDate,
    recurrenceEndDate,
    useCustomSchedulesPerDate,
    dateSchedules,
    useCustomSchedulesPerDay,
    daySchedules,
    enableSingleSecondSpace,
    singleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    additionalSpaces,
    descargarCartaAlCrear,
    storageKey,
    isEditing,
    isDuplicating,
    editingReservation,
    editScope,
    settings
  ]);

  // Track initial snapshot when modal opens to detect if user has modified anything
  const initialSnapshotRef = useRef<string | null>(null);
  const clearedRef = useRef(false);
  const lastPersistedSnapshotRef = useRef<string | null>(null);

  // When modal opens, inspect if there is an existing draft to restore
  useEffect(() => {
    if (!isOpen) {
      setHasDraft(false);
      setDraftData(null);
      initialSnapshotRef.current = null;
      clearedRef.current = false;
      lastPersistedSnapshotRef.current = null;
      return;
    }

    // Modal just opened: check if a draft exists for this specific key
    const existingDraft = getStoredDraft(storageKey);
    if (existingDraft && existingDraft.formData) {
      // Check if draft has content worth restoring
      const hasContent = Boolean(
        existingDraft.formData.responsable?.trim() ||
        existingDraft.formData.descripcion?.trim() ||
        existingDraft.formData.rut?.trim() ||
        existingDraft.formData.telefonoContacto?.trim() ||
        existingDraft.formData.emailContacto?.trim() ||
        existingDraft.formData.comentarios?.trim() ||
        (existingDraft.formData.equipamientoSolicitado && existingDraft.formData.equipamientoSolicitado.length > 0)
      );

      if (hasContent) {
        setDraftData(existingDraft);
        setHasDraft(true);
        setDraftTimeAgo(formatDistanceToNow(existingDraft.savedAt, { addSuffix: true, locale: es }));
        setLastSavedAt(existingDraft.savedAt);
      }
    }

    clearedRef.current = false;
    lastPersistedSnapshotRef.current = null;
    // The next task runs after the parent's prefill effects have settled.
    const timer = setTimeout(() => {
      initialSnapshotRef.current = JSON.stringify(latestStateRef.current);
    }, 0);
    return () => clearTimeout(timer);

  }, [isOpen, storageKey]);

  // Method to save state immediately
  const persistDraftImmediately = useCallback(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const current = latestStateRef.current;
    if (!current || clearedRef.current) return;
    const snapshot = JSON.stringify(current);
    if (snapshot === initialSnapshotRef.current || snapshot === lastPersistedSnapshotRef.current) return;

    // Check if there is meaningful data to save
    const f = current.formData;
    const hasMeaningfulData = Boolean(
      f.responsable?.trim() ||
      f.descripcion?.trim() ||
      f.rut?.trim() ||
      f.telefonoContacto?.trim() ||
      f.emailContacto?.trim() ||
      f.comentarios?.trim() ||
      (f.equipamientoSolicitado && f.equipamientoSolicitado.length > 0) ||
      (current.bookingMode === 'specific' && current.specificDates.length > 1) ||
      (current.bookingMode === 'pattern' && current.selectedDays.length > 0) ||
      current.enableSingleSecondSpace
    );

    if (!hasMeaningfulData && !current.isEditing) {
      return;
    }

    const summaryLabel = (f.tipoActividad ? `${f.tipoActividad}: ` : '') + (f.responsable?.trim() || f.descripcion?.trim() || 'Reserva sin título');

    const draft: AutosavedReservationDraft = {
      version: 1,
      savedAt: Date.now(),
      contextKey: current.storageKey,
      isEditing: current.isEditing,
      isDuplicating: current.isDuplicating,
      targetId: current.targetId,
      summaryLabel,
      formData: current.formData,
      bookingMode: current.bookingMode,
      specificDates: current.specificDates,
      selectedDays: current.selectedDays,
      recurrenceStartDate: current.recurrenceStartDate,
      recurrenceEndDate: current.recurrenceEndDate,
      useCustomSchedulesPerDate: current.useCustomSchedulesPerDate,
      dateSchedules: current.dateSchedules,
      useCustomSchedulesPerDay: current.useCustomSchedulesPerDay,
      daySchedules: current.daySchedules,
      enableSingleSecondSpace: current.enableSingleSecondSpace,
      singleSecondSpace: current.singleSecondSpace,
      singleSecondStartTime: current.singleSecondStartTime,
      singleSecondEndTime: current.singleSecondEndTime,
      additionalSpaces: current.additionalSpaces,
      descargarCartaAlCrear: current.descargarCartaAlCrear,
      editScope: current.editScope,
      settings: current.settings
    };

    try {
      localStorage.setItem(current.storageKey, JSON.stringify(draft));
      localStorage.setItem(ACTIVE_CONTEXT_KEY, current.storageKey);
      lastPersistedSnapshotRef.current = snapshot;
      setLastSavedAt(draft.savedAt);
    } catch (err) {
      console.warn('Error al guardar borrador en localStorage:', err);
    }
  }, []);

  // Debounced autosave effect while user is typing or changing fields
  useEffect(() => {
    if (!isOpen || clearedRef.current) return;
    // Compare the whole state at persistence time, after debounce, not on every keystroke.
    setIsSaving(true);
    const handler = setTimeout(() => {
      persistDraftImmediately();
      setIsSaving(false);
    }, 800);

    return () => clearTimeout(handler);
  }, [
    isOpen,
    formData,
    bookingMode,
    specificDates,
    selectedDays,
    recurrenceStartDate,
    recurrenceEndDate,
    useCustomSchedulesPerDate,
    dateSchedules,
    useCustomSchedulesPerDay,
    daySchedules,
    enableSingleSecondSpace,
    singleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    additionalSpaces,
    descargarCartaAlCrear,
    persistDraftImmediately,
    editScope,
    settings
  ]);

  // Window beforeunload listener to flush state to localStorage immediately upon accidental reload/navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleBeforeUnload = () => {
      persistDraftImmediately();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isOpen, persistDraftImmediately]);

  // User action: restore draft into modal form
  const restoreDraft = useCallback(() => {
    if (!draftData) return;
    onRestore(draftData);
    setHasDraft(false);
  }, [draftData, onRestore]);

  // User action: discard draft
  const discardDraft = useCallback(() => {
    removeStoredDraft(storageKey);
    setHasDraft(false);
    setDraftData(null);
  }, [storageKey]);

  // Action on successful submission: clear draft and active context
  const clearDraft = useCallback(() => {
    clearedRef.current = true;
    setIsSaving(false);
    removeStoredDraft(storageKey);
    setHasDraft(false);
    setDraftData(null);
  }, [storageKey]);

  return {
    hasDraft,
    draftData,
    draftTimeAgo,
    isSaving,
    lastSavedAt,
    restoreDraft,
    discardDraft,
    clearDraft,
    saveNow: persistDraftImmediately
  };
}
