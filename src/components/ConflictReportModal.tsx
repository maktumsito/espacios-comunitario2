import { formatDisplayTitle } from '../utils/reservationVisuals';
import React from 'react';
import { DetectedConflictDetail } from '../utils/conflictDetector';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { BaseModal } from './common/BaseModal';
import {
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  X,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

interface ConflictReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedCount: number;
  conflicts: DetectedConflictDetail[];
  onGoToConflictsView?: () => void;
}

export const ConflictReportModal: React.FC<ConflictReportModalProps> = ({
  isOpen,
  onClose,
  savedCount,
  conflicts,
  onGoToConflictsView
}) => {
  if (!isOpen) return null;

  const headerElement = (
    <div className="p-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white flex items-center justify-between shrink-0">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white shadow-inner">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base sm:text-lg font-bold">
            Reservas Guardadas con Aviso de Topamiento
          </h3>
          <p className="text-xs text-amber-100 font-medium">
            Se guardaron las {savedCount} sesiones en el sistema con advertencias de horarios copados
          </p>
        </div>
      </div>
      <button
        onClick={onClose}
        className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer flex items-center justify-center"
        aria-label="Cerrar modal de reporte de conflictos"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      layer="base"
      customHeader={headerElement}
      containerClassName="max-h-[90vh] flex flex-col overflow-hidden border border-amber-200"
      bodyClassName="p-5 sm:p-6 space-y-4 overflow-y-auto"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 w-full">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            Cerrar
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {onGoToConflictsView && (
              <button
                onClick={() => {
                  onClose();
                  onGoToConflictsView();
                }}
                className="min-h-[44px] px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-xl text-xs sm:text-sm font-bold transition flex items-center space-x-1.5 cursor-pointer"
              >
                <span>Ver Módulo de Conflictos</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={onClose}
              className="min-h-[44px] px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      }
    >
      {/* Success Box */}
      <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start space-x-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-emerald-900">
          <span className="font-bold">¡Guardado completado exitosamente!</span>
          <p className="text-xs text-emerald-700 mt-0.5">
            Las {savedCount} reservas de la serie fueron registradas y sincronizadas.
          </p>
        </div>
      </div>

      {/* Warning Message */}
      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start space-x-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-amber-900">
          <span className="font-bold">
            Atención: Se detectaron {conflicts.length} horario(s) copado(s) o con topamiento
          </span>
          <p className="text-xs text-amber-700 mt-0.5">
            Las siguientes fechas y horas coinciden con actividades ya existentes en el mismo espacio. Se guardaron
            igualmente como solicitaste:
          </p>
        </div>
      </div>

      {/* Conflicts Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
          Detalle de Topamientos Encontrados ({conflicts.length})
        </div>
        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
          {conflicts.map((c, idx) => (
            <div key={idx} className="p-3 bg-white hover:bg-slate-50 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <div className="flex items-center space-x-2 font-bold text-slate-900">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  <span>{formatDateDDMMYYYY(c.fecha)}</span>
                  <span className="text-slate-400 font-normal">|</span>
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span className="font-mono">
                    {c.reserva.horaInicio} - {c.reserva.horaFin}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-extrabold text-[10px] uppercase">
                  Topamiento: {c.overlap}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {/* Nueva reserva */}
                <div className="p-2 bg-blue-50/60 border border-blue-100 rounded-lg">
                  <div className="text-[10px] font-bold text-blue-700 uppercase">Nueva Reserva Guardada</div>
                  <div className="font-semibold text-slate-900 text-xs truncate">
                    {formatDisplayTitle(c.reserva.tipoActividad)}: {formatDisplayTitle(c.reserva.descripcion)}
                  </div>
                  <div className="text-[11px] text-slate-600">Resp: {formatDisplayTitle(c.reserva.responsable)}</div>
                </div>

                {/* Reserva existente */}
                <div className="p-2 bg-rose-50/60 border border-rose-100 rounded-lg">
                  <div className="text-[10px] font-bold text-rose-700 uppercase">Actividad ya existente</div>
                  <div className="font-semibold text-slate-900 text-xs truncate">
                    {formatDisplayTitle(c.conflictingWith.tipoActividad)}: {formatDisplayTitle(c.conflictingWith.descripcion)}
                  </div>
                  <div className="text-[11px] text-slate-600">
                    {c.conflictingWith.horaInicio}-{c.conflictingWith.horaFin} (Resp: {formatDisplayTitle(c.conflictingWith.responsable)})
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </BaseModal>
  );
};
