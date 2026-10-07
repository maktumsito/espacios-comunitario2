import { ModalOverlay } from './common/ModalOverlay';
import React, { useState, useMemo } from 'react';
import { Reservation, SpaceInfo, CustomScheduleSlot, ConflictSavePayload } from '../types';
import { checkSingleConflict, timeToMinutes, formatMinutesToTime } from '../utils/conflictDetector';
import { findAvailableTimeSlotsInSpace, findAlternativeFreeSpaces } from '../utils/conflictRecommender';
import { formatDateDDMMYYYY, getDayOfWeekFromDateString } from '../utils/dateUtils';
import {
  Flame,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Clock,
  MapPin,
  Trash2,
  Check,
  X,
  Calendar,
  ShieldAlert
} from 'lucide-react';

export type { CustomScheduleSlot, ConflictSavePayload };

export interface CandidateConflictItem {
  id: string; // e.g. `${date}_slot${slotNumber}`
  date: string;
  slotNumber: 1 | 2;
  slotLabel: string;
  espacio: string;
  horaInicio: string;
  horaFin: string;
  conflicts: Reservation[];
}


interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSaveDirectly: (overrideAllowed: boolean, payload?: ConflictSavePayload) => void;
  bookingMode: 'single' | 'specific' | 'pattern';
  formData: Partial<Reservation>;
  isEditingSingleOccurrence?: boolean;
  editingReservation?: Reservation | null;
  enableSingleSecondSpace: boolean;
  singleSecondSpace?: string;
  singleSecondStartTime?: string;
  singleSecondEndTime?: string;
  specificDates: readonly string[] | string[];
  dateSchedules: Record<string, CustomScheduleSlot>;
  useCustomSchedulesPerDate: boolean;
  generatedDates: readonly string[] | string[];
  daySchedules: Record<number, CustomScheduleSlot>;
  useCustomSchedulesPerDay: boolean;
  availableSpaces: SpaceInfo[];
  allReservations: readonly Reservation[];
  excludeReservationIds?: readonly string[] | string[];
  excludeSeriesId?: string;
  allowConflictOverride: boolean;
  onUpdateFormData: (updater: (prev: Partial<Reservation>) => Partial<Reservation>) => void;
  onUpdateSecondSpace: (updates: { space?: string; startTime?: string; endTime?: string }) => void;
  onUpdateSpecificDates: (dates: string[]) => void;
  onUpdateDateSchedules: (updater: (prev: Record<string, CustomScheduleSlot>) => Record<string, CustomScheduleSlot>) => void;
  onConvertToSpecificDates: (dates: string[], schedules: Record<string, CustomScheduleSlot>) => void;
  onSetAllowConflictOverride: (allow: boolean) => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
  onConfirmSaveDirectly,
  bookingMode,
  formData,
  isEditingSingleOccurrence,
  editingReservation,
  enableSingleSecondSpace,
  singleSecondSpace,
  singleSecondStartTime,
  singleSecondEndTime,
  specificDates,
  dateSchedules,
  useCustomSchedulesPerDate,
  generatedDates,
  daySchedules,
  useCustomSchedulesPerDay,
  availableSpaces,
  allReservations,
  excludeReservationIds,
  excludeSeriesId,
  allowConflictOverride,
  onUpdateFormData,
  onUpdateSecondSpace,
  onUpdateSpecificDates,
  onUpdateDateSchedules,
  onConvertToSpecificDates,
  onSetAllowConflictOverride,
}) => {
  // Local state for individually permitted items
  const [individuallyPermittedKeys, setIndividuallyPermittedKeys] = useState<Set<string>>(new Set());
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Compute all candidate sessions and their conflicts
  const candidateSessions = useMemo<CandidateConflictItem[]>(() => {
    const items: CandidateConflictItem[] = [];

    if (bookingMode === 'single' || isEditingSingleOccurrence) {
      const d = isEditingSingleOccurrence ? (editingReservation?.fecha || formData.fecha) : formData.fecha;
      if (d && formData.espacio && formData.horaInicio && formData.horaFin) {
        const s1Conflicts = checkSingleConflict(
          {
            ...formData,
            fecha: d,
            horaInicio: formData.horaInicio,
            horaFin: formData.horaFin,
            espacio: formData.espacio
          },
          allReservations,
          excludeReservationIds,
          excludeSeriesId
        );
        items.push({
          id: `${d}_slot1`,
          date: d,
          slotNumber: 1,
          slotLabel: `1° Espacio: ${formData.espacio}`,
          espacio: formData.espacio,
          horaInicio: formData.horaInicio,
          horaFin: formData.horaFin,
          conflicts: s1Conflicts
        });
      }

      if (enableSingleSecondSpace && d && singleSecondSpace && singleSecondStartTime && singleSecondEndTime) {
        const s2Conflicts = checkSingleConflict(
          {
            ...formData,
            fecha: d,
            horaInicio: singleSecondStartTime,
            horaFin: singleSecondEndTime,
            espacio: singleSecondSpace
          },
          allReservations,
          excludeReservationIds,
          excludeSeriesId
        );
        items.push({
          id: `${d}_slot2`,
          date: d,
          slotNumber: 2,
          slotLabel: `2° Espacio: ${singleSecondSpace}`,
          espacio: singleSecondSpace,
          horaInicio: singleSecondStartTime,
          horaFin: singleSecondEndTime,
          conflicts: s2Conflicts
        });
      }
    } else if (bookingMode === 'specific') {
      specificDates.forEach((d) => {
        const customSlot = useCustomSchedulesPerDate ? dateSchedules[d] : undefined;
        const hInicio = customSlot?.horaInicio || formData.horaInicio || '10:00';
        const hFin = customSlot?.horaFin || formData.horaFin || '11:00';
        const esp = customSlot?.espacio || formData.espacio || availableSpaces[0]?.name;
        if (esp && hInicio && hFin) {
          const s1Conflicts = checkSingleConflict(
            { ...formData, fecha: d, horaInicio: hInicio, horaFin: hFin, espacio: esp },
            allReservations,
            excludeReservationIds,
            excludeSeriesId
          );
          items.push({
            id: `${d}_slot1`,
            date: d,
            slotNumber: 1,
            slotLabel: `1° Espacio: ${esp}`,
            espacio: esp,
            horaInicio: hInicio,
            horaFin: hFin,
            conflicts: s1Conflicts
          });
        }

        const hasSecond = useCustomSchedulesPerDate ? customSlot?.hasSecondSlot : enableSingleSecondSpace;
        const s2Esp = useCustomSchedulesPerDate ? customSlot?.secondEspacio : singleSecondSpace;
        const s2Start = useCustomSchedulesPerDate ? customSlot?.secondHoraInicio : singleSecondStartTime;
        const s2End = useCustomSchedulesPerDate ? customSlot?.secondHoraFin : singleSecondEndTime;

        if (hasSecond && s2Esp && s2Start && s2End) {
          const s2Conflicts = checkSingleConflict(
            { ...formData, fecha: d, horaInicio: s2Start, horaFin: s2End, espacio: s2Esp },
            allReservations,
            excludeReservationIds,
            excludeSeriesId
          );
          items.push({
            id: `${d}_slot2`,
            date: d,
            slotNumber: 2,
            slotLabel: `2° Espacio: ${s2Esp}`,
            espacio: s2Esp,
            horaInicio: s2Start,
            horaFin: s2End,
            conflicts: s2Conflicts
          });
        }
      });
    } else if (bookingMode === 'pattern') {
      generatedDates.forEach((d) => {
        const dayNum = getDayOfWeekFromDateString(d);
        const customSlot = useCustomSchedulesPerDay ? daySchedules[dayNum] : undefined;
        const hInicio = customSlot?.horaInicio || formData.horaInicio || '10:00';
        const hFin = customSlot?.horaFin || formData.horaFin || '11:00';
        const esp = customSlot?.espacio || formData.espacio || availableSpaces[0]?.name;
        if (esp && hInicio && hFin) {
          const s1Conflicts = checkSingleConflict(
            { ...formData, fecha: d, horaInicio: hInicio, horaFin: hFin, espacio: esp },
            allReservations,
            excludeReservationIds,
            excludeSeriesId
          );
          items.push({
            id: `${d}_slot1`,
            date: d,
            slotNumber: 1,
            slotLabel: `1° Espacio: ${esp}`,
            espacio: esp,
            horaInicio: hInicio,
            horaFin: hFin,
            conflicts: s1Conflicts
          });
        }

        const hasSecond = useCustomSchedulesPerDay ? customSlot?.hasSecondSlot : enableSingleSecondSpace;
        const s2Esp = useCustomSchedulesPerDay ? customSlot?.secondEspacio : singleSecondSpace;
        const s2Start = useCustomSchedulesPerDay ? customSlot?.secondHoraInicio : singleSecondStartTime;
        const s2End = useCustomSchedulesPerDay ? customSlot?.secondHoraFin : singleSecondEndTime;

        if (hasSecond && s2Esp && s2Start && s2End) {
          const s2Conflicts = checkSingleConflict(
            { ...formData, fecha: d, horaInicio: s2Start, horaFin: s2End, espacio: s2Esp },
            allReservations,
            excludeReservationIds,
            excludeSeriesId
          );
          items.push({
            id: `${d}_slot2`,
            date: d,
            slotNumber: 2,
            slotLabel: `2° Espacio: ${s2Esp}`,
            espacio: s2Esp,
            horaInicio: s2Start,
            horaFin: s2End,
            conflicts: s2Conflicts
          });
        }
      });
    }

    return items;
  }, [
    bookingMode,
    isEditingSingleOccurrence,
    editingReservation?.fecha,
    formData,
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
    excludeSeriesId
  ]);

  // Filter conflicting sessions
  const conflictingSessions = useMemo(() => {
    return candidateSessions.filter((s) => s.conflicts.length > 0);
  }, [candidateSessions]);

  // Group conflicting sessions by date
  const conflictingDates = useMemo(() => {
    return Array.from(new Set(conflictingSessions.map((s) => s.date))).sort();
  }, [conflictingSessions]);

  // Unresolved conflicts count (neither allowed globally nor individually)
  const unresolvedConflicts = useMemo(() => {
    if (allowConflictOverride) return [];
    return conflictingSessions.filter((s) => !individuallyPermittedKeys.has(s.id));
  }, [conflictingSessions, allowConflictOverride, individuallyPermittedKeys]);

  if (!isOpen) return null;

  // Helper to ensure we can edit individual dates (converts pattern to specific dates if necessary)
  const ensureEditableCustomSchedules = (): Record<string, CustomScheduleSlot> => {
    if (bookingMode === 'pattern') {
      const nextSchedules: Record<string, CustomScheduleSlot> = {};
      generatedDates.forEach((d) => {
        const dayNum = getDayOfWeekFromDateString(d);
        const sched = daySchedules[dayNum];
        nextSchedules[d] = {
          horaInicio: sched?.horaInicio || formData.horaInicio || '10:00',
          horaFin: sched?.horaFin || formData.horaFin || '11:00',
          espacio: sched?.espacio || formData.espacio,
          hasSecondSlot: sched?.hasSecondSlot ?? enableSingleSecondSpace,
          secondHoraInicio: sched?.secondHoraInicio || singleSecondStartTime || '11:00',
          secondHoraFin: sched?.secondHoraFin || singleSecondEndTime || '12:00',
          secondEspacio: sched?.secondEspacio || singleSecondSpace || availableSpaces[1]?.name || 'SALA 2'
        };
      });
      onConvertToSpecificDates([...generatedDates], nextSchedules);
      return nextSchedules;
    } else if (bookingMode === 'specific') {
      if (!useCustomSchedulesPerDate) {
        const nextSchedules: Record<string, CustomScheduleSlot> = {};
        specificDates.forEach((d) => {
          nextSchedules[d] = {
            horaInicio: formData.horaInicio || '10:00',
            horaFin: formData.horaFin || '11:00',
            espacio: formData.espacio,
            hasSecondSlot: enableSingleSecondSpace,
            secondHoraInicio: singleSecondStartTime || '11:00',
            secondHoraFin: singleSecondEndTime || '12:00',
            secondEspacio: singleSecondSpace || availableSpaces[1]?.name || 'SALA 2'
          };
        });
        onConvertToSpecificDates([...specificDates], nextSchedules);
        return nextSchedules;
      }
      return { ...dateSchedules };
    }
    return {};
  };

  // ==========================================
  // BULK ACTIONS (Corrección Masiva)
  // ==========================================

  // 1. Auto-ajustar masivamente todas las fechas con topamiento
  const handleBulkAutoAdjustAll = () => {
    let resolved = 0;

    if (bookingMode === 'single' || isEditingSingleOccurrence) {
      const targetDate = isEditingSingleOccurrence ? (editingReservation?.fecha || formData.fecha) : formData.fecha;
      if (!targetDate) return;

      const sMin1 = timeToMinutes(formData.horaInicio || '10:00');
      const eMin1 = timeToMinutes(formData.horaFin || '11:00');
      const dur1 = eMin1 > sMin1 ? eMin1 - sMin1 : 60;

      // Slot 1
      const s1Conflicts = checkSingleConflict(
        { ...formData, fecha: targetDate, horaInicio: formData.horaInicio, horaFin: formData.horaFin, espacio: formData.espacio },
        allReservations,
        excludeReservationIds,
        excludeSeriesId
      );
      if (s1Conflicts.length > 0 && formData.espacio) {
        const freeSlots = findAvailableTimeSlotsInSpace(
          targetDate,
          formData.espacio,
          dur1,
          allReservations,
          sMin1,
          excludeReservationIds,
          { maxSameSpaceSlots: 1, customSpacesList: availableSpaces },
          excludeSeriesId
        );
        if (freeSlots.length > 0) {
          onUpdateFormData((prev) => ({ ...prev, horaInicio: freeSlots[0].horaInicio, horaFin: freeSlots[0].horaFin }));
          resolved++;
        } else {
          const altSpaces = findAlternativeFreeSpaces(
            targetDate,
            sMin1,
            eMin1,
            formData.espacio,
            allReservations,
            formData.cantidadParticipantes,
            excludeReservationIds,
            { maxOtherSpaces: 1, customSpacesList: availableSpaces },
            excludeSeriesId
          );
          if (altSpaces.length > 0) {
            onUpdateFormData((prev) => ({ ...prev, espacio: altSpaces[0].espacio }));
            resolved++;
          }
        }
      }

      // Slot 2
      if (enableSingleSecondSpace && singleSecondSpace) {
        const sMin2 = timeToMinutes(singleSecondStartTime || '11:00');
        const eMin2 = timeToMinutes(singleSecondEndTime || '12:00');
        const dur2 = eMin2 > sMin2 ? eMin2 - sMin2 : 60;
        const s2Conflicts = checkSingleConflict(
          { ...formData, fecha: targetDate, horaInicio: singleSecondStartTime, horaFin: singleSecondEndTime, espacio: singleSecondSpace },
          allReservations,
          excludeReservationIds,
          excludeSeriesId
        );
        if (s2Conflicts.length > 0) {
          const freeSlots2 = findAvailableTimeSlotsInSpace(
            targetDate,
            singleSecondSpace,
            dur2,
            allReservations,
            sMin2,
            excludeReservationIds,
            { maxSameSpaceSlots: 1, customSpacesList: availableSpaces },
            excludeSeriesId
          );
          if (freeSlots2.length > 0) {
            onUpdateSecondSpace({ startTime: freeSlots2[0].horaInicio, endTime: freeSlots2[0].horaFin });
            resolved++;
          } else {
            const altSpaces2 = findAlternativeFreeSpaces(
              targetDate,
              sMin2,
              eMin2,
              singleSecondSpace,
              allReservations,
              formData.cantidadParticipantes,
              excludeReservationIds,
              { maxOtherSpaces: 1, customSpacesList: availableSpaces },
              excludeSeriesId
            );
            if (altSpaces2.length > 0) {
              onUpdateSecondSpace({ space: altSpaces2[0].espacio });
              resolved++;
            }
          }
        }
      }
    } else {
      // Multi-date: specific or pattern
      const currentSchedules = ensureEditableCustomSchedules();
      const updatedSchedules: Record<string, CustomScheduleSlot> = { ...currentSchedules };
      const datesToProcess = bookingMode === 'pattern' ? generatedDates : specificDates;

      for (const d of datesToProcess) {
        const slot = updatedSchedules[d] || {
          horaInicio: formData.horaInicio || '10:00',
          horaFin: formData.horaFin || '11:00',
          espacio: formData.espacio,
          hasSecondSlot: enableSingleSecondSpace,
          secondHoraInicio: singleSecondStartTime || '11:00',
          secondHoraFin: singleSecondEndTime || '12:00',
          secondEspacio: singleSecondSpace
        };

        const s1Conflicts = checkSingleConflict(
          { ...formData, fecha: d, horaInicio: slot.horaInicio, horaFin: slot.horaFin, espacio: slot.espacio },
          allReservations,
          excludeReservationIds,
          excludeSeriesId
        );

        if (s1Conflicts.length > 0) {
          const sMin = timeToMinutes(slot.horaInicio || '10:00');
          const eMin = timeToMinutes(slot.horaFin || '11:00');
          const dur = eMin > sMin ? eMin - sMin : 60;
          const freeSlots = findAvailableTimeSlotsInSpace(
            d,
            slot.espacio || formData.espacio || availableSpaces[0]?.name,
            dur,
            allReservations,
            sMin,
            excludeReservationIds,
            { maxSameSpaceSlots: 1, customSpacesList: availableSpaces },
            excludeSeriesId
          );
          if (freeSlots.length > 0) {
            updatedSchedules[d] = {
              ...(updatedSchedules[d] || slot),
              horaInicio: freeSlots[0].horaInicio,
              horaFin: freeSlots[0].horaFin
            };
            resolved++;
          } else {
            const altSpaces = findAlternativeFreeSpaces(
              d,
              sMin,
              eMin,
              slot.espacio || formData.espacio || availableSpaces[0]?.name,
              allReservations,
              formData.cantidadParticipantes,
              excludeReservationIds,
              { maxOtherSpaces: 1, customSpacesList: availableSpaces },
              excludeSeriesId
            );
            if (altSpaces.length > 0) {
              updatedSchedules[d] = {
                ...(updatedSchedules[d] || slot),
                espacio: altSpaces[0].espacio
              };
              resolved++;
            }
          }
        }

        if (slot.hasSecondSlot && slot.secondEspacio) {
          const s2Conflicts = checkSingleConflict(
            { ...formData, fecha: d, horaInicio: slot.secondHoraInicio, horaFin: slot.secondHoraFin, espacio: slot.secondEspacio },
            allReservations,
            excludeReservationIds,
            excludeSeriesId
          );
          if (s2Conflicts.length > 0) {
            const sMin2 = timeToMinutes(slot.secondHoraInicio || '11:00');
            const eMin2 = timeToMinutes(slot.secondHoraFin || '12:00');
            const dur2 = eMin2 > sMin2 ? eMin2 - sMin2 : 60;
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
              updatedSchedules[d] = {
                ...(updatedSchedules[d] || slot),
                secondHoraInicio: freeSlots2[0].horaInicio,
                secondHoraFin: freeSlots2[0].horaFin
              };
              resolved++;
            } else {
              const altSpaces2 = findAlternativeFreeSpaces(
                d,
                sMin2,
                eMin2,
                slot.secondEspacio,
                allReservations,
                formData.cantidadParticipantes,
                excludeReservationIds,
                { maxOtherSpaces: 1, customSpacesList: availableSpaces },
                excludeSeriesId
              );
              if (altSpaces2.length > 0) {
                updatedSchedules[d] = {
                  ...(updatedSchedules[d] || slot),
                  secondEspacio: altSpaces2[0].espacio
                };
                resolved++;
              }
            }
          }
        }
      }

      onUpdateDateSchedules(() => updatedSchedules);
    }

    if (resolved > 0) {
      setFeedbackMessage({
        type: 'success',
        text: `¡Se auto-ajustaron exitosamente ${resolved} bloque(s) a horarios o recintos disponibles!`
      });
    } else {
      setFeedbackMessage({
        type: 'info',
        text: 'No se encontraron bloques libres inmediatos en las salas solicitadas. Prueba cambiando de sala o ajustando el horario.'
      });
    }
  };

  // 2. Omitir masivamente todas las fechas con topamiento (solo en series)
  const handleBulkOmitConflictingDates = () => {
    if (bookingMode === 'single') return;

    const datesToExclude = new Set(conflictingDates);
    if (datesToExclude.size === 0) return;

    if (bookingMode === 'pattern') {
      const remainingDates = generatedDates.filter((d) => !datesToExclude.has(d));
      const schedules = ensureEditableCustomSchedules();
      onConvertToSpecificDates(remainingDates, schedules);
      setFeedbackMessage({
        type: 'success',
        text: `¡Se omitieron ${datesToExclude.size} fecha(s) en conflicto! La serie continuará con las ${remainingDates.length} fechas disponibles.`
      });
    } else {
      const remainingDates = specificDates.filter((d) => !datesToExclude.has(d));
      onUpdateSpecificDates(remainingDates);
      setFeedbackMessage({
        type: 'success',
        text: `¡Se omitieron ${datesToExclude.size} fecha(s) en conflicto! Quedan ${remainingDates.length} fechas en la serie.`
      });
    }
  };

  // 3. Desplazar horario general (+30m, +1h, -30m)
  const handleBulkShiftMinutes = (minutesDelta: number) => {
    const sMin = timeToMinutes(formData.horaInicio || '10:00') + minutesDelta;
    const eMin = timeToMinutes(formData.horaFin || '11:00') + minutesDelta;

    if (sMin < 360 || eMin > 1440) {
      setFeedbackMessage({
        type: 'error',
        text: 'El desplazamiento horario se sale del rango operativo.'
      });
      return;
    }

    const newStart = formatMinutesToTime(sMin);
    const newEnd = formatMinutesToTime(eMin);

    onUpdateFormData((prev) => ({
      ...prev,
      horaInicio: newStart,
      horaFin: newEnd
    }));

    // If custom schedules exist, shift them too
    if (useCustomSchedulesPerDate) {
      onUpdateDateSchedules((prev) => {
        const next: Record<string, CustomScheduleSlot> = {};
        Object.entries(prev).forEach(([dateKey, slot]) => {
          const curStart = timeToMinutes(slot.horaInicio || formData.horaInicio || '10:00') + minutesDelta;
          const curEnd = timeToMinutes(slot.horaFin || formData.horaFin || '11:00') + minutesDelta;
          next[dateKey] = {
            ...slot,
            horaInicio: formatMinutesToTime(Math.max(360, Math.min(1410, curStart))),
            horaFin: formatMinutesToTime(Math.max(390, Math.min(1440, curEnd)))
          };
        });
        return next;
      });
    }

    setFeedbackMessage({
      type: 'info',
      text: `Se desplazó el horario de la reserva a: ${newStart} - ${newEnd}.`
    });
  };

  // 4. Permitir topamiento masivo
  const handleBulkAllowOverride = () => {
    onSetAllowConflictOverride(true);
    setFeedbackMessage({
      type: 'info',
      text: 'Se autorizó el registro de todas las fechas a pesar del topamiento.'
    });
  };

  // ==========================================
  // INDIVIDUAL ACTIONS (Corrección Individual)
  // ==========================================

  // Auto-ajustar una fecha específica
  const handleIndividualAutoFix = (session: CandidateConflictItem) => {
    const sMin = timeToMinutes(session.horaInicio);
    const eMin = timeToMinutes(session.horaFin);
    const dur = eMin > sMin ? eMin - sMin : 60;

    const freeSlots = findAvailableTimeSlotsInSpace(
      session.date,
      session.espacio,
      dur,
      allReservations,
      sMin,
      excludeReservationIds,
      { maxSameSpaceSlots: 1, customSpacesList: availableSpaces },
      excludeSeriesId
    );

    if (freeSlots.length > 0) {
      applyIndividualSchedule(session.date, session.slotNumber, {
        horaInicio: freeSlots[0].horaInicio,
        horaFin: freeSlots[0].horaFin,
        espacio: session.espacio
      });
      setFeedbackMessage({
        type: 'success',
        text: `Fecha ${formatDateDDMMYYYY(session.date)}: Moviendo al bloque libre ${freeSlots[0].horaInicio} - ${freeSlots[0].horaFin}.`
      });
      return;
    }

    const altSpaces = findAlternativeFreeSpaces(
      session.date,
      sMin,
      eMin,
      session.espacio,
      allReservations,
      formData.cantidadParticipantes,
      excludeReservationIds,
      { maxOtherSpaces: 1, customSpacesList: availableSpaces },
      excludeSeriesId
    );

    if (altSpaces.length > 0) {
      applyIndividualSchedule(session.date, session.slotNumber, {
        horaInicio: session.horaInicio,
        horaFin: session.horaFin,
        espacio: altSpaces[0].espacio
      });
      setFeedbackMessage({
        type: 'success',
        text: `Fecha ${formatDateDDMMYYYY(session.date)}: Cambiado al espacio libre ${altSpaces[0].espacio}.`
      });
    } else {
      setFeedbackMessage({
        type: 'error',
        text: `No se encontraron bloques ni salas libres disponibles para el día ${formatDateDDMMYYYY(session.date)}.`
      });
    }
  };

  // Aplicar cambios individuales a fecha y slot
  const applyIndividualSchedule = (
    dateStr: string,
    slotNum: 1 | 2,
    updates: { horaInicio?: string; horaFin?: string; espacio?: string }
  ) => {
    if (bookingMode === 'single' || isEditingSingleOccurrence) {
      if (slotNum === 1) {
        onUpdateFormData((prev) => ({
          ...prev,
          ...(updates.horaInicio ? { horaInicio: updates.horaInicio } : {}),
          ...(updates.horaFin ? { horaFin: updates.horaFin } : {}),
          ...(updates.espacio ? { espacio: updates.espacio } : {})
        }));
      } else {
        onUpdateSecondSpace({
          ...(updates.horaInicio ? { startTime: updates.horaInicio } : {}),
          ...(updates.horaFin ? { endTime: updates.horaFin } : {}),
          ...(updates.espacio ? { space: updates.espacio } : {})
        });
      }
    } else {
      const currentSchedules = ensureEditableCustomSchedules();
      const existing = currentSchedules[dateStr] || {
        horaInicio: formData.horaInicio || '10:00',
        horaFin: formData.horaFin || '11:00',
        espacio: formData.espacio,
        hasSecondSlot: enableSingleSecondSpace,
        secondHoraInicio: singleSecondStartTime || '11:00',
        secondHoraFin: singleSecondEndTime || '12:00',
        secondEspacio: singleSecondSpace
      };

      const updatedSlot: CustomScheduleSlot = {
        ...existing,
        ...(slotNum === 1
          ? {
              ...(updates.horaInicio ? { horaInicio: updates.horaInicio } : {}),
              ...(updates.horaFin ? { horaFin: updates.horaFin } : {}),
              ...(updates.espacio ? { espacio: updates.espacio } : {})
            }
          : {
              ...(updates.horaInicio ? { secondHoraInicio: updates.horaInicio } : {}),
              ...(updates.horaFin ? { secondHoraFin: updates.horaFin } : {}),
              ...(updates.espacio ? { secondEspacio: updates.espacio } : {})
            })
      };

      onUpdateDateSchedules((prev) => ({
        ...prev,
        [dateStr]: updatedSlot
      }));
    }
  };

  // Omitir una fecha individual
  const handleIndividualOmitDate = (dateStr: string) => {
    if (bookingMode === 'single') return;

    if (bookingMode === 'pattern') {
      const remaining = generatedDates.filter((d) => d !== dateStr);
      const schedules = ensureEditableCustomSchedules();
      onConvertToSpecificDates(remaining, schedules);
    } else {
      onUpdateSpecificDates(specificDates.filter((d) => d !== dateStr));
    }

    setFeedbackMessage({
      type: 'info',
      text: `Fecha ${formatDateDDMMYYYY(dateStr)} excluida de la reserva.`
    });
  };

  // Alternar permiso individual para un conflicto
  const handleToggleIndividualPermit = (sessionKey: string) => {
    setIndividuallyPermittedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sessionKey)) {
        next.delete(sessionKey);
      } else {
        next.add(sessionKey);
      }
      return next;
    });
  };

  // Direct Save handler from inside this modal
  const handleDirectSave = () => {
    const hasUnresolved = unresolvedConflicts.length > 0;
    if (hasUnresolved) {
      setFeedbackMessage({
        type: 'error',
        text: `No es posible guardar: existen ${unresolvedConflicts.length} conflicto(s) de disponibilidad sin resolver. Por favor ajusta los horarios o elimina las fechas con topamiento antes de continuar.`
      });
      return;
    }

    onConfirmSaveDirectly(false, {
      bookingMode,
      specificDates: [...specificDates],
      dateSchedules: { ...dateSchedules },
      useCustomSchedulesPerDate,
      formDataUpdates: { ...formData },
      secondSpaceUpdates: {
        space: singleSecondSpace,
        startTime: singleSecondStartTime,
        endTime: singleSecondEndTime
      }
    });
  };

  return (
    <ModalOverlay onClose={onClose} className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl shadow-2xl border-2 border-rose-300 max-w-4xl w-full my-6 overflow-hidden flex flex-col max-h-[92vh] text-slate-900">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-slate-950 via-rose-950 to-slate-900 text-white flex items-start justify-between shrink-0">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 bg-rose-500/20 border border-rose-400/40 text-rose-300 rounded-2xl shrink-0 mt-0.5 shadow-xs">
              <Flame className="w-6 h-6 text-rose-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                  Alerta de Topamiento Detectado
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-400/30">
                  {conflictingDates.length} {conflictingDates.length === 1 ? 'Día en Conflicto' : 'Días en Conflicto'}
                </span>
              </div>
              <p className="text-xs text-rose-200/90 mt-1 max-w-2xl leading-relaxed">
                Se detectaron actividades previamente reservadas en los horarios solicitados. Puedes corregir todos los topamientos con 1 clic usando las <strong>opciones masivas</strong> o ajustar cada fecha de manera <strong>individual</strong> directamente en esta ventana.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
            title="Cerrar y volver al formulario"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Banner */}
        {feedbackMessage && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center justify-between border-b ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                : feedbackMessage.type === 'error'
                ? 'bg-rose-50 text-rose-900 border-rose-200'
                : 'bg-blue-50 text-blue-900 border-blue-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {feedbackMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {feedbackMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
              {feedbackMessage.type === 'info' && <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />}
              <span>{feedbackMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackMessage(null)}
              className="text-xs opacity-60 hover:opacity-100 cursor-pointer font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Body Scrollable Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          {/* Summary Metric Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Sesiones</span>
              <span className="text-base font-black text-slate-900 font-mono">
                {candidateSessions.length}
              </span>
            </div>
            <div className={`p-3 rounded-2xl border shadow-2xs ${conflictingSessions.length > 0 ? 'bg-rose-50 border-rose-200 text-rose-950' : 'bg-emerald-50 border-emerald-200 text-emerald-950'}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider block opacity-75">Bloques con Topamiento</span>
              <span className="text-base font-black font-mono">
                {conflictingSessions.length}
              </span>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Días Afectados</span>
              <span className="text-base font-black text-slate-900 font-mono">
                {conflictingDates.length}
              </span>
            </div>
            <div className={`p-3 rounded-2xl border shadow-2xs ${unresolvedConflicts.length === 0 ? 'bg-emerald-100/70 border-emerald-300 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-950'}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider block opacity-80">Por Resolver</span>
              <span className="text-base font-black font-mono">
                {unresolvedConflicts.length === 0 ? '0 (Todo Listo)' : unresolvedConflicts.length}
              </span>
            </div>
          </div>

          {/* ==================================================== */}
          {/* SECTION 1: CORRECCIÓN MASIVA                        */}
          {/* ==================================================== */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 border-2 border-indigo-200 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-2xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider">
                    Opciones de Corrección Masiva
                  </h4>
                  <p className="text-[11px] text-indigo-700">
                    Aplica soluciones automáticas a todas las fechas en conflicto con un solo clic.
                  </p>
                </div>
              </div>

              {allowConflictOverride && (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center space-x-1">
                  <ShieldAlert className="w-3 h-3 text-amber-600" />
                  <span>Topamiento Autorizado Globalmente</span>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {/* Option A: Auto-adjust all */}
              <button
                type="button"
                id="btn-conflict-bulk-autoadjust"
                onClick={handleBulkAutoAdjustAll}
                disabled={conflictingSessions.length === 0}
                className="p-3 bg-white hover:bg-indigo-50/70 border border-indigo-200 hover:border-indigo-400 rounded-xl text-left transition flex flex-col justify-between space-y-2 shadow-2xs group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">
                    Recomendado
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-800 group-hover:text-indigo-900">
                    Auto-Ajustar Todo
                  </div>
                  <div className="text-[10.5px] text-slate-500 leading-tight mt-0.5">
                    Reubica cada día a un bloque libre en la misma sala o sala alternativa.
                  </div>
                </div>
              </button>

              {/* Option B: Omit all conflicting dates (multi-day) */}
              {bookingMode !== 'single' && (
                <button
                  type="button"
                  id="btn-conflict-bulk-omit"
                  onClick={handleBulkOmitConflictingDates}
                  disabled={conflictingDates.length === 0}
                  className="p-3 bg-white hover:bg-rose-50/70 border border-slate-200 hover:border-rose-300 rounded-xl text-left transition flex flex-col justify-between space-y-2 shadow-2xs group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center justify-between">
                    <span className="p-1.5 bg-rose-100 text-rose-700 rounded-lg group-hover:bg-rose-600 group-hover:text-white transition">
                      <Trash2 className="w-4 h-4" />
                    </span>
                    <span className="text-[10px] font-mono text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                      -{conflictingDates.length} fechas
                    </span>
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-800 group-hover:text-rose-900">
                      Omitir Fechas con Conflicto
                    </div>
                    <div className="text-[10.5px] text-slate-500 leading-tight mt-0.5">
                      Elimina los días con topamiento y reserva únicamente las fechas libres.
                    </div>
                  </div>
                </button>
              )}

              {/* Option C: Shift hours by +30 min / +60 min */}
              <div className="p-3 bg-white border border-slate-200 rounded-xl text-left flex flex-col justify-between space-y-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                    <Clock className="w-4 h-4" />
                  </span>
                  <span className="text-[10.5px] font-bold text-slate-600">
                    Desplazar Horario
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-800">
                    Mover Todo el Rango
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => handleBulkShiftMinutes(30)}
                      className="flex-1 py-1 px-1.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded-lg text-[10px] font-bold transition text-center cursor-pointer"
                      title="Mover inicio y término +30 minutos"
                    >
                      +30m
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkShiftMinutes(60)}
                      className="flex-1 py-1 px-1.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded-lg text-[10px] font-bold transition text-center cursor-pointer"
                      title="Mover inicio y término +1 hora"
                    >
                      +1h
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkShiftMinutes(-30)}
                      className="flex-1 py-1 px-1.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-800 rounded-lg text-[10px] font-bold transition text-center cursor-pointer"
                      title="Mover inicio y término -30 minutos"
                    >
                      -30m
                    </button>
                  </div>
                </div>
              </div>

              {/* Option D: Allow all conflicts */}
              <button
                type="button"
                id="btn-conflict-bulk-allow"
                onClick={handleBulkAllowOverride}
                className={`p-3 border rounded-xl text-left transition flex flex-col justify-between space-y-2 shadow-2xs group cursor-pointer ${
                  allowConflictOverride
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-white hover:bg-amber-50/70 border-slate-200 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg group-hover:bg-amber-600 group-hover:text-white transition">
                    <ShieldAlert className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md">
                    Autorizar
                  </span>
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-800 group-hover:text-amber-950">
                    Permitir Topamiento Masivo
                  </div>
                  <div className="text-[10.5px] text-slate-500 leading-tight mt-0.5">
                    Permite guardar la reserva manteniendo la superposición de horarios.
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* ==================================================== */}
          {/* SECTION 2: CORRECCIÓN INDIVIDUAL                    */}
          {/* ==================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-slate-700" />
                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                  Revisión y Ajuste Individual por Fecha ({conflictingDates.length} días)
                </h4>
              </div>
              <span className="text-[11px] text-slate-500">
                Puedes cambiar sala, ajustar horas o auto-ajustar cada día por separado.
              </span>
            </div>

            {conflictingDates.length === 0 ? (
              <div className="p-8 text-center bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-xs">
                  <Check className="w-6 h-6 stroke-[3]" />
                </div>
                <h5 className="font-black text-sm text-emerald-950">
                  ¡Todos los topamientos han sido resueltos!
                </h5>
                <p className="text-xs text-emerald-800 max-w-md mx-auto">
                  No quedan conflictos de horario en ninguna fecha. Puedes guardar tu reserva con total tranquilidad.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {conflictingDates.map((dateStr) => {
                  const daySessions = conflictingSessions.filter((s) => s.date === dateStr);
                  const isDateExempt = daySessions.every(
                    (s) => allowConflictOverride || individuallyPermittedKeys.has(s.id)
                  );

                  return (
                    <div
                      key={dateStr}
                      className={`p-4 rounded-2xl border transition shadow-2xs space-y-3 ${
                        isDateExempt
                          ? 'bg-amber-50/50 border-amber-300'
                          : 'bg-white border-rose-200 hover:border-rose-300'
                      }`}
                    >
                      {/* Date Card Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center space-x-2.5">
                          <div className="px-2.5 py-1 bg-slate-900 text-white rounded-lg font-mono text-xs font-bold shadow-2xs">
                            {formatDateDDMMYYYY(dateStr)}
                          </div>
                          <div>
                            <span className="font-black text-xs text-slate-900 block capitalize">
                              {(() => {
                                const dayNum = getDayOfWeekFromDateString(dateStr);
                                const names = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                                return names[dayNum];
                              })()}
                            </span>
                            <span className="text-[10.5px] text-slate-500">
                              {daySessions.length} bloque(s) con topamiento en este día
                            </span>
                          </div>
                        </div>

                        {/* Omit day button (series only) */}
                        {bookingMode !== 'single' && (
                          <button
                            type="button"
                            onClick={() => handleIndividualOmitDate(dateStr)}
                            className="px-2.5 py-1 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
                            title="Omitir este día específico de la serie"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span>Omitir este día</span>
                          </button>
                        )}
                      </div>

                      {/* Sessions within this date */}
                      <div className="space-y-3">
                        {daySessions.map((session) => {
                          const isPermitted = allowConflictOverride || individuallyPermittedKeys.has(session.id);

                          return (
                            <div
                              key={session.id}
                              className={`p-3 rounded-xl border text-xs space-y-3 ${
                                isPermitted
                                  ? 'bg-white border-amber-200'
                                  : 'bg-rose-50/60 border-rose-200'
                              }`}
                            >
                              {/* Session info & conflicting bookings */}
                              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                                <div>
                                  <div className="flex items-center space-x-2">
                                    <span className="font-extrabold text-slate-900">
                                      {session.slotLabel}
                                    </span>
                                    <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md text-[11px] font-bold">
                                      {session.horaInicio} - {session.horaFin}
                                    </span>
                                    {isPermitted && (
                                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                                        Permitido
                                      </span>
                                    )}
                                  </div>

                                  {/* Overlapping bookings */}
                                  <div className="mt-1.5 space-y-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-900 block">
                                      Topa con {session.conflicts.length} reserva(s) existente(s):
                                    </span>
                                    {session.conflicts.map((c) => (
                                      <div
                                        key={c.id}
                                        className="bg-white px-2.5 py-1.5 rounded-lg border border-rose-200 flex items-center justify-between text-[11px]"
                                      >
                                        <span className="font-bold text-slate-800 truncate pr-2">
                                          {c.tipoActividad}: {c.descripcion}
                                        </span>
                                        <span className="font-mono text-slate-500 shrink-0">
                                          {c.horaInicio} - {c.horaFin} ({c.responsable})
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* Individual controls toolbar */}
                              <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {/* Auto-adjust button */}
                                  <button
                                    type="button"
                                    onClick={() => handleIndividualAutoFix(session)}
                                    className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-[11px] flex items-center space-x-1 shadow-2xs transition cursor-pointer"
                                    title="Buscar y aplicar el siguiente horario o espacio libre para este día"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    <span>Auto-Ajustar</span>
                                  </button>

                                  {/* Change space dropdown */}
                                  <div className="flex items-center space-x-1 bg-white px-2 py-1 rounded-lg border border-slate-200">
                                    <MapPin className="w-3 h-3 text-slate-400" />
                                    <select
                                      aria-label={`Cambiar sala para fecha ${session.date}`}
                                      value={session.espacio}
                                      onChange={(e) =>
                                        applyIndividualSchedule(session.date, session.slotNumber, {
                                          espacio: e.target.value
                                        })
                                      }
                                      className="text-[11px] font-bold text-slate-700 bg-transparent border-0 p-0 focus:ring-0 cursor-pointer"
                                    >
                                      {availableSpaces.map((sp) => (
                                        <option key={sp.id} value={sp.name}>
                                          {sp.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* Manual inline time inputs */}
                                  <div className="flex items-center space-x-1 bg-white px-2 py-1 rounded-lg border border-slate-200 font-mono text-[11px]">
                                    <Clock className="w-3 h-3 text-slate-400" />
                                    <input
                                      type="time"
                                      aria-label={`Hora inicio para fecha ${session.date}`}
                                      value={session.horaInicio}
                                      onChange={(e) =>
                                        applyIndividualSchedule(session.date, session.slotNumber, {
                                          horaInicio: e.target.value
                                        })
                                      }
                                      className="p-0 border-0 text-[11px] font-bold text-slate-800 bg-transparent focus:ring-0"
                                    />
                                    <span className="text-slate-400">-</span>
                                    <input
                                      type="time"
                                      aria-label={`Hora fin para fecha ${session.date}`}
                                      value={session.horaFin}
                                      onChange={(e) =>
                                        applyIndividualSchedule(session.date, session.slotNumber, {
                                          horaFin: e.target.value
                                        })
                                      }
                                      className="p-0 border-0 text-[11px] font-bold text-slate-800 bg-transparent focus:ring-0"
                                    />
                                  </div>
                                </div>

                                {/* Allow this day specifically */}
                                <label className="flex items-center space-x-1.5 text-slate-700 font-semibold cursor-pointer text-[11px]">
                                  <input
                                    type="checkbox"
                                    checked={individuallyPermittedKeys.has(session.id) || allowConflictOverride}
                                    onChange={() => handleToggleIndividualPermit(session.id)}
                                    className="rounded text-amber-600 focus:ring-amber-500 w-3.5 h-3.5 cursor-pointer"
                                  />
                                  <span>Permitir en este día</span>
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2 text-xs">
            {unresolvedConflicts.length === 0 ? (
              <span className="text-emerald-700 font-bold flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>¡Todos los topamientos han sido resueltos! Puedes guardar con seguridad.</span>
              </span>
            ) : (
              <span className="text-rose-800 font-semibold flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Quedan {unresolvedConflicts.length} conflicto(s) sin resolver.</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2.5 w-full sm:w-auto">
            <button
              type="button"
              id="btn-conflict-modal-close"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
            >
              Volver al Formulario
            </button>

            <button
              type="button"
              id="btn-conflict-modal-save"
              onClick={handleDirectSave}
              disabled={unresolvedConflicts.length > 0}
              className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black transition shadow-xs flex items-center justify-center space-x-2 ${
                unresolvedConflicts.length === 0
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-700/20 cursor-pointer'
                  : 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed shadow-none'
              }`}
            >
              {unresolvedConflicts.length === 0 ? (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Guardar Reserva Ahora</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-slate-400" />
                  <span>Resuelve los topamientos para guardar ({unresolvedConflicts.length})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
};
