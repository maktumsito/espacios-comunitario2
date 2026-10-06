import React from 'react';
import { Reservation, SpaceRating, CommitmentLetterAttachment, isSingleDayMultiSpaceReservation } from '../types';
import { SPACES_LIST } from '../data/spacesData';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { isWeekend, isBirthdayReservation, isEligibleForRating, isRatingAllowedForReservation } from '../services/ratingService';
import {
  X,
  Clock,
  User,
  Users,
  Calendar,
  Flame,
  Edit2,
  Trash2,
  Star,
  Cake,
  AlertTriangle,
  FileSignature,
  Copy,
  Lock,
  XCircle,
  Check,
  Ban,
  GitMerge,
  CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { CommitmentLetterModal } from './CommitmentLetterModal';
import { MergeReservationsModal } from './MergeReservationsModal';
import { getPhoneContactActions } from '../utils/phoneUtils';
import { CommitmentLetterCard } from './CommitmentLetterCard';
import { isCommitmentLetterEligible } from '../utils/commitmentLetterPdf';
import { checkLoanScheduleLimit } from '../utils/validationUtils';
import {
  AuthUser,
  isCoordinatorOrAdmin,
  userCanCreateReservations,
  userCanEditReservations,
  userCanDeleteReservations
} from '../services/authService';
import { ConfirmationModal } from './common/ConfirmationModal';
import { BaseModal } from './common/BaseModal';

interface ReservationDetailModalProps {
  reservation: Reservation | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (reserva: Reservation) => void;
  onDuplicate?: (reserva: Reservation) => void;
  onDelete?: (id: string, isSeries?: boolean, seriesId?: string) => void;
  onRequestDelete?: (reserva: Reservation) => void;
  onToggleRealizada?: (reserva: Reservation) => void;
  onUpdateReservation?: (updated: Reservation) => void;
  onMergeReservations?: (targetReservationId: string, sourceReservationId: string) => Promise<boolean | void> | boolean | void;
  existingRating?: SpaceRating | null;
  onOpenRatingModal?: (reserva: Reservation, rating?: SpaceRating) => void;
  allReservations?: Reservation[];
  currentUser?: AuthUser | null;
  onAuthorizeDelete?: (reservation: Reservation) => void;
  onRejectDeleteRequest?: (reservation: Reservation) => void;
}

export const ReservationDetailModal: React.FC<ReservationDetailModalProps> = ({
  reservation,
  isOpen,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
  onRequestDelete,
  onToggleRealizada,
  onUpdateReservation,
  onMergeReservations,
  existingRating,
  onOpenRatingModal,
  allReservations = [],
  currentUser,
  onAuthorizeDelete,
  onRejectDeleteRequest
}) => {
  const [showCommitmentLetter, setShowCommitmentLetter] = React.useState(false);
  const [showMergeModal, setShowMergeModal] = React.useState(false);

  // Accessible non-blocking confirmation dialog state (D4)
  const [confirmModal, setConfirmModal] = React.useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'info' | 'primary';
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const openConfirm = (cfg: {
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'info' | 'primary';
    onConfirm: () => void;
    onCancel?: () => void;
  }) => {
    setConfirmModal({
      ...cfg,
      isOpen: true
    });
  };

  const closeConfirm = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  if (!isOpen || !reservation) return null;

  const canModify = userCanEditReservations(currentUser);
  const canDelete = userCanDeleteReservations(currentUser);
  const canCreate = userCanCreateReservations(currentUser);

  const getSpaceColor = (spaceName: string) => {
    const found = SPACES_LIST.find(s => s.name.toUpperCase() === spaceName.toUpperCase());
    return found ? found.color : '#64748b';
  };

  const spaceColor = getSpaceColor(reservation.espacio);
  const isWeekendRes = isWeekend(reservation.fecha);
  const isBday = isBirthdayReservation(reservation);

  const handleUpdateAttachment = (attachment: CommitmentLetterAttachment | null) => {
    if (!reservation) return;
    const updated: Reservation = {
      ...reservation,
      cartaCompromisoAdjunta: attachment || undefined,
      requiereCartaCompromiso: true
    };
    if (onUpdateReservation) {
      onUpdateReservation(updated);
    }
  };

  const handleToggleCancel = () => {
    if (!reservation) return;
    const isCurrentlyCancelled = reservation.estado === 'cancelada';
    if (isCurrentlyCancelled) {
      openConfirm({
        title: '¿Reactivar esta reserva?',
        message: 'Volverá a ocupar su horario en la agenda comunitaria y estará activa para su uso.',
        confirmLabel: 'Reactivar Reserva',
        variant: 'primary',
        onConfirm: () => {
          onUpdateReservation?.({
            ...reservation,
            estado: 'activa'
          });
          closeConfirm();
          onClose();
        }
      });
    } else {
      openConfirm({
        title: '¿Cancelar esta reserva?',
        message: 'Se mantendrá en el registro histórico pero su horario quedará inmediatamente liberado para nuevas reservas.',
        confirmLabel: 'Confirmar Cancelación',
        variant: 'warning',
        onConfirm: () => {
          onUpdateReservation?.({
            ...reservation,
            estado: 'cancelada'
          });
          closeConfirm();
          onClose();
        }
      });
    }
  };

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="lg"
        id="reservation-detail-modal"
        customHeader={
          <div className="flex items-start justify-between pb-3 border-b border-slate-200 w-full">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shadow-xs"
                  style={{ backgroundColor: spaceColor }}
                />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {reservation.espacio}
                </span>
                {reservation.importante === 'Sí' && (
                  <span className="flex items-center space-x-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    <Flame className="w-3 h-3 text-amber-500" />
                    <span>Importante</span>
                  </span>
                )}
                {isBday && (
                  <span className="flex items-center space-x-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    <Cake className="w-3 h-3 text-amber-700" />
                    <span>Cumpleaños</span>
                  </span>
                )}
                {isWeekendRes && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                    Fin de Semana
                  </span>
                )}
                {reservation.estado === 'cancelada' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                    🚫 Cancelada
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {reservation.descripcion || reservation.tipoActividad}
              </h3>
            </div>

            <button
              type="button"
              aria-label="Cerrar detalles de la reserva"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        }
        bodyClassName="p-6 sm:p-7 space-y-5 overflow-y-auto max-h-[calc(90vh-100px)]"
      >

        {/* Solicitud de Eliminación en Espera de Autorización Banner */}
        {reservation.solicitudEliminacion && (
          <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2 shadow-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start space-x-2.5">
                <div className="p-2 bg-amber-200 rounded-xl text-amber-800 shrink-0 mt-0.5">
                  <Clock className="w-5 h-5 text-amber-800" />
                </div>
                <div>
                  <div className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                    <span>Solicitud de Eliminación en Espera de Autorización</span>
                    <span className="text-[10px] bg-amber-200 text-amber-900 font-bold px-1.5 py-0.5 rounded-md">
                      Pendiente
                    </span>
                    {reservation.solicitudEliminacion.esSerie && (
                      <span className="text-[10px] bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded-md border border-purple-200">
                        Serie Recurrente
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-amber-900 mt-0.5 leading-snug">
                    Solicitado por <strong>{reservation.solicitudEliminacion.solicitadoPorNombre || reservation.solicitudEliminacion.solicitadoPor}</strong>
                    {reservation.solicitudEliminacion.solicitadoPorRol ? ` (${reservation.solicitudEliminacion.solicitadoPorRol})` : ''}
                    {reservation.solicitudEliminacion.fechaSolicitud
                      ? ` el ${new Date(reservation.solicitudEliminacion.fechaSolicitud).toLocaleDateString('es-CL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}`
                      : ''}.
                  </p>
                  {reservation.solicitudEliminacion.motivo ? (
                    <p className="text-[11px] text-amber-950 italic mt-1.5 bg-white/70 p-2 rounded-lg border border-amber-200">
                      "{reservation.solicitudEliminacion.motivo}"
                    </p>
                  ) : (
                    <p className="text-[10px] text-amber-700 italic mt-0.5">
                      Sin motivo adicional especificado.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {canModify ? (
              <div className="flex items-center gap-2 pt-2 border-t border-amber-200/80 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    openConfirm({
                      title: '¿Rechazar solicitud de eliminación?',
                      message: 'La reserva permanecerá activa en el calendario y se descartará el pedido de baja.',
                      confirmLabel: 'Rechazar Solicitud',
                      variant: 'warning',
                      onConfirm: () => {
                        onRejectDeleteRequest?.(reservation);
                        closeConfirm();
                      }
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <XCircle className="w-3.5 h-3.5 text-slate-500" />
                  <span>Rechazar Solicitud</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    openConfirm({
                      title: '¿Autorizar y Eliminar definitivamente?',
                      message: 'Esta acción eliminará la reserva de la base de datos de manera definitiva.',
                      confirmLabel: 'Autorizar y Eliminar',
                      variant: 'danger',
                      onConfirm: () => {
                        onAuthorizeDelete?.(reservation);
                        closeConfirm();
                      }
                    });
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-white" />
                  <span>Autorizar y Eliminar</span>
                </button>
              </div>
            ) : (
              (currentUser?.username === reservation.solicitudEliminacion.solicitadoPor) && (
                <div className="flex justify-end pt-1 border-t border-amber-200">
                  <button
                    type="button"
                    onClick={() => {
                      openConfirm({
                        title: '¿Cancelar tu solicitud de eliminación?',
                        message: 'Se anulará el pedido de baja y la reserva continuará activa con normalidad.',
                        confirmLabel: 'Sí, anular solicitud',
                        variant: 'primary',
                        onConfirm: () => {
                          onRejectDeleteRequest?.(reservation);
                          closeConfirm();
                        }
                      });
                    }}
                    className="text-xs font-semibold text-amber-800 hover:text-amber-950 underline cursor-pointer"
                  >
                    Cancelar mi solicitud
                  </button>
                </div>
              )
            )}
          </div>
        )}

        {/* Info Cards Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center space-x-1">
              <Calendar className="w-3 h-3 text-blue-600" />
              <span>Fecha</span>
            </div>
            <div className="font-bold text-slate-900 font-mono">{formatDateDDMMYYYY(reservation.fecha)}</div>
            {isSingleDayMultiSpaceReservation(reservation) ? (
              <div className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 inline-block font-semibold">
                🏢 Multi-Espacio ({reservation.indiceEnSerie === 1 ? '1° Espacio' : '2° Espacio'})
              </div>
            ) : reservation.actividadRecurrente === 'Sí' ? (
              <div className="text-[10px] text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 inline-block font-semibold">
                🔄 Recurrente ({reservation.indiceEnSerie || 1}/{reservation.totalEnSerie || '—'})
              </div>
            ) : null}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center space-x-1">
              <Clock className="w-3 h-3 text-blue-600" />
              <span>Horario</span>
            </div>
            <div className="font-bold text-slate-900 font-mono">{reservation.horaInicio} - {reservation.horaFin}</div>
            <div className="text-[10px] text-slate-500 font-medium">{reservation.tipoActividad}</div>
            {(reservation.horarioExtendidoAutorizado ||
              checkLoanScheduleLimit(reservation.horaInicio, reservation.horaFin, Boolean(reservation.terminaDiaSiguiente)).isOutsideRegularHours) && (
              <div className="mt-1.5 p-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[10.5px] text-amber-900 space-y-0.5">
                <div className="font-bold flex items-center space-x-1">
                  <span>🌙</span>
                  <span>Horario Extendido Autorizado</span>
                </div>
                <div className="text-[9.5px] text-amber-800">
                  {reservation.terminaDiaSiguiente
                    ? 'Cruza medianoche (+1 día)'
                    : checkLoanScheduleLimit(reservation.horaInicio, reservation.horaFin).reason || 'Fuera de rango regular 08:30-22:00'}
                </div>
                {reservation.autorizadoPor && (
                  <div className="text-[9px] text-amber-700 font-medium">
                    Autorizado por: {reservation.autorizadoPor}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center space-x-1">
              <User className="w-3 h-3 text-blue-600" />
              <span>Responsable</span>
            </div>
            <div className="font-bold text-slate-900 truncate">{reservation.responsable}</div>
            {reservation.telefonoContacto && (() => {
              const phoneAction = getPhoneContactActions(reservation.telefonoContacto);
              if (!phoneAction) {
                return <div className="text-[11px] text-slate-600 font-medium">📞 {reservation.telefonoContacto}</div>;
              }
              return (
                <div className="flex items-center space-x-1.5 pt-0.5">
                  <a
                    href={phoneAction.telHref}
                    title="Llamar directamente por teléfono"
                    className="text-[11px] text-blue-700 hover:text-blue-900 font-semibold hover:underline flex items-center space-x-1"
                  >
                    <span>📞</span>
                    <span>{reservation.telefonoContacto}</span>
                  </a>
                  <a
                    href={phoneAction.waHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Enviar mensaje por WhatsApp"
                    className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                  >
                    WhatsApp
                  </a>
                </div>
              );
            })()}
            {reservation.emailContacto && (
              <div className="text-[11px] text-slate-600 truncate">✉️ {reservation.emailContacto}</div>
            )}
            {reservation.rut && (
              <div className="text-[10px] text-slate-500 font-mono">RUT: {reservation.rut}</div>
            )}
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center space-x-1">
              <Users className="w-3 h-3 text-blue-600" />
              <span>Participantes</span>
            </div>
            <div className="font-bold text-slate-900">{reservation.cantidadParticipantes || 0} personas</div>
            <div className="flex items-center space-x-1 pt-0.5">
              <span className="text-[11px] text-slate-500 font-medium">Asistencia:</span>
              <button
                type="button"
                onClick={() => {
                  if (!onToggleRealizada) return;
                  const isCurrentlyAttended = reservation.realizada === 'Sí';
                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                  const isFutureDate = reservation.fecha > todayStr;

                  if (!isCurrentlyAttended && isFutureDate) {
                    openConfirm({
                      title: 'Confirmar asistencia anticipada',
                      message: `Esta reserva está agendada para el ${formatDateDDMMYYYY(reservation.fecha)}, una fecha futura. ¿Deseas marcarla como realizada anticipadamente?`,
                      confirmLabel: 'Sí, marcar como realizada',
                      cancelLabel: 'Cancelar',
                      variant: 'warning',
                      onConfirm: () => {
                        onToggleRealizada(reservation);
                        closeConfirm();
                      }
                    });
                  } else {
                    onToggleRealizada(reservation);
                  }
                }}
                className={`text-[11px] font-bold px-2 py-0.5 rounded-md cursor-pointer transition inline-flex items-center gap-1 shadow-xs ${
                  reservation.realizada === 'Sí'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300 border border-slate-300'
                }`}
                title="Haga clic para alternar asistencia"
              >
                {reservation.realizada === 'Sí' ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                    <span>Realizada</span>
                  </>
                ) : (
                  <span>Pendiente</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Section: Rating info (Strictly for Birthday Loans - Préstamo Cumpleaños) */}
        {isEligibleForRating(reservation) && (
          <div className={`p-4 rounded-2xl border transition space-y-2.5 ${
            existingRating
              ? existingRating.huboDanos || existingRating.puntajeGeneral <= 2
                ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                : 'bg-amber-50/70 border-amber-200 text-amber-950'
              : 'bg-amber-50/60 border-amber-200 text-amber-950'
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Cake className={`w-4 h-4 text-amber-600`} />
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  {existingRating ? 'Evaluación de Cumpleaños' : 'Calificación de Cumpleaños'}
                </span>
              </div>

              {existingRating && (
                <span className="text-xs font-black font-mono px-2 py-0.5 rounded-lg bg-white/80 border border-slate-200 shadow-2xs">
                  {existingRating.puntajeGeneral} / 5 ⭐
                </span>
              )}
            </div>

            {existingRating ? (
              <div className="text-xs space-y-1.5">
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-700">
                  <span>Limpieza: <strong>{existingRating.limpieza}/5</strong></span>
                  <span>•</span>
                  <span>Puntualidad: <strong>{existingRating.puntualidad}/5</strong></span>
                  <span>•</span>
                  <span>Cuidado: <strong>{existingRating.cuidadoInstalaciones}/5</strong></span>
                </div>

                {(existingRating.huboDanos || existingRating.dejoBasura) && (
                  <div className="text-[11px] font-bold text-rose-700 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>
                      {existingRating.huboDanos ? `Reporte de daños: ${existingRating.detalleDanos || 'Sí'}` : 'Dejó basura acumulada'}
                    </span>
                  </div>
                )}

                {existingRating.observaciones && (
                  <p className="text-[11px] italic text-slate-600 bg-white/60 p-2 rounded-lg border border-slate-100">
                    "{existingRating.observaciones}"
                  </p>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">Evaluado por: {existingRating.auxiliarName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenRatingModal && onOpenRatingModal(reservation, existingRating);
                    }}
                    className="text-[11px] text-amber-800 hover:text-amber-900 font-bold underline cursor-pointer"
                  >
                    Editar calificación
                  </button>
                </div>
              </div>
            ) : (
              (() => {
                const check = isRatingAllowedForReservation(reservation);
                if (!check.allowed) {
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-900/90 bg-amber-100/50 p-2.5 rounded-xl border border-amber-200/80">
                      <span className="font-medium">
                        ⏳ {check.reason || `No es posible calificar por adelantado. Se habilitará al término de la actividad (${formatDateDDMMYYYY(reservation.fecha)} a las ${reservation.horaFin}).`}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200/80 text-amber-950 rounded-lg shrink-0 self-start sm:self-auto">
                        No disponible aún
                      </span>
                    </div>
                  );
                }

                return (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-900">
                      Evento de cumpleaños pendiente de evaluar.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenRatingModal && onOpenRatingModal(reservation);
                      }}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-black transition shadow-xs flex items-center space-x-1 cursor-pointer"
                    >
                      <Star className="w-3 h-3 fill-slate-950 text-slate-950" />
                      <span>Calificar Cumpleaños</span>
                    </button>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {/* Tipo de Préstamo if present */}
        {reservation.tipoPrestamo && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-0.5">
            <div className="text-[10px] font-bold text-slate-500 uppercase">Modalidad de Préstamo:</div>
            <p className="text-slate-800 font-semibold">{reservation.tipoPrestamo}</p>
          </div>
        )}

        {/* Equipamiento y Recursos Solicitados */}
        {reservation.equipamientoSolicitado && reservation.equipamientoSolicitado.length > 0 && (
          <div className="p-3.5 bg-indigo-50/70 rounded-2xl border border-indigo-200/80 text-xs space-y-2">
            <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900 uppercase tracking-wide">
              <span className="flex items-center space-x-1.5">
                <span>📦</span>
                <span>Equipamiento y Recursos Asignados ({reservation.equipamientoSolicitado.reduce((acc, curr) => acc + curr.quantity, 0)})</span>
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {reservation.equipamientoSolicitado.map((eq, i) => (
                <div
                  key={i}
                  className="p-2 bg-white rounded-xl border border-indigo-100 flex items-start justify-between gap-2 shadow-2xs"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900 block truncate text-xs">
                      {eq.equipmentName}
                    </span>
                    {eq.notes && (
                      <span className="text-[10px] text-slate-500 italic block truncate">
                        "{eq.notes}"
                      </span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-800 font-extrabold text-xs font-mono shrink-0">
                    x{eq.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extra Notes */}
        {reservation.comentarios && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <div className="text-[10px] font-bold text-slate-500 uppercase">Comentarios & Equipamiento:</div>
            <p className="text-slate-800">{reservation.comentarios}</p>
          </div>
        )}

        {/* Carta de Compromiso Oficial Section (Activa para Préstamo, Cumpleaños, si fue activada, o con documento adjunto) */}
        {(isCommitmentLetterEligible(reservation.tipoActividad, reservation.tipoPrestamo) || reservation.requiereCartaCompromiso || reservation.cartaCompromisoAdjunta) && (
          <CommitmentLetterCard
            reservation={reservation}
            allReservations={allReservations}
            onUpdateAttachment={handleUpdateAttachment}
          />
        )}

        {/* Footer Actions: Carta, Edit & Delete */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
          <div className="flex items-center space-x-2">
            {canDelete ? (
              <button
                id="btn-detail-delete"
                type="button"
                onClick={() => {
                  if (onRequestDelete) {
                    onClose();
                    onRequestDelete(reservation);
                    return;
                  }
                  if (onDelete) {
                    if (reservation.actividadRecurrente === 'Sí' && (reservation.recurrenteId || reservation.serieRecurrente)) {
                      openConfirm({
                        title: 'Eliminar Reserva Recurrente',
                        message: (
                          <div className="space-y-2 text-xs text-slate-600">
                            <p>Esta reserva pertenece a una serie recurrente periódica.</p>
                            <p className="font-semibold text-slate-800">
                              ¿Deseas eliminar únicamente esta sesión individual o la serie recurrente completa?
                            </p>
                          </div>
                        ),
                        confirmLabel: 'Eliminar Toda la Serie',
                        cancelLabel: 'Solo Esta Sesión',
                        variant: 'danger',
                        onConfirm: () => {
                          onDelete(reservation.id, true, reservation.recurrenteId || reservation.serieRecurrente);
                          closeConfirm();
                          onClose();
                        },
                        onCancel: () => {
                          onDelete(reservation.id, false);
                          closeConfirm();
                          onClose();
                        }
                      });
                      return;
                    }
                    openConfirm({
                      title: '¿Eliminar esta reserva?',
                      message: `Se eliminará la reserva "${reservation.tipoActividad}" agendada en ${reservation.espacio} el día ${formatDateDDMMYYYY(reservation.fecha)}.`,
                      confirmLabel: 'Eliminar Reserva',
                      variant: 'danger',
                      onConfirm: () => {
                        onDelete(reservation.id, false);
                        closeConfirm();
                        onClose();
                      }
                    });
                  }
                }}
                className="flex items-center space-x-1.5 text-xs text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 font-bold px-3 py-2 rounded-xl transition shadow-xs cursor-pointer"
                aria-label="Eliminar esta reserva"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Eliminar</span>
              </button>
            ) : !reservation.solicitudEliminacion ? (
              <button
                id="btn-detail-request-delete"
                type="button"
                onClick={() => {
                  onClose();
                  onRequestDelete?.(reservation);
                }}
                className="flex items-center space-x-1.5 text-xs text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 font-bold px-3 py-2 rounded-xl transition shadow-xs cursor-pointer"
                aria-label="Solicitar eliminación de esta reserva"
                title="Solicitar eliminación (quedará en espera de autorización por un Administrador o Coordinador autorizado)"
              >
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Solicitar Eliminación</span>
              </button>
            ) : (
              <span className="flex items-center space-x-1.5 text-xs text-amber-800 bg-amber-100/80 border border-amber-300 font-bold px-3 py-1.5 rounded-xl">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span>En espera de autorización</span>
              </span>
            )}

            {(isCommitmentLetterEligible(reservation.tipoActividad, reservation.tipoPrestamo) || reservation.requiereCartaCompromiso || reservation.cartaCompromisoAdjunta) && (
              <button
                id="btn-detail-carta-compromiso"
                type="button"
                aria-label="Generar e imprimir Carta de Compromiso oficial"
                onClick={() => setShowCommitmentLetter(true)}
                className="flex items-center space-x-1.5 text-xs text-amber-950 bg-amber-400 hover:bg-amber-300 font-black px-3 py-2 rounded-xl transition shadow-xs cursor-pointer"
                title="Generar e imprimir Carta de Compromiso oficial"
              >
                <FileSignature className="w-4 h-4 text-slate-950" />
                <span>Carta Compromiso</span>
              </button>
            )}

            {canModify && onUpdateReservation && (
              <button
                id="btn-detail-toggle-important"
                type="button"
                aria-label={reservation.importante === 'Sí' ? 'Desmarcar reserva importante' : 'Marcar reserva como importante'}
                aria-pressed={reservation.importante === 'Sí'}
                onClick={() => onUpdateReservation({
                  ...reservation,
                  importante: reservation.importante === 'Sí' ? 'No' : 'Sí'
                })}
                className={`flex items-center space-x-1.5 text-xs border font-bold px-3 py-2 rounded-xl transition shadow-xs cursor-pointer ${
                  reservation.importante === 'Sí'
                    ? 'text-amber-950 bg-amber-100 hover:bg-amber-200 border-amber-300'
                    : 'text-slate-700 bg-slate-50 hover:bg-amber-50 border-slate-200'
                }`}
                title={reservation.importante === 'Sí' ? 'Desmarcar reserva importante' : 'Marcar reserva como importante'}
              >
                <Flame className="w-4 h-4 text-amber-600" />
                <span>{reservation.importante === 'Sí' ? 'Desmarcar Importante' : 'Marcar Importante'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {onDuplicate && canCreate && (
              <button
                id="btn-detail-duplicate"
                type="button"
                aria-label="Duplicar esta reserva en una nueva fecha u horario"
                onClick={() => {
                  onClose();
                  onDuplicate(reservation);
                }}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-200 text-xs font-bold shadow-xs transition cursor-pointer"
                title="Duplicar esta reserva (copia todos los datos a una nueva reserva)"
              >
                <Copy className="w-4 h-4 text-indigo-600" />
                <span>Duplicar</span>
              </button>
            )}

            {canModify ? (
              <>
                {onUpdateReservation && (
                  <button
                    id="btn-detail-toggle-cancel"
                    type="button"
                    onClick={handleToggleCancel}
                    className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer border ${
                      reservation.estado === 'cancelada'
                        ? 'text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border-emerald-300'
                        : 'text-amber-800 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border-amber-300'
                    }`}
                    title={reservation.estado === 'cancelada' ? 'Reactivar reserva en la agenda' : 'Marcar como cancelada y liberar el horario'}
                  >
                    <Ban className="w-3.5 h-3.5" />
                    <span>{reservation.estado === 'cancelada' ? 'Reactivar' : 'Cancelar Reserva'}</span>
                  </button>
                )}
                {onMergeReservations && (
                  <button
                    id="btn-detail-merge"
                    type="button"
                    aria-label="Juntar o fusionar con otra reserva de esta misma actividad"
                    onClick={() => setShowMergeModal(true)}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-800 border border-purple-200 text-xs font-bold shadow-xs transition cursor-pointer"
                    title="Juntar con otra reserva del mismo día o solicitante para unificarlas"
                  >
                    <GitMerge className="w-4 h-4 text-purple-600" />
                    <span>Juntar Reserva</span>
                  </button>
                )}
                <button
                  id="btn-detail-edit"
                  type="button"
                  aria-label="Editar datos de esta reserva"
                  onClick={() => {
                    onClose();
                    onEdit(reservation);
                  }}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>Editar Reserva</span>
                </button>
              </>
            ) : (
              <div
                title="No posees permisos para modificar o cancelar reservas (gestión controlada por Cristian Shute)."
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-medium cursor-not-allowed"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Modificación no autorizada</span>
              </div>
            )}
          </div>
        </div>
      </BaseModal>

      {/* Commitment Letter Modal */}
      {showCommitmentLetter && (
        <CommitmentLetterModal
          isOpen={showCommitmentLetter}
          onClose={() => setShowCommitmentLetter(false)}
          reservationData={reservation}
          allReservations={allReservations}
        />
      )}

      {/* Merge Reservations Modal */}
      {showMergeModal && onMergeReservations && (
        <MergeReservationsModal
          isOpen={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          targetReservation={reservation}
          allReservations={allReservations}
          onConfirmMerge={async (targetId, sourceId) => {
            const ok = await onMergeReservations(targetId, sourceId);
            if (ok !== false) {
              setShowMergeModal(false);
              onClose();
            }
            return ok;
          }}
        />
      )}

      {/* Accessible Confirmation Modal (D4) */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        cancelLabel={confirmModal.cancelLabel}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => {
          if (confirmModal.onCancel) {
            confirmModal.onCancel();
          } else {
            closeConfirm();
          }
        }}
      />
    </>
  );
};
