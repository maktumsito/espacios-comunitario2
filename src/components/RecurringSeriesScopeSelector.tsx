import React from 'react';
import {
  RefreshCw,
  Calendar,
  Check,
  ArrowRightCircle,
  Layers,
  CalendarRange,
  ListFilter,
  CheckSquare,
  Info
} from 'lucide-react';
import { Reservation, UpdateScope } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface RecurringSeriesScopeSelectorProps {
  editingReservation: Reservation;
  seriesReservations: Reservation[];
  seriesCount: number;
  affectedReservations: Reservation[];
  updateScope: UpdateScope;
  setUpdateScope: (scope: UpdateScope) => void;
  rangeStartDate: string;
  setRangeStartDate: (date: string) => void;
  rangeEndDate: string;
  setRangeEndDate: (date: string) => void;
  selectedOccurrenceIds: Set<string>;
  setSelectedOccurrenceIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export const RecurringSeriesScopeSelector: React.FC<RecurringSeriesScopeSelectorProps> = React.memo(({
  editingReservation,
  seriesReservations,
  seriesCount,
  affectedReservations,
  updateScope,
  setUpdateScope,
  rangeStartDate,
  setRangeStartDate,
  rangeEndDate,
  setRangeEndDate,
  selectedOccurrenceIds,
  setSelectedOccurrenceIds
}) => {
  return (
    <div className="p-4 rounded-2xl bg-indigo-50/90 border border-indigo-200 text-indigo-950 space-y-4 shadow-2xs">
      <div className="flex items-start space-x-3">
        <div className="p-2 bg-indigo-100 rounded-xl text-indigo-700 mt-0.5 shrink-0">
          <RefreshCw className="w-5 h-5" />
        </div>
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-indigo-900 flex items-center space-x-2">
              <span>Alcance de la Modificación</span>
              <span className="text-[10px] uppercase tracking-wider bg-indigo-200 text-indigo-800 px-2.5 py-0.5 rounded-full font-bold">
                {seriesCount > 0 ? `${seriesCount} reservas en serie` : 'Serie recurrente'}
              </span>
            </h4>
          </div>
          <p className="text-xs text-indigo-700/90 leading-relaxed">
            Elige a qué sesiones pendientes aplicar los cambios. Las sesiones anteriores a la fecha seleccionada quedan intactas y fuera de la revisión.
          </p>
        </div>
      </div>

      {/* 5-Scope Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
        {/* 1. Solo esta reserva */}
        <button
          type="button"
          id="btn-scope-single"
          onClick={() => setUpdateScope('single')}
          className={`flex flex-col items-start p-3 rounded-xl text-left transition cursor-pointer border ${
            updateScope === 'single'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white text-indigo-950 border-indigo-200 hover:bg-indigo-100/60'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Solo esta reserva
            </span>
            {updateScope === 'single' && <Check className="w-3.5 h-3.5 text-emerald-300" />}
          </div>
          <span className={`text-[11px] leading-tight ${updateScope === 'single' ? 'text-indigo-100' : 'text-indigo-700'}`}>
            Modifica solo el {formatDateDDMMYYYY(editingReservation.fecha)}
          </span>
        </button>

        {/* 2. Esta y las siguientes */}
        <button
          type="button"
          id="btn-scope-future"
          onClick={() => setUpdateScope('future')}
          className={`flex flex-col items-start p-3 rounded-xl text-left transition cursor-pointer border ${
            updateScope === 'future'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white text-indigo-950 border-indigo-200 hover:bg-indigo-100/60'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <ArrowRightCircle className="w-3.5 h-3.5" />
              Esta y las siguientes
            </span>
            {updateScope === 'future' && <Check className="w-3.5 h-3.5 text-emerald-300" />}
          </div>
          <span className={`text-[11px] leading-tight ${updateScope === 'future' ? 'text-indigo-100' : 'text-indigo-700'}`}>
            Desde {formatDateDDMMYYYY(editingReservation.fecha)} ({seriesReservations.filter((r) => r.fecha >= editingReservation.fecha).length} reservas)
          </span>
        </button>

        {/* 3. Toda la serie */}
        <button
          type="button"
          id="btn-scope-series"
          onClick={() => setUpdateScope('series')}
          className={`flex flex-col items-start p-3 rounded-xl text-left transition cursor-pointer border ${
            updateScope === 'series'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white text-indigo-950 border-indigo-200 hover:bg-indigo-100/60'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              Serie desde esta fecha
            </span>
            {updateScope === 'series' && <Check className="w-3.5 h-3.5 text-emerald-300" />}
          </div>
          <span className={`text-[11px] leading-tight ${updateScope === 'series' ? 'text-indigo-100' : 'text-indigo-700'}`}>
            Las {seriesCount} reservas desde la fecha seleccionada
          </span>
        </button>

        {/* 4. Rango de fechas */}
        <button
          type="button"
          id="btn-scope-dateRange"
          onClick={() => {
            setUpdateScope('dateRange');
            if (!rangeStartDate) setRangeStartDate(editingReservation.fecha);
            if (!rangeEndDate) setRangeEndDate(seriesReservations[seriesReservations.length - 1]?.fecha || editingReservation.fecha);
          }}
          className={`flex flex-col items-start p-3 rounded-xl text-left transition cursor-pointer border ${
            updateScope === 'dateRange'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white text-indigo-950 border-indigo-200 hover:bg-indigo-100/60'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5" />
              Rango de fechas
            </span>
            {updateScope === 'dateRange' && <Check className="w-3.5 h-3.5 text-emerald-300" />}
          </div>
          <span className={`text-[11px] leading-tight ${updateScope === 'dateRange' ? 'text-indigo-100' : 'text-indigo-700'}`}>
            Definir intervalo desde / hasta
          </span>
        </button>

        {/* 5. Fechas seleccionadas */}
        <button
          type="button"
          id="btn-scope-selected"
          onClick={() => {
            setUpdateScope('selected');
            if (selectedOccurrenceIds.size === 0) {
              setSelectedOccurrenceIds(new Set([editingReservation.id]));
            }
          }}
          className={`flex flex-col items-start p-3 rounded-xl text-left transition cursor-pointer border ${
            updateScope === 'selected'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
              : 'bg-white text-indigo-950 border-indigo-200 hover:bg-indigo-100/60'
          }`}
        >
          <div className="flex items-center justify-between w-full mb-1">
            <span className="text-xs font-bold flex items-center gap-1.5">
              <ListFilter className="w-3.5 h-3.5" />
              Fechas seleccionadas
            </span>
            {updateScope === 'selected' && <Check className="w-3.5 h-3.5 text-emerald-300" />}
          </div>
          <span className={`text-[11px] leading-tight ${updateScope === 'selected' ? 'text-indigo-100' : 'text-indigo-700'}`}>
            {selectedOccurrenceIds.size} de {seriesCount} marcadas
          </span>
        </button>
      </div>

      {/* Sub-panel: Date Range Configuration */}
      {updateScope === 'dateRange' && (
        <div className="p-3.5 bg-white rounded-xl border border-indigo-200 space-y-2.5 animate-fadeIn">
          <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
            <CalendarRange className="w-4 h-4 text-indigo-600" />
            <span>Configurar Rango de Fechas a Modificar</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Desde la fecha:</label>
              <input
                id="input-range-start-date"
                type="date"
                min={editingReservation.fecha}
                value={rangeStartDate}
                onChange={(e) => setRangeStartDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-700">Hasta la fecha:</label>
              <input
                id="input-range-end-date"
                type="date"
                min={editingReservation.fecha}
                value={rangeEndDate}
                onChange={(e) => setRangeEndDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-indigo-700 font-medium">
            {affectedReservations.length > 0
              ? `Se aplicarán los cambios a ${affectedReservations.length} reservas comprendidas entre el ${formatDateDDMMYYYY(rangeStartDate)} y el ${formatDateDDMMYYYY(rangeEndDate)}.`
              : 'No hay reservas dentro del rango especificado.'}
          </p>
        </div>
      )}

      {/* Sub-panel: Specific Occurrence Selection */}
      {updateScope === 'selected' && (
        <div className="p-3.5 bg-white rounded-xl border border-indigo-200 space-y-3 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
              <CheckSquare className="w-4 h-4 text-indigo-600" />
              <span>Seleccionar Ocurrencias a Modificar ({selectedOccurrenceIds.size} de {seriesReservations.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedOccurrenceIds(new Set(seriesReservations.map((r) => r.id)))}
                className="px-2 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition cursor-pointer"
              >
                Marcar todas
              </button>
              <button
                type="button"
                onClick={() => setSelectedOccurrenceIds(new Set())}
                className="px-2 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition cursor-pointer"
              >
                Desmarcar todas
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 rounded-lg p-1.5">
            {seriesReservations.map((res) => {
              const isChecked = selectedOccurrenceIds.has(res.id);
              const isCurrent = res.id === editingReservation.id;
              return (
                <label
                  key={res.id}
                  className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer transition border ${
                    isChecked
                      ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950 font-medium'
                      : 'bg-slate-50/60 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const next = new Set(selectedOccurrenceIds);
                        if (e.target.checked) next.add(res.id);
                        else next.delete(res.id);
                        setSelectedOccurrenceIds(next);
                      }}
                      className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span>
                      <strong>{formatDateDDMMYYYY(res.fecha)}</strong>
                      <span className="text-slate-500 ml-1.5">({res.horaInicio} - {res.horaFin} en {res.espacio})</span>
                    </span>
                  </div>
                  {isCurrent && (
                    <span className="text-[10px] uppercase font-bold bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">
                      Actual
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Scope Impact Summary Banner */}
      <div className="p-3 bg-indigo-100/70 border border-indigo-200 rounded-xl text-xs text-indigo-950 flex items-start space-x-2 animate-fadeIn">
        <Info className="w-4 h-4 text-indigo-700 mt-0.5 shrink-0" />
        <div className="space-y-0.5">
          <p>
            <strong>Resumen del impacto:</strong> Se actualizarán <strong>{affectedReservations.length} reserva(s)</strong>.
            {updateScope === 'single' && ' Los cambios se aplicarán exclusivamente a esta fecha; el resto de la serie no se alterará.'}
            {updateScope === 'future' && ` Se aplicará a las reservas desde el ${formatDateDDMMYYYY(editingReservation.fecha)} en adelante. Las anteriores se mantendrán intactas.`}
            {updateScope === 'series' && ` Se aplicará a las ${seriesCount} reservas pendientes de la serie. Las sesiones anteriores a esta fecha se mantienen intactas.`}
            {updateScope === 'dateRange' && ` Se aplicará a las ${affectedReservations.length} reservas comprendidas en el rango seleccionado.`}
            {updateScope === 'selected' && ` Se aplicará exclusivamente a las ${affectedReservations.length} reservas que has marcado con el selector.`}
          </p>
          {affectedReservations.length > 0 && affectedReservations.length <= 8 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {affectedReservations.map((r) => (
                <span key={r.id} className="text-[10px] bg-white/80 border border-indigo-200 px-1.5 py-0.5 rounded font-mono text-indigo-900">
                  {formatDateDDMMYYYY(r.fecha)}
                </span>
              ))}
            </div>
          )}
          {affectedReservations.length > 8 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {affectedReservations.slice(0, 6).map((r) => (
                <span key={r.id} className="text-[10px] bg-white/80 border border-indigo-200 px-1.5 py-0.5 rounded font-mono text-indigo-900">
                  {formatDateDDMMYYYY(r.fecha)}
                </span>
              ))}
              <span className="text-[10px] text-indigo-700 font-bold self-center">
                + {affectedReservations.length - 6} fechas más
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
