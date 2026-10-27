import type { DistributionRequest, DistributionSnapshot, RoomSetupType } from '../types';
import { SETUP_LABELS, detectDistributionCriteria } from '../utils/roomDistribution';
import { normalizeEquipmentName } from '../utils/equipmentAllocation';
import { ACTIVITY_TYPES } from '../data/spacesData';

const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
export function DistributionActivityEditor({ request, snapshot, index, onChange, onRemove }: {
  request: DistributionRequest; snapshot: DistributionSnapshot; index: number;
  onChange: (request: DistributionRequest) => void; onRemove: () => void;
}) {
  const update = (change: Partial<DistributionRequest>) => onChange({ ...request, ...change });
  const criteria = detectDistributionCriteria(request.descripcion);
  function suggestResources() {
    const equipment = [...request.equipment];
    const add = (pattern: RegExp, quantity: number) => {
      const item = snapshot.equipment.find(item => pattern.test(normalizeEquipmentName(item.name)));
      if (item && !equipment.some(r => r.equipmentId === item.id)) equipment.push({ equipmentId: item.id, equipmentName: item.name, quantity });
    };
    if (request.montaje !== 'despejado') add(/silla/, request.cantidadParticipantes);
    if (request.montaje === 'auditorio' || request.montaje === 'aula') add(/proyector/, 1);
    update({ equipment });
  }
  return <fieldset className="min-w-0 border-t border-slate-200 py-5 space-y-4">
    <legend className="pt-4 text-base font-semibold text-slate-900">{index + 1}. {request.source ? 'Reserva existente' : 'Actividad nueva'}</legend>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <p className="text-slate-500">{request.source ? `Actual: ${request.source.espacio}, ${request.source.horaInicio}–${request.source.horaFin}. Solo se modifica esta ocurrencia.` : 'Completa los datos de la actividad antes de confirmar.'}</p>
      <button type="button" className="min-h-11 px-3 text-red-700 underline hover:text-red-900" onClick={onRemove}>Retirar actividad {index + 1}</button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="text-xs font-medium text-slate-700">Actividad o necesidad
        <textarea className={inputClass} rows={2} maxLength={2000} value={request.descripcion} placeholder="Taller de manualidades para 20 personas" onChange={event => update({ descripcion: event.target.value })} />
      </label>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-slate-700">Responsable
          <input className={inputClass} value={request.responsable} maxLength={200} onChange={event => update({ responsable: event.target.value })} />
        </label>
        <label className="block text-xs font-medium text-slate-700">Tipo de actividad
          <select className={inputClass} value={request.tipoActividad} onChange={event => update({ tipoActividad: event.target.value })}>
            {[...new Set([request.tipoActividad, ...ACTIVITY_TYPES])].map(type => <option key={type}>{type}</option>)}
          </select>
        </label>
      </div>
      <label className="text-xs font-medium text-slate-700">Participantes
        <input type="number" min={1} step={1} className={inputClass} value={request.cantidadParticipantes} onChange={event => update({ cantidadParticipantes: Number(event.target.value) })} />
      </label>
      <label className="text-xs font-medium text-slate-700">Horario
        <select className={inputClass} value={request.fixedTime ? 'fixed' : 'flexible'} onChange={event => update({ fixedTime: event.target.value === 'fixed' })}>
          <option value="fixed">Fijar inicio y término</option><option value="flexible">Buscar dentro de una franja</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-700">{request.fixedTime ? 'Inicio fijo' : 'Desde'}
        <input type="time" min="08:30" max="22:00" className={inputClass} value={request.startTime} onChange={event => update({ startTime: event.target.value })} />
      </label>
      <label className="text-xs font-medium text-slate-700">{request.fixedTime ? 'Término fijo' : 'Hasta'}
        <input type="time" min="08:30" max="22:00" className={inputClass} value={request.endTime} onChange={event => update({ endTime: event.target.value })} />
      </label>
      {!request.fixedTime && <label className="text-xs font-medium text-slate-700">Duración en minutos
        <input type="number" min={1} max={810} step={1} className={inputClass} value={request.durationMinutes} onChange={event => update({ durationMinutes: Number(event.target.value) })} />
        <span className="block mt-1 text-slate-500">Se buscan inicios cada 15 minutos desde el comienzo de la franja.</span>
      </label>}
      <label className="text-xs font-medium text-slate-700">Montaje
        <select className={inputClass} value={request.montaje} onChange={event => update({ montaje: event.target.value as RoomSetupType })}>
          {Object.entries(SETUP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span>Criterio detectado: <strong>{criteria.label}</strong></span>
      <button className="min-h-11 text-blue-700 underline" type="button" onClick={() => update({ montaje: criteria.setup })}>Usar montaje sugerido</button>
      <span>Corrige el criterio con las salas permitidas y el montaje.</span>
    </div>
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold text-slate-700">Salas permitidas</legend>
      <p className="text-xs text-slate-500">Sin selección se consideran todas. Marca una sola para fijar la sala.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4">
        {snapshot.spaces.map(space => <label key={space.id} className="flex min-h-11 items-center gap-2 text-xs">
          <input type="checkbox" className="h-4 w-4" checked={request.allowedSpaces.includes(space.name)} onChange={event => update({ allowedSpaces: event.target.checked ? [...request.allowedSpaces, space.name] : request.allowedSpaces.filter(name => name !== space.name) })} />
          {space.name} <span className="text-slate-500">({space.capacity ?? 'aforo sin registrar'})</span>
        </label>)}
      </div>
      <label className="block max-w-md text-xs font-medium text-slate-700">Sala preferida (opcional)
        <select className={inputClass} value={request.preferredSpace || ''} onChange={event => update({ preferredSpace: event.target.value || undefined })}>
          <option value="">Sin preferencia</option>{snapshot.spaces.map(space => <option key={space.id} value={space.name}>{space.name}</option>)}
        </select>
      </label>
    </fieldset>
    <details className="rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer py-1 text-sm font-semibold text-slate-800">Equipamiento requerido ({request.equipment.length})</summary>
      <p className="mt-3 text-xs text-slate-500">Las cantidades se comparten con todas las actividades del centro. Confirma en terreno el mobiliario fijo; aquí solo se cuenta el inventario registrado.</p>
      <button type="button" className="min-h-11 text-xs text-blue-700 underline" onClick={suggestResources}>Sugerir sillas y recursos de presentación</button>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        {snapshot.equipment.map(item => {
          const selected = request.equipment.find(eq => eq.equipmentId === item.id);
          return <label key={item.id} className="text-xs font-medium text-slate-700">{item.name} <span className="text-slate-500">(total: {item.totalQuantity})</span>
            <input type="number" className={inputClass} min={0} step={1} value={selected?.quantity || 0} onChange={event => {
              const quantity = Number(event.target.value);
              update({ equipment: [...request.equipment.filter(eq => eq.equipmentId !== item.id), ...(quantity > 0 ? [{ equipmentId: item.id, equipmentName: item.name, quantity }] : [])] });
            }} />
          </label>;
        })}
      </div>
      {request.equipment.filter(eq => !snapshot.equipment.some(item => item.id === eq.equipmentId)).map(eq => <div key={eq.equipmentId} className="mt-2 text-xs text-red-700">
        {eq.equipmentName}: recurso fuera del catálogo. <button type="button" className="underline min-h-11" onClick={() => update({ equipment: request.equipment.filter(item => item.equipmentId !== eq.equipmentId) })}>Retirar recurso</button>
      </div>)}
    </details>
  </fieldset>;
}
