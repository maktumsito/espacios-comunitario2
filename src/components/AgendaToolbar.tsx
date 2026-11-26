import React from "react";
import { Filter, ChevronLeft, ChevronRight, CalendarDays, RefreshCw, ArrowLeft, Clock } from "lucide-react";
import { ViewMode } from "../types";

interface AgendaToolbarProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  summary: string;
  availabilityHint?: string;
  filtersOpen: boolean;
  hasActiveFilters: boolean;
  activeFiltersCount?: number;
  onToggleFilters: () => void;
  onOpenAvailability?: () => void;
  onPrevPeriod?: () => void;
  onNextPeriod?: () => void;
  onGoToday?: () => void;
  onBackToMonth?: () => void;
  upcomingReplacementsCount?: number;
  onOpenUpcomingReplacement?: () => void;
}

/** Changes presentation only; date, filters and subscriptions stay owned by App. */
export const AgendaToolbar = React.memo(function AgendaToolbar({
  view,
  onViewChange,
  summary,
  availabilityHint,
  filtersOpen,
  hasActiveFilters,
  activeFiltersCount = 0,
  onToggleFilters,
  onOpenAvailability,
  onPrevPeriod,
  onNextPeriod,
  onGoToday,
  onBackToMonth,
  upcomingReplacementsCount = 0,
  onOpenUpcomingReplacement,
}: AgendaToolbarProps) {
  return (
    <section
      aria-label="Vistas de la agenda"
      className="agenda-controls mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl border border-slate-200/90 bg-white px-3 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.03)] sm:px-4"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-xl">
          Agenda
        </h1>
        {view !== "calendar" && onBackToMonth && (
          <button
            type="button"
            onClick={onBackToMonth}
            className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
            title="Volver a la cuadrícula mensual (Alt+1)"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Mes</span>
          </button>
        )}
        <p className="text-xs font-medium text-slate-600 sm:text-sm" aria-live="polite" aria-atomic="true">
          {summary}
        </p>
        {availabilityHint && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span>{availabilityHint}</span>
          </span>
        )}
        {upcomingReplacementsCount > 0 && onOpenUpcomingReplacement && (
          <button
            type="button"
            onClick={onOpenUpcomingReplacement}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-900 hover:bg-amber-100 transition-colors"
            title="Revisar cambios y reemplazos por un día próximos a regir"
          >
            <RefreshCw className="h-3.5 w-3.5 text-amber-700" />
            <span>
              {upcomingReplacementsCount === 1
                ? "1 reemplazo próximo"
                : `${upcomingReplacementsCount} reemplazos próximos`}
            </span>
          </button>
        )}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {(onPrevPeriod || onGoToday || onNextPeriod) && (
          <div
            className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5"
            role="group"
            aria-label="Navegación rápida de fecha"
          >
            {onPrevPeriod && (
              <button
                type="button"
                onClick={onPrevPeriod}
                aria-label={view === "calendar" ? "Mes anterior" : "Día anterior"}
                title={view === "calendar" ? "Mes anterior" : "Día anterior"}
                className="inline-flex min-h-9 min-w-8 items-center justify-center rounded-lg px-1.5 text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-2xs sm:min-h-8 transition"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {onGoToday && (
              <button
                type="button"
                onClick={onGoToday}
                title="Ir al día de hoy (Alt+T)"
                className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-bold text-slate-700 hover:bg-white hover:text-blue-700 hover:shadow-2xs sm:min-h-8 transition"
              >
                <CalendarDays className="h-3.5 w-3.5 text-blue-600" />
                <span>Hoy</span>
              </button>
            )}
            {onNextPeriod && (
              <button
                type="button"
                onClick={onNextPeriod}
                aria-label={view === "calendar" ? "Mes siguiente" : "Día siguiente"}
                title={view === "calendar" ? "Mes siguiente" : "Día siguiente"}
                className="inline-flex min-h-9 min-w-8 items-center justify-center rounded-lg px-1.5 text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-2xs sm:min-h-8 transition"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div
          className="segmented-pill grid flex-1 grid-cols-3 sm:flex"
          role="group"
          aria-label="Presentación de la agenda"
        >
          {(
            [
              ["calendar", "Mes", "nav-tab-calendar"],
              ["timeline", "Día", "nav-tab-timeline"],
              ["mobile", "Lista", "nav-tab-mobile"],
            ] as const
          ).map(([value, label, id]) => {
            const active = view === value || (value === "timeline" && view === "daily");
            return (
              <button
                key={value}
                id={id}
                type="button"
                aria-pressed={active}
                onClick={() => onViewChange(value)}
                className={`min-h-10 sm:min-h-9 rounded-lg px-3.5 text-sm font-semibold transition-all active:scale-[0.98] ${
                  active
                    ? "bg-white text-blue-800 shadow-xs ring-1 ring-slate-200/80"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {onOpenAvailability && (
          <button
            type="button"
            onClick={onOpenAvailability}
            aria-haspopup="dialog"
            className="inline-flex min-h-10 sm:min-h-9 items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-900 hover:bg-emerald-100 transition-colors active:scale-[0.98]"
          >
            <Clock aria-hidden="true" className="h-4 w-4 text-emerald-700" />
            <span>Ver disponibilidad</span>
          </button>
        )}
        <button
          id="btn-agenda-filters"
          type="button"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          aria-controls="reservation-filters"
          className={`inline-flex min-h-10 sm:min-h-9 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors active:scale-[0.98] ${
            hasActiveFilters || filtersOpen
              ? "border-blue-300 bg-blue-50 text-blue-800"
              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Filter className="h-4 w-4" />
          <span>Filtros</span>
          {hasActiveFilters && (
            activeFiltersCount > 0 ? (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1.5 text-[11px] font-bold text-white"
                aria-label={`${activeFiltersCount} filtros activos`}
              >
                {activeFiltersCount}
              </span>
            ) : (
              <span
                className="h-2 w-2 rounded-full bg-blue-700"
                aria-label="Hay filtros activos"
              />
            )
          )}
        </button>
      </div>
    </section>
  );
});
