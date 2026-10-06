import { useMemo } from 'react';
import { Reservation, SpaceRating, UpdateScope, isSingleDayMultiSpaceReservation } from '../types';
import { generateRecurrenceDates, getChileLocalDateString } from '../utils/dateUtils';
import { getSeriesEditStartDate } from '../utils/recurringEdits';
import { isDateInSeriesScope } from '../utils/recurringSchedule';
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
  const today = getChileLocalDateString();
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
      r.fecha >= today && !r.reemplazadaPorReservaId &&
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
      return matches;
    }
    if (editingReservation.actividadRecurrente === 'Sí' && allReservations) {
      const matches = allReservations
        .filter(
          (r) =>
            isCleanActive(r) &&
            (r.id === editingReservation.id ||
              (!r.serieRecurrente && !r.recurrenteId && r.actividadRecurrente === 'Sí' &&
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
  }, [editingReservation, isDuplicating, allReservations, today]);

  const seriesCount = seriesReservations.length;

  // The subset of reservations affected based on the selected updateScope
  const affectedReservations = useMemo<Reservation[]>(() => {
    if (!editingReservation) return [];
    const deletedSet = getDeletedIds();
    const isCleanActive = (r: Reservation) =>
      !deletedSet.has(r.id) &&
      r.estado !== 'eliminada' &&
      (r as any).eliminada !== true &&
      isReservationActiveForAvailability(r);

    const safeEditingRes = isCleanActive(editingReservation) && (!isEditingRecurring || editingReservation.fecha >= today) ? [editingReservation] : [];

    if (!isEditingRecurring || isDuplicating) {
      return safeEditingRes;
    }
    if (updateScope === 'single') {
      return safeEditingRes;
    }
    if (updateScope === 'future') {
      const refDate = editingReservation.fecha;
      const res = seriesReservations.filter((r) => r.fecha >= refDate);
      return res;
    }
    if (updateScope === 'series') {
      return seriesReservations;
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
      return res;
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
    selectedOccurrenceIds,
    today
  ]);

  // Raw Pattern Dates generator with strictly inclusive end date boundary
  const rawPatternDates = useMemo(() => {
    if (bookingMode !== 'pattern') return [];
    if (!recurrenceStartDate || !recurrenceEndDate) return [];
    const seriesId = !isDuplicating && (editingReservation?.serieRecurrente || editingReservation?.recurrenteId);
    const exceptions = new Set(allReservations.filter(r => r.reemplazadaPorReservaId && seriesId &&
      (r.serieRecurrente || r.recurrenteId) === seriesId && !allReservations.some(other =>
        other.fecha === r.fecha && (other.serieRecurrente || other.recurrenteId) === seriesId && !other.reemplazadaPorReservaId && isReservationActiveForAvailability(other))).map(r => r.fecha));
    const cutoff = isEditingRecurring ? getSeriesEditStartDate(updateScope, editingReservation!.fecha, today) : '';
    const context = editingReservation ? {scope: updateScope, source: editingReservation, history: allReservations, today, rangeStartDate, rangeEndDate, selectedIds: selectedOccurrenceIds} : null;
    return generateRecurrenceDates(recurrenceStartDate, recurrenceEndDate, selectedDays).filter(date => !exceptions.has(date) && date >= cutoff &&
      (!isEditingRecurring || updateScope === 'single' || !context || isDateInSeriesScope(date, context)));
  }, [bookingMode, recurrenceStartDate, recurrenceEndDate, selectedDays, editingReservation, isDuplicating, allReservations, isEditingRecurring, updateScope, today, rangeStartDate, rangeEndDate, selectedOccurrenceIds]);

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
    if (!isEditingRecurring && editingReservation.id) ids.push(editingReservation.id);
    if (!isEditingRecurring && formData.id && formData.id !== editingReservation.id) ids.push(formData.id);

    // If editing recurring series, exclude reservations in current scope or full series
    if (isEditingRecurring) {
      if (updateScope === 'single' && bookingMode === 'single') {
        ids.push(editingReservation.id);
      } else if (updateScope === 'series') {
        // Exclude pending members; historical reservations keep their occupancy.
        seriesReservations.forEach((r) => ids.push(r.id));
      } else {
        affectedReservations.forEach((r) => ids.push(r.id));
      }
    }
    return Array.from(new Set(ids));
  }, [editingReservation, formData.id, isDuplicating, isEditingRecurring, updateScope, bookingMode, seriesReservations, affectedReservations]);

  // Explicit IDs define the scope; historical members retain their occupancy.
  const excludeSeriesId: string | undefined = undefined;

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
