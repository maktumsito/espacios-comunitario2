import React, { useState, useEffect } from 'react';
import { BaseModal } from './common/BaseModal';
import { Reservation, CheckInRecord } from '../types';
import { AuthUser } from '../services/authService';
import { formatDateDDMMYYYY, getChileLocalDateString } from '../utils/dateUtils';
import { formatDisplayTitle } from '../utils/reservationVisuals';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  MapPin,
  Calendar,
  Sparkles,
  User,
  Phone,
  Save,
  MessageSquare
} from 'lucide-react';
import { showToast } from '../services/toastNotificationService';

interface QuickCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: Reservation | null;
  currentUser?: AuthUser | null;
  onSaveCheckIn: (updatedReservation: Reservation) => Promise<boolean | void> | boolean | void;
}

const COMMON_OBSERVATIONS = [
  'Espacio entregado limpio y ordenado',
  'Actividad finalizó puntualmente',
  'No se presentó la organización (No-show)',
  'Asistencia menor a la declarada',
  'Asistencia mayor a la declarada',
  'Equipamiento devuelto conforme'
];

export const QuickCheckInModal: React.FC<QuickCheckInModalProps> = ({
  isOpen,
  onClose,
  reservation,
  currentUser,
  onSaveCheckIn
}) => {
  const [status, setStatus] = useState<'Sí' | 'No' | 'Pendiente'>('Sí');
  const [participants, setParticipants] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (reservation && isOpen) {
      const initialStatus =
        reservation.realizada === 'Sí' || reservation.realizada === 'No' || reservation.realizada === 'Pendiente'
          ? reservation.realizada
          : reservation.realizada ? 'Sí' : 'Pendiente';

      setStatus(initialStatus as 'Sí' | 'No' | 'Pendiente');
      setParticipants(reservation.cantidadParticipantes || 0);
      setNotes(reservation.checkInRegistro?.notas || '');
    }
  }, [reservation, isOpen]);

  if (!isOpen || !reservation) return null;

  const handleAdjustParticipants = (delta: number) => {
    setParticipants(prev => Math.max(0, prev + delta));
  };

  const handleAddNotePreset = (preset: string) => {
    if (!notes) {
      setNotes(preset);
    } else if (!notes.includes(preset)) {
      setNotes(prev => `${prev.trim()}. ${preset}`);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      const actorName = currentUser?.name || currentUser?.username || 'Personal Auxiliar / Recepción';
      const nowIso = new Date().toISOString();

      const checkInRecord: CheckInRecord = {
        registradoPor: actorName,
        fechaHora: nowIso,
        estado: status,
        participantesReales: participants,
        notas: notes.trim() || undefined
      };

      const updatedReservation: Reservation = {
        ...reservation,
        realizada: status,
        cantidadParticipantes: participants,
        checkInRegistro: checkInRecord
      };

      await onSaveCheckIn(updatedReservation);

      const statusLabels = {
        Sí: 'Realizada / Asistió',
        No: 'No asistió (No-show)',
        Pendiente: 'Pendiente'
      };

      showToast.success(`Asistencia registrada: ${statusLabels[status]}`);
      onClose();
    } catch (error: any) {
      showToast.error(error?.message || 'No se pudo guardar el registro de asistencia.');
    } finally {
      setIsSaving(false);
    }
  };

  const displayTitle = formatDisplayTitle(reservation.descripcion || reservation.tipoActividad);

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      id="quick-check-in-modal"
      title="Registro Rápido de Asistencia / Ejecución"
      subtitle="Check-in operativo para recepción y personal auxiliar"
      icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-slate-500">
            Registrado por: <strong>{currentUser?.name || currentUser?.username || 'Auxiliar'}</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              id="btn-save-checkin"
              onClick={() => handleSubmit()}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Guardando…' : 'Guardar Asistencia'}</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Reservation Summary Card */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-sm text-slate-900 truncate" title={displayTitle}>
              {displayTitle}
            </h4>
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
              {formatDisplayTitle(reservation.espacio)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-slate-600 text-[11px]">
            <span className="inline-flex items-center gap-1 font-mono font-medium">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {formatDateDDMMYYYY(reservation.fecha)}
            </span>
            <span className="inline-flex items-center gap-1 font-mono font-bold text-blue-700">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              {reservation.horaInicio} – {reservation.horaFin}
            </span>
            {reservation.responsable && (
              <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                <User className="w-3.5 h-3.5 text-slate-400" />
                {formatDisplayTitle(reservation.responsable)}
              </span>
            )}
          </div>
        </div>

        {/* 1-Tap Status Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            1. Estado de Ejecución de la Actividad
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              id="checkin-status-si"
              onClick={() => setStatus('Sí')}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center ${
                status === 'Sí'
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 font-bold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CheckCircle2 className={`w-5 h-5 ${status === 'Sí' ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="text-xs">Realizada</span>
              <span className="text-[10px] text-emerald-700 font-medium">Asistió</span>
            </button>

            <button
              type="button"
              id="checkin-status-no"
              onClick={() => {
                setStatus('No');
                setParticipants(0);
              }}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center ${
                status === 'No'
                  ? 'bg-rose-50 border-rose-500 text-rose-900 ring-2 ring-rose-500/20 font-bold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <XCircle className={`w-5 h-5 ${status === 'No' ? 'text-rose-600' : 'text-slate-400'}`} />
              <span className="text-xs">No Asistió</span>
              <span className="text-[10px] text-rose-700 font-medium">No-show</span>
            </button>

            <button
              type="button"
              id="checkin-status-pendiente"
              onClick={() => setStatus('Pendiente')}
              className={`p-3 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition cursor-pointer text-center ${
                status === 'Pendiente'
                  ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 font-bold shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Clock className={`w-5 h-5 ${status === 'Pendiente' ? 'text-amber-600' : 'text-slate-400'}`} />
              <span className="text-xs">Pendiente</span>
              <span className="text-[10px] text-amber-700 font-medium">En espera</span>
            </button>
          </div>
        </div>

        {/* Real Attendance Count */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>2. Cantidad Real de Asistentes</span>
            </label>
            {reservation.cantidadParticipantes !== undefined && (
              <button
                type="button"
                onClick={() => setParticipants(reservation.cantidadParticipantes || 0)}
                className="text-[10px] text-blue-700 hover:underline font-semibold cursor-pointer"
              >
                Restablecer a declarada ({reservation.cantidadParticipantes})
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleAdjustParticipants(-5)}
                className="px-2 py-1 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs shadow-2xs cursor-pointer"
              >
                -5
              </button>
              <button
                type="button"
                onClick={() => handleAdjustParticipants(-1)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs shadow-2xs cursor-pointer"
              >
                -1
              </button>
            </div>

            <input
              type="number"
              min={0}
              max={500}
              value={participants}
              onChange={(e) => setParticipants(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 px-3 py-2 border border-slate-300 rounded-xl text-center font-mono font-bold text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleAdjustParticipants(1)}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs shadow-2xs cursor-pointer"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => handleAdjustParticipants(5)}
                className="px-2 py-1 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold text-xs shadow-2xs cursor-pointer"
              >
                +5
              </button>
            </div>
            <span className="text-xs text-slate-500 ml-1">personas presentes</span>
          </div>
        </div>

        {/* Quick Observation Chips & Notes */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
            <span>3. Observaciones / Novedades de la Ejecución</span>
          </label>

          <div className="flex flex-wrap gap-1.5 mb-2">
            {COMMON_OBSERVATIONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleAddNotePreset(preset)}
                className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-800 text-slate-600 transition cursor-pointer"
              >
                + {preset}
              </button>
            ))}
          </div>

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Comentarios adicionales del estado de la sala, equipamiento o desarrollo (opcional)…"
            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
          />
        </div>

        {/* Prior check-in trace if exists */}
        {reservation.checkInRegistro && (
          <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-600 space-y-0.5">
            <p className="font-semibold text-slate-700">Último registro previo:</p>
            <p>
              Por <strong>{reservation.checkInRegistro.registradoPor}</strong> el{' '}
              {new Date(reservation.checkInRegistro.fechaHora).toLocaleString('es-CL')} — Estado:{' '}
              <span className="font-bold">{reservation.checkInRegistro.estado}</span> (
              {reservation.checkInRegistro.participantesReales ?? 0} personas).
            </p>
            {reservation.checkInRegistro.notas && (
              <p className="italic text-slate-500">"{reservation.checkInRegistro.notas}"</p>
            )}
          </div>
        )}
      </div>
    </BaseModal>
  );
};
