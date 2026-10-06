import { useCallback } from 'react';
import { addWeeks, format, parseISO } from 'date-fns';
import { Reservation, BatchUpdateInfo, isSingleDayMultiSpaceReservation } from '../types';
import { normalizeSpaceName } from '../data/spacesData';
import { isChileanHoliday } from '../utils/holidayUtils';
import {
  saveReservation,
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
import {
  AuthUser,
  userCanCreateReservations,
  userCanEditReservations,
  userCanDeleteReservations
} from '../services/authService';

export interface UseReservationCrudProps {
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

    const previousReservations = reservations;
    const toDeleteSeries = isSeries && seriesId ? reservations.filter((r) => r.serieRecurrente === seriesId || r.recurrenteId === seriesId) : [];
    const toDeleteSingle = !isSeries ? reservations.find((r) => r.id === id) : null;

    // 1. Instant optimistic UI update (0ms delay)
    setReservations((prev) => {
      if (isSeries && seriesId) {
        return prev.filter((r) => r.serieRecurrente !== seriesId && r.recurrenteId !== seriesId);
      }
      return prev.filter((r) => r.id !== id);
    });

    if (selectedReservation && (selectedReservation.id === id || (isSeries && (selectedReservation.serieRecurrente === seriesId || selectedReservation.recurrenteId === seriesId)))) {
      setIsDetailModalOpen(false);
      setSelectedReservation(null);
    }

    triggerSyncToast(isSeries ? `✓ Serie de ${toDeleteSeries.length} reservas eliminada al instante` : '✓ Reserva eliminada al instante', 'info');

    // 2. Background database deletion and audit logging
    (async () => {
      try {
        if (isSeries && seriesId) {
          if (toDeleteSeries.length > 0) {
            const first = toDeleteSeries[0];
            await recordAuditEntry({
              action: 'DELETE_SERIES',
              description: `Eliminada serie recurrente de ${toDeleteSeries.length} reservas para '${first.tipoActividad || 'Actividad'}' (${first.espacio})`,
              reservaId: seriesId,
              user: currentUser,
              reservaTitle: first.tipoActividad,
              reservaFecha: first.fecha,
              reservaEspacio: first.espacio,
              reservaHorario: `${first.horaInicio} - ${first.horaFin}`,
              reservaResponsable: first.responsable,
              previousState: toDeleteSeries
            });
          }
          await deleteSeriesByRecurrenteId(seriesId, toDeleteSeries.map((r) => r.id));
        } else if (toDeleteSingle) {
          await recordAuditEntry({
            action: 'DELETE',
            description: `Eliminada reserva '${toDeleteSingle.tipoActividad || 'Actividad'}' de ${toDeleteSingle.responsable || 'Responsable'} (${toDeleteSingle.fecha}, ${toDeleteSingle.espacio})`,
            reservaId: id,
            user: currentUser,
            reservaTitle: toDeleteSingle.tipoActividad,
            reservaFecha: toDeleteSingle.fecha,
            reservaEspacio: toDeleteSingle.espacio,
            reservaHorario: `${toDeleteSingle.horaInicio} - ${toDeleteSingle.horaFin}`,
            reservaResponsable: toDeleteSingle.responsable,
            previousState: toDeleteSingle
          });
          await deleteReservationById(id);
        }
      } catch (err: any) {
        console.error('Error executing delete in background:', err);
        setReservations(previousReservations);
        triggerSyncToast(`⚠️ Error al eliminar en el servidor: ${err?.message || 'Error de conexión'}`, 'error');
      }
    })();
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

        setReservations((prev) =>
          prev.map((r) => {
            if (r.serieRecurrente === seriesId || r.recurrenteId === seriesId) {
              return { ...r, solicitudEliminacion: solicitudInfo };
            }
            return r;
          })
        );

        await saveReservationsBatch(updatedList);

        await recordAuditEntry({
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

        setReservations((prev) =>
          prev.map((r) => (r.id === reservation.id ? updatedReservation : r))
        );

        await saveReservation(updatedReservation);

        await recordAuditEntry({
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

        await recordAuditEntry({
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
        await deleteSeriesByRecurrenteId(seriesId);
      } else {
        await recordAuditEntry({
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
        await deleteReservationById(reservation.id);
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

        setReservations((prev) =>
          prev.map((r) => {
            if (r.serieRecurrente === seriesId || r.recurrenteId === seriesId) {
              const copy = { ...r };
              delete copy.solicitudEliminacion;
              return copy;
            }
            return r;
          })
        );

        await saveReservationsBatch(updatedList);

        await recordAuditEntry({
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

        setReservations((prev) =>
          prev.map((r) => (r.id === reservation.id ? copy : r))
        );

        await saveReservation(copy);

        await recordAuditEntry({
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

    // Instant optimistic update
    setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    triggerSyncToast('✓ Aforo restablecido a 0', 'success');

    // Background persistence
    (async () => {
      try {
        await saveReservation(updated);
        await recordAuditEntry({
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
          newState: updated
        });
      } catch (err: any) {
        console.error('Error clearing participants in background:', err);
      }
    })();
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

    // Instant optimistic update (0ms UI feedback)
    setReservations((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    triggerSyncToast(`✓ Marcada como ${nextVal === 'Sí' ? 'Realizada' : 'Pendiente'}`, 'success');

    // Background persistence
    (async () => {
      try {
        await saveReservation(updated);
        await recordAuditEntry({
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
          newState: updated
        });
      } catch (err: any) {
        console.error('Error saving realizada toggle in background:', err);
      }
    })();
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
    const merged = [...importedList, ...reservations];
    // deduplicate by id
    const map = new Map<string, Reservation>();
    merged.forEach(r => map.set(r.id, r));
    const deduped = Array.from(map.values());
    setReservations(deduped);
    await seedAllToFirestore(deduped);
    await recordAuditEntry({
      action: 'BULK_IMPORT',
      description: `Importadas / Sincronizadas ${importedList.length} reservas`,
      reservaId: 'BULK_IMPORT',
      user: currentUser,
      newState: importedList
    });
  }, [reservations, currentUser, setReservations]);

  const handleDeleteAllHolidays = useCallback(async () => {
    const holidaysBefore = reservations.filter(r => isChileanHoliday(r.fecha));
    const res = await deleteAllHolidayReservations();
    if (res.deletedCount > 0) {
      await recordAuditEntry({
        action: 'DELETE_ALL_HOLIDAYS',
        description: `Eliminadas automáticamente ${res.deletedCount} reservas en días feriados de Chile`,
        reservaId: 'HOLIDAYS_PURGE',
        user: currentUser,
        previousState: holidaysBefore
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
    const previousReservations = reservations;
    try {
      // -------------------------------------------------------------
      // CASE 0: TARGETED BATCH UPDATE (PRECISE SCOPE: single, future, series, dateRange, selected)
      // -------------------------------------------------------------
      if (batchUpdateInfo) {
        if (!userCanEditReservations(currentUser)) {
          triggerSyncToast('Permiso denegado: No tienes autorización para modificar reservas existentes (gestión controlada por Cristian Shute).', 'error');
          return false;
        }

        const { scope, updatedReservations, affectedIds } = batchUpdateInfo;
        const deletedSet = getDeletedIds();
        const activeUpdated = (updatedReservations || []).filter(
          (r) => !deletedSet.has(r.id) && r.estado !== 'eliminada' && isReservationActiveForAvailability(r, deletedSet)
        );
        if (activeUpdated.length === 0) {
          triggerSyncToast('No se encontraron reservas activas para actualizar.', 'warning');
          return false;
        }

        const cleanAffectedIds = affectedIds.filter((id) => !deletedSet.has(id));
        const cleanReservations = reservations.filter(
          (r) => !deletedSet.has(r.id) && isReservationActiveForAvailability(r, deletedSet)
        );

        // Validate conflicts excluding affected reservations
        const conflictsFound = detectBatchConflicts(
          activeUpdated,
          cleanReservations,
          new Set(cleanAffectedIds),
          scope === 'series' ? (reserva.serieRecurrente || reserva.recurrenteId) : undefined
        );

        if (conflictsFound.length > 0 && !allowConflictOverride) {
          const firstConflict = conflictsFound[0];
          const conflictMsg = formatConflictMessage(firstConflict);
          triggerSyncToast(`Operación bloqueada por conflicto de disponibilidad:\n\n${conflictMsg}\n\nNo se realizaron modificaciones.`, 'error');
          return false;
        }

        // Optimistic cache/state update (no duplicates, deterministic sort)
        setReservations((prev) => {
          const map = new Map<string, Reservation>();
          prev.forEach((r) => map.set(r.id, r));
          activeUpdated.forEach((r) => map.set(r.id, r));
          return Array.from(map.values()).sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            return a.horaInicio.localeCompare(b.horaInicio);
          });
        });

        // Instant UI reaction: close modal immediately and notify
        setIsReservationModalOpen(false);
        setEditingReservation(null);
        triggerSyncToast(`✓ ${activeUpdated.length} reservas actualizadas al instante`, 'success');

        const scopeNames: Record<string, string> = {
          single: 'Solo esta reserva',
          future: 'Esta y las siguientes',
          series: 'Toda la serie',
          dateRange: 'Rango de fechas',
          selected: 'Fechas seleccionadas'
        };
        const firstRes = activeUpdated[0];

        // Persist to Firestore and record audit in background
        (async () => {
          try {
            if (activeUpdated.length === 1) {
              await saveReservation(activeUpdated[0]);
            } else {
              await saveReservationsBatch(activeUpdated);
            }

            await recordAuditEntry({
              action: 'UPDATE',
              description: batchUpdateInfo.description || `Modificadas ${activeUpdated.length} reservas (${scopeNames[scope] || scope}) para '${firstRes.tipoActividad}' de ${firstRes.responsable}`,
              reservaId: firstRes.id,
              user: currentUser,
              reservaTitle: firstRes.tipoActividad,
              reservaFecha: firstRes.fecha,
              reservaEspacio: firstRes.espacio,
              reservaHorario: `${firstRes.horaInicio} - ${firstRes.horaFin}`,
              reservaResponsable: firstRes.responsable,
              newState: activeUpdated
            });
          } catch (err: any) {
            console.error('Error saving batch reservations in background:', err);
            setReservations(previousReservations);
            triggerSyncToast(`⚠️ Error al sincronizar con el servidor: ${err?.message || 'Error de conexión'}`, 'error');
          }
        })();

        if (conflictsFound.length > 0) {
          setConflictReportData({
            isOpen: true,
            savedCount: updatedReservations.length,
            conflicts: conflictsFound
          });
          notifyTopamiento(conflictsFound);
        }

        if (firstRes.importante === 'Sí') {
          notifyImportantActivity(firstRes, 'updated');
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
        const seriesMatches = reservations.filter(
          (r) =>
            !deletedSet.has(r.id) &&
            r.estado !== 'eliminada' &&
            (r as any).eliminada !== true &&
            isReservationActiveForAvailability(r) &&
            (Boolean(seriesId && (r.serieRecurrente === seriesId || r.recurrenteId === seriesId)) ||
              r.id === reserva.id)
        );

        if (seriesMatches.length > 0) {
          const finalSeriesId = seriesId || seriesMatches[0].serieRecurrente || seriesMatches[0].recurrenteId || `SER_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
          let updatedSeriesList: Reservation[] = [];
          const idsToDelete: string[] = [];

          if (explicitSlots.length > 0) {
            // Re-sync with explicit slots (supports multiple segments per day, e.g. 2 spaces/times on Monday & Wednesday)
            const totalCount = explicitSlots.length;
            const existingByDate = new Map<string, Reservation[]>();
            seriesMatches.forEach((m) => {
              const list = existingByDate.get(m.fecha) || [];
              list.push(m);
              existingByDate.set(m.fecha, list);
            });

            const usedExistingIds = new Set<string>();

            updatedSeriesList = explicitSlots.map((item, i) => {
              const matchesForDate = existingByDate.get(item.fecha) || [];
              
              // Best effort match: 1) Same space & time, 2) Same space, 3) Any unused for this date, 4) Any unused in series
              let availableMatch = matchesForDate.find(
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
                  ...availableMatch,
                  ...reserva,
                  id: availableMatch.id,
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
              } else {
                return {
                  ...reserva,
                  id: `RSV_${Math.random().toString(36).substring(2, 10).toUpperCase()}_${i + 1}`,
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
            new Set(seriesMatches.map((m) => m.id)),
            finalSeriesId
          );

          if (conflictsFound.length > 0 && !allowConflictOverride) {
            const firstConflict = conflictsFound[0];
            const conflictMsg = formatConflictMessage(firstConflict);
            triggerSyncToast(`Operación bloqueada por conflicto de disponibilidad:\n\n${conflictMsg}\n\nNo se realizaron modificaciones en la serie.`, 'error');
            return false;
          }

          // Optimistic state update across all segments
          setReservations((prev) => {
            const map = new Map<string, Reservation>();
            prev.forEach((r) => {
              if (!idsToDelete.includes(r.id)) {
                map.set(r.id, r);
              }
            });
            updatedSeriesList.forEach((r) => map.set(r.id, r));
            return Array.from(map.values()).sort((a, b) => {
              if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
              return a.horaInicio.localeCompare(b.horaInicio);
            });
          });

          // Instant UI reaction: close modal immediately and notify
          setIsReservationModalOpen(false);
          setEditingReservation(null);
          triggerSyncToast(`✓ Serie actualizada al instante (${updatedSeriesList.length} sesiones)`, 'success');

          // Asynchronously persist to database and record audit in background
          (async () => {
            try {
              if (idsToDelete.length > 0) {
                await deleteReservationsBatch(idsToDelete);
              }

              await saveReservationsBatch(updatedSeriesList);

              await recordAuditEntry({
                action: 'UPDATE',
                description: `Actualizada serie recurrente de ${updatedSeriesList.length} reservas para '${reserva.tipoActividad || 'Actividad'}' (${reserva.responsable})`,
                reservaId: finalSeriesId,
                user: currentUser,
                reservaTitle: reserva.tipoActividad,
                reservaFecha: reserva.fecha,
                reservaEspacio: reserva.espacio,
                reservaHorario: `${reserva.horaInicio} - ${reserva.horaFin}`,
                reservaResponsable: reserva.responsable,
                newState: updatedSeriesList
              });
            } catch (err: any) {
              console.error('Error saving series in background:', err);
              setReservations(previousReservations);
              triggerSyncToast(`⚠️ Error al sincronizar serie con el servidor: ${err?.message || 'Error de conexión'}`, 'error');
            }
          })();

          if (conflictsFound.length > 0) {
            setConflictReportData({
              isOpen: true,
              savedCount: updatedSeriesList.length,
              conflicts: conflictsFound
            });
            notifyTopamiento(conflictsFound);
          }

          if (reserva.importante === 'Sí') {
            notifyImportantActivity(reserva, 'updated');
          }

          return true;
        }
      }

      // -------------------------------------------------------------
      // CASE 2: CREATE NEW SERIES OR MULTI-SEGMENT RESERVATIONS
      // -------------------------------------------------------------
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
          ? (reserva.serieRecurrente || reserva.recurrenteId || `DBL_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`)
          : (reserva.serieRecurrente || reserva.recurrenteId || `SER_${Date.now().toString(36).toUpperCase()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`);
        
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
          
          let uniqueId: string;
          if (i === 0 && reserva.id && !reservations.some(r => r.id === reserva.id) && !usedIds.has(reserva.id)) {
            uniqueId = reserva.id;
          } else {
            uniqueId = `RSV_${Date.now().toString(36).toUpperCase()}_${String(i + 1).padStart(3, '0')}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
          }
          usedIds.add(uniqueId);

          return {
            ...reserva,
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

        // Instant optimistic React state update: all segments stored and sorted
        setReservations((prev) => {
          const map = new Map<string, Reservation>();
          prev.forEach((r) => map.set(r.id, r));
          seriesList.forEach((r) => map.set(r.id, r));
          return Array.from(map.values()).sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            return a.horaInicio.localeCompare(b.horaInicio);
          });
        });

        // Instant UI reaction: close modal immediately and notify
        setIsReservationModalOpen(false);
        setEditingReservation(null);
        triggerSyncToast(`✓ Serie de ${seriesList.length} reservas creada al instante`, 'success');

        // Fast batch persistence to Firestore and audit log in background
        (async () => {
          try {
            await saveReservationsBatch(seriesList);

            await recordAuditEntry({
              action: 'CREATE',
              description: `Creada serie recurrente de ${seriesList.length} reservas para '${reserva.tipoActividad || 'Actividad'}' (${reserva.espacio})`,
              reservaId: seriesId || seriesList[0]?.id || 'SERIES',
              user: currentUser,
              reservaTitle: reserva.tipoActividad,
              reservaFecha: reserva.fecha,
              reservaEspacio: reserva.espacio,
              reservaHorario: `${reserva.horaInicio} - ${reserva.horaFin}`,
              reservaResponsable: reserva.responsable,
              newState: seriesList
            });
          } catch (err: any) {
            console.error('Error in background series creation save:', err);
            setReservations(previousReservations);
            triggerSyncToast(`⚠️ Error al guardar serie en el servidor: ${err?.message || 'Error de conexión'}`, 'error');
          }
        })();

        // If conflicts were found across any dates/spaces, notify without truncating
        if (conflictsFound.length > 0) {
          setConflictReportData({
            isOpen: true,
            savedCount: seriesList.length,
            conflicts: conflictsFound
          });
          notifyTopamiento(conflictsFound);
        }

        if (reserva.importante === 'Sí') {
          notifyImportantActivity(reserva, 'created');
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

        // Instant optimistic React state update
        setReservations((prev) => {
          const index = prev.findIndex((r) => r.id === cleanReserva.id);
          if (index >= 0) {
            const next = [...prev];
            next[index] = cleanReserva;
            return next.sort((a, b) => {
              if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
              return a.horaInicio.localeCompare(b.horaInicio);
            });
          }
          return [cleanReserva, ...prev].sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            return a.horaInicio.localeCompare(b.horaInicio);
          });
        });

        // Instant UI reaction: close modal immediately and notify
        setIsReservationModalOpen(false);
        setEditingReservation(null);
        triggerSyncToast(isEditing ? '✓ Reserva actualizada al instante' : '✓ Reserva guardada al instante', 'success');

        // Background persistence and audit logging
        (async () => {
          try {
            await saveReservation(cleanReserva);

            if (isEditing && existingRes) {
              const diffs = computeReservationDiff(existingRes, cleanReserva);
              await recordAuditEntry({
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
                newState: cleanReserva,
                diffs
              });
            } else {
              await recordAuditEntry({
                action: 'CREATE',
                description: `Creada reserva '${cleanReserva.tipoActividad || 'Actividad'}' para ${cleanReserva.responsable || 'Responsable'} (${cleanReserva.espacio})`,
                reservaId: cleanReserva.id,
                user: currentUser,
                reservaTitle: cleanReserva.tipoActividad,
                reservaFecha: cleanReserva.fecha,
                reservaEspacio: cleanReserva.espacio,
                reservaHorario: `${cleanReserva.horaInicio} - ${cleanReserva.horaFin}`,
                reservaResponsable: cleanReserva.responsable,
                newState: cleanReserva
              });
            }
          } catch (err: any) {
            console.error('Error saving single reservation in background:', err);
            setReservations(previousReservations);
            triggerSyncToast(`⚠️ Error al guardar en el servidor: ${err?.message || 'Error de conexión'}`, 'error');
          }
        })();

        if (conflictsFound.length > 0) {
          setConflictReportData({
            isOpen: true,
            savedCount: 1,
            conflicts: conflictsFound
          });
          notifyTopamiento(conflictsFound);
        }

        if (cleanReserva.importante === 'Sí') {
          notifyImportantActivity(cleanReserva, isEditing ? 'updated' : 'created');
        }

        return true;
      }
    } catch (err: any) {
      console.error('Error saving reservation:', err);
      setReservations(previousReservations);
      triggerSyncToast(`⚠️ Error al guardar en Firestore: ${err?.message || 'Error de conexión'}. Se restableció el estado anterior.`, 'error');
      return false;
    }
  }, [reservations, currentUser, triggerSyncToast, setReservations, setIsReservationModalOpen, setEditingReservation, setConflictReportData]);

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
      version: ((target as any)?.version || 0) + 1,
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

    // 1. Optimistic React state update
    recordDeletedId(source.id);
    setReservations((prev) => {
      const filtered = prev.filter((r) => r.id !== source.id);
      const targetIdx = filtered.findIndex((r) => r.id === target.id);
      if (targetIdx >= 0) {
        filtered[targetIdx] = mergedReserva;
      } else {
        filtered.push(mergedReserva);
      }
      return filtered.sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        return a.horaInicio.localeCompare(b.horaInicio);
      });
    });

    triggerSyncToast(`✓ Reservas unificadas con éxito (${mergedReserva.horaInicio} – ${mergedReserva.horaFin} en ${mergedReserva.espacio})`, 'success');

    // 2. Persist to Firestore in background
    (async () => {
      try {
        await saveReservation(mergedReserva);
        await deleteReservationById(source.id);
        await recordAuditEntry({
          action: 'UPDATE',
          description: `Reservas unificadas: '${target.tipoActividad}' (${target.horaInicio}-${target.horaFin}) se unió con '${source.tipoActividad}' (${source.horaInicio}-${source.horaFin} en ${source.espacio}). Horario resultante: ${mergedReserva.horaInicio}-${mergedReserva.horaFin} en ${mergedReserva.espacio}`,
          reservaId: mergedReserva.id,
          user: currentUser,
          reservaTitle: mergedReserva.tipoActividad,
          reservaFecha: mergedReserva.fecha,
          reservaEspacio: mergedReserva.espacio,
          reservaHorario: `${mergedReserva.horaInicio} - ${mergedReserva.horaFin}`,
          reservaResponsable: mergedReserva.responsable,
          newState: mergedReserva
        });
      } catch (err: any) {
        console.error('Error persisting merged reservations:', err);
        setReservations(previousReservations);
        unrecordDeletedId(source.id);
        triggerSyncToast(`⚠️ Error al sincronizar reservas unificadas: ${err?.message || 'Error de conexión'}`, 'error');
      }
    })();

    return true;
  }, [reservations, currentUser, triggerSyncToast, setReservations]);

  return {
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
