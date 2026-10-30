import { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AdditionalSpaceSlot, SpaceInfo } from '../types';
import { formatMinutesToTime, timeToMinutes } from '../utils/conflictDetector';
import { validateTimeRange, checkSpaceCapacityWarning } from '../utils/validationUtils';
import { formatDisplayTitle } from '../utils/reservationVisuals';

interface Props {
  slots: AdditionalSpaceSlot[];
  onChange: (slots: AdditionalSpaceSlot[]) => void;
  availableSpaces: SpaceInfo[];
  baseSpace?: string;
  baseEnd?: string;
  participants?: number;
  allowOvernight?: boolean;
  context?: string;
}

export function AdditionalSpacesEditor({ slots, onChange, availableSpaces, baseSpace, baseEnd, participants, allowOvernight, context = 'esta actividad' }: Props) {
  const id = useId();
  const update = (index: number, field: keyof AdditionalSpaceSlot, value: string) =>
    onChange(slots.map((slot, position) => position === index ? { ...slot, [field]: value } : slot));
  const add = () => {
    const used = new Set([baseSpace, ...slots.map(slot => slot.espacio)]);
    const espacio = availableSpaces.find(space => !used.has(space.name))?.name || availableSpaces[0]?.name || '';
    const horaInicio = slots.at(-1)?.horaFin || baseEnd || '11:00';
    const horaFin = formatMinutesToTime(Math.min(1439, timeToMinutes(horaInicio) + 30));
    onChange([...slots, { espacio, horaInicio, horaFin }]);
  };
  return (
    <div className="space-y-3">
      {slots.map((slot, index) => {
        const timing = validateTimeRange(slot.horaInicio, slot.horaFin, Boolean(allowOvernight) && slot.horaFin <= slot.horaInicio);
        const capacity = checkSpaceCapacityWarning(slot.espacio, participants, availableSpaces);
        const prefix = `${id}-${index}`;
        return (
          <div key={index} className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-blue-900">{index + 2}° Espacio para {context}</span>
              <button type="button" onClick={() => onChange(slots.filter((_, position) => position !== index))} aria-label={`Quitar espacio ${index + 2} para ${context}`} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5" /> Quitar
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label htmlFor={`${prefix}-space`} className="text-xs font-semibold text-slate-700">Espacio {index + 2}
                <select id={`${prefix}-space`} value={slot.espacio} onChange={event => update(index, 'espacio', event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white p-2 text-xs text-slate-900">
                  <option value="">Selecciona un espacio</option>
                  {availableSpaces.map(space => <option key={space.id || space.name} value={space.name}>{formatDisplayTitle(space.name)}</option>)}
                </select>
              </label>
              <label htmlFor={`${prefix}-start`} className="text-xs font-semibold text-slate-700">Inicio del espacio {index + 2}
                <input id={`${prefix}-start`} type="time" value={slot.horaInicio} onChange={event => update(index, 'horaInicio', event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white p-2 text-xs text-slate-900" />
              </label>
              <label htmlFor={`${prefix}-end`} className="text-xs font-semibold text-slate-700">Término del espacio {index + 2}
                <input id={`${prefix}-end`} type="time" value={slot.horaFin} onChange={event => update(index, 'horaFin', event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white p-2 text-xs text-slate-900" />
              </label>
            </div>
            {!timing.isValid && <p role="alert" className="text-xs text-rose-700">Espacio {index + 2}: {timing.error}</p>}
            {capacity.hasWarning && <p className="text-xs text-amber-800">Aforo sugerido de {capacity.recommendedCapacity} personas; has indicado {capacity.requestedCount} participantes.</p>}
          </div>
        );
      })}
      <button type="button" onClick={add} aria-label={`Agregar otro espacio para ${context}`} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 cursor-pointer">
        <Plus className="h-4 w-4" /> Agregar otro espacio
      </button>
    </div>
  );
}
