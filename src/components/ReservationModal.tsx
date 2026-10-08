import { ModalOverlay } from './common/ModalOverlay';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Reservation, SpaceInfo, LoanType, ActivityTypeItem, SpaceRating, EquipmentItem, isSingleDayMultiSpaceReservation, SpaceBlock } from '../types';
import { SPACES_LIST, ACTIVITY_TYPES } from '../data/spacesData';
import { DEFAULT_LOAN_TYPES } from '../services/adminConfigService';
import { getStoredEquipment } from '../services/equipmentService';
import { checkSingleConflict, timeToMinutes, formatMinutesToTime, findMaintenanceBlockConflicts, formatBlockConflictMessage } from '../utils/conflictDetector';
import { AuthUser, isCoordinatorOrAdmin } from '../services/authService';
import { verifyHolidayOverrideKey } from '../utils/holidayUtils';
import { AlertTriangle } from 'lucide-react';
import { useReservationAutosave, AutosavedReservationDraft } from '../hooks/useReservationAutosave';
import { WEEKDAYS, type CustomScheduleSlot } from './RecurrenceScheduleSection';
export type { CustomScheduleSlot };
import { isCommitmentLetterEligible, CommitmentScheduleSlot } from '../utils/commitmentLetterPdf';
import { UpdateScope, BatchUpdateInfo } from '../types';
import { type ConflictSavePayload } from './ConflictResolutionModal';
import { WizardStepsBar } from './WizardStepsBar';
import { ReservationStep1Activity } from './ReservationStep1Activity';
import { ReservationStep2DateTime } from './ReservationStep2DateTime';
import { ReservationStep3Applicant } from './ReservationStep3Applicant';
import { ReservationStep4ResourcesDocs } from './ReservationStep4ResourcesDocs';
import { ReservationStep5Review } from './ReservationStep5Review';
import { RecurringSeriesScopeSelector } from './RecurringSeriesScopeSelector';
import { ReservationModalFooter } from './ReservationModalFooter';
import { ReservationModalHeader } from './ReservationModalHeader';
import { ReservationModalAlerts } from './ReservationModalAlerts';
import { ReservationModalDialogs } from './ReservationModalDialogs';
import { useReservationCustomSchedules } from '../hooks/useReservationCustomSchedules';
import { useReservationSeriesState } from '../hooks/useReservationSeriesState';
import { useReservationConflictResolution } from '../hooks/useReservationConflictResolution';
import { useReservationModalValidation } from '../hooks/useReservationModalValidation';
import { useReservationSaveHandler } from '../hooks/useReservationSaveHandler';
import {
  addDays,
  addMonths,
  startOfMonth,
  format,
  parseISO
} from 'date-fns';
import { formatDateDDMMYYYY, getDayOfWeekFromDateString } from '../utils/dateUtils';
import { buildReplacementBatch } from '../utils/reservationReplacement';
import { getSeriesEditStartDate, isRecurringSeriesReservation } from '../utils/recurringEdits';
import { getChileLocalDateString } from '../utils/dateUtils';
import { belongsToSeries, isDateInSeriesScope, schedulesFromReservations } from '../utils/recurringSchedule';

interface SeriesItemSlot {
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  espacio?: string;
}

interface ReservationModalProps {
  replacementSource?: Reservation | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    reserva: Reservation,
    generateSeries?: boolean,
    seriesDates?: (string | SeriesItemSlot)[],
    updateWholeSeries?: boolean,
    batchUpdateInfo?: BatchUpdateInfo,
    allowConflictOverride?: boolean
  ) => void | boolean | Promise<void | boolean>;
  onDelete?: (id: string, isSeries?: boolean, seriesId?: string) => void | Promise<void>;
  onRequestDelete?: (reserva: Reservation) => void;
  editingReservation?: Reservation | null;
  isDuplicating?: boolean;
  onDuplicateReservation?: (reserva: Reservation) => void;
  allReservations: Reservation[];
  availableSpaces?: SpaceInfo[];
  availableLoanTypes?: LoanType[];
  availableActivityTypes?: ActivityTypeItem[];
  availableEquipment?: EquipmentItem[];
  ratings?: SpaceRating[];
  spaceBlocks?: readonly SpaceBlock[];
  initialDate?: string;
  initialSpace?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialResponsable?: string;
  initialRut?: string;
  initialPhone?: string;
  initialEmail?: string;
  currentUser?: AuthUser | null;
}

export const ReservationModal: React.FC<ReservationModalProps> = ({
  replacementSource,
  isOpen,
  onClose,
  onSave,
  onDelete,
  onRequestDelete,
  editingReservation: suppliedEditingReservation,
  isDuplicating = false,
  onDuplicateReservation,
  allReservations,
  availableSpaces = SPACES_LIST,
  availableLoanTypes = DEFAULT_LOAN_TYPES,
  availableActivityTypes,
  availableEquipment,
  ratings = [],
  spaceBlocks = [],
  initialDate,
  initialSpace,
  initialStartTime,
  initialEndTime,
  initialResponsable,
  initialRut,
  initialPhone,
  initialEmail,
  currentUser
}) => {
  const [reloadedReservation,setReloadedReservation]=useState<Reservation|null>(null);
  const editingReservation = reloadedReservation && reloadedReservation.id===suppliedEditingReservation?.id &&
    (reloadedReservation.version||0)>=(suppliedEditingReservation.version||0) ? reloadedReservation : suppliedEditingReservation;
  const replacementId = useRef(`RSV_${crypto.randomUUID()}`);
  const effectiveEquipment = useMemo(() => {
    return availableEquipment && availableEquipment.length > 0 ? availableEquipment : getStoredEquipment();
  }, [availableEquipment]);

  const effectiveActivityNames = availableActivityTypes
    ? availableActivityTypes.map(a => a.name)
    : ACTIVITY_TYPES;

  const defaultActName = effectiveActivityNames[0] || 'TALLER CCD';
  const defaultLoanName = availableLoanTypes[0]?.name || 'TALLER FORMATIVO CCD';

  // Helper to ensure early morning reservations default to 08:30 unless manually entered
  const getSafeEarlyStartTime = (time?: string): string => {
    if (!time) return '08:30';
    if (time < '08:30') return '08:30';
    return time;
  };

  const getSafeEarlyEndTime = (start?: string, end?: string): string => {
    if (!start || start < '08:30') {
      if (!end || end <= '08:30' || end === '09:00') return '09:30';
      return end;
    }
    return end || '09:30';
  };

  const [formData, setFormData] = useState<Partial<Reservation>>({
    fecha: initialDate || format(new Date(), 'yyyy-MM-dd'),
    horaInicio: replacementSource?.horaInicio || getSafeEarlyStartTime(initialStartTime),
    horaFin: replacementSource?.horaFin || getSafeEarlyEndTime(initialStartTime, initialEndTime),
    terminaDiaSiguiente: Boolean(replacementSource?.terminaDiaSiguiente),
    espacio: initialSpace || (availableSpaces[0]?.name || 'TATAMI'),
    responsable: initialResponsable || '',
    telefonoContacto: initialPhone || '',
    emailContacto: initialEmail || '',
    tipoActividad: defaultActName,
    tipoPrestamo: defaultLoanName,
    descripcion: '',
    actividadRecurrente: 'No',
    diasSemana: 'lunes,miercoles',
    fechaInicioRecurrencia: initialDate || format(new Date(), 'yyyy-MM-dd'),
    fechaFinRecurrencia: format(addMonths(new Date(), 3), 'yyyy-MM-dd'),
    cantidadParticipantes: 15,
    realizada: 'No',
    importante: 'No',
    comentarios: '',
    rut: initialRut || '',
    domicilio: '',
    requiereCartaCompromiso: isCommitmentLetterEligible(defaultActName, defaultLoanName),
    equipamientoSolicitado: []
  });

  // Booking mode: 'single' (una fecha), 'specific' (fechas específicas elegidas a gusto), 'pattern' (serie semanal por días)
  const [bookingMode, setBookingMode] = useState<'single' | 'specific' | 'pattern'>('single');
  const [selectedSpecificDates, setSpecificDates] = useState<string[]>([
    initialDate || format(new Date(), 'yyyy-MM-dd')
  ]);
  const [dateInputToAdd, setDateInputToAdd] = useState<string>('');
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(
    startOfMonth(new Date())
  );

  const [allowConflictOverride, setAllowConflictOverride] = useState(false);
  const [showInlineSuggestions, setShowInlineSuggestions] = useState(false);
  const [generateFullSeries, setGenerateFullSeries] = useState(true);

  // Existing individual bookings have no "create all sessions" checkbox.
  // Switching their booking mode must enable the series preview/save label.
  useEffect(() => {
    if (editingReservation && !isDuplicating && editingReservation.actividadRecurrente !== 'Sí' &&
      !editingReservation.serieRecurrente && !editingReservation.recurrenteId && bookingMode !== 'single') {
      setGenerateFullSeries(true);
    }
  }, [bookingMode, editingReservation, isDuplicating]);
  const [updateScope, setUpdateScope] = useState<UpdateScope>('single');
  const [rangeStartDate, setRangeStartDate] = useState<string>('');
  const [rangeEndDate, setRangeEndDate] = useState<string>('');
  const [selectedOccurrenceIds, setSelectedOccurrenceIds] = useState<Set<string>>(new Set());
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3]); // Lunes y Miércoles by default
  const [recurrenceStartDate, setRecurrenceStartDate] = useState(initialDate || format(new Date(), 'yyyy-MM-dd'));
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(format(addMonths(new Date(), 3), 'yyyy-MM-dd'));

  // Progressive Wizard UX State (5 steps)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const editToday = getChileLocalDateString();
  const specificDates = useMemo(() => {
    const seriesId = !isDuplicating && (editingReservation?.serieRecurrente || editingReservation?.recurrenteId);
    const exceptions = new Set(allReservations.filter(r => r.reemplazadaPorReservaId && seriesId &&
      (r.serieRecurrente || r.recurrenteId) === seriesId && !allReservations.some(other => other.fecha === r.fecha &&
        (other.serieRecurrente || other.recurrenteId) === seriesId && !other.reemplazadaPorReservaId && !['cancelada','eliminada','rechazada'].includes(other.estado || ''))).map(r => r.fecha));
    const cutoff = !isDuplicating && editingReservation && isRecurringSeriesReservation(editingReservation)
      ? getSeriesEditStartDate(updateScope, editingReservation.fecha, editToday) : '';
    const context = editingReservation ? {scope: updateScope, source: editingReservation, history: allReservations, today: editToday, rangeStartDate, rangeEndDate, selectedIds: selectedOccurrenceIds} : null;
    return [...new Set(selectedSpecificDates)].filter(date => !exceptions.has(date) && date >= cutoff &&
      (!context || isDuplicating || updateScope === 'single' || isDateInSeriesScope(date, context)));
  }, [selectedSpecificDates, allReservations, editingReservation, isDuplicating, updateScope, editToday, rangeStartDate, rangeEndDate, selectedOccurrenceIds]);
  const [isWizardMode, setIsWizardMode] = useState<boolean>(!editingReservation || isDuplicating);
  const [isEditingLoading, setIsEditingLoading] = useState<boolean>(false);
  const initializedFormKey = useRef<string | null>(null);
  const [initializationRevision, setInitializationRevision] = useState(0);
  const [initialFormBaseline, setInitialFormBaseline] = useState<{form: Partial<Reservation>; schedule: string; history: Reservation[]} | null>(null);


  // Sync wizard step on open
  useEffect(() => {
    if (isOpen) {
      setWizardStep(1);
      if (!editingReservation || isDuplicating) {
        setIsWizardMode(true);
      }
    }
  }, [isOpen, editingReservation, isDuplicating]);

  // Memoized directory of past responsables and contact details for instant auto-complete and auto-fill
  const knownResponsablesMap = useMemo(() => {
    const map = new Map<string, {
      responsable: string;
      rut?: string;
      telefonoContacto?: string;
      emailContacto?: string;
      domicilio?: string;
    }>();

    (allReservations || []).forEach((r) => {
      const name = (r.responsable || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          responsable: name,
          rut: r.rut,
          telefonoContacto: r.telefonoContacto,
          emailContacto: r.emailContacto,
          domicilio: r.domicilio
        });
      } else {
        if (!existing.rut && r.rut) existing.rut = r.rut;
        if (!existing.telefonoContacto && r.telefonoContacto) existing.telefonoContacto = r.telefonoContacto;
        if (!existing.emailContacto && r.emailContacto) existing.emailContacto = r.emailContacto;
        if (!existing.domicilio && r.domicilio) existing.domicilio = r.domicilio;
      }
    });

    return map;
  }, [allReservations]);

  const uniqueResponsablesList = useMemo(() => {
    return Array.from(knownResponsablesMap.values()).sort((a, b) => a.responsable.localeCompare(b.responsable));
  }, [knownResponsablesMap]);

  const [autoFilledContactNotice, setAutoFilledContactNotice] = useState<boolean>(false);

  const handleResponsableChange = (name: string) => {
    const key = name.trim().toLowerCase();
    const matched = knownResponsablesMap.get(key);

    if (matched && (!formData.telefonoContacto || !formData.rut || !formData.emailContacto)) {
      setFormData(prev => ({
        ...prev,
        responsable: name,
        rut: prev.rut || matched.rut || '',
        telefonoContacto: prev.telefonoContacto || matched.telefonoContacto || '',
        emailContacto: prev.emailContacto || matched.emailContacto || '',
        domicilio: prev.domicilio || matched.domicilio || ''
      }));
      setAutoFilledContactNotice(true);
      setTimeout(() => setAutoFilledContactNotice(false), 4500);
    } else {
      setFormData(prev => ({ ...prev, responsable: name }));
    }
  };

  // Conflict dialog and submission state
  const [showConflictDialog, setShowConflictDialog] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isOpen) {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Hallazgo 3: Concurrency detection & snapshot
  const [dismissedConcurrency, setDismissedConcurrency] = useState<boolean>(false);
  const initialEditingSnapshot = React.useRef<{ id: string; updatedAt?: string; version?: number } | null>(null);

  useEffect(() => {
    if (editingReservation) {
      initialEditingSnapshot.current = {
        id: editingReservation.id,
        updatedAt: editingReservation.updatedAt,
        version: editingReservation.version
      };
      setDismissedConcurrency(false);
    } else {
      initialEditingSnapshot.current = null;
      setDismissedConcurrency(false);
    }
  }, [editingReservation]);

  useEffect(() => {
    const conflict = (event: Event) => {
      if ((event as CustomEvent).detail?.id === editingReservation?.id) setDismissedConcurrency(false);
    };
    window.addEventListener('reservation-version-conflict', conflict);
    return () => window.removeEventListener('reservation-version-conflict', conflict);
  }, [editingReservation?.id]);

  // Non-blocking inline feedback system to replace blocking alert() calls (D4 & D9)
  const [formFeedback, setFormFeedback] = useState<{ message: string; type: 'error' | 'warning' | 'info' | 'success' } | null>(null);

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
    secondaryAction?: {
      label: string;
      onClick: () => void | Promise<void>;
      className?: string;
    };
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Eliminar',
    onConfirm: () => {}
  });

  const showFormFeedback = (message: string, type: 'error' | 'warning' | 'info' | 'success' = 'error') => {
    setFormFeedback({ message, type });
    const el = document.getElementById('modal-form-feedback-banner');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    setTimeout(() => {
      setFormFeedback(prev => (prev?.message === message ? null : prev));
    }, 6000);
  };

  const concurrencyConflict = useMemo(() => {
    if (dismissedConcurrency || !editingReservation || !initialEditingSnapshot.current || !allReservations) {
      return null;
    }
    const currentInStore = allReservations.find((r) => r.id === editingReservation.id);
    if (!currentInStore) {
      return { type: 'deleted' as const, message: 'Esta reserva fue eliminada en otra sesión.' };
    }
    const initialUpdatedAt = initialEditingSnapshot.current.updatedAt;
    if ((currentInStore.version || 0) > (initialEditingSnapshot.current.version || 0) || (currentInStore.updatedAt && initialUpdatedAt && currentInStore.updatedAt > initialUpdatedAt)) {
      return {
        type: 'modified' as const,
        editor: currentInStore.editadoPor || 'otro usuario',
        updatedAt: currentInStore.updatedAt,
        currentReservation: currentInStore
      };
    }
    return null;
  }, [allReservations, editingReservation, dismissedConcurrency]);

  // Single date multi-space state (2do espacio en diferente horario para el mismo día)
  const [enableSingleSecondSpace, setEnableSingleSecondSpace] = useState<boolean>(false);
  const [singleSecondSpace, setSingleSecondSpace] = useState<string>('');
  const [singleSecondStartTime, setSingleSecondStartTime] = useState<string>('11:00');
  const [singleSecondEndTime, setSingleSecondEndTime] = useState<string>('12:00');

  // Multi-day & Weekly pattern custom schedules hook
  const {
    useCustomSchedulesPerDate,
    setUseCustomSchedulesPerDate,
    dateSchedules,
    setDateSchedules,
    useCustomSchedulesPerDay,
    setUseCustomSchedulesPerDay,
    daySchedules,
    setDaySchedules,
    handleUpdateDateSchedule,
    handleCopyDateScheduleToAll,
    handleApplyBaseToAllDates,
    handleUpdateDaySchedule,
    handleCopyDayScheduleToAll,
    handleApplyBaseToAllDays
  } = useReservationCustomSchedules({
    formData,
    initialSpace,
    availableSpaces,
    specificDates,
    selectedDays
  });

  const scheduleFingerprint = JSON.stringify({date: formData.fecha, start: formData.horaInicio, end: formData.horaFin,
    space: formData.espacio, overnight: formData.terminaDiaSiguiente, bookingMode, dates: selectedSpecificDates,
    selectedDays, recurrenceStartDate, recurrenceEndDate, useCustomSchedulesPerDate, dateSchedules,
    useCustomSchedulesPerDay, daySchedules, enableSingleSecondSpace, singleSecondSpace, singleSecondStartTime, singleSecondEndTime});
  useEffect(() => {
    if (isOpen && initializationRevision > 0) setInitialFormBaseline({form: structuredClone(formData), schedule: scheduleFingerprint,
      history: editingReservation ? allReservations.filter(r=>belongsToSeries(r,editingReservation)) : []});
  }, [initializationRevision]);

  // Feriados en Chile & Clave de autorización CCD
  const [holidayOverrideKey, setHolidayOverrideKey] = useState<string>('');
  const [includeHolidaysInSeries, setIncludeHolidaysInSeries] = useState<boolean>(false);

  // Invalidate holiday authorization if the target date or date pattern changes
  const prevHolidayDateRef = useRef<string>(formData.fecha);
  const prevHolidaySpecificRef = useRef<string>(specificDates.join(','));
  const prevHolidayPatternRef = useRef<string>(`${recurrenceStartDate}_${recurrenceEndDate}_${selectedDays.join(',')}`);

  useEffect(() => {
    if (prevHolidayDateRef.current !== formData.fecha) {
      prevHolidayDateRef.current = formData.fecha;
      setHolidayOverrideKey('');
    }
  }, [formData.fecha]);

  useEffect(() => {
    const currentSpecific = specificDates.join(',');
    if (prevHolidaySpecificRef.current !== currentSpecific) {
      prevHolidaySpecificRef.current = currentSpecific;
      setHolidayOverrideKey('');
    }
  }, [specificDates]);

  useEffect(() => {
    const currentPattern = `${recurrenceStartDate}_${recurrenceEndDate}_${selectedDays.join(',')}`;
    if (prevHolidayPatternRef.current !== currentPattern) {
      prevHolidayPatternRef.current = currentPattern;
      setHolidayOverrideKey('');
    }
  }, [recurrenceStartDate, recurrenceEndDate, selectedDays]);

  // Clave de autorización para préstamo fuera de horario regular (ccd2026)
  const [extendedAuthKey, setExtendedAuthKey] = useState<string>('');

  // Carta de Compromiso Modal State & Ticket Switch
  const [showCommitmentLetterModal, setShowCommitmentLetterModal] = useState<boolean>(false);
  const [descargarCartaAlCrear, setDescargarCartaAlCrear] = useState<boolean>(true);

  // Local Autosave Hook: saves state to localStorage during editing and recovers progress on reload
  const handleRestoreDraft = useCallback((draft: AutosavedReservationDraft) => {
    if (draft.formData) {
      setFormData((prev) => ({
        ...prev,
        ...draft.formData
      }));
    }
    if (draft.bookingMode) setBookingMode(draft.bookingMode);
    if (draft.specificDates && draft.specificDates.length > 0) setSpecificDates(draft.specificDates);
    if (draft.selectedDays && draft.selectedDays.length > 0) setSelectedDays(draft.selectedDays);
    if (draft.recurrenceStartDate) setRecurrenceStartDate(draft.recurrenceStartDate);
    if (draft.recurrenceEndDate) setRecurrenceEndDate(draft.recurrenceEndDate);
    if (draft.useCustomSchedulesPerDate !== undefined) setUseCustomSchedulesPerDate(draft.useCustomSchedulesPerDate);
    if (draft.dateSchedules) setDateSchedules(draft.dateSchedules);
    if (draft.useCustomSchedulesPerDay !== undefined) setUseCustomSchedulesPerDay(draft.useCustomSchedulesPerDay);
    if (draft.daySchedules) setDaySchedules(draft.daySchedules);
    if (draft.enableSingleSecondSpace !== undefined) setEnableSingleSecondSpace(draft.enableSingleSecondSpace);
    if (draft.singleSecondSpace) setSingleSecondSpace(draft.singleSecondSpace);
    if (draft.singleSecondStartTime) setSingleSecondStartTime(draft.singleSecondStartTime);
    if (draft.singleSecondEndTime) setSingleSecondEndTime(draft.singleSecondEndTime);
    if (draft.descargarCartaAlCrear !== undefined) setDescargarCartaAlCrear(draft.descargarCartaAlCrear);

    if (draft.settings) {
      prevHolidayDateRef.current = draft.formData.fecha || '';
      prevHolidaySpecificRef.current = (draft.specificDates || []).join(',');
      prevHolidayPatternRef.current = `${draft.recurrenceStartDate}_${draft.recurrenceEndDate}_${draft.selectedDays.join(',')}`;
      setHolidayOverrideKey(draft.settings.holidayOverrideKey);
      setExtendedAuthKey(draft.settings.extendedAuthKey);
      setIncludeHolidaysInSeries(draft.settings.includeHolidaysInSeries);
      setGenerateFullSeries(draft.settings.generateFullSeries);
    }
    if (draft.editScope) {
      setUpdateScope(draft.editScope.updateScope);
      setRangeStartDate(draft.editScope.rangeStartDate);
      setRangeEndDate(draft.editScope.rangeEndDate);
      setSelectedOccurrenceIds(new Set(draft.editScope.selectedOccurrenceIds));
    }
    showFormFeedback('✓ Progreso recuperado exitosamente desde el borrador guardado automáticamente.', 'success');
  }, []);

  const {
    hasDraft,
    draftData,
    draftTimeAgo,
    isSaving: isAutosaving,
    lastSavedAt: autosaveLastSavedAt,
    restoreDraft,
    discardDraft,
    clearDraft
  } = useReservationAutosave({
    editScope: useMemo(()=>({updateScope,rangeStartDate,rangeEndDate,selectedOccurrenceIds:[...selectedOccurrenceIds]}),[updateScope,rangeStartDate,rangeEndDate,selectedOccurrenceIds]),
    settings: useMemo(()=>({holidayOverrideKey,extendedAuthKey,includeHolidaysInSeries,generateFullSeries}),[holidayOverrideKey,extendedAuthKey,includeHolidaysInSeries,generateFullSeries]),
    isOpen: isOpen && !replacementSource,
    editingReservation,
    isDuplicating,
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
    onRestore: handleRestoreDraft
  });

  // Series identification and recurrence analysis hook
  const {
    isEditingRecurring,
    isEditingSingleOccurrence,
    seriesReservations,
    seriesCount,
    affectedReservations,
    rawPatternDates,
    patternHolidayAnalysis,
    responsibleHistoryAlert,
    specificHolidayAnalysis,
    isHolidayAuthorized,
    generatedDates,
    singleDateHolidayInfo,
    excludeReservationIds: seriesExcludeReservationIds,
    excludeSeriesId
  } = useReservationSeriesState({
    editingReservation,
    isDuplicating,
    allReservations,
    updateScope,
    rangeStartDate,
    rangeEndDate,
    selectedOccurrenceIds,
    bookingMode,
    recurrenceStartDate,
    recurrenceEndDate,
    selectedDays,
    specificDates,
    formData,
    includeHolidaysInSeries,
    holidayOverrideKey,
    ratings
  });
  const excludeReservationIds = replacementSource ? [replacementSource.id] : seriesExcludeReservationIds;

  useEffect(() => {
    if (!isOpen) { initializedFormKey.current = null; return; }
    const key = JSON.stringify([editingReservation?.id || replacementSource?.id || 'new', isDuplicating, initialDate, initialSpace, initialStartTime, initialEndTime]);
    if (initializedFormKey.current === key) return;
    initializedFormKey.current = key;
    setInitialFormBaseline(null);
    setInitializationRevision(revision => revision + 1);

    if (editingReservation) {
      setIsEditingLoading(true);
      const isCopy = Boolean(isDuplicating);
      const isMultiSpace = isSingleDayMultiSpaceReservation(editingReservation);
      const clonedEquip = editingReservation.equipamientoSolicitado
        ? JSON.parse(JSON.stringify(editingReservation.equipamientoSolicitado))
        : [];

      const copyDesc = isCopy
        ? (editingReservation.descripcion
            ? (editingReservation.descripcion.includes('(Copia)') ? editingReservation.descripcion : `${editingReservation.descripcion} (Copia)`)
            : `${editingReservation.tipoActividad || 'Reserva'} (Copia)`)
        : (editingReservation.descripcion || '');

      const sMinInit = timeToMinutes(editingReservation.horaInicio);
      const eMinInit = timeToMinutes(editingReservation.horaFin);
      const isNaturallyOvernight = sMinInit >= 18 * 60 && eMinInit <= sMinInit && eMinInit > 0;
      const isClearlyNormalDaytime = sMinInit >= 8 * 60 + 30 && eMinInit <= 22 * 60 && eMinInit > sMinInit;
      const initialMidnight = Boolean(
        isNaturallyOvernight ||
        (editingReservation.terminaDiaSiguiente && !isClearlyNormalDaytime)
      );

      setFormData({
        ...editingReservation,
        id: isCopy
          ? `RSV_${Math.random().toString(36).substring(2, 10).toUpperCase()}`
          : editingReservation.id,
        descripcion: copyDesc,
        realizada: isCopy ? 'No' : (editingReservation.realizada || 'No'),
        actividadRecurrente: isCopy || isMultiSpace ? 'No' : (editingReservation.actividadRecurrente || 'No'),
        serieRecurrente: isCopy || isMultiSpace ? undefined : editingReservation.serieRecurrente,
        recurrenteId: isCopy || isMultiSpace ? undefined : editingReservation.recurrenteId,
        indiceEnSerie: isCopy ? undefined : editingReservation.indiceEnSerie,
        totalEnSerie: isCopy ? undefined : editingReservation.totalEnSerie,
        terminaDiaSiguiente: initialMidnight,
        horarioExtendidoAutorizado: false,
        claveAutorizacion: '',
        autorizadoPor: editingReservation.autorizadoPor || '',
        equipamientoSolicitado: clonedEquip
      });
      // Inicia bloqueado por defecto para requerir validación estricta de clave ccd2026
      setExtendedAuthKey('');
      const isRecurringSeries = !isCopy && !isMultiSpace && Boolean(
        editingReservation.actividadRecurrente === 'Sí' ||
        Boolean(editingReservation.serieRecurrente || editingReservation.recurrenteId)
      );
      setGenerateFullSeries(isCopy ? true : isRecurringSeries);
      setAllowConflictOverride(false);
      setUpdateScope(isRecurringSeries ? 'series' : 'single');
      setRangeStartDate(editingReservation.fecha || format(new Date(), 'yyyy-MM-dd'));
      setRangeEndDate(editingReservation.fecha || format(new Date(), 'yyyy-MM-dd'));
      setSelectedOccurrenceIds(new Set([editingReservation.id]));

      if (isCopy || isMultiSpace) {
        setBookingMode('single');
      } else if (editingReservation.tipoRecurrencia === 'especificas') {
        setBookingMode('specific');
      } else if (editingReservation.actividadRecurrente === 'Sí') {
        setBookingMode('pattern');
      } else {
        setBookingMode('single');
      }

      setEnableSingleSecondSpace(false);

      setDescargarCartaAlCrear(editingReservation.descargarCartaAlCrear ?? false);

      if (editingReservation.fecha) {
        setSpecificDates([editingReservation.fecha]);
        try {
          setCurrentCalendarMonth(parseISO(editingReservation.fecha));
        } catch (e) {}
      }

      // Check if editing a series: load full series context and per-day / per-date schedules
      const sId = !isCopy && !isMultiSpace && (editingReservation.serieRecurrente || editingReservation.recurrenteId);
      if (sId && allReservations) {
        const matches = allReservations.filter((r) => (r.serieRecurrente === sId || r.recurrenteId === sId) &&
          r.fecha >= getSeriesEditStartDate('series', editingReservation.fecha) && !r.reemplazadaPorReservaId && !['cancelada', 'eliminada', 'rechazada'].includes(r.estado || ''));
        if (matches.length > 0) {
          const sortedMatches = [...matches].sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            return a.horaInicio.localeCompare(b.horaInicio);
          });
          const dates = [...new Set(sortedMatches.map((r) => r.fecha))];
          setSpecificDates(dates);
          setRecurrenceStartDate(dates[0]);
          const lastMatchedDate = dates[dates.length - 1];
          const initialEndDate =
            editingReservation.fechaFinRecurrencia && editingReservation.fechaFinRecurrencia > lastMatchedDate
              ? editingReservation.fechaFinRecurrencia
              : lastMatchedDate;
          setRecurrenceEndDate(initialEndDate);

          const schedules = schedulesFromReservations(sortedMatches);
          const foundDays = new Set(sortedMatches.map(m => getDayOfWeekFromDateString(m.fecha)));
          const hasDifferentSchedules = Object.values(schedules.dates).some(slot => slot.hasSecondSlot ||
            slot.horaInicio !== editingReservation.horaInicio || slot.horaFin !== editingReservation.horaFin || slot.espacio !== editingReservation.espacio);
          setDaySchedules(schedules.days);
          setDateSchedules(schedules.dates);
          setUseCustomSchedulesPerDay(hasDifferentSchedules);
          setUseCustomSchedulesPerDate(hasDifferentSchedules);
          if (schedules.variableDates) setBookingMode('specific');
          if (foundDays.size > 0) {
            setSelectedDays(Array.from(foundDays).sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)));
          }
        }
      } else {
        if (editingReservation.fechaInicioRecurrencia) {
          setRecurrenceStartDate(isCopy ? editingReservation.fechaInicioRecurrencia : getSeriesEditStartDate('series', editingReservation.fecha));
        } else if (editingReservation.fecha) {
          setRecurrenceStartDate(editingReservation.fecha);
        }
        if (editingReservation.fechaFinRecurrencia) {
          setRecurrenceEndDate(editingReservation.fechaFinRecurrencia);
        }
        if (editingReservation.diasSemana) {
          const raw = editingReservation.diasSemana.toLowerCase();
          const daysFound: number[] = [];
          WEEKDAYS.forEach((w) => {
            if (raw.includes(w.key) || raw.includes(String(w.dayNum))) {
              daysFound.push(w.dayNum);
            }
          });
          if (daysFound.length > 0) {
            setSelectedDays(daysFound);
          }
        }
      }
      setIsEditingLoading(false);
    } else {
      const defAct = effectiveActivityNames[0] || 'TALLER CCD';
      const defLoan = availableLoanTypes[0]?.name || 'TALLER FORMATIVO CCD';
      let defaultSpace = initialSpace || (availableSpaces[0]?.name || 'TATAMI');

      const initD = initialDate || format(new Date(), 'yyyy-MM-dd');
      let initDayNum = 1;
      try {
        initDayNum = parseISO(initD).getDay();
        setCurrentCalendarMonth(parseISO(initD));
      } catch (e) {
        initDayNum = 1;
      }

      const safeInitStartTime = replacementSource?.horaInicio || getSafeEarlyStartTime(initialStartTime);
      const safeInitEndTime = replacementSource?.horaFin || getSafeEarlyEndTime(initialStartTime, initialEndTime);

      // If opening fresh without a pre-chosen space, pick the first non-conflicting space if possible
      if (!initialSpace && availableSpaces.length > 1) {
        const testSlot = {
          fecha: initD,
          horaInicio: safeInitStartTime,
          horaFin: safeInitEndTime,
          espacio: defaultSpace
        };
        if (checkSingleConflict(testSlot, allReservations).length > 0) {
          const freeSpace = availableSpaces.find((sp) =>
            checkSingleConflict({ ...testSlot, espacio: sp.name }, allReservations).length === 0
          );
          if (freeSpace) {
            defaultSpace = freeSpace.name;
          }
        }
      }

      setFormData({
        id: replacementSource ? replacementId.current : `RSV_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        fecha: initD,
        horaInicio: safeInitStartTime,
        horaFin: safeInitEndTime,
        espacio: defaultSpace,
        responsable: initialResponsable || '',
        telefonoContacto: initialPhone || '',
        emailContacto: initialEmail || '',
        tipoActividad: defAct,
        tipoPrestamo: defLoan,
        descripcion: '',
        actividadRecurrente: 'No',
        diasSemana: 'lunes,miercoles',
        fechaInicioRecurrencia: initD,
        fechaFinRecurrencia: format(addMonths(new Date(), 3), 'yyyy-MM-dd'),
        cantidadParticipantes: 15,
        realizada: 'No',
        importante: 'No',
        comentarios: '',
        rut: initialRut || '',
        domicilio: '',
        terminaDiaSiguiente: Boolean(replacementSource?.terminaDiaSiguiente),
        horarioExtendidoAutorizado: false,
        claveAutorizacion: '',
        autorizadoPor: '',
        requiereCartaCompromiso: isCommitmentLetterEligible(defAct, defLoan),
        equipamientoSolicitado: []
      });
      setBookingMode('single');
      setSpecificDates([initD]);
      setDateInputToAdd('');
      setRecurrenceStartDate(initD);
      setRecurrenceEndDate(format(addMonths(new Date(), 3), 'yyyy-MM-dd'));
      setSelectedDays([initDayNum]);
      setGenerateFullSeries(true);
      setAllowConflictOverride(false);
      setShowConflictDialog(false);
      setExtendedAuthKey('');
      setHolidayOverrideKey('');
      setEnableSingleSecondSpace(false);
      const defaultSecondSpace = availableSpaces.find((s) => s.name !== defaultSpace)?.name || availableSpaces[1]?.name || availableSpaces[0]?.name;
      setSingleSecondSpace(defaultSecondSpace);
      setSingleSecondStartTime(safeInitEndTime);
      setSingleSecondEndTime(formatMinutesToTime(Math.min(1439, timeToMinutes(safeInitEndTime) + 60)));
      setUseCustomSchedulesPerDay(false);
      setUseCustomSchedulesPerDate(false);
      setDaySchedules({
        1: { horaInicio: safeInitStartTime, horaFin: safeInitEndTime, espacio: defaultSpace, hasSecondSlot: false, secondHoraInicio: safeInitEndTime, secondHoraFin: formatMinutesToTime(Math.min(1439, timeToMinutes(safeInitEndTime) + 60)), secondEspacio: defaultSecondSpace },
        2: { horaInicio: safeInitStartTime, horaFin: safeInitEndTime, espacio: defaultSpace, hasSecondSlot: false, secondHoraInicio: safeInitEndTime, secondHoraFin: formatMinutesToTime(Math.min(1439, timeToMinutes(safeInitEndTime) + 60)), secondEspacio: defaultSecondSpace },
        3: { horaInicio: safeInitStartTime, horaFin: safeInitEndTime, espacio: defaultSpace, hasSecondSlot: false, secondHoraInicio: safeInitEndTime, secondHoraFin: formatMinutesToTime(Math.min(1439, timeToMinutes(safeInitEndTime) + 60)), secondEspacio: defaultSecondSpace },
        4: { horaInicio: safeInitStartTime, horaFin: safeInitEndTime, espacio: defaultSpace, hasSecondSlot: false, secondHoraInicio: safeInitEndTime, secondHoraFin: formatMinutesToTime(Math.min(1439, timeToMinutes(safeInitEndTime) + 60)), secondEspacio: defaultSecondSpace },
        5: { horaInicio: safeInitStartTime, horaFin: safeInitEndTime, espacio: defaultSpace, hasSecondSlot: false, secondHoraInicio: safeInitEndTime, secondHoraFin: formatMinutesToTime(Math.min(1439, timeToMinutes(safeInitEndTime) + 60)), secondEspacio: defaultSecondSpace },
        6: { horaInicio: safeInitStartTime, horaFin: safeInitEndTime, espacio: defaultSpace, hasSecondSlot: false, secondHoraInicio: safeInitEndTime, secondHoraFin: formatMinutesToTime(Math.min(1439, timeToMinutes(safeInitEndTime) + 60)), secondEspacio: defaultSecondSpace },
        0: { horaInicio: safeInitStartTime, horaFin: safeInitEndTime, espacio: defaultSpace, hasSecondSlot: false, secondHoraInicio: safeInitEndTime, secondHoraFin: formatMinutesToTime(Math.min(1439, timeToMinutes(safeInitEndTime) + 60)), secondEspacio: defaultSecondSpace }
      });
    }
  }, [editingReservation, isDuplicating, initialDate, initialSpace, initialStartTime, initialEndTime, isOpen, availableSpaces, availableLoanTypes, availableActivityTypes]);

  // Synchronize start date if primary date changes
  const handlePrimaryDateChange = (newDate: string) => {
    setFormData((prev) => ({ ...prev, fecha: newDate }));
    if (!editingReservation) {
      setRecurrenceStartDate(newDate);
      if (!specificDates.includes(newDate)) {
        setSpecificDates((prev) => Array.from(new Set([newDate, ...prev])).sort());
      }
      try {
        const parsed = parseISO(newDate);
        setCurrentCalendarMonth(parsed);
        const dayNum = parsed.getDay();
        if (!selectedDays.includes(dayNum)) {
          setSelectedDays((prev) => Array.from(new Set([...prev, dayNum])));
        }
      } catch (e) {
        // ignore
      }
    }
  };

  const handleRecurrenceEndDateChange = (val: string) => {
    setRecurrenceEndDate(val);
    if (editingReservation && !isDuplicating && isEditingRecurring && updateScope === 'single') {
      setUpdateScope('series');
    }
  };

  const handleBookingModeChange = (mode: 'single' | 'specific' | 'pattern') => {
    setBookingMode(mode);
    if (editingReservation && !isDuplicating && isEditingRecurring && updateScope === 'single' && mode !== 'single') {
      setUpdateScope('series');
    }
  };

  // Specific dates handlers
  const handleAddSpecificDate = (dateStr: string) => {
    if (!dateStr) return;
    if (editingReservation && !isDuplicating && isEditingRecurring && updateScope === 'single') {
      setUpdateScope('series');
    }
    setSpecificDates((prev) => {
      if (prev.includes(dateStr)) return prev;
      return [...prev, dateStr].sort();
    });
    // Set first date as primary if empty
    if (!formData.fecha) {
      setFormData((prev) => ({ ...prev, fecha: dateStr }));
    }
  };

  const handleRemoveSpecificDate = (dateStr: string) => {
    if (editingReservation && !isDuplicating && isEditingRecurring && updateScope === 'single') {
      setUpdateScope('series');
    }
    setSpecificDates((prev) => {
      const filtered = prev.filter((d) => d !== dateStr);
      if (filtered.length > 0 && formData.fecha === dateStr) {
        setFormData((p) => ({ ...p, fecha: filtered[0] }));
      }
      return filtered;
    });
  };

  const handleToggleSpecificDate = (dateStr: string) => {
    if (specificDates.includes(dateStr)) {
      handleRemoveSpecificDate(dateStr);
    } else {
      handleAddSpecificDate(dateStr);
    }
  };

  const handleAddRelativeDays = (daysToAdd: number) => {
    try {
      const baseStr = specificDates.length > 0 ? specificDates[specificDates.length - 1] : (formData.fecha || '2026-08-27');
      const nextDate = format(addDays(parseISO(baseStr), daysToAdd), 'yyyy-MM-dd');
      handleAddSpecificDate(nextDate);
      setCurrentCalendarMonth(parseISO(nextDate));
    } catch (e) {
      // ignore
    }
  };

  // Day toggler for pattern recurrence
  const toggleDay = (dayNum: number) => {
    if (editingReservation && !isDuplicating && isEditingRecurring && updateScope === 'single') {
      setUpdateScope('series');
    }
    setSelectedDays((prev) => {
      if (prev.includes(dayNum)) {
        if (prev.length === 1) return prev; // Keep at least one day
        return prev.filter((d) => d !== dayNum);
      } else {
        return [...prev, dayNum].sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));
      }
    });
    setDaySchedules((prev) => {
      if (!prev[dayNum] || !prev[dayNum].espacio) {
        return {
          ...prev,
          [dayNum]: {
            horaInicio: prev[dayNum]?.horaInicio || formData.horaInicio || '10:00',
            horaFin: prev[dayNum]?.horaFin || formData.horaFin || '11:00',
            espacio: prev[dayNum]?.espacio || formData.espacio || 'TATAMI'
          }
        };
      }
      return prev;
    });
  };

  const isEditingExisting = Boolean(editingReservation && !isDuplicating);
  const canModifyReservation = isCoordinatorOrAdmin(currentUser);

  // Conflict resolution and smart recommendations hook
  const {
    getDateSlotConflict,
    singleSecondSpaceConflicts,
    conflicts,
    mainDuration,
    quickFreeSlots,
    quickAltSpaces,
    handleShiftImmediatelyAfter,
    handleFindNextSlotForSecondSpace,
    handleSwitchSecondSpaceToAvailable,
    handleAutoFixDateSchedule,
    handleAutoFixAllDatesWithConflicts,
    handleFindNextAvailableSlot,
    handleApplyRecommendation,
    reviewSlots,
    candidateConflictDates
  } = useReservationConflictResolution({
    scheduleChanged: !initialFormBaseline || initialFormBaseline.schedule !== scheduleFingerprint,
    rangeStartDate,
    rangeEndDate,
    conflictReviewFrom: isEditingRecurring ? getSeriesEditStartDate(updateScope, editingReservation!.fecha, editToday) : undefined,
    formData,
    allReservations,
    excludeReservationIds,
    excludeSeriesId,
    availableSpaces,
    enableSingleSecondSpace,
    singleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    bookingMode,
    isEditingSingleOccurrence,
    editingReservation,
    isDuplicating,
    isEditingRecurring,
    updateScope,
    affectedReservations,
    useCustomSchedulesPerDate,
    dateSchedules,
    specificDates,
    useCustomSchedulesPerDay,
    daySchedules,
    generatedDates,
    showFormFeedback,
    setFormData,
    setSingleSecondStartTime,
    setSingleSecondEndTime,
    setSingleSecondSpace,
    setDateSchedules
  });

  // Real-time validations and multi-step wizard state validation hook
  const {
    timeValidation,
    singleSecondTimeValidation,
    rutValidation,
    emailValidation,
    phoneValidation,
    loanScheduleCheck,
    isExtensionAuthorized,
    descriptionValidation,
    primarySpaceCapacityWarning,
    secondSpaceCapacityWarning,
    isFormSubmitDisabled,
    hasStep1Conflict,
    validateStep1,
    validateStep2,
    isStep1ActivityCompleted,
    isStep2DateTimeCompleted,
    isStep3ApplicantCompleted,
    isStep4ResourcesCompleted,
    validateStep1Activity,
    validateStep2DateTime,
    validateStep3Applicant,
    validateStep4Resources
  } = useReservationModalValidation({
    preserveExistingSchedule: isEditingRecurring && updateScope !== 'single' && Boolean(initialFormBaseline && initialFormBaseline.schedule === scheduleFingerprint),
    reviewSlots,
    allReservations,
    formData,
    enableSingleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    singleSecondSpace,
    bookingMode,
    useCustomSchedulesPerDate,
    dateSchedules,
    specificDates,
    useCustomSchedulesPerDay,
    selectedDays,
    daySchedules,
    extendedAuthKey,
    availableSpaces,
    generateFullSeries,
    recurrenceStartDate,
    recurrenceEndDate,
    generatedDates,
    isSubmitting,
    editingReservation,
    conflicts,
    candidateConflictDates,
    allowConflictOverride,
    singleDateHolidayInfo,
    isHolidayAuthorized: isHolidayAuthorized || Boolean(editingReservation && !isDuplicating && bookingMode === 'single' &&
      formData.fecha === editingReservation.fecha && verifyHolidayOverrideKey(editingReservation.claveAutorizacionFeriado || '')),
    specificHolidayAnalysis,
    includeHolidaysInSeries,
    patternHolidayAnalysis,
    showFormFeedback
  });

  const scrollToModalTop = () => {
    const modalBody = document.querySelector('#reservation-modal-form-body');
    if (modalBody) {
      modalBody.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const effectiveSeriesSlotsForLetter = useMemo((): CommitmentScheduleSlot[] | undefined => {
    // 1. Single booking mode with second space enabled
    if (bookingMode === 'single' && enableSingleSecondSpace && singleSecondSpace) {
      const d = formData.fecha || format(new Date(), 'yyyy-MM-dd');
      return [
        {
          fecha: d,
          horaInicio: formData.horaInicio || '14:00',
          horaFin: formData.horaFin || '22:00',
          espacio: formData.espacio || 'SALA 3'
        },
        {
          fecha: d,
          horaInicio: singleSecondStartTime || formData.horaFin || '14:00',
          horaFin: singleSecondEndTime || '22:00',
          espacio: singleSecondSpace
        }
      ];
    }

    // 2. Specific dates mode
    if (bookingMode === 'specific' && generateFullSeries && specificDates.length > 0) {
      const slots: CommitmentScheduleSlot[] = [];
      specificDates.forEach((d) => {
        const custom = useCustomSchedulesPerDate ? dateSchedules[d] : undefined;
        slots.push({
          fecha: d,
          horaInicio: custom?.horaInicio || formData.horaInicio || '14:00',
          horaFin: custom?.horaFin || formData.horaFin || '22:00',
          espacio: custom?.espacio || formData.espacio || 'SALA 3'
        });
        if (useCustomSchedulesPerDate && custom?.hasSecondSlot && custom?.secondEspacio) {
          slots.push({
            fecha: d,
            horaInicio: custom.secondHoraInicio || '11:00',
            horaFin: custom.secondHoraFin || '12:00',
            espacio: custom.secondEspacio
          });
        } else if (enableSingleSecondSpace && singleSecondSpace) {
          slots.push({
            fecha: d,
            horaInicio: singleSecondStartTime || formData.horaFin || '14:00',
            horaFin: singleSecondEndTime || '22:00',
            espacio: singleSecondSpace
          });
        }
      });
      return slots;
    }

    // 3. Weekly pattern mode
    if (bookingMode === 'pattern' && generateFullSeries && generatedDates.length > 0) {
      const slots: CommitmentScheduleSlot[] = [];
      generatedDates.forEach((d) => {
        const dayNum = getDayOfWeekFromDateString(d);
        const customSlot = useCustomSchedulesPerDay ? daySchedules[dayNum] : undefined;
        slots.push({
          fecha: d,
          horaInicio: customSlot?.horaInicio || formData.horaInicio || '14:00',
          horaFin: customSlot?.horaFin || formData.horaFin || '22:00',
          espacio: customSlot?.espacio || formData.espacio || 'SALA 3'
        });
        if (useCustomSchedulesPerDay && customSlot?.hasSecondSlot && customSlot?.secondEspacio) {
          slots.push({
            fecha: d,
            horaInicio: customSlot.secondHoraInicio || '11:00',
            horaFin: customSlot.secondHoraFin || '12:00',
            espacio: customSlot.secondEspacio
          });
        } else if (enableSingleSecondSpace && singleSecondSpace) {
          slots.push({
            fecha: d,
            horaInicio: singleSecondStartTime || formData.horaFin || '14:00',
            horaFin: singleSecondEndTime || '22:00',
            espacio: singleSecondSpace
          });
        }
      });
      return slots;
    }

    // 4. Editing reservation with second space toggled on
    if (editingReservation && enableSingleSecondSpace && singleSecondSpace) {
      const d = formData.fecha || editingReservation.fecha || format(new Date(), 'yyyy-MM-dd');
      return [
        {
          fecha: d,
          horaInicio: formData.horaInicio || editingReservation.horaInicio || '14:00',
          horaFin: formData.horaFin || editingReservation.horaFin || '22:00',
          espacio: formData.espacio || editingReservation.espacio || 'SALA 3'
        },
        {
          fecha: d,
          horaInicio: singleSecondStartTime || '14:00',
          horaFin: singleSecondEndTime || '22:00',
          espacio: singleSecondSpace
        }
      ];
    }

    // 5. Editing existing recurring series or existing multi-space reservation
    if (editingReservation) {
      const sId = editingReservation.serieRecurrente || editingReservation.recurrenteId;
      if (sId && allReservations && allReservations.length > 0) {
        const matches = allReservations.filter((r) => (r.serieRecurrente === sId || r.recurrenteId === sId) &&
          r.fecha >= getSeriesEditStartDate('series', editingReservation.fecha));
        if (matches.length > 0) {
          return matches.map((r) => ({
            fecha: r.fecha,
            horaInicio: r.horaInicio || '14:00',
            horaFin: r.horaFin || '22:00',
            espacio: r.espacio || 'SALA 3'
          }));
        }
      }
    }
    return undefined;
  }, [
    bookingMode,
    enableSingleSecondSpace,
    singleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    generateFullSeries,
    specificDates,
    generatedDates,
    useCustomSchedulesPerDate,
    dateSchedules,
    useCustomSchedulesPerDay,
    daySchedules,
    formData.horaInicio,
    formData.horaFin,
    formData.espacio,
    formData.fecha,
    editingReservation,
    allReservations
  ]);

  const effectiveFormDataForLetter = useMemo(() => {
    const baseSpace = formData.espacio || 'SALA 3';
    const hasSecond = Boolean(enableSingleSecondSpace && singleSecondSpace);
    const combinedSpace = hasSecond
      ? (baseSpace.trim().toUpperCase() === singleSecondSpace.trim().toUpperCase()
          ? baseSpace
          : `${baseSpace} / ${singleSecondSpace}`)
      : baseSpace;
    return {
      ...formData,
      espacio: combinedSpace,
      segundoEspacio: hasSecond ? singleSecondSpace : undefined,
      segundoHoraInicio: hasSecond ? singleSecondStartTime : undefined,
      segundoHoraFin: hasSecond ? singleSecondEndTime : undefined
    };
  }, [formData, enableSingleSecondSpace, singleSecondSpace, singleSecondStartTime, singleSecondEndTime]);

  const handleConfirmSaveFromConflictModal = (overrideAllowed: boolean, payload?: ConflictSavePayload) => {
    if (overrideAllowed) {
      setAllowConflictOverride(true);
    }
    setShowConflictDialog(false);
    executeSave(overrideAllowed || allowConflictOverride, payload);
  };

  const handleConvertToSpecificDates = (dates: string[], schedules: Record<string, CustomScheduleSlot>) => {
    setBookingMode('specific');
    setSpecificDates(dates);
    setUseCustomSchedulesPerDate(true);
    setDateSchedules(schedules);
  };

  const handleUpdateSecondSpace = (updates: { space?: string; startTime?: string; endTime?: string }) => {
    if (updates.space !== undefined) setSingleSecondSpace(updates.space);
    if (updates.startTime !== undefined) setSingleSecondStartTime(updates.startTime);
    if (updates.endTime !== undefined) setSingleSecondEndTime(updates.endTime);
  };

  // Modular save handler hook
  const { executeSave } = useReservationSaveHandler({
    scheduleChanged: !initialFormBaseline || initialFormBaseline.schedule !== scheduleFingerprint,
    initialFormData: initialFormBaseline?.form,
    initialReservations: initialFormBaseline?.history,
    formData,
    setFormData,
    isSubmittingRef,
    isSubmitting,
    setIsSubmitting,
    isEditingExisting,
    canModifyReservation,
    currentUser,
    bookingMode,
    setBookingMode,
    specificDates,
    setSpecificDates,
    dateSchedules,
    setDateSchedules,
    useCustomSchedulesPerDate,
    setUseCustomSchedulesPerDate,
    singleSecondSpace,
    setSingleSecondSpace,
    singleSecondStartTime,
    setSingleSecondStartTime,
    singleSecondEndTime,
    setSingleSecondEndTime,
    enableSingleSecondSpace,
    isEditingSingleOccurrence,
    descriptionValidation,
    timeValidation,
    singleSecondTimeValidation,
    rutValidation,
    emailValidation,
    phoneValidation,
    loanScheduleCheck,
    isExtensionAuthorized,
    specificHolidayAnalysis,
    includeHolidaysInSeries,
    isHolidayAuthorized,
    holidayOverrideKey,
    patternHolidayAnalysis,
    generatedDates,
    recurrenceStartDate,
    recurrenceEndDate,
    rawPatternDates,
    singleDateHolidayInfo,
    selectedDays,
    useCustomSchedulesPerDay,
    daySchedules,
    spaceBlocks,
    availableSpaces,
    allReservations,
    excludeReservationIds,
    excludeSeriesId,
    allowConflictOverride,
    setAllowConflictOverride,
    setShowConflictDialog,
    generateFullSeries,
    editingReservation,
    isDuplicating,
    isEditingRecurring,
    updateScope,
    affectedReservations,
    rangeStartDate,
    rangeEndDate,
    descargarCartaAlCrear,
    effectiveSeriesSlotsForLetter,
    onSave: replacementSource ? async (replacement) => {
      const batch = buildReplacementBatch(replacementSource, replacement, replacementId.current, formData.motivoReemplazo || '');
      const blocks = findMaintenanceBlockConflicts([batch.updatedReservations[1]], spaceBlocks);
      if (blocks.length) throw new Error(formatBlockConflictMessage(blocks[0]));
      return onSave(batch.updatedReservations[1], false, undefined, false, batch, false);
    } : onSave,
    clearDraft: replacementSource ? () => {} : clearDraft,
    onClose,
    showFormFeedback
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (replacementSource) {
      if (!formData.motivoReemplazo?.trim()) {
        showFormFeedback('Indica el motivo del reemplazo.');
        return;
      }
      if (isWizardMode && wizardStep !== 5) {
        showFormFeedback('Revisa el resumen antes de confirmar el reemplazo.');
        return;
      }
      executeSave(false);
      return;
    }
    if (isWizardMode) {
      if (wizardStep === 1) {
        if (validateStep1(true)) {
          setWizardStep(2);
          scrollToModalTop();
        }
        return;
      }
      if (wizardStep === 2) {
        if (validateStep2(true)) {
          setWizardStep(3);
          scrollToModalTop();
        }
        return;
      }
    }
    executeSave(allowConflictOverride);
  };

  const handleDeleteFromModal = () => {
    if (!editingReservation) return;

    if (onRequestDelete) {
      onClose();
      onRequestDelete(editingReservation);
      return;
    }

    if (!canModifyReservation) {
      showFormFeedback('Permiso denegado: Solo usuarios con perfil Administrador o Coordinador están autorizados para eliminar reservas directamente.');
      return;
    }

    if (onDelete) {
      if (
        editingReservation.actividadRecurrente === 'Sí' &&
        (editingReservation.recurrenteId || editingReservation.serieRecurrente)
      ) {
        setDeleteConfirmModal({
          isOpen: true,
          title: 'Eliminar Reserva Recurrente',
          message: (
            <div className="space-y-2">
              <p className="font-semibold text-slate-800">Esta reserva forma parte de una serie periódica recurrente.</p>
              <p className="text-slate-600 text-xs">
                Puedes eliminar toda la serie recurrente completa o eliminar únicamente esta fecha individual del calendario.
              </p>
            </div>
          ),
          confirmLabel: 'Eliminar Toda la Serie',
          secondaryAction: {
            label: 'Solo Esta Fecha',
            className: 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-semibold',
            onClick: async () => {
              await onDelete(editingReservation.id, false);
              setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }));
              onClose();
            }
          },
          onConfirm: async () => {
            await onDelete(
              editingReservation.id,
              true,
              editingReservation.serieRecurrente || editingReservation.recurrenteId
            );
            setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }));
            onClose();
          }
        });
      } else {
        setDeleteConfirmModal({
          isOpen: true,
          title: 'Confirmar Eliminación',
          message: '¿Estás seguro de que deseas eliminar esta reserva?',
          confirmLabel: 'Eliminar Reserva',
          onConfirm: async () => {
            await onDelete(editingReservation.id, false);
            setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }));
            onClose();
          }
        });
      }
    }
  };

  const handleDuplicateReservation = () => {
    if (onDuplicateReservation) {
      onDuplicateReservation(formData as Reservation);
    } else {
      setFormData((prev) => ({
        ...prev,
        id: `RSV_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        descripcion: prev.descripcion ? `${prev.descripcion} (Copia)` : `${prev.tipoActividad} (Copia)`,
        realizada: 'No',
        serieRecurrente: undefined,
        recurrenteId: undefined,
        indiceEnSerie: undefined,
        totalEnSerie: undefined,
        actividadRecurrente: 'No'
      }));
      setBookingMode('single');
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={() => { if (!isSubmittingRef.current) onClose(); }} role="dialog" aria-modal="true" aria-label="Crear o editar reserva" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full border border-slate-100 overflow-hidden my-6">
        {/* Header */}
        <ReservationModalHeader
          replacementMode={Boolean(replacementSource)}
          isDuplicating={isDuplicating}
          editingReservation={editingReservation}
          isWizardMode={isWizardMode}
          setIsWizardMode={setIsWizardMode}
          onClose={() => { if (!isSubmittingRef.current) onClose(); }}
        />

        {/* Form Body */}
        <form id="reservation-modal-form-body" onSubmit={handleSubmit} noValidate className="p-6 space-y-5 max-h-[82vh] overflow-y-auto text-xs">
          <fieldset disabled={isSubmitting} className="contents">
          {/* Notification & Context Alerts */}
          <ReservationModalAlerts
            hasDraft={hasDraft}
            draftData={draftData}
            draftTimeAgo={draftTimeAgo}
            discardDraft={discardDraft}
            restoreDraft={restoreDraft}
            isEditingExisting={isEditingExisting}
            canModifyReservation={canModifyReservation}
            currentUser={currentUser}
            editingReservation={editingReservation}
            concurrencyConflict={concurrencyConflict}
            onReloadConcurrency={() => {
              if (concurrencyConflict?.currentReservation) {
                initializedFormKey.current=null;
                setReloadedReservation(concurrencyConflict.currentReservation);
                initialEditingSnapshot.current = {
                  id: concurrencyConflict.currentReservation.id,
                  updatedAt: concurrencyConflict.currentReservation.updatedAt,
                  version: (concurrencyConflict.currentReservation as any)?.version
                };
                setDismissedConcurrency(false);
              }
            }}
            onDismissConcurrency={() => setDismissedConcurrency(true)}
            isDuplicating={isDuplicating}
          />

          {/* Recurring Series Notice & Granular Scope Selector */}
          {editingReservation && isEditingRecurring && (
            <RecurringSeriesScopeSelector
              editingReservation={editingReservation}
              seriesReservations={seriesReservations}
              seriesCount={seriesCount}
              affectedReservations={affectedReservations}
              updateScope={updateScope}
              setUpdateScope={setUpdateScope}
              rangeStartDate={rangeStartDate}
              setRangeStartDate={setRangeStartDate}
              rangeEndDate={rangeEndDate}
              setRangeEndDate={setRangeEndDate}
              selectedOccurrenceIds={selectedOccurrenceIds}
              setSelectedOccurrenceIds={setSelectedOccurrenceIds}
            />
          )}

          {/* 5-Step Progressive Wizard Stepper */}
          {isWizardMode && (
            <div className="space-y-2">
              <WizardStepsBar
                wizardStep={wizardStep}
                isStep1Completed={isStep1ActivityCompleted}
                isStep2Completed={isStep2DateTimeCompleted}
                isStep3Completed={isStep3ApplicantCompleted}
                isStep4Completed={isStep4ResourcesCompleted}
                isStep5Completed={isStep1ActivityCompleted && isStep2DateTimeCompleted && isStep3ApplicantCompleted}
                espacio={formData.espacio}
                responsable={formData.responsable}
                descripcion={formData.descripcion}
                equipamientoCount={formData.equipamientoSolicitado?.length || 0}
                onSelectStep={(targetStep) => {
                  const prerequisites = [validateStep1Activity, validateStep2DateTime, validateStep3Applicant];
                  for (const validate of prerequisites.slice(0, targetStep - 1)) {
                    if (!validate(false)) {
                      validate(true);
                      return;
                    }
                  }
                  setWizardStep(targetStep);
                  scrollToModalTop();
                }}
              />

              {hasStep1Conflict && (
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-rose-100 border border-rose-300 text-rose-900 text-[11px] font-medium">
                  <div className="flex items-center space-x-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Atención: Existe un topamiento de horario en el Paso 2 (Espacio y Horario). Resuélvelo antes de avanzar.</span>
                  </div>
                  {wizardStep !== 2 && (
                    <button
                      type="button"
                      onClick={() => { setWizardStep(2); scrollToModalTop(); }}
                      className="text-rose-700 font-bold underline hover:text-rose-900 cursor-pointer"
                    >
                      Ir al Paso 2
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Paso 1: Identificación y Actividad */}
          {(!isWizardMode || wizardStep === 1) && (
            <ReservationStep1Activity
              isWizardMode={isWizardMode}
              formData={formData}
              setFormData={setFormData}
              descriptionValidation={descriptionValidation}
              effectiveActivityNames={effectiveActivityNames}
              availableActivityTypes={availableActivityTypes}
            />
          )}

          {/* Paso 2: Espacio, Fecha y Horarios */}
          {replacementSource ? ((!isWizardMode || wizardStep === 2) && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-2">
              <h3 className="font-bold">Reemplazar solo este día</h3>
              <p>{formatDateDDMMYYYY(replacementSource.fecha)} · {replacementSource.horaInicio}–{replacementSource.horaFin}{replacementSource.terminaDiaSiguiente ? ' (hasta el día siguiente)' : ''} · {replacementSource.espacio}</p>
              <p>La fecha, el espacio y el horario se conservan. Las demás fechas de la serie continúan normalmente.</p>
              {loanScheduleCheck.requiresAuthorization && <label className="block">Clave de autorización de horario extendido
                <input type="password" value={extendedAuthKey} onChange={e => setExtendedAuthKey(e.target.value)} className="block rounded-lg border bg-white p-2" />
              </label>}
              {singleDateHolidayInfo && <label className="block">Clave de autorización de feriado
                <input type="password" value={holidayOverrideKey} onChange={e => setHolidayOverrideKey(e.target.value)} className="block rounded-lg border bg-white p-2" />
              </label>}
            </div>
          )) : <ReservationStep2DateTime
            isWizardMode={isWizardMode}
            wizardStep={wizardStep}
            formData={formData}
            setFormData={setFormData}
            availableSpaces={availableSpaces}
            allReservations={allReservations}
            spaceBlocks={spaceBlocks}
            editingReservation={editingReservation}
            isDuplicating={isDuplicating}
            isEditingRecurring={isEditingRecurring}
            updateScope={updateScope}
            affectedReservations={affectedReservations}
            isEditingSingleOccurrence={isEditingSingleOccurrence}
            singleDateHolidayInfo={singleDateHolidayInfo}
            handlePrimaryDateChange={handlePrimaryDateChange}
            timeValidation={timeValidation}
            conflicts={conflicts}
            candidateConflictDates={candidateConflictDates}
            mainDuration={mainDuration}
            allowConflictOverride={allowConflictOverride}
            setAllowConflictOverride={setAllowConflictOverride}
            showInlineSuggestions={showInlineSuggestions}
            setShowInlineSuggestions={setShowInlineSuggestions}
            handleShiftImmediatelyAfter={handleShiftImmediatelyAfter}
            handleApplyRecommendation={handleApplyRecommendation}
            handleFindNextAvailableSlot={handleFindNextAvailableSlot}
            quickFreeSlots={quickFreeSlots}
            quickAltSpaces={quickAltSpaces}
            setShowConflictDialog={setShowConflictDialog}
            loanScheduleCheck={loanScheduleCheck}
            currentUser={currentUser}
            extendedAuthKey={extendedAuthKey}
            setExtendedAuthKey={setExtendedAuthKey}
            isExtensionAuthorized={isExtensionAuthorized}
            enableSingleSecondSpace={enableSingleSecondSpace}
            setEnableSingleSecondSpace={setEnableSingleSecondSpace}
            singleSecondSpace={singleSecondSpace}
            setSingleSecondSpace={setSingleSecondSpace}
            singleSecondStartTime={singleSecondStartTime}
            setSingleSecondStartTime={setSingleSecondStartTime}
            singleSecondEndTime={singleSecondEndTime}
            setSingleSecondEndTime={setSingleSecondEndTime}
            singleSecondTimeValidation={singleSecondTimeValidation}
            singleSecondSpaceConflicts={singleSecondSpaceConflicts}
            handleFindNextSlotForSecondSpace={handleFindNextSlotForSecondSpace}
            handleSwitchSecondSpaceToAvailable={handleSwitchSecondSpaceToAvailable}
            holidayOverrideKey={holidayOverrideKey}
            setHolidayOverrideKey={setHolidayOverrideKey}
            isHolidayAuthorized={isHolidayAuthorized}
            bookingMode={bookingMode}
            setBookingMode={handleBookingModeChange}
            generateFullSeries={generateFullSeries}
            setGenerateFullSeries={setGenerateFullSeries}
            specificDates={specificDates}
            setSpecificDates={setSpecificDates}
            dateInputToAdd={dateInputToAdd}
            setDateInputToAdd={setDateInputToAdd}
            currentCalendarMonth={currentCalendarMonth}
            setCurrentCalendarMonth={setCurrentCalendarMonth}
            handleAddSpecificDate={handleAddSpecificDate}
            handleToggleSpecificDate={handleToggleSpecificDate}
            handleAddRelativeDays={handleAddRelativeDays}
            specificHolidayAnalysis={specificHolidayAnalysis}
            useCustomSchedulesPerDate={useCustomSchedulesPerDate}
            setUseCustomSchedulesPerDate={setUseCustomSchedulesPerDate}
            dateSchedules={dateSchedules}
            handleUpdateDateSchedule={handleUpdateDateSchedule}
            handleCopyDateScheduleToAll={handleCopyDateScheduleToAll}
            handleAutoFixDateSchedule={handleAutoFixDateSchedule}
            handleAutoFixAllDatesWithConflicts={handleAutoFixAllDatesWithConflicts}
            handleApplyBaseToAllDates={handleApplyBaseToAllDates}
            getDateSlotConflict={getDateSlotConflict}
            selectedDays={selectedDays}
            setSelectedDays={setSelectedDays}
            toggleDay={toggleDay}
            recurrenceStartDate={recurrenceStartDate}
            setRecurrenceStartDate={setRecurrenceStartDate}
            recurrenceEndDate={recurrenceEndDate}
            setRecurrenceEndDate={handleRecurrenceEndDateChange}
            includeHolidaysInSeries={includeHolidaysInSeries}
            setIncludeHolidaysInSeries={setIncludeHolidaysInSeries}
            patternHolidayAnalysis={patternHolidayAnalysis}
            useCustomSchedulesPerDay={useCustomSchedulesPerDay}
            setUseCustomSchedulesPerDay={setUseCustomSchedulesPerDay}
            daySchedules={daySchedules}
            handleUpdateDaySchedule={handleUpdateDaySchedule}
            handleCopyDayScheduleToAll={handleCopyDayScheduleToAll}
            handleApplyBaseToAllDays={handleApplyBaseToAllDays}
            generatedDates={generatedDates}
          />}

          {/* Paso 3: Solicitante y Participantes */}
          <ReservationStep3Applicant
            isWizardMode={isWizardMode}
            wizardStep={wizardStep}
            formData={formData}
            setFormData={setFormData}
            handleResponsableChange={handleResponsableChange}
            uniqueResponsablesList={uniqueResponsablesList}
            autoFilledContactNotice={autoFilledContactNotice}
            phoneValidation={phoneValidation}
            rutValidation={rutValidation}
            emailValidation={emailValidation}
            primarySpaceCapacityWarning={primarySpaceCapacityWarning}
            secondSpaceCapacityWarning={secondSpaceCapacityWarning}
            singleSecondSpace={singleSecondSpace}
            responsibleHistoryAlert={responsibleHistoryAlert}
            descargarCartaAlCrear={descargarCartaAlCrear}
            setDescargarCartaAlCrear={setDescargarCartaAlCrear}
            setShowCommitmentLetterModal={setShowCommitmentLetterModal}
            editingReservation={editingReservation}
            effectiveFormDataForLetter={effectiveFormDataForLetter}
            effectiveSeriesSlotsForLetter={effectiveSeriesSlotsForLetter}
            allReservations={allReservations}
          />

          {/* Paso 4: Recursos y Documentación */}
          <ReservationStep4ResourcesDocs
            isWizardMode={isWizardMode}
            wizardStep={wizardStep}
            formData={formData}
            setFormData={setFormData}
            effectiveEquipment={effectiveEquipment}
            allReservations={allReservations}
            editingReservation={editingReservation}
            descargarCartaAlCrear={descargarCartaAlCrear}
            setDescargarCartaAlCrear={setDescargarCartaAlCrear}
            setShowCommitmentLetterModal={setShowCommitmentLetterModal}
            effectiveFormDataForLetter={effectiveFormDataForLetter}
            effectiveSeriesSlotsForLetter={effectiveSeriesSlotsForLetter}
          />

          {/* Paso 5: Resumen y Confirmación */}
          {replacementSource && (!isWizardMode || wizardStep === 1 || wizardStep === 5) && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
              <h3 className="font-bold">{wizardStep === 5 ? 'Confirmar reemplazo' : 'Motivo del reemplazo'}</h3>
              <p><strong>Actividad original:</strong> {replacementSource.descripcion} ({replacementSource.tipoActividad})</p>
              {wizardStep === 5 && <>
                <p><strong>Actividad nueva:</strong> {formData.descripcion} ({formData.tipoActividad})</p>
                <p>{formatDateDDMMYYYY(replacementSource.fecha)} · {replacementSource.horaInicio}–{replacementSource.horaFin} · {replacementSource.espacio}</p>
                <p>Las demás fechas de la serie continúan normalmente.</p>
              </>}
              <label className="block font-semibold" htmlFor="replacement-reason">Motivo obligatorio</label>
              <textarea id="replacement-reason" maxLength={2000} value={formData.motivoReemplazo || ''}
                onChange={e => setFormData(prev => ({ ...prev, motivoReemplazo: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white p-2" />
            </section>
          )}
          {isWizardMode && wizardStep === 5 && (
            <ReservationStep5Review
              isWizardMode={isWizardMode}
              wizardStep={wizardStep}
              formData={formData}
              bookingMode={bookingMode}
              specificDates={specificDates}
              enableSingleSecondSpace={enableSingleSecondSpace}
              singleSecondSpace={singleSecondSpace}
              singleSecondStartTime={singleSecondStartTime}
              singleSecondEndTime={singleSecondEndTime}
              generatedDates={generatedDates}
              conflicts={conflicts}
              candidateConflictDates={candidateConflictDates}
              onGoToStep={(step) => {
                setWizardStep(step);
                scrollToModalTop();
              }}
              descargarCartaAlCrear={descargarCartaAlCrear}
            />
          )}

          {/* Non-blocking Form Feedback Banner (D4 & D9) */}
          {formFeedback && (
            <div
              id="modal-form-feedback-banner"
              className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-semibold animate-fadeIn ${
                formFeedback.type === 'error'
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : formFeedback.type === 'warning'
                  ? 'bg-amber-50 border-amber-300 text-amber-900'
                  : formFeedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : 'bg-blue-50 border-blue-300 text-blue-900'
              }`}
            >
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setFormFeedback(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Cerrar mensaje"
              >
                ✕
              </button>
            </div>
          )}

          {/* Buttons Footer */}
          <ReservationModalFooter
            replacementMode={Boolean(replacementSource)}
            editingReservation={editingReservation}
            isDuplicating={isDuplicating}
            canModifyReservation={canModifyReservation}
            handleDuplicateReservation={handleDuplicateReservation}
            handleDeleteFromModal={handleDeleteFromModal}
            hasDeleteHandler={Boolean(onDelete)}
            isAutosaving={isAutosaving}
            autosaveLastSavedAt={autosaveLastSavedAt}
            formData={formData}
            setFormData={setFormData}
            setDescargarCartaAlCrear={setDescargarCartaAlCrear}
            setShowCommitmentLetterModal={setShowCommitmentLetterModal}
            isWizardMode={isWizardMode}
            wizardStep={wizardStep}
            setWizardStep={setWizardStep}
            scrollToModalTop={scrollToModalTop}
            onClose={() => { if (!isSubmittingRef.current) onClose(); }}
            validateStep1={validateStep1Activity}
            validateStep2={validateStep2DateTime}
            validateStep3={validateStep3Applicant}
            validateStep4={validateStep4Resources}
            isFormSubmitDisabled={isFormSubmitDisabled || isEditingLoading}
            isEditingExisting={isEditingExisting}
            conflicts={conflicts}
            candidateConflictDates={candidateConflictDates}
            allowConflictOverride={allowConflictOverride}
            isSubmitting={isSubmitting}
            timeValidation={timeValidation}
            enableSingleSecondSpace={enableSingleSecondSpace}
            singleSecondTimeValidation={singleSecondTimeValidation}
            bookingMode={bookingMode}
            generateFullSeries={generateFullSeries}
            specificDates={specificDates}
            generatedDates={generatedDates}
            isStep1Completed={isStep1ActivityCompleted}
            isStep2Completed={isStep2DateTimeCompleted}
            isStep3Completed={isStep3ApplicantCompleted}
            isStep4Completed={isStep4ResourcesCompleted}
          />
          </fieldset>
        </form>
      </div>

      {/* Sub-modals & Overlays (Conflict resolution, Commitment letter, Deletion confirmation) */}
      <ReservationModalDialogs
        showConflictDialog={showConflictDialog && !replacementSource}
        setShowConflictDialog={setShowConflictDialog}
        handleConfirmSaveFromConflictModal={handleConfirmSaveFromConflictModal}
        bookingMode={bookingMode}
        formData={formData}
        isEditingSingleOccurrence={isEditingSingleOccurrence}
        editingReservation={editingReservation}
        enableSingleSecondSpace={enableSingleSecondSpace}
        singleSecondSpace={singleSecondSpace}
        singleSecondStartTime={singleSecondStartTime}
        singleSecondEndTime={singleSecondEndTime}
        specificDates={specificDates}
        dateSchedules={dateSchedules}
        useCustomSchedulesPerDate={useCustomSchedulesPerDate}
        generatedDates={generatedDates}
        daySchedules={daySchedules}
        useCustomSchedulesPerDay={useCustomSchedulesPerDay}
        availableSpaces={availableSpaces}
        allReservations={allReservations}
        excludeReservationIds={excludeReservationIds}
        excludeSeriesId={excludeSeriesId}
        allowConflictOverride={allowConflictOverride}
        setFormData={setFormData}
        handleUpdateSecondSpace={handleUpdateSecondSpace}
        setSpecificDates={setSpecificDates}
        setDateSchedules={setDateSchedules}
        handleConvertToSpecificDates={handleConvertToSpecificDates}
        setAllowConflictOverride={setAllowConflictOverride}
        showCommitmentLetterModal={showCommitmentLetterModal}
        setShowCommitmentLetterModal={setShowCommitmentLetterModal}
        effectiveFormDataForLetter={effectiveFormDataForLetter}
        effectiveSeriesSlotsForLetter={effectiveSeriesSlotsForLetter}
        deleteConfirmModal={deleteConfirmModal}
        setDeleteConfirmModal={setDeleteConfirmModal}
      />
    </ModalOverlay>
  );
};

