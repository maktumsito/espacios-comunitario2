import { useState, useMemo, useCallback, useDeferredValue } from 'react';
import { Reservation, FilterState } from '../types';
import { isReservationActiveForAvailability, doSpacesConflict } from '../utils/conflictDetector';
import { getFuzzyMatchIds } from '../utils/fuzzySearch';
import { summarizeConflicts } from '../utils/conflictSummary';
import { getDeletedIds } from '../services/reservationService';

export const INITIAL_FILTERS: FilterState = {
  search: '',
  espacio: '',
  tipoActividad: '',
  fechaDesde: '',
  fechaHasta: '',
  soloRecurrentes: false,
  soloImportantes: false,
  soloConTopamiento: false
};

// Normalize boundary dates (handles YYYY, YYYY-MM, YYYY-MM-DD, DD-MM-YYYY)
export const normalizeFilterBoundary = (dateStr: string, boundary: 'start' | 'end'): string | null => {
  const trimmed = (dateStr || '').trim();
  if (!trimmed) return null;
  if (/^\d{4}$/.test(trimmed)) {
    return boundary === 'start' ? `${trimmed}-01-01` : `${trimmed}-12-31`;
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return boundary === 'start' ? `${trimmed}-01` : `${trimmed}-31`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  if (/^\d{2}-\d{2}-\d{4}/.test(trimmed)) {
    const [d, m, y] = trimmed.slice(0, 10).split('-');
    return `${y}-${m}-${d}`;
  }
  return trimmed;
};

export const normalizeReservationDate = (dateStr: string): string => {
  if (!dateStr) return '';
  if (dateStr.length === 10 && dateStr.charCodeAt(4) === 45 && dateStr.charCodeAt(7) === 45) {
    return dateStr;
  }
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  if (/^\d{2}-\d{2}-\d{4}/.test(trimmed)) {
    const [d, m, y] = trimmed.slice(0, 10).split('-');
    return `${y}-${m}-${d}`;
  }
  return trimmed;
};

export interface UseFilteredReservationsReturn {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  isFilterBarOpen: boolean;
  setIsFilterBarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  hasActiveFilters: boolean;
  resetFilters: () => void;
  conflictsCount: number;
  conflictReservationIds: Set<string>;
  filteredReservations: Reservation[];
  activeReservations: Reservation[];
}

export function useFilteredReservations(reservations: Reservation[], controlled?: {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
}): UseFilteredReservationsReturn {
  const [localFilters, setLocalFilters] = useState<FilterState>(INITIAL_FILTERS);
  const filters = controlled?.filters ?? localFilters;
  const setFilters = controlled?.setFilters ?? setLocalFilters;
  const [isFilterBarOpen, setIsFilterBarOpen] = useState<boolean>(false);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_FILTERS);
  }, [setFilters]);

  const hasActiveFilters = Boolean(
    filters.search?.trim() ||
    filters.espacio ||
    filters.tipoActividad ||
    filters.fechaDesde ||
    filters.fechaHasta ||
    filters.soloRecurrentes ||
    filters.soloImportantes ||
    filters.soloConTopamiento
  );

  // Active reservations excluding any deleted or soft-deleted items
  const deletedSet = useMemo(() => getDeletedIds(), [reservations]);
  const activeReservations = useMemo(() => {
    return reservations.filter(
      (r) =>
        !deletedSet.has(r.id) &&
        r.estado !== 'eliminada' &&
        (r as any).eliminada !== true &&
        isReservationActiveForAvailability(r, deletedSet)
    );
  }, [reservations, deletedSet]);

  // Conflict calculations (Optimized single-pass derived set over active non-deleted reservations)
  const conflictSummary = useMemo(() => summarizeConflicts(activeReservations), [activeReservations]);
  const conflictsCount = conflictSummary.count;
  const conflictReservationIds = conflictSummary.ids;
  const deferredSearch = useDeferredValue(filters.search);

  // Filtered reservations list: apply cheap O(1) structural filters first, then run Fuse.js only on the surviving subset
  const filteredReservations = useMemo(() => {
    const rawSearch = deferredSearch ? deferredSearch.trim() : '';
    const hasSearch = Boolean(rawSearch);

    const filterEspacio = filters.espacio ? filters.espacio.toUpperCase() : null;
    const filterTipo = filters.tipoActividad || null;

    const filterDesde = normalizeFilterBoundary(filters.fechaDesde, 'start');
    const filterHasta = normalizeFilterBoundary(filters.fechaHasta, 'end');
    const filterRecurrentes = Boolean(filters.soloRecurrentes);
    const filterImportantes = Boolean(filters.soloImportantes);
    const filterTopamiento = Boolean(filters.soloConTopamiento);

    // If date range is invalid (Desde > Hasta), return empty array
    if (filterDesde && filterHasta && filterDesde > filterHasta) {
      return [];
    }

    const hasStructuralFilters = Boolean(
      filterTopamiento || filterRecurrentes || filterImportantes || filterDesde || filterHasta || filterEspacio || filterTipo
    );

    const candidates = hasStructuralFilters
      ? activeReservations.filter((r) => {
          if (filterTopamiento && !conflictReservationIds.has(r.id)) return false;
          if (filterRecurrentes && r.actividadRecurrente !== 'Sí') return false;
          if (filterImportantes && r.importante !== 'Sí') return false;
          if (filterDesde || filterHasta) {
            const rFecha = normalizeReservationDate(r.fecha);
            if (filterDesde && rFecha < filterDesde) return false;
            if (filterHasta && rFecha > filterHasta) return false;
          }
          if (filterEspacio && !doSpacesConflict(r.espacio, filterEspacio)) return false;
          if (filterTipo && r.tipoActividad !== filterTipo) return false;
          return true;
        })
      : activeReservations;

    if (!hasSearch || candidates.length === 0) {
      return candidates;
    }

    const fuzzyMatchIds = getFuzzyMatchIds(candidates, rawSearch);
    return candidates.filter((r) => fuzzyMatchIds.has(r.id));
  }, [activeReservations, filters, deferredSearch, conflictReservationIds]);

  return {
    filters,
    setFilters,
    isFilterBarOpen,
    setIsFilterBarOpen,
    hasActiveFilters,
    resetFilters,
    conflictsCount,
    conflictReservationIds,
    filteredReservations,
    activeReservations
  };
}
