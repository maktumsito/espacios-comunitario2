import type { DistributionRequest, DistributionSnapshot, RoomSetupType } from '../types';
import { SETUP_LABELS, detectDistributionCriteria, validateDistributionRequestInput } from '../utils/roomDistribution';
import { normalizeEquipmentName } from '../utils/equipmentAllocation';
import { normalizeSpace, timeToMinutes } from '../utils/conflictDetector';
import { ACTIVITY_TYPES } from '../data/spacesData';

const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const chipButtonClass = 'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100';

export function DistributionActivityEditor({ request, snapshot, index, canDuplicate, onChange, onDuplicate, onRemove }: {
  request: DistributionRequest;
  snapshot: DistributionSnapshot;
  index: number;
  canDuplicate?: boolean;
  onChange: (request: DistributionRequest) => void;
  onDuplicate?: () => void;
  onRemove: () => void;
}) {
  const update = (change: Partial<DistributionRequest>) => onChange({ ...request, ...change });
  const criteria = detectDistributionCriteria(request.descripcion);
  const prioritySpaces = request.prioritySpaces || [];

  const handleDescriptionChange = (descripcion: string) => {
    const nextCriteria = detectDistributionCriteria(descripcion);
    const shouldAutoSyncSetup = !request.source && request.montaje === criteria.setup;
    update({
      descripcion,
      ...(shouldAutoSyncSetup ? { montaje: nextCriteria.setup } : {}),
    });
  };

  const handleTimeChange = (field: 'startTime' | 'endTime', value: string) => {
    const nextStart = field === 'startTime' ? value : request.startTime;
    const nextEnd = field === 'endTime' ? value : request.endTime;
    const diff = timeToMinutes(nextEnd) - timeToMinutes(nextStart);
    update({
      [field]: value,
      ...(request.fixedTime && diff > 0 ? { durationMinutes: diff } : {}),
    });
  };

  const togglePrioritySpace = (spaceName: string) => {
    const exists = prioritySpaces.includes(spaceName);
    const nextPriority = exists
      ? prioritySpaces.filter(name => name !== spaceName)
      : [...prioritySpaces, spaceName];
    update({
      prioritySpaces: nextPriority,
      preferredSpace: nextPriority[0] || request.preferredSpace,
    });
  };

  const compatibleSpaces = snapshot.spaces.filter(
    space => space.capacity === undefined || space.capacity >= request.cantidadParticipantes
  );
  const matchingSpaces = compatibleSpaces.filter(space =>
    criteria.spacePattern?.test(normalizeEquipmentName(`${space.name} ${space.category} ${space.description}`))
  );
  const allowedList = request.allowedSpaces.length
    ? snapshot.spaces.filter(space => request.allowedSpaces.some(name => normalizeSpace(name) === normalizeSpace(space.name)))
    : snapshot.spaces;
  const allowedWithCapacity = allowedList.filter(
    space => space.capacity === undefined || space.capacity >= request.cantidadParticipantes
  );

  const validationIssue = validateDistributionRequestInput(request)
    || (!allowedList.length ? 'Las salas permitidas no existen en el catálogo.' : null)
    || (!allowedWithCapacity.length ? `Ninguna sala permitida tiene aforo para ${request.cantidadParticipantes} participantes.` : null);

  const knownResponsables = Array.from(
    new Set([
      'Equipo comunitario',
      ...snapshot.reservations.map(r => r.responsable?.trim()).filter((v): v is string => Boolean(v && v.length >= 2)),
    ])
  ).slice(0, 12);
  const datalistId = `responsables-list-${request.id}`;

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

  return <fieldset className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-4">
    <legend className="px-1 text-base font-semibold text-slate-900">{index + 1}. {request.source ? 'Reserva existente' : 'Actividad nueva'}</legend>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-slate-600">{request.source ? `Actual: ${request.source.espacio}, ${request.source.horaInicio}–${request.source.horaFin}. Solo se modifica esta ocurrencia.` : 'Completa los datos de la actividad antes de confirmar.'}</p>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ${validationIssue ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>
          {validationIssue ? validationIssue : `Lista · ${allowedWithCapacity.length} sala${allowedWithCapacity.length === 1 ? '' : 's'} compatible${allowedWithCapacity.length === 1 ? '' : 's'}`}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canDuplicate && onDuplicate && (
          <button type="button" className="min-h-11 px-2 text-blue-700 underline hover:text-blue-900" onClick={onDuplicate}>Duplicar</button>
        )}
        <button type="button" className="min-h-11 px-3 text-red-700 underline hover:text-red-900" onClick={onRemove}>Retirar actividad {index + 1}</button>
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="text-xs font-medium text-slate-700">Actividad o necesidad
        <textarea className={inputClass} rows={2} maxLength={2000} value={request.descripcion} placeholder="Taller de manualidades para 20 personas" onChange={event => handleDescriptionChange(event.target.value)} />
      </label>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700">Responsable
            <input list={datalistId} className={inputClass} value={request.responsable} maxLength={200} placeholder="Nombre o equipo solicitante" onChange={event => update({ responsable: event.target.value })} />
          </label>
          <datalist id={datalistId}>
            {knownResponsables.map(name => <option key={name} value={name} />)}
          </datalist>
          {!request.responsable.trim() && (
            <button type="button" className="mt-1 text-xs text-blue-700 underline hover:text-blue-900" onClick={() => update({ responsable: 'Equipo comunitario' })}>
              Asignar «Equipo comunitario»
            </button>
          )}
        </div>
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
        <select className={inputClass} value={request.fixedTime ? 'fixed' : 'flexible'} onChange={event => {
          const isFixed = event.target.value === 'fixed';
          const currentSpan = Math.max(15, timeToMinutes(request.endTime) - timeToMinutes(request.startTime));
          update({
            fixedTime: isFixed,
            durationMinutes: isFixed ? currentSpan : Math.min(request.durationMinutes || 60, currentSpan),
          });
        }}>
          <option value="fixed">Fijar inicio y término</option><option value="flexible">Buscar dentro de una franja</option>
        </select>
      </label>
      <label className="text-xs font-medium text-slate-700">{request.fixedTime ? 'Inicio fijo' : 'Desde'}
        <input type="time" min="08:30" max="22:00" className={inputClass} value={request.startTime} onChange={event => handleTimeChange('startTime', event.target.value)} />
      </label>
      <label className="text-xs font-medium text-slate-700">{request.fixedTime ? 'Término fijo' : 'Hasta'}
        <input type="time" min="08:30" max="22:00" className={inputClass} value={request.endTime} onChange={event => handleTimeChange('endTime', event.target.value)} />
      </label>
      {!request.fixedTime && <div className="space-y-2 sm:col-span-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <label className="text-xs font-medium text-slate-700">Duración en minutos
            <input type="number" min={1} max={810} step={1} className={inputClass} value={request.durationMinutes} onChange={event => update({ durationMinutes: Number(event.target.value) })} />
            <span className="block mt-1 text-slate-500">Se buscan inicios cada 15 minutos desde el comienzo de la franja.</span>
          </label>
          <div className="space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-600">Duración rápida:</span>
              {[45, 60, 90, 120].map(mins => (
                <button key={mins} type="button" className={`${chipButtonClass} ${request.durationMinutes === mins ? '!border-blue-600 !bg-blue-50 !text-blue-800' : ''}`} onClick={() => update({ durationMinutes: mins })}>
                  {mins} min
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-medium text-slate-600">Franja:</span>
              <button type="button" className={chipButtonClass} onClick={() => update({ startTime: '08:30', endTime: '13:30' })}>Mañana (08:30–13:30)</button>
              <button type="button" className={chipButtonClass} onClick={() => update({ startTime: '14:00', endTime: '19:00' })}>Tarde (14:00–19:00)</button>
              <button type="button" className={chipButtonClass} onClick={() => update({ startTime: '08:30', endTime: '21:00' })}>Jornada (08:30–21:00)</button>
            </div>
          </div>
        </div>
      </div>}
      <label className="text-xs font-medium text-slate-700">Montaje
        <select className={inputClass} value={request.montaje} onChange={event => update({ montaje: event.target.value as RoomSetupType })}>
          {Object.entries(SETUP_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span>Criterio detectado: <strong>{criteria.label}</strong> ({SETUP_LABELS[criteria.setup]})</span>
      {request.montaje !== criteria.setup && (
        <button className="min-h-11 text-blue-700 underline" type="button" onClick={() => update({ montaje: criteria.setup })}>Usar montaje sugerido</button>
      )}
      {matchingSpaces.length > 0 && (
        <span className="text-slate-500">Salas afines con aforo: {matchingSpaces.map(s => s.name).join(', ')}</span>
      )}
    </div>
    <fieldset className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-xs font-semibold text-slate-700">Salas permitidas ({request.allowedSpaces.length ? `${request.allowedSpaces.length} seleccionadas` : 'todas'})</legend>
        <div className="flex flex-wrap gap-1.5">
          {request.allowedSpaces.length > 0 && (
            <button type="button" className={chipButtonClass} onClick={() => update({ allowedSpaces: [] })}>Permitir todas</button>
          )}
          {matchingSpaces.length > 0 && (
            <button type="button" className={chipButtonClass} onClick={() => update({ allowedSpaces: matchingSpaces.map(s => s.name) })}>Solo salas afines ({matchingSpaces.length})</button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500">Sin selección se consideran todas las salas con aforo suficiente. Marca una sola para fijar la sala.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
        {snapshot.spaces.map(space => {
          const insufficient = space.capacity !== undefined && space.capacity < request.cantidadParticipantes;
          const checked = request.allowedSpaces.includes(space.name);
          const priorityRank = prioritySpaces.indexOf(space.name);
          return <div key={space.id} className={`flex min-h-11 items-center justify-between gap-2 text-xs ${insufficient ? 'text-slate-400' : 'text-slate-800'}`}>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-4 w-4" checked={checked} onChange={event => update({ allowedSpaces: event.target.checked ? [...request.allowedSpaces, space.name] : request.allowedSpaces.filter(name => name !== space.name) })} />
              <span>{space.name}</span>
              <span className={insufficient ? 'text-amber-700' : 'text-slate-500'}>
                ({space.capacity === undefined ? 'aforo sin registrar' : `${space.capacity} pers.`})
              </span>
            </label>
            <button
              type="button"
              onClick={() => togglePrioritySpace(space.name)}
              title="Definir orden de prioridad de esta sala"
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold border ${priorityRank >= 0 ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'}`}
            >
              {priorityRank >= 0 ? `${priorityRank + 1}°` : 'Orden'}
            </button>
          </div>;
        })}
      </div>
      {prioritySpaces.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/60 p-2 text-xs text-blue-900">
          <span className="font-semibold">Orden de prioridad:</span>
          {prioritySpaces.map((name, idx) => (
            <span key={name} className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 font-medium border border-blue-200">
              {idx + 1}° {name}
            </span>
          ))}
          <button type="button" className="underline ml-auto text-blue-800" onClick={() => update({ prioritySpaces: [] })}>Limpiar orden</button>
        </div>
      )}
      <label className="block max-w-md text-xs font-medium text-slate-700">Sala preferida (opcional)
        <select className={inputClass} value={request.preferredSpace || ''} onChange={event => update({ preferredSpace: event.target.value || undefined })}>
          <option value="">Sin preferencia</option>
          {snapshot.spaces.map(space => {
            const insufficient = space.capacity !== undefined && space.capacity < request.cantidadParticipantes;
            return <option key={space.id} value={space.name}>{space.name}{space.capacity !== undefined ? ` (${space.capacity} pers.${insufficient ? ' - aforo menor' : ''})` : ''}</option>;
          })}
        </select>
      </label>
    </fieldset>
    <details className="rounded-lg border border-slate-200 bg-white p-3">
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
