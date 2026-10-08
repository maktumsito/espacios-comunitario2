import { formatDisplayTitle } from '../utils/reservationVisuals';
import React from 'react';
import { ApplicantSummary } from '../types';
import {
  Star,
  AlertTriangle,
  Phone,
  Mail,
  ChevronRight
} from 'lucide-react';
import { getPhoneContactActions } from '../utils/phoneUtils';

interface ApplicantSummaryCardProps {
  applicant: ApplicantSummary;
  isSelected: boolean;
  onSelect: (applicant: ApplicantSummary) => void;
}

function getActivityBadgeStyle(cat: string) {
  switch (cat) {
    case 'PRÉSTAMO':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'ENSAYO':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'CUMPLEAÑOS':
      return 'bg-pink-50 text-pink-700 border-pink-200';
    case 'OTROS':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export const ApplicantSummaryCard: React.FC<ApplicantSummaryCardProps> = ({
  applicant,
  isSelected,
  onSelect
}) => {
  const hasCritical = applicant.incidentesCount > 0;
  const phoneAction = getPhoneContactActions(applicant.telefonoContacto);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Ver ficha de solicitante de ${formatDisplayTitle(applicant.responsable)}`}
      aria-pressed={isSelected}
      onClick={() => onSelect(applicant)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          onSelect(applicant);
        }
      }}
      className={`w-full text-left bg-white border rounded-2xl p-4 transition shadow-2xs hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        isSelected
          ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/20'
          : hasCritical
          ? 'border-rose-200 hover:border-rose-300'
          : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h2 className="font-bold text-sm sm:text-base text-slate-900 truncate">
              {formatDisplayTitle(applicant.responsable)}
            </h2>
            {applicant.rut && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                {applicant.rut}
              </span>
            )}
            {hasCritical && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span>{applicant.incidentesCount} incidente(s)</span>
              </span>
            )}
            {applicant.promedioCalificacion && applicant.promedioCalificacion >= 4.5 && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span>{applicant.promedioCalificacion.toFixed(1)}/5</span>
              </span>
            )}
          </div>

          {/* Contact metadata */}
          <div className="flex items-center space-x-3 text-xs text-slate-500 mt-1.5 flex-wrap gap-y-1">
            {phoneAction && (
              <div
                className="flex items-center space-x-1.5"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <a
                  href={phoneAction.telHref}
                  title={`Llamar al ${applicant.telefonoContacto}`}
                  className="flex items-center space-x-1 text-slate-600 hover:text-blue-600 font-medium hover:underline transition"
                >
                  <Phone className="w-3 h-3 text-slate-400 hover:text-blue-600" />
                  <span>{applicant.telefonoContacto}</span>
                </a>
                <a
                  href={phoneAction.waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Enviar mensaje por WhatsApp"
                  className="px-1.5 py-0.2 rounded text-[9.5px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition"
                >
                  WhatsApp
                </a>
              </div>
            )}
            {applicant.emailContacto && (
              <span className="flex items-center space-x-1">
                <Mail className="w-3 h-3 text-slate-400" />
                <span>{applicant.emailContacto}</span>
              </span>
            )}
          </div>

          {/* Activity Category Tags */}
          {applicant.tiposActividad && applicant.tiposActividad.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {applicant.tiposActividad.map((tipo) => (
                <span
                  key={tipo}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getActivityBadgeStyle(tipo)}`}
                >
                  {tipo === 'PRÉSTAMO' && 'Préstamo'}
                  {tipo === 'ENSAYO' && 'Ensayo'}
                  {tipo === 'CUMPLEAÑOS' && 'Cumpleaños'}
                  {tipo === 'OTROS' && 'Otros'}
                </span>
              ))}
            </div>
          )}
        </div>

        <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${isSelected ? 'rotate-90 text-blue-600' : ''}`} />
      </div>

      {/* Summary Metric Pills */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100 text-center">
        <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
          <span className="text-[10px] text-slate-500 block">Total Solicitudes</span>
          <strong className="text-xs text-slate-800 font-black">{applicant.totalReservas}</strong>
        </div>
        <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
          <span className="text-[10px] text-slate-500 block">Horas Acumuladas</span>
          <strong className="text-xs text-emerald-700 font-black">{applicant.totalHorasUsadas} hrs</strong>
        </div>
        <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
          <span className="text-[10px] text-slate-500 block">Cartas Adjuntas</span>
          <strong className="text-xs text-indigo-700 font-black">{applicant.cartasAdjuntasCount}</strong>
        </div>
      </div>
    </div>
  );
};
