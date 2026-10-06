import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Reservation, SpaceInfo, SpaceBlock, SpaceRating } from '../types';
import {
  AuthUser,
  isCoordinatorOrAdmin,
  userCanCreateReservations,
  userCanEditReservations,
  userCanDeleteReservations
} from '../services/authService';
import { normalizeSpaceName } from '../data/spacesData';
import { formatDateYYYYMMDD, parseDateToNoon } from '../utils/dateUtils';
import { getFuzzyMatchIds } from '../utils/fuzzySearch';
import { validateAndFormatChileanPhone } from '../utils/validationUtils';
import { getReservationTypeVisual, RESERVATION_TYPE_LEGEND, formatDisplayTitle } from '../utils/reservationVisuals';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  User,
  Phone,
  MessageCircle,
  Mail,
  AlertTriangle,
  Star,
  Plus,
  Search,
  X,
  Edit2,
  Copy,
  Trash2,
  CheckCircle2,
  Circle,
  Wrench,
  Monitor,
  Repeat,
  FileCheck,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  ArrowRight,
  MoreHorizontal
} from 'lucide-react';

interface MobileAgendaViewProps {
  reservations: Reservation[];
  allReservations?: Reservation[];
  conflictReservationIds?: Set<string>;
  spaces: readonly SpaceInfo[];
  spaceBlocks?: readonly SpaceBlock[];
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  onSelectReservation: (reservation: Reservation) => void;
  onEditReservation: (reservation: Reservation) => void;
  onDuplicateReservation?: (reservation: Reservation) => void;
  onDeleteReservation?: (id: string, isSeries?: boolean, seriesId?: string) => void;
  onRequestDelete?: (reservation: Reservation) => void;
  onNewReservationForDate?: (dateStr: string, space?: string) => void;
  onToggleRealizada?: (reservation: Reservation) => void;
  onOpenRating?: (reservation: Reservation, rating?: SpaceRating) => void;
  ratings?: SpaceRating[];
  currentUser?: AuthUser | null;
  onSwitchToDesktopView?: () => void;
}

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const MobileAgendaView: React.FC<MobileAgendaViewProps> = ({
  reservations,
  allReservations,
  conflictReservationIds,
  spaces,
  spaceBlocks = [],
  selectedDate,
  onDateChange,
  onSelectReservation,
  onEditReservation,
  onDuplicateReservation,
  onDeleteReservation,
  onRequestDelete,
  onNewReservationForDate,
  onToggleRealizada,
  onOpenRating,
  ratings = [],
  currentUser,
  onSwitchToDesktopView
}) => {
  const [selectedSpaceFilter, setSelectedSpaceFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState<boolean>(false);
  const [onlyImportant, setOnlyImportant] = useState<boolean>(false);
  const [onlyConflicts, setOnlyConflicts] = useState<boolean>(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);

  const canCreate = userCanCreateReservations(currentUser);
  const canEdit = userCanEditReservations(currentUser);
  const canDelete = userCanDeleteReservations(currentUser);

  const dayStripRef = useRef<HTMLDivElement>(null);
  const selectedDayIso = useMemo(() => formatDateYYYYMMDD(selectedDate), [selectedDate]);

  // Map of spaces for quick color and category lookup
  const spaceMap = useMemo(() => {
    const map = new Map<string, SpaceInfo>();
    spaces.forEach((s) => {
      map.set(normalizeSpaceName(s.name), s);
      map.set(s.id.toUpperCase(), s);
    });
    return map;
  }, [spaces]);

  // Compute map of ratings by reservation ID
  const ratingByReservationId = useMemo(() => {
    const map = new Map<string, SpaceRating>();
    ratings.forEach((r) => {
      if (r.reservationId) {
        map.set(r.reservationId, r);
      }
    });
    return map;
  }, [ratings]);

  // Generate 16-day window around selectedDate for swipeable horizontal day strip (-4 to +11 days)
  const dayStripItems = useMemo(() => {
    const items = [];
    const base = new Date(selectedDate);
    base.setHours(12, 0, 0, 0);

    const sourceReservations = allReservations || reservations;
    // Pre-index counts per date for fast rendering
    const countByDate = new Map<string, number>();
    sourceReservations.forEach((r) => {
      if (!r.fecha) return;
      const isActiva = !r.estado || r.estado === 'activa';
      if (isActiva) {
        countByDate.set(r.fecha, (countByDate.get(r.fecha) || 0) + 1);
      }
    });

    for (let offset = -4; offset <= 11; offset++) {
      const d = new Date(base);
      d.setDate(d.getDate() + offset);
      const iso = formatDateYYYYMMDD(d);
      const isToday = formatDateYYYYMMDD(new Date()) === iso;
      const isSelected = selectedDayIso === iso;
      const count = countByDate.get(iso) || 0;

      items.push({
        date: d,
        iso,
        dayNum: d.getDate(),
        dayName: DAY_NAMES_SHORT[d.getDay()],
        isToday,
        isSelected,
        count
      });
    }
    return items;
  }, [selectedDate, selectedDayIso, allReservations, reservations]);

  // Center selected day in horizontal scrollbar smoothly
  useEffect(() => {
    if (!dayStripRef.current) return;
    const selectedEl = dayStripRef.current.querySelector('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selectedDayIso]);

  // Filter reservations for the selected day
  const dayReservations = useMemo(() => {
    const source = reservations;
    return source.filter((r) => {
      if (r.fecha !== selectedDayIso) return false;
      const isActiva = !r.estado || r.estado === 'activa';
      return isActiva;
    }).sort((a, b) => {
      if (a.horaInicio !== b.horaInicio) return a.horaInicio < b.horaInicio ? -1 : 1;
      return a.espacio.localeCompare(b.espacio);
    });
  }, [reservations, selectedDayIso]);

  // Active space blocks for selected day
  const activeSpaceBlocksToday = useMemo(() => {
    return spaceBlocks.filter((b) => {
      if (!b.activo) return false;
      return b.fechaInicio <= selectedDayIso && selectedDayIso <= b.fechaFin;
    });
  }, [spaceBlocks, selectedDayIso]);

  // Available spaces that have reservations today (for quick filter chips)
  const spacesWithBookingsToday = useMemo(() => {
    const counts = new Map<string, number>();
    dayReservations.forEach((r) => {
      const canon = normalizeSpaceName(r.espacio);
      counts.set(canon, (counts.get(canon) || 0) + 1);
    });
    return counts;
  }, [dayReservations]);

  // Count conflicts today
  const conflictsTodayCount = useMemo(() => {
    if (!conflictReservationIds) return 0;
    return dayReservations.filter((r) => conflictReservationIds.has(r.id)).length;
  }, [dayReservations, conflictReservationIds]);

  // Filtered reservations based on user controls
  const filteredDayReservations = useMemo(() => {
    const rawSearch = searchQuery.trim();
    const fuzzyIds = rawSearch ? getFuzzyMatchIds(dayReservations, rawSearch) : null;

    return dayReservations.filter((r) => {
      // Space filter
      if (selectedSpaceFilter !== 'ALL') {
        const canon = normalizeSpaceName(r.espacio);
        if (canon !== selectedSpaceFilter) return false;
      }

      // Important filter
      if (onlyImportant && r.importante !== 'Sí') {
        return false;
      }

      // Conflict filter
      if (onlyConflicts && conflictReservationIds && !conflictReservationIds.has(r.id)) {
        return false;
      }

      // Search query filter (fuzzy search with typo tolerance)
      if (fuzzyIds && !fuzzyIds.has(r.id)) {
        return false;
      }

      return true;
    });
  }, [dayReservations, selectedSpaceFilter, onlyImportant, onlyConflicts, conflictReservationIds, searchQuery]);

  // Navigation handlers
  const handlePrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    onDateChange(prev);
  };

  const handleNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    onDateChange(next);
  };

  const handleGoToday = () => {
    onDateChange(new Date());
  };

  const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      const parsed = parseDateToNoon(e.target.value);
      onDateChange(parsed);
    }
  };

  const toggleCardExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Helper for current live status
  const getLiveStatus = (horaInicio: string, horaFin: string) => {
    const isToday = selectedDayIso === formatDateYYYYMMDD(new Date());
    if (!isToday) return null;

    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();

    const [sh, sm] = horaInicio.split(':').map(Number);
    const [eh, em] = horaFin.split(':').map(Number);
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;
    if (endMin === 0 && startMin > 0) endMin = 1440;

    if (currentMin >= startMin && currentMin < endMin) {
      return { status: 'live', label: 'En curso ahora' };
    }
    if (currentMin < startMin) {
      return { status: 'upcoming', label: 'Próxima' };
    }
    return { status: 'passed', label: 'Finalizada' };
  };


  const isTodayActive = selectedDayIso === formatDateYYYYMMDD(new Date());

  return (
    <div id="mobile-agenda-view-container" className="w-full max-w-3xl mx-auto pb-24 text-slate-900 animate-fadeIn">
      {/* 1. TOP MOBILE HEADER & DATE CONTROLS */}
      <header className="sticky top-0 z-30 bg-[#f7f9fc]/95 backdrop-blur-md border-b border-slate-200/80 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Day & Date Title */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                {DAY_NAMES_SHORT[selectedDate.getDay()]}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500 font-medium truncate">
                {selectedDate.getDate()} {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getFullYear()}
              </span>
            </div>
            <div className="flex items-center space-x-2 mt-0.5">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                Agenda Diaria
              </h1>
              {isTodayActive && (
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                  Hoy
                </span>
              )}
            </div>
          </div>

          {/* Quick Action Navigation Controls */}
          <div className="flex items-center space-x-1 shrink-0">
            {/* Native Date Picker Popover Button */}
            <label
              htmlFor="mobile-native-date-picker"
              className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition"
              title="Seleccionar otra fecha"
            >
              <CalendarIcon className="w-5 h-5 text-slate-600" />
              <input
                id="mobile-native-date-picker"
                type="date"
                value={selectedDayIso}
                onChange={handleDateInputChange}
                className="sr-only"
              />
            </label>

            {/* Previous Day Button */}
            <button
              type="button"
              id="btn-mobile-prev-day"
              onClick={handlePrevDay}
              aria-label="Día anterior"
              className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Today Quick Jump */}
            {!isTodayActive && (
              <button
                type="button"
                id="btn-mobile-go-today"
                onClick={handleGoToday}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs flex items-center justify-center transition cursor-pointer"
              >
                Hoy
              </button>
            )}

            {/* Next Day Button */}
            <button
              type="button"
              id="btn-mobile-next-day"
              onClick={handleNextDay}
              aria-label="Día siguiente"
              className="min-w-[44px] min-h-[44px] p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 flex items-center justify-center cursor-pointer transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact desktop matrix shortcut */}
        {onSwitchToDesktopView && (
          <div className="mt-1.5 flex items-center justify-end text-xs">
            <button
              type="button"
              onClick={onSwitchToDesktopView}
              className="text-slate-600 hover:text-blue-700 font-semibold flex items-center space-x-1 cursor-pointer py-1 px-2 rounded-lg hover:bg-white transition"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>Ver matriz</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </header>

      {/* 2. HORIZONTAL DAY STRIP CAROUSEL (Touch swipeable) */}
      <div className="bg-[#f7f9fc] border-b border-slate-200/80 py-2 px-2">
        <div
          ref={dayStripRef}
          className="flex space-x-2 overflow-x-auto scrollbar-none py-1 px-1 touch-pan-x"
        >
          {dayStripItems.map((item) => {
            const isSel = item.isSelected;
            return (
              <button
                key={item.iso}
                type="button"
                data-selected={isSel ? 'true' : 'false'}
                onClick={() => onDateChange(item.date)}
                className={`min-w-[54px] min-h-[60px] flex flex-col items-center justify-center rounded-xl p-1.5 transition cursor-pointer select-none border ${
                  isSel
                    ? 'bg-blue-50 text-blue-800 border-blue-200 font-bold'
                    : 'bg-white/70 text-slate-700 border-transparent hover:border-slate-200 active:bg-white'
                }`}
              >
                <span className={`text-[11px] font-semibold uppercase ${isSel ? 'text-blue-600' : 'text-slate-400'}`}>
                  {item.dayName}
                </span>
                <span className={`text-base font-bold ${isSel ? 'text-blue-900' : 'text-slate-800'}`}>
                  {item.dayNum}
                </span>
                {item.count > 0 ? (
                  <span
                    className={`mt-0.5 text-[10px] px-1.5 py-0.2 rounded-full font-bold leading-tight ${
                      isSel ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item.count}
                  </span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-200 mt-1" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. METRIC SUMMARY BAR TODAY */}
      <div className="px-3.5 py-2 bg-white border-b border-slate-100 flex items-center justify-between gap-2 overflow-x-auto scrollbar-none text-xs">
        <div className="flex items-center space-x-2 shrink-0">
          <div className="flex items-center space-x-1.5 text-slate-600 font-medium">
            <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>{dayReservations.length} {dayReservations.length === 1 ? 'actividad' : 'actividades'}</span>
          </div>
          <span className="text-slate-300">•</span>
          <div className="flex items-center space-x-1.5 text-slate-600 font-medium">
            <MapPin className="w-3.5 h-3.5 text-emerald-600" />
            <span>{spacesWithBookingsToday.size} {spacesWithBookingsToday.size === 1 ? 'espacio' : 'espacios'}</span>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {conflictsTodayCount > 0 && (
            <button
              type="button"
              onClick={() => setOnlyConflicts(!onlyConflicts)}
              className={`min-h-[36px] flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                onlyConflicts
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{conflictsTodayCount} topamientos</span>
            </button>
          )}

          {activeSpaceBlocksToday.length > 0 && (
            <div className="flex items-center space-x-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-semibold text-[11px]">
              <Wrench className="w-3.5 h-3.5 text-amber-700" />
              <span>{activeSpaceBlocksToday.length} mantención</span>
            </div>
          )}
        </div>
      </div>

      {/* 4. SEARCH & FILTER SECTION */}
      <div className="px-3.5 py-2 space-y-2 bg-white border-b border-slate-200">
        {/* Search bar toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              id="mobile-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por solicitante, taller o RUT..."
              className="w-full min-h-[44px] pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            id="mobile-filter-panel-toggle"
            onClick={() => setIsFilterPanelOpen((open) => !open)}
            aria-expanded={isFilterPanelOpen}
            className={`min-w-[44px] min-h-[44px] px-3 rounded-xl flex items-center justify-center gap-1.5 border transition cursor-pointer ${
              isFilterPanelOpen || selectedSpaceFilter !== 'ALL' || onlyImportant || onlyConflicts
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
            }`}
            title="Mostrar filtros"
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span className="hidden sm:inline text-xs font-semibold">Filtros</span>
          </button>
        </div>

        {/* Space Horizontal Filter Carousel */}
        {isFilterPanelOpen && (
        <div className="space-y-2 pt-1 animate-fadeIn">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            <button
              type="button"
              id="mobile-filter-important-toggle"
              onClick={() => setOnlyImportant(!onlyImportant)}
              aria-label="Filtrar solo importantes"
              className={`min-h-[40px] px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                onlyImportant
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${onlyImportant ? 'fill-amber-500 text-amber-600' : ''}`} />
              <span>Importantes</span>
            </button>
            {conflictsTodayCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyConflicts(!onlyConflicts)}
                className={`min-h-[40px] px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  onlyConflicts
                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                    : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Topamientos</span>
              </button>
            )}
          </div>
          <div className="flex space-x-1.5 overflow-x-auto scrollbar-none py-1">
          <button
            type="button"
            onClick={() => setSelectedSpaceFilter('ALL')}
            className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 ${
              selectedSpaceFilter === 'ALL'
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>Todos los espacios</span>
            <span className="text-[10px] opacity-80 font-mono">({dayReservations.length})</span>
          </button>

          {spaces.map((space) => {
            const canon = normalizeSpaceName(space.name);
            const countInSpace = spacesWithBookingsToday.get(canon) || 0;
            const isSelected = selectedSpaceFilter === canon;

            return (
              <button
                key={space.id}
                type="button"
                onClick={() => setSelectedSpaceFilter(isSelected ? 'ALL' : canon)}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: space.color || '#3b82f6' }}
                />
                <span>{space.name}</span>
                {countInSpace > 0 && (
                  <span
                    className={`text-[10px] font-bold px-1.5 rounded-full ${
                      isSelected ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {countInSpace}
                  </span>
                )}
              </button>
            );
          })}
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1" aria-label="Colores por tipo de reserva">
            {RESERVATION_TYPE_LEGEND.map((item) => (
              <span key={item.key} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-semibold ${item.bgClass} ${item.borderClass} ${item.softTextClass}`}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.accent }} />
                {item.label}
              </span>
            ))}
          </div>
        </div>
        )}
      </div>

      {/* 5. SPACE MAINTENANCE WARNING BANNER (IF ANY) */}
      {activeSpaceBlocksToday.length > 0 && (
        <div className="m-3 p-3 rounded-2xl bg-amber-50 border border-amber-300 shadow-2xs space-y-2">
          <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
            <Wrench className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Bloqueo / Mantención programada hoy</span>
          </div>
          {activeSpaceBlocksToday.map((block) => (
            <div
              key={block.id}
              className="p-2 bg-white/80 rounded-xl border border-amber-200 text-xs text-amber-950 flex flex-col gap-0.5"
            >
              <div className="flex items-center justify-between font-bold">
                <span className="text-amber-800 uppercase tracking-tight">{block.espacio}</span>
                <span className="text-[11px] bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">
                  {block.todoElDia ? 'Todo el día' : `${block.horaInicio || '08:00'} - ${block.horaFin || '22:30'}`}
                </span>
              </div>
              <p className="text-[11px] text-amber-900 font-medium">
                <strong className="text-amber-950">Motivo:</strong> {block.motivo} - {block.descripcion}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 6. LIST OF RESERVATION CARDS */}
      <div className="px-3 pt-3 space-y-3">
        {filteredDayReservations.length === 0 ? (
          /* EMPTY STATE */
          <div className="py-12 px-4 text-center bg-white rounded-3xl border border-slate-200 shadow-2xs">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
              <CalendarIcon className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">
              No hay actividades programadas
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4">
              {searchQuery || selectedSpaceFilter !== 'ALL' || onlyImportant || onlyConflicts
                ? 'No se encontraron resultados con los filtros actuales.'
                : `El día ${selectedDate.getDate()} de ${MONTH_NAMES[selectedDate.getMonth()]} se encuentra totalmente disponible.`}
            </p>
            {onNewReservationForDate && canCreate && (
              <button
                type="button"
                id="btn-mobile-empty-add-reservation"
                onClick={() => onNewReservationForDate(selectedDayIso, selectedSpaceFilter !== 'ALL' ? selectedSpaceFilter : undefined)}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition inline-flex items-center space-x-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Reserva para este día</span>
              </button>
            )}
          </div>
        ) : (
          filteredDayReservations.map((res) => {
            const spaceInfo = spaceMap.get(normalizeSpaceName(res.espacio));
            const spaceColor = spaceInfo?.color || '#2563eb';
            const isConflict = conflictReservationIds?.has(res.id);
            const liveState = getLiveStatus(res.horaInicio, res.horaFin);
            const isExpanded = expandedCards.has(res.id);
            const existingRating = ratingByReservationId.get(res.id);
            const isRealizada = res.realizada === 'Sí';
            const typeVisual = getReservationTypeVisual(res);
            const isActionMenuOpen = activeActionMenuId === res.id;
            const mainTitle = (res.descripcion && res.descripcion.trim()) ? res.descripcion.trim() : res.tipoActividad;
            const displayTitle = formatDisplayTitle(mainTitle);

            return (
              <article
                key={res.id}
                id={`mobile-reservation-card-${res.id}`}
                onClick={() => onSelectReservation(res)}
                className={`relative bg-white rounded-xl border transition-all overflow-hidden cursor-pointer ${
                  isConflict
                    ? 'border-rose-300 ring-2 ring-rose-200/60 bg-rose-50/20'
                    : liveState?.status === 'live'
                    ? 'border-blue-300 ring-2 ring-blue-100'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Visual reservation-type stripe on left */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5"
                  style={{ backgroundColor: isConflict ? '#e11d48' : typeVisual.accent }}
                />

                <div className="pl-3.5 pr-3 py-2.5 space-y-2">
                  {/* Card Header: Time slot + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md text-slate-800 font-bold text-xs font-mono tabular-nums">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{res.horaInicio} - {res.horaFin}</span>
                      </div>
                      {res.terminaDiaSiguiente && (
                        <span className="text-[10px] font-extrabold bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded">
                          +1 día
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {liveState?.status === 'live' && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                          <span>EN CURSO</span>
                        </span>
                      )}

                      {isConflict && (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-extrabold">
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          <span>TOPAMIENTO</span>
                        </span>
                      )}

                      {res.importante === 'Sí' && (
                        <span className="p-1 rounded-md bg-amber-100 text-amber-800" title="Actividad Importante">
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600" />
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Space & Activity Title */}
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5 min-w-0">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: spaceColor }} />
                        <span className="truncate">{res.espacio}</span>
                      </span>
                    </div>

                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug line-clamp-2 break-words" title={mainTitle}>
                      {displayTitle || 'Sin descripción'}
                    </h4>
                  </div>

                  {/* Badges and metadata */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    {res.actividadRecurrente === 'Sí' && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200">
                        <Repeat className="w-3 h-3" />
                        <span>Serie {res.indiceEnSerie ? `${res.indiceEnSerie}/${res.totalEnSerie || '?'}` : 'Recurrente'}</span>
                      </span>
                    )}

                    {res.requiereCartaCompromiso && (
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-md font-semibold border ${
                          res.cartaCompromisoAdjunta
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : res.cartaCompromisoDescargada
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        <FileCheck className="w-3 h-3" />
                        <span>
                          {res.cartaCompromisoAdjunta
                            ? 'Carta Adjunta'
                            : res.cartaCompromisoDescargada
                            ? 'Carta Descargada'
                            : 'Carta Pendiente'}
                        </span>
                      </span>
                    )}

                    {res.equipamientoSolicitado && res.equipamientoSolicitado.length > 0 && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">
                        <span>📦 {res.equipamientoSolicitado.length} equipos</span>
                      </span>
                    )}

                    {existingRating && (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-bold border border-amber-200">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-600" />
                        <span>{existingRating.puntajeGeneral} ★ ({existingRating.auxiliarName})</span>
                      </span>
                    )}
                  </div>

                  {/* Expandable comments / equipment preview */}
                  {(res.comentarios || (res.equipamientoSolicitado && res.equipamientoSolicitado.length > 0)) && (
                    <div>
                      {isExpanded ? (
                        <div className="mt-1 p-2.5 rounded-xl bg-slate-100/80 text-xs text-slate-700 space-y-1.5 animate-fadeIn">
                          {res.comentarios && (
                            <p className="text-[11px]">
                              <strong className="text-slate-900">Comentarios:</strong> {res.comentarios}
                            </p>
                          )}
                          {res.equipamientoSolicitado && res.equipamientoSolicitado.length > 0 && (
                            <div className="text-[11px]">
                              <strong className="text-slate-900">Equipamiento:</strong>
                              <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
                                {res.equipamientoSolicitado.map((eq, i) => (
                                  <li key={i}>{eq.quantity}x {eq.equipmentName} {eq.notes ? `(${eq.notes})` : ''}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => toggleCardExpand(res.id, e)}
                            className="text-blue-700 text-[11px] font-bold flex items-center space-x-1 cursor-pointer pt-1"
                          >
                            <span>Menos detalles</span>
                            <ChevronUp className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => toggleCardExpand(res.id, e)}
                          className="text-blue-700 text-[11px] font-semibold flex items-center space-x-1 cursor-pointer hover:underline"
                        >
                          <span>Ver notas y equipos</span>
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Primary state and compact overflow actions */}
                  <div
                    className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Left: Asistencia / Realizada toggle */}
                    {onToggleRealizada && canEdit ? (
                      <button
                        type="button"
                        onClick={() => onToggleRealizada(res)}
                        className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer ${
                          isRealizada
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                        title={isRealizada ? 'Marcar como pendiente' : 'Marcar como realizada'}
                      >
                        {isRealizada ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400" />
                        )}
                        <span>{isRealizada ? 'Realizada' : 'Pendiente'}</span>
                      </button>
                    ) : <div />}

                    <button
                      type="button"
                      onClick={() => setActiveActionMenuId(isActionMenuOpen ? null : res.id)}
                      aria-expanded={isActionMenuOpen}
                      aria-label="Mostrar acciones de la reserva"
                      className="min-h-[44px] min-w-[44px] rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 flex items-center justify-center transition cursor-pointer"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>
                  </div>

                  {isActionMenuOpen && (
                    <div
                      className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2 animate-fadeIn"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {onOpenRating && (
                        <button
                          type="button"
                          onClick={() => onOpenRating(res, existingRating)}
                          className={`min-h-[44px] px-3 py-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer ${
                            existingRating
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                          title={existingRating ? 'Ver/editar calificación de auxiliar' : 'Calificar espacio (Auxiliares)'}
                        >
                          <Star className={`w-4 h-4 ${existingRating ? 'fill-amber-500 text-amber-600' : 'text-slate-600'}`} />
                          <span>Calificar</span>
                        </button>
                      )}

                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => onEditReservation(res)}
                          aria-label="Editar reserva"
                          className="min-h-[44px] px-3 py-2 rounded-lg bg-white border border-slate-200 text-blue-700 hover:bg-blue-50 flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer"
                          title="Editar reserva"
                        >
                          <Edit2 className="w-4 h-4" />
                          <span>Editar</span>
                        </button>
                      )}

                      {onDuplicateReservation && canCreate && (
                        <button
                          type="button"
                          onClick={() => onDuplicateReservation(res)}
                          aria-label="Duplicar reserva"
                          className="min-h-[44px] px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer"
                          title="Duplicar reserva"
                        >
                          <Copy className="w-4 h-4" />
                          <span>Duplicar</span>
                        </button>
                      )}

                      {(onDeleteReservation || onRequestDelete) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (canDelete && onDeleteReservation) {
                              onDeleteReservation(res.id, res.actividadRecurrente === 'Sí', res.recurrenteId);
                            } else if (onRequestDelete) {
                              onRequestDelete(res);
                            }
                          }}
                          aria-label={canDelete ? "Eliminar reserva" : "Solicitar eliminación de reserva"}
                          className="min-h-[44px] px-3 py-2 rounded-lg bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 flex items-center justify-center gap-1.5 text-xs font-semibold transition cursor-pointer"
                          title={canDelete ? "Eliminar reserva" : "Solicitar eliminación"}
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Eliminar</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* 7. FLOATING ACTION BUTTON (FAB) FOR MOBILE */}
      {onNewReservationForDate && canCreate && (
        <div className="fixed bottom-6 right-4 z-40">
          <button
            type="button"
            id="btn-mobile-fab-new-reservation"
            onClick={() => onNewReservationForDate(selectedDayIso, selectedSpaceFilter !== 'ALL' ? selectedSpaceFilter : undefined)}
            aria-label="Crear nueva reserva"
            className="h-14 w-14 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-lg active:scale-95 transition flex items-center justify-center cursor-pointer ring-4 ring-white/80"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>
      )}
    </div>
  );
};
