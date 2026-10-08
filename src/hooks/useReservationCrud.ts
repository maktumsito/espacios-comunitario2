import { useCallback, useRef } from 'react';
import { addWeeks, format, parseISO } from 'date-fns';
import { Reservation, BatchUpdateInfo, isSingleDayMultiSpaceReservation, SpaceBlock } from '../types';
import { normalizeSpaceName } from '../data/spacesData';
import { buildReplacementBatch, preserveReplacementExceptions } from '../utils/reservationReplacement';
import { applyChangedSeriesFields, scopedScheduleSlots } from '../utils/recurringSchedule';
import { calculateEquipmentAvailability, getStoredEquipment } from '../services/equipmentService';
import { buildReservationMoveBatch, getSeriesEditStartDate, type RecurringMoveScope } from '../utils/recurringEdits';
import { getChileLocalDateString } from '../utils/dateUtils';
import { checkLoanScheduleLimit } from '../utils/validationUtils';
import { isChileanHoliday } from '../utils/holidayUtils';
import {
  saveReservation,
  commitReservationChanges,
  queryReservationsBySeries,
  getLocalCache,
  ReservationWriteError,
  ReservationVersionError,
  saveReservationsBatch,
  deleteReservationById,
  deleteReservationsBatch,
  deleteSeriesByRecurrenteId,
  seedAllToFirestore,
  deleteAllHolidayReservations,
  getDeletedIds,
  recordDeletedId,
  unrecordDeletedId
} from '../services/reservationService';
import { recordAuditEntry, computeReservationDiff } from '../services/auditLogService';
import { notifyTopamiento, notifyImportantActivity } from '../services/notificationService';
import {
  detectBatchConflicts,
  formatConflictMessage,
  DetectedConflictDetail,
  isReservationActiveForAvailability,
  timeToMinutes,
  formatMinutesToTime,
  getConstituentSpaces
} from '../utils/conflictDetector';
import { getTimeIntervalsForReservation } from '../utils/conflictDetector';
import { findMaintenanceBlockConflicts, formatBlockConflictMessage } from '../utils/conflictDetector';
import {
  AuthUser,
  userCanCreateReservations,
  userCanEditReservations,
  userCanDeleteReservations
} from '../services/authService';

export interface UseReservationCrudProps {
  spaceBlocks?: readonly SpaceBlock[];
  reservations: Reservation[];
  setReservations: React.Dispatch<React.SetStateAction<Reservation[]>>;
  currentUser: AuthUser | null;
  triggerSyncToast: (message: string, type?: 'success' | 'info' | 'error' | 'warning') => void;
  setIsReservationModalOpen: (open: boolean) => void;
  setEditingReservation: (res: Reservation | null) => void;
  setSelectedReservation: (res: Reservation | null) => void;
  setIsDetailModalOpen: (open: boolean) => void;
  setIsDeleteModalOpen: (open: boolean) => void;
  setDeleteTargetReservation: (res: Reservation | null) => void;
  setConflictReportData: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    savedCount: number;
    conflicts: DetectedConflictDetail[];
  }>>;
  setIsDuplicating: (duplicating: boolean) => void;
  setPrefillDate: (val: string) => void;
  setPrefillSpace: (val: string) => void;
  setPrefillStartTime: (val: string) => void;
  setPrefillEndTime: (val: string) => void;
  selectedReservation: Reservation | null;
  requireAuth: (action: () => void, description?: string) => void;
  setIsFirebaseSyncing?: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFirebaseConnected?: React.Dispatch<React.SetStateAction<boolean>>;
  setLastSyncTime?: React.Dispatch<React.SetStateAction<number | null>>;
}

export interface UseReservationCrudReturn {
  handleMoveReservation: (original: Reservation, target: Reservation, scope: RecurringMoveScope) => Promise<boolean>;
  handleCreateOrUpdate: (
    reserva: Reservation,
    generateSeries?: boolean,
    seriesDates?: (string | { fecha: string; horaInicio?: string; horaFin?: string; espacio?: string })[],
    updateWholeSeries?: boolean,
    batchUpdateInfo?: BatchUpdateInfo,
    allowConflictOverride?: boolean
  ) => Promise<boolean>;
  handleDelete: (id: string, isSeries?: boolean, seriesId?: string) => Promise<void>;
  handleConfirmDeleteSingle: (id: string) => Promise<void>;
  handleConfirmDeleteSeries: (seriesId: string) => Promise<void>;
  handleRequestDelete: (reserva: Reservation) => void;
  handleSubmitDeleteRequest: (
    reservation: Reservation,
    motivo?: string,
    isSeries?: boolean,
    seriesId?: string
  ) => Promise<void>;
  handleAuthorizeDelete: (reservation: Reservation) => Promise<void>;
  handleRejectDeleteRequest: (reservation: Reservation) => Promise<void>;
  handleClearParticipants: (reserva: Reservation) => Promise<void>;
  handleQuickToggleRealizada: (reserva: Reservation) => Promise<void>;
  handleSyncAllToFirebase: () => Promise<any>;
  handleImportReservations: (importedList: Reservation[]) => Promise<void>;
  handleDeleteAllHolidays: () => Promise<{ deletedCount: number }>;
  handleDuplicateReservation: (sourceReserva: Reservation) => void;
  handleMergeReservations: (targetReservationId: string, sourceReservationId: string) => Promise<boolean>;
}

export function useReservationCrud({
  spaceBlocks = [],
  reservations,
  setReservations,
  currentUser,
  triggerSyncToast,
  setIsReservationModalOpen,
  setEditingReservation,
  setSelectedReservation,
  setIsDetailModalOpen,
  setIsDeleteModalOpen,
  setDeleteTargetReservation,
  setConflictReportData,
  setIsDuplicating,
  setPrefillDate,
  setPrefillSpace,
  setPrefillStartTime,
  setPrefillEndTime,
  selectedReservation,
  requireAuth,
  setIsFirebaseSyncing,
  setIsFirebaseConnected,
  setLastSyncTime
}: UseReservationCrudProps): UseReservationCrudReturn {

  const saveInFlight = useRef(false);
  const safeAudit: typeof recordAuditEntry = async (...args) => {
    try { return await recordAuditEntry(...args); }
    catch (error) {
      console.error('Auditoría pendiente de sincronización:', error);
      triggerSyncToast('Los datos se guardaron. No se pudo completar la auditoría.', 'warning');
      return undefined as any;
    }
  };

  const applyConfirmed = (result: Awaited<ReturnType<typeof commitReservationChanges>>) => {
    setReservations(prev => {
      const map = new Map(prev.map(r=>[r.id,r]));
      result.deletedIds.forEach(id=>map.delete(id));
      result.reservations.forEach(r=>map.set(r.id,r));
      return [...map.values()].sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.horaInicio.localeCompare(b.horaInicio));
    });
  };

  const handleRequestDelete = useCallback((reserva: Reservation) => {
    setDeleteTargetReservation(reserva);
    setIsDeleteModalOpen(true);
  }, [setDeleteTargetReservation, setIsDeleteModalOpen]);

  const handleDelete = useCallback(async (id: string, isSeries?: boolean, seriesId?: string) => {
    if (!userCanDeleteReservations(currentUser)) {
      const target = reservations.find((r) => r.id === id || (seriesId && (r.serieRecurrente === seriesId || r.recurrenteId === seriesId)));
      if (target) {
        handleRequestDelete(target);
        return;
      }
      triggerSyncToast('Permiso denegado: No tienes autorización para eliminar reservas directamente (gestión controlada por Cristian Shute).', 'error');
      return;
    }

    const targets = isSeries && seriesId
      ? reservations.filter(r=>r.serieRecurrente===seriesId || r.recurrenteId===seriesId)
      : reservations.filter(r=>r.id===id);
    try {
      applyConfirmed(await commitReservationChanges([], { deletedIds: targets.length ? targets.map(r=>r.id) : [id] }));
      if (selectedReservation && targets.some(r=>r.id===selectedReservation.id)) { setIsDetailModalOpen(false); setSelectedReservation(null); }
      triggerSyncToast('Eliminación confirmada.', 'success');
      void safeAudit({ action: isSeries ? 'DELETE_SERIES' : 'DELETE', description: `Eliminadas ${targets.length} reservas`, reservaId: seriesId || id, user: currentUser, previousState: isSeries ? targets : targets[0] });
    } catch (err: any) { triggerSyncToast(err?.message || 'No se pudo eliminar.', 'error'); throw err; }
  }, [currentUser, reservations, selectedReservation, setReservations, setIsDetailModalOpen, setSelectedReservation, triggerSyncToast, handleRequestDelete]);

  const handleConfirmDeleteSingle = useCallback(async (id: string) => {
    await handleDelete(id, false);
  }, [handleDelete]);

  const handleConfirmDeleteSeries = useCallback(async (seriesId: string) => {
    await handleDelete('', true, seriesId);
  }, [handleDelete]);

  const handleSubmitDeleteRequest = useCallback(async (
    reservation: Reservation,
    motivo?: string,
    isSeries?: boolean,
    seriesId?: string
  ) => {
    try {
      const solicitudInfo = {
        solicitadoPor: currentUser?.username || 'usuario',
        solicitadoPorNombre: currentUser?.name || currentUser?.username || 'Personal',
        solicitadoPorRol: currentUser?.role || 'Personal',
        fechaSolicitud: new Date().toISOString(),
        motivo: motivo?.trim() || undefined,
        esSerie: Boolean(isSeries)
      };

      if (isSeries && seriesId) {
        const toUpdate = reservations.filter(
          (r) => r.serieRecurrente === seriesId || r.recurrenteId === seriesId
        );
        const updatedList = toUpdate.map((r) => ({
          ...r,
          solicitudEliminacion: solicitudInfo
        }));



        applyConfirmed(await saveReservationsBatch(updatedList));

        void safeAudit({
          action: 'REQUEST_DELETE',
          description: `Solicitud de eliminación de serie enviada por ${currentUser?.name || currentUser?.username} (${toUpdate.length} reservas) - En espera de autorización. Motivo: ${motivo || 'No especificado'}`,
          reservaId: seriesId,
          user: currentUser,
          reservaTitle: reservation.tipoActividad,
          reservaFecha: reservation.fecha,
          reservaEspacio: reservation.espacio,
          reservaHorario: `${reservation.horaInicio} - ${reservation.horaFin}`,
          reservaResponsable: reservation.responsable
        });
      } else {
        const updatedReservation: Reservation = {
          ...reservation,
          solicitudEliminacion: solicitudInfo
        };



        applyConfirmed(await saveReservation(updatedReservation));

        void safeAudit({
          action: 'REQUEST_DELETE',
          description: `Solicitud de eliminación enviada por ${currentUser?.name || currentUser?.username} para reserva '${reservation.tipoActividad}' (${reservation.fecha}, ${reservation.espacio}) - En espera de autorización. Motivo: ${motivo || 'No especificado'}`,
          reservaId: reservation.id,
          user: currentUser,
          reservaTitle: reservation.tipoActividad,
          reservaFecha: reservation.fecha,
          reservaEspacio: reservation.espacio,
          reservaHorario: `${reservation.horaInicio} - ${reservation.horaFin}`,
          reservaResponsable: reservation.responsable
        });
      }

      triggerSyncToast(
        `Solicitud enviada correctamente. La reserva quedó 'En Espera de Autorización'. Un Administrador revisará la eliminación.`,
        'info'
      );
    } catch (err) {
      console.error('Error submitting delete request:', err);
      triggerSyncToast('Ocurrió un error al enviar la solicitud de eliminación.', 'error');
    }
  }, [currentUser, reservations, setReservations, triggerSyncToast]);

  const handleAuthorizeDelete = useCallback(async (reservation: Reservation) => {
    if (!userCanDeleteReservations(currentUser)) {
      triggerSyncToast('Permiso denegado: No tienes autorización para eliminar o autorizar eliminaciones de reservas (gestión controlada por Cristian Shute).', 'error');
      return;
    }

    try {
      const isSeries = reservation.solicitudEliminacion?.esSerie;
      const seriesId = reservation.recurrenteId || reservation.serieRecurrente;

      if (isSeries && seriesId) {
        const toDelete = reservations.filter(
          (r) => r.serieRecurrente === seriesId || r.recurrenteId === seriesId
        );

        await deleteSeriesByRecurrenteId(seriesId, toDelete.map(r=>r.id));
        void safeAudit({
          action: 'AUTHORIZE_DELETE',
          description: `Autorizada eliminación de serie recurrente (${toDelete.length} reservas) solicitada por ${reservation.solicitudEliminacion?.solicitadoPorNombre || 'Personal'}`,
          reservaId: seriesId,
          user: currentUser,
          reservaTitle: reservation.tipoActividad,
          reservaFecha: reservation.fecha,
          reservaEspacio: reservation.espacio,
          reservaHorario: `${reservation.horaInicio} - ${reservation.horaFin}`,
          reservaResponsable: reservation.responsable,
          previousState: toDelete
        });

        setReservations((prev) =>
          prev.filter((r) => r.serieRecurrente !== seriesId && r.recurrenteId !== seriesId)
        );

      } else {
        await deleteReservationById(reservation.id);
        void safeAudit({
          action: 'AUTHORIZE_DELETE',
          description: `Autorizada y confirmada eliminación definitiva de reserva '${reservation.tipoActividad}' (${reservation.fecha}, ${reservation.espacio}) solicitada por ${reservation.solicitudEliminacion?.solicitadoPorNombre || 'Personal'}`,
          reservaId: reservation.id,
          user: currentUser,
          reservaTitle: reservation.tipoActividad,
          reservaFecha: reservation.fecha,
          reservaEspacio: reservation.espacio,
          reservaHorario: `${reservation.horaInicio} - ${reservation.horaFin}`,
          reservaResponsable: reservation.responsable,
          previousState: reservation
        });

        setReservations((prev) => prev.filter((r) => r.id !== reservation.id));
      }

      if (selectedReservation?.id === reservation.id) {
        setIsDetailModalOpen(false);
        setSelectedReservation(null);
      }
    } catch (err) {
      console.error('Error authorizing delete:', err);
      triggerSyncToast('Ocurrió un error al autorizar la eliminación.', 'error');
    }
  }, [currentUser, reservations, selectedReservation, setReservations, setIsDetailModalOpen, setSelectedReservation, triggerSyncToast]);

  const handleRejectDeleteRequest = useCallback(async (reservation: Reservation) => {
    const isRequester = currentUser?.username === reservation.solicitudEliminacion?.solicitadoPor;
    if (!userCanDeleteReservations(currentUser) && !isRequester) {
      triggerSyncToast('Permiso denegado: Solo usuarios autorizados o el solicitante pueden descartar esta solicitud.', 'error');
      return;
    }

    try {
      const isSeries = reservation.solicitudEliminacion?.esSerie;
      const seriesId = reservation.recurrenteId || reservation.serieRecurrente;

      if (isSeries && seriesId) {
        const toUpdate = reservations.filter(
          (r) => r.serieRecurrente === seriesId || r.recurrenteId === seriesId
        );
        const updatedList = toUpdate.map((r) => {
          const copy = { ...r };
          delete copy.solicitudEliminacion;
          return copy;
        });



        applyConfirmed(await saveReservationsBatch(updatedList));

        void safeAudit({
          action: 'REJECT_DELETE_REQUEST',
          description: `Solicitud de eliminación de serie descartada/rechazada por ${currentUser?.name || currentUser?.username}. Las reservas se mantienen activas.`,
          reservaId: seriesId,
          user: currentUser,
          reservaTitle: reservation.tipoActividad,
          reservaFecha: reservation.fecha,
          reservaEspacio: reservation.espacio,
          reservaHorario: `${reservation.horaInicio} - ${reservation.horaFin}`,
          reservaResponsable: reservation.responsable
        });
      } else {
        const copy: Reservation = { ...reservation };
        delete copy.solicitudEliminacion;



        applyConfirmed(await saveReservation(copy));

        void safeAudit({
          action: 'REJECT_DELETE_REQUEST',
          description: `Solicitud de eliminación rechazada/descartada por ${currentUser?.name || currentUser?.username} para '${reservation.tipoActividad}'. La reserva permanece activa.`,
          reservaId: reservation.id,
          user: currentUser,
          reservaTitle: reservation.tipoActividad,
          reservaFecha: reservation.fecha,
          reservaEspacio: reservation.espacio,
          reservaHorario: `${reservation.horaInicio} - ${reservation.horaFin}`,
          reservaResponsable: reservation.responsable
        });
      }

      if (selectedReservation?.id === reservation.id) {
        const copy = { ...selectedReservation };
        delete copy.solicitudEliminacion;
        setSelectedReservation(copy);
      }
    } catch (err) {
      console.error('Error rejecting delete request:', err);
      triggerSyncToast('Ocurrió un error al procesar la solicitud.', 'error');
    }
  }, [currentUser, reservations, selectedReservation, setReservations, setSelectedReservation, triggerSyncToast]);

  const handleClearParticipants = useCallback(async (reserva: Reservation) => {
    if (!userCanEditReservations(currentUser)) {
      triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas (gestión controlada por Cristian Shute).', 'error');
      return;
    }
    const updated: Reservation = {
      ...reserva,
      cantidadParticipantes: 0
    };

    try {
      const confirmedWrite = await saveReservation(updated);
      applyConfirmed(confirmedWrite);
      triggerSyncToast('Aforo restablecido a 0', 'success');
        void safeAudit({
          action: 'CLEAR_PARTICIPANTS',
          description: `Limpiado aforo/participantes en reserva '${reserva.tipoActividad}' (anterior: ${reserva.cantidadParticipantes || 0})`,
          reservaId: reserva.id,
          user: currentUser,
          reservaTitle: reserva.tipoActividad,
          reservaFecha: reserva.fecha,
          reservaEspacio: reserva.espacio,
          reservaHorario: `${reserva.horaInicio} - ${reserva.horaFin}`,
          reservaResponsable: reserva.responsable,
          previousState: reserva,
          newState: confirmedWrite.reservations,
          newStateIsConfirmed: true
        });
    } catch (err: any) { triggerSyncToast(err?.message || 'No se pudo guardar el cambio.', 'error'); }
  }, [currentUser, setReservations, triggerSyncToast]);

  const handleQuickToggleRealizada = useCallback(async (reserva: Reservation) => {
    if (!userCanEditReservations(currentUser)) {
      triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas (gestión controlada por Cristian Shute).', 'error');
      return;
    }
    const nextVal = reserva.realizada === 'Sí' ? 'No' : 'Sí';
    const updated: Reservation = {
      ...reserva,
      realizada: nextVal
    };

    try {
      const confirmedWrite = await saveReservation(updated);
      applyConfirmed(confirmedWrite);
      triggerSyncToast(`Marcada como ${nextVal === 'Sí' ? 'Realizada' : 'Pendiente'}`, 'success');
        void safeAudit({
          action: 'TOGGLE_REALIZADA',
          description: `Cambiado estado 'Realizada' a '${nextVal}' en '${reserva.tipoActividad}' (${reserva.espacio})`,
          reservaId: reserva.id,
          user: currentUser,
          reservaTitle: reserva.tipoActividad,
          reservaFecha: reserva.fecha,
          reservaEspacio: reserva.espacio,
          reservaHorario: `${reserva.horaInicio} - ${reserva.horaFin}`,
          reservaResponsable: reserva.responsable,
          previousState: reserva,
          newState: confirmedWrite.reservations,
          newStateIsConfirmed: true
        });
    } catch (err: any) { triggerSyncToast(err?.message || 'No se pudo guardar el cambio.', 'error'); }
  }, [currentUser, setReservations, triggerSyncToast]);

  const handleSyncAllToFirebase = useCallback(async () => {
    if (setIsFirebaseSyncing) setIsFirebaseSyncing(true);
    try {
      const res = await seedAllToFirestore(reservations);
      if (setIsFirebaseConnected) setIsFirebaseConnected(true);
      if (setLastSyncTime) setLastSyncTime(Date.now());
      return res;
    } finally {
      if (setIsFirebaseSyncing) setIsFirebaseSyncing(false);
    }
  }, [reservations, setIsFirebaseSyncing, setIsFirebaseConnected, setLastSyncTime]);

  const handleImportReservations = useCallback(async (importedList: Reservation[]) => {
    const existing = new Map(reservations.map(r=>[r.id,r]));
    const imported = [...new Map(importedList.map(r=>[r.id,{ ...r, version: existing.get(r.id)?.version || 0 }])).values()];
    if (imported.some(r=>existing.has(r.id)) && !userCanEditReservations(currentUser)) throw new Error('No tienes permiso para editar las reservas importadas.');
    if (imported.some(r=>!existing.has(r.id)) && !userCanCreateReservations(currentUser)) throw new Error('No tienes permiso para crear las reservas importadas.');
    const conflicts = detectBatchConflicts(imported, reservations, new Set(imported.map(r=>r.id)));
    if (conflicts.length) throw new Error(formatConflictMessage(conflicts[0]));
    const confirmedWrite = await saveReservationsBatch(imported);
    applyConfirmed(confirmedWrite);
    void safeAudit({
      action: 'BULK_IMPORT',
      description: `Importadas / Sincronizadas ${importedList.length} reservas`,
      reservaId: 'BULK_IMPORT',
      user: currentUser,
      previousState: imported.filter(r => existing.has(r.id)).map(r => existing.get(r.id)!),
      newState: confirmedWrite.reservations,
      newStateIsConfirmed: true
    });
  }, [reservations, currentUser, setReservations]);

  const handleDeleteAllHolidays = useCallback(async () => {
    const res = await deleteAllHolidayReservations();
    if (res.deletedCount > 0) {
      void safeAudit({
        action: 'DELETE_ALL_HOLIDAYS',
        description: `Eliminadas automáticamente ${res.deletedCount} reservas en días feriados de Chile`,
        reservaId: 'HOLIDAYS_PURGE',
        user: currentUser,
        previousState: res.deletedReservations
      });
    }
    setReservations(res.remainingReservations);
    return { deletedCount: res.deletedCount };
  }, [reservations, currentUser, setReservations]);

  const handleDuplicateReservation = useCallback((sourceReserva: Reservation) => {
    requireAuth(() => {
      if (!userCanCreateReservations(currentUser)) {
        triggerSyncToast('Permiso denegado: No tienes autorización para duplicar o registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
        return;
      }
      const newId = `RSV_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
      const duplicate: Reservation = {
        ...sourceReserva,
        id: newId,
        descripcion: sourceReserva.descripcion
          ? (sourceReserva.descripcion.includes('(Copia)') ? sourceReserva.descripcion : `${sourceReserva.descripcion} (Copia)`)
          : `${sourceReserva.tipoActividad || 'Reserva'} (Copia)`,
        realizada: 'No',
        actividadRecurrente: 'No',
        serieRecurrente: undefined,
        recurrenteId: undefined,
        indiceEnSerie: undefined,
        totalEnSerie: undefined,
        equipamientoSolicitado: sourceReserva.equipamientoSolicitado
          ? JSON.parse(JSON.stringify(sourceReserva.equipamientoSolicitado))
          : []
      };
      setEditingReservation(duplicate);
      setIsDuplicating(true);
      setPrefillDate(duplicate.fecha || format(new Date(), 'yyyy-MM-dd'));
      setPrefillSpace(duplicate.espacio);
      setPrefillStartTime(duplicate.horaInicio || '08:30');
      setPrefillEndTime(duplicate.horaFin || '09:30');
      setIsReservationModalOpen(true);
    }, 'duplicar esta reserva');
  }, [currentUser, requireAuth, triggerSyncToast, setEditingReservation, setIsDuplicating, setPrefillDate, setPrefillSpace, setPrefillStartTime, setPrefillEndTime, setIsReservationModalOpen]);

  const handleCreateOrUpdate = useCallback(async (
    reserva: Reservation,
    generateSeries?: boolean,
    seriesDates?: (string | { fecha: string; horaInicio?: string; horaFin?: string; espacio?: string })[],
    updateWholeSeries?: boolean,
    batchUpdateInfo?: BatchUpdateInfo,
    allowConflictOverride?: boolean
  ): Promise<boolean> => {
    if (saveInFlight.current) return false;
    saveInFlight.current = true;
    try {
      const today = getChileLocalDateString();
      const seriesIdForExceptions = reserva.serieRecurrente || reserva.recurrenteId;
      const editScope = batchUpdateInfo?.scope || (updateWholeSeries ? 'series' : 'single');
      const sourceDate = reservations.find(r => r.id === (batchUpdateInfo?.sourceReservationId || reserva.id))?.fecha || reserva.fecha;
      const editCutoff = getSeriesEditStartDate(editScope, sourceDate, today);
      const exceptionHistory = !batchUpdateInfo?.replacementOriginal && seriesIdForExceptions &&
        (updateWholeSeries || batchUpdateInfo && batchUpdateInfo.scope !== 'single')
        ? await queryReservationsBySeries(seriesIdForExceptions, editCutoff) : reservations;
      const protectedIds = new Set([...reservations, ...exceptionHistory].filter(r =>
        seriesIdForExceptions && (r.serieRecurrente || r.recurrenteId) === seriesIdForExceptions && r.fecha < editCutoff).map(r => r.id));
      if (batchUpdateInfo?.replacementOriginal) {
        if (!userCanEditReservations(currentUser) || !userCanCreateReservations(currentUser)) throw new Error('No tienes permiso para reemplazar esta sesión.');
        const original = batchUpdateInfo.replacementOriginal;
        const replacement = batchUpdateInfo.updatedReservations.find(r => r.reemplazaReservaId === original.id);
        if (!replacement) throw new Error('Falta la actividad excepcional.');
        batchUpdateInfo = buildReplacementBatch(original, replacement, replacement.id, replacement.motivoReemplazo || '');
        allowConflictOverride = false;
        for (const interval of getTimeIntervalsForReservation(replacement)) {
          const availability = calculateEquipmentAvailability(interval.date, interval.startMin, interval.endMin,
            reservations.filter(r => isReservationActiveForAvailability(r)), getStoredEquipment(), [original.id]);
          for (const requested of replacement.equipamientoSolicitado || []) {
            const item = availability.find(a => a.item.id === requested.equipmentId);
            if (!item || requested.quantity < 0 || requested.quantity > item.availableQuantity) throw new Error(`Equipamiento no disponible: ${requested.equipmentName || requested.equipmentId}.`);
          }
        }
      }
      // -------------------------------------------------------------
      // CASE 0: TARGETED BATCH UPDATE (PRECISE SCOPE: single, future, series, dateRange, selected)
      // -------------------------------------------------------------
      if (batchUpdateInfo) {
        if (!userCanEditReservations(currentUser)) {
          triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas existentes (gestión controlada por Cristian Shute).', 'error');
          return false;
        }

        const { scope, updatedReservations, affectedIds } = batchUpdateInfo;
        if (!batchUpdateInfo.replacementOriginal && scope !== 'single') {
          const exceptionIds = new Set(exceptionHistory.filter(r => r.reemplazadaPorReservaId).map(r => r.id));
          batchUpdateInfo = { ...batchUpdateInfo, deletedIds: batchUpdateInfo.deletedIds?.filter(id => !exceptionIds.has(id) && !protectedIds.has(id)) };
        }
        const deletedSet = getDeletedIds();
        const activeUpdated = (batchUpdateInfo.replacementOriginal || scope === 'single' ? updatedReservations : preserveReplacementExceptions(updatedReservations, exceptionHistory)).filter(
          (r) => !deletedSet.has(r.id) && r.estado !== 'eliminada' &&
            (scope === 'single' || !seriesIdForExceptions || r.fecha >= editCutoff && !protectedIds.has(r.id))
        );
        if (scope === 'single' && seriesIdForExceptions && activeUpdated.some(r => r.fecha < today || protectedIds.has(r.id))) throw new Error('La sesión ya pasó. Elige un alcance hacia adelante para conservar el historial.');
        if (activeUpdated.length === 0) {
          triggerSyncToast('No se encontraron reservas activas para actualizar.', 'warning');
          return false;
        }

        const existingIds = new Set([...reservations, ...exceptionHistory].map(r=>r.id));
        if (activeUpdated.some(r=>!existingIds.has(r.id)) && !userCanCreateReservations(currentUser)) throw new Error('No tienes permiso para agregar nuevas ocurrencias.');
        if (batchUpdateInfo.deletedIds?.length && !userCanDeleteReservations(currentUser)) throw new Error('No tienes permiso para eliminar ocurrencias.');
        const cleanAffectedIds = affectedIds.filter((id) => !deletedSet.has(id) && (scope === 'single' || !protectedIds.has(id)));
        const cleanReservations = [...new Map([...reservations,...exceptionHistory].map(r=>[r.id,r])).values()].filter(
          (r) => !deletedSet.has(r.id) && isReservationActiveForAvailability(r, deletedSet)
        );

        const seriesIdToExclude = undefined;

        // Validate conflicts excluding affected reservations and current series
        const conflictsFound = detectBatchConflicts(
          activeUpdated,
          cleanReservations,
          new Set([...cleanAffectedIds, ...(batchUpdateInfo.deletedIds || [])]),
          seriesIdToExclude
        );

        if (conflictsFound.length > 0 && !allowConflictOverride) {
          const firstConflict = conflictsFound[0];
          const conflictMsg = formatConflictMessage(firstConflict);
          triggerSyncToast(`Operación bloqueada por conflicto de disponibilidad:\n\n${conflictMsg}\n\nNo se realizaron modificaciones.`, 'error');
          return false;
        }
        const blocks = findMaintenanceBlockConflicts(activeUpdated.filter(r=>isReservationActiveForAvailability(r)),spaceBlocks);
        if (blocks.length) throw new Error(formatBlockConflictMessage(blocks[0]));
        const changedIds = new Set([...cleanAffectedIds,...(batchUpdateInfo.deletedIds||[])]);
        const afterChanges = [...cleanReservations.filter(r=>!changedIds.has(r.id)),...activeUpdated.filter(r=>isReservationActiveForAvailability(r))];
        for (const row of activeUpdated.filter(r=>isReservationActiveForAvailability(r))) {
          const requestedIds=new Set<string>();
          for (const request of row.equipamientoSolicitado||[]) {
            if (requestedIds.has(request.equipmentId)) throw new Error('El equipamiento solicitado contiene un elemento duplicado.');
            requestedIds.add(request.equipmentId);
          }
          for (const interval of getTimeIntervalsForReservation(row)) {
            const availability=calculateEquipmentAvailability(interval.date,interval.startMin,interval.endMin,afterChanges,getStoredEquipment(),row.id);
            for (const request of row.equipamientoSolicitado||[]) {
              const item=availability.find(a=>a.item.id===request.equipmentId);
              const quantity=Number(request.quantity);
              if (!item || !Number.isInteger(quantity) || quantity<0 || quantity>item.availableQuantity) throw new Error(`Equipamiento no disponible el ${row.fecha}: ${request.equipmentName}.`);
            }
          }
        }

        const scopeNames: Record<string, string> = {
          single: 'Solo esta reserva',
          future: 'Esta y las siguientes',
          series: 'Toda la serie',
          dateRange: 'Rango de fechas',
          selected: 'Fechas seleccionadas'
        };
        const firstRes = activeUpdated[0];
        const recurringEdit=Boolean(seriesIdForExceptions && !batchUpdateInfo.replacementOriginal);
        const writeOptions = {deletedIds: batchUpdateInfo.deletedIds,allowConflictOverride,
          ...(recurringEdit ? {requireAtomic:true,...(batchUpdateInfo.expectedVersions?{expectedVersions:batchUpdateInfo.expectedVersions}:{}),
            ...(!(batchUpdateInfo.addedIds||[]).length && activeUpdated.every(r=>existingIds.has(r.id)) ? {intent:'update' as const} : {})} : {})};
        const confirmedWrite = await commitReservationChanges(activeUpdated,writeOptions);
            void safeAudit({
              action: 'UPDATE',
              description: batchUpdateInfo.description || `Modificadas ${activeUpdated.length} reservas (${scopeNames[scope] || scope}) para '${firstRes.tipoActividad}' de ${firstRes.responsable}`,
              reservaId: firstRes.id,
              user: currentUser,
              reservaTitle: firstRes.tipoActividad,
              reservaFecha: firstRes.fecha,
              reservaEspacio: firstRes.espacio,
              reservaHorario: `${firstRes.horaInicio} - ${firstRes.horaFin}`,
              reservaResponsable: firstRes.responsable,
              newState: confirmedWrite.reservations,
              newStateIsConfirmed: true,
              previousState: [...new Map([...reservations, ...exceptionHistory, ...(batchUpdateInfo.replacementOriginal ? [batchUpdateInfo.replacementOriginal] : [])].map(r => [r.id, r])).values()]
                .filter(r => activeUpdated.some(next => next.id === r.id) || batchUpdateInfo!.deletedIds?.includes(r.id))
            });
        applyConfirmed(confirmedWrite);

        // Close only after the write confirms all requested changes.
        setIsReservationModalOpen(false);
        setEditingReservation(null);
        triggerSyncToast(batchUpdateInfo.replacementOriginal ? '✓ Reemplazo confirmado. Las demás fechas continúan normalmente.' : `✓ ${activeUpdated.length} reservas actualizadas y confirmadas`, 'success');





        if (conflictsFound.length > 0) {
          setConflictReportData({
            isOpen: true,
            savedCount: updatedReservations.length,
            conflicts: conflictsFound
          });
          try { notifyTopamiento(conflictsFound); } catch (error) { console.warn('Reserva confirmada; notificación pendiente:', error); }
        }

        if (firstRes.importante === 'Sí') {
          try { notifyImportantActivity(firstRes, 'updated'); } catch (error) { console.warn('Reserva confirmada; notificación pendiente:', error); }
        }

        return true;
      }

      // Normalize incoming series dates / multi-space segments into explicit independent slots
      const explicitSlots: Array<{ fecha: string; horaInicio: string; horaFin: string; espacio: string }> = (seriesDates || []).map((item) => {
        if (typeof item === 'string') {
          return {
            fecha: item,
            horaInicio: reserva.horaInicio || '10:00',
            horaFin: reserva.horaFin || '11:00',
            espacio: reserva.espacio || 'GIMNASIO'
          };
        }
        return {
          fecha: item.fecha,
          horaInicio: item.horaInicio || reserva.horaInicio || '10:00',
          horaFin: item.horaFin || reserva.horaFin || '11:00',
          espacio: item.espacio || reserva.espacio || 'GIMNASIO'
        };
      });

      // -------------------------------------------------------------
      // CASE 1: UPDATE ENTIRE EXISTING SERIES
      // -------------------------------------------------------------
      if (updateWholeSeries && !isSingleDayMultiSpaceReservation(reserva) && (reserva.serieRecurrente || reserva.recurrenteId || reserva.actividadRecurrente === 'Sí')) {
        if (!userCanEditReservations(currentUser)) {
          triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas existentes (gestión controlada por Cristian Shute).', 'error');
          return false;
        }
        const seriesId = reserva.serieRecurrente || reserva.recurrenteId;
        const deletedSet = getDeletedIds();

        // Find all active reservations in the series (strictly exclude deleted items)
        const seriesMatches = [...new Map([...reservations, ...exceptionHistory].map(r => [r.id, r])).values()].filter(
          (r) =>
            r.fecha >= editCutoff &&
            !exceptionHistory.some(e => e.id === r.id && e.reemplazadaPorReservaId) &&
            !deletedSet.has(r.id) &&
            r.estado !== 'eliminada' &&
            (r as any).eliminada !== true &&
            isReservationActiveForAvailability(r) &&
            (Boolean(seriesId && (r.serieRecurrente === seriesId || r.recurrenteId === seriesId)) ||
              r.id === reserva.id)
        );

        if (seriesMatches.length > 0) {
          const finalSeriesId = seriesId || seriesMatches[0].serieRecurrente || seriesMatches[0].recurrenteId || `SER_${reserva.id}`.slice(0,128);
          let updatedSeriesList: Reservation[] = [];
          const idsToDelete: string[] = [];

          if (explicitSlots.length > 0) {
            // Re-sync with explicit slots (supports multiple segments per day, e.g. 2 spaces/times on Monday & Wednesday)
            const history=[...new Map([...reservations,...exceptionHistory].map(r=>[r.id,r])).values()];
            const originalSource=history.find(r=>r.id===reserva.id)||reserva;
            const safeSlots = scopedScheduleSlots(explicitSlots,{scope:'series',source:originalSource,history,today});
            const totalCount = safeSlots.length;
            const existingByDate = new Map<string, Reservation[]>();
            seriesMatches.forEach((m) => {
              const list = existingByDate.get(m.fecha) || [];
              list.push(m);
              existingByDate.set(m.fecha, list);
            });

            const usedExistingIds = new Set<string>();

            updatedSeriesList = safeSlots.map((item, i) => {
              const matchesForDate = existingByDate.get(item.fecha) || [];

              // Best effort match: 1) Same space & time, 2) Same space, 3) Any unused for this date, 4) Any unused in series
              let availableMatch = item.sourceId ? matchesForDate.find(m=>m.id===item.sourceId) : undefined;
              if (!availableMatch) availableMatch = matchesForDate.find(
                (m) => !usedExistingIds.has(m.id) && m.espacio === item.espacio && m.horaInicio === item.horaInicio
              );
              if (!availableMatch) {
                availableMatch = matchesForDate.find(
                  (m) => !usedExistingIds.has(m.id) && m.espacio === item.espacio
                );
              }
              if (!availableMatch) {
                availableMatch = matchesForDate.find((m) => !usedExistingIds.has(m.id));
              }
              if (!availableMatch) {
                availableMatch = seriesMatches.find((m) => !usedExistingIds.has(m.id));
              }

              const clonedEquip = reserva.equipamientoSolicitado
                ? JSON.parse(JSON.stringify(reserva.equipamientoSolicitado))
                : [];

              if (availableMatch) {
                usedExistingIds.add(availableMatch.id);
                return {
                  ...applyChangedSeriesFields(availableMatch,reserva,originalSource),
                  id: availableMatch.id,
                  version: availableMatch.version || 0,
                  fecha: item.fecha,
                  horaInicio: item.horaInicio,
                  horaFin: item.horaFin,
                  espacio: item.espacio,
                  actividadRecurrente: 'Sí',
                  serieRecurrente: finalSeriesId,
                  recurrenteId: finalSeriesId,
                  indiceEnSerie: availableMatch.indiceEnSerie || i + 1,
                  totalEnSerie: totalCount,
                  fechaFinRecurrencia: reserva.fechaFinRecurrencia
                };
              } else {
                return {
                  ...reserva,
                  id: `RSV_${reserva.id}_${i + 1}`,
                  googleEventId: undefined, cartaCompromisoAdjunta: undefined, cartaCompromisoDescargada: false,
                  reemplazaReservaId: undefined, reemplazadaPorReservaId: undefined, motivoReemplazo: undefined,
                  version: 0,
                  fecha: item.fecha,
                  horaInicio: item.horaInicio,
                  horaFin: item.horaFin,
                  espacio: item.espacio,
                  actividadRecurrente: 'Sí',
                  serieRecurrente: finalSeriesId,
                  recurrenteId: finalSeriesId,
                  indiceEnSerie: i + 1,
                  totalEnSerie: totalCount,
                  equipamientoSolicitado: clonedEquip
                };
              }
            });

            // Mark unneeded existing series items for deletion (e.g. series was shortened)
            seriesMatches.forEach((m) => {
              if (!usedExistingIds.has(m.id)) {
                if (!isSingleDayMultiSpaceReservation(m)) {
                  idsToDelete.push(m.id);
                }
              }
            });
          } else {
            // General series metadata update while strictly preserving each session's individual date, time, and space
            updatedSeriesList = seriesMatches.map((item, idx) => ({
              ...item,
              descripcion: reserva.descripcion,
              tipoActividad: reserva.tipoActividad,
              responsable: reserva.responsable,
              telefonoContacto: reserva.telefonoContacto,
              emailContacto: reserva.emailContacto,
              tipoPrestamo: reserva.tipoPrestamo,
              importante: reserva.importante,
              comentarios: reserva.comentarios,
              rut: reserva.rut,
              domicilio: reserva.domicilio,
              cantidadParticipantes: reserva.cantidadParticipantes,
              equipamientoSolicitado: reserva.equipamientoSolicitado
                ? JSON.parse(JSON.stringify(reserva.equipamientoSolicitado))
                : [],
              requiereCartaCompromiso: reserva.requiereCartaCompromiso,
              cartaCompromisoDescargada: reserva.cartaCompromisoDescargada,
              cartaCompromisoAdjunta: reserva.cartaCompromisoAdjunta,
              actividadRecurrente: 'Sí',
              serieRecurrente: finalSeriesId,
              recurrenteId: finalSeriesId,
              indiceEnSerie: item.indiceEnSerie || idx + 1,
              totalEnSerie: seriesMatches.length
            }));
          }

          const deletedSet = getDeletedIds();
          const cleanReservations = reservations.filter(
            (r) => !deletedSet.has(r.id) && isReservationActiveForAvailability(r, deletedSet)
          );

          // Detect any batch conflicts independently for every segment excluding current series
          const conflictsFound = detectBatchConflicts(
            updatedSeriesList,
            cleanReservations,
            new Set(seriesMatches.map((m) => m.id))
          );

          if (conflictsFound.length > 0 && !allowConflictOverride) {
            const firstConflict = conflictsFound[0];
            const conflictMsg = formatConflictMessage(firstConflict);
            triggerSyncToast(`Operación bloqueada por conflicto de disponibilidad:\n\n${conflictMsg}\n\nNo se realizaron modificaciones en la serie.`, 'error');
            return false;
          }

          const blocks=findMaintenanceBlockConflicts(updatedSeriesList,spaceBlocks);
          if(blocks.length)throw new Error(formatBlockConflictMessage(blocks[0]));
          const confirmedWrite = await commitReservationChanges(updatedSeriesList, { deletedIds: idsToDelete, allowConflictOverride,
            requireAtomic:true,expectedVersions:{...Object.fromEntries(seriesMatches.map(r=>[r.id,r.version||0])),[reserva.id]:reserva.version||0} });
            void safeAudit({
                action: 'UPDATE',
                description: `Actualizada serie recurrente de ${updatedSeriesList.length} reservas para '${reserva.tipoActividad || 'Actividad'}' (${reserva.responsable})`,
                reservaId: finalSeriesId,
                user: currentUser,
                reservaTitle: reserva.tipoActividad,
                reservaFecha: reserva.fecha,
                reservaEspacio: reserva.espacio,
                reservaHorario: `${reserva.horaInicio} - ${reserva.horaFin}`,
                reservaResponsable: reserva.responsable,
                previousState: seriesMatches.filter(r => updatedSeriesList.some(next => next.id === r.id) || idsToDelete.includes(r.id)),
                newState: confirmedWrite.reservations,
                newStateIsConfirmed: true
              });
        applyConfirmed(confirmedWrite);

        // Close only after the write confirms all requested changes.
          setIsReservationModalOpen(false);
          setEditingReservation(null);
          triggerSyncToast(`✓ Serie actualizada y confirmada (${updatedSeriesList.length} sesiones)`, 'success');



          if (conflictsFound.length > 0) {
            setConflictReportData({
              isOpen: true,
              savedCount: updatedSeriesList.length,
              conflicts: conflictsFound
            });
            try { notifyTopamiento(conflictsFound); } catch (error) { console.warn('Reserva confirmada; notificación pendiente:', error); }
          }

          if (reserva.importante === 'Sí') {
            try { notifyImportantActivity(reserva, 'updated'); } catch (error) { console.warn('Reserva confirmada; notificación pendiente:', error); }
          }

          return true;
        }
      }

      // -------------------------------------------------------------
      // CASE 2: CREATE NEW SERIES OR MULTI-SEGMENT RESERVATIONS
      // -------------------------------------------------------------
      if (updateWholeSeries && seriesIdForExceptions) {
        triggerSyncToast('No hay sesiones pendientes para actualizar. Las sesiones pasadas se conservan.', 'warning');
        return false;
      }
      const isMultiSlot = explicitSlots.length > 0;
      const isSeriesCreation = generateSeries || isMultiSlot || (reserva.actividadRecurrente === 'Sí' && explicitSlots.length > 1);

      if (isSeriesCreation) {
        if (!userCanCreateReservations(currentUser)) {
          triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
          return false;
        }

        const isMultiSpaceSingleDay = (reserva.tipoRecurrencia === 'doble_espacio') ||
          (explicitSlots.length === 2 && explicitSlots[0].fecha === explicitSlots[1].fecha && reserva.actividadRecurrente !== 'Sí');

        const seriesId = isMultiSpaceSingleDay
          ? (reserva.serieRecurrente || reserva.recurrenteId || `DBL_${reserva.id}`.slice(0,128))
          : (reserva.serieRecurrente || reserva.recurrenteId || `SER_${reserva.id}`.slice(0,128));

        let itemsToGenerate: Array<{ fecha: string; horaInicio: string; horaFin: string; espacio: string }> = [];
        if (explicitSlots.length > 0) {
          itemsToGenerate = explicitSlots;
        } else {
          const totalWeeks = reserva.totalEnSerie || 12;
          const baseDate = parseISO(reserva.fecha);
          for (let i = 0; i < totalWeeks; i++) {
            itemsToGenerate.push({
              fecha: format(addWeeks(baseDate, i), 'yyyy-MM-dd'),
              horaInicio: reserva.horaInicio || '10:00',
              horaFin: reserva.horaFin || '11:00',
              espacio: reserva.espacio || 'GIMNASIO'
            });
          }
        }

        const totalCount = itemsToGenerate.length;
        const usedIds = new Set<string>();
        const nowIso = new Date().toISOString();

        const seriesList: Reservation[] = itemsToGenerate.map((item, i) => {
          const clonedEquip = reserva.equipamientoSolicitado
            ? JSON.parse(JSON.stringify(reserva.equipamientoSolicitado))
            : [];

          const uniqueId = i === 0 ? reserva.id : `RSV_${reserva.id}_${i + 1}`;
          usedIds.add(uniqueId);

          return {
            ...reserva,
            version: 0,
            id: uniqueId,
            fecha: item.fecha.trim().split('T')[0],
            horaInicio: item.horaInicio.trim(),
            horaFin: item.horaFin.trim(),
            espacio: normalizeSpaceName(item.espacio || reserva.espacio || 'GIMNASIO'),
            responsable: (reserva.responsable || 'Responsable').trim(),
            tipoActividad: (reserva.tipoActividad || 'Actividad').trim(),
            descripcion: (reserva.descripcion || '').trim(),
            estado: 'activa',
            realizada: 'No',
            actividadRecurrente: isMultiSpaceSingleDay ? 'No' : (totalCount > 1 || reserva.actividadRecurrente === 'Sí' ? 'Sí' : 'No'),
            serieRecurrente: seriesId,
            recurrenteId: seriesId,
            indiceEnSerie: i + 1,
            totalEnSerie: totalCount,
            tipoRecurrencia: isMultiSpaceSingleDay ? 'doble_espacio' : reserva.tipoRecurrencia,
            equipamientoSolicitado: clonedEquip,
            createdBy: reserva.createdBy || currentUser?.username || currentUser?.name || 'sistema',
            createdAt: reserva.createdAt || nowIso,
            updatedAt: nowIso
          };
        });

        const deletedSet = getDeletedIds();
        const cleanReservations = reservations.filter(
          (r) => !deletedSet.has(r.id) && isReservationActiveForAvailability(r, deletedSet)
        );

        // Detect any conflicts independently for every candidate segment against database
        const conflictsFound = detectBatchConflicts(seriesList, cleanReservations);

        if (conflictsFound.length > 0 && !allowConflictOverride) {
          const firstConflict = conflictsFound[0];
          const conflictMsg = formatConflictMessage(firstConflict);
          triggerSyncToast(`Creación bloqueada por conflicto de disponibilidad:\n\n${conflictMsg}\n\nNo se crearon las reservas.`, 'error');
          return false;
        }

        const confirmedWrite = await saveReservationsBatch(seriesList, { allowConflictOverride, intent:'create' });
            void safeAudit({
              action: 'CREATE',
              description: `Creada serie recurrente de ${seriesList.length} reservas para '${reserva.tipoActividad || 'Actividad'}' (${reserva.espacio})`,
              reservaId: seriesId || seriesList[0]?.id || 'SERIES',
              user: currentUser,
              reservaTitle: reserva.tipoActividad,
              reservaFecha: reserva.fecha,
              reservaEspacio: reserva.espacio,
              reservaHorario: `${reserva.horaInicio} - ${reserva.horaFin}`,
              reservaResponsable: reserva.responsable,
              newState: confirmedWrite.reservations,
              newStateIsConfirmed: true
            });
        applyConfirmed(confirmedWrite);

        // Close only after the write confirms all requested changes.
        setIsReservationModalOpen(false);
        setEditingReservation(null);
        triggerSyncToast(`✓ Serie de ${seriesList.length} reservas creada y confirmada`, 'success');



        // If conflicts were found across any dates/spaces, notify without truncating
        if (conflictsFound.length > 0) {
          setConflictReportData({
            isOpen: true,
            savedCount: seriesList.length,
            conflicts: conflictsFound
          });
          try { notifyTopamiento(conflictsFound); } catch (error) { console.warn('Reserva confirmada; notificación pendiente:', error); }
        }

        if (reserva.importante === 'Sí') {
          try { notifyImportantActivity(reserva, 'created'); } catch (error) { console.warn('Reserva confirmada; notificación pendiente:', error); }
        }

        return true;
      } else {
        // -------------------------------------------------------------
        // CASE 3: SINGLE STANDALONE RESERVATION
        // -------------------------------------------------------------
        const nowIso = new Date().toISOString();
        const baseReserva = isSingleDayMultiSpaceReservation(reserva)
          ? {
              ...reserva,
              actividadRecurrente: 'No' as const,
              serieRecurrente: undefined,
              recurrenteId: undefined
            }
          : reserva;

        const cleanReserva: Reservation = {
          ...baseReserva,
          id: baseReserva.id || `RSV_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
          fecha: baseReserva.fecha.trim().split('T')[0],
          horaInicio: baseReserva.horaInicio.trim(),
          horaFin: baseReserva.horaFin.trim(),
          espacio: normalizeSpaceName(baseReserva.espacio || 'GIMNASIO'),
          responsable: (baseReserva.responsable || 'Responsable').trim(),
          tipoActividad: (baseReserva.tipoActividad || 'Actividad').trim(),
          descripcion: (baseReserva.descripcion || '').trim(),
          estado: baseReserva.estado || 'activa',
          realizada: baseReserva.realizada || 'No',
          createdBy: baseReserva.createdBy || currentUser?.username || currentUser?.name || 'sistema',
          createdAt: baseReserva.createdAt || nowIso,
          updatedAt: nowIso
        };

        const existingRes = reservations.find((r) => r.id === cleanReserva.id);
        const isEditing = !!existingRes;
        if (isEditing && !userCanEditReservations(currentUser)) {
          triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas existentes (gestión controlada por Cristian Shute).', 'error');
          return false;
        }
        if (!isEditing && !userCanCreateReservations(currentUser)) {
          triggerSyncToast('Permiso denegado: No tienes autorización para registrar nuevas reservas (gestión controlada por Cristian Shute).', 'error');
          return false;
        }
        const deletedSet = getDeletedIds();
        const cleanReservations = reservations.filter(
          (r) => !deletedSet.has(r.id) && isReservationActiveForAvailability(r, deletedSet)
        );
        const conflictsFound = detectBatchConflicts([cleanReserva], cleanReservations, new Set([cleanReserva.id]));

        if (conflictsFound.length > 0 && !allowConflictOverride) {
          const firstConflict = conflictsFound[0];
          const conflictMsg = formatConflictMessage(firstConflict);
          triggerSyncToast(`Operación bloqueada por conflicto de disponibilidad:\n\n${conflictMsg}\n\nNo se guardó la reserva.`, 'error');
          return false;
        }

        const confirmedWrite = await saveReservation(cleanReserva, { allowConflictOverride, ...(isEditing ? {} : {intent:'create' as const}) });
            if (isEditing && existingRes) {
              const diffs = computeReservationDiff(existingRes, cleanReserva);
              void safeAudit({
                action: 'UPDATE',
                description: `Modificada reserva '${cleanReserva.tipoActividad || 'Actividad'}' de ${cleanReserva.responsable || 'Responsable'} (${diffs.length} cambios)`,
                reservaId: cleanReserva.id,
                user: currentUser,
                reservaTitle: cleanReserva.tipoActividad,
                reservaFecha: cleanReserva.fecha,
                reservaEspacio: cleanReserva.espacio,
                reservaHorario: `${cleanReserva.horaInicio} - ${cleanReserva.horaFin}`,
                reservaResponsable: cleanReserva.responsable,
                previousState: existingRes,
                newState: confirmedWrite.reservations,
                newStateIsConfirmed: true,
                diffs
              });
            } else {
              void safeAudit({
                action: 'CREATE',
                description: `Creada reserva '${cleanReserva.tipoActividad || 'Actividad'}' para ${cleanReserva.responsable || 'Responsable'} (${cleanReserva.espacio})`,
                reservaId: cleanReserva.id,
                user: currentUser,
                reservaTitle: cleanReserva.tipoActividad,
                reservaFecha: cleanReserva.fecha,
                reservaEspacio: cleanReserva.espacio,
                reservaHorario: `${cleanReserva.horaInicio} - ${cleanReserva.horaFin}`,
                reservaResponsable: cleanReserva.responsable,
                newState: confirmedWrite.reservations,
                newStateIsConfirmed: true
              });
            }
        applyConfirmed(confirmedWrite);

        // Close only after the write confirms all requested changes.
        setIsReservationModalOpen(false);
        setEditingReservation(null);
        triggerSyncToast(isEditing ? '✓ Reserva actualizada y confirmada' : '✓ Reserva guardada y confirmada', 'success');



        if (conflictsFound.length > 0) {
          setConflictReportData({
            isOpen: true,
            savedCount: 1,
            conflicts: conflictsFound
          });
          try { notifyTopamiento(conflictsFound); } catch (error) { console.warn('Reserva confirmada; notificación pendiente:', error); }
        }

        if (cleanReserva.importante === 'Sí') {
          try { notifyImportantActivity(cleanReserva, isEditing ? 'updated' : 'created'); } catch (error) { console.warn('Reserva confirmada; notificación pendiente:', error); }
        }

        return true;
      }
    } catch (err: any) {
      console.error('Error saving reservation:', err);
      if (err instanceof ReservationWriteError && err.cause instanceof ReservationVersionError && err.cause.current) {
        const current = err.cause.current;
        window.dispatchEvent(new CustomEvent('reservation-version-conflict', {detail:current}));
        setReservations(prev=>prev.map(r=>r.id===current.id ? current : r));
      }
      if (err instanceof ReservationWriteError && err.result.confirmedIds.length) {
        const confirmed = new Map(getLocalCache().map(r => [r.id,r]));
        const ids = new Set(err.result.confirmedIds);
        setReservations(prev => { const map = new Map(prev.map(r=>[r.id,r])); ids.forEach(id=> { if(confirmed.has(id)) map.set(id,confirmed.get(id)!); else map.delete(id); }); return [...map.values()]; });
      }
      triggerSyncToast(`Error al guardar: ${err?.message || 'Error de conexión'}. Tus datos se conservaron.`, 'error');
      return false;
    } finally { saveInFlight.current = false; }
  }, [reservations, currentUser, spaceBlocks, triggerSyncToast, setReservations, setIsReservationModalOpen, setEditingReservation, setConflictReportData]);

  const handleMoveReservation = useCallback(async (original: Reservation, target: Reservation, scope: RecurringMoveScope): Promise<boolean> => {
    if (saveInFlight.current) return false;
    if (!userCanEditReservations(currentUser)) {
      triggerSyncToast('No tienes permiso para mover reservas.', 'error'); return false;
    }
    saveInFlight.current = true;
    try {
      const today = getChileLocalDateString();
      const startDate = getSeriesEditStartDate(scope, original.fecha, today);
      const liveRows = scope === 'single' ? reservations : await queryReservationsBySeries(original.serieRecurrente || original.recurrenteId || '', startDate);
      const liveOriginal = liveRows.find(r => r.id === original.id);
      if (liveOriginal && !isReservationActiveForAvailability(liveOriginal)) throw new Error('La sesión ya no está activa. Recarga la agenda.');
      if ((!liveOriginal && original.fecha >= startDate) || liveOriginal && (liveOriginal.version || 0) !== (original.version || 0)) {
        throw new Error('La reserva cambió por otro usuario. Recarga la agenda antes de moverla.');
      }
      const batch = buildReservationMoveBatch(original, target, scope, liveRows, today);
      const history = [...new Map([...reservations, ...liveRows].map(r => [r.id, r])).values()];
      const requestedCount = batch.updatedReservations.length;
      // Recheck after each omission: its original slot remains occupied and can
      // prevent another session from moving (including across midnight).
      while (batch.updatedReservations.length) {
        const blocks = findMaintenanceBlockConflicts(batch.updatedReservations, spaceBlocks);
        const conflicts = detectBatchConflicts(batch.updatedReservations, history, new Set(batch.affectedIds));
        if (scope === 'single') {
          if (blocks.length) throw new Error(formatBlockConflictMessage(blocks[0]));
          if (conflicts.length) throw new Error(formatConflictMessage(conflicts[0]));
        }
        const unavailableIds = new Set([...blocks, ...conflicts].map(c => c.reserva.id));
        if (!unavailableIds.size) break;
        batch.updatedReservations = batch.updatedReservations.filter(r => !unavailableIds.has(r.id));
        batch.affectedIds = batch.updatedReservations.map(r => r.id);
      }
      if (!batch.updatedReservations.length) {
        triggerSyncToast('No hay sesiones disponibles para mover. Todas se conservaron sin cambios.', 'warning');
        return false;
      }
      const skippedCount = requestedCount - batch.updatedReservations.length;
      batch.description = batch.description!.replace(`Movidas ${requestedCount} reservas`, `Movidas ${batch.updatedReservations.length} reservas`);
      if (skippedCount) batch.description += ` Omitidas ${skippedCount} sesiones sin disponibilidad; se conservan sin cambios.`;
      const afterMove = [...history.filter(r => !batch.affectedIds.includes(r.id) && isReservationActiveForAvailability(r)), ...batch.updatedReservations];
      for (const row of batch.updatedReservations) {
        if (checkLoanScheduleLimit(row.horaInicio, row.horaFin, Boolean(row.terminaDiaSiguiente)).requiresAuthorization && !row.horarioExtendidoAutorizado) {
          throw new Error(`El horario del ${row.fecha} requiere autorización. Ajusta esa sesión desde el formulario.`);
        }
        for (const interval of getTimeIntervalsForReservation(row)) {
          const availability = calculateEquipmentAvailability(interval.date, interval.startMin, interval.endMin, afterMove, getStoredEquipment(), [row.id]);
          for (const request of row.equipamientoSolicitado || []) {
            const item = availability.find(a => a.item.id === request.equipmentId);
            if (!item || request.quantity > item.availableQuantity) throw new Error(`Equipamiento no disponible el ${row.fecha}: ${request.equipmentName}.`);
          }
        }
      }
      const result = await commitReservationChanges(batch.updatedReservations, { requireAtomic: true, allowConflictOverride: false, intent: 'update' });
      applyConfirmed(result);
      void safeAudit({ action: 'UPDATE', description: batch.description!, reservaId: original.id, user: currentUser,
        reservaTitle: original.tipoActividad, reservaFecha: original.fecha, reservaEspacio: target.espacio,
        previousState: history.filter(r => batch.affectedIds.includes(r.id)), newState: result.reservations, newStateIsConfirmed: true });
      triggerSyncToast(`✓ Movimiento confirmado (${result.reservations.length} reservas).${skippedCount ? ` Sesiones omitidas por falta de disponibilidad: ${skippedCount}. Se conservaron sin cambios.` : ''}`, skippedCount ? 'warning' : 'success');
      return true;
    } catch (err: any) {
      triggerSyncToast(err?.message || 'No se pudo mover la actividad. No se aplicó el movimiento.', 'error');
      return false;
    } finally { saveInFlight.current = false; }
  }, [reservations, currentUser, spaceBlocks, triggerSyncToast, setReservations]);

  const handleMergeReservations = useCallback(async (
    targetReservationId: string,
    sourceReservationId: string
  ): Promise<boolean> => {
    if (!targetReservationId || !sourceReservationId || targetReservationId === sourceReservationId) {
      triggerSyncToast('Debes seleccionar dos reservas distintas para unificarlas.', 'error');
      return false;
    }

    if (!userCanEditReservations(currentUser) || !userCanDeleteReservations(currentUser)) {
      triggerSyncToast('Permiso denegado: No tienes autorización para unificar o fusionar reservas (gestión controlada por Cristian Shute).', 'error');
      return false;
    }

    const previousReservations = reservations;
    const target = reservations.find((r) => r.id === targetReservationId);
    const source = reservations.find((r) => r.id === sourceReservationId);

    if (!target || !source) {
      triggerSyncToast('No se encontró una de las reservas seleccionadas para la unificación.', 'error');
      return false;
    }

    // Determine unified start and end times
    const tStartMin = timeToMinutes(target.horaInicio);
    let tEndMin = timeToMinutes(target.horaFin);
    if ((target.horaFin === '00:00' || target.horaFin === '24:00' || tEndMin === 0) && tStartMin > 0 && !target.terminaDiaSiguiente) {
      tEndMin = 1440;
    }

    const sStartMin = timeToMinutes(source.horaInicio);
    let sEndMin = timeToMinutes(source.horaFin);
    if ((source.horaFin === '00:00' || source.horaFin === '24:00' || sEndMin === 0) && sStartMin > 0 && !source.terminaDiaSiguiente) {
      sEndMin = 1440;
    }

    const mergedStartMin = Math.min(tStartMin, sStartMin);
    const mergedEndMin = Math.max(tEndMin, sEndMin);
    const mergedHoraInicio = formatMinutesToTime(mergedStartMin);
    const mergedHoraFin = mergedEndMin >= 1440 ? '23:59' : formatMinutesToTime(mergedEndMin);

    // Combine spaces
    let mergedEspacio = target.espacio;
    if (normalizeSpaceName(target.espacio) !== normalizeSpaceName(source.espacio)) {
      const partsA = getConstituentSpaces(target.espacio);
      const partsB = getConstituentSpaces(source.espacio);
      const combined = Array.from(new Set([...partsA, ...partsB]));
      mergedEspacio = combined.join(' / ');
    }

    // Combine descriptions cleanly without repetition
    let mergedDescripcion = (target.descripcion || '').trim();
    const sourceDesc = (source.descripcion || '').trim();
    if (sourceDesc && !mergedDescripcion.includes(sourceDesc)) {
      mergedDescripcion = mergedDescripcion
        ? `${mergedDescripcion}\n[Unida con ${source.tipoActividad}]: ${sourceDesc}`
        : sourceDesc;
    }

    // Combine comments
    let mergedComentarios = (target.comentarios || '').trim();
    const sourceComments = (source.comentarios || '').trim();
    if (sourceComments && !mergedComentarios.includes(sourceComments)) {
      mergedComentarios = mergedComentarios
        ? `${mergedComentarios} | ${sourceComments}`
        : sourceComments;
    }

    // Combine equipment
    const equipMap = new Map<string, any>();
    (target.equipamientoSolicitado || []).forEach((eq) => {
      equipMap.set(eq.equipmentId || eq.equipmentName, { ...eq });
    });
    (source.equipamientoSolicitado || []).forEach((eq) => {
      const key = eq.equipmentId || eq.equipmentName;
      const existing = equipMap.get(key);
      if (existing) {
        equipMap.set(key, {
          ...existing,
          quantity: Math.max(existing.quantity, eq.quantity),
          notes: [existing.notes, eq.notes].filter(Boolean).join(' | ')
        });
      } else {
        equipMap.set(key, { ...eq });
      }
    });

    const nowIso = new Date().toISOString();
    const mergedReserva: Reservation = {
      ...target,
      fecha: target.fecha,
      horaInicio: mergedHoraInicio,
      horaFin: mergedHoraFin,
      terminaDiaSiguiente: Boolean(target.terminaDiaSiguiente || source.terminaDiaSiguiente || mergedEndMin > 1440),
      espacio: mergedEspacio,
      tipoActividad: target.tipoActividad || source.tipoActividad,
      descripcion: mergedDescripcion,
      comentarios: mergedComentarios,
      responsable: target.responsable || source.responsable,
      rut: target.rut || source.rut || '',
      telefonoContacto: target.telefonoContacto || source.telefonoContacto || '',
      emailContacto: target.emailContacto || source.emailContacto || '',
      domicilio: target.domicilio || source.domicilio || '',
      cantidadParticipantes: Math.max(Number(target.cantidadParticipantes) || 0, Number(source.cantidadParticipantes) || 0) || 10,
      equipamientoSolicitado: Array.from(equipMap.values()),
      importante: (target.importante === 'Sí' || source.importante === 'Sí') ? 'Sí' : 'No',
      requiereCartaCompromiso: Boolean(target.requiereCartaCompromiso || source.requiereCartaCompromiso),
      estado: 'activa',
      editadoPor: currentUser?.name || currentUser?.username || 'Usuario',
      fechaEdicion: format(new Date(), 'dd/MM/yyyy HH:mm:ss'),
      version: target.version || 0,
      updatedAt: nowIso
    };

    // Check conflict against OTHER reservations (excluding both target and source)
    const deletedSet = getDeletedIds();
    const cleanReservations = reservations.filter(
      (r) => !deletedSet.has(r.id) && isReservationActiveForAvailability(r, deletedSet)
    );
    const conflicts = detectBatchConflicts([mergedReserva], cleanReservations, new Set([target.id, source.id]));
    if (conflicts.length > 0) {
      const firstConflict = conflicts[0];
      const conflictMsg = formatConflictMessage(firstConflict);
      triggerSyncToast(`No se pueden juntar las reservas debido a un conflicto con otra actividad:\n\n${conflictMsg}`, 'error');
      return false;
    }

    try {
      const confirmedWrite = await commitReservationChanges([mergedReserva], { deletedIds: [source.id], requireAtomic: true });
      applyConfirmed(confirmedWrite);
      triggerSyncToast('Reservas unificadas y confirmadas.', 'success');
        void safeAudit({
          action: 'UPDATE',
          description: `Reservas unificadas: '${target.tipoActividad}' (${target.horaInicio}-${target.horaFin}) se unió con '${source.tipoActividad}' (${source.horaInicio}-${source.horaFin} en ${source.espacio}). Horario resultante: ${mergedReserva.horaInicio}-${mergedReserva.horaFin} en ${mergedReserva.espacio}`,
          reservaId: mergedReserva.id,
          user: currentUser,
          reservaTitle: mergedReserva.tipoActividad,
          reservaFecha: mergedReserva.fecha,
          reservaEspacio: mergedReserva.espacio,
          reservaHorario: `${mergedReserva.horaInicio} - ${mergedReserva.horaFin}`,
          reservaResponsable: mergedReserva.responsable,
          previousState: [target, source],
          newState: confirmedWrite.reservations,
          newStateIsConfirmed: true
        });
    } catch (err: any) { triggerSyncToast(err?.message || 'No se pudieron unificar las reservas.', 'error'); return false; }

    return true;
  }, [reservations, currentUser, triggerSyncToast, setReservations]);

  return {
    handleMoveReservation,
    handleCreateOrUpdate,
    handleDelete,
    handleConfirmDeleteSingle,
    handleConfirmDeleteSeries,
    handleRequestDelete,
    handleSubmitDeleteRequest,
    handleAuthorizeDelete,
    handleRejectDeleteRequest,
    handleClearParticipants,
    handleQuickToggleRealizada,
    handleSyncAllToFirebase,
    handleImportReservations,
    handleDeleteAllHolidays,
    handleDuplicateReservation,
    handleMergeReservations
  };
}
