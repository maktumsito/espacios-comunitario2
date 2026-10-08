import { formatDisplayTitle } from '../utils/reservationVisuals';
import React, { useState } from 'react';
import { Reservation } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { SPACES_LIST } from '../data/spacesData';
import {
  Clock,
  Trash2,
  CheckCircle2,
  XCircle,
  Calendar,
  User,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { BaseModal } from './common/BaseModal';
import { ConfirmationModal } from './common/ConfirmationModal';

interface PendingDeletionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingReservations: Reservation[];
  onAuthorizeDelete: (reservation: Reservation) => void;
  onRejectDeleteRequest: (reservation: Reservation) => void;
  onSelectReservation: (reservation: Reservation) => void;
}

export const PendingDeletionsModal: React.FC<PendingDeletionsModalProps> = ({
  isOpen,
  onClose,
  pendingReservations,
  onAuthorizeDelete,
  onRejectDeleteRequest,
  onSelectReservation
}) => {
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning';
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    confirmLabel: 'Confirmar',
    onConfirm: () => {}
  });

  if (!isOpen) return null;

  const getSpaceColor = (spaceName: string) => {
    const space = SPACES_LIST.find((s) => s.name.toUpperCase() === spaceName.toUpperCase());
    return space ? space.color : '#64748b';
  };

  const modalFooter = (
    <div className="w-full flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
        <span>Solo Administradores y Coordinadores pueden autorizar eliminaciones.</span>
      </div>

      <button
        onClick={onClose}
        className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
      >
        Cerrar
      </button>
    </div>
  );

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="2xl"
        layer="nested"
        icon={<Clock className="w-5 h-5 text-amber-600" />}
        title={
          <div className="flex items-center gap-2">
            <span>Solicitudes de Eliminación en Espera</span>
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
              {pendingReservations.length}
            </span>
          </div>
        }
        subtitle="Reservas cuya eliminación fue solicitada por personal operativo o usuarios sin rol Administrador/Coordinador."
        footer={modalFooter}
        bodyClassName="p-5 overflow-y-auto space-y-3 text-xs flex-1"
      >
        {/* List of Pending Deletions */}
        <div className="space-y-3">
          {pendingReservations.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                ¡No hay solicitudes de eliminación pendientes!
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Todas las reservas del sistema se encuentran activas o fueron procesadas por el equipo de coordinación.
              </p>
            </div>
          ) : (
            pendingReservations.map((res) => {
              const req = res.solicitudEliminacion;
              const spaceColor = getSpaceColor(res.espacio);
              const formattedRequestDate = req?.fechaSolicitud
                ? new Date(req.fechaSolicitud).toLocaleDateString('es-CL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : 'Fecha no registrada';

              return (
                <div
                  key={res.id}
                  className="bg-slate-50 hover:bg-white border border-amber-200/80 rounded-2xl p-4 transition shadow-2xs space-y-3 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold text-white normal-case tracking-wider"
                          style={{ backgroundColor: spaceColor }}
                        >
                          {formatDisplayTitle(res.espacio)}
                        </span>
                        {req?.esSerie && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            Serie Recurrente
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-700" />
                          <span>En Espera de Autorización</span>
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 pt-0.5">
                        {formatDisplayTitle(res.tipoActividad)}
                        {res.descripcion && (
                          <span className="font-normal text-slate-600 ml-1 text-xs">
                            — {formatDisplayTitle(res.descripcion)}
                          </span>
                        )}
                      </h4>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600 text-[11px] pt-0.5">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDateDDMMYYYY(res.fecha)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{res.horaInicio} - {res.horaFin}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{formatDisplayTitle(res.responsable)}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onSelectReservation(res)}
                      className="text-blue-600 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 transition shrink-0"
                      title="Ver detalle completo de la reserva"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Requester & Reason Box */}
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1">
                    <div className="text-[11px] text-amber-950 font-semibold flex items-center justify-between">
                      <span>
                        Solicitado por: <strong>{req?.solicitadoPorNombre || req?.solicitadoPor || 'Personal'}</strong>
                        {req?.solicitadoPorRol && <span className="text-amber-800 font-normal"> ({req.solicitadoPorRol})</span>}
                      </span>
                      <span className="text-[10px] text-amber-700 font-normal">
                        {formattedRequestDate}
                      </span>
                    </div>
                    {req?.motivo ? (
                      <p className="text-xs text-amber-950 bg-white/70 p-2 rounded-lg border border-amber-200/60 italic">
                        "{req.motivo}"
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-700 italic">
                        Sin motivo especificado por el solicitante.
                      </p>
                    )}
                  </div>

                  {/* Action Buttons for Administrator or Coordinator */}
                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDialog({
                          isOpen: true,
                          title: '¿Rechazar solicitud de eliminación?',
                          message: `La reserva "${res.tipoActividad}" permanecerá activa en el calendario comunitario y se descartará la solicitud de baja.`,
                          variant: 'warning',
                          confirmLabel: 'Rechazar Solicitud',
                          onConfirm: () => {
                            onRejectDeleteRequest(res);
                            setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                          }
                        });
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 text-xs font-bold transition flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5 text-slate-500" />
                      <span>Rechazar / Descartar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDialog({
                          isOpen: true,
                          title: '¿Autorizar y Eliminar definitivamente?',
                          message: `Esta acción autorizará la solicitud y eliminará definitivamente la reserva "${res.tipoActividad}" agendada en ${res.espacio}.`,
                          variant: 'danger',
                          confirmLabel: 'Autorizar y Eliminar',
                          onConfirm: () => {
                            onAuthorizeDelete(res);
                            setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                          }
                        });
                      }}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                      <span>Autorizar y Eliminar</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </BaseModal>

      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
};
