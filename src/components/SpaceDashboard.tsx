import { formatDisplayTitle } from '../utils/reservationVisuals';
import React from 'react';
import { Reservation, SpaceInfo } from '../types';
import { SPACES_LIST } from '../data/spacesData';
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
  Sun
} from 'lucide-react';
import { format } from 'date-fns';
import { isReservationActiveForAvailability } from '../utils/conflictDetector';

interface SpaceDashboardProps {
  reservations: Reservation[];
  spaces?: SpaceInfo[];
  onSelectSpace: (spaceName: string) => void;
  onNewReservationForSpace: (spaceName: string) => void;
  onSelectReservation: (reserva: Reservation) => void;
}

export const SpaceDashboard: React.FC<SpaceDashboardProps> = ({
  reservations,
  spaces = SPACES_LIST,
  onSelectSpace,
  onNewReservationForSpace,
  onSelectReservation
}) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

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

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* Header banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
            Directorio de Espacios Comunitarios
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Explora las categorías, detalles y el estado de ocupación actual para cada recinto, sala de talleres y multicancha.
          </p>
        </div>
      </div>

      {/* Grid of Spaces */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {spaces.map((space) => {
          const spaceReservations = reservations.filter(
            r => r.espacio.toUpperCase() === space.name.toUpperCase()
          );

          const todayEvents = spaceReservations.filter(r => r.fecha === todayStr);
          todayEvents.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
          const activeTodayEvents = todayEvents.filter(r => isReservationActiveForAvailability(r));

          return (
            <div
              key={space.id}
              className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 transition group"
            >
              {/* Space Top Info */}
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
                      style={{ backgroundColor: space.color }}
                    >
                      {getIcon(space.iconName)}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-slate-900 group-hover:text-blue-700 transition">
                        {space.name}
                      </h3>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {space.category}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => onNewReservationForSpace(space.name)}
                    title="Nueva Reserva en este espacio"
                    className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 border border-slate-200 text-slate-600 hover:text-blue-600 transition"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">
                  {space.description}
                </p>
              </div>

              {/* Today's Agenda Preview */}
              <div className="space-y-2 pt-3 border-t border-slate-100 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-2">
                    <span className="font-semibold text-slate-700">Hoy ({activeTodayEvents.length} activas):</span>
                    <span>Total histórico: {spaceReservations.length}</span>
                  </div>

                  {activeTodayEvents.length === 0 ? (
                    <div className="min-h-[86px] flex items-center justify-center text-center text-xs text-slate-400 bg-slate-50/80 rounded-xl border border-dashed border-slate-200">
                      <span>Disponible todo el día</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 min-h-[86px]">
                      {activeTodayEvents.slice(0, 2).map((res) => (
                        <div
                          key={res.id}
                          onClick={() => onSelectReservation(res)}
                          className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-xs text-slate-700 flex items-center justify-between cursor-pointer border border-slate-200 transition"
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold truncate text-slate-900 block text-xs">
                              {formatDisplayTitle(res.descripcion || res.tipoActividad)}
                            </span>
                            <span className="text-[10px] text-slate-500">{formatDisplayTitle(res.responsable)}</span>
                          </div>
                          <div className="text-[10px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shrink-0 font-medium">
                            {res.horaInicio}-{res.horaFin}
                          </div>
                        </div>
                      ))}
                      {activeTodayEvents.length > 2 && (
                        <div className="text-[10px] text-blue-600 text-right font-medium">
                          +{activeTodayEvents.length - 2} actividades más hoy
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Button */}
              <button
                onClick={() => onSelectSpace(space.name)}
                className="w-full py-2 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-xs flex items-center justify-center space-x-1.5 transition"
              >
                <span>Filtrar reservas de {space.name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
