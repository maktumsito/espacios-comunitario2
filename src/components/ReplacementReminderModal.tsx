import { formatDisplayTitle } from '../utils/reservationVisuals';
import React, { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import type { Reservation } from '../types';
import { BaseModal } from './common/BaseModal';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { fetchReservationById } from '../services/reservationService';

interface Props {
  replacement: Reservation;
  original?: Reservation;
  pendingCount: number;
  onAcknowledge: () => void;
  onViewActivity: () => void;
}

export function ReplacementReminderModal({ replacement, original, pendingCount, onAcknowledge, onViewActivity }: Props) {
  const [fetchedOriginal, setFetchedOriginal] = useState<Reservation | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFetchedOriginal(null);
    if (!original && replacement.reemplazaReservaId) {
      void fetchReservationById(replacement.reemplazaReservaId).then(row => {
        if (!cancelled) setFetchedOriginal(row);
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [original, replacement.reemplazaReservaId]);
  const source = original || fetchedOriginal;
  return <BaseModal isOpen title="Recordatorio: cambio de actividad" icon={<BellRing className="w-5 h-5" />}
    onClose={onAcknowledge} closeOnBackdrop={false} maxWidth="lg"
    footer={<div className="flex justify-end gap-2">
      <button type="button" onClick={onViewActivity} className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-800 font-semibold">Ver actividad</button>
      <button type="button" onClick={onAcknowledge} className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold">Entendido</button>
    </div>}>
    <div className="space-y-4 text-sm">
      <p>Recuerda que hay un reemplazo programado para el <strong>{formatDateDDMMYYYY(replacement.fecha)}</strong>.</p>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="font-semibold text-amber-900">Suspendida solo ese día</p>
        <p>{formatDisplayTitle(source?.descripcion || source?.tipoActividad || 'La sesión de la actividad recurrente')}</p>
      </div>
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <p className="font-semibold text-indigo-900">Actividad que se realizará</p>
        <p>{formatDisplayTitle(replacement.descripcion || replacement.tipoActividad)}</p>
        <p>{replacement.horaInicio}–{replacement.horaFin}{replacement.terminaDiaSiguiente ? ' (hasta el día siguiente)' : ''} · {formatDisplayTitle(replacement.espacio)}</p>
      </div>
      <p><strong>Motivo:</strong> {replacement.motivoReemplazo || 'Sin motivo registrado'}</p>
      <p>Las demás fechas de la serie continúan normalmente.</p>
      {pendingCount > 1 && <p className="text-slate-500">Hay {pendingCount - 1} {pendingCount === 2 ? 'recordatorio adicional' : 'recordatorios adicionales'} pendientes.</p>}
    </div>
  </BaseModal>;
}
