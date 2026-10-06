import type { Reservation, UpdateScope, CustomScheduleSlot } from '../types';
import { getChileLocalDateString, getDayOfWeekFromDateString } from './dateUtils';
import { getSeriesEditStartDate } from './recurringEdits';
import { isReservationActiveForAvailability, timeToMinutes } from './conflictDetector';
import { normalizeSpaceName } from '../data/spacesData';

export interface ScheduleSlot {
  fecha: string; espacio: string; horaInicio: string; horaFin: string;
  terminaDiaSiguiente?: boolean; sourceId?: string;
}
export interface SeriesScope {
  scope: UpdateScope; source: Reservation; history: Reservation[]; today?: string;
  rangeStartDate?: string; rangeEndDate?: string; selectedIds?: ReadonlySet<string>;
}
export function belongsToSeries(row: Reservation, source: Reservation): boolean {
  const id = source.serieRecurrente || source.recurrenteId;
  return id ? (row.serieRecurrente || row.recurrenteId) === id : row.id === source.id;
}
export function isDateInSeriesScope(date: string, context: SeriesScope): boolean {
  const { scope, source, rangeStartDate = '', rangeEndDate = '', history, selectedIds } = context;
  const today = context.today || getChileLocalDateString();
  if (date < getSeriesEditStartDate(scope, source.fecha, today)) return false;
  if (scope === 'dateRange') return Boolean(rangeStartDate && rangeEndDate) &&
    date >= [rangeStartDate, rangeEndDate].sort()[0] && date <= [rangeStartDate, rangeEndDate].sort()[1];
  if (scope === 'selected') return history.some(r => selectedIds?.has(r.id) && r.fecha === date && belongsToSeries(r, source));
  return true;
}
export function scopedSeriesRows(context: SeriesScope): Reservation[] {
  return context.history.filter(r => belongsToSeries(r, context.source) &&
    isDateInSeriesScope(r.fecha, context) && !r.reemplazadaPorReservaId && isReservationActiveForAvailability(r) &&
    (context.scope !== 'single' || r.id === context.source.id) &&
    (context.scope !== 'selected' || context.selectedIds?.has(r.id)));
}

export interface ScheduleOptions {
  mode: 'single' | 'specific' | 'pattern'; base: Partial<Reservation>;
  customDates?: Record<string, CustomScheduleSlot>; customDays?: Record<number, CustomScheduleSlot>;
  useCustomDates?: boolean; useCustomDays?: boolean;
  secondEnabled?: boolean; secondSpace?: string; secondStart?: string; secondEnd?: string;
}
export function scheduleSlotsForDate(date: string, options: ScheduleOptions): ScheduleSlot[] {
  const { base } = options;
  const useCustom = options.mode === 'specific' ? options.useCustomDates : options.mode === 'pattern' ? options.useCustomDays : false;
  const custom = useCustom ? (options.mode === 'specific' ? options.customDates?.[date] : options.customDays?.[getDayOfWeekFromDateString(date)]) : undefined;
  const slots: ScheduleSlot[] = [{ fecha: date, espacio: normalizeSpaceName(custom?.espacio || base.espacio || ''),
    horaInicio: custom?.horaInicio || base.horaInicio || '', horaFin: custom?.horaFin || base.horaFin || '',
    terminaDiaSiguiente: Boolean(base.terminaDiaSiguiente) }];
  if (useCustom ? custom?.hasSecondSlot : options.secondEnabled) slots.push({ fecha: date,
    espacio: normalizeSpaceName(useCustom ? custom?.secondEspacio || '' : options.secondSpace || ''),
    horaInicio: useCustom ? custom?.secondHoraInicio || '' : options.secondStart || '',
    horaFin: useCustom ? custom?.secondHoraFin || '' : options.secondEnd || '',
    terminaDiaSiguiente: Boolean(base.terminaDiaSiguiente) });
  return slots.map(slot=>({...slot,terminaDiaSiguiente:Boolean(base.terminaDiaSiguiente) && timeToMinutes(slot.horaFin)<=timeToMinutes(slot.horaInicio)}));
}
export function sameScheduleSlot(a: Partial<ScheduleSlot>, b: Partial<ScheduleSlot>): boolean {
  return a.fecha === b.fecha && normalizeSpaceName(a.espacio || '') === normalizeSpaceName(b.espacio || '') && a.horaInicio === b.horaInicio && a.horaFin === b.horaFin;
}

/** Keep session identity when editing the first/second schedule of the same day. */
export function associateSeriesSlots(slots: ScheduleSlot[], history: Reservation[], source: Reservation): ScheduleSlot[] {
  const result = slots.map(slot => ({ ...slot }));
  for (const date of new Set(slots.map(slot => slot.fecha))) {
    const known = history.filter(r => belongsToSeries(r, source) && r.fecha === date && r.estado !== 'eliminada')
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio) || a.espacio.localeCompare(b.espacio) || a.id.localeCompare(b.id));
    const indices = result.flatMap((r, index) => r.fecha === date ? [index] : []);
    const active=known.filter(r=>!r.reemplazadaPorReservaId && isReservationActiveForAvailability(r));
    const matchable=active.length===indices.length && active.length!==known.length ? active : known;
    if (matchable.length === indices.length) {
      indices.forEach((index, position) => { result[index].sourceId ||= matchable[position].id; });
    } else {
      const used = new Set(result.filter(r => r.fecha === date).map(r => r.sourceId).filter(Boolean));
      for (const index of indices) {
        if (result[index].sourceId) continue;
        const match = matchable.find(r => !used.has(r.id) && sameScheduleSlot(r, result[index]));
        if (match) { result[index].sourceId = match.id; used.add(match.id); }
      }
      for (const index of indices) {
        if (result[index].sourceId) continue;
        const match = matchable.find(r => !used.has(r.id));
        if (match) { result[index].sourceId = match.id; used.add(match.id); }
      }
    }
  }
  return result;
}
export function scopedScheduleSlots(slots: ScheduleSlot[], context: SeriesScope): ScheduleSlot[] {
  const byId = new Map(context.history.map(r => [r.id, r]));
  return associateSeriesSlots(slots, context.history, context.source).filter(slot => {
    if (!isDateInSeriesScope(slot.fecha, context)) return false;
    const original = slot.sourceId ? byId.get(slot.sourceId) : undefined;
    if (original && (original.reemplazadaPorReservaId || !isReservationActiveForAvailability(original))) return false;
    if (context.scope === 'selected' && (!slot.sourceId || !context.selectedIds?.has(slot.sourceId))) return false;
    const day = context.history.filter(r => belongsToSeries(r, context.source) && r.fecha === slot.fecha);
    if (day.some(r => r.reemplazadaPorReservaId) && !day.some(r => !r.reemplazadaPorReservaId && isReservationActiveForAvailability(r))) return false;
    return true;
  });
}

export function schedulesFromReservations(rows: Reservation[]) {
  const dates: Record<string, CustomScheduleSlot> = {};
  const days: Record<number, CustomScheduleSlot> = {};
  let variableDates = false;
  for (const date of [...new Set(rows.map(r => r.fecha))].sort()) {
    const sessions = rows.filter(r => r.fecha === date).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio) || a.espacio.localeCompare(b.espacio));
    const [first, second] = sessions;
    if (!first) continue;
    const slot: CustomScheduleSlot = { horaInicio: first.horaInicio, horaFin: first.horaFin, espacio: first.espacio,
      hasSecondSlot: Boolean(second), ...(second ? { secondHoraInicio: second.horaInicio, secondHoraFin: second.horaFin, secondEspacio: second.espacio } : {}) };
    dates[date] = slot;
    const weekday = getDayOfWeekFromDateString(date);
    if (days[weekday] && JSON.stringify(days[weekday]) !== JSON.stringify(slot)) variableDates = true;
    days[weekday] ||= slot;
  }
  return { dates, days, variableDates };
}

const editableFields = ['tipoActividad', 'descripcion', 'responsable', 'telefonoContacto', 'emailContacto', 'tipoPrestamo',
  'cantidadParticipantes', 'equipamientoSolicitado', 'importante', 'comentarios', 'rut', 'domicilio',
  'requiereCartaCompromiso', 'cartaCompromisoAdjunta', 'realizada'] as const;
export function applyChangedSeriesFields(row: Reservation, form: Partial<Reservation>, baseline: Partial<Reservation>): Reservation {
  const next = { ...row };
  for (const field of editableFields) if (JSON.stringify(form[field]) !== JSON.stringify(baseline[field])) {
    (next as any)[field] = form[field];
  }
  return next;
}
