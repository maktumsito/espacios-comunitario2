import React from 'react';
import {
  Copy,
  Trash2,
  Clock,
  RefreshCw,
  Check,
  FileSignature,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Reservation, UpdateScope } from '../types';
import { isCommitmentLetterEligible } from '../utils/commitmentLetterPdf';

interface ReservationModalFooterProps {
  replacementMode?: boolean;
  editingReservation?: Reservation | null;
  isDuplicating: boolean;
  canModifyReservation: boolean;
  handleDuplicateReservation: () => void;
  handleDeleteFromModal: () => void;
  hasDeleteHandler: boolean;
  isAutosaving: boolean;
  autosaveLastSavedAt: number | null;
  formData: Partial<Reservation>;
  setFormData?: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  setDescargarCartaAlCrear?: (val: boolean) => void;
  setShowCommitmentLetterModal: (show: boolean) => void;
  isWizardMode: boolean;
  wizardStep: 1 | 2 | 3 | 4 | 5;
  setWizardStep: React.Dispatch<React.SetStateAction<1 | 2 | 3 | 4 | 5>>;
  scrollToModalTop: () => void;
  onClose: () => void;
  validateStep1: (showFeedback: boolean) => boolean;
  validateStep2: (showFeedback: boolean) => boolean;
  validateStep3?: (showFeedback: boolean) => boolean;
  validateStep4?: (showFeedback: boolean) => boolean;
  isFormSubmitDisabled: boolean;
  isEditingExisting: boolean;
  conflicts: Reservation[];
  candidateConflictDates: readonly string[] | string[];
  allowConflictOverride: boolean;
  isSubmitting: boolean;
  timeValidation: { isValid: boolean };
  enableSingleSecondSpace: boolean;
  singleSecondTimeValidation: { isValid: boolean };
  bookingMode: 'single' | 'specific' | 'pattern';
  generateFullSeries: boolean;
  specificDates: readonly string[] | string[];
  generatedDates: readonly string[] | string[];
  isStep1Completed?: boolean;
  isStep2Completed?: boolean;
  isStep3Completed?: boolean;
  isStep4Completed?: boolean;
}

export const ReservationModalFooter: React.FC<ReservationModalFooterProps> = React.memo(({
  replacementMode = false,
  editingReservation,
  isDuplicating,
  canModifyReservation,
  handleDuplicateReservation,
  handleDeleteFromModal,
  hasDeleteHandler,
  isAutosaving,
  autosaveLastSavedAt,
  formData,
  setFormData,
  setDescargarCartaAlCrear,
  setShowCommitmentLetterModal,
  isWizardMode,
  wizardStep,
  setWizardStep,
  scrollToModalTop,
  onClose,
  validateStep1,
  validateStep2,
  isFormSubmitDisabled,
  isEditingExisting,
  conflicts,
  candidateConflictDates,
  allowConflictOverride,
  isSubmitting,
  timeValidation,
  enableSingleSecondSpace,
  singleSecondTimeValidation,
  bookingMode,
  generateFullSeries,
  specificDates,
  generatedDates,
  isStep1Completed,
  isStep2Completed,
  isStep3Completed = true,
  isStep4Completed = true,
  validateStep3,
  validateStep4
}) => {
  return (
    <div className="flex items-center justify-between pt-4 border-t border-slate-200">
      <div className="flex items-center space-x-2">
        {/* Botón Duplicar Reserva */}
        {editingReservation && !isDuplicating && (
          <button
            type="button"
            id="btn-modal-duplicate-reservation"
            onClick={handleDuplicateReservation}
            className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            title="Crear una copia de esta reserva manteniendo responsable, contacto y datos"
          >
            <Copy className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden sm:inline">Duplicar Reserva</span>
            <span className="sm:hidden">Duplicar</span>
          </button>
        )}

        {editingReservation && !isDuplicating && (
          canModifyReservation ? (
            hasDeleteHandler && (
              <button
                type="button"
                id="btn-modal-delete-reservation"
                onClick={handleDeleteFromModal}
                className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span className="hidden sm:inline">Eliminar Reserva</span>
                <span className="sm:hidden">Eliminar</span>
              </button>
            )
          ) : !editingReservation.solicitudEliminacion ? (
            <button
              type="button"
              id="btn-modal-request-delete"
              onClick={handleDeleteFromModal}
              className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              title="Solicitar eliminación (quedará en espera de autorización por un Administrador o Coordinador)"
            >
              <Clock className="w-4 h-4 text-amber-700" />
              <span className="hidden sm:inline">Solicitar Eliminación</span>
              <span className="sm:hidden">Solicitar Elim.</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-amber-700" />
              <span>Eliminación en espera</span>
            </span>
          )
        )}

        {/* Autosave Status Indicator */}
        <div id="autosave-status-indicator" className="hidden sm:flex items-center space-x-1.5 text-[11px] text-slate-500 pl-2">
          {isAutosaving ? (
            <span className="flex items-center space-x-1 text-blue-600 font-medium">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Guardando borrador...</span>
            </span>
          ) : autosaveLastSavedAt ? (
            <span className="flex items-center space-x-1 text-emerald-600 font-medium" title="Borrador local guardado en tu navegador">
              <Check className="w-3 h-3 text-emerald-600" />
              <span>Borrador al día</span>
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-3">
        {(isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo) || formData.requiereCartaCompromiso) ? (
          <button
            id="btn-footer-carta-compromiso"
            type="button"
            onClick={() => setShowCommitmentLetterModal(true)}
            className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 text-xs font-black shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
            title="Generar y descargar Carta de Compromiso oficial"
          >
            <FileSignature className="w-3.5 h-3.5 text-amber-800" />
            <span className="hidden sm:inline">Carta de Compromiso</span>
            <span className="sm:hidden">Carta</span>
          </button>
        ) : (
          <button
            id="btn-footer-activar-carta-compromiso"
            type="button"
            onClick={() => {
              if (setFormData) {
                setFormData((prev) => ({ ...prev, requiereCartaCompromiso: true }));
              }
              if (setDescargarCartaAlCrear) {
                setDescargarCartaAlCrear(true);
              }
              setShowCommitmentLetterModal(true);
            }}
            className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50/80 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-950 text-xs font-bold shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
            title="Activar Carta de Compromiso con 1 clic para esta actividad y previsualizar"
          >
            <FileSignature className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">+ Carta Compromiso</span>
            <span className="sm:hidden">+ Carta</span>
          </button>
        )}
        {isWizardMode && wizardStep > 1 && (
          <button
            type="button"
            id="btn-wizard-prev"
            onClick={() => {
              setWizardStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : 1));
              scrollToModalTop();
            }}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs transition flex items-center space-x-1 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Anterior</span>
          </button>
        )}

        <button
          type="button"
          id="btn-cancel-reservation"
          aria-label="Cancelar y cerrar formulario de reserva"
          onClick={onClose}
          className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          Cancelar
        </button>

        {isWizardMode && wizardStep < 5 ? (
          <button
            id="btn-wizard-next"
            type="button"
            disabled={
              wizardStep === 1
                ? !isStep1Completed
                : wizardStep === 2
                ? (!isStep2Completed || !timeValidation.isValid)
                : wizardStep === 3
                ? !isStep3Completed
                : wizardStep === 4
                ? !isStep4Completed
                : false
            }
            onClick={() => {
              if (wizardStep === 1) {
                if (validateStep1 && !validateStep1(true)) return;
                setWizardStep(2);
                scrollToModalTop();
              } else if (wizardStep === 2) {
                if (!timeValidation.isValid) {
                  validateStep2 && validateStep2(true);
                  return;
                }
                if (validateStep2 && !validateStep2(true)) return;
                setWizardStep(3);
                scrollToModalTop();
              } else if (wizardStep === 3) {
                if (validateStep3 && !validateStep3(true)) return;
                setWizardStep(4);
                scrollToModalTop();
              } else if (wizardStep === 4) {
                if (validateStep4 && !validateStep4(true)) return;
                setWizardStep(5);
                scrollToModalTop();
              }
            }}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs transition flex items-center space-x-1.5 ${
              (wizardStep === 1
                ? !isStep1Completed
                : wizardStep === 2
                ? (!isStep2Completed || !timeValidation.isValid)
                : wizardStep === 3
                ? !isStep3Completed
                : wizardStep === 4
                ? !isStep4Completed
                : false)
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            }`}
          >
            <span>
              {wizardStep === 1
                ? 'Siguiente: Espacio y Horario'
                : wizardStep === 2
                ? 'Siguiente: Solicitante'
                : wizardStep === 3
                ? 'Siguiente: Recursos'
                : 'Siguiente: Resumen y Confirmación'}
            </span>
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            id="btn-submit-reservation"
            type="submit"
            aria-label="Confirmar y guardar reserva de espacio"
            disabled={isFormSubmitDisabled || (isEditingExisting && !canModifyReservation)}
            className={`px-5 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs transition ${
              isFormSubmitDisabled || (isEditingExisting && !canModifyReservation)
                ? 'bg-slate-400 opacity-60 cursor-not-allowed shadow-none'
                : (conflicts.length > 0 || candidateConflictDates.length > 0) && !allowConflictOverride
                ? 'bg-rose-600 hover:bg-rose-700 cursor-pointer'
                : isDuplicating
                ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
                : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center space-x-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Guardando...</span>
              </span>
            ) : isEditingExisting && !canModifyReservation
              ? 'Edición Restringida (Solo Admin/Coord)'
              : !timeValidation.isValid
              ? 'Horario Inválido (Término ≤ Inicio)'
              : enableSingleSecondSpace && !singleSecondTimeValidation.isValid
              ? 'Horario 2° Espacio Inválido'
              : (conflicts.length > 0 || candidateConflictDates.length > 0) && !allowConflictOverride
              ? (candidateConflictDates.length > 1 ? `Resolver Topamientos (${candidateConflictDates.length} días)` : 'Topamiento Detectado')
              : isDuplicating
              ? (bookingMode === 'specific' && generateFullSeries
                  ? (specificDates.length === 0
                      ? 'Sin fechas seleccionadas (0)'
                      : `Guardar Copia (${enableSingleSecondSpace ? specificDates.length * 2 : specificDates.length} ${specificDates.length === 1 ? 'Reserva' : 'Reservas'})`)
                  : bookingMode === 'pattern' && generateFullSeries
                  ? (generatedDates.length === 0
                      ? 'Sin sesiones válidas (0)'
                      : `Guardar Copia (${enableSingleSecondSpace ? generatedDates.length * 2 : generatedDates.length} ${generatedDates.length === 1 ? 'Sesión' : 'Sesiones'})`)
                  : enableSingleSecondSpace
                  ? 'Guardar Copia (2 Espacios)'
                  : 'Guardar Reserva Duplicada')
              : replacementMode
              ? 'Confirmar reemplazo'
              : editingReservation
              ? 'Guardar Cambios'
              : bookingMode === 'specific' && generateFullSeries
              ? (specificDates.length === 0
                  ? 'Sin fechas seleccionadas (0)'
                  : `Guardar Reserva (${enableSingleSecondSpace ? specificDates.length * 2 : specificDates.length} Reservas en Serie)`)
              : bookingMode === 'pattern' && generateFullSeries
              ? (generatedDates.length === 0
                  ? 'Sin sesiones válidas (0)'
                  : `Guardar Serie (${enableSingleSecondSpace ? generatedDates.length * 2 : generatedDates.length} ${enableSingleSecondSpace ? 'Reservas: 2 Espacios/Día' : generatedDates.length === 1 ? 'Sesión' : 'Sesiones'})`)
              : enableSingleSecondSpace
              ? 'Crear Reserva (2 Espacios)'
              : 'Crear Reserva'}
          </button>
        )}
      </div>
    </div>
  );
});
