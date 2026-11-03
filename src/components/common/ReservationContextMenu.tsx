import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  Edit2,
  RotateCcw,
  Copy,
  CheckCircle2,
  Circle,
  Star,
  Trash2,
  MessageCircle,
  Phone,
  Mail,
  ArrowUpRight,
  Clock,
  MapPin,
  User
} from 'lucide-react';
import { Reservation, SpaceRating } from '../../types';
import {
  AuthUser,
  userCanCreateReservations,
  userCanEditReservations,
  userCanDeleteReservations
} from '../../services/authService';
import { canReplaceOccurrence } from '../../utils/reservationReplacement';
import { formatDisplayTitle } from '../../utils/reservationVisuals';
import { formatDateDDMMYYYY } from '../../utils/dateUtils';
import { getPhoneContactActions } from '../../utils/phoneUtils';

export interface ReservationContextMenuProps {
  reservation: Reservation;
  x: number;
  y: number;
  currentUser?: AuthUser | null;
  existingRating?: SpaceRating | null;
  onClose: () => void;
  onViewDetails: (reservation: Reservation) => void;
  onEdit?: (reservation: Reservation) => void;
  onReplace?: (reservation: Reservation) => void;
  onDuplicate?: (reservation: Reservation) => void;
  onToggleRealizada?: (reservation: Reservation) => void;
  onOpenRating?: (reservation: Reservation, rating?: SpaceRating) => void;
  onViewRelated?: (relatedId: string) => void;
  onDelete?: (id: string, isSeries?: boolean, seriesId?: string) => void;
  onRequestDelete?: (reservation: Reservation) => void;
}

export const ReservationContextMenu: React.FC<ReservationContextMenuProps> = ({
  reservation,
  x,
  y,
  currentUser,
  existingRating,
  onClose,
  onViewDetails,
  onEdit,
  onReplace,
  onDuplicate,
  onToggleRealizada,
  onOpenRating,
  onViewRelated,
  onDelete,
  onRequestDelete
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: x, top: y });

  const canCreate = userCanCreateReservations(currentUser);
  const canEdit = userCanEditReservations(currentUser);
  const canDelete = userCanDeleteReservations(currentUser);
  const isCancelled = reservation.estado === 'cancelada';
  const isRealizada = reservation.realizada === 'Sí';
  const canReplace = canCreate && canEdit && canReplaceOccurrence(reservation);
  const relatedId = reservation.reemplazadaPorReservaId || reservation.reemplazaReservaId;
  const phoneActions = getPhoneContactActions(reservation.telefonoContacto);
  const displayTitle = formatDisplayTitle(reservation.descripcion || reservation.tipoActividad || 'Reserva');

  // Clamp menu inside viewport
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const padding = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let nextLeft = x;
    let nextTop = y;

    if (nextLeft + rect.width > vw - padding) {
      nextLeft = Math.max(padding, vw - rect.width - padding);
    }
    if (nextTop + rect.height > vh - padding) {
      nextTop = Math.max(padding, vh - rect.height - padding);
    }

    setCoords({ left: nextLeft, top: nextTop });
  }, [x, y, reservation.id]);

  // Focus first item on mount and handle outside click, Escape, scroll, and arrow keys
  useEffect(() => {
    const menuEl = menuRef.current;
    const firstBtn = menuEl?.querySelector<HTMLElement>('[role="menuitem"]');
    firstBtn?.focus({ preventScroll: true });

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || []);
        if (items.length === 0) return;
        e.preventDefault();
        const currentIndex = items.indexOf(document.activeElement as HTMLElement);
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = currentIndex === -1
          ? 0
          : (currentIndex + delta + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [onClose]);

  const runAction = (action: () => void) => {
    onClose();
    action();
  };

  const menuContent = (
    <div
      ref={menuRef}
      id="reservation-context-menu"
      role="menu"
      aria-label={`Opciones de reserva: ${displayTitle}`}
      style={{
        position: 'fixed',
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        zIndex: 120
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="w-72 rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-900/5 overflow-hidden animate-in fade-in zoom-in-95 duration-100 select-none"
    >
      {/* Compact Header Summary */}
      <div className="bg-slate-50/90 px-3.5 py-2.5 border-b border-slate-200/80 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-extrabold text-slate-900 truncate" title={displayTitle}>
            {displayTitle}
          </span>
          {isCancelled && (
            <span className="shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
              Cancelada
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1 font-mono font-semibold text-blue-700">
            <Clock className="w-3 h-3 shrink-0" />
            {reservation.horaInicio}–{reservation.horaFin}
          </span>
          <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
            <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
            {formatDisplayTitle(reservation.espacio)}
          </span>
        </div>
        {reservation.responsable && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 truncate">
              <User className="w-3 h-3 shrink-0 text-slate-400" />
              {formatDisplayTitle(reservation.responsable)}
            </span>
            <span className="font-mono text-[10px] text-slate-400 shrink-0">
              {formatDateDDMMYYYY(reservation.fecha)}
            </span>
          </div>
        )}
      </div>

      {/* Menu Actions */}
      <div className="p-1.5 space-y-0.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => runAction(() => onViewDetails(reservation))}
          className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-800 focus:bg-blue-50 focus:text-blue-800 focus:outline-none transition cursor-pointer"
        >
          <Eye className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Ver detalles completos</span>
        </button>

        {canEdit && onEdit && (
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onEdit(reservation))}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-800 focus:bg-blue-50 focus:text-blue-800 focus:outline-none transition cursor-pointer"
          >
            <Edit2 className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Editar reserva</span>
          </button>
        )}

        {canReplace && onReplace && (
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onReplace(reservation))}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-amber-900 hover:bg-amber-50 focus:bg-amber-50 focus:outline-none transition cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Reemplazar solo este día</span>
          </button>
        )}

        {relatedId && onViewRelated && (
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onViewRelated(relatedId))}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-indigo-800 hover:bg-indigo-50 focus:bg-indigo-50 focus:outline-none transition cursor-pointer"
          >
            <ArrowUpRight className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              {reservation.reemplazadaPorReservaId ? 'Ver actividad de reemplazo' : 'Ver actividad original'}
            </span>
          </button>
        )}

        {canCreate && onDuplicate && (
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onDuplicate(reservation))}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none transition cursor-pointer"
          >
            <Copy className="w-4 h-4 text-slate-600 shrink-0" />
            <span>Duplicar reserva</span>
          </button>
        )}

        {canEdit && onToggleRealizada && !isCancelled && (
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onToggleRealizada(reservation))}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 focus:bg-emerald-50 focus:text-emerald-900 focus:outline-none transition cursor-pointer"
          >
            {isRealizada ? (
              <Circle className="w-4 h-4 text-slate-500 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{isRealizada ? 'Marcar como pendiente' : 'Marcar como realizada'}</span>
          </button>
        )}

        {onOpenRating && (
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onOpenRating(reservation, existingRating || undefined))}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-amber-50 hover:text-amber-900 focus:bg-amber-50 focus:text-amber-900 focus:outline-none transition cursor-pointer"
          >
            <Star className={`w-4 h-4 shrink-0 ${existingRating ? 'fill-amber-400 text-amber-500' : 'text-amber-500'}`} />
            <span>{existingRating ? `Ver calificación (${existingRating.puntajeGeneral} ★)` : 'Calificar uso de espacio'}</span>
          </button>
        )}

        {(phoneActions || reservation.emailContacto) && (
          <div className="my-1 border-t border-slate-100 pt-1 space-y-0.5">
            {phoneActions && (
              <>
                <a
                  role="menuitem"
                  href={`${phoneActions.waHref}?text=${encodeURIComponent(`Hola ${reservation.responsable || ''}, te escribimos desde Agenda CCD por la actividad "${displayTitle}" del ${formatDateDDMMYYYY(reservation.fecha)} (${reservation.horaInicio}-${reservation.horaFin} en ${formatDisplayTitle(reservation.espacio)}).`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onClose()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-emerald-800 hover:bg-emerald-50 focus:bg-emerald-50 focus:outline-none transition"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>WhatsApp al responsable</span>
                </a>
                <a
                  role="menuitem"
                  href={phoneActions.telHref}
                  onClick={() => onClose()}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none transition"
                >
                  <Phone className="w-4 h-4 text-slate-600 shrink-0" />
                  <span>Llamar ({reservation.telefonoContacto})</span>
                </a>
              </>
            )}
            {reservation.emailContacto && (
              <a
                role="menuitem"
                href={`mailto:${reservation.emailContacto}?subject=${encodeURIComponent(`Reserva ${displayTitle} - ${formatDateDDMMYYYY(reservation.fecha)}`)}`}
                onClick={() => onClose()}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none transition"
              >
                <Mail className="w-4 h-4 text-slate-600 shrink-0" />
                <span>Enviar correo</span>
              </a>
            )}
          </div>
        )}

        {(onDelete || onRequestDelete) && (
          <div className="my-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() =>
                runAction(() => {
                  const isSeries = Boolean(
                    reservation.actividadRecurrente === 'Sí' ||
                    reservation.recurrenteId ||
                    reservation.serieRecurrente
                  );
                  if (isSeries && canDelete) {
                    // Open detail or delete modal for series options
                    onDelete?.(reservation.id, true, reservation.recurrenteId || reservation.serieRecurrente);
                  } else if (canDelete && onDelete) {
                    onDelete(reservation.id, false);
                  } else if (onRequestDelete) {
                    onRequestDelete(reservation);
                  }
                })
              }
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50 focus:bg-rose-50 focus:outline-none transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{canDelete ? 'Eliminar reserva' : 'Solicitar eliminación'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(menuContent, document.body) : menuContent;
};
