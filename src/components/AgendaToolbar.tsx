import React from "react";
import { Filter, ChevronLeft, ChevronRight, CalendarDays, RefreshCw, ArrowLeft } from "lucide-react";
import { ViewMode } from "../types";

interface AgendaToolbarProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  summary: string;
  filtersOpen: boolean;
  hasActiveFilters: boolean;
  onToggleFilters: () => void;
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
  filtersOpen,
  hasActiveFilters,
  onToggleFilters,
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
      className="agenda-controls mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-slate-200 pb-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Agenda
        </h1>
        {view !== "calendar" && onBackToMonth && (
          <button
            type="button"
            onClick={onBackToMonth}
            className="inline-flex min-h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            title="Volver a la cuadrícula mensual (Alt+1)"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Volver al mes</span>
          </button>
        )}
        <p className="text-sm text-slate-600" aria-live="polite" aria-atomic="true">
          {summary}
        </p>
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
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5"
            role="group"
            aria-label="Navegación rápida de fecha"
          >
            {onPrevPeriod && (
              <button
                type="button"
                onClick={onPrevPeriod}
                aria-label={view === "calendar" ? "Mes anterior" : "Día anterior"}
                title={view === "calendar" ? "Mes anterior" : "Día anterior"}
                className="inline-flex min-h-9 min-w-8 items-center justify-center rounded-md px-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 sm:min-h-7"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {onGoToday && (
              <button
                type="button"
                onClick={onGoToday}
                title="Ir al día de hoy (Alt+T)"
                className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-700 sm:min-h-7"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Hoy</span>
              </button>
            )}
            {onNextPeriod && (
              <button
                type="button"
                onClick={onNextPeriod}
                aria-label={view === "calendar" ? "Mes siguiente" : "Día siguiente"}
                title={view === "calendar" ? "Mes siguiente" : "Día siguiente"}
                className="inline-flex min-h-9 min-w-8 items-center justify-center rounded-md px-1.5 text-slate-600 hover:bg-slate-50 hover:text-slate-900 sm:min-h-7"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div
          className="grid flex-1 grid-cols-3 rounded-lg border border-slate-200 bg-white p-1 sm:flex"
          role="group"
          aria-label="Presentación de la agenda"
        >
          {(
            [
              ["calendar", "Mes", "nav-tab-calendar"],
              ["timeline", "Día", "nav-tab-timeline"],
              ["mobile", "Lista", "nav-tab-mobile"],
            ] as const
          ).map(([value, label, id]) => (
            <button
              key={value}
              id={id}
              type="button"
              aria-pressed={
                view === value || (value === "timeline" && view === "daily")
              }
              onClick={() => onViewChange(value)}
              className={`min-h-11 rounded-md px-4 text-sm font-semibold transition-colors active:scale-[0.98] ${view === value || (value === "timeline" && view === "daily") ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          id="btn-agenda-filters"
          type="button"
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
          aria-controls="reservation-filters"
          className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors active:scale-[0.98] ${hasActiveFilters || filtersOpen ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
        >
          <Filter className="h-4 w-4" />
          Filtros
          {hasActiveFilters && (
            <span
              className="h-2 w-2 rounded-full bg-blue-700"
              aria-label="Hay filtros activos"
            />
          )}
        </button>
      </div>
    </section>
  );
});
