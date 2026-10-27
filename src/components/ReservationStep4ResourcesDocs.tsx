import { ReservationSectionHeader } from './ReservationSectionHeader';
import { formatDisplayTitle } from '../utils/reservationVisuals';
import React, { useState } from 'react';
import {
  Package,
  FileSignature,
  Bot,
  Sparkles,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
  Lightbulb,
  Check,
  Plus
} from 'lucide-react';
import { Reservation, EquipmentItem } from '../types';
import { EquipmentSelector } from './EquipmentSelector';
import { isCommitmentLetterEligible } from '../utils/commitmentLetterPdf';
import { CommitmentLetterCard } from './CommitmentLetterCard';
import { RoomSetupPreview } from './RoomSetupPreview';
import { SETUP_LABELS, SETUP_INSTRUCTIONS } from '../utils/roomDistribution';
import type { RoomSetupType } from '../types';

export interface ReservationStep4ResourcesDocsProps {
  isWizardMode: boolean;
  wizardStep: 1 | 2 | 3 | 4 | 5;
  formData: Partial<Reservation>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  effectiveEquipment: EquipmentItem[];
  allReservations: Reservation[];
  editingReservation?: Reservation | null;
  descargarCartaAlCrear: boolean;
  setDescargarCartaAlCrear: (val: boolean) => void;
  setShowCommitmentLetterModal: (show: boolean) => void;
  effectiveFormDataForLetter?: any;
  effectiveSeriesSlotsForLetter?: any;
}

export const ReservationStep4ResourcesDocs: React.FC<ReservationStep4ResourcesDocsProps> = React.memo(({
  isWizardMode,
  wizardStep,
  formData,
  setFormData,
  effectiveEquipment,
  allReservations,
  editingReservation,
  descargarCartaAlCrear,
  setDescargarCartaAlCrear,
  setShowCommitmentLetterModal,
  effectiveFormDataForLetter,
  effectiveSeriesSlotsForLetter
}) => {
  const requiresLetter = isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo) || Boolean(formData.requiereCartaCompromiso);
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [appliedAiNotice, setAppliedAiNotice] = useState(false);

  if (isWizardMode && wizardStep !== 4) return null;

  // Decoupled intelligent assistant: deterministic rule-based resource matcher
  const handleApplyAiSuggestions = (keywords: string) => {
    const text = (keywords || aiPrompt).toLowerCase();
    const suggestions: string[] = [];

    if (text.includes('present') || text.includes('visual') || text.includes('diapo') || text.includes('capacita') || text.includes('reun')) {
      suggestions.push('PROYECTOR / DATA SHOW', 'TELÓN DE PROYECCIÓN');
    }
    if (text.includes('audio') || text.includes('música') || text.includes('sonido') || text.includes('danza') || (formData.cantidadParticipantes && formData.cantidadParticipantes > 20)) {
      suggestions.push('PARLANTE / AMPLIFICADOR', 'MICRÓFONO INALÁMBRICO');
    }
    if (text.includes('mesa') || text.includes('taller') || text.includes('cumple') || text.includes('vecin')) {
      suggestions.push('MESAS PLEGABLES', 'SILLAS ADICIONALES');
    }

    if (suggestions.length === 0) {
      suggestions.push('PARLANTE / AMPLIFICADOR', 'MESAS PLEGABLES');
    }

    // Match with available equipment items
    const matched = effectiveEquipment
      .filter(eq => suggestions.some(s => eq.name.toUpperCase().includes(s) || s.includes(eq.name.toUpperCase())))
      .map(eq => ({ equipmentId: eq.id, equipmentName: eq.name, quantity: 1 }));

    if (matched.length > 0) {
      setFormData(prev => {
        const existing = prev.equipamientoSolicitado || [];
        const merged = [...existing];
        matched.forEach(m => {
          if (!merged.some(e => e.equipmentId === m.equipmentId)) {
            merged.push(m);
          }
        });
        return { ...prev, equipamientoSolicitado: merged };
      });
      setAppliedAiNotice(true);
      setTimeout(() => setAppliedAiNotice(false), 4000);
    }
  };

  return (
    <div id="reservation-step-4-container" className="space-y-4">
      {/* Step Header */}
      <ReservationSectionHeader title="4. Recursos y Documentación" description="Agrega equipamiento si lo necesitas y revisa los documentos de esta categoría." icon={<Package className="h-4 w-4" />} />

      {/* 1. Selector de Equipamiento */}
      <div className="space-y-1.5">
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
      </div>

      {/* 2. Decoupled AI Assistant Demo (Optional Helper) */}
      <div className="rounded-xl border border-indigo-200/90 bg-indigo-50/40 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => setShowAiAssistant(!showAiAssistant)}
            aria-expanded={showAiAssistant}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-indigo-900 font-semibold text-sm hover:text-indigo-950"
          >
            <Bot className="w-4 h-4 text-indigo-600" />
            <span>Asistente Inteligente de Recursos</span>
            <span className="text-[10px] font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
              Sugerencias Automáticas
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowAiAssistant(!showAiAssistant)}
            aria-label={showAiAssistant ? 'Ocultar sugerencias de recursos' : 'Mostrar sugerencias de recursos'}
            aria-expanded={showAiAssistant}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-indigo-600 hover:bg-indigo-100"
          >
            {showAiAssistant ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {showAiAssistant && (
          <div className="pt-2 border-t border-indigo-200/70 space-y-2.5 text-xs text-indigo-950">
            <p className="text-[11px] text-slate-600">
              Selecciona el tipo de requerimiento o describe la actividad para autocompletar el equipamiento sugerido según la capacidad del espacio ({formatDisplayTitle(formData.espacio || 'seleccionado')}).
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: 'Presentación Audiovisual', kw: 'presentacion proyector' },
                { label: 'Taller con Música', kw: 'audio musica parlante' },
                { label: 'Reunión Vecinal', kw: 'reunion mesas sillas' },
                { label: 'Capacitación Formativa', kw: 'capacitacion proyector mesas' }
              ].map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleApplyAiSuggestions(item.kw)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100/70 font-semibold text-[11px] transition shadow-2xs flex items-center space-x-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-indigo-500" />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {appliedAiNotice && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-[11px] font-bold flex items-center space-x-1.5 animate-fadeIn">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>✓ Sugerencias de recursos incorporadas al selector de equipamiento</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Carta de Compromiso */}
      {formData.montaje && <section className="rounded-xl border border-slate-200 p-4 space-y-3">
        <label className="block text-xs font-semibold text-slate-700">Montaje de sala
          <select className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={formData.montaje.tipo} onChange={event => {
            const tipo = event.target.value as RoomSetupType;
            setFormData(prev => ({ ...prev, montaje: { tipo, instrucciones: SETUP_INSTRUCTIONS[tipo] } }));
          }}>{Object.entries(SETUP_LABELS).map(([tipo, label]) => <option key={tipo} value={tipo}>{label}</option>)}</select>
        </label>
        <RoomSetupPreview tipo={formData.montaje.tipo} />
        <label className="block text-xs font-semibold text-slate-700">Instrucciones de montaje
          <textarea rows={3} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={formData.montaje.instrucciones} onChange={event => setFormData(prev => ({ ...prev, montaje: { ...prev.montaje!, instrucciones: event.target.value } }))} />
        </label>
      </section>}
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center space-x-2">
            <FileSignature className="w-4 h-4 text-amber-700" />
            <div>
              <h4 className="text-xs font-bold text-slate-900">Carta de Compromiso</h4>
              <p className="text-[11px] text-slate-600">
                {isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo) ? 'Documento requerido para esta categoría' : requiresLetter ? 'Documento incluido en esta reserva' : 'Opcional para esta categoría'}
              </p>
            </div>
          </div>
          <button
            type="button"
            id="btn-preview-commitment-letter"
            disabled={!requiresLetter}
            title={!requiresLetter ? 'Incluye la carta en esta reserva para previsualizarla' : 'Previsualizar carta'}
            onClick={() => setShowCommitmentLetterModal(true)}
            className="disabled:opacity-50 disabled:cursor-not-allowed min-h-11 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl text-xs transition shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Previsualizar Carta</span>
          </button>
        </div>

        {!isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo) && <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
          <input id="input-requiere-carta" type="checkbox" checked={Boolean(formData.requiereCartaCompromiso)} onChange={event => setFormData(prev => ({ ...prev, requiereCartaCompromiso: event.target.checked }))} className="h-4 w-4" />
          Incluir carta de compromiso en esta reserva
        </label>}

        <div className="flex items-center justify-between pt-2 border-t border-amber-200/70 text-xs">
          <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={requiresLetter && descargarCartaAlCrear}
              disabled={!requiresLetter}
              onChange={(e) => setDescargarCartaAlCrear(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <span className="text-[11px] font-semibold text-slate-800">
              Descargar PDF de Carta Compromiso al confirmar reserva
            </span>
          </label>
        </div>

        {editingReservation && effectiveFormDataForLetter && (
          <CommitmentLetterCard
            reservation={{
              ...effectiveFormDataForLetter,
              id: editingReservation.id,
              cartaCompromisoAdjunta: formData.cartaCompromisoAdjunta
            }}
            allReservations={allReservations}
            seriesScheduleItems={effectiveSeriesSlotsForLetter}
            onUpdateAttachment={(attachment) => {
              setFormData((prev) => ({
                ...prev,
                cartaCompromisoAdjunta: attachment || undefined
              }));
            }}
          />
        )}
      </div>

      {/* 4. Comentarios y Observaciones */}
      <div className="space-y-1.5">
        <label htmlFor="input-reserva-comentarios" className="font-semibold text-slate-700 text-xs">
          Observaciones Adicionales / Requerimientos Especiales
        </label>
        <textarea
          id="input-reserva-comentarios"
          rows={3}
          placeholder="Notas de montaje, requerimiento de llaves, disposición de mesas o recordatorios..."
          value={formData.comentarios || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, comentarios: e.target.value }))}
          className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs text-xs"
        />
      </div>
    </div>
  );
});

ReservationStep4ResourcesDocs.displayName = 'ReservationStep4ResourcesDocs';
