import React from "react";
import { Filter } from "lucide-react";
import { ViewMode } from "../types";

interface AgendaToolbarProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  summary: string;
  filtersOpen: boolean;
  hasActiveFilters: boolean;
  onToggleFilters: () => void;
}

/** Changes presentation only; date, filters and subscriptions stay owned by App. */
export const AgendaToolbar = React.memo(function AgendaToolbar({
  view,
  onViewChange,
  summary,
  filtersOpen,
  hasActiveFilters,
  onToggleFilters,
}: AgendaToolbarProps) {
  return (
    <section
      aria-label="Vistas de la agenda"
      className="mb-4 flex flex-wrap items-center justify-between gap-3"
    >
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">
          Agenda
        </h1>
        <p className="text-sm text-slate-600" aria-live="polite">
          {summary}
        </p>
      </div>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <div
          className="grid flex-1 grid-cols-3 rounded-xl border border-slate-200 bg-white p-1 sm:flex"
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
              className={`min-h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${view === value || (value === "timeline" && view === "daily") ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}
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
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-semibold ${hasActiveFilters || filtersOpen ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}
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
