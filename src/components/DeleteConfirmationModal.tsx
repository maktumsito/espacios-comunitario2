import { formatDisplayTitle } from '../utils/reservationVisuals';
import React, { useState, useEffect } from 'react';
import { Reservation, isSingleDayMultiSpaceReservation } from '../types';
import { SPACES_LIST } from '../data/spacesData';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { AuthUser, userCanDeleteReservations } from '../services/authService';
import { BaseModal } from './common/BaseModal';
import {
  AlertTriangle,
  Trash2,
  Calendar,
  Clock,
  Repeat,
  Send,
  ShieldAlert,
  XCircle
} from 'lucide-react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  reservation: Reservation | null;
  onClose: () => void;
  onConfirmDeleteSingle: (id: string) => void;
  onConfirmDeleteSeries: (seriesId: string) => void;
  onClearParticipants?: (reservation: Reservation) => void;
  currentUser?: AuthUser | null;
  onSubmitDeleteRequest?: (
    reservation: Reservation,
    motivo?: string,
    isSeries?: boolean,
    seriesId?: string
  ) => void;
  onAuthorizeDelete?: (reservation: Reservation) => void;
  onRejectDeleteRequest?: (reservation: Reservation) => void;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  reservation,
  onClose,
  onConfirmDeleteSingle,
  onConfirmDeleteSeries,
  currentUser,
  onSubmitDeleteRequest,
  onAuthorizeDelete,
  onRejectDeleteRequest
}) => {
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (isOpen) {
      setMotivo('');
    }
  }, [isOpen, reservation]);

  if (!isOpen || !reservation) return null;

  const canDirectlyDelete = userCanDeleteReservations(currentUser);
  const hasPendingRequest = Boolean(reservation.solicitudEliminacion);

  const isMultiSpace = isSingleDayMultiSpaceReservation(reservation);
  const isRecurring =
    !isMultiSpace &&
    (reservation.actividadRecurrente === 'Sí' ||
      Boolean(reservation.recurrenteId || reservation.serieRecurrente));
  const hasMultipleSlots = isMultiSpace || isRecurring;

  const seriesId = reservation.recurrenteId || reservation.serieRecurrente || reservation.id;
  const spaceInfo = SPACES_LIST.find(
    (s) => s.name.toUpperCase() === reservation.espacio.toUpperCase()
  );
  const spaceColor = spaceInfo ? spaceInfo.color : '#64748b';

  // Handle Non-Admin Submission
  const handleSendRequest = (isSeries: boolean) => {
    if (onSubmitDeleteRequest) {
      onSubmitDeleteRequest(reservation, motivo, isSeries, isSeries ? seriesId : undefined);
      onClose();
    }
  };

  const modalTitle = canDirectlyDelete
    ? isMultiSpace
      ? 'Confirmar Eliminación de Reserva Multi-Espacio'
      : isRecurring
      ? 'Confirmar Eliminación de Serie Recurrente'
      : 'Confirmar Eliminación de Reserva'
    : isMultiSpace
    ? 'Solicitar Eliminación Multi-Espacio'
    : isRecurring
    ? 'Solicitar Eliminación de Serie Recurrente'
    : 'Solicitar Eliminación de Reserva';

  const modalSubtitle = canDirectlyDelete
    ? 'Como usuario con permisos de eliminación autorizados, esta acción eliminará directamente la reserva.'
    : 'Al no poseer autorización para eliminar directamente, quedará en espera de confirmación.';

  const modalIcon = canDirectlyDelete
    ? <AlertTriangle className="w-5 h-5 text-rose-600" />
    : <Clock className="w-5 h-5 text-amber-600" />;

  const modalFooter = (
    <button
      id="btn-confirm-delete-cancel"
      type="button"
      onClick={onClose}
      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer"
    >
      Cancelar
    </button>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={modalTitle}
      subtitle={modalSubtitle}
      icon={modalIcon}
      layer="alert"
      role="alertdialog"
      maxWidth="lg"
      footer={modalFooter}
      bodyClassName="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-700"
    >
      {/* Existing Pending Request Notice */}
      {hasPendingRequest && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-950 space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <Clock className="w-4 h-4 text-amber-700" />
              <span>Esta reserva ya cuenta con una solicitud de eliminación pendiente</span>
            </div>
            <p className="text-[11px] text-amber-900">
              Solicitado por <strong>{reservation.solicitudEliminacion?.solicitadoPorNombre || reservation.solicitudEliminacion?.solicitadoPor}</strong>
              {reservation.solicitudEliminacion?.fechaSolicitud && ` el ${new Date(reservation.solicitudEliminacion.fechaSolicitud).toLocaleString('es-CL')}`}.
            </p>
            {reservation.solicitudEliminacion?.motivo && (
              <p className="italic text-[11px] bg-white/70 p-2 rounded-lg border border-amber-200/80">
                "{reservation.solicitudEliminacion.motivo}"
              </p>
            )}
          </div>
        )}

        {/* Resumen de la reserva */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: spaceColor }}
              />
              <span className="font-bold text-slate-800 normal-case tracking-wide">
                {formatDisplayTitle(reservation.espacio)}
              </span>
            </div>
            {isMultiSpace ? (
              <span className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                <span>Multi-Espacio ({reservation.indiceEnSerie === 1 ? '1° Espacio' : '2° Espacio'})</span>
              </span>
            ) : isRecurring ? (
              <span className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                <Repeat className="w-3 h-3" />
                <span>Serie Recurrente</span>
              </span>
            ) : null}
          </div>

          <div className="font-semibold text-slate-900 text-sm">
            {formatDisplayTitle(reservation.tipoActividad)}
            {reservation.descripcion && (
              <span className="font-normal text-slate-600 ml-1">
                — {formatDisplayTitle(reservation.descripcion)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 text-slate-600 font-mono text-[11px]">
            <div className="flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{formatDateDDMMYYYY(reservation.fecha)}</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                {reservation.horaInicio} - {reservation.horaFin}
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CASE A: USER IS NOT ADMIN/COORDINATOR -> REQUEST DELETION */}
        {/* ======================================================== */}
        {!canDirectlyDelete ? (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-amber-900 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>En Espera de Aprobación:</strong> Al confirmar esta solicitud, la reserva se marcará en estado <em>"Pendiente de eliminación"</em> hasta que un Administrador o Coordinador la autorice formalmente.
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                Motivo o Justificación de la Eliminación (opcional):
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej: Actividad cancelada por el solicitante, cambio de horario, error en fecha, etc."
                rows={3}
                className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white shadow-2xs"
              />
            </div>

            {hasMultipleSlots ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => handleSendRequest(false)}
                  className="w-full text-left p-3.5 rounded-2xl bg-white hover:bg-amber-50/70 border border-amber-300 hover:border-amber-400 transition shadow-2xs group flex items-start space-x-3 cursor-pointer"
                >
                  <div className="p-2 rounded-xl bg-amber-100 text-amber-800 group-hover:bg-amber-600 group-hover:text-white transition shrink-0 mt-0.5">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-900 group-hover:text-amber-950">
                      {isMultiSpace
                        ? `Solicitar eliminar solo este espacio (${formatDisplayTitle(reservation.espacio)})`
                        : `Solicitar eliminar solo esta fecha (${formatDateDDMMYYYY(reservation.fecha)})`}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Quedará en espera de autorización solo para esta reserva individual.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendRequest(true)}
                  className="w-full text-left p-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white transition shadow-sm group flex items-start space-x-3 cursor-pointer"
                >
                  <div className="p-2 rounded-xl bg-white/20 text-white shrink-0 mt-0.5">
                    <Repeat className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-white">
                      {isMultiSpace
                        ? 'Solicitar eliminar AMBOS espacios del día'
                        : 'Solicitar eliminar TODA la serie recurrente'}
                    </div>
                    <p className="text-[11px] text-amber-100 mt-0.5">
                      Enviará la solicitud para todas las fechas asociadas a la serie.
                    </p>
                  </div>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleSendRequest(false)}
                className="w-full p-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span>Enviar Solicitud de Eliminación (Quedará en Espera)</span>
              </button>
            )}
          </div>
        ) : (
          /* ======================================================== */
          /* CASE B: USER IS ADMIN/COORDINATOR -> DIRECT DELETE OR AUTHORIZE */
          /* ======================================================== */
          <div className="space-y-3">
            {hasPendingRequest ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
                  ¿Deseas autorizar la solicitud y eliminar permanentemente esta reserva, o rechazar la solicitud para mantenerla activa?
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onRejectDeleteRequest) {
                        onRejectDeleteRequest(reservation);
                        onClose();
                      }
                    }}
                    className="p-3 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs"
                  >
                    <XCircle className="w-4 h-4 text-slate-500" />
                    <span>Rechazar Solicitud</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (onAuthorizeDelete) {
                        onAuthorizeDelete(reservation);
                        onClose();
                      } else {
                        onConfirmDeleteSingle(reservation.id);
                        onClose();
                      }
                    }}
                    className="p-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition flex items-center justify-center space-x-1.5 cursor-pointer shadow-xs"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Autorizar y Eliminar</span>
                  </button>
                </div>
              </div>
            ) : hasMultipleSlots ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
                  {isMultiSpace ? (
                    <>¿Deseas eliminar <strong>únicamente este espacio ({formatDisplayTitle(reservation.espacio)})</strong> o <strong>ambos espacios reservados</strong> para esta fecha?</>
                  ) : (
                    <>¿Deseas eliminar <strong>únicamente la reserva actual</strong> de esta fecha o <strong>todas las reservas recurrentes</strong> de la serie?</>
                  )}
                </p>

                <div className="space-y-2.5">
                  <button
                    id="btn-confirm-delete-single"
                    type="button"
                    onClick={() => {
                      onConfirmDeleteSingle(reservation.id);
                      onClose();
                    }}
                    className="w-full text-left p-3.5 rounded-2xl bg-white hover:bg-rose-50/60 border border-rose-200 hover:border-rose-300 transition shadow-2xs group flex items-start space-x-3 cursor-pointer"
                  >
                    <div className="p-2 rounded-xl bg-rose-100 text-rose-700 group-hover:bg-rose-600 group-hover:text-white transition shrink-0 mt-0.5">
                      <Trash2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-slate-900 group-hover:text-rose-900">
                        {isMultiSpace
                          ? `Eliminar solo este espacio (${formatDisplayTitle(reservation.espacio)})`
                          : `Eliminar solo la reserva actual (${formatDateDDMMYYYY(reservation.fecha)})`}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isMultiSpace
                          ? 'Elimina únicamente la reserva en este espacio. El otro espacio permanecerá activo.'
                          : 'Elimina únicamente este horario en la fecha seleccionada. Las demás repeticiones se mantendrán.'}
                      </p>
                    </div>
                  </button>

                  <button
                    id="btn-confirm-delete-series"
                    type="button"
                    onClick={() => {
                      onConfirmDeleteSeries(seriesId);
                      onClose();
                    }}
                    className="w-full text-left p-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white transition shadow-sm group flex items-start space-x-3 cursor-pointer"
                  >
                    <div className="p-2 rounded-xl bg-white/20 text-white shrink-0 mt-0.5">
                      <Repeat className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white">
                        {isMultiSpace ? 'Eliminar AMBOS espacios del día' : 'Eliminar TODAS las reservas recurrentes'}
                      </div>
                      <p className="text-[11px] text-rose-100 mt-0.5">
                        {isMultiSpace
                          ? 'Cancela y elimina la reserva completa en ambos espacios para este día.'
                          : 'Borra todas las fechas de esta serie recurrente de inmediato.'}
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-700 font-medium leading-relaxed">
                  ¿Estás seguro de que deseas eliminar permanentemente esta reserva del calendario?
                </p>

                <div className="space-y-2">
                  <button
                    id="btn-confirm-delete-single-direct"
                    type="button"
                    onClick={() => {
                      onConfirmDeleteSingle(reservation.id);
                      onClose();
                    }}
                    className="w-full p-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar Reserva</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
    </BaseModal>
  );
};
