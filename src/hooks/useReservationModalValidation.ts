import { useMemo } from 'react';
import { Reservation, SpaceInfo } from '../types';
import {
  validateRut,
  validateEmail,
  validatePhone,
  validateTimeRange,
  checkLoanScheduleLimit,
  verifyExtensionAuthKey,
  validateActivityDescription,
  checkSpaceCapacityWarning,
  MAX_ACTIVITY_DESCRIPTION_LENGTH,
  TimeRangeValidationResult,
  RutValidationResult,
  EmailValidationResult,
  PhoneValidationResult,
  LoanScheduleLimitResult,
  ActivityDescriptionValidationResult
} from '../utils/validationUtils';
import { formatDateDDMMYYYY, WEEKDAYS } from '../utils/dateUtils';
import { CustomScheduleSlot } from '../types';
import { sameScheduleSlot, type ScheduleSlot } from '../utils/recurringSchedule';

interface UseReservationModalValidationProps {
  preserveExistingSchedule?: boolean;
  reviewSlots?: ScheduleSlot[];
  allReservations?: Reservation[];
  formData: Partial<Reservation>;
  enableSingleSecondSpace: boolean;
  singleSecondStartTime: string;
  singleSecondEndTime: string;
  singleSecondSpace: string;
  bookingMode: 'single' | 'specific' | 'pattern';
  useCustomSchedulesPerDate: boolean;
  dateSchedules: Record<string, CustomScheduleSlot>;
  specificDates: string[];
  useCustomSchedulesPerDay: boolean;
  selectedDays: number[];
  daySchedules: Record<number, CustomScheduleSlot>;
  extendedAuthKey: string;
  availableSpaces: SpaceInfo[];
  generateFullSeries: boolean;
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  generatedDates: readonly string[] | string[];
  isSubmitting: boolean;
  editingReservation?: Reservation | null;
  conflicts: Reservation[];
  candidateConflictDates: string[];
  allowConflictOverride: boolean;
  singleDateHolidayInfo: { name: string } | null;
  isHolidayAuthorized: boolean;
  specificHolidayAnalysis: {
    validDates: readonly string[] | string[];
    omittedHolidays: ReadonlyArray<{ date: string; holiday: { name: string } }>;
  };
  includeHolidaysInSeries: boolean;
  patternHolidayAnalysis: {
    validDates: readonly string[] | string[];
    omittedHolidays: ReadonlyArray<{ date: string; holiday: { name: string } }>;
  };
  showFormFeedback: (message: string, type?: 'error' | 'warning' | 'info' | 'success') => void;
}

export function useReservationModalValidation({
  preserveExistingSchedule = false,
  reviewSlots,
  allReservations = [],
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
  isHolidayAuthorized,
  specificHolidayAnalysis,
  includeHolidaysInSeries,
  patternHolidayAnalysis,
  showFormFeedback
}: UseReservationModalValidationProps) {
  // Real-time validations for time range
  const timeValidation = useMemo<TimeRangeValidationResult>(() => {
    return validateTimeRange(
      formData.horaInicio || '',
      formData.horaFin || '',
      Boolean(formData.terminaDiaSiguiente)
    );
  }, [formData.horaInicio, formData.horaFin, formData.terminaDiaSiguiente]);

  const singleSecondTimeValidation = useMemo<{ isValid: boolean; error?: string }>(() => {
    if (!enableSingleSecondSpace) return { isValid: true, error: undefined };
    return validateTimeRange(singleSecondStartTime || '', singleSecondEndTime || '');
  }, [enableSingleSecondSpace, singleSecondStartTime, singleSecondEndTime]);

  const rutValidation = useMemo<RutValidationResult>(() => {
    return validateRut(formData.rut || '', true);
  }, [formData.rut]);

  const emailValidation = useMemo<EmailValidationResult>(() => {
    return validateEmail(formData.emailContacto || '', true);
  }, [formData.emailContacto]);

  const phoneValidation = useMemo<PhoneValidationResult>(() => {
    return validatePhone(formData.telefonoContacto || '', true);
  }, [formData.telefonoContacto]);

  const loanScheduleCheck = useMemo<LoanScheduleLimitResult>(() => {
    if (reviewSlots) {
      for (const slot of reviewSlots) {
        const check=checkLoanScheduleLimit(slot.horaInicio,slot.horaFin,Boolean(slot.terminaDiaSiguiente));
        const existing=allReservations.find(r=>r.id===slot.sourceId);
        if (check.requiresAuthorization && !(existing && sameScheduleSlot(existing,slot) && existing.horarioExtendidoAutorizado)) return check;
      }
      return {isOutsideRegularHours:false,requiresAuthorization:false};
    }
    // Check main schedule
    const mainCheck = checkLoanScheduleLimit(
      formData.horaInicio || '',
      formData.horaFin || '',
      Boolean(formData.terminaDiaSiguiente)
    );
    if (mainCheck.requiresAuthorization) return mainCheck;

    // Check single second space
    if (enableSingleSecondSpace && singleSecondStartTime && singleSecondEndTime) {
      const secondCheck = checkLoanScheduleLimit(
        singleSecondStartTime,
        singleSecondEndTime,
        false
      );
      if (secondCheck.requiresAuthorization) {
        return {
          isOutsideRegularHours: true,
          requiresAuthorization: true,
          reason: `El segundo espacio (${singleSecondSpace || '2° Espacio'}) tiene horario extendido: ${secondCheck.reason}`
        };
      }
    }

    // Check custom schedules per date
    if (bookingMode === 'specific' && useCustomSchedulesPerDate) {
      for (const d of specificDates) {
        const slot = dateSchedules[d];
        if (slot) {
          const sCheck = checkLoanScheduleLimit(slot.horaInicio || '', slot.horaFin || '', false);
          if (sCheck.requiresAuthorization) {
            return {
              isOutsideRegularHours: true,
              requiresAuthorization: true,
              reason: `La fecha ${formatDateDDMMYYYY(d)} opera en horario extendido: ${sCheck.reason}`
            };
          }
          if (slot.hasSecondSlot && slot.secondHoraInicio && slot.secondHoraFin) {
            const s2Check = checkLoanScheduleLimit(slot.secondHoraInicio, slot.secondHoraFin, false);
            if (s2Check.requiresAuthorization) {
              return {
                isOutsideRegularHours: true,
                requiresAuthorization: true,
                reason: `La fecha ${formatDateDDMMYYYY(d)} (2° espacio) opera en horario extendido: ${s2Check.reason}`
              };
            }
          }
        }
      }
    }

    // Check custom schedules per day
    if (bookingMode === 'pattern' && useCustomSchedulesPerDay) {
      for (const dayNum of selectedDays) {
        const slot = daySchedules[dayNum];
        if (slot) {
          const dayName = WEEKDAYS.find((w) => w.dayNum === dayNum)?.full || 'Día';
          const sCheck = checkLoanScheduleLimit(slot.horaInicio || '', slot.horaFin || '', false);
          if (sCheck.requiresAuthorization) {
            return {
              isOutsideRegularHours: true,
              requiresAuthorization: true,
              reason: `El día ${dayName} opera en horario extendido: ${sCheck.reason}`
            };
          }
        }
      }
    }

    return mainCheck;
  }, [
    reviewSlots,
    allReservations,
    formData.horaInicio,
    formData.horaFin,
    formData.terminaDiaSiguiente,
    enableSingleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    singleSecondSpace,
    bookingMode,
    useCustomSchedulesPerDate,
    specificDates,
    dateSchedules,
    useCustomSchedulesPerDay,
    selectedDays,
    daySchedules
  ]);

  const isExtensionAuthorized = useMemo(() => {
    if (!loanScheduleCheck.requiresAuthorization) return true;
    return verifyExtensionAuthKey(extendedAuthKey);
  }, [loanScheduleCheck.requiresAuthorization, extendedAuthKey]);

  const descriptionValidation = useMemo<ActivityDescriptionValidationResult>(() => {
    return validateActivityDescription(formData.descripcion, MAX_ACTIVITY_DESCRIPTION_LENGTH);
  }, [formData.descripcion]);

  const primarySpaceCapacityWarning = useMemo(() => {
    return checkSpaceCapacityWarning(formData.espacio || '', formData.cantidadParticipantes, availableSpaces);
  }, [formData.espacio, formData.cantidadParticipantes, availableSpaces]);

  const secondSpaceCapacityWarning = useMemo(() => {
    if (!enableSingleSecondSpace || !singleSecondSpace) return null;
    return checkSpaceCapacityWarning(singleSecondSpace, formData.cantidadParticipantes, availableSpaces);
  }, [enableSingleSecondSpace, singleSecondSpace, formData.cantidadParticipantes, availableSpaces]);

  const patternDatesValidation = useMemo<{ isValid: boolean; error?: string }>(() => {
    if (preserveExistingSchedule || bookingMode !== 'pattern' || !generateFullSeries) return { isValid: true, error: undefined };
    if (!recurrenceStartDate || !recurrenceEndDate) {
      return { isValid: false, error: 'Debe ingresar las fechas de inicio y término de la serie.' };
    }
    if (recurrenceEndDate < recurrenceStartDate) {
      return { isValid: false, error: 'La fecha de término de la serie no puede ser anterior a la fecha de inicio.' };
    }
    if (selectedDays.length === 0) {
      return { isValid: false, error: 'Debes seleccionar al menos un día de la semana.' };
    }
    if (generatedDates.length === 0) {
      return { isValid: false, error: 'El rango y días seleccionados no generan ninguna sesión válida (0 sesiones calculadas).' };
    }
    return { isValid: true, error: undefined };
  }, [preserveExistingSchedule, bookingMode, generateFullSeries, recurrenceStartDate, recurrenceEndDate, selectedDays, generatedDates]);

  const specificDatesValidation = useMemo<{ isValid: boolean; error?: string }>(() => {
    if (preserveExistingSchedule || bookingMode !== 'specific' || !generateFullSeries) return { isValid: true, error: undefined };
    if (specificDates.length === 0) {
      return { isValid: false, error: 'Debes seleccionar al menos una fecha específica.' };
    }
    return { isValid: true, error: undefined };
  }, [preserveExistingSchedule, bookingMode, generateFullSeries, specificDates]);

  const isFormSubmitDisabled = useMemo(() => {
    if (isSubmitting) return true;
    if (!timeValidation.isValid) return true;
    if (!descriptionValidation.isValid) return true;
    if (enableSingleSecondSpace && !singleSecondTimeValidation.isValid) return true;
    if (!rutValidation.isValid) return true;
    if (!emailValidation.isValid) return true;
    if (!phoneValidation.isValid) return true;
    if (loanScheduleCheck.requiresAuthorization && !isExtensionAuthorized) return true;
    if (!patternDatesValidation.isValid) return true;
    if (!specificDatesValidation.isValid) return true;
    if (!formData.responsable?.trim()) return true;
    if (!formData.tipoActividad) return true;
    if (!formData.espacio) return true;
    if (bookingMode === 'single' && !formData.fecha) return true;
    return false;
  }, [
    isSubmitting,
    timeValidation.isValid,
    descriptionValidation.isValid,
    enableSingleSecondSpace,
    singleSecondTimeValidation.isValid,
    rutValidation.isValid,
    emailValidation.isValid,
    phoneValidation.isValid,
    loanScheduleCheck.requiresAuthorization,
    isExtensionAuthorized,
    patternDatesValidation.isValid,
    specificDatesValidation.isValid,
    formData.responsable,
    formData.tipoActividad,
    formData.espacio,
    bookingMode,
    formData.fecha
  ]);

  const hasStep1Conflict = useMemo(() => {
    return Boolean((conflicts.length > 0 || candidateConflictDates.length > 0) && !allowConflictOverride);
  }, [conflicts.length, candidateConflictDates.length, allowConflictOverride]);

  const isStep1Completed = useMemo(() => {
    if (!formData.espacio) return false;
    const targetDate = formData.fecha || editingReservation?.fecha;
    if (!targetDate) return false;
    if (!timeValidation.isValid) return false;
    if (enableSingleSecondSpace && !singleSecondTimeValidation.isValid) return false;
    if (hasStep1Conflict) return false;
    if (loanScheduleCheck.requiresAuthorization && !isExtensionAuthorized) return false;

    // Single date mode holiday check
    if (!preserveExistingSchedule && bookingMode === 'single') {
      if (singleDateHolidayInfo && !isHolidayAuthorized) return false;
    }

    // Specific dates mode holiday check
    if (!preserveExistingSchedule && bookingMode === 'specific') {
      if (specificDates.length === 0) return false;
      if (specificHolidayAnalysis.omittedHolidays.length > 0) {
        if (includeHolidaysInSeries || isHolidayAuthorized) {
          if (!isHolidayAuthorized) return false;
        } else {
          if (specificHolidayAnalysis.validDates.length === 0) return false;
        }
      }
    }

    // Pattern mode holiday check
    if (!preserveExistingSchedule && bookingMode === 'pattern') {
      if (includeHolidaysInSeries && !isHolidayAuthorized && patternHolidayAnalysis.omittedHolidays.length > 0) return false;
      if (generatedDates.length === 0) return false;
    }

    return true;
  }, [
    preserveExistingSchedule,
    formData.espacio,
    formData.fecha,
    editingReservation?.fecha,
    timeValidation.isValid,
    enableSingleSecondSpace,
    singleSecondTimeValidation.isValid,
    hasStep1Conflict,
    loanScheduleCheck.requiresAuthorization,
    isExtensionAuthorized,
    bookingMode,
    singleDateHolidayInfo,
    isHolidayAuthorized,
    specificDates.length,
    specificHolidayAnalysis.omittedHolidays.length,
    specificHolidayAnalysis.validDates.length,
    includeHolidaysInSeries,
    patternHolidayAnalysis.omittedHolidays.length,
    generatedDates.length
  ]);

  const isStep2Completed = useMemo(() => {
    return Boolean(
      formData.responsable &&
      formData.responsable.trim().length >= 2 &&
      (!formData.rut || rutValidation.isValid) &&
      (!formData.emailContacto || emailValidation.isValid) &&
      (!formData.telefonoContacto || phoneValidation.isValid)
    );
  }, [formData.responsable, formData.rut, rutValidation.isValid, formData.emailContacto, emailValidation.isValid, formData.telefonoContacto, phoneValidation.isValid]);

  const isStep3Completed = useMemo(() => {
    return Boolean(
      formData.descripcion &&
      formData.descripcion.trim().length >= 2 &&
      descriptionValidation.isValid
    );
  }, [formData.descripcion, descriptionValidation.isValid]);

  const validateStep1 = (showAlert = true): boolean => {
    if (!timeValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ ${timeValidation.error || 'La hora de término debe ser posterior a la hora de inicio.'}`, 'warning');
      return false;
    }
    if (enableSingleSecondSpace && !singleSecondTimeValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ ${singleSecondTimeValidation.error || 'La hora de término del segundo espacio debe ser posterior a la de inicio.'}`, 'warning');
      return false;
    }

    // Holiday validation for single date mode
    if (!preserveExistingSchedule && bookingMode === 'single') {
      const targetDate = formData.fecha || editingReservation?.fecha;
      if (!targetDate) {
        if (showAlert) showFormFeedback('⚠️ Por favor indica la fecha de la reserva.', 'warning');
        return false;
      }
      if (singleDateHolidayInfo && !isHolidayAuthorized) {
        if (showAlert) {
          showFormFeedback(
            `🚫 FECHA EN DÍA FERIADO NACIONAL: El día ${formatDateDDMMYYYY(targetDate)} es feriado (${singleDateHolidayInfo.name}). Para autorizarla debes ingresar la clave especial CCD.`,
            'warning'
          );
        }
        return false;
      }
    }

    // Holiday & date validation for specific dates mode
    if (!preserveExistingSchedule && bookingMode === 'specific') {
      if (specificDates.length === 0) {
        if (showAlert) showFormFeedback('⚠️ Por favor selecciona al menos una fecha específica en el calendario.', 'warning');
        return false;
      }
      if (specificHolidayAnalysis.omittedHolidays.length > 0) {
        if (includeHolidaysInSeries || isHolidayAuthorized) {
          if (!isHolidayAuthorized) {
            if (showAlert) showFormFeedback('🚫 Para incluir reservas en días feriados de Chile, debes ingresar la clave de autorización especial "CCD" correcta.', 'warning');
            return false;
          }
        } else {
          if (specificHolidayAnalysis.validDates.length === 0) {
            if (showAlert) {
              showFormFeedback(`🚫 Todas las fechas seleccionadas son días feriados en Chile (${specificHolidayAnalysis.omittedHolidays.map(h => `${formatDateDDMMYYYY(h.date)}: ${h.holiday.name}`).join(', ')}). Los feriados están bloqueados por defecto. Para autorizarlos debes ingresar la clave especial CCD.`, 'warning');
            }
            return false;
          }
        }
      }
    }

    // Holiday & date validation for pattern mode
    if (!preserveExistingSchedule && bookingMode === 'pattern') {
      if (includeHolidaysInSeries && !isHolidayAuthorized && patternHolidayAnalysis.omittedHolidays.length > 0) {
        if (showAlert) showFormFeedback('🚫 Para incluir los días feriados en la serie semanal, debes ingresar la clave de autorización especial "CCD" correcta.', 'warning');
        return false;
      }
      if (generatedDates.length === 0) {
        if (showAlert) showFormFeedback('⚠️ El patrón semanal no genera fechas válidas en el rango seleccionado.', 'warning');
        return false;
      }
    }

    // Extended schedule authorization check
    if (loanScheduleCheck.requiresAuthorization && !isExtensionAuthorized) {
      if (showAlert) {
        showFormFeedback('⚠️ Autorización requerida: La actividad opera en horario extendido (antes de las 08:30 hrs o después de las 22:00 hrs). Ingresa la clave oficial "ccd2026" para autorizarla.', 'warning');
      }
      return false;
    }

    if (hasStep1Conflict) {
      if (showAlert) {
        showFormFeedback('⚠️ Topamiento detectado: El espacio ya está ocupado en ese horario. Puedes resolverlo con un clic (ej: "Mover después"), activar la casilla "Permitir guardar a pesar del conflicto", o cambiar de espacio antes de continuar.', 'warning');
      }
      return false;
    }
    return true;
  };

  const validateStep2 = (showAlert = true): boolean => {
    if (!formData.responsable || !formData.responsable.trim()) {
      if (showAlert) showFormFeedback('⚠️ Por favor ingresa el nombre de la persona u organización responsable solicitante.', 'warning');
      return false;
    }
    if (formData.rut && !rutValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ RUT inválido: ${rutValidation.error || 'Verifica el RUT ingresado.'}`, 'warning');
      return false;
    }
    if (formData.emailContacto && !emailValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ Correo electrónico inválido: ${emailValidation.error || 'Formato de correo no válido.'}`, 'warning');
      return false;
    }
    if (formData.telefonoContacto && !phoneValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ Teléfono inválido: ${phoneValidation.error || 'Formato de teléfono no válido.'}`, 'warning');
      return false;
    }
    return true;
  };

  // --- 5-Step Wizard Completion Booleans & Validators ---
  const isStep1ActivityCompleted = useMemo(() => {
    return Boolean(
      formData.descripcion &&
      formData.descripcion.trim().length >= 2 &&
      descriptionValidation.isValid
    );
  }, [formData.descripcion, descriptionValidation.isValid]);

  const isStep2DateTimeCompleted = useMemo(() => {
    if (!formData.espacio) return false;
    const targetDate = formData.fecha || editingReservation?.fecha;
    if (!targetDate) return false;
    if (!timeValidation.isValid) return false;
    if (enableSingleSecondSpace && !singleSecondTimeValidation.isValid) return false;
    if (hasStep1Conflict) return false;
    if (loanScheduleCheck.requiresAuthorization && !isExtensionAuthorized) return false;

    if (!preserveExistingSchedule && bookingMode === 'single') {
      if (singleDateHolidayInfo && !isHolidayAuthorized) return false;
    }
    if (!preserveExistingSchedule && bookingMode === 'specific') {
      if (specificDates.length === 0) return false;
      if (specificHolidayAnalysis.omittedHolidays.length > 0) {
        if (includeHolidaysInSeries || isHolidayAuthorized) {
          if (!isHolidayAuthorized) return false;
        } else {
          if (specificHolidayAnalysis.validDates.length === 0) return false;
        }
      }
    }
    if (!preserveExistingSchedule && bookingMode === 'pattern') {
      if (includeHolidaysInSeries && !isHolidayAuthorized && patternHolidayAnalysis.omittedHolidays.length > 0) return false;
      if (generatedDates.length === 0) return false;
    }
    return true;
  }, [
    preserveExistingSchedule,
    formData.espacio,
    formData.fecha,
    editingReservation?.fecha,
    timeValidation.isValid,
    enableSingleSecondSpace,
    singleSecondTimeValidation.isValid,
    hasStep1Conflict,
    loanScheduleCheck.requiresAuthorization,
    isExtensionAuthorized,
    bookingMode,
    singleDateHolidayInfo,
    isHolidayAuthorized,
    specificDates.length,
    specificHolidayAnalysis.omittedHolidays.length,
    specificHolidayAnalysis.validDates.length,
    includeHolidaysInSeries,
    patternHolidayAnalysis.omittedHolidays.length,
    generatedDates.length
  ]);

  const isStep3ApplicantCompleted = useMemo(() => {
    return Boolean(
      formData.responsable &&
      formData.responsable.trim().length >= 2 &&
      (!formData.rut || rutValidation.isValid) &&
      (!formData.emailContacto || emailValidation.isValid) &&
      (!formData.telefonoContacto || phoneValidation.isValid)
    );
  }, [formData.responsable, formData.rut, rutValidation.isValid, formData.emailContacto, emailValidation.isValid, formData.telefonoContacto, phoneValidation.isValid]);

  const isStep4ResourcesCompleted = useMemo(() => {
    return true; // Resources & documentation are optional or default-configured
  }, []);

  const validateStep1Activity = (showAlert = true): boolean => {
    if (!formData.descripcion || !formData.descripcion.trim()) {
      if (showAlert) showFormFeedback('⚠️ Por favor ingresa el nombre de la actividad, taller o evento.', 'warning');
      return false;
    }
    if (!descriptionValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ ${descriptionValidation.error || 'Nombre de actividad inválido.'}`, 'warning');
      return false;
    }
    return true;
  };

  const validateStep2DateTime = (showAlert = true): boolean => {
    if (!timeValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ ${timeValidation.error || 'La hora de término debe ser posterior a la hora de inicio.'}`, 'warning');
      return false;
    }
    if (enableSingleSecondSpace && !singleSecondTimeValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ ${singleSecondTimeValidation.error || 'La hora de término del segundo espacio debe ser posterior a la de inicio.'}`, 'warning');
      return false;
    }

    if (!preserveExistingSchedule && bookingMode === 'single') {
      const targetDate = formData.fecha || editingReservation?.fecha;
      if (!targetDate) {
        if (showAlert) showFormFeedback('⚠️ Por favor indica la fecha de la reserva.', 'warning');
        return false;
      }
      if (singleDateHolidayInfo && !isHolidayAuthorized) {
        if (showAlert) {
          showFormFeedback(
            `🚫 FECHA EN DÍA FERIADO NACIONAL: El día ${formatDateDDMMYYYY(targetDate)} es feriado (${singleDateHolidayInfo.name}). Para autorizarla debes ingresar la clave especial CCD.`,
            'warning'
          );
        }
        return false;
      }
    }

    if (!preserveExistingSchedule && bookingMode === 'specific') {
      if (specificDates.length === 0) {
        if (showAlert) showFormFeedback('⚠️ Por favor selecciona al menos una fecha específica en el calendario.', 'warning');
        return false;
      }
      if (specificHolidayAnalysis.omittedHolidays.length > 0) {
        if (includeHolidaysInSeries || isHolidayAuthorized) {
          if (!isHolidayAuthorized) {
            if (showAlert) showFormFeedback('🚫 Para incluir reservas en días feriados de Chile, debes ingresar la clave de autorización especial "CCD" correcta.', 'warning');
            return false;
          }
        } else {
          if (specificHolidayAnalysis.validDates.length === 0) {
            if (showAlert) {
              showFormFeedback(`🚫 Todas las fechas seleccionadas son días feriados en Chile (${specificHolidayAnalysis.omittedHolidays.map(h => `${formatDateDDMMYYYY(h.date)}: ${h.holiday.name}`).join(', ')}). Los feriados están bloqueados por defecto. Para autorizarlos debes ingresar la clave especial CCD.`, 'warning');
            }
            return false;
          }
        }
      }
    }

    if (!preserveExistingSchedule && bookingMode === 'pattern') {
      if (includeHolidaysInSeries && !isHolidayAuthorized && patternHolidayAnalysis.omittedHolidays.length > 0) {
        if (showAlert) showFormFeedback('🚫 Para incluir los días feriados en la serie semanal, debes ingresar la clave de autorización especial "CCD" correcta.', 'warning');
        return false;
      }
      if (generatedDates.length === 0) {
        if (showAlert) showFormFeedback('⚠️ El patrón semanal no genera fechas válidas en el rango seleccionado.', 'warning');
        return false;
      }
    }

    if (loanScheduleCheck.requiresAuthorization && !isExtensionAuthorized) {
      if (showAlert) {
        showFormFeedback('⚠️ Autorización requerida: La actividad opera en horario extendido (antes de las 08:30 hrs o después de las 22:00 hrs). Ingresa la clave oficial "ccd2026" para autorizarla.', 'warning');
      }
      return false;
    }

    if (hasStep1Conflict) {
      if (showAlert) {
        showFormFeedback('⚠️ Topamiento detectado: El espacio ya está ocupado en ese horario. Puedes resolverlo con un clic (ej: "Mover después"), activar la casilla "Permitir guardar a pesar del conflicto", o cambiar de espacio antes de continuar.', 'warning');
      }
      return false;
    }
    return true;
  };

  const validateStep3Applicant = (showAlert = true): boolean => {
    if (!formData.responsable || !formData.responsable.trim()) {
      if (showAlert) showFormFeedback('⚠️ Por favor ingresa el nombre de la persona u organización responsable solicitante.', 'warning');
      return false;
    }
    if (formData.rut && !rutValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ RUT inválido: ${rutValidation.error || 'Verifica el RUT ingresado.'}`, 'warning');
      return false;
    }
    if (formData.emailContacto && !emailValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ Correo electrónico inválido: ${emailValidation.error || 'Formato de correo no válido.'}`, 'warning');
      return false;
    }
    if (formData.telefonoContacto && !phoneValidation.isValid) {
      if (showAlert) showFormFeedback(`⚠️ Teléfono inválido: ${phoneValidation.error || 'Formato de teléfono no válido.'}`, 'warning');
      return false;
    }
    return true;
  };

  const validateStep4Resources = (_showAlert = true): boolean => {
    return true;
  };

  return {
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
    patternDatesValidation,
    specificDatesValidation,
    isFormSubmitDisabled,
    hasStep1Conflict,
    isStep1Completed,
    isStep2Completed,
    isStep3Completed,
    validateStep1,
    validateStep2,
    // 5-step wizard exports
    isStep1ActivityCompleted,
    isStep2DateTimeCompleted,
    isStep3ApplicantCompleted,
    isStep4ResourcesCompleted,
    validateStep1Activity,
    validateStep2DateTime,
    validateStep3Applicant,
    validateStep4Resources
  };
}
