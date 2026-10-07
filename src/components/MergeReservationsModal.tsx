import { ModalOverlay } from './common/ModalOverlay';
import React, { useState, useMemo } from 'react';
import { Reservation } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import {
  GitMerge,
  X,
  Clock,
  MapPin,
  User,
  Users,
  AlertCircle,
  Check,
  Search,
  ArrowRight,
  Sparkles,
  Layers,
  FileText
} from 'lucide-react';
import {
  timeToMinutes,
  formatMinutesToTime,
  getConstituentSpaces,
  isReservationActiveForAvailability
} from '../utils/conflictDetector';
import { getDeletedIds } from '../utils/deletedReservationsStore';
import { normalizeSpaceName } from '../data/spacesData';

interface MergeReservationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetReservation: Reservation | null;
  allReservations: Reservation[];
  onConfirmMerge: (targetReservationId: string, sourceReservationId: string) => Promise<boolean | void> | boolean | void;
}

export const MergeReservationsModal: React.FC<MergeReservationsModalProps> = ({
  isOpen,
  onClose,
  targetReservation,
  allReservations,
  onConfirmMerge
}) => {
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // Candidates: active reservations on the same date (or adjacent), excluding current reservation
  const candidates = useMemo(() => {
    if (!targetReservation) return [];
    const deletedSet = getDeletedIds();
    const targetDate = targetReservation.fecha;

    return allReservations.filter((r) => {
      if (!r || !r.id || r.id === targetReservation.id) return false;
      if (deletedSet.has(r.id)) return false;
      if (!isReservationActiveForAvailability(r, deletedSet)) return false;
      // Same date filter
      return r.fecha === targetDate;
    });
  }, [targetReservation, allReservations]);

  // Scoring / Recommending candidates based on affinity to target reservation
  const sortedCandidates = useMemo(() => {
    if (!targetReservation) return [];
    const tStart = timeToMinutes(targetReservation.horaInicio);
    let tEnd = timeToMinutes(targetReservation.horaFin);
    if ((targetReservation.horaFin === '00:00' || targetReservation.horaFin === '24:00' || tEnd === 0) && tStart > 0) {
      tEnd = 1440;
    }

    const tResp = (targetReservation.responsable || '').trim().toLowerCase();
    const tSpace = normalizeSpaceName(targetReservation.espacio);

    return [...candidates].sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;

      const aStart = timeToMinutes(a.horaInicio);
      const aEnd = timeToMinutes(a.horaFin);
      const bStart = timeToMinutes(b.horaInicio);
      const bEnd = timeToMinutes(b.horaFin);

      // Consecutive time matching (+50 points)
      if (tStart === aEnd || tEnd === aStart) scoreA += 50;
      if (tStart === bEnd || tEnd === bStart) scoreB += 50;

      // Same space (+30 points)
      if (normalizeSpaceName(a.espacio) === tSpace) scoreA += 30;
      if (normalizeSpaceName(b.espacio) === tSpace) scoreB += 30;

      // Same responsible (+40 points)
      if (tResp && (a.responsable || '').trim().toLowerCase() === tResp) scoreA += 40;
      if (tResp && (b.responsable || '').trim().toLowerCase() === tResp) scoreB += 40;

      // Chronological sort as fallback
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.horaInicio.localeCompare(b.horaInicio);
    });
  }, [candidates, targetReservation]);

  const filteredCandidates = useMemo(() => {
    if (!searchFilter.trim()) return sortedCandidates;
    const q = searchFilter.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return sortedCandidates.filter((c) => {
      const text = `${c.tipoActividad || ''} ${c.descripcion || ''} ${c.responsable || ''} ${c.espacio || ''}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      return text.includes(q);
    });
  }, [sortedCandidates, searchFilter]);

  const selectedSource = useMemo(() => {
    if (!selectedSourceId) return null;
    return candidates.find((c) => c.id === selectedSourceId) || null;
  }, [selectedSourceId, candidates]);

  // Merged preview calculation
  const mergedPreview = useMemo(() => {
    if (!targetReservation || !selectedSource) return null;

    const tStart = timeToMinutes(targetReservation.horaInicio);
    let tEnd = timeToMinutes(targetReservation.horaFin);
    if ((targetReservation.horaFin === '00:00' || targetReservation.horaFin === '24:00' || tEnd === 0) && tStart > 0) {
      tEnd = 1440;
    }

    const sStart = timeToMinutes(selectedSource.horaInicio);
    let sEnd = timeToMinutes(selectedSource.horaFin);
    if ((selectedSource.horaFin === '00:00' || selectedSource.horaFin === '24:00' || sEnd === 0) && sStart > 0) {
      sEnd = 1440;
    }

    const mergedStart = Math.min(tStart, sStart);
    const mergedEnd = Math.max(tEnd, sEnd);

    // Spaces
    let mergedSpace = targetReservation.espacio;
    if (normalizeSpaceName(targetReservation.espacio) !== normalizeSpaceName(selectedSource.espacio)) {
      const partsA = getConstituentSpaces(targetReservation.espacio);
      const partsB = getConstituentSpaces(selectedSource.espacio);
      const combined = Array.from(new Set([...partsA, ...partsB]));
      mergedSpace = combined.join(' / ');
    }

    // Equipment count
    const targetEquipCount = (targetReservation.equipamientoSolicitado || []).reduce((acc, curr) => acc + curr.quantity, 0);
    const sourceEquipCount = (selectedSource.equipamientoSolicitado || []).reduce((acc, curr) => acc + curr.quantity, 0);

    return {
      horaInicio: formatMinutesToTime(mergedStart),
      horaFin: mergedEnd >= 1440 ? '23:59' : formatMinutesToTime(mergedEnd),
      espacio: mergedSpace,
      responsable: targetReservation.responsable || selectedSource.responsable,
      tipoActividad: targetReservation.tipoActividad || selectedSource.tipoActividad,
      cantidadParticipantes: Math.max(
        Number(targetReservation.cantidadParticipantes) || 0,
        Number(selectedSource.cantidadParticipantes) || 0
      ) || 10,
      totalEquipamiento: targetEquipCount + sourceEquipCount
    };
  }, [targetReservation, selectedSource]);

  if (!isOpen || !targetReservation) return null;

  const handleExecuteMerge = async () => {
    if (!selectedSourceId) return;
    setIsMerging(true);
    try {
      const ok = await Promise.resolve(onConfirmMerge(targetReservation.id, selectedSourceId));
      if (ok !== false) {
        onClose();
      }
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <ModalOverlay onClose={() => { if (!isMerging) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-modal-title"
      className="fixed inset-0 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/20">
              <GitMerge className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="merge-modal-title" className="text-base sm:text-lg font-bold text-white leading-tight">
                Juntar / Fusionar Reservas
              </h2>
              <p className="text-xs text-blue-100 mt-0.5">
                Une dos reservas del mismo día en una sola actividad continua o multiespacio.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Target (Current) Reservation Summary */}
          <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider flex items-center gap-1">
                <span>📍 Reserva Base (Principal)</span>
              </span>
              <span className="text-[10px] font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded-full">
                {formatDateDDMMYYYY(targetReservation.fecha)}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {targetReservation.tipoActividad || 'Actividad'}
                  {targetReservation.descripcion && targetReservation.descripcion !== targetReservation.tipoActividad && (
                    <span className="text-xs font-normal text-slate-600 ml-1.5">
                      ({targetReservation.descripcion})
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>{targetReservation.responsable}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-lg border border-blue-200 font-mono font-bold text-blue-950 text-xs shadow-2xs">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>{targetReservation.horaInicio} – {targetReservation.horaFin}</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-800 font-bold rounded-lg border border-indigo-200 text-xs">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>{targetReservation.espacio}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Select Companion Reservation Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                <span>Selecciona la reserva que deseas juntar con esta:</span>
                <span className="text-slate-500 font-normal">({candidates.length} disponibles hoy)</span>
              </label>
            </div>

            {candidates.length > 5 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filtrar por actividad, solicitante o espacio..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {filteredCandidates.length === 0 ? (
              <div className="text-center py-6 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-500">
                <AlertCircle className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                <p className="font-semibold text-slate-700">No hay otras reservas activas en esta fecha.</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Para juntar reservas, ambas deben estar programadas el mismo día ({formatDateDDMMYYYY(targetReservation.fecha)}).
                </p>
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                {filteredCandidates.map((c, index) => {
                  const isSelected = selectedSourceId === c.id;
                  const isConsecutive =
                    c.horaInicio === targetReservation.horaFin ||
                    c.horaFin === targetReservation.horaInicio;
                  const isSameSpace = normalizeSpaceName(c.espacio) === normalizeSpaceName(targetReservation.espacio);
                  const isSameApplicant =
                    (c.responsable || '').trim().toLowerCase() ===
                    (targetReservation.responsable || '').trim().toLowerCase();

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedSourceId(c.id)}
                      className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-500/40'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-bold text-xs ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            {c.tipoActividad || 'Actividad'}
                          </span>
                          {index === 0 && (isConsecutive || isSameApplicant || isSameSpace) && (
                            <span
                              className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded-md ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              ⭐ Sugerida
                            </span>
                          )}
                          {isConsecutive && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              Horario continuo
                            </span>
                          )}
                          {isSameSpace && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              Mismo espacio
                            </span>
                          )}
                        </div>
                        <div className={`text-[11px] truncate mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                          Solicitante: <span className="font-medium">{c.responsable}</span>
                          {c.descripcion && ` • "${c.descripcion}"`}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 text-right">
                        <div>
                          <div className={`font-mono font-bold text-xs ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                            {c.horaInicio} – {c.horaFin}
                          </div>
                          <div className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                            {c.espacio}
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center border transition ${
                            isSelected
                              ? 'bg-white text-blue-600 border-white'
                              : 'bg-slate-100 border-slate-300 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resulting Unified Reservation Preview */}
          {mergedPreview && selectedSource && (
            <div className="p-3.5 bg-gradient-to-br from-emerald-50 to-teal-50/80 rounded-xl border border-emerald-200/90 text-xs space-y-2 animate-fadeIn">
              <div className="flex items-center space-x-1.5 text-emerald-900 font-bold text-xs uppercase tracking-wide">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>Vista Previa: Resultado de la Unión</span>
              </div>
              <p className="text-[11px] text-emerald-800">
                Al confirmar, ambas reservas se combinarán en una única reserva activa con los siguientes parámetros:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <div className="p-2 bg-white/90 rounded-lg border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">🕒 Horario Unificado:</span>
                  <span className="font-mono font-extrabold text-slate-900 text-sm">
                    {mergedPreview.horaInicio} – {mergedPreview.horaFin}
                  </span>
                </div>
                <div className="p-2 bg-white/90 rounded-lg border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">📍 Espacio Unificado:</span>
                  <span className="font-bold text-slate-900 text-sm truncate block">
                    {mergedPreview.espacio}
                  </span>
                </div>
                <div className="p-2 bg-white/90 rounded-lg border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">👤 Responsable & Contacto:</span>
                  <span className="font-semibold text-slate-900 text-xs truncate block">
                    {mergedPreview.responsable}
                  </span>
                </div>
                <div className="p-2 bg-white/90 rounded-lg border border-emerald-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">👥 Participantes:</span>
                  <span className="font-semibold text-slate-900 text-xs truncate block">
                    Hasta {mergedPreview.cantidadParticipantes} personas
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 font-bold rounded-xl border border-slate-300 text-xs transition cursor-pointer shadow-xs"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={!selectedSourceId || isMerging}
            onClick={handleExecuteMerge}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs transition flex items-center space-x-1.5 shadow-md cursor-pointer ${
              selectedSourceId && !isMerging
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25 active:scale-95'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            <GitMerge className="w-4 h-4" />
            <span>{isMerging ? 'Unificando...' : 'Confirmar y Juntar Reservas'}</span>
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};
