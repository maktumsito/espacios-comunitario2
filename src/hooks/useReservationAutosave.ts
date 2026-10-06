import { useState, useEffect, useRef, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Reservation, CustomScheduleSlot } from '../types';

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
  descargarCartaAlCrear?: boolean;
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
  descargarCartaAlCrear,
  onRestore
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
    descargarCartaAlCrear,
    storageKey,
    isEditing,
    isDuplicating,
    targetId: editingReservation?.id
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
      descargarCartaAlCrear,
      storageKey,
      isEditing,
      isDuplicating,
      targetId: editingReservation?.id
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
    descargarCartaAlCrear,
    storageKey,
    isEditing,
    isDuplicating,
    editingReservation
  ]);

  // Track initial snapshot when modal opens to detect if user has modified anything
  const initialSnapshotRef = useRef<string | null>(null);
  const isInitialMountForModalRef = useRef<boolean>(true);

  // When modal opens, inspect if there is an existing draft to restore
  useEffect(() => {
    if (!isOpen) {
      setHasDraft(false);
      setDraftData(null);
      initialSnapshotRef.current = null;
      isInitialMountForModalRef.current = true;
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

    // Capture initial state as baseline after short delay so prefill values settle
    const timer = setTimeout(() => {
      initialSnapshotRef.current = JSON.stringify({
        resp: formData.responsable || '',
        desc: formData.descripcion || '',
        rut: formData.rut || '',
        tel: formData.telefonoContacto || '',
        email: formData.emailContacto || '',
        act: formData.tipoActividad || '',
        prest: formData.tipoPrestamo || '',
        esp: formData.espacio || '',
        fec: formData.fecha || '',
        hi: formData.horaInicio || '',
        hf: formData.horaFin || '',
        equip: formData.equipamientoSolicitado || []
      });
      isInitialMountForModalRef.current = false;
    }, 400);

    return () => clearTimeout(timer);
  }, [isOpen, storageKey]);

  // Method to save state immediately
  const persistDraftImmediately = useCallback(() => {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const current = latestStateRef.current;
    if (!current) return;

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
      descargarCartaAlCrear: current.descargarCartaAlCrear
    };

    try {
      localStorage.setItem(current.storageKey, JSON.stringify(draft));
      localStorage.setItem(ACTIVE_CONTEXT_KEY, current.storageKey);
      setLastSavedAt(draft.savedAt);
    } catch (err) {
      console.warn('Error al guardar borrador en localStorage:', err);
    }
  }, []);

  // Debounced autosave effect while user is typing or changing fields
  useEffect(() => {
    if (!isOpen || isInitialMountForModalRef.current) return;

    // Don't autosave if state matches the initial snapshot exactly
    if (initialSnapshotRef.current) {
      const currentSnapshot = JSON.stringify({
        resp: formData.responsable || '',
        desc: formData.descripcion || '',
        rut: formData.rut || '',
        tel: formData.telefonoContacto || '',
        email: formData.emailContacto || '',
        act: formData.tipoActividad || '',
        prest: formData.tipoPrestamo || '',
        esp: formData.espacio || '',
        fec: formData.fecha || '',
        hi: formData.horaInicio || '',
        hf: formData.horaFin || '',
        equip: formData.equipamientoSolicitado || []
      });
      if (currentSnapshot === initialSnapshotRef.current) {
        return;
      }
    }

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
    descargarCartaAlCrear,
    persistDraftImmediately
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
