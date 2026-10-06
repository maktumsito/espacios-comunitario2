import { toast } from 'sonner';
import { MutableRefObject, useRef } from 'react';
import { format } from 'date-fns';
import {
  Reservation,
  SpaceBlock,
  SpaceInfo,
  UpdateScope,
  BatchUpdateInfo
} from '../types';
import { normalizeSpaceName } from '../data/spacesData';
import { isReservationActiveForAvailability, findMaintenanceBlockConflicts, formatBlockConflictMessage, findReservationConflicts } from '../utils/conflictDetector';
import { getDeletedIds, getLocalCache, saveReservation } from '../services/reservationService';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import {
  isCommitmentLetterEligible,
  downloadCommitmentLetterPdf
} from '../utils/commitmentLetterPdf';
import { validateReservationWithZod } from '../schemas/reservationSchema';
import {
  TimeRangeValidationResult,
  RutValidationResult,
  EmailValidationResult,
  PhoneValidationResult,
  LoanScheduleLimitResult,
  ActivityDescriptionValidationResult
} from '../utils/validationUtils';
import { WEEKDAYS } from '../utils/dateUtils';
import { CustomScheduleSlot, ConflictSavePayload } from '../types';
import { AuthUser } from '../services/authService';
import { filterOutChileanHolidays, verifyHolidayOverrideKey } from '../utils/holidayUtils';
import { getSeriesEditStartDate } from '../utils/recurringEdits';
import { getChileLocalDateString } from '../utils/dateUtils';
import { scheduleSlotsForDate, scopedScheduleSlots, sameScheduleSlot, applyChangedSeriesFields, type ScheduleSlot } from '../utils/recurringSchedule';
import { validateTimeRange, checkLoanScheduleLimit } from '../utils/validationUtils';

export interface SeriesItemSlot {
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  espacio?: string;
}

interface UseReservationSaveHandlerProps {
  scheduleChanged?: boolean;
  initialFormData?: Partial<Reservation>;
  initialReservations?: Reservation[];
  formData: Partial<Reservation>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  isSubmittingRef: MutableRefObject<boolean>;
  isSubmitting: boolean;
  setIsSubmitting: (val: boolean) => void;
  isEditingExisting: boolean;
  canModifyReservation: boolean;
  currentUser: AuthUser | null | undefined;
  bookingMode: 'single' | 'specific' | 'pattern';
  setBookingMode: (mode: 'single' | 'specific' | 'pattern') => void;
  specificDates: string[];
  setSpecificDates: (dates: string[]) => void;
  dateSchedules: Record<string, CustomScheduleSlot>;
  setDateSchedules: React.Dispatch<React.SetStateAction<Record<string, CustomScheduleSlot>>>;
  useCustomSchedulesPerDate: boolean;
  setUseCustomSchedulesPerDate: (val: boolean) => void;
  singleSecondSpace: string;
  setSingleSecondSpace: (val: string) => void;
  singleSecondStartTime: string;
  setSingleSecondStartTime: (val: string) => void;
  singleSecondEndTime: string;
  setSingleSecondEndTime: (val: string) => void;
  enableSingleSecondSpace: boolean;
  isEditingSingleOccurrence: boolean;
  descriptionValidation: ActivityDescriptionValidationResult;
  timeValidation: TimeRangeValidationResult;
  singleSecondTimeValidation: { isValid: boolean; error?: string };
  rutValidation: RutValidationResult;
  emailValidation: EmailValidationResult;
  phoneValidation: PhoneValidationResult;
  loanScheduleCheck: LoanScheduleLimitResult;
  isExtensionAuthorized: boolean;
  specificHolidayAnalysis: {
    validDates: readonly string[] | string[];
    omittedHolidays: ReadonlyArray<{ date: string; holiday: { name: string } }>;
  };
  includeHolidaysInSeries: boolean;
  isHolidayAuthorized: boolean;
  holidayOverrideKey: string;
  patternHolidayAnalysis: {
    validDates: readonly string[] | string[];
    omittedHolidays: ReadonlyArray<{ date: string; holiday: { name: string } }>;
  };
  generatedDates: readonly string[] | string[];
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  rawPatternDates: readonly string[] | string[];
  singleDateHolidayInfo: { name: string } | null;
  selectedDays: number[];
  useCustomSchedulesPerDay: boolean;
  daySchedules: Record<number, CustomScheduleSlot>;
  spaceBlocks: readonly SpaceBlock[] | SpaceBlock[];
  availableSpaces: SpaceInfo[];
  allReservations: Reservation[];
  excludeReservationIds: string[];
  excludeSeriesId?: string;
  allowConflictOverride: boolean;
  setAllowConflictOverride: (val: boolean) => void;
  setShowConflictDialog: (val: boolean) => void;
  generateFullSeries: boolean;
  editingReservation?: Reservation | null;
  isDuplicating?: boolean;
  isEditingRecurring: boolean;
  updateScope: UpdateScope;
  affectedReservations: Reservation[];
  rangeStartDate: string;
  rangeEndDate: string;
  descargarCartaAlCrear: boolean;
  effectiveSeriesSlotsForLetter?: Array<{ fecha: string; horaInicio: string; horaFin: string; espacio: string }>;
  onSave: (
    reserva: Reservation,
    isSeries?: boolean,
    seriesDates?: (string | SeriesItemSlot)[],
    isBatchUpdate?: boolean,
    batchInfo?: BatchUpdateInfo,
    allowConflictOverride?: boolean
  ) => void | boolean | Promise<void | boolean>;
  clearDraft: () => void;
  onClose: () => void;
  showFormFeedback: (message: string, type?: 'error' | 'warning' | 'info' | 'success') => void;
}

export function useReservationSaveHandler({
  scheduleChanged = true,
  initialFormData,
  initialReservations,
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
  isDuplicating = false,
  isEditingRecurring,
  updateScope,
  affectedReservations,
  rangeStartDate,
  rangeEndDate,
  descargarCartaAlCrear,
  effectiveSeriesSlotsForLetter,
  onSave,
  clearDraft,
  onClose,
  showFormFeedback
}: UseReservationSaveHandlerProps) {
  const newOccurrenceIds = useRef(new Map<string, string>());
  const executeSave = async (
    forceConflictOverride: boolean = false,
    overridesPayload?: ConflictSavePayload
  ) => {
    if (isSubmittingRef.current || isSubmitting) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {

    const abortWithFeedback = (msg: string, type: 'error' | 'warning' = 'error') => {
      showFormFeedback(msg, type);
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    };

    if (isEditingExisting && !canModifyReservation) {
      abortWithFeedback(
        'Permiso denegado: Solo usuarios con perfil Administrador o Coordinador están autorizados para modificar reservas existentes.'
      );
      return;
    }

    // Sync state if overrides were passed directly from the conflict resolution wizard
    if (overridesPayload?.formDataUpdates) {
      setFormData((prev) => ({ ...prev, ...overridesPayload.formDataUpdates }));
    }
    if (overridesPayload?.specificDates) {
      setSpecificDates(overridesPayload.specificDates);
    }
    if (overridesPayload?.dateSchedules) {
      setDateSchedules(overridesPayload.dateSchedules);
    }
    if (overridesPayload?.bookingMode) {
      setBookingMode(overridesPayload.bookingMode);
    }
    if (overridesPayload?.useCustomSchedulesPerDate !== undefined) {
      setUseCustomSchedulesPerDate(overridesPayload.useCustomSchedulesPerDate);
    }
    if (overridesPayload?.secondSpaceUpdates) {
      if (overridesPayload.secondSpaceUpdates.space !== undefined)
        setSingleSecondSpace(overridesPayload.secondSpaceUpdates.space);
      if (overridesPayload.secondSpaceUpdates.startTime !== undefined)
        setSingleSecondStartTime(overridesPayload.secondSpaceUpdates.startTime);
      if (overridesPayload.secondSpaceUpdates.endTime !== undefined)
        setSingleSecondEndTime(overridesPayload.secondSpaceUpdates.endTime);
    }

    const effectiveFormData: Partial<Reservation> = {
      ...formData,
      ...(overridesPayload?.formDataUpdates || {})
    };
    const effectiveBookingMode = overridesPayload?.bookingMode || bookingMode;
    const today = getChileLocalDateString();
    if (isEditingRecurring && editingReservation && updateScope === 'single' && editingReservation.fecha < today) {
      abortWithFeedback('Esta sesión ya pasó. Elige un alcance hacia adelante para mantener intacto el historial.');
      return;
    }
    const editCutoff = isEditingRecurring && editingReservation ? getSeriesEditStartDate(updateScope, editingReservation.fecha, today) : '';
    const inEditScope = (date: string) => {
      if (!isEditingRecurring || updateScope === 'single') return true;
      if (date < editCutoff) return false;
      if (updateScope === 'dateRange') return Boolean(rangeStartDate && rangeEndDate) && date >= (rangeStartDate < rangeEndDate ? rangeStartDate : rangeEndDate) && date <= (rangeStartDate > rangeEndDate ? rangeStartDate : rangeEndDate);
      if (updateScope === 'selected') return affectedReservations.some(r => r.fecha === date);
      return true;
    };
    const effectiveSpecificDates: string[] = (overridesPayload?.specificDates
      ? [...overridesPayload.specificDates]
      : [...specificDates]).filter(inEditScope);
    const selectedDateHolidayAnalysis = overridesPayload?.specificDates || isEditingRecurring
      ? filterOutChileanHolidays(effectiveSpecificDates)
      : specificHolidayAnalysis;
    const effectiveDateSchedules: Record<string, CustomScheduleSlot> = overridesPayload?.dateSchedules
      ? { ...overridesPayload.dateSchedules }
      : { ...dateSchedules };
    const effectiveUseCustomSchedulesPerDate =
      overridesPayload?.useCustomSchedulesPerDate ?? useCustomSchedulesPerDate;
    const effectiveSecondSpace =
      overridesPayload?.secondSpaceUpdates?.space ?? singleSecondSpace;
    const effectiveSecondStartTime =
      overridesPayload?.secondSpaceUpdates?.startTime ?? singleSecondStartTime;
    const effectiveSecondEndTime =
      overridesPayload?.secondSpaceUpdates?.endTime ?? singleSecondEndTime;
    const effectiveRawPatternDates = rawPatternDates.filter(inEditScope);
    const effectivePatternHolidayAnalysis = isEditingRecurring ? filterOutChileanHolidays(effectiveRawPatternDates) : patternHolidayAnalysis;

    if (!effectiveFormData.responsable?.trim()) {
      abortWithFeedback('Por favor completa el nombre del responsable de la actividad.');
      return;
    }

    if (!effectiveFormData.tipoActividad) {
      abortWithFeedback('Por favor selecciona el tipo de actividad.');
      return;
    }

    const isSpecific = !isEditingSingleOccurrence && effectiveBookingMode === 'specific';
    const isPattern = !isEditingSingleOccurrence && effectiveBookingMode === 'pattern';
    const isRecurring = !isEditingSingleOccurrence && (isSpecific || isPattern);

    // Initial slot fallback if specific dates with custom schedules
    const firstSpecDate = effectiveSpecificDates[0];
    const initialSlot =
      isSpecific && effectiveUseCustomSchedulesPerDate && firstSpecDate && effectiveDateSchedules[firstSpecDate]
        ? effectiveDateSchedules[firstSpecDate]
        : undefined;

    const baseStart = initialSlot?.horaInicio || effectiveFormData.horaInicio;
    const baseEnd = initialSlot?.horaFin || effectiveFormData.horaFin;
    const baseSpace = initialSlot?.espacio || effectiveFormData.espacio;

    if (!baseStart || !baseEnd || !baseSpace) {
      abortWithFeedback('Por favor completa horarios y espacio.');
      return;
    }

    if (!descriptionValidation.isValid) {
      abortWithFeedback(
        `⚠️ Nombre de la Actividad: ${descriptionValidation.error || 'Por favor ingresa un nombre válido.'}`
      );
      return;
    }

    const hasScheduleOverride = Boolean(overridesPayload && (overridesPayload.bookingMode || overridesPayload.specificDates ||
      overridesPayload.dateSchedules || overridesPayload.secondSpaceUpdates || overridesPayload.useCustomSchedulesPerDate !== undefined ||
      ['fecha','espacio','horaInicio','horaFin','terminaDiaSiguiente'].some(key => key in (overridesPayload.formDataUpdates || {}))));
    const metadataOnly = isEditingRecurring && !scheduleChanged && !hasScheduleOverride && updateScope !== 'single';
    if (!timeValidation.isValid && !metadataOnly) {
      abortWithFeedback(
        `⚠️ Error en horario: ${timeValidation.error || 'La hora de término debe ser posterior a la hora de inicio.'}`
      );
      return;
    }

    if (enableSingleSecondSpace && !singleSecondTimeValidation.isValid) {
      abortWithFeedback(
        `⚠️ Error en horario del 2° espacio: ${singleSecondTimeValidation.error || 'La hora de término del 2° espacio debe ser posterior a la de inicio.'}`
      );
      return;
    }

    if (!rutValidation.isValid) {
      abortWithFeedback(`⚠️ R.U.T. inválido: ${rutValidation.error}`);
      return;
    }

    if (!emailValidation.isValid) {
      abortWithFeedback(`⚠️ Correo electrónico inválido: ${emailValidation.error}`);
      return;
    }

    if (!phoneValidation.isValid) {
      abortWithFeedback(`⚠️ Teléfono de contacto inválido: ${phoneValidation.error}`);
      return;
    }

    // Comprehensive Zod schema validation
    const candidatePayload = {
      ...effectiveFormData,
      id: effectiveFormData.id || editingReservation?.id || 'temp-id',
      fecha: effectiveFormData.fecha || editingReservation?.fecha || '2026-01-01',
      horaInicio: baseStart,
      horaFin: baseEnd,
      espacio: baseSpace,
      responsable: effectiveFormData.responsable || '',
      tipoActividad: effectiveFormData.tipoActividad || 'Comunitario',
      descripcion: effectiveFormData.descripcion || 'Actividad'
    };
    const zodValidation = validateReservationWithZod(candidatePayload);
    if (!zodValidation.success && zodValidation.firstError) {
      abortWithFeedback(`⚠️ ${zodValidation.firstError}`);
      return;
    }

    if (loanScheduleCheck.requiresAuthorization && !metadataOnly) {
      if (!isExtensionAuthorized) {
        abortWithFeedback(
          '⚠️ Autorización requerida: La actividad opera en horario extendido (antes de las 08:30 hrs o después de las 22:00 hrs). Ingresa la clave oficial "ccd2026" para autorizarla.'
        );
        return;
      }
    }

    let finalDates: string[] = [];
    if (metadataOnly || isEditingRecurring && updateScope !== 'single' && !isRecurring) {
      finalDates = [...new Set(affectedReservations.filter(r => inEditScope(r.fecha)).map(r => r.fecha))];
    } else if (isSpecific) {
      if (effectiveSpecificDates.length === 0) {
        abortWithFeedback('Por favor selecciona al menos una fecha específica.');
        return;
      }

      // Check holidays in specific dates
      if (selectedDateHolidayAnalysis.omittedHolidays.length > 0) {
        if (includeHolidaysInSeries || isHolidayAuthorized) {
          if (!isHolidayAuthorized) {
            abortWithFeedback(
              '🚫 Para incluir reservas en días feriados de Chile, debes ingresar la clave de autorización especial "CCD" correcta.'
            );
            return;
          }
          finalDates = effectiveSpecificDates;
        } else {
          if (selectedDateHolidayAnalysis.validDates.length === 0) {
            abortWithFeedback(
              `🚫 Todas las fechas seleccionadas son días feriados en Chile (${selectedDateHolidayAnalysis.omittedHolidays.map((h) => `${formatDateDDMMYYYY(h.date)}: ${h.holiday.name}`).join(', ')}).\n\nLos feriados están bloqueados por defecto. Para autorizarlos debes ingresar la clave especial CCD.`
            );
            return;
          }
          finalDates = [...selectedDateHolidayAnalysis.validDates];
        }
      } else {
        finalDates = effectiveSpecificDates;
      }
    } else if (isPattern) {
      if (includeHolidaysInSeries && !isHolidayAuthorized && effectivePatternHolidayAnalysis.omittedHolidays.length > 0) {
        abortWithFeedback(
          '🚫 Para incluir los días feriados en la serie semanal, debes ingresar la clave de autorización especial "CCD" correcta.'
        );
        return;
      }

      if (generatedDates.filter(inEditScope).length === 0) {
        if (recurrenceEndDate < recurrenceStartDate) {
          abortWithFeedback('🚫 Error: La Fecha Término de la serie no puede ser anterior a la Fecha Inicio.');
        } else if (
          effectiveRawPatternDates.length > 0 &&
          effectivePatternHolidayAnalysis.omittedHolidays.length === effectiveRawPatternDates.length
        ) {
          abortWithFeedback(
            '🚫 Todas las fechas coincidentes con el patrón son feriados en Chile y fueron omitidas. Para autorizarlas debes ingresar la clave especial CCD.'
          );
        } else {
          abortWithFeedback(
            '🚫 No hay sesiones válidas coincidentes con el patrón de días y rango seleccionado (0 sesiones calculadas).'
          );
        }
        return;
      }
      finalDates = generatedDates.filter(inEditScope);
    } else {
      const targetSingleDate = effectiveFormData.fecha || editingReservation?.fecha;

      if (!targetSingleDate) {
        abortWithFeedback('Por favor indica la fecha de la reserva.');
        return;
      }

      // Check single date holiday
      const existingHolidayAuthorization = !isDuplicating && editingReservation?.fecha === targetSingleDate &&
        verifyHolidayOverrideKey(editingReservation.claveAutorizacionFeriado || '');
      if (singleDateHolidayInfo && !isHolidayAuthorized && !existingHolidayAuthorization) {
        abortWithFeedback(
          `🚫 FECHA EN DÍA FERIADO NACIONAL: El día ${formatDateDDMMYYYY(targetSingleDate)} es feriado (${singleDateHolidayInfo.name}). Para autorizarla debes ingresar la clave CCD.`
        );
        return;
      }

      finalDates = [targetSingleDate];
    }

    finalDates = [...new Set(finalDates)];
    const scheduleOptions = { mode: isEditingSingleOccurrence ? 'single' as const : effectiveBookingMode,
      base: effectiveFormData, customDates: effectiveDateSchedules, customDays: daySchedules,
      useCustomDates: effectiveUseCustomSchedulesPerDate, useCustomDays: useCustomSchedulesPerDay,
      secondEnabled: !isEditingSingleOccurrence && enableSingleSecondSpace,
      secondSpace: effectiveSecondSpace, secondStart: effectiveSecondStartTime, secondEnd: effectiveSecondEndTime };
    let plannedSlots: ScheduleSlot[] = metadataOnly
      ? affectedReservations.filter(r => inEditScope(r.fecha)).map(r => ({fecha:r.fecha,espacio:r.espacio,horaInicio:r.horaInicio,horaFin:r.horaFin,terminaDiaSiguiente:r.terminaDiaSiguiente,sourceId:r.id}))
      : finalDates.flatMap(date => scheduleSlotsForDate(date, scheduleOptions));
    if (editingReservation && !isDuplicating && (!isEditingRecurring || updateScope === 'single') && plannedSlots.length) {
      plannedSlots[0].sourceId = editingReservation.id;
    }
    if (isEditingRecurring && updateScope !== 'single' && !isRecurring && !metadataOnly) plannedSlots=affectedReservations.filter(r=>inEditScope(r.fecha)).map(r=>({
      ...scheduleSlotsForDate(r.fecha,scheduleOptions)[0],sourceId:r.id,
    }));
    if (isEditingRecurring && editingReservation && updateScope !== 'single') plannedSlots = scopedScheduleSlots(plannedSlots, {
      scope:updateScope,source:editingReservation,history:allReservations,today,rangeStartDate,rangeEndDate,
      selectedIds:new Set(affectedReservations.map(r=>r.id)),
    });
    if (!plannedSlots.length) { abortWithFeedback('No hay sesiones dentro del alcance seleccionado.'); return; }
    for (const slot of plannedSlots) {
      if (!slot.espacio) { abortWithFeedback(`Selecciona un espacio para el ${formatDateDDMMYYYY(slot.fecha)}.`); return; }
      const timing = validateTimeRange(slot.horaInicio,slot.horaFin,Boolean(slot.terminaDiaSiguiente));
      if (!timing.isValid) { abortWithFeedback(`Horario inválido el ${formatDateDDMMYYYY(slot.fecha)}: ${timing.error}`); return; }
      const original = allReservations.find(r=>r.id===slot.sourceId);
      const alreadyAuthorized = original && sameScheduleSlot(original,slot) && original.horarioExtendidoAutorizado;
      if (checkLoanScheduleLimit(slot.horaInicio,slot.horaFin,Boolean(slot.terminaDiaSiguiente)).requiresAuthorization && !isExtensionAuthorized && !alreadyAuthorized) {
        abortWithFeedback(`El horario del ${formatDateDDMMYYYY(slot.fecha)} requiere autorización de horario extendido.`); return;
      }
    }
    const validationCandidates: Reservation[] = plannedSlots.map((slot,index)=>({...effectiveFormData,...slot,id:slot.sourceId || `PREVIEW_${index}`,estado:'activa'} as Reservation));
    const blocks = findMaintenanceBlockConflicts(validationCandidates,spaceBlocks);
    if (blocks.length) { abortWithFeedback(formatBlockConflictMessage(blocks[0])); return; }
    if (!forceConflictOverride && !allowConflictOverride && findReservationConflicts(validationCandidates,allReservations,{
      excludeReservationIds,excludeSeriesId,allowCandidateSelfConflicts:false,
    }).length) { setShowConflictDialog(true); return; }

    const normalizedSpace = normalizeSpaceName(effectiveFormData.espacio || baseSpace || 'Espacio');

    const diasSemanaStr = isPattern
      ? selectedDays
          .map((d) => WEEKDAYS.find((w) => w.dayNum === d)?.key || '')
          .filter(Boolean)
          .join(',')
      : '';

    const seriesId = `SER_${effectiveFormData.id || editingReservation?.id || 'draft'}`.slice(0,128);

    // Validation and persistence share the exact same scoped schedule.
    const finalSeriesPayload: (string | SeriesItemSlot)[] = plannedSlots;

    const firstDate =
      isEditingSingleOccurrence && effectiveFormData.fecha
        ? effectiveFormData.fecha
        : finalDates.length > 0
        ? finalDates[0]
        : effectiveFormData.fecha || editingReservation?.fecha || '';

    const firstSlot =
      finalSeriesPayload.length > 0 && typeof finalSeriesPayload[0] !== 'string' && !isEditingSingleOccurrence
        ? (finalSeriesPayload[0] as SeriesItemSlot)
        : {
            fecha: firstDate,
            horaInicio: effectiveFormData.horaInicio || '10:00',
            horaFin: effectiveFormData.horaFin || '11:00',
            espacio: normalizedSpace
          };

    const isSingleMultiSpace = enableSingleSecondSpace && !isRecurring && (!editingReservation || isDuplicating);
    const isMultiEntry = isRecurring && !isEditingSingleOccurrence;
    const totalSlotsGenerated = isEditingSingleOccurrence ? 1 : finalSeriesPayload.length;

    const finalReserva: Reservation = {
      id:
        isEditingSingleOccurrence && editingReservation
          ? editingReservation.id
          : effectiveFormData.id || `RSV_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      fecha: firstDate,
      horaInicio: firstSlot.horaInicio || effectiveFormData.horaInicio || '10:00',
      horaFin: firstSlot.horaFin || effectiveFormData.horaFin || '11:00',
      espacio: firstSlot.espacio || normalizedSpace,
      responsable: effectiveFormData.responsable || 'No especificado',
      telefonoContacto: effectiveFormData.telefonoContacto || '',
      emailContacto: effectiveFormData.emailContacto || '',
      tipoActividad: effectiveFormData.tipoActividad || 'OTROS',
      tipoPrestamo: effectiveFormData.tipoPrestamo || '',
      descripcion: effectiveFormData.descripcion || '',
      actividadRecurrente: isEditingSingleOccurrence
        ? editingReservation?.actividadRecurrente || 'No'
        : isMultiEntry
        ? 'Sí'
        : 'No',
      comentarios: effectiveFormData.comentarios || '',
      serieRecurrente: isEditingSingleOccurrence
        ? editingReservation?.serieRecurrente || editingReservation?.recurrenteId || ''
        : isMultiEntry
        ? effectiveFormData.serieRecurrente || seriesId
        : undefined,
      recurrenteId: isEditingSingleOccurrence
        ? editingReservation?.serieRecurrente || editingReservation?.recurrenteId || ''
        : isMultiEntry
        ? effectiveFormData.recurrenteId || seriesId
        : undefined,
      indiceEnSerie: isEditingSingleOccurrence
        ? editingReservation?.indiceEnSerie || 1
        : effectiveFormData.indiceEnSerie || 1,
      totalEnSerie: isEditingSingleOccurrence
        ? editingReservation?.totalEnSerie || 1
        : isMultiEntry && generateFullSeries
        ? totalSlotsGenerated
        : isSingleMultiSpace
        ? 2
        : effectiveFormData.totalEnSerie || 1,
      tipoRecurrencia: isEditingSingleOccurrence
        ? editingReservation?.tipoRecurrencia || ''
        : isSpecific
        ? 'especificas'
        : isPattern
        ? 'semanal'
        : enableSingleSecondSpace
        ? 'doble_espacio'
        : '',
      diasSemana: isEditingSingleOccurrence ? editingReservation?.diasSemana || '' : diasSemanaStr,
      fechaInicioRecurrencia: isEditingSingleOccurrence
        ? editingReservation?.fechaInicioRecurrencia || editingReservation?.fecha
        : isRecurring && finalDates.length > 0
        ? finalDates[0]
        : effectiveFormData.fecha,
      fechaFinRecurrencia: isEditingSingleOccurrence
        ? editingReservation?.fechaFinRecurrencia || editingReservation?.fecha
        : isRecurring && finalDates.length > 0
        ? finalDates[finalDates.length - 1]
        : effectiveFormData.fecha,
      cantidadParticipantes: Number.isFinite(Number(effectiveFormData.cantidadParticipantes)) ? Number(effectiveFormData.cantidadParticipantes) : 10,
      realizada: effectiveFormData.realizada || 'No',
      rut: effectiveFormData.rut || '',
      domicilio: effectiveFormData.domicilio || '',
      importante: effectiveFormData.importante || 'No',
      requiereCartaCompromiso:
        isCommitmentLetterEligible(effectiveFormData.tipoActividad, effectiveFormData.tipoPrestamo) ||
        Boolean(effectiveFormData.requiereCartaCompromiso),
      descargarCartaAlCrear:
        (isCommitmentLetterEligible(effectiveFormData.tipoActividad, effectiveFormData.tipoPrestamo) ||
          Boolean(effectiveFormData.requiereCartaCompromiso)) &&
        descargarCartaAlCrear,
      cartaCompromisoDescargada: effectiveFormData.cartaCompromisoDescargada || false,
      cartaCompromisoAdjunta: effectiveFormData.cartaCompromisoAdjunta,
      equipamientoSolicitado: effectiveFormData.equipamientoSolicitado || [],
      terminaDiaSiguiente: Boolean(effectiveFormData.terminaDiaSiguiente),
      horarioExtendidoAutorizado: loanScheduleCheck.requiresAuthorization
        ? true
        : Boolean(effectiveFormData.horarioExtendidoAutorizado),
      claveAutorizacionFeriado: isHolidayAuthorized ? holidayOverrideKey : effectiveFormData.claveAutorizacionFeriado,
      claveAutorizacion: loanScheduleCheck.requiresAuthorization
        ? 'ccd2026'
        : effectiveFormData.claveAutorizacion || '',
      autorizadoPor: loanScheduleCheck.requiresAuthorization
        ? currentUser?.name || currentUser?.username || 'Administrador/Coordinador'
        : effectiveFormData.autorizadoPor || '',
      version: effectiveFormData.version ?? editingReservation?.version ?? 0,
      updatedAt: new Date().toISOString()
    };

    // Auto download Commitment Letter PDF asynchronously if eligible or activated and ticked
    const isLetterActiveForDownload =
      isCommitmentLetterEligible(effectiveFormData.tipoActividad, effectiveFormData.tipoPrestamo) ||
      Boolean(effectiveFormData.requiereCartaCompromiso);


    try {
      if (editingReservation && !isDuplicating) {
        // Converting an individual booking is a series update, not an edit of
        // one occurrence. Its existing ID/version must participate in the batch.
        const isConvertingToSeries = !isEditingRecurring && isRecurring;
        if (!isConvertingToSeries && (!isEditingRecurring || updateScope === 'single')) {
          // SINGLE RESERVATION OR SINGLE OCCURRENCE
          const updatedReserva: Reservation = {
            ...editingReservation,
            ...finalReserva,
            id: editingReservation.id,
            fecha: finalReserva.fecha,
            horaInicio: finalReserva.horaInicio,
            horaFin: finalReserva.horaFin,
            espacio: finalReserva.espacio,
            tipoActividad: finalReserva.tipoActividad,
            descripcion: finalReserva.descripcion,
            responsable: finalReserva.responsable,
            telefonoContacto: finalReserva.telefonoContacto,
            emailContacto: finalReserva.emailContacto,
            tipoPrestamo: finalReserva.tipoPrestamo,
            cantidadParticipantes: finalReserva.cantidadParticipantes,
            equipamientoSolicitado: finalReserva.equipamientoSolicitado,
            importante: finalReserva.importante,
            comentarios: finalReserva.comentarios,
            rut: finalReserva.rut,
            domicilio: finalReserva.domicilio,
            requiereCartaCompromiso: finalReserva.requiereCartaCompromiso,
            cartaCompromisoDescargada: finalReserva.cartaCompromisoDescargada,
            cartaCompromisoAdjunta: finalReserva.cartaCompromisoAdjunta,
            realizada: finalReserva.realizada,
            terminaDiaSiguiente: finalReserva.terminaDiaSiguiente,
            horarioExtendidoAutorizado: finalReserva.horarioExtendidoAutorizado,
            claveAutorizacion: finalReserva.claveAutorizacion,
            claveAutorizacionFeriado: finalReserva.claveAutorizacionFeriado,
            autorizadoPor: finalReserva.autorizadoPor,
            serieRecurrente: editingReservation.serieRecurrente,
            recurrenteId: editingReservation.recurrenteId,
            indiceEnSerie: editingReservation.indiceEnSerie,
            totalEnSerie: editingReservation.totalEnSerie,
            tipoRecurrencia: editingReservation.tipoRecurrencia,
            diasSemana: editingReservation.diasSemana,
            fechaInicioRecurrencia: editingReservation.fechaInicioRecurrencia,
            fechaFinRecurrencia: editingReservation.fechaFinRecurrencia,
            editadoPor: currentUser?.name || currentUser?.username || 'Usuario',
            fechaEdicion: format(new Date(), 'dd/MM/yyyy HH:mm:ss'),
            version: effectiveFormData.version ?? editingReservation?.version ?? 0,
            updatedAt: new Date().toISOString()
          };

          if (sameScheduleSlot(editingReservation, updatedReserva)) {
            updatedReserva.horarioExtendidoAutorizado = editingReservation.horarioExtendidoAutorizado;
            updatedReserva.claveAutorizacion = editingReservation.claveAutorizacion;
            updatedReserva.autorizadoPor = editingReservation.autorizadoPor;
          }
          const singleResult = await Promise.resolve(
            onSave(updatedReserva, false, undefined, false, {
              scope: 'single',
              updatedReservations: [updatedReserva],
              affectedIds: [updatedReserva.id],
              description: `Modificada reserva individual '${updatedReserva.tipoActividad}' de ${updatedReserva.responsable} (${formatDateDDMMYYYY(updatedReserva.fecha)})`
            }, forceConflictOverride || allowConflictOverride)
          );
          if (singleResult === false) {
            return;
          }
        } else {
          // MULTI-OCCURRENCE / SERIES EXPANSION UPDATE (future, series, dateRange, selected)
          const deletedSet = getDeletedIds();
          const initialById = new Map((initialReservations || []).map(r=>[r.id,r]));
          const cleanAffected = (isConvertingToSeries ? [editingReservation] : affectedReservations.map(r=>initialById.get(r.id)||r)).filter(
            (orig) => (isConvertingToSeries || inEditScope(orig.fecha)) && !deletedSet.has(orig.id) && orig.estado !== 'eliminada' && isReservationActiveForAvailability(orig)
          );

          if (cleanAffected.length === 0 && (!finalDates || finalDates.length === 0)) {
            abortWithFeedback('No se encontraron reservas activas para actualizar en la serie seleccionada.');
            return;
          }

          const seriesId =
            editingReservation.serieRecurrente ||
            editingReservation.recurrenteId ||
            cleanAffected[0]?.serieRecurrente ||
            cleanAffected[0]?.recurrenteId ||
            `SER_${effectiveFormData.id || editingReservation?.id}`.slice(0,128);

          const baseRef = cleanAffected[0] || editingReservation;

          interface NormalizedSlot {
            fecha: string;
            horaInicio: string;
            horaFin: string;
            espacio: string;
            sourceId?: string;
            terminaDiaSiguiente?: boolean;
          }

          // Target slots from explicit series payload (handles date expansion, per-day / per-date schedules, second space)
          const targetSlots: NormalizedSlot[] = ((isRecurring || isEditingRecurring) && finalSeriesPayload.length > 0)
            ? finalSeriesPayload.map((item) => {
                if (typeof item === 'string') {
                  return {
                    fecha: item,
                    horaInicio: effectiveFormData.horaInicio || '10:00',
                    horaFin: effectiveFormData.horaFin || '11:00',
                    espacio: normalizedSpace
                  };
                }
                return {
                  fecha: item.fecha,
                  horaInicio: item.horaInicio || effectiveFormData.horaInicio || '10:00',
                  horaFin: item.horaFin || effectiveFormData.horaFin || '11:00',
                  espacio: item.espacio || normalizedSpace,
                  sourceId: (item as ScheduleSlot).sourceId,
                  terminaDiaSiguiente: (item as ScheduleSlot).terminaDiaSiguiente
                };
              })
            : cleanAffected.map((orig) => ({
                fecha: orig.fecha,
                horaInicio: effectiveFormData.horaInicio || orig.horaInicio,
                horaFin: effectiveFormData.horaFin || orig.horaFin,
                espacio: normalizedSpace || orig.espacio
              }));

          const existingByDateAndSpace = new Map<string, Reservation[]>();
          cleanAffected.forEach((res) => {
            const key = `${res.fecha}_${res.espacio.trim().toUpperCase()}`;
            const list = existingByDateAndSpace.get(key) || [];
            list.push(res);
            existingByDateAndSpace.set(key, list);
          });

          const existingByDateOnly = new Map<string, Reservation[]>();
          cleanAffected.forEach((res) => {
            const list = existingByDateOnly.get(res.fecha) || [];
            list.push(res);
            existingByDateOnly.set(res.fecha, list);
          });

          const usedExistingIds = new Set<string>();
          const updatedList: Reservation[] = [];
          const originalDateRetained = targetSlots.some(slot => slot.fecha === editingReservation.fecha);

          for (let sIdx = 0; sIdx < targetSlots.length; sIdx++) {
            const slot = targetSlots[sIdx];
            const key = `${slot.fecha}_${slot.espacio.trim().toUpperCase()}`;
            let match = slot.sourceId ? cleanAffected.find(r=>r.id===slot.sourceId) : undefined;
            if (!match) match = existingByDateAndSpace.get(key)?.find((r) => !usedExistingIds.has(r.id) && r.horaInicio===slot.horaInicio && r.horaFin===slot.horaFin);
            if (!match) match = existingByDateAndSpace.get(key)?.find((r) => !usedExistingIds.has(r.id));
            if (!match) {
              match = existingByDateOnly.get(slot.fecha)?.find((r) => !usedExistingIds.has(r.id));
            }
            if (!match && isConvertingToSeries && !originalDateRetained && !usedExistingIds.has(editingReservation.id)) {
              match = cleanAffected.find(reservation => reservation.id === editingReservation.id);
            }

            const slotEquip = effectiveFormData.equipamientoSolicitado
              ? JSON.parse(JSON.stringify(effectiveFormData.equipamientoSolicitado))
              : (baseRef.equipamientoSolicitado ? JSON.parse(JSON.stringify(baseRef.equipamientoSolicitado)) : []);

            if (match) {
              usedExistingIds.add(match.id);
              updatedList.push({
                ...match,
                fecha: slot.fecha,
                horaInicio: slot.horaInicio || effectiveFormData.horaInicio || match.horaInicio,
                horaFin: slot.horaFin || effectiveFormData.horaFin || match.horaFin,
                espacio: slot.espacio || normalizedSpace || match.espacio,
                tipoActividad: effectiveFormData.tipoActividad || match.tipoActividad,
                descripcion:
                  effectiveFormData.descripcion !== undefined ? effectiveFormData.descripcion : match.descripcion,
                responsable: effectiveFormData.responsable || match.responsable,
                telefonoContacto:
                  effectiveFormData.telefonoContacto !== undefined
                    ? effectiveFormData.telefonoContacto
                    : match.telefonoContacto,
                emailContacto:
                  effectiveFormData.emailContacto !== undefined
                    ? effectiveFormData.emailContacto
                    : match.emailContacto,
                tipoPrestamo: effectiveFormData.tipoPrestamo || match.tipoPrestamo,
                cantidadParticipantes:
                  Number.isFinite(Number(effectiveFormData.cantidadParticipantes)) ? Number(effectiveFormData.cantidadParticipantes) : match.cantidadParticipantes ?? 10,
                equipamientoSolicitado: slotEquip,
                importante: effectiveFormData.importante || match.importante,
                comentarios:
                  effectiveFormData.comentarios !== undefined ? effectiveFormData.comentarios : match.comentarios,
                rut: effectiveFormData.rut !== undefined ? effectiveFormData.rut : match.rut,
                domicilio: effectiveFormData.domicilio !== undefined ? effectiveFormData.domicilio : match.domicilio,
                requiereCartaCompromiso:
                  isCommitmentLetterEligible(effectiveFormData.tipoActividad, effectiveFormData.tipoPrestamo) ||
                  Boolean(effectiveFormData.requiereCartaCompromiso),
                realizada: effectiveFormData.realizada || match.realizada,
                terminaDiaSiguiente: Boolean(slot.terminaDiaSiguiente),
                horarioExtendidoAutorizado: loanScheduleCheck.requiresAuthorization
                  ? true
                  : Boolean(effectiveFormData.horarioExtendidoAutorizado),
                claveAutorizacionFeriado: finalReserva.claveAutorizacionFeriado,
                claveAutorizacion: loanScheduleCheck.requiresAuthorization
                  ? 'ccd2026'
                  : effectiveFormData.claveAutorizacion || match.claveAutorizacion || '',
                autorizadoPor: loanScheduleCheck.requiresAuthorization
                  ? currentUser?.name || currentUser?.username || 'Administrador/Coordinador'
                  : effectiveFormData.autorizadoPor || match.autorizadoPor || '',
                actividadRecurrente: 'Sí',
                serieRecurrente: seriesId,
                recurrenteId: seriesId,
                tipoRecurrencia: isSpecific ? 'especificas' : 'semanal',
                diasSemana: diasSemanaStr,
                fechaInicioRecurrencia: isConvertingToSeries ? finalDates[0] : recurrenceStartDate || finalDates[0] || match.fecha,
                fechaFinRecurrencia: isConvertingToSeries ? finalDates[finalDates.length - 1] : recurrenceEndDate || finalDates[finalDates.length - 1] || match.fecha,
                editadoPor: currentUser?.name || currentUser?.username || 'Usuario',
                fechaEdicion: format(new Date(), 'dd/MM/yyyy HH:mm:ss'),
                version: match?.version || 0,
                updatedAt: new Date().toISOString()
              });
            } else {
              // Brand new occurrence for newly expanded dates/slots in the series
              updatedList.push({
                ...baseRef,
                id: (()=>{const key=JSON.stringify([editingReservation.id,slot.fecha,slot.espacio,slot.horaInicio,slot.horaFin,sIdx]);let id=newOccurrenceIds.current.get(key);if(!id){id=`RSV_${crypto.randomUUID()}`;newOccurrenceIds.current.set(key,id);}return id;})(),
                googleEventId: undefined, cartaCompromisoAdjunta: undefined, cartaCompromisoDescargada: false,
                reemplazaReservaId: undefined, reemplazadaPorReservaId: undefined, motivoReemplazo: undefined,
                createdAt: undefined,
                fecha: slot.fecha,
                horaInicio: slot.horaInicio || effectiveFormData.horaInicio || '10:00',
                horaFin: slot.horaFin || effectiveFormData.horaFin || '11:00',
                espacio: slot.espacio || normalizedSpace,
                tipoActividad: effectiveFormData.tipoActividad || baseRef.tipoActividad || 'OTROS',
                descripcion:
                  effectiveFormData.descripcion !== undefined ? effectiveFormData.descripcion : (baseRef.descripcion || ''),
                responsable: effectiveFormData.responsable || baseRef.responsable || '',
                telefonoContacto:
                  effectiveFormData.telefonoContacto !== undefined
                    ? effectiveFormData.telefonoContacto
                    : (baseRef.telefonoContacto || ''),
                emailContacto:
                  effectiveFormData.emailContacto !== undefined
                    ? effectiveFormData.emailContacto
                    : (baseRef.emailContacto || ''),
                tipoPrestamo: effectiveFormData.tipoPrestamo || baseRef.tipoPrestamo || '',
                cantidadParticipantes:
                  Number.isFinite(Number(effectiveFormData.cantidadParticipantes)) ? Number(effectiveFormData.cantidadParticipantes) : baseRef.cantidadParticipantes ?? 10,
                equipamientoSolicitado: slotEquip,
                importante: effectiveFormData.importante || baseRef.importante || 'No',
                comentarios:
                  effectiveFormData.comentarios !== undefined ? effectiveFormData.comentarios : (baseRef.comentarios || ''),
                rut: effectiveFormData.rut !== undefined ? effectiveFormData.rut : (baseRef.rut || ''),
                domicilio: effectiveFormData.domicilio !== undefined ? effectiveFormData.domicilio : (baseRef.domicilio || ''),
                requiereCartaCompromiso:
                  isCommitmentLetterEligible(effectiveFormData.tipoActividad, effectiveFormData.tipoPrestamo) ||
                  Boolean(effectiveFormData.requiereCartaCompromiso),
                realizada: 'No',
                terminaDiaSiguiente: Boolean(slot.terminaDiaSiguiente),
                horarioExtendidoAutorizado: loanScheduleCheck.requiresAuthorization
                  ? true
                  : Boolean(effectiveFormData.horarioExtendidoAutorizado),
                claveAutorizacionFeriado: finalReserva.claveAutorizacionFeriado,
                claveAutorizacion: loanScheduleCheck.requiresAuthorization
                  ? 'ccd2026'
                  : effectiveFormData.claveAutorizacion || '',
                autorizadoPor: loanScheduleCheck.requiresAuthorization
                  ? currentUser?.name || currentUser?.username || 'Administrador/Coordinador'
                  : effectiveFormData.autorizadoPor || '',
                actividadRecurrente: 'Sí',
                serieRecurrente: seriesId,
                recurrenteId: seriesId,
                tipoRecurrencia: isSpecific ? 'especificas' : 'semanal',
                diasSemana: diasSemanaStr,
                fechaInicioRecurrencia: isConvertingToSeries ? finalDates[0] : recurrenceStartDate || finalDates[0] || slot.fecha,
                fechaFinRecurrencia: isConvertingToSeries ? finalDates[finalDates.length - 1] : recurrenceEndDate || finalDates[finalDates.length - 1] || slot.fecha,
                estado: 'confirmada',
                version: 0,
                editadoPor: currentUser?.name || currentUser?.username || 'Usuario',
                fechaEdicion: format(new Date(), 'dd/MM/yyyy HH:mm:ss'),
                updatedAt: new Date().toISOString()
              });
            }
          }

          // Unmatched existing reservations in cleanAffected if series was shortened
          const idsToDelete: string[] = cleanAffected
            .filter((orig) => !usedExistingIds.has(orig.id))
            .map((orig) => orig.id);

          // Chronological sort and dynamic re-indexing of serie positions
          updatedList.sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            return a.horaInicio.localeCompare(b.horaInicio);
          });

          const knownSeries = allReservations.filter(r=>(r.serieRecurrente||r.recurrenteId)===seriesId && r.estado!=='eliminada');
          const removedIds = new Set(idsToDelete);
          const oldIndices = new Map(cleanAffected.map(r=>[r.id,r.indiceEnSerie]));
          let nextIndex = Math.max(0,...knownSeries.map(r=>r.indiceEnSerie||0));
          const totalSeriesCount = new Set([...knownSeries.filter(r=>!removedIds.has(r.id)).map(r=>r.id),...updatedList.map(r=>r.id)]).size;
          updatedList.forEach(r=>{
            r.indiceEnSerie = oldIndices.get(r.id) || ++nextIndex;
            r.totalEnSerie = totalSeriesCount || updatedList.length;
            const existing=cleanAffected.find(old=>old.id===r.id);
            if (existing && initialFormData) {
              const changed=applyChangedSeriesFields(existing,effectiveFormData,initialFormData);
              for (const field of ['tipoActividad','descripcion','responsable','telefonoContacto','emailContacto','tipoPrestamo','cantidadParticipantes','equipamientoSolicitado','importante','comentarios','rut','domicilio','requiereCartaCompromiso','cartaCompromisoAdjunta','realizada'] as const) (r as any)[field]=changed[field];
            }
            if (existing && sameScheduleSlot(existing,r)) {
              r.horarioExtendidoAutorizado = existing.horarioExtendidoAutorizado;
              r.claveAutorizacion = existing.claveAutorizacion;
              r.autorizadoPor = existing.autorizadoPor;
              r.claveAutorizacionFeriado = existing.claveAutorizacionFeriado;
              if (metadataOnly) {r.fechaInicioRecurrencia=existing.fechaInicioRecurrencia;r.fechaFinRecurrencia=existing.fechaFinRecurrencia;r.tipoRecurrencia=existing.tipoRecurrencia;r.diasSemana=existing.diasSemana;r.totalEnSerie=existing.totalEnSerie;}
            }
          });

          const scopeLabels: Record<UpdateScope, string> = {
            single: 'Solo esta reserva',
            future: `Desde ${formatDateDDMMYYYY(editingReservation.fecha)} en adelante (${updatedList.length} reservas)`,
            series: `Toda la serie (${updatedList.length} reservas)`,
            dateRange: `Rango ${formatDateDDMMYYYY(rangeStartDate)} a ${formatDateDDMMYYYY(rangeEndDate)} (${updatedList.length} reservas)`,
            selected: `${updatedList.length} fechas seleccionadas`
          };

          const batchResult = await Promise.resolve(
            onSave(updatedList[0], true, undefined, true, {
              scope: isConvertingToSeries ? 'series' : updateScope,
              sourceReservationId: editingReservation.id,
              updatedReservations: updatedList,
              affectedIds: cleanAffected.map((r) => r.id),
              addedIds: updatedList.filter(r=>!cleanAffected.some(old=>old.id===r.id)).map(r=>r.id),
              expectedVersions: Object.fromEntries([...cleanAffected,editingReservation].map(r=>[r.id,r.version||0])),
              deletedIds: idsToDelete.length > 0 ? idsToDelete : undefined,
              description: isConvertingToSeries
                ? `Convertida reserva individual a serie de ${updatedList.length} sesiones para '${effectiveFormData.tipoActividad || 'Actividad'}' (${effectiveFormData.responsable || 'Responsable'})`
                : `Actualizadas ${updatedList.length} reservas (${scopeLabels[updateScope] || updateScope}) para '${effectiveFormData.tipoActividad || 'Actividad'}' (${effectiveFormData.responsable || 'Responsable'})`
            }, forceConflictOverride || allowConflictOverride)
          );
          if (batchResult === false) {
            return;
          }
        }
      } else if (
        isRecurring &&
        generateFullSeries &&
        finalDates.length >= 1 &&
        (!editingReservation || isDuplicating)
      ) {
        const seriesResult = await Promise.resolve(onSave(finalReserva, true, finalSeriesPayload, false, undefined, forceConflictOverride || allowConflictOverride));
        if (seriesResult === false) {
          return;
        }
      } else if (enableSingleSecondSpace && (!editingReservation || isDuplicating)) {
        const doubleResult = await Promise.resolve(onSave(finalReserva, true, finalSeriesPayload, false, undefined, forceConflictOverride || allowConflictOverride));
        if (doubleResult === false) {
          return;
        }
      } else {
        const singleResult = await Promise.resolve(onSave(finalReserva, false, undefined, false, undefined, forceConflictOverride || allowConflictOverride));
        if (singleResult === false) {
          return;
        }
      }
    if (isLetterActiveForDownload && descargarCartaAlCrear) {
      void (async () => {
        try {
          const letterReserva: Reservation = {
            ...finalReserva,
            espacio:
              enableSingleSecondSpace &&
              effectiveSecondSpace &&
              effectiveSecondSpace.trim().toUpperCase() !== normalizedSpace.trim().toUpperCase()
                ? `${normalizedSpace} / ${normalizeSpaceName(effectiveSecondSpace)}`
                : finalReserva.espacio
          };
          await downloadCommitmentLetterPdf(letterReserva, {
            allReservations,
            seriesScheduleItems: effectiveSeriesSlotsForLetter
          });
          try {
            const current=getLocalCache().find(r=>r.id===finalReserva.id);
            if(current)await saveReservation({...current,cartaCompromisoDescargada:true});
          } catch(error) {console.warn('Carta descargada; metadatos pendientes:',error);toast.warning('La carta se descargó, pero no se pudo actualizar su indicador. La reserva sigue confirmada.');}
        } catch (err) {
          console.error('Error al descargar automáticamente la carta de compromiso:', err);
          toast.warning('Reserva confirmada. No se pudo generar la carta; puedes descargarla desde la reserva.');
        }
      })();
    }

      clearDraft();
      onClose();
    } catch (err: any) {
      console.error('Error al guardar la reserva:', err);
      showFormFeedback(
        `⚠️ Error al guardar la reserva: ${err?.message || 'Ocurrió un error inesperado al persistir los datos'}. El formulario se mantendrá abierto para que no pierdas los datos ingresados.`
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
    } catch (err: any) {
      showFormFeedback(err?.message || 'No se pudo preparar el guardado. Tus datos se conservaron.', 'error');
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return {
    executeSave
  };
}
