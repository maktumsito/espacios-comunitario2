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
        <header className="shrink-0 bg-slate-900 px-4 py-3 text-white sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="min-w-0 text-base font-bold sm:text-lg">
              {replacementMode
                ? "Reemplazar solo este día"
                : isDuplicating
                  ? "Duplicar reserva"
                  : editingReservation
                    ? "Editar reserva"
                    : "Nueva reserva"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="hidden text-sm text-slate-300 sm:block">
              {isDuplicating
                ? "Revisa fecha, espacio y horario antes de confirmar."
                : editingReservation
                  ? formatDisplayTitle(editingReservation.espacio)
                  : "Completa los datos y revisa la reserva antes de guardar."}
            </p>
            {!replacementMode && (
              <button
                type="button"
                id="toggle-wizard-mode-btn"
                onClick={() => setIsWizardMode((prev) => !prev)}
                className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-white/10"
                title={
                  isWizardMode
                    ? "Cambiar a vista continua completa"
                    : "Dividir el formulario en 5 pasos progresivos"
                }
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>
                  {isWizardMode
                    ? "Ver formulario completo"
                    : "Modo guiado (5 pasos)"}
                </span>
              </button>
            )}
          </div>
        </header>
      );
    },
  );

ReservationModalHeader.displayName = "ReservationModalHeader";
