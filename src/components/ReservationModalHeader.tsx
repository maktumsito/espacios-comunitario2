import { formatDisplayTitle } from "../utils/reservationVisuals";
import React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Reservation } from "../types";

interface ReservationModalHeaderProps {
  replacementMode?: boolean;
  isDuplicating: boolean;
  editingReservation?: Reservation | null;
  isWizardMode: boolean;
  setIsWizardMode: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
}

export const ReservationModalHeader: React.FC<ReservationModalHeaderProps> =
  React.memo(
    ({
      replacementMode = false,
      isDuplicating,
      editingReservation,
      isWizardMode,
      setIsWizardMode,
      onClose,
    }) => {
      return (
        <header className="shrink-0 bg-slate-900 px-4 py-3 text-white sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              {replacementMode
                ? "Reemplazar solo este día"
                : isDuplicating
                  ? "Duplicar reserva"
                  : editingReservation
                    ? "Editar reserva"
                    : "Nueva reserva"}
            </h2>
            <p className="hidden text-xs leading-5 text-slate-300 sm:block">
              {isDuplicating
                ? "Revisa fecha, espacio y horario antes de confirmar."
                : editingReservation
                  ? formatDisplayTitle(editingReservation.espacio)
                  : "Completa los datos y revisa la reserva antes de guardar."}
            </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            {!replacementMode && (
              <button
                type="button"
                id="toggle-wizard-mode-btn"
                onClick={() => setIsWizardMode((prev) => !prev)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/20 px-2 py-1.5 text-xs font-medium text-slate-100 transition-colors hover:bg-white/10 sm:px-3"
                aria-label={isWizardMode ? 'Ver formulario completo' : 'Modo guiado (5 pasos)'}
                title={
                  isWizardMode
                    ? "Cambiar a vista continua completa"
                    : "Dividir el formulario en 5 pasos progresivos"
                }
              >
                <SlidersHorizontal className="hidden h-4 w-4 sm:block" />
                <span className="hidden sm:inline">
                  {isWizardMode
                    ? "Ver formulario completo"
                    : "Modo guiado (5 pasos)"}
                </span>
                <span className="sm:hidden">{isWizardMode ? 'Vista completa' : 'Modo guiado'}</span>
              </button>
            )}
            <button type="button" onClick={onClose} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white" aria-label="Cerrar modal">
              <X className="h-5 w-5" />
            </button>
            </div>
          </div>
        </header>
      );
    },
  );

ReservationModalHeader.displayName = "ReservationModalHeader";
