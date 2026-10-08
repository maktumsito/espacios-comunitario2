import { formatDisplayTitle } from '../utils/reservationVisuals';
import React from 'react';
import {
  User,
  Phone,
  Mail,
  Home,
  CheckCircle2,
  AlertTriangle,
  FileSignature,
  Users
} from 'lucide-react';
import { Reservation, CommitmentLetterAttachment } from '../types';
import { ResponsibleHistoryAlert } from '../services/ratingService';
import { formatRut } from '../utils/validationUtils';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { isCommitmentLetterEligible } from '../utils/commitmentLetterPdf';
import { CommitmentLetterCard } from './CommitmentLetterCard';

export interface ApplicantContactSectionProps {
  formData: Partial<Reservation>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  handleResponsableChange: (name: string) => void;
  uniqueResponsablesList: Array<{ responsable: string; rut?: string; telefono?: string; email?: string }>;
  hasAutoFilledContact: boolean;
  phoneValidation: { isValid: boolean; error?: string };
  rutValidation: { isValid: boolean; error?: string };
  emailValidation: { isValid: boolean; error?: string };
  primarySpaceCapacityWarning: { hasWarning: boolean; recommendedCapacity: number; requestedCount: number };
  secondSpaceCapacityWarning?: { hasWarning: boolean; recommendedCapacity: number; requestedCount: number } | null;
  singleSecondSpace?: string;
  responsibleHistoryAlert: ResponsibleHistoryAlert;
  descargarCartaAlCrear: boolean;
  setDescargarCartaAlCrear: (val: boolean) => void;
  setShowCommitmentLetterModal: (val: boolean) => void;
  editingReservation?: Reservation | null;
  effectiveFormDataForLetter?: any;
  effectiveSeriesSlotsForLetter?: any;
  allReservations?: readonly Reservation[];
}

export const ApplicantContactSection: React.FC<ApplicantContactSectionProps> = ({
  formData,
  setFormData,
  handleResponsableChange,
  uniqueResponsablesList,
  hasAutoFilledContact,
  phoneValidation,
  rutValidation,
  emailValidation,
  primarySpaceCapacityWarning,
  secondSpaceCapacityWarning,
  singleSecondSpace,
  responsibleHistoryAlert,
  descargarCartaAlCrear,
  setDescargarCartaAlCrear,
  setShowCommitmentLetterModal,
  editingReservation,
  effectiveFormDataForLetter,
  effectiveSeriesSlotsForLetter,
  allReservations = []
}) => {
  return (
    <div className="space-y-4 pt-1" id="section-applicant-contact">
      {/* Row 4: Responsable, Teléfono, Participantes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Responsable Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="input-reserva-responsable" className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <User className="w-3.5 h-3.5 text-blue-500" />
              <span>Responsable / Solicitante *</span>
            </label>
            {hasAutoFilledContact && (
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
                ✓ Autocompletado
              </span>
            )}
          </div>
          <input
            id="input-reserva-responsable"
            list="datalist-responsables"
            type="text"
            required
            placeholder="Nombre del monitor o solicitante"
            value={formData.responsable || ''}
            onChange={(e) => handleResponsableChange(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs font-medium"
          />
          <datalist id="datalist-responsables">
            {uniqueResponsablesList.map((item) => (
              <option key={item.responsable} value={item.responsable}>
                {item.rut ? `RUT: ${item.rut}` : ''}
              </option>
            ))}
          </datalist>
        </div>

        {/* Teléfono */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="input-reserva-telefono" className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-500" />
              <span>Teléfono</span>
            </label>
            {formData.telefonoContacto && phoneValidation.isValid && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md flex items-center space-x-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Válido</span>
              </span>
            )}
          </div>
          <input
            id="input-reserva-telefono"
            type="tel"
            placeholder="+56 9 1234 5678"
            value={formData.telefonoContacto || ''}
            onChange={(e) => setFormData({ ...formData, telefonoContacto: e.target.value })}
            className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 shadow-xs ${
              formData.telefonoContacto && !phoneValidation.isValid
                ? 'border-rose-400 bg-rose-50/30 text-rose-950 focus:ring-rose-400'
                : 'border-slate-200 focus:ring-blue-500'
            }`}
          />
          {formData.telefonoContacto && !phoneValidation.isValid && (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center space-x-1 mt-0.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{phoneValidation.error}</span>
            </p>
          )}
        </div>

        {/* Participantes */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="input-reserva-participantes" className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              <span>Participantes</span>
            </label>
            <span className="text-[11px] text-slate-500 font-medium">
              Sugerido: ~{primarySpaceCapacityWarning.recommendedCapacity} pers.
            </span>
          </div>
          <input
            id="input-reserva-participantes"
            type="number"
            min="1"
            max="2000"
            value={formData.cantidadParticipantes || 10}
            onChange={(e) => setFormData({ ...formData, cantidadParticipantes: Math.max(1, Number(e.target.value) || 0) })}
            className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-slate-900 focus:outline-none focus:ring-2 shadow-xs font-semibold ${
              primarySpaceCapacityWarning.hasWarning
                ? 'border-amber-300 ring-1 ring-amber-300 focus:ring-amber-500 bg-amber-50/20'
                : 'border-slate-200 focus:ring-blue-500'
            }`}
          />
        </div>
      </div>

      {/* Capacity Recommendation Non-blocking Warning Banner */}
      {(primarySpaceCapacityWarning.hasWarning || (secondSpaceCapacityWarning && secondSpaceCapacityWarning.hasWarning)) && (
        <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs flex items-start space-x-2.5 shadow-2xs">
          <span className="text-base mt-0.5 shrink-0">ℹ️</span>
          <div className="space-y-1">
            <p className="font-bold text-amber-900">Aviso de Capacidad y Aforo Sugerido (Informativo):</p>
            {primarySpaceCapacityWarning.hasWarning && (
              <p className="text-amber-800 text-[11px]">
                • <strong>{formatDisplayTitle(formData.espacio || 'Espacio principal')}:</strong> Aforo sugerido de <strong>{primarySpaceCapacityWarning.recommendedCapacity} personas</strong> (has indicado {primarySpaceCapacityWarning.requestedCount} participantes).
              </p>
            )}
            {secondSpaceCapacityWarning && secondSpaceCapacityWarning.hasWarning && (
              <p className="text-amber-800 text-[11px]">
                • <strong>2° Espacio ({formatDisplayTitle(singleSecondSpace)}):</strong> Aforo sugerido de <strong>{secondSpaceCapacityWarning.recommendedCapacity} personas</strong> (has indicado {secondSpaceCapacityWarning.requestedCount} participantes).
              </p>
            )}
            <p className="text-[10px] text-amber-700/90 italic pt-0.5">
              Nota: Este aforo es una recomendación orientativa y no restringe la creación o guardado de la reserva.
            </p>
          </div>
        </div>
      )}

      {/* Row 4.1: RUT, Email, Domicilio */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* RUT */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-slate-700">R.U.T. Solicitante</label>
            {formData.rut && rutValidation.isValid && (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center space-x-0.5">
                <CheckCircle2 className="w-3 h-3" />
                <span>Válido</span>
              </span>
            )}
          </div>
          <input
            id="input-reserva-rut"
            type="text"
            placeholder="Ej: 12.345.678-9"
            value={formData.rut || ''}
            onChange={(e) => {
              const val = e.target.value;
              const formatted = formatRut(val);
              setFormData({ ...formData, rut: formatted || val });
            }}
            className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 shadow-xs font-mono ${
              formData.rut && !rutValidation.isValid
                ? 'border-rose-400 bg-rose-50/20 text-rose-950 focus:ring-rose-400'
                : 'border-slate-200 focus:ring-blue-500'
            }`}
          />
          {formData.rut && !rutValidation.isValid && (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center space-x-1 mt-0.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{rutValidation.error}</span>
            </p>
          )}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-500" />
              <span>Correo Electrónico</span>
            </label>
            {formData.emailContacto && emailValidation.isValid && (
              <span className="text-[10px] text-emerald-600 font-bold flex items-center space-x-0.5">
                <CheckCircle2 className="w-3 h-3" />
                <span>Válido</span>
              </span>
            )}
          </div>
          <input
            id="input-reserva-email"
            type="email"
            placeholder="vecino@correo.cl"
            value={formData.emailContacto || ''}
            onChange={(e) => setFormData({ ...formData, emailContacto: e.target.value })}
            className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 shadow-xs ${
              formData.emailContacto && !emailValidation.isValid
                ? 'border-rose-400 bg-rose-50/20 text-rose-950 focus:ring-rose-400'
                : 'border-slate-200 focus:ring-blue-500'
            }`}
          />
          {formData.emailContacto && !emailValidation.isValid && (
            <p className="text-[11px] text-rose-600 font-semibold flex items-center space-x-1 mt-0.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>{emailValidation.error}</span>
            </p>
          )}
        </div>

        {/* Domicilio */}
        <div className="space-y-1.5">
          <label className="font-semibold text-slate-700 flex items-center space-x-1.5">
            <Home className="w-3.5 h-3.5 text-blue-500" />
            <span>Domicilio / Dirección</span>
          </label>
          <input
            id="input-reserva-domicilio"
            type="text"
            placeholder="Calle, Número, Depto"
            value={formData.domicilio || ''}
            onChange={(e) => setFormData({ ...formData, domicilio: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs"
          />
        </div>
      </div>

      {/* Carta de Compromiso: Activación con 1 Clic para actividades que no son cumpleaños ni préstamos */}
      {!isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo) && (
        <div className="space-y-2 pt-1">
          <div
            id="card-toggle-carta-compromiso"
            onClick={() => {
              const nextVal = !formData.requiereCartaCompromiso;
              setFormData((prev) => ({
                ...prev,
                requiereCartaCompromiso: nextVal
              }));
              if (nextVal) {
                setDescargarCartaAlCrear(true);
              }
            }}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
              formData.requiereCartaCompromiso
                ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-300/60 shadow-xs'
                : 'bg-white hover:bg-amber-50/40 border-slate-200 hover:border-amber-300 shadow-2xs'
            }`}
          >
            <div className="flex items-center space-x-3">
              <input
                id="toggle-activar-carta-compromiso"
                type="checkbox"
                checked={Boolean(formData.requiereCartaCompromiso)}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setFormData((prev) => ({
                    ...prev,
                    requiereCartaCompromiso: checked
                  }));
                  if (checked) {
                    setDescargarCartaAlCrear(true);
                  }
                }}
                className="w-5 h-5 rounded-md border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="toggle-activar-carta-compromiso" className="cursor-pointer space-y-0.5 select-none">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black text-slate-900 flex items-center space-x-1.5">
                    <FileSignature className="w-3.5 h-3.5 text-amber-600" />
                    <span>Activar Carta de Compromiso para esta actividad</span>
                  </span>
                  <span className="text-[9px] font-extrabold uppercase bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded-md">
                    1 Clic
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {formData.requiereCartaCompromiso
                    ? `Carta de compromiso activada para ${formatDisplayTitle(formData.tipoActividad || 'esta actividad')}. Se habilitan opciones de descarga y previsualización.`
                    : `Esta actividad (${formatDisplayTitle(formData.tipoActividad || 'general')}) no la requiere por defecto. Haz clic para activarla.`}
                </p>
              </label>
            </div>

            <button
              type="button"
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shrink-0 cursor-pointer ${
                formData.requiereCartaCompromiso
                  ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 shadow-2xs font-black'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>{formData.requiereCartaCompromiso ? '✓ Activada' : '+ Activar con 1 Clic'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Ticket: Descarga Automática de Carta de Compromiso & Gestión (Activa para Préstamos/Cumpleaños o activada con 1 Clic) */}
      {(isCommitmentLetterEligible(formData.tipoActividad, formData.tipoPrestamo) || formData.requiereCartaCompromiso) && (
        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-300 flex items-start justify-between gap-3">
            <div className="flex items-start space-x-3">
              <input
                id="ticket-descargar-carta-auto"
                type="checkbox"
                checked={descargarCartaAlCrear}
                onChange={(e) => setDescargarCartaAlCrear(e.target.checked)}
                className="w-5 h-5 mt-0.5 rounded-md border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="ticket-descargar-carta-auto" className="cursor-pointer space-y-0.5 select-none">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black text-amber-950">
                    Descargar automáticamente Carta de Compromiso oficial al guardar
                  </span>
                  <span className="text-[9px] font-extrabold uppercase bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded-md">
                    Ticket
                  </span>
                </div>
                <p className="text-[11px] text-amber-900/80">
                  Al confirmar la reserva, se descargará de inmediato el archivo PDF prellenado con los antecedentes y reglamento para que el solicitante lo firme.
                </p>
              </label>
            </div>

            <button
              id="btn-ver-carta-previa-modal"
              type="button"
              onClick={() => setShowCommitmentLetterModal(true)}
              className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-black rounded-xl text-xs transition shadow-2xs flex items-center space-x-1.5 shrink-0 cursor-pointer"
              title="Ver borrador de carta oficial"
            >
              <FileSignature className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Previsualizar</span>
            </button>
          </div>

          {editingReservation && effectiveFormDataForLetter && (
            <CommitmentLetterCard
              reservation={{
                ...effectiveFormDataForLetter,
                id: editingReservation.id,
                cartaCompromisoAdjunta: formData.cartaCompromisoAdjunta
              }}
              allReservations={allReservations as Reservation[]}
              seriesScheduleItems={effectiveSeriesSlotsForLetter}
              onUpdateAttachment={(attachment: CommitmentLetterAttachment | null) => {
                setFormData((prev) => ({
                  ...prev,
                  cartaCompromisoAdjunta: attachment || undefined
                }));
              }}
            />
          )}
        </div>
      )}

      {/* Antecedente de Calificaciones Previas */}
      {responsibleHistoryAlert.hasHistory && (
        <div
          className={`p-3.5 rounded-2xl border transition shadow-2xs space-y-2 ${
            responsibleHistoryAlert.hasCriticalIncidents
              ? 'bg-rose-50/95 border-rose-300 text-rose-950 ring-1 ring-rose-200'
              : responsibleHistoryAlert.averageRating >= 4
              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
              : 'bg-amber-50/90 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className="text-base">
                {responsibleHistoryAlert.hasCriticalIncidents ? '⚠️' : '⭐'}
              </span>
              <div className="space-y-0.5">
                <h5 className="text-xs font-bold uppercase tracking-wide">
                  {responsibleHistoryAlert.hasCriticalIncidents
                    ? 'Alerta de Antecedentes Previos del Solicitante'
                    : 'Historial de Préstamos Previos'}
                </h5>
                <p className="text-xs font-semibold">
                  {responsibleHistoryAlert.warningMessage}
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-xl text-xs font-black font-mono bg-white/80 border border-slate-200 shrink-0">
              {responsibleHistoryAlert.averageRating.toFixed(1)} / 5.0 ⭐
            </span>
          </div>

          {responsibleHistoryAlert.incidents && responsibleHistoryAlert.incidents.length > 0 && (
            <div className="pt-2 border-t border-rose-200/80 text-[11px] space-y-1">
              <span className="font-bold text-rose-900 block">Detalle de incidentes registrados en préstamos anteriores:</span>
              <ul className="list-disc list-inside space-y-0.5 text-rose-800">
                {responsibleHistoryAlert.incidents.map((inc, i) => (
                  <li key={i}>
                    <strong>{formatDateDDMMYYYY(inc.fecha)} ({formatDisplayTitle(inc.espacio)}):</strong> {inc.huboDanos ? `Daños: ${inc.detalleDanos || 'Sí'}` : ''} {inc.dejoBasura ? '• Dejó basura acumulada' : ''} {inc.observaciones ? `• "${inc.observaciones}"` : ''} (Evaluador: {inc.auxiliarName})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
