import { formatDisplayTitle } from '../utils/reservationVisuals';
import React from 'react';
import { History, RotateCcw, Lock, Clock, AlertTriangle, Copy } from 'lucide-react';
import { Reservation } from '../types';
import { AuthUser } from '../services/authService';
import { AutosavedReservationDraft } from '../hooks/useReservationAutosave';

interface ReservationModalAlertsProps {
  hasDraft: boolean;
  draftData: AutosavedReservationDraft | null;
  draftTimeAgo: string;
  discardDraft: () => void;
  restoreDraft: () => void;
  isEditingExisting: boolean;
  canModifyReservation: boolean;
  currentUser?: AuthUser | null;
  editingReservation?: Reservation | null;
  concurrencyConflict: {
    type: 'deleted' | 'modified';
    message?: string;
    editor?: string;
    updatedAt?: string;
    currentReservation?: Reservation;
  } | null;
  onReloadConcurrency: () => void;
  onDismissConcurrency: () => void;
  isDuplicating: boolean;
}

export const ReservationModalAlerts: React.FC<ReservationModalAlertsProps> = React.memo(({
  hasDraft,
  draftData,
  draftTimeAgo,
  discardDraft,
  restoreDraft,
  isEditingExisting,
  canModifyReservation,
  currentUser,
  editingReservation,
  concurrencyConflict,
  onReloadConcurrency,
  onDismissConcurrency,
  isDuplicating
}) => {
  return (
    <>
      {/* Autosave Draft Recovery Card */}
      {hasDraft && draftData && (
        <div
          id="autosave-recovery-banner"
          className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-3 shadow-xs animate-fadeIn"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3">
              <div className="p-2 bg-amber-200 rounded-xl text-amber-900 mt-0.5 shrink-0">
                <History className="w-5 h-5 text-amber-800" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-amber-950 flex items-center gap-2">
                  <span>Borrador guardado automáticamente</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-200 text-amber-900 font-extrabold border border-amber-300">
                    {draftTimeAgo}
                  </span>
                </h4>
                <p className="text-xs text-amber-900 leading-relaxed">
                  Se detectó progreso no guardado de una sesión previa
                  {draftData.formData?.responsable ? (
                    <> para <strong>{formatDisplayTitle(draftData.formData.responsable)}</strong> ({formatDisplayTitle(draftData.formData.tipoActividad || 'Actividad')})</>
                  ) : draftData.formData?.descripcion ? (
                    <>: &quot;{formatDisplayTitle(draftData.formData.descripcion)}&quot;</>
                  ) : null}.
                  ¿Deseas restaurar este borrador o descartarlo para continuar con los valores actuales?
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end space-x-2 pt-1 border-t border-amber-200/80">
            <button
              type="button"
              id="btn-discard-draft"
              onClick={discardDraft}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-amber-800 hover:text-amber-950 hover:bg-amber-100 transition cursor-pointer"
            >
              Descartar borrador
            </button>
            <button
              type="button"
              id="btn-restore-draft"
              onClick={restoreDraft}
              className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar mi progreso</span>
            </button>
          </div>
        </div>
      )}

      {/* Read-Only Notice for Non-Admin/Non-Coordinator users */}
      {isEditingExisting && !canModifyReservation && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-2 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-200 rounded-xl text-amber-900 mt-0.5 shrink-0">
              <Lock className="w-5 h-5 text-amber-800" />
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="text-sm font-bold text-amber-950">
                Modo Solo Lectura: Edición Restringida
              </h4>
              <p className="text-xs text-amber-900 leading-relaxed">
                Tu usuario ({currentUser?.name || currentUser?.username} - Rol: {currentUser?.role || 'Personal'}) tiene acceso de visualización. Únicamente los usuarios con perfil <strong>Administrador</strong> o <strong>Coordinador</strong> están autorizados para modificar, editar o eliminar reservas existentes directamente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Deletion Request Warning */}
      {editingReservation?.solicitudEliminacion && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 space-y-1.5 shadow-xs">
          <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
            <Clock className="w-4 h-4 text-amber-800" />
            <span>Esta reserva se encuentra en espera de autorización de eliminación</span>
          </div>
          <p className="text-xs text-amber-900">
            Solicitado por <strong>{editingReservation.solicitudEliminacion.solicitadoPorNombre || editingReservation.solicitudEliminacion.solicitadoPor}</strong>
            {editingReservation.solicitudEliminacion.motivo ? `: "${editingReservation.solicitudEliminacion.motivo}"` : ''}
          </p>
        </div>
      )}

      {/* Concurrency Conflict Warning (Hallazgo 3) */}
      {concurrencyConflict && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-3 shadow-xs animate-fadeIn">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-200 rounded-xl text-amber-900 mt-0.5 shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-800" />
            </div>
            <div className="space-y-1 flex-1">
              <h4 className="text-sm font-bold text-amber-950 flex items-center space-x-2">
                <span>Aviso de Concurrencia de Datos</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-200 text-amber-900 font-extrabold border border-amber-300">
                  MODIFICADA EXTERNAMENTE
                </span>
              </h4>
              <p className="text-xs text-amber-900/90 leading-relaxed">
                {concurrencyConflict.type === 'deleted'
                  ? '⚠️ Esta reserva fue eliminada en otra sesión mientras editabas.'
                  : `⚠️ Esta reserva fue modificada recientemente por ${concurrencyConflict.editor || 'otro usuario'} el ${concurrencyConflict.updatedAt ? new Date(concurrencyConflict.updatedAt).toLocaleDateString('es-CL') : 'recientemente'}. Si continúas sin recargar, podrías sobrescribir los cambios ajenos.`}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {concurrencyConflict.currentReservation && (
                  <button
                    type="button"
                    id="btn-concurrency-reload"
                    aria-label="Recargar datos actualizados de la reserva"
                    onClick={onReloadConcurrency}
                    className="px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
                  >
                    Recargar datos actualizados
                  </button>
                )}
                <button
                  type="button"
                  id="btn-concurrency-dismiss"
                  aria-label="Mantener cambios y descartar aviso de concurrencia"
                  onClick={onDismissConcurrency}
                  className="px-3 py-1.5 bg-white border border-amber-300 text-amber-950 hover:bg-amber-100/50 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Mantener mis cambios y descartar aviso
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Informational banner when Duplicating */}
      {isDuplicating && (
        <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex items-start space-x-3 shadow-2xs">
          <div className="p-2 bg-indigo-100 rounded-xl text-indigo-700 mt-0.5 shrink-0">
            <Copy className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-indigo-900 flex items-center space-x-2">
              <span>Modo Duplicación Activo</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-indigo-200 text-indigo-800 font-extrabold">
                NUEVA COPIA
              </span>
            </h4>
            <p className="text-[11px] text-indigo-800 leading-relaxed">
              Todos los campos de la reserva original (responsable, contacto, tipo de actividad, cantidad de participantes, requerimientos, etc.) han sido precargados. Puedes seleccionar una nueva fecha u horario y pulsar <strong>&quot;Guardar Reserva Duplicada&quot;</strong> para registrarla.
            </p>
          </div>
        </div>
      )}
    </>
  );
});

ReservationModalAlerts.displayName = 'ReservationModalAlerts';
