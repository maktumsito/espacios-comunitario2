import { CalendarDateInput } from './common/CalendarDateInput';
import React, { useEffect, useState } from "react";
import { FilterState, SpaceInfo, ActivityTypeItem } from "../types";
import { SPACES_LIST, ACTIVITY_TYPES } from "../data/spacesData";
import { X, AlertTriangle } from "lucide-react";
import { clampAndFixCalendarDate } from "../utils/validationUtils";

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  onResetFilters: () => void;
  onClose?: () => void;
  totalFiltered: number;
  totalAll: number;
  periodLabel?: string;
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
  periodLabel = "datos cargados",
  conflictsCount = 0,
  availableSpaces = SPACES_LIST,
  availableActivityTypes,
}) => {
  const [localSearch, setLocalSearch] = useState(filters.search || "");
  useEffect(() => {
    setLocalSearch(filters.search || "");
  }, [filters.search]);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== filters.search)
        onFilterChange({ ...filters, search: localSearch });
    }, 150);
    return () => clearTimeout(timer);
  }, [localSearch, filters, onFilterChange]);
  const invalidDates = Boolean(
    filters.fechaDesde &&
      filters.fechaHasta &&
      filters.fechaDesde > filters.fechaHasta,
  );
  const change = (patch: Partial<FilterState>) =>
    onFilterChange({ ...filters, search: localSearch, ...patch });
  const close = () => {
    if (localSearch !== filters.search) change({ search: localSearch });
    onClose?.();
  };
  const inputClass =
    "mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600";
  const active = [
    ...(filters.search
      ? [{ key: "search", label: `Búsqueda: ${filters.search}`, reset: "" }]
      : []),
    ...(filters.espacio
      ? [{ key: "espacio", label: filters.espacio, reset: "" }]
      : []),
    ...(filters.tipoActividad
      ? [{ key: "tipoActividad", label: filters.tipoActividad, reset: "" }]
      : []),
    ...(filters.fechaDesde
      ? [{ key: "fechaDesde", label: `Desde ${filters.fechaDesde}`, reset: "" }]
      : []),
    ...(filters.fechaHasta
      ? [{ key: "fechaHasta", label: `Hasta ${filters.fechaHasta}`, reset: "" }]
      : []),
  ];
  const anyActive =
    active.length > 0 ||
    filters.soloImportantes ||
    filters.soloRecurrentes ||
    filters.soloConTopamiento;

  return (
    <section
      aria-label="Filtros de reservas"
      className="border-b border-slate-200 bg-white px-3 py-4 sm:px-6"
      onKeyDown={(event) => {
        if (
          event.key !== "Escape" ||
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          !onClose
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        close();
      }}
    >
      <div className="mx-auto max-w-[1680px] space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Filtrar reservas</h2>
          {onClose && (
            <button
              id="btn-close-filterbar"
              type="button"
              onClick={close}
              aria-label="Ocultar panel de filtros"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-slate-600 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
              Cerrar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="text-sm font-medium text-slate-700">
            Buscar en las reservas
            <input
              id="filter-search-input"
              type="search"
              placeholder="Actividad, solicitante o contacto"
              value={localSearch}
              onChange={(event) => setLocalSearch(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Espacio
            <select
              id="filter-space-select"
              value={filters.espacio}
              onChange={(event) => change({ espacio: event.target.value })}
              className={inputClass}
            >
              <option value="">Todos los espacios</option>
              {availableSpaces.map((space) => (
                <option key={space.id} value={space.name}>
                  {space.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Tipo de actividad
            <select
              id="filter-activity-select"
              value={filters.tipoActividad}
              onChange={(event) =>
                change({ tipoActividad: event.target.value })
              }
              className={inputClass}
            >
              <option value="">Todos los tipos</option>
              {(
                availableActivityTypes?.map((item) => item.name) ||
                ACTIVITY_TYPES
              ).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Desde
            <CalendarDateInput
              id="filter-date-from"
              aria-invalid={invalidDates}
              aria-describedby={
                invalidDates ? "filter-date-range-error" : undefined
              }
              value={filters.fechaDesde}
              onValueChange={(dateValue) =>
                change({
                  fechaDesde:
                    clampAndFixCalendarDate(dateValue).correctedIso ||
                    dateValue,
                })
              }
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Hasta
            <CalendarDateInput
              id="filter-date-to"
              aria-invalid={invalidDates}
              aria-describedby={
                invalidDates ? "filter-date-range-error" : undefined
              }
              value={filters.fechaHasta}
              onValueChange={(dateValue) =>
                change({
                  fechaHasta:
                    clampAndFixCalendarDate(dateValue).correctedIso ||
                    dateValue,
                })
              }
              className={inputClass}
            />
          </label>
        </div>
        {invalidDates && (
          <div
            id="filter-date-range-error"
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              La fecha Desde es posterior a Hasta. Corrige el rango para ver las
              reservas.
            </span>
            <button
              id="btn-swap-filter-dates"
              type="button"
              onClick={() =>
                change({
                  fechaDesde: filters.fechaHasta,
                  fechaHasta: filters.fechaDesde,
                })
              }
              className="min-h-11 font-semibold underline"
            >
              Invertir fechas
            </button>
            <button
              id="btn-clear-filter-dates"
              type="button"
              onClick={() => change({ fechaDesde: "", fechaHasta: "" })}
              className="min-h-11 font-semibold underline"
            >
              Limpiar fechas
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              [
                "soloImportantes",
                "Solo importantes",
                "filter-toggle-importante",
              ],
              [
                "soloRecurrentes",
                "Series recurrentes",
                "filter-toggle-recurrentes",
              ],
              [
                "soloConTopamiento",
                `Con conflictos (${conflictsCount})`,
                "filter-toggle-topamientos",
              ],
            ] as const
          ).map(([key, label, id]) => (
            <button
              key={key}
              id={id}
              type="button"
              aria-pressed={Boolean(filters[key])}
              onClick={() => change({ [key]: !filters[key] })}
              className={`min-h-11 rounded-lg border px-3 text-sm ${filters[key] ? "border-blue-200 bg-blue-50 font-semibold text-blue-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
          {active.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-label={`Quitar filtro ${item.label}`}
              onClick={() => {
                if (item.key === "search") setLocalSearch("");
                change({ [item.key]: item.reset });
              }}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg bg-blue-50 px-3 text-sm text-blue-800"
            >
              <span className="break-words">{item.label}</span>
              <X className="h-4 w-4 shrink-0" />
            </button>
          ))}
          {anyActive && (
            <button
              id="btn-reset-filters"
              type="button"
              onClick={() => {
                setLocalSearch("");
                onResetFilters();
              }}
              className="min-h-11 px-3 text-sm font-semibold text-blue-700 underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
        <p className="text-sm text-slate-600" role="status">
          {totalFiltered} de {totalAll} reservas en {periodLabel}
        </p>
      </div>
    </section>
  );
};

export const FilterBar = React.memo(FilterBarComponent);
