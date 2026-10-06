import React from 'react';
import { Copy, Calendar, Sparkles, SlidersHorizontal, X } from 'lucide-react';
import { Reservation } from '../types';

interface ReservationModalHeaderProps {
  replacementMode?: boolean;
  isDuplicating: boolean;
  editingReservation?: Reservation | null;
  isWizardMode: boolean;
  setIsWizardMode: React.Dispatch<React.SetStateAction<boolean>>;
  onClose: () => void;
}

export const ReservationModalHeader: React.FC<ReservationModalHeaderProps> = React.memo(({
  replacementMode = false,
  isDuplicating,
  editingReservation,
  isWizardMode,
  setIsWizardMode,
  onClose
}) => {
  return (
    <div className="px-6 py-5 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-900 text-white flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className={`p-2.5 rounded-2xl border ${
          isDuplicating
            ? 'bg-indigo-500/20 border-indigo-400/30 text-indigo-300'
            : 'bg-blue-500/20 border-blue-400/30 text-blue-300'
        }`}>
          {isDuplicating ? (
            <Copy className="w-5 h-5" />
          ) : editingReservation ? (
            <Calendar className="w-5 h-5" />
          ) : (
            <Sparkles className="w-5 h-5" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-bold">
            {replacementMode ? 'Reemplazar solo este día' : isDuplicating
              ? 'Duplicar Reserva de Espacio'
              : editingReservation
              ? 'Editar Reserva de Espacio'
              : 'Nueva Reserva de Espacio'}
          </h2>
          <p className="text-xs text-blue-200">
            {isDuplicating
              ? 'Copia generada: Revisa o ajusta fecha, horario o sala y guarda para crear la nueva reserva'
              : editingReservation
              ? `ID: ${editingReservation.id} • ${editingReservation.espacio}`
              : 'Ingresa los datos para registrar o programar una nueva reserva'}
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        {!replacementMode && <button
          type="button"
          id="toggle-wizard-mode-btn"
          onClick={() => setIsWizardMode((prev) => !prev)}
          className="text-xs font-semibold px-2.5 sm:px-3 py-1.5 rounded-xl border border-blue-400/30 bg-white/10 hover:bg-white/20 text-blue-100 transition flex items-center space-x-1.5 cursor-pointer"
          title={isWizardMode ? 'Cambiar a vista continua completa' : 'Dividir el formulario en 3 pasos progresivos'}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isWizardMode ? 'Ver Formulario Completo' : 'Modo Guiado (3 Pasos)'}</span>
          <span className="sm:hidden">{isWizardMode ? 'Completo' : '3 Pasos'}</span>
        </button>}
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
});

ReservationModalHeader.displayName = 'ReservationModalHeader';
