import { formatDisplayTitle } from '../utils/reservationVisuals';
import React from 'react';
import {
  CheckCircle2,
  Calendar,
  User,
  Package,
  Sparkles,
  Edit2,
  Clock,
  MapPin,
  AlertTriangle,
  FileSignature,
  FileText
} from 'lucide-react';
import { Reservation, EquipmentItem } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { isCommitmentLetterEligible } from '../utils/commitmentLetterPdf';

export interface ReservationStep5ReviewProps {
  isWizardMode: boolean;
  wizardStep: 1 | 2 | 3 | 4 | 5;
  formData: Partial<Reservation>;
  bookingMode: 'single' | 'specific' | 'pattern';
  specificDates: string[];
  enableSingleSecondSpace: boolean;
  singleSecondSpace?: string;
  singleSecondStartTime?: string;
  singleSecondEndTime?: string;
  generatedDates: readonly string[] | string[];
  conflicts: Reservation[];
  candidateConflictDates: readonly string[] | string[];
  onGoToStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  descargarCartaAlCrear: boolean;
}

export const ReservationStep5Review: React.FC<ReservationStep5ReviewProps> = React.memo(({
  isWizardMode,
  wizardStep,
  formData,
  bookingMode,
  specificDates,
  enableSingleSecondSpace,
  singleSecondSpace,
  singleSecondStartTime,
  singleSecondEndTime,
  generatedDates,
  conflicts,
  candidateConflictDates,
  onGoToStep,
  descargarCartaAlCrear
}) => {
  if (isWizardMode && wizardStep !== 5) return null;

  const requiresLetter = isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo) || Boolean(formData.requiereCartaCompromiso);
  const totalCount = bookingMode === 'single'
    ? (enableSingleSecondSpace ? 2 : 1)
    : bookingMode === 'specific'
    ? (enableSingleSecondSpace ? specificDates.length * 2 : specificDates.length)
    : (generatedDates.length || 0);

  const hasConflicts = conflicts.length > 0 || candidateConflictDates.length > 0;

  return (
    <div id="reservation-step-5-container" className="space-y-4">
      {/* Step Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-xs">5. Resumen y Confirmación Final</h3>
            <p className="text-[11px] text-slate-500">Verifica los datos antes de guardar la reserva en la agenda comunitaria</p>
          </div>
        </div>
        {isWizardMode && (
          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            Paso 5 de 5
          </span>
        )}
      </div>

      {/* Total Sessions Banner */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600 text-white font-black text-sm flex items-center justify-center shrink-0">
            {totalCount}
          </div>
          <div>
            <h4 className="text-xs font-bold text-blue-950">
              {totalCount === 1 ? '1 Reserva para Registrar' : `${totalCount} Reservas para Registrar`}
            </h4>
            <p className="text-[11px] text-blue-700">
              {bookingMode === 'single'
                ? `Fecha única: ${formData.fecha ? formatDateDDMMYYYY(formData.fecha) : 'Por definir'}`
                : bookingMode === 'specific'
                ? `${specificDates.length} fechas específicas seleccionadas`
                : 'Serie semanal recurrente según días programados'}
            </p>
          </div>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-200/80 text-blue-900">
          {bookingMode === 'single' ? 'Individual' : 'Múltiple'}
        </span>
      </div>

      {/* Conflict Alert if applicable */}
      {hasConflicts && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-950 flex items-start space-x-2 text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Advertencia de Topamiento Horario:</span>
            <p className="text-[11px] text-rose-800">
              Se detectaron conflictos en uno o más horarios. Puedes volver al Paso 2 para resolverlos o solicitar autorización excepcional.
            </p>
          </div>
        </div>
      )}

      {/* Structured Review Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {/* Card 1: Actividad */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="font-bold text-slate-800 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>1. Actividad</span>
            </span>
            <button
              type="button"
              onClick={() => onGoToStep(1)}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Modificar</span>
            </button>
          </div>
          <div className="space-y-1">
            <div className="font-bold text-slate-900 text-sm">{formatDisplayTitle(formData.descripcion || 'Sin nombre')}</div>
            <div className="flex items-center space-x-2 text-[11px]">
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                {formatDisplayTitle(formData.tipoActividad || 'General')}
              </span>
              {formData.importante === 'Sí' && (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold border border-amber-300">
                  ⭐ Destacada
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Espacio y Horarios */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="font-bold text-slate-800 flex items-center space-x-1.5">
              <MapPin className="w-3.5 h-3.5 text-blue-600" />
              <span>2. Espacio y Horario</span>
            </span>
            <button
              type="button"
              onClick={() => onGoToStep(2)}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Modificar</span>
            </button>
          </div>
          <div className="space-y-1 text-[11px]">
            <div className="font-bold text-slate-900 text-sm">{formatDisplayTitle(formData.espacio || 'Espacio')}</div>
            <div className="text-slate-600 flex items-center space-x-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>{formData.horaInicio} - {formData.horaFin}</span>
              {formData.terminaDiaSiguiente && <span className="text-amber-700 font-bold">(+1 día)</span>}
            </div>
            {enableSingleSecondSpace && singleSecondSpace && (
              <div className="text-indigo-700 font-medium">
                2° Espacio: {formatDisplayTitle(singleSecondSpace)} ({singleSecondStartTime} - {singleSecondEndTime})
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Solicitante */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="font-bold text-slate-800 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>3. Solicitante y Contacto</span>
            </span>
            <button
              type="button"
              onClick={() => onGoToStep(3)}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Modificar</span>
            </button>
          </div>
          <div className="space-y-0.5 text-[11px]">
            <div className="font-bold text-slate-900 text-sm truncate">{formatDisplayTitle(formData.responsable || 'No indicado')}</div>
            {formData.telefonoContacto && (
              <div className="text-slate-600">Tel: {formData.telefonoContacto}</div>
            )}
            {formData.emailContacto && (
              <div className="text-slate-600 truncate">✉️ {formData.emailContacto}</div>
            )}
            <div className="text-slate-500 font-medium">
              Aforo estimado: {formData.cantidadParticipantes || 0} personas
            </div>
          </div>
        </div>

        {/* Card 4: Recursos y Documentos */}
        <div className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
            <span className="font-bold text-slate-800 flex items-center space-x-1.5">
              <Package className="w-3.5 h-3.5 text-blue-600" />
              <span>4. Recursos & Documentación</span>
            </span>
            <button
              type="button"
              onClick={() => onGoToStep(4)}
              className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 cursor-pointer"
            >
              <Edit2 className="w-3 h-3" />
              <span>Modificar</span>
            </button>
          </div>
          <div className="space-y-1 text-[11px]">
            <div>
              <span className="text-slate-500">Equipamiento: </span>
              <span className="font-semibold text-slate-800">
                {formData.equipamientoSolicitado && formData.equipamientoSolicitado.length > 0
                  ? formData.equipamientoSolicitado.map(e => `${e.equipmentName} (${e.quantity})`).join(', ')
                  : 'Ninguno'}
              </span>
            </div>
            <div>
              <span className="text-slate-500">Carta Compromiso: </span>
              <span className="font-semibold text-slate-800">
                {requiresLetter ? 'Requerida' : 'Opcional'} {descargarCartaAlCrear ? '(Descarga automática)' : ''}
              </span>
            </div>
            {formData.comentarios && (
              <div className="text-slate-600 truncate">
                Notas: {formData.comentarios}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

ReservationStep5Review.displayName = 'ReservationStep5Review';
