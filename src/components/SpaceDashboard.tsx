import { formatDisplayTitle } from '../utils/reservationVisuals';
import {
  computeRoomDayFreeSlots,
  formatDurationCompact,
  getEnabledSpaces,
  getRoomLiveStatus,
} from '../utils/spaceAvailability';
import React, { useState, useMemo, lazy, Suspense } from 'react';
import type { AuthUser } from '../services/authService';
import { userCanEditReservations } from '../services/authService';
import { Reservation, SpaceBlock, SpaceInfo } from '../types';
import { SPACES_LIST } from '../data/spacesData';
import { CalendarDateInput } from './common/CalendarDateInput';
import {
  Users,
  Plus,
  ArrowRight,
  Activity,
  Sparkles,
  ChefHat,
  Dumbbell,
  Trophy,
  Presentation,
  Layers,
  BookOpen,
  Grid,
  GraduationCap,
  Library,
  Stethoscope,
  Sun,
  SlidersHorizontal,
  Clock,
  Search
} from 'lucide-react';
import { format } from 'date-fns';
import { doSpacesConflict, isReservationActiveForAvailability, timeToMinutes } from '../utils/conflictDetector';
import { REGULAR_LOAN_END_MINUTES, REGULAR_LOAN_START_MINUTES } from '../utils/validationUtils';

const DistributionPlannerModal = lazy(() =>
  import('./DistributionPlannerModal').then((m) => ({ default: m.DistributionPlannerModal }))
);

interface SpaceDashboardProps {
  currentUser?: AuthUser | null;
  onDistributionCommitted?: (rows: Reservation[]) => void;
  reservations: Reservation[];
  spaces?: SpaceInfo[];
  spaceBlocks?: readonly SpaceBlock[];
  onSelectSpace: (spaceName: string) => void;
  onNewReservationForSpace: (spaceName: string, dateStr?: string, startTime?: string, endTime?: string) => void;
  onSelectReservation: (reserva: Reservation) => void;
}

export const SpaceDashboard: React.FC<SpaceDashboardProps> = ({
  currentUser,
  onDistributionCommitted,
  reservations,
  spaces = SPACES_LIST,
  spaceBlocks = [],
  onSelectSpace,
  onNewReservationForSpace,
  onSelectReservation
}) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [selectedDateStr, setSelectedDateStr] = useState<string>(todayStr);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [minCapacity, setMinCapacity] = useState<number>(0);
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const canPlanDistribution = Boolean(currentUser && onDistributionCommitted && userCanEditReservations(currentUser));

  const enabledSpaces = useMemo(() => getEnabledSpaces(spaces), [spaces]);
  const categories = useMemo(
    () => [...new Set(enabledSpaces.map((s) => s.category).filter(Boolean))],
    [enabledSpaces]
  );

  const isViewingToday = selectedDateStr === todayStr;
  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);

  const enrichedSpaces = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return enabledSpaces
      .map((space) => {
        const spaceReservations = reservations.filter((r) => doSpacesConflict(r.espacio, space.name));
        const dayEvents = spaceReservations
          .filter((r) => r.fecha === selectedDateStr && isReservationActiveForAvailability(r))
          .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
        const summary = computeRoomDayFreeSlots(space.name, selectedDateStr, reservations, spaceBlocks, { minSlotMinutes: 30 });
        const live = getRoomLiveStatus(space.name, selectedDateStr, nowMinutes, reservations, spaceBlocks);
        return { space, spaceReservations, dayEvents, summary, live };
      })
      .filter(({ space, summary, live }) => {
        if (selectedCategory !== 'ALL' && space.category !== selectedCategory) return false;
        if (minCapacity > 0 && (space.capacity ?? 0) < minCapacity) return false;
        if (onlyAvailable) {
          if (isViewingToday ? live.status !== 'free' : summary.slots.length === 0) return false;
        }
        if (q && !space.name.toLowerCase().includes(q) && !space.description.toLowerCase().includes(q) && !space.category.toLowerCase().includes(q)) {
          return false;
        }
        return true;
      });
  }, [enabledSpaces, reservations, spaceBlocks, selectedDateStr, nowMinutes, selectedCategory, minCapacity, onlyAvailable, isViewingToday, searchTerm]);

  const liveFreeCount = useMemo(
    () =>
      enabledSpaces.filter((space) => {
        const live = getRoomLiveStatus(space.name, selectedDateStr, nowMinutes, reservations, spaceBlocks);
        const summary = computeRoomDayFreeSlots(space.name, selectedDateStr, reservations, spaceBlocks, { minSlotMinutes: 30 });
        return isViewingToday ? live.status === 'free' : summary.slots.length > 0;
      }).length,
    [enabledSpaces, selectedDateStr, nowMinutes, reservations, spaceBlocks, isViewingToday]
  );

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Activity': return <Activity className="w-5 h-5" />;
      case 'Sparkles': return <Sparkles className="w-5 h-5" />;
      case 'ChefHat': return <ChefHat className="w-5 h-5" />;
      case 'Dumbbell': return <Dumbbell className="w-5 h-5" />;
      case 'Trophy': return <Trophy className="w-5 h-5" />;
      case 'Presentation': return <Presentation className="w-5 h-5" />;
      case 'Layers': return <Layers className="w-5 h-5" />;
      case 'BookOpen': return <BookOpen className="w-5 h-5" />;
      case 'Grid': return <Grid className="w-5 h-5" />;
      case 'GraduationCap': return <GraduationCap className="w-5 h-5" />;
      case 'Library': return <Library className="w-5 h-5" />;
      case 'Stethoscope': return <Stethoscope className="w-5 h-5" />;
      case 'Sun': return <Sun className="w-5 h-5" />;
      default: return <Users className="w-5 h-5" />;
    }
  };

  const DAY_SPAN = REGULAR_LOAN_END_MINUTES - REGULAR_LOAN_START_MINUTES;

  return (
    <div className="max-w-7xl mx-auto p-3 sm:p-4 space-y-5">
      {/* Header banner with Live Room Board summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Tablero de Espacios Comunitarios
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {liveFreeCount} de {enabledSpaces.length} {isViewingToday ? 'libres ahora' : 'con tramos libres'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
              Visualiza el estado en tiempo real, aforo y tramos libres (08:30–22:00) de cada recinto. Haz clic en cualquier horario verde para reservar al instante.
            </p>
          </div>
          {canPlanDistribution && (
            <button
              id="btn-open-distribution-planner"
              type="button"
              onClick={() => setIsPlannerOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition cursor-pointer shrink-0"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>Planificar distribución de salas</span>
            </button>
          )}
        </div>

        {/* Interactive Filter & Date Bar */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar recinto o uso..."
              aria-label="Buscar recinto o uso"
              className="w-full min-h-10 pl-9 pr-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 min-h-10">
            <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-600">Fecha:</span>
            <CalendarDateInput
              aria-label="Fecha para consultar disponibilidad de espacios"
              value={selectedDateStr}
              onValueChange={(val) => val && setSelectedDateStr(val)}
              className="bg-transparent text-xs font-mono font-semibold text-slate-800 focus:outline-none py-1"
            />
          </div>

          <select
            aria-label="Filtrar por aforo mínimo"
            value={minCapacity}
            onChange={(e) => setMinCapacity(Number(e.target.value))}
            className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
          >
            <option value={0}>Cualquier aforo</option>
            <option value={15}>15+ personas</option>
            <option value={30}>30+ personas</option>
            <option value={60}>60+ personas</option>
          </select>

          <button
            type="button"
            aria-pressed={onlyAvailable}
            onClick={() => setOnlyAvailable((v) => !v)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition cursor-pointer ${
              onlyAvailable
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${onlyAvailable ? 'bg-white' : 'bg-emerald-500'}`} />
            <span>{isViewingToday ? 'Solo libres ahora' : 'Solo con disponibilidad'}</span>
          </button>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('ALL')}
            className={`min-h-8 rounded-lg px-3 text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              selectedCategory === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos ({enabledSpaces.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`min-h-8 rounded-lg px-3 text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {isPlannerOpen && currentUser && onDistributionCommitted && (
        <Suspense fallback={null}>
          <DistributionPlannerModal
            user={currentUser}
            onClose={() => setIsPlannerOpen(false)}
            onCommitted={(rows) => {
              onDistributionCommitted(rows);
              setIsPlannerOpen(false);
            }}
          />
        </Suspense>
      )}

      {/* Grid of Spaces */}
      {enrichedSpaces.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center space-y-2">
          <p className="text-sm font-bold text-slate-800">No se encontraron espacios con estos filtros</p>
          <p className="text-xs text-slate-500">Prueba ampliando el aforo, cambiando la categoría o desactivando el filtro de disponibilidad.</p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory('ALL');
              setMinCapacity(0);
              setOnlyAvailable(false);
              setSearchTerm('');
            }}
            className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700 cursor-pointer"
          >
            Restablecer filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {enrichedSpaces.map(({ space, spaceReservations, dayEvents, summary, live }) => (
            <div
              key={space.id}
              className="bg-white border border-slate-200 hover:border-slate-300 hover:shadow-md rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-3.5 transition group"
            >
              {/* Space Top Info */}
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                      style={{ backgroundColor: space.color }}
                    >
                      {getIcon(space.iconName)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base text-slate-900 group-hover:text-blue-700 transition truncate">
                        {space.name}
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <span>{space.category}</span>
                        {space.capacity && (
                          <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                            <Users className="w-3 h-3 text-slate-500" />
                            {space.capacity} pers.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNewReservationForSpace(space.name, selectedDateStr, summary.slots[0]?.startTime, summary.slots[0]?.endTime)}
                    title="Nueva Reserva en este espacio"
                    className="p-2 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 text-slate-600 hover:text-blue-600 transition shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                {/* Live Status Pill */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  {isViewingToday ? (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                      live.status === 'free'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : live.status === 'maintenance'
                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                        : live.status === 'occupied'
                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                        : 'border-slate-200 bg-slate-100 text-slate-600'
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${
                        live.status === 'free' ? 'bg-emerald-500' : live.status === 'maintenance' ? 'bg-amber-500' : live.status === 'occupied' ? 'bg-rose-500' : 'bg-slate-400'
                      }`} />
                      <span>{live.label}</span>
                    </span>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                      summary.freeMinutes > 0
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-rose-200 bg-rose-50 text-rose-800'
                    }`}>
                      <span>{summary.freeMinutes > 0 ? `${formatDurationCompact(summary.freeMinutes)} libres` : 'Sin tramos libres'}</span>
                    </span>
                  )}
                  <span className="text-[11px] font-mono font-semibold text-slate-500 tabular-nums">
                    {100 - summary.occupancyPct}% libre
                  </span>
                </div>

                {/* Mini Visual Timeline 08:30 - 22:00 */}
                <div className="space-y-1">
                  <div className="relative h-2.5 w-full rounded-full bg-emerald-100 border border-emerald-200/80 overflow-hidden" title="Barra de disponibilidad de 08:30 a 22:00 (Verde = libre, Coral = ocupado)">
                    {dayEvents.map((ev) => {
                      const s = Math.max(REGULAR_LOAN_START_MINUTES, Math.min(REGULAR_LOAN_END_MINUTES, timeToMinutes(ev.horaInicio)));
                      const e = Math.max(REGULAR_LOAN_START_MINUTES, Math.min(REGULAR_LOAN_END_MINUTES, timeToMinutes(ev.horaFin)));
                      if (e <= s) return null;
                      const left = ((s - REGULAR_LOAN_START_MINUTES) / DAY_SPAN) * 100;
                      const width = Math.max(2, ((e - s) / DAY_SPAN) * 100);
                      return (
                        <div
                          key={ev.id}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          className="absolute inset-y-0 bg-rose-400/90 border-r border-white/60"
                          title={`Ocupado: ${ev.horaInicio}–${ev.horaFin} (${formatDisplayTitle(ev.descripcion || ev.tipoActividad)})`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>08:30</span>
                    <span>15:00</span>
                    <span>22:00</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">
                  {space.description}
                </p>
              </div>

              {/* Clickable Free Slots */}
              <div className="space-y-2 pt-2.5 border-t border-slate-100">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-emerald-800">Tramos libres ({summary.slots.length}):</span>
                  <span className="text-slate-400">Histórico: {spaceReservations.length}</span>
                </div>
                {summary.slots.length === 0 ? (
                  <p className="text-xs text-slate-400 bg-slate-50 rounded-xl px-3 py-2 border border-dashed border-slate-200 text-center">
                    {summary.isHoliday ? 'Feriado nacional' : 'Sin tramos libres regulares'}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {summary.slots.slice(0, 3).map((slot) => (
                      <button
                        key={slot.startMin}
                        type="button"
                        onClick={() => onNewReservationForSpace(space.name, selectedDateStr, slot.startTime, slot.endTime)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900 font-mono tabular-nums transition cursor-pointer"
                        title={`Reservar ${space.name} de ${slot.startTime} a ${slot.endTime}`}
                      >
                        <span>{slot.startTime}–{slot.endTime}</span>
                        <span className="font-sans text-[10px] font-semibold text-emerald-700">({formatDurationCompact(slot.durationMinutes)})</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Compact preview of today's bookings if any */}
                {dayEvents.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {dayEvents.slice(0, 2).map((res) => (
                      <div
                        key={res.id}
                        onClick={() => onSelectReservation(res)}
                        data-reservation-id={res.id}
                        className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 flex items-center justify-between cursor-pointer border border-slate-200/80 transition"
                      >
                        <div className="truncate pr-2">
                          <span className="font-bold truncate text-slate-900 block text-xs">
                            {formatDisplayTitle(res.descripcion || res.tipoActividad)}
                          </span>
                          <span className="text-[10px] text-slate-500">{formatDisplayTitle(res.responsable)}</span>
                        </div>
                        <div className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0 font-semibold">
                          {res.horaInicio}-{res.horaFin}
                        </div>
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] text-blue-600 text-right font-semibold">
                        +{dayEvents.length - 2} actividades más ese día
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Card Footer Button */}
              <button
                type="button"
                onClick={() => onSelectSpace(space.name)}
                className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
              >
                <span>Ver en agenda diaria</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
