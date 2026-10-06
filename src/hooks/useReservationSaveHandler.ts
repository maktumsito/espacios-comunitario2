import { toast } from 'sonner';
import { MutableRefObject } from 'react';
import { format } from 'date-fns';
import {
  Reservation,
  SpaceBlock,
  SpaceInfo,
  UpdateScope,
  BatchUpdateInfo
} from '../types';
import { normalizeSpaceName } from '../data/spacesData';
import { checkSingleConflict, timeToMinutes, isReservationActiveForAvailability } from '../utils/conflictDetector';
import { getDeletedIds, getLocalCache, saveReservation } from '../services/reservationService';
import { formatDateDDMMYYYY, getDayOfWeekFromDateString } from '../utils/dateUtils';
import { checkSpaceBlocked } from '../services/spaceBlockService';
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
import { filterOutChileanHolidays } from '../utils/holidayUtils';

export interface SeriesItemSlot {
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  espacio?: string;
}

interface UseReservationSaveHandlerProps {
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
    const effectiveSpecificDates: string[] = overridesPayload?.specificDates
      ? [...overridesPayload.specificDates]
      : [...specificDates];
    const selectedDateHolidayAnalysis = overridesPayload?.specificDates
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

    if (!timeValidation.isValid) {
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
      ...formData,
      id: formData.id || editingReservation?.id || 'temp-id',
      fecha: formData.fecha || editingReservation?.fecha || '2026-01-01',
      horaInicio: baseStart,
      horaFin: baseEnd,
      espacio: baseSpace,
      responsable: formData.responsable || '',
      tipoActividad: formData.tipoActividad || 'Comunitario',
      descripcion: formData.descripcion || 'Actividad'
    };
    const zodValidation = validateReservationWithZod(candidatePayload);
    if (!zodValidation.success && zodValidation.firstError) {
      abortWithFeedback(`⚠️ ${zodValidation.firstError}`);
      return;
    }

    if (loanScheduleCheck.requiresAuthorization) {
      if (!isExtensionAuthorized) {
        abortWithFeedback(
          '⚠️ Autorización requerida: La actividad opera en horario extendido (antes de las 08:30 hrs o después de las 22:00 hrs). Ingresa la clave oficial "ccd2026" para autorizarla.'
        );
        return;
      }
    }

    let finalDates: string[] = [];
    if (isSpecific) {
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
      if (includeHolidaysInSeries && !isHolidayAuthorized && patternHolidayAnalysis.omittedHolidays.length > 0) {
        abortWithFeedback(
          '🚫 Para incluir los días feriados en la serie semanal, debes ingresar la clave de autorización especial "CCD" correcta.'
        );
        return;
      }

      if (generatedDates.length === 0) {
        if (recurrenceEndDate < recurrenceStartDate) {
          abortWithFeedback('🚫 Error: La Fecha Término de la serie no puede ser anterior a la Fecha Inicio.');
        } else if (
          rawPatternDates.length > 0 &&
          patternHolidayAnalysis.omittedHolidays.length === rawPatternDates.length
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
      finalDates = [...generatedDates];
    } else {
      const targetSingleDate = effectiveFormData.fecha || editingReservation?.fecha;

      if (!targetSingleDate) {
        abortWithFeedback('Por favor indica la fecha de la reserva.');
        return;
      }

      // Check single date holiday
      if (singleDateHolidayInfo && !isHolidayAuthorized) {
        abortWithFeedback(
          `🚫 FECHA EN DÍA FERIADO NACIONAL: El día ${formatDateDDMMYYYY(targetSingleDate)} es feriado (${singleDateHolidayInfo.name}). Para autorizarla debes ingresar la clave CCD.`
        );
        return;
      }

      finalDates = [targetSingleDate];
    }

    // Check custom schedules timing validation
    if (isSpecific && effectiveUseCustomSchedulesPerDate && finalDates.length > 1) {
      for (const d of finalDates) {
        const slot =
          effectiveDateSchedules[d] || {
            horaInicio: effectiveFormData.horaInicio,
            horaFin: effectiveFormData.horaFin
          };
        const sMin = timeToMinutes(slot.horaInicio || '10:00');
        const eMin = timeToMinutes(slot.horaFin || '11:00');
        if (eMin <= sMin) {
          abortWithFeedback(
            `En la fecha ${formatDateDDMMYYYY(d)}, la hora de término (${slot.horaFin}) del 1er espacio debe ser posterior a la hora de inicio (${slot.horaInicio}).`
          );
          return;
        }
        if (slot.hasSecondSlot) {
          const sMin2 = timeToMinutes(slot.secondHoraInicio || '11:00');
          const eMin2 = timeToMinutes(slot.secondHoraFin || '12:00');
          if (eMin2 <= sMin2) {
            abortWithFeedback(
              `En la fecha ${formatDateDDMMYYYY(d)}, la hora de término (${slot.secondHoraFin}) del 2do espacio (${slot.secondEspacio}) debe ser posterior a la hora de inicio (${slot.secondHoraInicio}).`
            );
            return;
          }
        }
      }
    }

    if (isPattern && useCustomSchedulesPerDay) {
      for (const dayNum of selectedDays) {
        const slot =
          daySchedules[dayNum] || {
            horaInicio: effectiveFormData.horaInicio,
            horaFin: effectiveFormData.horaFin
          };
        const sMin = timeToMinutes(slot.horaInicio || '10:00');
        const eMin = timeToMinutes(slot.horaFin || '11:00');
        const dayObj = WEEKDAYS.find((w) => w.dayNum === dayNum);
        if (eMin <= sMin) {
          abortWithFeedback(
            `Para el día ${dayObj?.full || 'seleccionado'}, la hora de término (${slot.horaFin}) del 1er espacio debe ser posterior a la hora de inicio (${slot.horaInicio}).`
          );
          return;
        }
        if (slot.hasSecondSlot) {
          const sMin2 = timeToMinutes(slot.secondHoraInicio || '11:00');
          const eMin2 = timeToMinutes(slot.secondHoraFin || '12:00');
          if (eMin2 <= sMin2) {
            abortWithFeedback(
              `Para el día ${dayObj?.full || 'seleccionado'}, la hora de término (${slot.secondHoraFin}) del 2do espacio (${slot.secondEspacio}) debe ser posterior a la hora de inicio (${slot.secondHoraInicio}).`
            );
            return;
          }
        }
      }
    }

    // Validation for single day 2nd space
    if (!isRecurring && enableSingleSecondSpace) {
      if (!effectiveSecondSpace) {
        abortWithFeedback('Por favor selecciona el segundo espacio para registrar.');
        return;
      }
      const sMin2 = timeToMinutes(effectiveSecondStartTime || '11:00');
      const eMin2 = timeToMinutes(effectiveSecondEndTime || '12:00');
      if (eMin2 <= sMin2) {
        abortWithFeedback(
          `Para el 2do espacio (${effectiveSecondSpace}), la hora de término (${effectiveSecondEndTime}) debe ser posterior a la hora de inicio (${effectiveSecondStartTime}).`
        );
        return;
      }
    }

    // Check if any requested date/time overlaps with a Maintenance Block
    if (spaceBlocks && spaceBlocks.length > 0) {
      for (const d of finalDates) {
        let hStart = effectiveFormData.horaInicio || '10:00';
        let hEnd = effectiveFormData.horaFin || '11:00';
        let esp = effectiveFormData.espacio || availableSpaces[0]?.name || '';

        if (isPattern && useCustomSchedulesPerDay) {
          const dayNum = getDayOfWeekFromDateString(d);
          const sched = daySchedules[dayNum];
          if (sched) {
            hStart = sched.horaInicio || hStart;
            hEnd = sched.horaFin || hEnd;
            esp = sched.espacio || esp;
          }
        } else if (isSpecific && effectiveUseCustomSchedulesPerDate) {
          const customSlot = effectiveDateSchedules[d];
          if (customSlot) {
            hStart = customSlot.horaInicio || hStart;
            hEnd = customSlot.horaFin || hEnd;
            esp = customSlot.espacio || esp;
          }
        }

        const blockConflict = checkSpaceBlocked(esp, d, hStart, hEnd, [...spaceBlocks]);
        if (blockConflict) {
          abortWithFeedback(
            `El espacio '${esp}' se encuentra BLOQUEADO por mantención/obras el ${formatDateDDMMYYYY(d)} (${blockConflict.motivo}). No es posible agendar en este horario.`
          );
          return;
        }

        // Check 2nd space if active
        const hasSecond =
          isPattern && useCustomSchedulesPerDay
            ? Boolean(daySchedules[getDayOfWeekFromDateString(d)]?.hasSecondSlot)
            : isSpecific && effectiveUseCustomSchedulesPerDate
            ? Boolean(effectiveDateSchedules[d]?.hasSecondSlot)
            : enableSingleSecondSpace;

        if (hasSecond && effectiveSecondSpace) {
          const s2Start = effectiveSecondStartTime || '11:00';
          const s2End = effectiveSecondEndTime || '12:00';
          const blockConflict2 = checkSpaceBlocked(effectiveSecondSpace, d, s2Start, s2End, [...spaceBlocks]);
          if (blockConflict2) {
            abortWithFeedback(
              `El 2° espacio '${effectiveSecondSpace}' se encuentra BLOQUEADO por mantención/obras el ${formatDateDDMMYYYY(d)} (${blockConflict2.motivo}).`
            );
            return;
          }
        }
      }
    }

    // Topamiento check: Verification dialog to allow mass or individual resolution directly from modal
    if (!forceConflictOverride && !allowConflictOverride) {
      const remainingConflicts: string[] = [];

      if (!isRecurring) {
        const d = finalDates[0];
        const s1 = checkSingleConflict(
          {
            ...effectiveFormData,
            fecha: d,
            horaInicio: effectiveFormData.horaInicio,
            horaFin: effectiveFormData.horaFin,
            espacio: effectiveFormData.espacio
          },
          allReservations,
          excludeReservationIds,
          excludeSeriesId
        );
        const s2 =
          enableSingleSecondSpace &&
          effectiveSecondSpace &&
          effectiveSecondStartTime &&
          effectiveSecondEndTime
            ? checkSingleConflict(
                {
                  ...effectiveFormData,
                  fecha: d,
                  horaInicio: effectiveSecondStartTime,
                  horaFin: effectiveSecondEndTime,
                  espacio: effectiveSecondSpace
                },
                allReservations,
                excludeReservationIds,
                excludeSeriesId
              )
            : [];
        if (s1.length > 0 || s2.length > 0) {
          remainingConflicts.push(d);
        }
      } else if (isSpecific) {
        finalDates.forEach((d) => {
          const customSlot = effectiveUseCustomSchedulesPerDate ? effectiveDateSchedules[d] : undefined;
          const hInicio = customSlot?.horaInicio || effectiveFormData.horaInicio || '10:00';
          const hFin = customSlot?.horaFin || effectiveFormData.horaFin || '11:00';
          const esp = customSlot?.espacio || effectiveFormData.espacio || availableSpaces[0]?.name;
          const s1 =
            esp && hInicio && hFin
              ? checkSingleConflict(
                  { ...effectiveFormData, fecha: d, horaInicio: hInicio, horaFin: hFin, espacio: esp },
                  allReservations,
                  excludeReservationIds,
                  excludeSeriesId
                )
              : [];

          const hasSecond = effectiveUseCustomSchedulesPerDate
            ? customSlot?.hasSecondSlot
            : enableSingleSecondSpace;
          const s2Esp = effectiveUseCustomSchedulesPerDate
            ? customSlot?.secondEspacio
            : effectiveSecondSpace;
          const s2Start = effectiveUseCustomSchedulesPerDate
            ? customSlot?.secondHoraInicio
            : effectiveSecondStartTime;
          const s2End = effectiveUseCustomSchedulesPerDate
            ? customSlot?.secondHoraFin
            : effectiveSecondEndTime;
          const s2 =
            hasSecond && s2Esp && s2Start && s2End
              ? checkSingleConflict(
                  { ...effectiveFormData, fecha: d, horaInicio: s2Start, horaFin: s2End, espacio: s2Esp },
                  allReservations,
                  excludeReservationIds,
                  excludeSeriesId
                )
              : [];

          if (s1.length > 0 || s2.length > 0) {
            remainingConflicts.push(d);
          }
        });
      } else if (isPattern) {
        finalDates.forEach((d) => {
          const dayNum = getDayOfWeekFromDateString(d);
          const customSlot = useCustomSchedulesPerDay ? daySchedules[dayNum] : undefined;
          const hInicio = customSlot?.horaInicio || effectiveFormData.horaInicio || '10:00';
          const hFin = customSlot?.horaFin || effectiveFormData.horaFin || '11:00';
          const esp = customSlot?.espacio || effectiveFormData.espacio || availableSpaces[0]?.name;
          const s1 =
            esp && hInicio && hFin
              ? checkSingleConflict(
                  { ...effectiveFormData, fecha: d, horaInicio: hInicio, horaFin: hFin, espacio: esp },
                  allReservations,
                  excludeReservationIds,
                  excludeSeriesId
                )
              : [];

          const hasSecond = useCustomSchedulesPerDay
            ? customSlot?.hasSecondSlot
            : enableSingleSecondSpace;
          const s2Esp = useCustomSchedulesPerDay
            ? customSlot?.secondEspacio
            : effectiveSecondSpace;
          const s2Start = useCustomSchedulesPerDay
            ? customSlot?.secondHoraInicio
            : effectiveSecondStartTime;
          const s2End = useCustomSchedulesPerDay
            ? customSlot?.secondHoraFin
            : effectiveSecondEndTime;
          const s2 =
            hasSecond && s2Esp && s2Start && s2End
              ? checkSingleConflict(
                  { ...effectiveFormData, fecha: d, horaInicio: s2Start, horaFin: s2End, espacio: s2Esp },
                  allReservations,
                  excludeReservationIds,
                  excludeSeriesId
                )
              : [];

          if (s1.length > 0 || s2.length > 0) {
            remainingConflicts.push(d);
          }
        });
      }

      if (remainingConflicts.length > 0) {
        setShowConflictDialog(true);
        isSubmittingRef.current = false;
        setIsSubmitting(false);
        return;
      }
    }

    const normalizedSpace = normalizeSpaceName(effectiveFormData.espacio || baseSpace || 'Espacio');

    const diasSemanaStr = isPattern
      ? selectedDays
          .map((d) => WEEKDAYS.find((w) => w.dayNum === d)?.key || '')
          .filter(Boolean)
          .join(',')
      : '';

    const seriesId = `SER_${effectiveFormData.id || editingReservation?.id || 'draft'}`.slice(0,128);

    // Build explicit payload for all dates with individual space and schedule
    let finalSeriesPayload: (string | SeriesItemSlot)[] = finalDates;

    if (isSpecific && effectiveUseCustomSchedulesPerDate) {
      finalSeriesPayload = [];
      for (const d of finalDates) {
        const slot = effectiveDateSchedules[d] || {
          horaInicio: effectiveFormData.horaInicio || '10:00',
          horaFin: effectiveFormData.horaFin || '11:00',
          espacio: effectiveFormData.espacio
        };
        finalSeriesPayload.push({
          fecha: d,
          horaInicio: slot.horaInicio || effectiveFormData.horaInicio || '10:00',
          horaFin: slot.horaFin || effectiveFormData.horaFin || '11:00',
          espacio: slot.espacio ? normalizeSpaceName(slot.espacio) : normalizedSpace
        });
        if (slot.hasSecondSlot && slot.secondEspacio) {
          finalSeriesPayload.push({
            fecha: d,
            horaInicio: slot.secondHoraInicio || '11:00',
            horaFin: slot.secondHoraFin || '12:00',
            espacio: normalizeSpaceName(slot.secondEspacio)
          });
        }
      }
    } else if (isSpecific && enableSingleSecondSpace && effectiveSecondSpace) {
      finalSeriesPayload = [];
      for (const d of finalDates) {
        finalSeriesPayload.push({
          fecha: d,
          horaInicio: effectiveFormData.horaInicio || '10:00',
          horaFin: effectiveFormData.horaFin || '11:00',
          espacio: normalizedSpace
        });
        finalSeriesPayload.push({
          fecha: d,
          horaInicio: effectiveSecondStartTime || '11:00',
          horaFin: effectiveSecondEndTime || '12:00',
          espacio: normalizeSpaceName(effectiveSecondSpace)
        });
      }
    } else if (isPattern && useCustomSchedulesPerDay) {
      finalSeriesPayload = [];
      for (const d of finalDates) {
        const dayNum = getDayOfWeekFromDateString(d);
        const sched = daySchedules[dayNum];
        finalSeriesPayload.push({
          fecha: d,
          horaInicio: sched?.horaInicio || effectiveFormData.horaInicio || '10:00',
          horaFin: sched?.horaFin || effectiveFormData.horaFin || '11:00',
          espacio: sched?.espacio ? normalizeSpaceName(sched.espacio) : normalizedSpace
        });
        if (sched?.hasSecondSlot && sched?.secondEspacio) {
          finalSeriesPayload.push({
            fecha: d,
            horaInicio: sched.secondHoraInicio || '11:00',
            horaFin: sched.secondHoraFin || '12:00',
            espacio: normalizeSpaceName(sched.secondEspacio)
          });
        }
      }
    } else if (isRecurring) {
      if (enableSingleSecondSpace && effectiveSecondSpace) {
        finalSeriesPayload = [];
        for (const d of finalDates) {
          finalSeriesPayload.push({
            fecha: d,
            horaInicio: effectiveFormData.horaInicio || '10:00',
            horaFin: effectiveFormData.horaFin || '11:00',
            espacio: normalizedSpace
          });
          finalSeriesPayload.push({
            fecha: d,
            horaInicio: effectiveSecondStartTime || '11:00',
            horaFin: effectiveSecondEndTime || '12:00',
            espacio: normalizeSpaceName(effectiveSecondSpace)
          });
        }
      } else {
        finalSeriesPayload = finalDates.map((d) => ({
          fecha: d,
          horaInicio: effectiveFormData.horaInicio || '10:00',
          horaFin: effectiveFormData.horaFin || '11:00',
          espacio: normalizedSpace
        }));
      }
    } else if (enableSingleSecondSpace) {
      finalSeriesPayload = [
        {
          fecha: effectiveFormData.fecha || '',
          horaInicio: effectiveFormData.horaInicio || '10:00',
          horaFin: effectiveFormData.horaFin || '11:00',
          espacio: normalizedSpace
        },
        {
          fecha: effectiveFormData.fecha || '',
          horaInicio: effectiveSecondStartTime || '11:00',
          horaFin: effectiveSecondEndTime || '12:00',
          espacio: normalizeSpaceName(effectiveSecondSpace)
        }
      ];
    }

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
      cantidadParticipantes: Number(effectiveFormData.cantidadParticipantes) || 10,
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
          const cleanAffected = (isConvertingToSeries ? [editingReservation] : affectedReservations).filter(
            (orig) => !deletedSet.has(orig.id) && orig.estado !== 'eliminada' && isReservationActiveForAvailability(orig)
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
          }

          // Target slots from explicit series payload (handles date expansion, per-day / per-date schedules, second space)
          const targetSlots: NormalizedSlot[] = (isRecurring && finalSeriesPayload.length > 0)
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
                  espacio: item.espacio || normalizedSpace
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
            let match = existingByDateAndSpace.get(key)?.find((r) => !usedExistingIds.has(r.id));
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
                  Number(effectiveFormData.cantidadParticipantes) || match.cantidadParticipantes || 10,
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
                terminaDiaSiguiente: Boolean(effectiveFormData.terminaDiaSiguiente),
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
                id: `RSV_${effectiveFormData.id}_${slot.fecha}_${slot.espacio}_${slot.horaInicio}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,128),
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
                  Number(effectiveFormData.cantidadParticipantes) || baseRef.cantidadParticipantes || 10,
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
                terminaDiaSiguiente: Boolean(effectiveFormData.terminaDiaSiguiente),
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

          const totalSeriesCount = updatedList.length;
          updatedList.forEach((r, idx) => {
            r.indiceEnSerie = idx + 1;
            r.totalEnSerie = totalSeriesCount;
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
              updatedReservations: updatedList,
              affectedIds: updatedList.map((r) => r.id),
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
