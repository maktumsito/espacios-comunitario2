import React, { useRef, useState } from 'react';
import type { Reservation } from '../types';
import type { RecurringMoveScope } from '../utils/recurringEdits';
import { BaseModal } from './common/BaseModal';
import { formatDateDDMMYYYY, getChileLocalDateString } from '../utils/dateUtils';

interface Props {
  original: Reservation;
  target: Reservation;
  onCancel: () => void;
  onConfirm: (scope: RecurringMoveScope) => Promise<boolean>;
}
export function RecurringMoveScopeModal({ original, target, onCancel, onConfirm }: Props) {
  const isPast = original.fecha < getChileLocalDateString();
  const [scope, setScope] = useState<RecurringMoveScope>(isPast ? 'future' : 'single');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      if (!await onConfirm(scope)) setError('No se aplicó el movimiento. Revisa el aviso de disponibilidad o permisos e intenta nuevamente.');
    } catch (err: any) { setError(err?.message || 'No se pudo guardar el movimiento.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <BaseModal isOpen title="Mover actividad recurrente" maxWidth="lg" closeOnBackdrop={false}
    onClose={() => { if (!inFlight.current) onCancel(); }}
    footer={<div className="flex gap-2">
      <button type="button" disabled={busy} onClick={onCancel} className="px-4 py-2 rounded-xl border border-slate-300">Cancelar</button>
      <button type="button" disabled={busy} onClick={() => void confirm()} className="px-4 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Confirmar movimiento'}</button>
    </div>}>
    <div className="space-y-4 text-sm">
      <p><strong>{original.descripcion || original.tipoActividad}</strong> · {formatDateDDMMYYYY(original.fecha)}</p>
      <p>{original.espacio} ({original.horaInicio}–{original.horaFin}) → <strong>{target.espacio} ({target.horaInicio}–{target.horaFin})</strong></p>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="font-semibold mb-2">¿A qué reservas aplicar el movimiento?</legend>
        {([
          ['single', 'Solo esta reserva', 'Se modifica únicamente la sesión arrastrada.'],
          ['series', 'Serie desde esta fecha', 'Se modifican las sesiones desde la fecha seleccionada en adelante.'],
          ['future', 'Desde esta en adelante', `Se modifican las sesiones desde el ${formatDateDDMMYYYY(original.fecha)}, sin incluir fechas pasadas.`],
        ] as const).map(([value, label, description]) => <label key={value} className="flex items-start gap-3 rounded-xl border border-indigo-200 p-3 cursor-pointer">
          <input type="radio" name="move-scope" value={value} disabled={value === 'single' && isPast} checked={scope === value} onChange={() => setScope(value)} className="mt-1" />
          <span><strong className="block">{label}</strong><span className="text-slate-600">{description}</span></span>
        </label>)}
      </fieldset>
      {isPast && <p>La sesión arrastrada ya pasó y se conservará sin cambios.</p>}
      <p className="text-slate-600">Las sesiones pasadas y las suspensiones por reemplazo se mantienen intactas al mover la serie. Si hay horarios distintos, se desplazan por la misma diferencia de tiempo.</p>
      {error && <p role="alert" className="text-rose-700">{error}</p>}
    </div>
  </BaseModal>;
}
