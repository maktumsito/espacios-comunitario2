import { ReservationSectionHeader } from './ReservationSectionHeader';
import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  Star,
  Smartphone,
  Check,
  FileSignature,
  Info
} from 'lucide-react';
import { Reservation, ActivityTypeItem } from '../types';
import { MAX_ACTIVITY_DESCRIPTION_LENGTH } from '../utils/validationUtils';
import { isCommitmentLetterEligible } from '../utils/commitmentLetterPdf';

interface ReservationStep1ActivityProps {
  isWizardMode: boolean;
  formData: Partial<Reservation>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  descriptionValidation: { isValid: boolean; error?: string };
  effectiveActivityNames: string[];
  availableActivityTypes?: ActivityTypeItem[];
}

export const ReservationStep1Activity: React.FC<ReservationStep1ActivityProps> = React.memo(({
  isWizardMode,
  formData,
  setFormData,
  descriptionValidation,
  effectiveActivityNames,
  availableActivityTypes
}) => {
  const requiresLetter = isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo);

  return (
    <div id="wizard-step-section-1" className="space-y-4">
      {/* Header of Step 1 */}
      <ReservationSectionHeader title="1. Identificación y Tipo de Actividad" description="Define el nombre del taller o evento, su categoría y prioridad" icon={<Sparkles className="h-4 w-4" />} />

      {/* Row 1: Nombre de la Actividad */}
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
            <span
              className={`font-mono font-medium transition ${
                (formData.descripcion?.length || 0) > MAX_ACTIVITY_DESCRIPTION_LENGTH
                  ? 'text-rose-600 font-bold'
                  : (formData.descripcion?.length || 0) >= MAX_ACTIVITY_DESCRIPTION_LENGTH - 30
                  ? 'text-amber-600 font-bold'
                  : 'text-slate-400'
              }`}
            >
              {formData.descripcion?.length || 0}/{MAX_ACTIVITY_DESCRIPTION_LENGTH}
            </span>
            <span className="text-slate-400 font-normal">Obligatorio</span>
          </div>
        </div>
        <input
          id="input-reserva-descripcion"
          type="text"
          required
          autoFocus={isWizardMode}
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

      {/* Row 2: Tipo de Actividad / Categoría */}
      <div className="space-y-1.5">
        <label htmlFor="input-reserva-tipo" className="font-semibold text-slate-700 flex items-center space-x-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600" />
          <span>Categoría y Tipo de Préstamo *</span>
        </label>
        <select
          id="input-reserva-tipo"
          value={formData.tipoActividad || effectiveActivityNames[0]}
          onChange={(e) => {
            const val = e.target.value;
            const requires = isCommitmentLetterEligible(val, val);
            setFormData((prev) => ({
              ...prev,
              tipoActividad: val,
              tipoPrestamo: val,
              requiereCartaCompromiso: requires ? true : prev.requiereCartaCompromiso
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

      </div>

      {/* Early notice for Carta de Compromiso if applicable */}
      {requiresLetter ? (
        <div className="p-3 bg-amber-50/90 rounded-xl border border-amber-200 flex items-start space-x-2 text-amber-950">
          <FileSignature className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed">
            <span className="font-bold">Carta de Compromiso Requerida: </span>
            <span>
              Esta categoría requiere la emisión de Carta Compromiso comunitaria oficial. Podrás previsualizarla y gestionarla en el Paso 4 (Recursos).
            </span>
          </div>
        </div>
      ) : <p className="text-sm text-slate-500">Los recursos y documentos opcionales se configuran en el paso 4.</p>}

      {/* Actividad Importante / Prioridad Institucional */}
      <div className="space-y-1.5">
        <label className="font-semibold text-slate-700 flex items-center justify-between text-xs">
          <span className="flex items-center space-x-1.5">
            <Star className={`w-3.5 h-3.5 ${formData.importante === 'Sí' ? 'text-amber-500 fill-amber-400' : 'text-slate-400'}`} />
            <span>Prioridad / Importancia Institucional</span>
          </span>
          {formData.importante === 'Sí' && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300 flex items-center space-x-1">
              <Smartphone className="w-2.5 h-2.5" />
              <span>Notifica Celular</span>
            </span>
          )}
        </label>
        <button
          type="button"
          aria-pressed={formData.importante === 'Sí'}
          onClick={() => setFormData((prev) => ({ ...prev, importante: prev.importante === 'Sí' ? 'No' : 'Sí' }))}
          className={`w-full text-left p-3 rounded-xl border-2 transition cursor-pointer flex items-center justify-between shadow-2xs ${
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
                {formData.importante === 'Sí' ? 'Marcada como Actividad destacada' : 'Actividad Normal'}
              </span>
              <span className="text-[10px] text-slate-500 block truncate">
                {formData.importante === 'Sí' ? 'Genera notificación prioritaria a coordinadores' : 'Taller o evento comunitario habitual'}
              </span>
            </div>
          </div>

          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center border ${
              formData.importante === 'Sí' ? 'bg-amber-500 border-amber-600 text-white' : 'bg-white border-slate-300 text-transparent'
            }`}
          >
            <Check className="w-3 h-3 stroke-[3]" />
          </div>
        </button>
      </div>
    </div>
  );
});
