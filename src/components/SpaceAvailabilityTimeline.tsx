import { formatDisplayTitle } from '../utils/reservationVisuals';
import React, { useMemo } from 'react';
import { Clock, CheckCircle2, AlertTriangle, Sparkles, Hammer } from 'lucide-react';
import { Reservation, SpaceBlock } from '../types';
import { normalizeSpaceName } from '../data/spacesData';
import { timeToMinutes, formatMinutesToTime } from '../utils/conflictDetector';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface SpaceAvailabilityTimelineProps {
  space: string;
  date: string;
  currentStartTime: string;
  currentEndTime: string;
  allReservations: readonly Reservation[];
  spaceBlocks?: readonly SpaceBlock[];
  excludeReservationId?: string;
  onSelectTimeRange?: (startTime: string, endTime: string) => void;
  terminaDiaSiguiente?: boolean;
}

interface OccupiedSlot {
  id: string;
  horaInicio: string;
  horaFin: string;
  startMin: number;
  endMin: number;
  descripcion: string;
  tipoActividad: string;
  responsable: string;
  isBlock?: boolean;
}

interface FreeSlot {
  horaInicio: string;
  horaFin: string;
  startMin: number;
  endMin: number;
  durationMin: number;
}

export const SpaceAvailabilityTimeline: React.FC<SpaceAvailabilityTimelineProps> = ({
  space,
  date,
  currentStartTime,
  currentEndTime,
  allReservations,
  spaceBlocks = [],
  excludeReservationId,
  onSelectTimeRange,
  terminaDiaSiguiente = false
}) => {
  // Operational day range: 08:00 (480 min) to 22:30 (1350 min)
  const OP_START_MIN = 8 * 60; // 08:00 = 480
  const OP_END_MIN = 22 * 60 + 30; // 22:30 = 1350
  const TOTAL_MIN = OP_END_MIN - OP_START_MIN; // 870 minutes

  // Find all reservations and active blocks for this specific space and date
  const dayReservations = useMemo<OccupiedSlot[]>(() => {
    if (!space || !date) return [];
    const targetNorm = normalizeSpaceName(space);

    const normalReservations: OccupiedSlot[] = allReservations
      .filter((r) => {
        if (excludeReservationId && r.id === excludeReservationId) return false;
        if (r.fecha !== date) return false;
        if (normalizeSpaceName(r.espacio) !== targetNorm) return false;
        return true;
      })
      .map((r) => ({
        id: r.id,
        horaInicio: r.horaInicio,
        horaFin: r.horaFin,
        startMin: timeToMinutes(r.horaInicio),
        endMin: timeToMinutes(r.horaFin),
        descripcion: r.descripcion,
        tipoActividad: r.tipoActividad,
        responsable: r.responsable,
        isBlock: false
      }));

    // Add maintenance space blocks that overlap this date and space
    const blockSlots: OccupiedSlot[] = spaceBlocks
      .filter((b) => {
        if (!b.activo) return false;
        if (date < b.fechaInicio || date > b.fechaFin) return false;
        const bSpaceNorm = normalizeSpaceName(b.espacio);
        const matchesSpace = bSpaceNorm === targetNorm ||
          (b.bloquearSubEspacios && targetNorm.includes(bSpaceNorm)) ||
          (b.bloquearSubEspacios && bSpaceNorm.includes(targetNorm));
        return matchesSpace;
      })
      .map((b) => ({
        id: b.id,
        horaInicio: b.todoElDia ? '08:00' : (b.horaInicio || '08:00'),
        horaFin: b.todoElDia ? '22:30' : (b.horaFin || '22:30'),
        startMin: b.todoElDia ? OP_START_MIN : timeToMinutes(b.horaInicio || '08:00'),
        endMin: b.todoElDia ? OP_END_MIN : timeToMinutes(b.horaFin || '22:30'),
        descripcion: b.descripcion || b.motivo,
        tipoActividad: `🚧 MANTENCIÓN: ${b.motivo}`,
        responsable: b.responsableMantenimiento || 'Personal de Mantención',
        isBlock: true
      }));

    return [...normalReservations, ...blockSlots].sort((a, b) => a.startMin - b.startMin);
  }, [allReservations, spaceBlocks, space, date, excludeReservationId, OP_START_MIN, OP_END_MIN]);

  // Current selected user time in minutes (predeterminado desde las 08:30)
  const selStartMin = useMemo(() => timeToMinutes(currentStartTime || '08:30'), [currentStartTime]);
  const selEndMin = useMemo(() => {
    const rawEnd = timeToMinutes(currentEndTime || '09:30');
    if (terminaDiaSiguiente && rawEnd <= selStartMin) {
      return rawEnd + 1440;
    }
    return rawEnd;
  }, [currentEndTime, selStartMin, terminaDiaSiguiente]);

  // Determine if there is an active conflict with the selected range
  const activeConflict = useMemo(() => {
    if (selEndMin <= selStartMin) return null;
    return dayReservations.find((res) => {
      // Overlap condition: start < res.end && end > res.start
      return selStartMin < res.endMin && selEndMin > res.startMin;
    });
  }, [dayReservations, selStartMin, selEndMin]);

  // Calculate free gap intervals during operational hours (sugerencias desde las 08:30 horario regular)
  const freeSlots = useMemo<FreeSlot[]>(() => {
    const slots: FreeSlot[] = [];
    const REGULAR_START_MIN = 8 * 60 + 30; // 08:30 hrs
    let pointer = REGULAR_START_MIN;

    for (const occ of dayReservations) {
      const occClampedStart = Math.max(OP_START_MIN, Math.min(OP_END_MIN, occ.startMin));
      const occClampedEnd = Math.max(OP_START_MIN, Math.min(OP_END_MIN, occ.endMin));

      if (occClampedStart > pointer) {
        const duration = occClampedStart - pointer;
        if (duration >= 30) {
          slots.push({
            startMin: pointer,
            endMin: occClampedStart,
            horaInicio: formatMinutesToTime(pointer),
            horaFin: formatMinutesToTime(occClampedStart),
            durationMin: duration
          });
        }
      }
      pointer = Math.max(pointer, occClampedEnd);
    }

    if (pointer < OP_END_MIN) {
      const duration = OP_END_MIN - pointer;
      if (duration >= 30) {
        slots.push({
          startMin: pointer,
          endMin: OP_END_MIN,
          horaInicio: formatMinutesToTime(pointer),
          horaFin: formatMinutesToTime(OP_END_MIN),
          durationMin: duration
        });
      }
    }

    return slots;
  }, [dayReservations, OP_START_MIN, OP_END_MIN]);

  // Hour tick marks for the timeline header
  const hourTicks = useMemo(() => {
    const ticks: { hour: string; pct: number }[] = [];
    for (let h = 8; h <= 22; h += 2) {
      const min = h * 60;
      const pct = Math.max(0, Math.min(100, ((min - OP_START_MIN) / TOTAL_MIN) * 100));
      ticks.push({
        hour: `${String(h).padStart(2, '0')}:00`,
        pct
      });
    }
    return ticks;
  }, [OP_START_MIN, TOTAL_MIN]);

  // Calculate percentage and width for a minute interval
  const getIntervalStyle = (startMin: number, endMin: number) => {
    const clampedStart = Math.max(OP_START_MIN, Math.min(OP_END_MIN, startMin));
    const clampedEnd = Math.max(OP_START_MIN, Math.min(OP_END_MIN, endMin));
    const leftPct = ((clampedStart - OP_START_MIN) / TOTAL_MIN) * 100;
    const widthPct = Math.max(1.5, ((clampedEnd - clampedStart) / TOTAL_MIN) * 100);
    return {
      left: `${leftPct}%`,
      width: `${widthPct}%`
    };
  };

  // Check if time range is fundamentally invalid (start >= end without overnight flag)
  const isInvalidTimeRange = !terminaDiaSiguiente && selEndMin <= selStartMin;

  if (!space || !date) {
    return null;
  }

  return (
    <div
      id="space-availability-timeline-card"
      className="p-3.5 bg-slate-50/90 rounded-2xl border border-slate-200/90 text-xs space-y-3 shadow-2xs"
    >
      {/* Top Header with summary & real-time semaphore status */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2 min-w-0">
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              isInvalidTimeRange || activeConflict
                ? 'bg-rose-500 ring-4 ring-rose-200 animate-pulse'
                : 'bg-emerald-500 ring-4 ring-emerald-100'
            }`}
          />
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Disponibilidad en Tiempo Real:</span>
            <span className="font-semibold text-blue-700 truncate">{space}</span>
          </span>
          <span className="text-slate-400 text-[11px]">• {formatDateDDMMYYYY(date)}</span>
        </div>

        {/* Dynamic Status Badge */}
        {isInvalidTimeRange ? (
          <div className="flex items-center space-x-1 text-[11px] font-bold text-rose-700 bg-rose-100/80 px-2.5 py-0.5 rounded-full border border-rose-300">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Horario no disponible: La hora de término ({currentEndTime}) debe ser posterior a la de inicio ({currentStartTime})</span>
          </div>
        ) : activeConflict ? (
          <div className={`flex items-center space-x-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
            activeConflict.isBlock
              ? 'text-amber-900 bg-amber-100 border-amber-300'
              : 'text-rose-700 bg-rose-100/80 border-rose-300'
          }`}>
            {activeConflict.isBlock ? <Hammer className="w-3.5 h-3.5 text-amber-700" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            <span>
              {activeConflict.isBlock
                ? `Espacio en Mantención (${activeConflict.horaInicio} - ${activeConflict.horaFin}): ${formatDisplayTitle(activeConflict.descripcion)}`
                : `Topamiento con "${formatDisplayTitle(activeConflict.tipoActividad)}" (${activeConflict.horaInicio} - ${activeConflict.horaFin})`}
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Horario Disponible ({currentStartTime} - {currentEndTime})</span>
          </div>
        )}
      </div>

      {/* Visual Timeline Bar with Hour Marks */}
      <div className="space-y-1.5">
        {/* Hour Axis Labels */}
        <div className="relative h-4 text-[10px] font-mono text-slate-600 select-none">
          {hourTicks.map((t) => (
            <span
              key={t.hour}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${t.pct}%` }}
            >
              {t.hour}
            </span>
          ))}
        </div>

        {/* Timeline Track */}
        <div className="relative h-8 bg-slate-200/90 rounded-xl overflow-hidden border border-slate-300/80 shadow-inner">
          {/* Base Available Background */}
          <div className="absolute inset-0 bg-emerald-100/60" />

          {/* Occupied Segments (Red/Rose for reservations, Amber/Striped for maintenance) */}
          {dayReservations.map((occ) => {
            const style = getIntervalStyle(occ.startMin, occ.endMin);
            return (
              <div
                key={occ.id}
                style={style}
                title={`${occ.horaInicio} - ${occ.horaFin} | ${formatDisplayTitle(occ.tipoActividad)}: ${formatDisplayTitle(occ.descripcion)} (Resp: ${formatDisplayTitle(occ.responsable)})`}
                className={`absolute top-0 bottom-0 text-white flex items-center justify-center overflow-hidden px-1 transition cursor-pointer border-r group ${
                  occ.isBlock
                    ? 'bg-amber-500/90 hover:bg-amber-600 border-amber-600'
                    : 'bg-rose-500/85 hover:bg-rose-600 border-rose-600/40'
                }`}
              >
                <span className="text-[10px] font-bold font-mono truncate select-none group-hover:scale-105 transition-transform flex items-center gap-0.5">
                  {occ.isBlock && <Hammer className="w-2.5 h-2.5 shrink-0 text-white" />}
                  <span>{occ.horaInicio}</span>
                </span>
              </div>
            );
          })}

          {/* User Selected Interval Highlight (Blue overlay with border) */}
          {!isInvalidTimeRange && selStartMin < OP_END_MIN && selEndMin > OP_START_MIN && (
            <div
              style={getIntervalStyle(selStartMin, selEndMin)}
              className={`absolute top-0 bottom-0 pointer-events-none transition-all duration-150 ${
                activeConflict
                  ? 'bg-rose-400/40 border-2 border-rose-600 border-dashed z-20'
                  : 'bg-blue-600/40 border-2 border-blue-600 z-20 shadow-xs'
              }`}
            >
              <div className="absolute inset-x-0 -top-5 flex justify-center">
                <span className="text-[9px] font-mono font-black bg-blue-600 text-white px-1.5 py-0.2 rounded shadow-xs">
                  Tu Selección
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend & Quick Free Slot Selection Chips */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {/* Legend */}
        <div className="flex items-center space-x-3 text-[11px] text-slate-600">
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-300 border border-emerald-400" />
            <span>Libre</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
            <span>Ocupado ({dayReservations.length})</span>
          </div>
          <div className="flex items-center space-x-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-600/60 border border-blue-600" />
            <span>Selección</span>
          </div>
        </div>

        {/* Free Slot Chips */}
        {onSelectTimeRange && freeSlots.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Bloques sugeridos:</span>
            </span>
            {freeSlots.slice(0, 3).map((slot, i) => (
              <button
                key={i}
                type="button"
                id={`btn-timeline-slot-${i}`}
                onClick={() => onSelectTimeRange(slot.horaInicio, slot.horaFin)}
                className="px-2 py-1 bg-white hover:bg-emerald-50 text-slate-800 hover:text-emerald-800 border border-slate-200 hover:border-emerald-300 rounded-lg text-[11px] font-mono font-semibold transition shadow-2xs flex items-center space-x-1 cursor-pointer"
                title={`Seleccionar ${slot.horaInicio} a ${slot.horaFin} (${slot.durationMin} min disponibles)`}
              >
                <span>{slot.horaInicio} - {slot.horaFin}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
