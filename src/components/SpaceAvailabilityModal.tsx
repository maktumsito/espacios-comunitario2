import { useEffect, useState } from 'react';
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import { Clock, RefreshCw } from 'lucide-react';
import { loadDistributionSnapshot } from '../services/distributionService';
import { formatDateDDMMYYYY, getChileLocalDateString } from '../utils/dateUtils';
import { getChileanHolidayInfo } from '../utils/holidayUtils';
import { getDailySpaceAvailability, isSpaceAvailabilityRangeValid, MAX_SPACE_AVAILABILITY_DAYS, type FreeSpaceSlot } from '../utils/spaceAvailability';
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

  return (
    <BaseModal isOpen onClose={onClose} title="Disponibilidad de espacios" maxWidth="3xl"
      icon={<Clock aria-hidden="true" className="h-5 w-5" />}>
      <div className="flex flex-wrap items-end gap-3">
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
          <RefreshCw aria-hidden="true" className="h-4 w-4" /> Consultar
        </button>
      </div>
      <p className="mt-3 text-sm text-slate-600">Tramos libres de 08:30 a 22:00. Puedes consultar hasta {MAX_SPACE_AVAILABILITY_DAYS} días, desde hoy.</p>
      {!validRange && <p role="status" className="mt-4 text-sm text-rose-700">Elige un rango válido, con término igual o posterior al inicio.</p>}
      {loading && <p role="status" className="mt-4 text-sm">Consultando todos los espacios…</p>}
      {result && 'error' in result && <p role="alert" className="mt-4 text-sm text-rose-700">{result.error}</p>}
      {result && 'days' in result && !hasSpaces && <p className="mt-4 text-sm">No hay espacios activos.</p>}
      {result && 'days' in result && hasSpaces && result.days.map(({ date, rooms }) => {
        const holiday = getChileanHolidayInfo(date);
        const headingId = `space-availability-day-${date}`;
        return <section key={date} aria-labelledby={headingId} className="mt-5">
          <h4 id={headingId} className="text-sm font-bold text-slate-900">{formatDateDDMMYYYY(date)}</h4>
          {holiday && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Feriado de {holiday.name}. Las reservas requieren autorización especial.
          </p>}
          <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200">
            {rooms.map(({ space, slots }) => (
              <li key={space.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-center">
                <h5 className="text-sm font-semibold text-slate-900">{space.name}</h5>
                {slots.length === 0 ? <p className="text-sm text-slate-500">Sin tramos disponibles</p> : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map(slot => {
                      const label = `${slot.startTime}–${slot.endTime}`;
                      return onReserve ? (
                        <button key={slot.startTime} type="button" aria-label={`Reservar ${space.name} de ${label}`} aria-describedby={headingId}
                          onClick={() => onReserve({ date, space: space.name, ...slot })}
                          className="min-h-11 rounded-lg bg-emerald-50 px-3 text-sm font-semibold tabular-nums text-emerald-900 hover:bg-emerald-100">
                          {label}
                        </button>
                      ) : <span key={slot.startTime} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold tabular-nums text-emerald-900">{label}</span>;
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>;
      })}
    </BaseModal>
  );
}
