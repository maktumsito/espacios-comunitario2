import { useMemo } from 'react';
import { Reservation, SpaceRating, UpdateScope, isSingleDayMultiSpaceReservation } from '../types';
import { generateRecurrenceDates } from '../utils/dateUtils';
import {
  filterOutChileanHolidays,
  getChileanHolidayInfo,
  verifyHolidayOverrideKey
} from '../utils/holidayUtils';
import { getResponsibleHistoryAlert } from '../services/ratingService';
import { getDeletedIds } from '../services/reservationService';
import { isReservationActiveForAvailability } from '../utils/conflictDetector';

interface UseReservationSeriesStateProps {
  editingReservation?: Reservation | null;
  isDuplicating?: boolean;
  allReservations: Reservation[];
  updateScope: UpdateScope;
  rangeStartDate: string;
  rangeEndDate: string;
  selectedOccurrenceIds: Set<string>;
  bookingMode: 'single' | 'specific' | 'pattern';
  recurrenceStartDate: string;
  recurrenceEndDate: string;
  selectedDays: number[];
  specificDates: string[];
  formData: Partial<Reservation>;
  includeHolidaysInSeries: boolean;
  holidayOverrideKey: string;
  ratings?: SpaceRating[];
}

export function useReservationSeriesState({
  editingReservation,
  isDuplicating = false,
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
  ratings = []
}: UseReservationSeriesStateProps) {
  // Detect if current editing reservation belongs to a recurring series (never when duplicating or single-day multi-space)
  const isEditingRecurring = useMemo(() => {
    if (isDuplicating || !editingReservation) return false;
    if (isSingleDayMultiSpaceReservation(editingReservation)) return false;
    return Boolean(
      editingReservation.actividadRecurrente === 'Sí' ||
        Boolean(editingReservation.serieRecurrente || editingReservation.recurrenteId)
    );
  }, [editingReservation, isDuplicating]);

  // Indicates when user chose to edit ONLY the current occurrence
  const isEditingSingleOccurrence = useMemo(() => {
    return Boolean(
      editingReservation &&
      !isDuplicating &&
      isEditingRecurring &&
      updateScope === 'single'
    );
  }, [editingReservation, isDuplicating, isEditingRecurring, updateScope]);

  // All reservations in this recurring series, sorted chronologically
  const seriesReservations = useMemo<Reservation[]>(() => {
    if (!editingReservation || isDuplicating || isSingleDayMultiSpaceReservation(editingReservation)) return [];
    const deletedSet = getDeletedIds();
    const isCleanActive = (r: Reservation) =>
      !deletedSet.has(r.id) &&
      r.estado !== 'eliminada' &&
      (r as any).eliminada !== true &&
      isReservationActiveForAvailability(r);

    const sId = editingReservation.serieRecurrente || editingReservation.recurrenteId;
    if (sId && allReservations) {
      const matches = allReservations
        .filter((r) => isCleanActive(r) && (r.serieRecurrente === sId || r.recurrenteId === sId))
        .sort((a, b) => {
          if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
          return a.horaInicio.localeCompare(b.horaInicio);
        });
      if (matches.length > 0) return matches;
    }
    if (editingReservation.actividadRecurrente === 'Sí' && allReservations) {
      const matches = allReservations
        .filter(
          (r) =>
            isCleanActive(r) &&
            (r.id === editingReservation.id ||
              (r.actividadRecurrente === 'Sí' &&
                r.tipoActividad === editingReservation.tipoActividad &&
                r.responsable === editingReservation.responsable &&
                r.espacio === editingReservation.espacio))
        )
        .sort((a, b) => {
          if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
          return a.horaInicio.localeCompare(b.horaInicio);
        });
      if (matches.length > 0) return matches;
    }
    return isCleanActive(editingReservation) ? [editingReservation] : [];
  }, [editingReservation, isDuplicating, allReservations]);

  const seriesCount = seriesReservations.length > 0
    ? seriesReservations.length
    : (editingReservation?.totalEnSerie || (editingReservation?.actividadRecurrente === 'Sí' ? 1 : 0));

  // The subset of reservations affected based on the selected updateScope
  const affectedReservations = useMemo<Reservation[]>(() => {
    if (!editingReservation) return [];
    const deletedSet = getDeletedIds();
    const isCleanActive = (r: Reservation) =>
      !deletedSet.has(r.id) &&
      r.estado !== 'eliminada' &&
      (r as any).eliminada !== true &&
      isReservationActiveForAvailability(r);

    const safeEditingRes = isCleanActive(editingReservation) ? [editingReservation] : [];

    if (!isEditingRecurring || isDuplicating) {
      return safeEditingRes;
    }
    if (updateScope === 'single') {
      return safeEditingRes;
    }
    if (updateScope === 'future') {
      const refDate = editingReservation.fecha;
      const res = seriesReservations.filter((r) => r.fecha >= refDate);
      return res.length > 0 ? res : safeEditingRes;
    }
    if (updateScope === 'series') {
      return seriesReservations.length > 0 ? seriesReservations : safeEditingRes;
    }
    if (updateScope === 'dateRange') {
      if (!rangeStartDate || !rangeEndDate) return [];
      const minD = rangeStartDate <= rangeEndDate ? rangeStartDate : rangeEndDate;
      const maxD = rangeStartDate <= rangeEndDate ? rangeEndDate : rangeStartDate;
      const res = seriesReservations.filter((r) => r.fecha >= minD && r.fecha <= maxD);
      return res.length > 0 ? res : [];
    }
    if (updateScope === 'selected') {
      const res = seriesReservations.filter((r) => selectedOccurrenceIds.has(r.id));
      return res.length > 0 ? res : (selectedOccurrenceIds.has(editingReservation.id) && isCleanActive(editingReservation) ? [editingReservation] : []);
    }
    return safeEditingRes;
  }, [
    editingReservation,
    isEditingRecurring,
    isDuplicating,
    updateScope,
    seriesReservations,
    rangeStartDate,
    rangeEndDate,
    selectedOccurrenceIds
  ]);

  // Raw Pattern Dates generator with strictly inclusive end date boundary
  const rawPatternDates = useMemo(() => {
    if (bookingMode !== 'pattern') return [];
    if (!recurrenceStartDate || !recurrenceEndDate) return [];
    return generateRecurrenceDates(recurrenceStartDate, recurrenceEndDate, selectedDays);
  }, [bookingMode, recurrenceStartDate, recurrenceEndDate, selectedDays]);

  // Chilean holiday analysis for pattern recurrence
  const patternHolidayAnalysis = useMemo(() => {
    return filterOutChileanHolidays(rawPatternDates);
  }, [rawPatternDates]);

  // Applicant ratings history alert
  const responsibleHistoryAlert = useMemo(() => {
    return getResponsibleHistoryAlert(formData.responsable || '', formData.telefonoContacto, ratings);
  }, [formData.responsable, formData.telefonoContacto, ratings]);

  // Chilean holiday analysis for specific dates
  const specificHolidayAnalysis = useMemo(() => {
    return filterOutChileanHolidays(specificDates);
  }, [specificDates]);

  // Validation of the special authorization key 'CCD'
  const isHolidayAuthorized = useMemo(() => {
    return verifyHolidayOverrideKey(holidayOverrideKey);
  }, [holidayOverrideKey]);

  // Effective pattern dates: omits holidays unless user requested & entered valid CCD key
  const generatedDates = useMemo(() => {
    if (bookingMode !== 'pattern') return [];
    if (includeHolidaysInSeries && isHolidayAuthorized) {
      return rawPatternDates;
    }
    return patternHolidayAnalysis.validDates;
  }, [bookingMode, includeHolidaysInSeries, isHolidayAuthorized, rawPatternDates, patternHolidayAnalysis]);

  // Single date holiday info
  const singleDateHolidayInfo = useMemo(() => {
    return getChileanHolidayInfo(formData.fecha || editingReservation?.fecha || '');
  }, [formData.fecha, editingReservation?.fecha]);

  // Excluded IDs and series for conflict detection when editing
  const excludeReservationIds = useMemo(() => {
    if (isDuplicating || !editingReservation) return [];
    const ids: string[] = [];
    if (editingReservation.id) ids.push(editingReservation.id);
    if (formData.id && formData.id !== editingReservation.id) ids.push(formData.id);

    // If editing recurring series, exclude all reservations affected in current scope
    if (isEditingRecurring) {
      if (updateScope === 'single') {
        ids.push(editingReservation.id);
      } else {
        affectedReservations.forEach((r) => ids.push(r.id));
      }
    }
    return Array.from(new Set(ids));
  }, [editingReservation, formData.id, isDuplicating, isEditingRecurring, updateScope, affectedReservations]);

  const excludeSeriesId = useMemo(() => {
    if (isDuplicating || !editingReservation) return undefined;
    if (isEditingRecurring && updateScope === 'series') {
      return editingReservation.serieRecurrente || editingReservation.recurrenteId || undefined;
    }
    return undefined;
  }, [editingReservation, isDuplicating, isEditingRecurring, updateScope]);

  return {
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
    excludeReservationIds,
    excludeSeriesId
  };
}
