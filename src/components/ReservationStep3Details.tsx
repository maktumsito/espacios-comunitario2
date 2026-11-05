import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  Star,
  Smartphone,
  Check,
  FileSignature
} from 'lucide-react';
import { EquipmentItem, Reservation } from '../types';
import { EquipmentSelector } from './EquipmentSelector';
import { MAX_ACTIVITY_DESCRIPTION_LENGTH } from '../utils/validationUtils';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { isCommitmentLetterEligible } from '../utils/commitmentLetterPdf';

interface ReservationStep3DetailsProps {
  isWizardMode: boolean;
  formData: Partial<Reservation>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  descriptionValidation: { isValid: boolean; error?: string };
  effectiveActivityNames: string[];
  effectiveEquipment: EquipmentItem[];
  allReservations: Reservation[];
  editingReservation?: Reservation | null;
  bookingMode: 'single' | 'specific' | 'pattern';
  specificDates: string[];
}

export const ReservationStep3Details: React.FC<ReservationStep3DetailsProps> = React.memo(({
  isWizardMode,
  formData,
  setFormData,
  descriptionValidation,
  effectiveActivityNames,
  effectiveEquipment,
  allReservations,
  editingReservation,
  bookingMode,
  specificDates
}) => {
  return (
    <div id="wizard-step-section-3" className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-xs">3. Detalles & Recursos</h3>
            <p className="text-[11px] text-slate-500">Nombre de la actividad, tipo, equipamiento solicitado y observaciones</p>
          </div>
        </div>
        {isWizardMode && (
          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            Paso 3 de 3
          </span>
        )}
      </div>

      {/* Row 1: Nombre Actividad / Descripción */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="input-reserva-descripcion" className="font-semibold text-slate-700 flex items-center space-x-1.5">
            <span>Nombre de la Actividad / Taller / Evento *</span>
            {formData.descripcion && descriptionValidation.isValid && (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center space-x-0.5">
                <CheckCircle2 className="w-3 h-3" />
              </span>
            )}
          </label>
          <div className="flex items-center space-x-2 text-[11px]">
            <span className={`font-mono font-medium transition ${
              (formData.descripcion?.length || 0) > MAX_ACTIVITY_DESCRIPTION_LENGTH
                ? 'text-rose-600 font-bold'
                : (formData.descripcion?.length || 0) >= MAX_ACTIVITY_DESCRIPTION_LENGTH - 30
                ? 'text-amber-600 font-bold'
                : 'text-slate-400'
            }`}>
              {formData.descripcion?.length || 0}/{MAX_ACTIVITY_DESCRIPTION_LENGTH}
            </span>
            <span className="text-slate-400 font-normal">Obligatorio</span>
          </div>
        </div>
        <input
          id="input-reserva-descripcion"
          type="text"
          required
          maxLength={MAX_ACTIVITY_DESCRIPTION_LENGTH}
          placeholder="Ej: Taller de Danza Árabe, Reunión Junta de Vecinos, Torneo de Futsal..."
          value={formData.descripcion || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, descripcion: e.target.value }))}
          className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 shadow-xs font-medium ${
            formData.descripcion && !descriptionValidation.isValid
              ? 'border-rose-400 bg-rose-50/20 text-rose-950 focus:ring-rose-400'
              : 'border-slate-200 focus:ring-blue-500'
          }`}
        />
        {formData.descripcion && !descriptionValidation.isValid && (
          <p className="text-[11px] font-semibold text-rose-600">
            {descriptionValidation.error}
          </p>
        )}
      </div>

      {/* Row 2: Tipo de Actividad / Préstamo (Unificado) */}
      <div className="space-y-1.5">
        <label className="font-semibold text-slate-700 flex items-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Tipo de Actividad / Préstamo *</span>
        </label>
        <select
          id="input-reserva-tipo"
          value={formData.tipoActividad || effectiveActivityNames[0]}
          onChange={(e) => {
            const val = e.target.value;
            setFormData((prev) => ({
              ...prev,
              tipoActividad: val,
              tipoPrestamo: val
            }));
          }}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs font-semibold cursor-pointer"
        >
          {effectiveActivityNames.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Activación con 1 Clic para actividades que no son préstamos ni cumpleaños */}
        {!isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo) && (
          <div className="pt-1">
            <button
              type="button"
              id="btn-step3-toggle-carta-compromiso"
              onClick={() => {
                const nextVal = !formData.requiereCartaCompromiso;
                setFormData((prev) => ({
                  ...prev,
                  requiereCartaCompromiso: nextVal
                }));
              }}
              className={`w-full p-2.5 rounded-xl border text-xs font-semibold transition flex items-center justify-between cursor-pointer ${
                formData.requiereCartaCompromiso
                  ? 'bg-amber-50 border-amber-300 text-amber-950 ring-1 ring-amber-200 shadow-2xs'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-amber-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FileSignature className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="font-bold">Carta de Compromiso:</span>
                <span className={formData.requiereCartaCompromiso ? 'text-amber-900 font-semibold' : 'text-slate-500 font-normal'}>
                  {formData.requiereCartaCompromiso ? 'Activada para esta actividad' : 'Desactivada por defecto en este tipo'}
                </span>
              </div>
              <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition ${
                formData.requiereCartaCompromiso
                  ? 'bg-amber-400 text-amber-950 shadow-2xs'
                  : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
              }`}>
                {formData.requiereCartaCompromiso ? '✓ Activada (1 Clic)' : '+ Activar con 1 Clic'}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Selector de Equipamiento y Recursos Compartidos */}
      <EquipmentSelector
        date={formData.fecha || ''}
        startTime={formData.horaInicio || '10:00'}
        endTime={formData.horaFin || '11:00'}
        allReservations={allReservations}
        equipmentList={effectiveEquipment}
        selectedEquipment={formData.equipamientoSolicitado || []}
        onChange={(items) => setFormData((prev) => ({ ...prev, equipamientoSolicitado: items }))}
        excludeReservationId={editingReservation?.id}
      />

      {/* Actividad Importante */}
      <div className="space-y-1.5">
        <label className="font-semibold text-slate-700 flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <Star className={`w-3.5 h-3.5 ${formData.importante === 'Sí' ? 'text-amber-500 fill-amber-400' : 'text-slate-400'}`} />
            <span>Actividad Importante</span>
          </span>
          {formData.importante === 'Sí' && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 flex items-center space-x-1">
              <Smartphone className="w-2.5 h-2.5" />
              <span>Notifica Celular</span>
            </span>
          )}
        </label>
        <div
          onClick={() => setFormData((prev) => ({ ...prev, importante: prev.importante === 'Sí' ? 'No' : 'Sí' }))}
          className={`p-3 rounded-xl border-2 transition cursor-pointer flex items-center justify-between shadow-2xs ${
            formData.importante === 'Sí'
              ? 'bg-amber-50/90 border-amber-300 text-amber-900'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg ${formData.importante === 'Sí' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
              <Star className={`w-4 h-4 ${formData.importante === 'Sí' ? 'fill-white' : ''}`} />
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold block truncate">
                {formData.importante === 'Sí' ? 'Marcada como Importante ⭐' : 'Actividad Normal'}
              </span>
              <span className="text-[10px] text-slate-500 block truncate">
                {formData.importante === 'Sí' ? 'Envía alerta push al celular Android' : 'Taller o uso habitual'}
              </span>
            </div>
          </div>

          <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
            formData.importante === 'Sí' ? 'bg-amber-500 border-amber-600 text-white' : 'bg-white border-slate-300 text-transparent'
          }`}>
            <Check className="w-3 h-3 stroke-[3]" />
          </div>
        </div>
      </div>

      {/* Comentarios */}
      <div className="space-y-1.5">
        <label className="font-semibold text-slate-700">Comentarios / Observaciones</label>
        <textarea
          id="input-reserva-comentarios"
          rows={2}
          placeholder="Requerimientos de mesas, audio, mantel, proyector o notas adicionales..."
          value={formData.comentarios || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, comentarios: e.target.value }))}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
        />
      </div>

      {/* Resumen Final de Confirmación (en Modo Wizard) */}
      {isWizardMode && (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between text-slate-700 font-bold text-xs">
            <span className="flex items-center space-x-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Resumen de la Reserva</span>
            </span>
            <span className="text-[10px] font-normal text-slate-500">
              Verifica los datos antes de guardar
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="p-2.5 bg-white rounded-lg border border-slate-200/80 space-y-0.5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Espacio & Horario</span>
              <span className="font-bold text-slate-800">{formData.espacio || 'Espacio'}</span>
              <span className="text-slate-600 block">
                {formData.fecha ? formatDateDDMMYYYY(formData.fecha) : 'Fecha'}: {formData.horaInicio} - {formData.horaFin}
              </span>
              {bookingMode !== 'single' && (
                <span className="text-blue-600 text-[10px] font-semibold block">
                  {bookingMode === 'specific' ? `${specificDates.length} fechas específicas` : 'Patrón semanal'}
                </span>
              )}
            </div>
            <div className="p-2.5 bg-white rounded-lg border border-slate-200/80 space-y-0.5">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Solicitante</span>
              <span className="font-bold text-slate-800 truncate block">{formData.responsable || 'No indicado'}</span>
              <span className="text-slate-600 block truncate">
                {formData.rut ? `RUT: ${formData.rut}` : ''} {formData.telefonoContacto ? `• Tel: ${formData.telefonoContacto}` : ''}
              </span>
              <span className="text-slate-600 block truncate">{formData.emailContacto || ''}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
