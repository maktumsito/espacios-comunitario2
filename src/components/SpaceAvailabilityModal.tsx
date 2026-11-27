import { useEffect, useMemo, useState } from 'react';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Clock, Printer, RefreshCw, Users, Sparkles } from 'lucide-react';
import { loadDistributionSnapshot } from '../services/distributionService';
import { formatDateDDMMYYYY, getChileLocalDateString } from '../utils/dateUtils';
import { getChileanHolidayInfo } from '../utils/holidayUtils';
import { timeToMinutes } from '../utils/conflictDetector';
import { formatDurationCompact, getDailySpaceAvailability, isSpaceAvailabilityRangeValid, MAX_SPACE_AVAILABILITY_DAYS, type FreeSpaceSlot } from '../utils/spaceAvailability';
import { BaseModal } from './common/BaseModal';
import { CalendarDateInput } from './common/CalendarDateInput';

interface SpaceAvailabilityModalProps {
  initialDate: string;
  onClose: () => void;
  onReserve?: (params: FreeSpaceSlot & { date: string; space: string }) => void;
}

type DateRange = { start: string; end: string };
type AvailabilityDay = { date: string; rooms: ReturnType<typeof getDailySpaceAvailability> };
type AvailabilityResult = { days: AvailabilityDay[] } | { error: string };

export function SpaceAvailabilityModal({ initialDate, onClose, onReserve }: SpaceAvailabilityModalProps) {
  const today = getChileLocalDateString();
  const firstDate = initialDate >= today ? initialDate : today;
  const [range, setRange] = useState<DateRange>(() => ({ start: firstDate, end: firstDate }));
  const [request, setRequest] = useState<DateRange | null>(range);
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [minDurationMin, setMinDurationMin] = useState<number>(0);
  const [timeBand, setTimeBand] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [minCapacity, setMinCapacity] = useState<number>(0);

  useEffect(() => {
    if (!request) return;
    const { start, end } = request;
    const controller = new AbortController();
    loadDistributionSnapshot(start, controller.signal, end === start ? undefined : end)
      .then(snapshot => {
        if (controller.signal.aborted) return;
        const days = eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).map(day => {
          const date = format(day, 'yyyy-MM-dd');
          return { date, rooms: getDailySpaceAvailability({ ...snapshot, fecha: date }) };
        });
        setResult({ days });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ error: 'No se pudo confirmar la disponibilidad. Vuelve a consultar.' });
      });
    return () => controller.abort();
  }, [request]);

  const changeRange = (next: DateRange) => {
    setRange(next);
    setRequest(null);
    setResult(null);
  };
  const validRange = range.start >= today && isSpaceAvailabilityRangeValid(range.start, range.end);
  const loading = Boolean(request && !result);
  const hasSpaces = result && 'days' in result && result.days.some(day => day.rooms.length > 0);

  const availableCategories = useMemo(() => {
    if (!result || !('days' in result)) return [];
    const cats = new Set<string>();
    result.days.forEach(day => day.rooms.forEach(r => { if (r.space.category) cats.add(r.space.category); }));
    return [...cats];
  }, [result]);

  const slotMatchesBand = (slot: FreeSpaceSlot) => {
    if (timeBand === 'all') return true;
    const s = timeToMinutes(slot.startTime);
    const e = timeToMinutes(slot.endTime);
    if (timeBand === 'morning') return s < 13 * 60 && e > 8 * 60 + 30;
    if (timeBand === 'afternoon') return s < 18 * 60 && e > 13 * 60;
    return e > 18 * 60;
  };

  const getSlotDuration = (slot: FreeSpaceSlot) =>
    Math.max(0, timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime));

  const hasClientFilters = minDurationMin > 0 || timeBand !== 'all' || selectedCategory !== 'ALL' || minCapacity > 0;

  return (
    <BaseModal isOpen onClose={onClose} title="Disponibilidad de espacios" maxWidth="3xl"
      id="space-availability-dialog" containerClassName="space-availability-paper"
      bodyClassName="flex-1 overflow-y-auto p-5 text-slate-700 space-availability-body"
      icon={<Clock aria-hidden="true" className="h-5 w-5" />}>
      <div className="no-print flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="space-availability-start" className="mb-1 block text-sm font-semibold">Desde</label>
          <CalendarDateInput id="space-availability-start" value={range.start} min={today}
            onValueChange={start => changeRange({ start, end: start && range.start === range.end ? start : range.end })}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" />
        </div>
        <div>
          <label htmlFor="space-availability-end" className="mb-1 block text-sm font-semibold">Hasta</label>
          <CalendarDateInput id="space-availability-end" value={range.end} min={today}
            onValueChange={end => changeRange({ ...range, end })}
            className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm" />
        </div>
        <button type="button" disabled={!validRange || loading}
          onClick={() => { setResult(null); setRequest({ ...range }); }}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw aria-hidden="true" className="h-4 w-4" /> Consultar disponibilidad
        </button>
        <button type="button" disabled={!result || !('days' in result)} onClick={() => window.print()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          <Printer aria-hidden="true" className="h-4 w-4" /> Imprimir
        </button>
      </div>
      <p className="no-print mt-3 text-sm text-slate-600">Tramos libres de 08:30 a 22:00. Puedes consultar hasta {MAX_SPACE_AVAILABILITY_DAYS} días, desde hoy.</p>
      {hasSpaces && (
        <div className="no-print mt-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              <span>Filtrar resultados al instante</span>
            </span>
            {hasClientFilters && (
              <button
                type="button"
                onClick={() => { setMinDurationMin(0); setTimeBand('all'); setSelectedCategory('ALL'); setMinCapacity(0); }}
                className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
              >
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              {([[0, 'Cualquier duración'], [60, '≥ 1h'], [120, '≥ 2h'], [180, '≥ 3h']] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMinDurationMin(val)}
                  className={`rounded-md px-2 py-1 font-semibold transition cursor-pointer ${
                    minDurationMin === val ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              {([['all', 'Todo el día'], ['morning', 'Mañana'], ['afternoon', 'Tarde'], ['evening', 'Vespertino']] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTimeBand(val)}
                  className={`rounded-md px-2 py-1 font-semibold transition cursor-pointer ${
                    timeBand === val ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            {availableCategories.length > 1 && (
              <select
                aria-label="Filtrar por categoría de espacio"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">Todas las categorías</option>
                {availableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            )}
            <select
              aria-label="Filtrar por aforo mínimo"
              value={minCapacity}
              onChange={e => setMinCapacity(Number(e.target.value))}
              className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700"
            >
              <option value={0}>Cualquier aforo</option>
              <option value={15}>15+ personas</option>
              <option value={30}>30+ personas</option>
              <option value={60}>60+ personas</option>
            </select>
          </div>
        </div>
      )}
      {request && result && 'days' in result && (
        <div className="hidden print:block">
          <h1 className="text-xl font-bold">Disponibilidad de espacios</h1>
          <p className="mt-1 text-sm">
            {request.start === request.end ? formatDateDDMMYYYY(request.start) : `${formatDateDDMMYYYY(request.start)} al ${formatDateDDMMYYYY(request.end)}`}
            {' · Horario regular de 08:30 a 22:00'}
          </p>
        </div>
      )}
      {!validRange && <p role="status" className="mt-4 text-sm text-rose-700">Elige un rango válido, con término igual o posterior al inicio.</p>}
      {loading && <p role="status" className="mt-4 text-sm">Consultando todos los espacios…</p>}
      {result && 'error' in result && <p role="alert" className="mt-4 text-sm text-rose-700">{result.error}</p>}
      {result && 'days' in result && !hasSpaces && <p className="mt-4 text-sm">No hay espacios activos.</p>}
      {result && 'days' in result && hasSpaces && result.days.map(({ date, rooms }) => {
        const holiday = getChileanHolidayInfo(date);
        const headingId = `space-availability-day-${date}`;
        const weekday = format(parseISO(date), 'EEEE', { locale: es });
        const dayLabel = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatDateDDMMYYYY(date)}`;
        return <section key={date} aria-labelledby={headingId} className="mt-5">
          <h4 id={headingId} className="text-sm font-bold text-slate-900 print:break-after-avoid">{dayLabel}</h4>
          {holiday && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 print:break-after-avoid">
            Feriado de {holiday.name}. Las reservas requieren autorización especial.
          </p>}
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">
            {rooms
              .filter(({ space }) =>
                (selectedCategory === 'ALL' || space.category === selectedCategory) &&
                (minCapacity === 0 || (space.capacity ?? 0) >= minCapacity)
              )
              .map(({ space, slots }) => {
                const visibleSlots = slots.filter(slot => getSlotDuration(slot) >= minDurationMin && slotMatchesBand(slot));
                return (
              <li key={space.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center print:break-inside-avoid print:grid-cols-[1fr_2fr] print:px-2 print:py-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 print:hidden" style={{ backgroundColor: space.color || '#64748b' }} aria-hidden="true" />
                    <h5 className="text-sm font-semibold text-slate-900 truncate">{space.name}</h5>
                  </div>
                  {(space.capacity || space.category) && (
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 print:hidden">
                      {space.category && <span>{space.category}</span>}
                      {space.capacity && (
                        <span className="inline-flex items-center gap-0.5 font-medium">
                          <Users className="h-3 w-3" aria-hidden="true" />
                          {space.capacity}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {visibleSlots.length === 0 ? <p className="text-sm text-slate-500">{hasClientFilters ? 'Sin tramos que coincidan con el filtro' : 'Sin tramos disponibles'}</p> : (
                  <div className="flex flex-wrap gap-2">
                    {visibleSlots.map(slot => {
                      const label = `${slot.startTime}–${slot.endTime}`;
                      const dur = getSlotDuration(slot);
                      return onReserve ? (
                        <button key={slot.startTime} type="button" aria-label={`Reservar ${space.name} de ${label}`} aria-describedby={headingId}
                          onClick={() => onReserve({ date, space: space.name, ...slot })}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50 px-3 text-sm font-semibold tabular-nums text-emerald-900 hover:bg-emerald-100 transition print:min-h-0 print:border-0 print:bg-transparent print:px-0 print:text-slate-900">
                          <span>{label}</span>
                          <span className="text-xs font-medium text-emerald-700 print:hidden">· {formatDurationCompact(dur)}</span>
                        </button>
                      ) : <span key={slot.startTime} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-sm font-semibold tabular-nums text-emerald-900 print:border-0 print:bg-transparent print:p-0 print:text-slate-900"><span>{label}</span><span className="text-xs font-medium text-emerald-700 print:hidden">· {formatDurationCompact(dur)}</span></span>;
                    })}
                  </div>
                )}
              </li>
                );
              })}
          </ul>
        </section>;
      })}
    </BaseModal>
  );
}
