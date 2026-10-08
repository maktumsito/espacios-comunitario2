import { formatDisplayTitle } from '../utils/reservationVisuals';
import React from 'react';
import {
  Flame,
  Sparkles,
  Clock
} from 'lucide-react';
import { Reservation, SpaceInfo } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { timeToMinutes, formatMinutesToTime } from '../utils/conflictDetector';
import { ConflictRecommendationPanel } from './ConflictRecommendationPanel';
import { ConflictRecommendation } from '../utils/conflictRecommender';

interface ReservationConflictBannerProps {
  conflicts: Reservation[];
  candidateConflictDates: readonly string[] | string[];
  formData: Partial<Reservation>;
  mainDuration: number;
  allReservations: Reservation[];
  availableSpaces: SpaceInfo[];
  editingReservation?: Reservation | null;
  allowConflictOverride: boolean;
  setAllowConflictOverride: (allow: boolean) => void;
  onOpenConflictDialog: () => void;
  onShiftImmediatelyAfter: (newStartTime: string) => void;
  onApplyRecommendation: (rec: ConflictRecommendation) => void;
  onFindNextAvailableSlot: () => void;
}

export const ReservationConflictBanner: React.FC<ReservationConflictBannerProps> = React.memo(({
  conflicts,
  candidateConflictDates,
  formData,
  mainDuration,
  allReservations,
  availableSpaces,
  editingReservation,
  allowConflictOverride,
  setAllowConflictOverride,
  onOpenConflictDialog,
  onShiftImmediatelyAfter,
  onApplyRecommendation,
  onFindNextAvailableSlot
}) => {
  if (conflicts.length === 0 && candidateConflictDates.length === 0) {
    return null;
  }

  return (
    <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-50 via-orange-50/40 to-rose-50 border-2 border-rose-300 text-rose-950 space-y-3.5 shadow-xs animate-fadeIn">
      <div className="flex items-start space-x-3">
        <div className="p-2.5 bg-rose-600 rounded-xl text-white mt-0.5 shadow-xs shrink-0">
          <Flame className="w-5 h-5" />
        </div>
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-black text-rose-950 flex items-center space-x-2">
              <span>
                {candidateConflictDates.length > 1
                  ? `Topamientos Detectados en ${candidateConflictDates.length} Fechas`
                  : `Conflicto de Horario Detectado (${conflicts.length || candidateConflictDates.length})`}
              </span>
              <span className="text-[10px] uppercase tracking-wider bg-rose-200 text-rose-900 px-2.5 py-0.5 rounded-full font-extrabold border border-rose-300">
                Espacio Copado
              </span>
            </h4>
            <button
              type="button"
              id="btn-open-conflict-solver"
              onClick={onOpenConflictDialog}
              className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black flex items-center space-x-1.5 shadow-2xs transition cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Solucionar Topamientos ({candidateConflictDates.length || 1} {candidateConflictDates.length === 1 ? 'día' : 'días'})</span>
            </button>
          </div>
          <p className="text-xs text-rose-800">
            {candidateConflictDates.length > 1
              ? `Se detectaron coincidencias de horario en ${candidateConflictDates.length} de las fechas programadas para esta reserva. Puedes aplicar soluciones masivas o individuales.`
              : `El espacio ${formatDisplayTitle(formData.espacio)} ya está ocupado en la fecha ${formatDateDDMMYYYY(formData.fecha || '')} durante el bloque seleccionado (${formData.horaInicio} - ${formData.horaFin}).`}
          </p>

          {/* Detalle de reservas existentes con botón de mover inmediatamente después */}
          <div className="mt-2.5 space-y-2 max-h-40 overflow-y-auto pr-1">
            {conflicts.map((c) => (
              <div
                key={c.id}
                className="bg-white p-2.5 rounded-xl border border-rose-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                    <span className="truncate">{formatDisplayTitle(c.tipoActividad)}: {formatDisplayTitle(c.descripcion)}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono flex items-center space-x-2 mt-0.5">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>{c.horaInicio} - {c.horaFin}</span>
                    <span>•</span>
                    <span className="truncate">Resp: {formatDisplayTitle(c.responsable)}</span>
                  </div>
                </div>

                {/* Direct 1-click action: Move right after this activity */}
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onShiftImmediatelyAfter(c.horaFin)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] flex items-center space-x-1 shadow-2xs transition cursor-pointer"
                    title={`Mover inicio a las ${c.horaFin} y término a las ${formatMinutesToTime(timeToMinutes(c.horaFin) + mainDuration)}`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Mover después ({c.horaFin} - {formatMinutesToTime(timeToMinutes(c.horaFin) + mainDuration)})</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Smart Recommendations Component */}
      <ConflictRecommendationPanel
        defaultOpen={false}
        currentSlot={{
          fecha: formData.fecha,
          horaInicio: formData.horaInicio,
          horaFin: formData.horaFin,
          espacio: formData.espacio,
          cantidadParticipantes: formData.cantidadParticipantes
        }}
        allReservations={allReservations}
        excludeReservationId={editingReservation?.id}
        customSpacesList={availableSpaces}
        onApplyRecommendation={onApplyRecommendation}
      />

      {/* Conflict Action Options */}
      <div className="pt-2 border-t border-rose-200 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onFindNextAvailableSlot}
          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-xs transition cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Sugerir próximo horario libre</span>
        </button>

        <label className="flex items-center space-x-2 text-rose-800 font-semibold cursor-pointer text-[11px]">
          <input
            type="checkbox"
            checked={allowConflictOverride}
            onChange={(e) => setAllowConflictOverride(e.target.checked)}
            className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
          />
          <span>Permitir guardar a pesar del conflicto de horario</span>
        </label>
      </div>
    </div>
  );
});
