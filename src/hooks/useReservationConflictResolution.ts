import { useMemo } from 'react';
import { Reservation, SpaceInfo, UpdateScope, CustomScheduleSlot } from '../types';
import { checkSingleConflict, timeToMinutes, formatMinutesToTime } from '../utils/conflictDetector';
import {
  ConflictRecommendation,
  findAvailableTimeSlotsInSpace,
  findAlternativeFreeSpaces
} from '../utils/conflictRecommender';
import { formatDateDDMMYYYY, getDayOfWeekFromDateString } from '../utils/dateUtils';

interface UseReservationConflictResolutionProps {
  formData: Partial<Reservation>;
  allReservations: Reservation[];
  excludeReservationIds: string[];
  excludeSeriesId?: string;
  availableSpaces: SpaceInfo[];
  enableSingleSecondSpace: boolean;
  singleSecondSpace: string;
  singleSecondStartTime: string;
  singleSecondEndTime: string;
  bookingMode: 'single' | 'specific' | 'pattern';
  isEditingSingleOccurrence: boolean;
  editingReservation?: Reservation | null;
  isDuplicating?: boolean;
  isEditingRecurring: boolean;
  updateScope: UpdateScope;
  affectedReservations: Reservation[];
  useCustomSchedulesPerDate: boolean;
  dateSchedules: Record<string, CustomScheduleSlot>;
  specificDates: string[];
  useCustomSchedulesPerDay: boolean;
  daySchedules: Record<number, CustomScheduleSlot>;
  generatedDates: readonly string[] | string[];
  isExtensionAuthorized?: boolean;
  showFormFeedback: (message: string, type?: 'error' | 'warning' | 'info' | 'success') => void;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  setSingleSecondStartTime: React.Dispatch<React.SetStateAction<string>>;
  setSingleSecondEndTime: React.Dispatch<React.SetStateAction<string>>;
  setSingleSecondSpace: React.Dispatch<React.SetStateAction<string>>;
  setDateSchedules: React.Dispatch<React.SetStateAction<Record<string, CustomScheduleSlot>>>;
}

export function useReservationConflictResolution({
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
  isDuplicating = false,
  isEditingRecurring,
  updateScope,
  affectedReservations,
  useCustomSchedulesPerDate,
  dateSchedules,
  specificDates,
  useCustomSchedulesPerDay,
  daySchedules,
  generatedDates,
  isExtensionAuthorized = false,
  showFormFeedback,
  setFormData,
  setSingleSecondStartTime,
  setSingleSecondEndTime,
  setSingleSecondSpace,
  setDateSchedules
}: UseReservationConflictResolutionProps) {
  // Conflict calculation for individual date slots (primary slot 1 or secondary slot 2)
  const getDateSlotConflict = (
    dateStr: string,
    customSlot?: CustomScheduleSlot,
    slotNumber: 1 | 2 = 1
  ): Reservation[] => {
    if (slotNumber === 2) {
      const hInicio = customSlot?.secondHoraInicio || '11:00';
      const hFin = customSlot?.secondHoraFin || '12:00';
      const esp = customSlot?.secondEspacio || availableSpaces[1]?.name || 'SALA 2';
      return checkSingleConflict(
        {
          ...formData,
          fecha: dateStr,
          horaInicio: hInicio,
          horaFin: hFin,
          espacio: esp
        },
        allReservations,
        excludeReservationIds,
        excludeSeriesId
      );
    }

    const hInicio = customSlot?.horaInicio || formData.horaInicio || '10:00';
    const hFin = customSlot?.horaFin || formData.horaFin || '11:00';
    const esp = customSlot?.espacio || formData.espacio;
    return checkSingleConflict(
      {
        ...formData,
        fecha: dateStr,
        horaInicio: hInicio,
        horaFin: hFin,
        espacio: esp
      },
      allReservations,
      excludeReservationIds,
      excludeSeriesId
    );
  };

  // Conflict check for single date 2nd space
  const singleSecondSpaceConflicts = useMemo<Reservation[]>(() => {
    if (
      bookingMode !== 'single' ||
      !enableSingleSecondSpace ||
      !formData.fecha ||
      !singleSecondSpace ||
      !singleSecondStartTime ||
      !singleSecondEndTime
    ) {
      return [];
    }
    return checkSingleConflict(
      {
        ...formData,
        espacio: singleSecondSpace,
        horaInicio: singleSecondStartTime,
        horaFin: singleSecondEndTime
      },
      allReservations,
      excludeReservationIds,
      excludeSeriesId
    );
  }, [
    bookingMode,
    enableSingleSecondSpace,
    formData,
    singleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    allReservations,
    excludeReservationIds,
    excludeSeriesId
  ]);

  // Real-time conflict check memoized to avoid recalculating on every re-render and keystroke
  const conflicts = useMemo<Reservation[]>(() => {
    if (!formData.fecha || !formData.espacio || !formData.horaInicio || !formData.horaFin) return [];
    return checkSingleConflict(formData, allReservations, excludeReservationIds, excludeSeriesId);
  }, [
    formData.fecha,
    formData.horaInicio,
    formData.horaFin,
    formData.espacio,
    formData.terminaDiaSiguiente,
    allReservations,
    excludeReservationIds,
    excludeSeriesId
  ]);

  // Quick resolution options for the main conflict
  const mainDuration = useMemo<number>(() => {
    const sMin = timeToMinutes(formData.horaInicio || '10:00');
    const eMin = timeToMinutes(formData.horaFin || '11:00');
    if (formData.terminaDiaSiguiente || (eMin <= sMin && eMin > 0)) {
      return (24 * 60 - sMin) + eMin;
    }
    return eMin > sMin ? eMin - sMin : 60;
  }, [formData.horaInicio, formData.horaFin, formData.terminaDiaSiguiente]);

  const quickFreeSlots = useMemo(() => {
    if (!formData.fecha || !formData.espacio || conflicts.length === 0) return [];
    return findAvailableTimeSlotsInSpace(
      formData.fecha,
      formData.espacio,
      mainDuration,
      allReservations,
      timeToMinutes(formData.horaInicio || '10:00'),
      excludeReservationIds,
      { maxSameSpaceSlots: 3, customSpacesList: availableSpaces },
      excludeSeriesId
    );
  }, [formData.fecha, formData.espacio, formData.horaInicio, mainDuration, conflicts.length, allReservations, excludeReservationIds, availableSpaces, excludeSeriesId]);

  const quickAltSpaces = useMemo(() => {
    if (!formData.fecha || !formData.espacio || conflicts.length === 0) return [];
    const sMin = timeToMinutes(formData.horaInicio || '10:00');
    const eMin = timeToMinutes(formData.horaFin || '11:00');
    return findAlternativeFreeSpaces(
      formData.fecha,
      sMin,
      eMin,
      formData.espacio,
      allReservations,
      formData.cantidadParticipantes,
      excludeReservationIds,
      { maxOtherSpaces: 3, customSpacesList: availableSpaces },
      excludeSeriesId
    );
  }, [formData.fecha, formData.espacio, formData.horaInicio, formData.horaFin, formData.cantidadParticipantes, conflicts.length, allReservations, excludeReservationIds, availableSpaces, excludeSeriesId]);

  // Direct 1-click move immediately after a specific conflicting booking
  const handleShiftImmediatelyAfter = (conflictEndStr: string) => {
    const startMin = timeToMinutes(conflictEndStr);
    const endMin = startMin + mainDuration;
    if (endMin > 1380) {
      showFormFeedback('El horario resultante excede el horario operativo (23:00).', 'warning');
      return;
    }
    setFormData((prev) => ({
      ...prev,
      horaInicio: formatMinutesToTime(startMin),
      horaFin: formatMinutesToTime(endMin)
    }));
  };

  // Quick-solve for single day 2nd space
  const handleFindNextSlotForSecondSpace = () => {
    if (!formData.fecha || !singleSecondSpace) return;
    const sMin = timeToMinutes(singleSecondStartTime || '11:00');
    const eMin = timeToMinutes(singleSecondEndTime || '12:00');
    const dur = eMin > sMin ? eMin - sMin : 60;
    const slots = findAvailableTimeSlotsInSpace(
      formData.fecha,
      singleSecondSpace,
      dur,
      allReservations,
      sMin,
      excludeReservationIds,
      { maxSameSpaceSlots: 1, customSpacesList: availableSpaces },
      excludeSeriesId
    );
    if (slots.length > 0) {
      setSingleSecondStartTime(slots[0].horaInicio);
      setSingleSecondEndTime(slots[0].horaFin);
    } else {
      showFormFeedback(`No se encontró bloque libre en ${singleSecondSpace} para el día ${formatDateDDMMYYYY(formData.fecha)}.`, 'warning');
    }
  };

  const handleSwitchSecondSpaceToAvailable = () => {
    if (!formData.fecha) return;
    const sMin = timeToMinutes(singleSecondStartTime || '11:00');
    const eMin = timeToMinutes(singleSecondEndTime || '12:00');
    const freeRooms = findAlternativeFreeSpaces(
      formData.fecha,
      sMin,
      eMin,
      singleSecondSpace,
      allReservations,
      formData.cantidadParticipantes,
      excludeReservationIds,
      { maxOtherSpaces: 1, customSpacesList: availableSpaces },
      excludeSeriesId
    );
    if (freeRooms.length > 0) {
      setSingleSecondSpace(freeRooms[0].espacio);
    } else {
      showFormFeedback('No hay otros recintos libres en ese horario.', 'warning');
    }
  };

  // Auto-fix for specific date schedules
  const handleAutoFixDateSchedule = (d: string, slotNum: 1 | 2 = 1) => {
    const currentSlot = dateSchedules[d] || {
      horaInicio: formData.horaInicio || '10:00',
      horaFin: formData.horaFin || '11:00',
      espacio: formData.espacio
    };
    const targetSpace = slotNum === 1
      ? (currentSlot.espacio || formData.espacio || 'GIMNASIO')
      : (currentSlot.secondEspacio || availableSpaces[1]?.name || 'SALA 2');
    const startMin = timeToMinutes(slotNum === 1 ? (currentSlot.horaInicio || '10:00') : (currentSlot.secondHoraInicio || '11:00'));
    const endMin = timeToMinutes(slotNum === 1 ? (currentSlot.horaFin || '11:00') : (currentSlot.secondHoraFin || '12:00'));
    const dur = endMin - startMin > 0 ? endMin - startMin : 60;

    const slots = findAvailableTimeSlotsInSpace(
      d,
      targetSpace,
      dur,
      allReservations,
      startMin,
      excludeReservationIds,
      { maxSameSpaceSlots: 1, customSpacesList: availableSpaces },
      excludeSeriesId
    );

    if (slots.length > 0) {
      if (slotNum === 1) {
        setDateSchedules((prev) => ({
          ...prev,
          [d]: {
            ...(prev[d] || currentSlot),
            horaInicio: slots[0].horaInicio,
            horaFin: slots[0].horaFin
          }
        }));
      } else {
        setDateSchedules((prev) => ({
          ...prev,
          [d]: {
            ...(prev[d] || currentSlot),
            secondHoraInicio: slots[0].horaInicio,
            secondHoraFin: slots[0].horaFin
          }
        }));
      }
    } else {
      const altSpaces = findAlternativeFreeSpaces(
        d,
        startMin,
        endMin,
        targetSpace,
        allReservations,
        formData.cantidadParticipantes,
        excludeReservationIds,
        { maxOtherSpaces: 1, customSpacesList: availableSpaces },
        excludeSeriesId
      );
      if (altSpaces.length > 0) {
        if (slotNum === 1) {
          setDateSchedules((prev) => ({
            ...prev,
            [d]: {
              ...(prev[d] || currentSlot),
              espacio: altSpaces[0].espacio
            }
          }));
        } else {
          setDateSchedules((prev) => ({
            ...prev,
            [d]: {
              ...(prev[d] || currentSlot),
              secondEspacio: altSpaces[0].espacio
            }
          }));
        }
      } else {
        showFormFeedback(`No se encontró horario ni sala libre para la fecha ${formatDateDDMMYYYY(d)}.`, 'warning');
      }
    }
  };

  const handleAutoFixAllDatesWithConflicts = () => {
    let fixedCount = 0;
    setDateSchedules((prev) => {
      const updated = { ...prev };
      for (const d of specificDates) {
        const slot = updated[d] || {
          horaInicio: formData.horaInicio || '10:00',
          horaFin: formData.horaFin || '11:00',
          espacio: formData.espacio,
          hasSecondSlot: false
        };
        const s1Conflicts = getDateSlotConflict(d, slot, 1);
        if (s1Conflicts.length > 0) {
          const sMin = timeToMinutes(slot.horaInicio || '10:00');
          const eMin = timeToMinutes(slot.horaFin || '11:00');
          const dur = eMin - sMin > 0 ? eMin - sMin : 60;
          const freeSlots = findAvailableTimeSlotsInSpace(
            d,
            slot.espacio || formData.espacio || 'GIMNASIO',
            dur,
            allReservations,
            sMin,
            excludeReservationIds,
            { maxSameSpaceSlots: 1, customSpacesList: availableSpaces },
            excludeSeriesId
          );
          if (freeSlots.length > 0) {
            updated[d] = {
              ...(updated[d] || slot),
              horaInicio: freeSlots[0].horaInicio,
              horaFin: freeSlots[0].horaFin
            };
            fixedCount++;
          } else {
            const altSpaces = findAlternativeFreeSpaces(
              d,
              sMin,
              eMin,
              slot.espacio || formData.espacio || 'GIMNASIO',
              allReservations,
              formData.cantidadParticipantes,
              excludeReservationIds,
              { maxOtherSpaces: 1, customSpacesList: availableSpaces },
              excludeSeriesId
            );
            if (altSpaces.length > 0) {
              updated[d] = {
                ...(updated[d] || slot),
                espacio: altSpaces[0].espacio
              };
              fixedCount++;
            }
          }
        }
        if (slot.hasSecondSlot && slot.secondEspacio) {
          const s2Conflicts = getDateSlotConflict(d, slot, 2);
          if (s2Conflicts.length > 0) {
            const sMin2 = timeToMinutes(slot.secondHoraInicio || '11:00');
            const eMin2 = timeToMinutes(slot.secondHoraFin || '12:00');
            const dur2 = eMin2 - sMin2 > 0 ? eMin2 - sMin2 : 60;
            const freeSlots2 = findAvailableTimeSlotsInSpace(
              d,
              slot.secondEspacio,
              dur2,
              allReservations,
              sMin2,
              excludeReservationIds,
              { maxSameSpaceSlots: 1, customSpacesList: availableSpaces },
              excludeSeriesId
            );
            if (freeSlots2.length > 0) {
              updated[d] = {
                ...(updated[d] || slot),
                secondHoraInicio: freeSlots2[0].horaInicio,
                secondHoraFin: freeSlots2[0].horaFin
              };
              fixedCount++;
            }
          }
        }
      }
      return updated;
    });
    if (fixedCount > 0) {
      showFormFeedback(`¡Se auto-ajustaron ${fixedCount} horario(s) o espacio(s) con topamiento!`, 'success');
    } else {
      showFormFeedback('No se detectaron cambios pendientes o no hay bloques libres disponibles.', 'info');
    }
  };

  // Helper to suggest next available time slot in the same space on that day
  const handleFindNextAvailableSlot = () => {
    if (!formData.fecha || !formData.espacio) return;

    const duration =
      timeToMinutes(formData.horaFin || '11:00') - timeToMinutes(formData.horaInicio || '10:00');

    // Get all bookings on that day in this space
    const dayBookings = allReservations
      .filter(
        (r) =>
          !excludeReservationIds.includes(r.id) &&
          (!excludeSeriesId || (r.serieRecurrente !== excludeSeriesId && r.recurrenteId !== excludeSeriesId)) &&
          r.fecha === formData.fecha &&
          r.espacio.toUpperCase() === formData.espacio!.toUpperCase()
      )
      .map((r) => ({
        start: timeToMinutes(r.horaInicio),
        end: timeToMinutes(r.horaFin)
      }))
      .sort((a, b) => a.start - b.start);

    // Search between 08:30 (or 06:00 if extended) and 22:00 (or 24:00 if extended)
    const searchMin = isExtensionAuthorized ? 360 : 480;
    const searchMax = isExtensionAuthorized ? 1440 : 1320;
    let foundSlot: { start: number; end: number } | null = null;
    for (let t = searchMin; t + duration <= searchMax; t += 30) {
      const slotEnd = t + duration;
      const overlaps = dayBookings.some((b) => t < b.end && b.start < slotEnd);
      if (!overlaps) {
        foundSlot = { start: t, end: slotEnd };
        break;
      }
    }

    if (foundSlot) {
      setFormData((prev) => ({
        ...prev,
        horaInicio: formatMinutesToTime(foundSlot!.start),
        horaFin: formatMinutesToTime(foundSlot!.end)
      }));
    } else {
      showFormFeedback(`No se encontró un bloque libre de ${duration} minutos en ${formData.espacio} para la fecha ${formatDateDDMMYYYY(formData.fecha)}. Prueba en otro espacio o fecha.`, 'warning');
    }
  };

  // Apply recommendation handler from the smart recommender system
  const handleApplyRecommendation = (rec: ConflictRecommendation) => {
    setFormData((prev) => ({
      ...prev,
      fecha: rec.fecha || prev.fecha,
      horaInicio: rec.horaInicio,
      horaFin: rec.horaFin,
      espacio: rec.espacio
    }));
  };

  // Comprehensive candidate conflict dates check across all booking modes
  const candidateConflictDates = useMemo<string[]>(() => {
    const datesWithConflicts: string[] = [];

    if (editingReservation && !isDuplicating && isEditingRecurring) {
      if (updateScope === 'single') {
        const d = formData.fecha || editingReservation.fecha;
        if (d && formData.espacio && formData.horaInicio && formData.horaFin) {
          const s1 = checkSingleConflict(
            { ...formData, fecha: d, horaInicio: formData.horaInicio, horaFin: formData.horaFin, espacio: formData.espacio },
            allReservations,
            excludeReservationIds,
            excludeSeriesId
          );
          if (s1.length > 0) datesWithConflicts.push(d);
        }
      } else {
        affectedReservations.forEach((r) => {
          const s1 = checkSingleConflict(
            {
              ...formData,
              fecha: r.fecha,
              horaInicio: formData.horaInicio || r.horaInicio,
              horaFin: formData.horaFin || r.horaFin,
              espacio: formData.espacio || r.espacio
            },
            allReservations,
            excludeReservationIds,
            excludeSeriesId
          );
          if (s1.length > 0) datesWithConflicts.push(r.fecha);
        });
      }
      return Array.from(new Set(datesWithConflicts));
    }

    if (bookingMode === 'single' || isEditingSingleOccurrence) {
      const d = formData.fecha || editingReservation?.fecha;
      if (d && formData.espacio && formData.horaInicio && formData.horaFin) {
        const s1 = checkSingleConflict(
          { ...formData, fecha: d, horaInicio: formData.horaInicio, horaFin: formData.horaFin, espacio: formData.espacio },
          allReservations,
          excludeReservationIds,
          excludeSeriesId
        );
        const s2 = (enableSingleSecondSpace && singleSecondSpace && singleSecondStartTime && singleSecondEndTime)
          ? checkSingleConflict(
              { ...formData, fecha: d, horaInicio: singleSecondStartTime, horaFin: singleSecondEndTime, espacio: singleSecondSpace },
              allReservations,
              excludeReservationIds,
              excludeSeriesId
            )
          : [];
        if (s1.length > 0 || s2.length > 0) {
          datesWithConflicts.push(d);
        }
      }
    } else if (bookingMode === 'specific') {
      specificDates.forEach((d) => {
        const customSlot = useCustomSchedulesPerDate ? dateSchedules[d] : undefined;
        const hInicio = customSlot?.horaInicio || formData.horaInicio || '10:00';
        const hFin = customSlot?.horaFin || formData.horaFin || '11:00';
        const esp = customSlot?.espacio || formData.espacio || availableSpaces[0]?.name;
        const s1 = (esp && hInicio && hFin)
          ? checkSingleConflict(
              { ...formData, fecha: d, horaInicio: hInicio, horaFin: hFin, espacio: esp },
              allReservations,
              excludeReservationIds,
              excludeSeriesId
            )
          : [];

        const hasSecond = useCustomSchedulesPerDate ? customSlot?.hasSecondSlot : enableSingleSecondSpace;
        const s2Esp = useCustomSchedulesPerDate ? customSlot?.secondEspacio : singleSecondSpace;
        const s2Start = useCustomSchedulesPerDate ? customSlot?.secondHoraInicio : singleSecondStartTime;
        const s2End = useCustomSchedulesPerDate ? customSlot?.secondHoraFin : singleSecondEndTime;
        const s2 = (hasSecond && s2Esp && s2Start && s2End)
          ? checkSingleConflict(
              { ...formData, fecha: d, horaInicio: s2Start, horaFin: s2End, espacio: s2Esp },
              allReservations,
              excludeReservationIds,
              excludeSeriesId
            )
          : [];

        if (s1.length > 0 || s2.length > 0) {
          datesWithConflicts.push(d);
        }
      });
    } else if (bookingMode === 'pattern') {
      generatedDates.forEach((d) => {
        const dayNum = getDayOfWeekFromDateString(d);
        const customSlot = useCustomSchedulesPerDay ? daySchedules[dayNum] : undefined;
        const hInicio = customSlot?.horaInicio || formData.horaInicio || '10:00';
        const hFin = customSlot?.horaFin || formData.horaFin || '11:00';
        const esp = customSlot?.espacio || formData.espacio || availableSpaces[0]?.name;
        const s1 = (esp && hInicio && hFin)
          ? checkSingleConflict(
              { ...formData, fecha: d, horaInicio: hInicio, horaFin: hFin, espacio: esp },
              allReservations,
              excludeReservationIds,
              excludeSeriesId
            )
          : [];

        const hasSecond = useCustomSchedulesPerDay ? customSlot?.hasSecondSlot : enableSingleSecondSpace;
        const s2Esp = useCustomSchedulesPerDay ? customSlot?.secondEspacio : singleSecondSpace;
        const s2Start = useCustomSchedulesPerDay ? customSlot?.secondHoraInicio : singleSecondStartTime;
        const s2End = useCustomSchedulesPerDay ? customSlot?.secondHoraFin : singleSecondEndTime;
        const s2 = (hasSecond && s2Esp && s2Start && s2End)
          ? checkSingleConflict(
              { ...formData, fecha: d, horaInicio: s2Start, horaFin: s2End, espacio: s2Esp },
              allReservations,
              excludeReservationIds,
              excludeSeriesId
            )
          : [];

        if (s1.length > 0 || s2.length > 0) {
          datesWithConflicts.push(d);
        }
      });
    }

    return datesWithConflicts;
  }, [
    bookingMode,
    isEditingSingleOccurrence,
    editingReservation?.fecha,
    formData.fecha,
    formData.horaInicio,
    formData.horaFin,
    formData.espacio,
    formData.terminaDiaSiguiente,
    enableSingleSecondSpace,
    singleSecondSpace,
    singleSecondStartTime,
    singleSecondEndTime,
    specificDates,
    useCustomSchedulesPerDate,
    dateSchedules,
    generatedDates,
    useCustomSchedulesPerDay,
    daySchedules,
    allReservations,
    availableSpaces,
    excludeReservationIds,
    excludeSeriesId,
    editingReservation,
    isDuplicating,
    isEditingRecurring,
    updateScope,
    affectedReservations
  ]);

  return {
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
    candidateConflictDates
  };
}
