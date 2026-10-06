import React, { useState } from 'react';
import { Reservation, SpaceBlock } from '../types';
import { detectAllConflicts, detectReservationsBlockedByMaintenance } from '../utils/conflictDetector';
import { SPACES_LIST } from '../data/spacesData';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { cleanConflictingMinuteReservations } from '../services/reservationService';
import {
  AlertTriangle,
  Clock,
  User,
  Edit2,
  CheckCircle2,
  Calendar,
  RefreshCw,
  Sparkles,
  Trash2,
  ChevronDown,
  ChevronUp,
  Wrench
} from 'lucide-react';
import { ConflictRecommendationPanel } from './ConflictRecommendationPanel';

interface ConflictsViewProps {
  reservations: Reservation[];
  spaceBlocks?: SpaceBlock[];
  onSelectReservation: (reserva: Reservation) => void;
  onEditReservation: (reserva: Reservation) => void;
}

export const ConflictsView: React.FC<ConflictsViewProps> = ({
  reservations,
  spaceBlocks,
  onSelectReservation,
  onEditReservation
}) => {
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanedMessage, setCleanedMessage] = useState<string | null>(null);
  const [expandedSuggestions, setExpandedSuggestions] = useState<Record<string, boolean>>({});
  const conflicts = detectAllConflicts(reservations);
  const maintenanceCollisions = spaceBlocks ? detectReservationsBlockedByMaintenance(reservations, spaceBlocks) : [];

  const toggleSuggestions = (key: string) => {
    setExpandedSuggestions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleCleanMinuteConflicts = async () => {
    setIsCleaning(true);
    try {
      const res = await cleanConflictingMinuteReservations(reservations);
      if (res.deletedCount > 0) {
        setCleanedMessage(`Se eliminaron con éxito ${res.deletedCount} reservas con minutos solapadas.`);
      } else {
        setCleanedMessage('No se encontraron reservas con minutos solapadas pendientes.');
      }
      setTimeout(() => setCleanedMessage(null), 5000);
    } catch (e) {
      console.warn('Error cleaning minute conflicts:', e);
    } finally {
      setIsCleaning(false);
    }
  };

  const getSpaceColor = (spaceName: string) => {
    const found = SPACES_LIST.find(s => s.name.toUpperCase() === spaceName.toUpperCase());
    return found ? found.color : '#64748b';
  };

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-6">
      {/* Banner */}
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-4">
          <div className="p-3 bg-rose-100 text-rose-600 rounded-xl border border-rose-200 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-rose-950 flex items-center space-x-2">
              <span>Inspector de Solapamientos y Conflictos de Horario</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-medium">
                {conflicts.length} detectados
              </span>
            </h2>
            <p className="text-xs text-rose-700/90 mt-1">
              Se detectan reservas activas que comparten el mismo espacio físico y rango horario. Las reservas duplicadas con minutos se pueden depurar automáticamente manteniendo solo las horas cerradas.
            </p>
          </div>
        </div>

        {conflicts.length > 0 && (
          <button
            onClick={handleCleanMinuteConflicts}
            disabled={isCleaning}
            className="flex items-center space-x-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs shrink-0 cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isCleaning ? 'Depurando...' : 'Depurar Minutos (Dejar Horas Cerradas)'}</span>
          </button>
        )}
      </div>

      {cleanedMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{cleanedMessage}</span>
        </div>
      )}

      {/* Maintenance Collision Section if any exist */}
      {maintenanceCollisions.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-200 text-amber-900 rounded-xl">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-950 flex items-center gap-2">
                  <span>Reservas afectadas por Mantenciones o Bloqueos de Espacio</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white text-xs font-mono">
                    {maintenanceCollisions.length}
                  </span>
                </h3>
                <p className="text-xs text-amber-800 mt-0.5">
                  Las siguientes reservas activas coinciden con periodos en los que el espacio está cerrado por mantenimiento, reparaciones o actividades institucionales.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {maintenanceCollisions.map((mc, idx) => {
              const res = mc.reserva as Reservation;
              return (
                <div
                  key={`maint-${res.id || idx}-${mc.fecha}`}
                  className="bg-white border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">{res.tipoActividad || res.descripcion || 'Reserva'}</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">{mc.espacio}</span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-semibold">{mc.block.motivo}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {formatDateDDMMYYYY(mc.fecha)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {res.horaInicio} - {res.horaFin} (Bloqueo: {mc.overlap})
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {res.responsable || 'Sin responsable'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectReservation(res)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
                    >
                      Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditReservation(res)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Reagendar</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {conflicts.length === 0 && maintenanceCollisions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-500 space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center border border-emerald-200">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">¡No hay conflictos de horario!</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Todos los espacios y talleres tienen horarios asignados sin solapamientos en las fechas programadas.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {conflicts.map((conflict, idx) => {
            const spaceColor = getSpaceColor(conflict.espacio);
            const isRecA = conflict.reservaA.actividadRecurrente === 'Sí' || Boolean(conflict.reservaA.serieRecurrente || conflict.reservaA.recurrenteId);
            const isRecB = conflict.reservaB.actividadRecurrente === 'Sí' || Boolean(conflict.reservaB.serieRecurrente || conflict.reservaB.recurrenteId);
            const conflictKey = `${conflict.reservaA.id}-${conflict.reservaB.id}-${idx}`;
            const isExpanded = Boolean(expandedSuggestions[conflictKey]);

            return (
              <div
                key={`${conflict.reservaA.id}-${conflict.reservaB.id}-${idx}`}
                className="bg-white border border-rose-200 hover:border-rose-300 rounded-2xl p-5 shadow-xs space-y-4 transition"
              >
                {/* Header tag */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-slate-200 gap-3">
                  <div className="flex items-center space-x-3">
                    <span
                      className="w-4 h-4 rounded-md shrink-0 shadow-2xs"
                      style={{ backgroundColor: spaceColor }}
                    />
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-sm text-slate-900">
                          {conflict.espacio}
                        </span>
                        <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                          {formatDateDDMMYYYY(conflict.fecha)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="inline-flex items-center space-x-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-rose-100/90 text-rose-900 border border-rose-300 shadow-2xs">
                    <Clock className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Solapamiento: {conflict.solapamiento}</span>
                  </div>
                </div>

                {/* The 2 Conflicting Reservations side-by-side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Reserva A */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          <span>{conflict.reservaA.horaInicio} - {conflict.reservaA.horaFin}</span>
                        </div>
                        {isRecA && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center space-x-1">
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span>Serie Recurrente ({conflict.reservaA.totalEnSerie || '—'} clases)</span>
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-sm text-slate-900">
                          {conflict.reservaA.descripcion || conflict.reservaA.tipoActividad}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Tipo: <span className="font-medium text-slate-700">{conflict.reservaA.tipoActividad}</span>
                        </p>
                      </div>

                      <div className="text-xs text-slate-600 flex items-center justify-between pt-2 border-t border-slate-200">
                        <span>Responsable: <strong className="text-slate-800">{conflict.reservaA.responsable}</strong></span>
                        {conflict.reservaA.telefonoContacto && (
                          <span className="text-[11px] text-slate-500 font-mono">{conflict.reservaA.telefonoContacto}</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => onEditReservation(conflict.reservaA)}
                        className={`w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer ${
                          isRecA
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isRecA ? <RefreshCw className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                        <span>{isRecA ? 'Resolver y Corregir Toda la Serie' : 'Resolver / Editar Reserva'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Reserva B */}
                  <div className="p-4 rounded-2xl bg-rose-50/40 border border-rose-200 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-rose-800 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg">
                          <Clock className="w-3.5 h-3.5 text-rose-600" />
                          <span>{conflict.reservaB.horaInicio} - {conflict.reservaB.horaFin}</span>
                        </div>
                        {isRecB && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center space-x-1">
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span>Serie Recurrente ({conflict.reservaB.totalEnSerie || '—'} clases)</span>
                          </span>
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-sm text-slate-900">
                          {conflict.reservaB.descripcion || conflict.reservaB.tipoActividad}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Tipo: <span className="font-medium text-slate-700">{conflict.reservaB.tipoActividad}</span>
                        </p>
                      </div>

                      <div className="text-xs text-slate-600 flex items-center justify-between pt-2 border-t border-rose-200">
                        <span>Responsable: <strong className="text-slate-800">{conflict.reservaB.responsable}</strong></span>
                        {conflict.reservaB.telefonoContacto && (
                          <span className="text-[11px] text-slate-500 font-mono">{conflict.reservaB.telefonoContacto}</span>
                        )}
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => onEditReservation(conflict.reservaB)}
                        className={`w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition shadow-xs cursor-pointer ${
                          isRecB
                            ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {isRecB ? <RefreshCw className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                        <span>{isRecB ? 'Resolver y Corregir Toda la Serie' : 'Resolver / Editar Reserva'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Smart Recommendation Accordion */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => toggleSuggestions(conflictKey)}
                      className="text-xs font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl border border-indigo-200 transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{isExpanded ? 'Ocultar sugerencias inteligentes' : 'Ver sugerencias para mover de horario o sala'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Alternativas calculadas para Reserva B ({conflict.reservaB.horaInicio} - {conflict.reservaB.horaFin})
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-3">
                      <ConflictRecommendationPanel
                        defaultOpen={false}
                        title="Opciones recomendadas para reubicar la actividad"
                        subtitle="Puedes cambiarla a otro horario libre en este espacio, a otra sala disponible, o a otro día:"
                        currentSlot={{
                          fecha: conflict.reservaB.fecha,
                          horaInicio: conflict.reservaB.horaInicio,
                          horaFin: conflict.reservaB.horaFin,
                          espacio: conflict.reservaB.espacio,
                          cantidadParticipantes: conflict.reservaB.cantidadParticipantes
                        }}
                        allReservations={reservations}
                        excludeReservationId={conflict.reservaB.id}
                        onApplyRecommendation={(rec) => {
                          // Opens edit modal with this updated slot
                          onEditReservation({
                            ...conflict.reservaB,
                            fecha: rec.fecha,
                            horaInicio: rec.horaInicio,
                            horaFin: rec.horaFin,
                            espacio: rec.espacio
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
