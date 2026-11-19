import React, { useMemo, useState } from 'react';
import { Reservation, SpaceInfo, ActivityTypeItem } from '../types';
import { SPACES_LIST, ACTIVITY_TYPES } from '../data/spacesData';
import { getConstituentSpaces } from '../utils/conflictDetector';
import {
  Users,
  Calendar,
  Layers,
  Award,
  BarChart,
  PieChart,
  Flame,
  Activity,
  Sparkles
} from 'lucide-react';
import {
  D3SpaceBarChart,
  D3ActivityDonutChart,
  D3HourlyOccupancyChart
} from './D3AnalyticsCharts';

interface AnalyticsViewProps {
  reservations: Reservation[];
  spaces?: SpaceInfo[];
  activityTypes?: ActivityTypeItem[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  reservations,
  spaces = SPACES_LIST,
  activityTypes
}) => {
  const [chartMode, setChartMode] = useState<'d3' | 'list'>('d3');

  const {
    total,
    importantes,
    recurrentes,
    totalParticipantes,
    dateRangeLabel,
    spaceCounts,
    activityCounts,
    topResponsibles
  } = useMemo(() => {
    const totalCount = reservations.length;
    let impCount = 0;
    let recCount = 0;
    let totalPart = 0;
    let minDate = '';
    let maxDate = '';

    const spaceAgg = new Map<string, { count: number; participants: number }>();
    const activityAgg = new Map<string, number>();
    const responsibleMap = new Map<string, { count: number; workshops: Set<string> }>();

    for (let i = 0; i < reservations.length; i++) {
      const r = reservations[i];
      if (r.importante === 'Sí') impCount++;
      if (r.actividadRecurrente === 'Sí') recCount++;
      const part = r.cantidadParticipantes || 0;
      totalPart += part;

      if (r.fecha) {
        if (!minDate || r.fecha < minDate) minDate = r.fecha;
        if (!maxDate || r.fecha > maxDate) maxDate = r.fecha;
      }

      // Count multi-space reservations in each constituent room as well as exact matches
      const rooms = r.espacio ? getConstituentSpaces(r.espacio) : [];
      for (const room of rooms) {
        const key = room.toUpperCase();
        const prev = spaceAgg.get(key);
        if (prev) {
          prev.count += 1;
          prev.participants += part;
        } else {
          spaceAgg.set(key, { count: 1, participants: part });
        }
      }

      if (r.tipoActividad) {
        activityAgg.set(r.tipoActividad, (activityAgg.get(r.tipoActividad) || 0) + 1);
      }

      const name = r.responsable?.trim() || 'No especificado';
      let respEntry = responsibleMap.get(name);
      if (!respEntry) {
        respEntry = { count: 0, workshops: new Set() };
        responsibleMap.set(name, respEntry);
      }
      respEntry.count += 1;
      if (r.descripcion) respEntry.workshops.add(r.descripcion);
    }

    const catalogSpaces = spaces.length > 0 ? spaces : SPACES_LIST;
    const computedSpaceCounts = catalogSpaces
      .map(space => {
        const agg = spaceAgg.get(space.name.toUpperCase());
        const count = agg?.count || 0;
        const participants = agg?.participants || 0;
        return {
          ...space,
          count,
          participants,
          percentage: totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : '0'
        };
      })
      .sort((a, b) => b.count - a.count);

    const activityNames = activityTypes && activityTypes.length > 0
      ? activityTypes.map(item => item.name)
      : ACTIVITY_TYPES;
    const computedActivityCounts = activityNames
      .map(type => {
        const count = activityAgg.get(type) || 0;
        return {
          type,
          count,
          percentage: totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : '0'
        };
      })
      .sort((a, b) => b.count - a.count);

    const computedTopResponsibles = Array.from(responsibleMap.entries())
      .map(([name, data]) => ({
        name,
        count: data.count,
        workshopsCount: data.workshops.size
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      total: totalCount,
      importantes: impCount,
      recurrentes: recCount,
      totalParticipantes: totalPart,
      dateRangeLabel: minDate && maxDate ? `Fechas: ${minDate} a ${maxDate}.` : 'Sin datos cargados.',
      spaceCounts: computedSpaceCounts,
      activityCounts: computedActivityCounts,
      topResponsibles: computedTopResponsibles
    };
  }, [reservations, spaces, activityTypes]);

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      <p className="text-sm text-slate-600">Estadísticas del conjunto cargado ({reservations.length} reservas). {dateRangeLabel} El historial que aún no se ha consultado no está incluido.</p>
      {/* Key Metric Highlights */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900">{total}</div>
            <div className="text-xs text-slate-500 font-medium">Reservas cargadas</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-600">{importantes}</div>
            <div className="text-xs text-slate-500 font-medium">Actividades Importantes</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl border border-sky-100">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-sky-600">{totalParticipantes.toLocaleString()}</div>
            <div className="text-xs text-slate-500 font-medium">Asistencia Estimada</div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center space-x-3.5">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-indigo-600">{recurrentes}</div>
            <div className="text-xs text-slate-500 font-medium">Series Recurrentes</div>
          </div>
        </div>
      </div>

      {/* View Switcher: Gráficos D3.js vs Lista Detallada */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-800">Visualización de Datos con D3.js:</span>
          <span className="text-[11px] text-slate-500 hidden md:inline">
            Gráficos vectoriales SVG dinámicos, escalas y curvas de demanda
          </span>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setChartMode('d3')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
              chartMode === 'd3'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Gráficos D3.js</span>
          </button>
          <button
            type="button"
            onClick={() => setChartMode('list')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 cursor-pointer ${
              chartMode === 'list'
                ? 'bg-white text-indigo-700 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart className="w-3.5 h-3.5" />
            <span>Lista / Barras Simples</span>
          </button>
        </div>
      </div>

      {/* Hourly Occupancy Area Chart (D3.js) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
          <div className="flex items-center space-x-2">
            <Activity className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-base text-slate-900">Curva de Ocupación por Horas (D3.js)</h3>
              <p className="text-xs text-slate-500">
                Distribución continua de demanda horaria en el centro (08:00 a 22:00 hrs)
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
            SVG Interactivo D3
          </span>
        </div>
        <D3HourlyOccupancyChart reservations={reservations} />
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Espacios más demandados */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center space-x-2">
              <BarChart className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-base text-slate-900">Uso y Demanda por Espacio</h3>
            </div>
            {chartMode === 'd3' && (
              <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                D3 ScaleBand + SVG
              </span>
            )}
          </div>

          {chartMode === 'd3' ? (
            <D3SpaceBarChart data={spaceCounts} />
          ) : (
            <div className="space-y-3.5">
              {spaceCounts.map((s) => (
                <div key={s.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 font-semibold text-slate-800">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span>{s.name}</span>
                    </div>
                    <span className="font-mono text-slate-500">
                      {s.count} reservas ({s.percentage}%) · {s.participants} personas
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${s.percentage}%`,
                        backgroundColor: s.color || '#3b82f6'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tipo de Actividad */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center space-x-2">
              <PieChart className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-base text-slate-900">Distribución por Tipo de Actividad</h3>
            </div>
            {chartMode === 'd3' && (
              <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                D3 Pie & Arc
              </span>
            )}
          </div>

          {chartMode === 'd3' ? (
            <D3ActivityDonutChart data={activityCounts} />
          ) : (
            <div className="space-y-3.5">
              {activityCounts.map((a) => (
                <div key={a.type} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{a.type}</span>
                    <span className="font-mono text-slate-500">
                      {a.count} ({a.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${a.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Monitores y Talleristas más activos */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-4 lg:col-span-2">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-200">
            <Award className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-base text-slate-900">Monitores, Talleristas y Responsables Principales</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {topResponsibles.map((r, idx) => (
              <div
                key={r.name}
                className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-1.5 flex flex-col justify-between"
              >
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase">#{idx + 1} Responsable</div>
                  <div className="font-bold text-sm text-slate-900 line-clamp-1">{r.name}</div>
                </div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-600 pt-2 border-t border-slate-200/60">
                  <span>{r.count} reservas</span>
                  <span className="text-slate-400">{r.workshopsCount} talleres</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
