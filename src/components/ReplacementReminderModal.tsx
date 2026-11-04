import { formatDisplayTitle } from '../utils/reservationVisuals';
import { useEffect, useState } from 'react';
import { BellRing, Phone, Mail, MessageCircle, UserCheck, CalendarClock } from 'lucide-react';
import type { Reservation } from '../types';
import { BaseModal } from './common/BaseModal';
import { formatDateDDMMYYYY, getChileLocalDateString } from '../utils/dateUtils';
import { fetchReservationById } from '../services/reservationService';
import { getPhoneContactActions } from '../utils/phoneUtils';
import { getDaysUntilReservation } from '../utils/replacementReminders';

interface Props {
  replacement: Reservation;
  original?: Reservation;
  pendingCount: number;
  onAcknowledge: () => void;
  onViewActivity: () => void;
}

export function buildReplacementWhatsAppHref(
  phone: string | undefined,
  role: 'original' | 'replacement',
  replacement: Reservation,
  source?: Reservation | null
): string | null {
  const action = getPhoneContactActions(phone);
  if (!action) return null;
  const dateLabel = formatDateDDMMYYYY(replacement.fecha);
  const spaceLabel = formatDisplayTitle(replacement.espacio);
  const origTitle = formatDisplayTitle(source?.descripcion || source?.tipoActividad || 'Actividad habitual');
  const replTitle = formatDisplayTitle(replacement.descripcion || replacement.tipoActividad);
  const reasonText = replacement.motivoReemplazo ? ` Motivo: ${replacement.motivoReemplazo}.` : '';

  const text = role === 'original'
    ? `Hola ${source?.responsable || ''}, te escribimos desde Agenda CCD para recordar que el día ${dateLabel} (${replacement.horaInicio}-${replacement.horaFin} en ${spaceLabel}) la actividad "${origTitle}" tiene programado un reemplazo puntual por "${replTitle}".${reasonText} Las demás fechas continúan normalmente.`
    : `Hola ${replacement.responsable || ''}, te escribimos desde Agenda CCD para confirmar tu actividad de reemplazo por un día "${replTitle}" programada para el ${dateLabel} de ${replacement.horaInicio} a ${replacement.horaFin} en ${spaceLabel} (en lugar de "${origTitle}").${reasonText}`;

  return `${action.waHref}?text=${encodeURIComponent(text.trim())}`;
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
  const daysUntil = getDaysUntilReservation(replacement.fecha, getChileLocalDateString());
  const sourcePhone = getPhoneContactActions(source?.telefonoContacto);
  const sourceWaHref = buildReplacementWhatsAppHref(source?.telefonoContacto, 'original', replacement, source);
  const replPhone = getPhoneContactActions(replacement.telefonoContacto);
  const replWaHref = buildReplacementWhatsAppHref(replacement.telefonoContacto, 'replacement', replacement, source);

  const daysBadgeLabel = daysUntil === null
    ? null
    : daysUntil <= 0
    ? 'Rige HOY'
    : daysUntil === 1
    ? 'Falta 1 día (mañana)'
    : `Faltan ${daysUntil} días`;

  return <BaseModal isOpen title="Recordatorio: cambio de actividad" icon={<BellRing className="w-5 h-5" />}
    onClose={onAcknowledge} closeOnBackdrop={false} maxWidth="lg"
    footer={<div className="flex justify-end gap-2">
      <button type="button" onClick={onViewActivity} className="px-4 py-2 rounded-xl border border-indigo-200 text-indigo-800 font-semibold hover:bg-indigo-50 transition cursor-pointer">Ver actividad</button>
      <button type="button" onClick={onAcknowledge} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition cursor-pointer">Entendido</button>
    </div>}>
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p>Recuerda que hay un reemplazo programado para el <strong>{formatDateDDMMYYYY(replacement.fecha)}</strong>.</p>
        {daysBadgeLabel && (
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
            daysUntil !== null && daysUntil <= 1
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : 'bg-amber-50 text-amber-800 border-amber-200'
          }`}>
            <CalendarClock className="w-3.5 h-3.5" />
            <span>{daysBadgeLabel}</span>
          </span>
        )}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-amber-900">Suspendida solo ese día</p>
          {source?.horaInicio && source?.horaFin && (
            <span className="text-xs font-mono text-amber-800 bg-amber-100/80 px-2 py-0.5 rounded-md">
              {source.horaInicio} a {source.horaFin}
            </span>
          )}
        </div>
        <p className="font-medium text-slate-900">{formatDisplayTitle(source?.descripcion || source?.tipoActividad || 'La sesión de la actividad recurrente')}</p>
        {source?.responsable && (
          <div className="pt-1.5 border-t border-amber-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-amber-950 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span><strong>Involucrado (cede espacio):</strong> {formatDisplayTitle(source.responsable)}</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {sourceWaHref && (
                <a
                  href={sourceWaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-2xs transition"
                  title="Enviar aviso pre-redactado por WhatsApp al responsable original"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>Avisar por WhatsApp</span>
                </a>
              )}
              {sourcePhone && (
                <a
                  href={sourcePhone.telHref}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[11px] transition"
                  title={`Llamar a ${source.telefonoContacto}`}
                >
                  <Phone className="w-3 h-3" />
                  <span>{source.telefonoContacto}</span>
                </a>
              )}
              {source.emailContacto && (
                <a
                  href={`mailto:${source.emailContacto}?subject=${encodeURIComponent(`Aviso de reemplazo por un día - ${formatDateDDMMYYYY(replacement.fecha)}`)}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-[11px] transition"
                  title={`Enviar correo a ${source.emailContacto}`}
                >
                  <Mail className="w-3 h-3" />
                  <span>Correo</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 space-y-2">
        <p className="font-semibold text-indigo-900">Actividad que se realizará</p>
        <p className="font-medium text-slate-900">{formatDisplayTitle(replacement.descripcion || replacement.tipoActividad)}</p>
        <p className="text-indigo-950">{replacement.horaInicio}–{replacement.horaFin}{replacement.terminaDiaSiguiente ? ' (hasta el día siguiente)' : ''} · {formatDisplayTitle(replacement.espacio)}</p>
        {replacement.responsable && (
          <div className="pt-1.5 border-t border-indigo-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-indigo-950 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
              <span><strong>Involucrado (ingresa ese día):</strong> {formatDisplayTitle(replacement.responsable)}</span>
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {replWaHref && (
                <a
                  href={replWaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-2xs transition"
                  title="Confirmar por WhatsApp con el responsable de la actividad de reemplazo"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>Confirmar por WhatsApp</span>
                </a>
              )}
              {replPhone && (
                <a
                  href={replPhone.telHref}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-300 font-semibold text-[11px] transition"
                  title={`Llamar a ${replacement.telefonoContacto}`}
                >
                  <Phone className="w-3 h-3" />
                  <span>{replacement.telefonoContacto}</span>
                </a>
              )}
              {replacement.emailContacto && (
                <a
                  href={`mailto:${replacement.emailContacto}?subject=${encodeURIComponent(`Confirmación actividad de reemplazo - ${formatDateDDMMYYYY(replacement.fecha)}`)}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-300 font-semibold text-[11px] transition"
                  title={`Enviar correo a ${replacement.emailContacto}`}
                >
                  <Mail className="w-3 h-3" />
                  <span>Correo</span>
                </a>
              )}
            </div>
          </div>
        )}
      </div>

      <p><strong>Motivo:</strong> {replacement.motivoReemplazo || 'Sin motivo registrado'}</p>
      <p>Las demás fechas de la serie continúan normalmente.</p>
      {pendingCount > 1 && <p className="text-slate-500">Hay {pendingCount - 1} {pendingCount === 2 ? 'recordatorio adicional' : 'recordatorios adicionales'} pendientes.</p>}
    </div>
  </BaseModal>;
}
