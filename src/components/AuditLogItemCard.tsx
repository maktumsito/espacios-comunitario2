import React from 'react';
import {
  Clock,
  User,
  CheckCircle2,
  Calendar,
  MapPin,
  Sparkles,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import { AuditChangeLogEntry } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { isDeletionAction } from '../utils/auditRestore';

interface AuditLogItemCardProps {
  entry: AuditChangeLogEntry;
  badge: {
    bg: string;
    icon: React.ReactNode;
    label: string;
  };
  isExpanded: boolean;
  onToggleExpand: () => void;
  canBeRestored: boolean;
  isRestoring: boolean;
  restoreDisabled?: boolean;
  onRestore: (entry: AuditChangeLogEntry) => void;
}

function formatTimestamp(isoStr: string) {
  try {
    const d = new Date(isoStr);
    return `${d.toLocaleDateString('es-CL')} ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  } catch {
    return isoStr;
  }
}

export const AuditLogItemCard: React.FC<AuditLogItemCardProps> = ({
  entry,
  badge,
  isExpanded,
  onToggleExpand,
  canBeRestored,
  isRestoring,
  restoreDisabled,
  onRestore
}) => {
  return (
    <div
      className={`p-4 rounded-2xl border transition shadow-2xs ${
        entry.isReverted
          ? 'bg-slate-50/70 border-slate-200 opacity-80'
          : isDeletionAction(entry.action)
          ? 'bg-gradient-to-r from-rose-50/40 via-white to-white border-rose-200 hover:border-rose-300'
          : entry.action === 'UPDATE'
          ? 'bg-gradient-to-r from-amber-50/40 via-white to-white border-amber-200 hover:border-amber-300'
          : 'bg-white border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        {/* Left Side: Badges, Description, Metadata */}
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`px-2.5 py-0.5 rounded-md text-[11px] font-extrabold border flex items-center space-x-1.5 shadow-2xs ${badge.bg}`}
            >
              {badge.icon}
              <span>{badge.label}</span>
            </span>

            <span className="text-[11px] text-slate-500 font-mono flex items-center space-x-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{formatTimestamp(entry.timestamp)}</span>
            </span>

            <span className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md flex items-center space-x-1">
              <User className="w-3 h-3 text-slate-500" />
              <span>
                {entry.user} ({entry.userRole || 'Usuario'})
              </span>
            </span>

            {entry.isReverted && (
              <span className="text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-md flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Restaurado</span>
              </span>
            )}
          </div>

          {/* Human readable description */}
          <p className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
            {entry.description}
          </p>

          {/* Reservation context details */}
          {(entry.reservaFecha || entry.reservaEspacio || entry.reservaHorario || entry.reservaResponsable) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">
              {entry.reservaFecha && (
                <span className="flex items-center space-x-1 font-semibold">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{formatDateDDMMYYYY(entry.reservaFecha)}</span>
                </span>
              )}
              {entry.reservaHorario && (
                <span className="flex items-center space-x-1 font-mono font-bold text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{entry.reservaHorario}</span>
                </span>
              )}
              {entry.reservaEspacio && (
                <span className="flex items-center space-x-1 font-medium">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{entry.reservaEspacio}</span>
                </span>
              )}
              {entry.reservaResponsable && (
                <span className="flex items-center space-x-1 text-slate-500">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Resp: {entry.reservaResponsable}</span>
                </span>
              )}
            </div>
          )}

          {/* Detail of Field Diffs if this was an update */}
          {entry.diffs && entry.diffs.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <button
                type="button"
                onClick={onToggleExpand}
                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center space-x-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-indigo-500" />
                <span>
                  {isExpanded ? 'Ocultar detalle de campos modificados' : `Ver ${entry.diffs.length} campo(s) modificado(s)`}
                </span>
              </button>

              {isExpanded && (
                <div className="p-2.5 bg-white rounded-xl border border-amber-200 text-xs space-y-1.5 shadow-2xs animate-fadeIn">
                  <div className="text-[10px] uppercase font-black tracking-wider text-slate-500 pb-1 border-b border-slate-100">
                    Comparación Antes vs. Después:
                  </div>
                  {entry.diffs.map((diff, i) => (
                    <div key={i} className="flex flex-wrap items-center justify-between text-xs py-0.5 border-b border-slate-50 last:border-0 gap-1">
                      <span className="font-bold text-slate-700 min-w-[120px]">{diff.label}:</span>
                      <div className="flex items-center space-x-1.5 font-mono text-[11px]">
                        <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 rounded-md border border-rose-100 line-through">
                          {String(diff.oldValue) || '(vacío)'}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded-md border border-emerald-100 font-bold">
                          {String(diff.newValue) || '(vacío)'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Revert notice if already restored */}
          {entry.isReverted && (
            <div className="text-[11px] text-slate-500 italic flex items-center space-x-1">
              <span>
                Revertido / Restaurado por <strong>{entry.revertedBy || 'Administrador'}</strong>{' '}
                {entry.revertedAt ? `el ${formatTimestamp(entry.revertedAt)}` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right Side: Restore Action Button */}
        <div className="shrink-0 flex items-center space-x-2 pt-2 sm:pt-0">
          {canBeRestored ? (
            <button
              type="button"
              onClick={() => onRestore(entry)}
              disabled={isRestoring || restoreDisabled}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center space-x-1.5 shadow-xs cursor-pointer ${
                isDeletionAction(entry.action)
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : entry.action === 'UPDATE'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              } disabled:opacity-50`}
              title="Restaurar y aplicar el estado anterior"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
              <span>
                {isRestoring
                  ? 'Restaurando...'
                  : isDeletionAction(entry.action)
                  ? 'Recuperar Reserva'
                  : entry.action === 'CREATE'
                  ? 'Deshacer Creación'
                  : entry.action === 'BULK_IMPORT'
                  ? 'Deshacer Importación'
                  : 'Revertir Edición'}
              </span>
            </button>
          ) : entry.isReverted ? (
            <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ya Restaurado</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
