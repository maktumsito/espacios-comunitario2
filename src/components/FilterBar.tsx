import React from 'react';
import { FilterState, SpaceInfo, ActivityTypeItem } from '../types';
import { SPACES_LIST, ACTIVITY_TYPES } from '../data/spacesData';
import { Search, RotateCcw, Flame, AlertTriangle, X } from 'lucide-react';
import { clampAndFixCalendarDate } from '../utils/validationUtils';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onResetFilters: () => void;
  onClose?: () => void;
  totalFiltered: number;
  totalAll: number;
  conflictsCount?: number;
  availableSpaces?: SpaceInfo[];
  availableActivityTypes?: ActivityTypeItem[];
}

const FilterBarComponent: React.FC<FilterBarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  onClose,
  totalFiltered,
  totalAll,
  conflictsCount = 0,
  availableSpaces = SPACES_LIST,
  availableActivityTypes
}) => {
  const effectiveActivityNames = availableActivityTypes
    ? availableActivityTypes.map(a => a.name)
    : ACTIVITY_TYPES;

  const isDateRangeInvalid = Boolean(
    filters.fechaDesde &&
    filters.fechaHasta &&
    filters.fechaDesde > filters.fechaHasta
  );

  const isFiltered =
    Boolean(filters.search) ||
    Boolean(filters.espacio) ||
    Boolean(filters.tipoActividad) ||
    Boolean(filters.fechaDesde) ||
    Boolean(filters.fechaHasta) ||
    filters.soloRecurrentes ||
    filters.soloImportantes ||
    Boolean(filters.soloConTopamiento);

  const [localSearch, setLocalSearch] = React.useState(filters.search || '');

  React.useEffect(() => {
    setLocalSearch(filters.search || '');
  }, [filters.search]);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      if (localSearch !== filters.search) {
        onFilterChange({ ...filters, search: localSearch });
      }
    }, 150);
    return () => clearTimeout(handler);
  }, [localSearch, filters, onFilterChange]);

  return (
    <div className="bg-white border-b border-slate-200 py-3.5 px-3 sm:px-4 lg:px-6 shadow-xs" onKeyDown={(event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || !onClose) return;
      event.preventDefault(); event.stopPropagation();
      if (localSearch !== filters.search) onFilterChange({ ...filters, search: localSearch });
      onClose();
    }}>
      <div className="w-full max-w-[1680px] mx-auto space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="filter-search-input"
              type="text"
              placeholder="Buscar por taller, responsable, RUT, email, descripción o ID..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
            />
            {localSearch && (
              <button
                type="button"
                id="btn-clear-search-filter"
                aria-label="Borrar texto de búsqueda"
                onClick={() => {
                  setLocalSearch('');
                  onFilterChange({ ...filters, search: '' });
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full hover:bg-slate-200 transition cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Select Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Espacio */}
            <select
              id="filter-space-select"
              value={filters.espacio}
              onChange={(e) => onFilterChange({ ...filters, espacio: e.target.value })}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
            >
              <option value="">Todos los Espacios</option>
              {availableSpaces.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Tipo de Actividad */}
            <select
              id="filter-activity-select"
              value={filters.tipoActividad}
              onChange={(e) => onFilterChange({ ...filters, tipoActividad: e.target.value })}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
            >
              <option value="">Todos los Tipos</option>
              {effectiveActivityNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Date Range Group */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className={`flex items-center px-2.5 py-1.5 rounded-xl text-xs transition border ${
                isDateRangeInvalid
                  ? 'border-rose-400 bg-rose-50/60 ring-1 ring-rose-400 text-rose-950'
                  : 'bg-white border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent text-slate-700'
              }`}>
                <span className={`text-[11px] font-semibold mr-1.5 whitespace-nowrap ${isDateRangeInvalid ? 'text-rose-700' : 'text-slate-500'}`}>Desde:</span>
                <input
                  id="filter-date-from"
                  type="date"
                  aria-label="Filtrar desde fecha"
                  title="Fecha Desde"
                  value={filters.fechaDesde}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const { correctedIso } = clampAndFixCalendarDate(raw);
                    onFilterChange({ ...filters, fechaDesde: correctedIso || raw });
                  }}
                  className="text-xs bg-transparent focus:outline-none cursor-pointer font-mono"
                />
              </div>

              <div className={`flex items-center px-2.5 py-1.5 rounded-xl text-xs transition border ${
                isDateRangeInvalid
                  ? 'border-rose-400 bg-rose-50/60 ring-1 ring-rose-400 text-rose-950'
                  : 'bg-white border-slate-200 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent text-slate-700'
              }`}>
                <span className={`text-[11px] font-semibold mr-1.5 whitespace-nowrap ${isDateRangeInvalid ? 'text-rose-700' : 'text-slate-500'}`}>Hasta:</span>
                <input
                  id="filter-date-to"
                  type="date"
                  aria-label="Filtrar hasta fecha"
                  title="Fecha Hasta"
                  value={filters.fechaHasta}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const { correctedIso } = clampAndFixCalendarDate(raw);
                    onFilterChange({ ...filters, fechaHasta: correctedIso || raw });
                  }}
                  className="text-xs bg-transparent focus:outline-none cursor-pointer font-mono"
                />
              </div>
            </div>

            {/* Ocultar panel de filtros */}
            {onClose && (
              <button
                type="button"
                id="btn-close-filterbar"
                onClick={onClose}
                aria-label="Ocultar panel de filtros"
                title="Ocultar filtros"
                className="min-h-[44px] flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition text-xs font-semibold cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
                <span>Ocultar</span>
              </button>
            )}
          </div>
        </div>

        {/* Invalid Date Range Error Banner */}
        {isDateRangeInvalid && (
          <div
            id="filter-date-range-error"
            role="alert"
            className="w-full p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-semibold animate-fadeIn shadow-2xs"
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                ⚠️ Rango de fechas no válido: La fecha "Desde" ({formatDateDDMMYYYY(filters.fechaDesde)}) no puede ser posterior a la fecha "Hasta" ({formatDateDDMMYYYY(filters.fechaHasta)}).
              </span>
            </div>
            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                id="btn-swap-filter-dates"
                onClick={() => {
                  onFilterChange({
                    ...filters,
                    fechaDesde: filters.fechaHasta,
                    fechaHasta: filters.fechaDesde
                  });
                }}
                className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold rounded-lg transition cursor-pointer shadow-2xs"
              >
                Invertir fechas
              </button>
              <button
                type="button"
                id="btn-clear-filter-dates"
                onClick={() => {
                  onFilterChange({
                    ...filters,
                    fechaDesde: '',
                    fechaHasta: ''
                  });
                }}
                className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 text-[11px] font-bold rounded-lg transition cursor-pointer"
              >
                Limpiar fechas
              </button>
            </div>
          </div>
        )}

        {/* Quick Toggle Chips & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {conflictsCount > 0 && (
              <button
                id="filter-toggle-topamientos"
                onClick={() => onFilterChange({ ...filters, soloConTopamiento: !filters.soloConTopamiento })}
                className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                  filters.soloConTopamiento
                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>⚠️ Topamientos / Conflictos ({conflictsCount})</span>
              </button>
            )}

            <button
              id="filter-toggle-importante"
              onClick={() => onFilterChange({ ...filters, soloImportantes: !filters.soloImportantes })}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                filters.soloImportantes
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Flame className="w-3 h-3 text-amber-500" />
              <span>Solo Importantes</span>
            </button>

            <button
              id="filter-toggle-recurrentes"
              onClick={() => onFilterChange({ ...filters, soloRecurrentes: !filters.soloRecurrentes })}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition cursor-pointer ${
                filters.soloRecurrentes
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span>Series Recurrentes</span>
            </button>

            {isFiltered && (
              <button
                id="btn-reset-filters"
                onClick={onResetFilters}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Limpiar Filtros</span>
              </button>
            )}
          </div>

          <div className="text-[11px] text-slate-500">
            Mostrando <span className="font-semibold text-slate-800">{totalFiltered}</span> de{' '}
            <span className="text-slate-600 font-medium">{totalAll}</span> reservas
          </div>
        </div>
      </div>
    </div>
  );
};

export const FilterBar = React.memo(FilterBarComponent);

