import React, { useState, useEffect } from 'react';
import { SpaceRating, Reservation } from '../types';
import { isWeekend, isBirthdayReservation, isRatingAllowedForReservation } from '../services/ratingService';
import { BaseModal } from './common/BaseModal';
import {
  Star,
  X,
  Check,
  AlertTriangle,
  MapPin,
  Calendar,
  User,
  ShieldAlert,
  Cake,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

interface SpaceRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservation: Reservation | null;
  existingRating?: SpaceRating | null;
  currentUserName?: string;
  onSaveRating: (rating: SpaceRating) => void;
}

export const SpaceRatingModal: React.FC<SpaceRatingModalProps> = ({
  isOpen,
  onClose,
  reservation,
  existingRating,
  currentUserName = 'Personal de Turno',
  onSaveRating
}) => {
  const [puntajeGeneral, setPuntajeGeneral] = useState<number | null>(null);
  const [limpieza, setLimpieza] = useState<number | null>(null);
  const [puntualidad, setPuntualidad] = useState<number | null>(null);
  const [cuidadoInstalaciones, setCuidadoInstalaciones] = useState<number | null>(null);
  const [comportamiento, setComportamiento] = useState<number | null>(null);
  const [auxiliarName, setAuxiliarName] = useState<string>(currentUserName);
  
  const [esCumpleanos, setEsCumpleanos] = useState<boolean>(false);
  const [huboDanos, setHuboDanos] = useState<boolean>(false);
  const [detalleDanos, setDetalleDanos] = useState<string>('');
  const [dejoBasura, setDejoBasura] = useState<boolean>(false);
  const [excedioHorario, setExcedioHorario] = useState<boolean>(false);
  const [minutosExceso, setMinutosExceso] = useState<number>(15);
  const [observaciones, setObservaciones] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (reservation) {
      setValidationError(null);
      const isBday = isBirthdayReservation(reservation);
      setEsCumpleanos(isBday);

      if (existingRating) {
        setPuntajeGeneral(existingRating.puntajeGeneral > 0 ? existingRating.puntajeGeneral : null);
        setLimpieza(existingRating.limpieza > 0 ? existingRating.limpieza : null);
        setPuntualidad(existingRating.puntualidad > 0 ? existingRating.puntualidad : null);
        setCuidadoInstalaciones(existingRating.cuidadoInstalaciones > 0 ? existingRating.cuidadoInstalaciones : null);
        setComportamiento(existingRating.comportamiento > 0 ? existingRating.comportamiento : null);
        setAuxiliarName(existingRating.auxiliarName || currentUserName);
        setEsCumpleanos(existingRating.esCumpleanos ?? isBday);
        setHuboDanos(existingRating.huboDanos || false);
        setDetalleDanos(existingRating.detalleDanos || '');
        setDejoBasura(existingRating.dejoBasura || false);
        setExcedioHorario(existingRating.excedioHorario || false);
        setMinutosExceso(existingRating.minutosExceso || 15);
        setObservaciones(existingRating.observaciones || '');
      } else {
        // Defaults for fresh rating: start at null (unselected) so user consciously scores
        setPuntajeGeneral(null);
        setLimpieza(null);
        setPuntualidad(null);
        setCuidadoInstalaciones(null);
        setComportamiento(null);
        setAuxiliarName(currentUserName);
        setHuboDanos(false);
        setDetalleDanos('');
        setDejoBasura(false);
        setExcedioHorario(false);
        setMinutosExceso(15);
        setObservaciones('');
      }
    }
  }, [reservation, existingRating, currentUserName]);

  if (!isOpen || !reservation) return null;

  const isWeekendRes = isWeekend(reservation.fecha);
  const eligibility = isRatingAllowedForReservation(reservation);
  const isFutureOrBlocked = !existingRating && !eligibility.allowed;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (isFutureOrBlocked) {
      setValidationError(eligibility.reason || 'No es posible calificar un evento antes de su finalización.');
      return;
    }

    if (!auxiliarName.trim()) {
      setValidationError('Por favor indica el nombre del personal que realiza la evaluación.');
      return;
    }

    // Validate that all five criteria have been actively rated (1 to 5)
    if (
      !puntajeGeneral ||
      !limpieza ||
      !puntualidad ||
      !cuidadoInstalaciones ||
      !comportamiento
    ) {
      setValidationError('Por favor califica todos los 5 criterios (de 1 a 5 estrellas) antes de guardar la evaluación.');
      return;
    }

    if (!existingRating) {
      const check = isRatingAllowedForReservation(reservation);
      if (!check.allowed) {
        setValidationError(check.reason || 'No es posible calificar eventos por adelantado.');
        return;
      }
    }

    const newRating: SpaceRating = {
      id: existingRating?.id || `RAT_${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
      reservationId: reservation.id,
      fecha: reservation.fecha,
      espacio: reservation.espacio,
      tipoActividad: reservation.tipoActividad || reservation.descripcion || 'Préstamo',
      responsable: reservation.responsable || 'Sin nombre',
      telefonoContacto: reservation.telefonoContacto || '',
      emailContacto: reservation.emailContacto || '',
      esCumpleanos,
      auxiliarName: auxiliarName.trim(),
      puntajeGeneral: puntajeGeneral || 1,
      limpieza: limpieza || 1,
      puntualidad: puntualidad || 1,
      cuidadoInstalaciones: cuidadoInstalaciones || 1,
      comportamiento: comportamiento || 1,
      huboDanos,
      detalleDanos: huboDanos ? detalleDanos : '',
      dejoBasura,
      excedioHorario,
      minutosExceso: excedioHorario ? minutosExceso : 0,
      observaciones: observaciones.trim(),
      createdAt: existingRating?.createdAt || new Date().toISOString(),
      createdBy: auxiliarName.trim()
    };

    onSaveRating(newRating);
    onClose();
  };

  const StarRatingInput = ({
    id,
    label,
    description,
    value,
    onChange
  }: {
    id: string;
    label: string;
    description?: string;
    value: number | null;
    onChange: (val: number) => void;
  }) => (
    <div
      role="radiogroup"
      aria-labelledby={`${id}-label`}
      className="p-3 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
    >
      <div>
        <span id={`${id}-label`} className="text-xs font-bold text-slate-800 block">{label}</span>
        {description && <span className="text-[10px] text-slate-500 block">{description}</span>}
      </div>
      <div className="flex items-center space-x-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            id={`${id}-star-${star}`}
            type="button"
            role="radio"
            aria-checked={star === value}
            aria-label={`${star} de 5 estrellas en ${label}`}
            disabled={isFutureOrBlocked}
            onClick={() => onChange(star)}
            onKeyDown={(e) => {
              if (isFutureOrBlocked) return;
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault();
                onChange(Math.min(5, (value || 0) + 1));
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault();
                onChange(Math.max(1, (value || 1) - 1));
              }
            }}
            className={`p-1 text-slate-300 hover:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400 rounded-lg transition ${
              isFutureOrBlocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            }`}
          >
            <Star
              className={`w-5 h-5 transition-transform hover:scale-110 ${
                value && star <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-200'
              }`}
            />
          </button>
        ))}
        <span
          aria-live="polite"
          className={`text-xs font-semibold px-2 py-0.5 rounded-md min-w-[76px] text-center ml-1 ${
            value && value > 0
              ? 'text-slate-800 font-mono font-bold bg-slate-100 border border-slate-200'
              : 'text-amber-800 bg-amber-50 border border-amber-200 text-[10.5px]'
          }`}
        >
          {value && value > 0 ? `${value}/5` : 'Sin calificar'}
        </span>
      </div>
    </div>
  );

  const headerElement = (
    <div className="px-5 py-4 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 bg-white/10 rounded-2xl backdrop-blur-xs shadow-inner">
          <Star className="w-5 h-5 text-amber-300 fill-amber-300" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="text-base font-bold tracking-tight">
              {existingRating ? 'Modificar Calificación' : 'Calificación de Préstamo del Espacio'}
            </h3>
            {isWeekendRes && (
              <span className="text-[10px] bg-amber-400 text-slate-950 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Fin de Semana
              </span>
            )}
          </div>
          <p className="text-xs text-blue-200">
            Evaluación de estado del espacio, limpieza, horarios y entrega
          </p>
        </div>
      </div>

      <button
        onClick={onClose}
        className="min-h-[44px] min-w-[44px] p-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer flex items-center justify-center"
        aria-label="Cerrar modal"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      layer="nested"
      customHeader={headerElement}
      containerClassName="rounded-3xl border border-slate-200 overflow-hidden text-slate-900"
      bodyClassName="p-0 overflow-hidden"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-start space-x-2.5 animate-fadeIn">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span className="font-semibold text-xs leading-relaxed">{validationError}</span>
          </div>
        )}

        {/* Future Event / Blocked Banner */}
          {isFutureOrBlocked && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start space-x-3 text-amber-950">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <p className="font-extrabold text-amber-900">
                  Evaluación de evento futuro deshabilitada
                </p>
                <p>{eligibility.reason}</p>
                <p className="text-[11px] text-amber-800">
                  Por integridad del historial operativo, el botón de guardado permanece bloqueado hasta la hora de término de la actividad.
                </p>
              </div>
            </div>
          )}

          {/* Reservation Card Info Summary */}
          <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-2xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>{reservation.espacio}</span>
              </span>
              <span className="text-xs font-mono font-semibold text-slate-600 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{reservation.fecha} ({reservation.horaInicio} - {reservation.horaFin})</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-slate-100">
              <div className="flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span className="font-semibold text-slate-800">{reservation.responsable}</span>
                {reservation.telefonoContacto && (
                  <span className="text-[11px] text-slate-500">({reservation.telefonoContacto})</span>
                )}
              </div>
              <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                {reservation.tipoActividad}
              </span>
            </div>
          </div>

          {/* Cumpleaños Toggle Banner */}
          <div
            onClick={() => setEsCumpleanos(!esCumpleanos)}
            className={`p-3.5 rounded-2xl border-2 transition cursor-pointer flex items-center justify-between ${
              esCumpleanos
                ? 'bg-amber-50/90 border-amber-400 text-amber-950 shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100/50'
            }`}
          >
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-xl ${esCumpleanos ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <Cake className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs font-bold block">
                  {esCumpleanos ? '🎂 Préstamo por Celebración / Cumpleaños (Destacado en informe)' : 'Marcar como Préstamo por Cumpleaños'}
                </span>
                <span className="text-[11px] text-slate-500">
                  {esCumpleanos
                    ? 'Se incluirá en el reporte semanal de los días lunes a cristianshute@gmail.com'
                    : 'Activa esta opción si el evento fue un cumpleaños o fiesta familiar'}
                </span>
              </div>
            </div>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center border ${
              esCumpleanos ? 'bg-amber-500 border-amber-600 text-white' : 'bg-white border-slate-300 text-transparent'
            }`}>
              <Check className="w-3 h-3 stroke-[3]" />
            </div>
          </div>

          {/* Evaluator Name */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Nombre del Evaluador de Turno *</span>
              <span className="text-[11px] text-slate-400">Obligatorio</span>
            </label>
            <input
              type="text"
              required
              placeholder="Ej: Juan Pérez, María Soto (Turno Fin de Semana)..."
              value={auxiliarName}
              onChange={(e) => setAuxiliarName(e.target.value)}
              className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
            />
          </div>

          {/* Detailed Star Ratings */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block">
              Calificaciones de Cuidado y Uso del Espacio
            </label>

            <StarRatingInput
              id="rating-general"
              label="1. Calificación General del Préstamo"
              description="Evaluación global de la entrega y experiencia del solicitante"
              value={puntajeGeneral}
              onChange={setPuntajeGeneral}
            />

            <StarRatingInput
              id="rating-limpieza"
              label="2. Limpieza y Orden al entregar"
              description="¿Dejaron el piso, mesas, baños y espacio sin basura acumulada?"
              value={limpieza}
              onChange={setLimpieza}
            />

            <StarRatingInput
              id="rating-puntualidad"
              label="3. Puntualidad en la entrega"
              description="¿Terminaron y desocuparon el recinto a la hora comprometida?"
              value={puntualidad}
              onChange={setPuntualidad}
            />

            <StarRatingInput
              id="rating-cuidado"
              label="4. Cuidado del Mobiliario e Instalaciones"
              description="¿Cuidaron sillas, mesas, vidrios, enchufes y equipamiento?"
              value={cuidadoInstalaciones}
              onChange={setCuidadoInstalaciones}
            />

            <StarRatingInput
              id="rating-comportamiento"
              label="5. Comportamiento y Cumplimiento de Normas"
              description="¿Hubo trato respetuoso, control de ruidos y respeto al personal?"
              value={comportamiento}
              onChange={setComportamiento}
            />
          </div>

          {/* Incident Flags & Alerts */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="text-xs font-extrabold text-slate-800 uppercase tracking-wider block flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              <span>Reporte de Incidentes / Observaciones Críticas</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className={`p-2.5 rounded-xl border flex items-center space-x-2 cursor-pointer text-xs transition ${
                huboDanos ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold' : 'bg-white border-slate-200 text-slate-700'
              }`}>
                <input
                  type="checkbox"
                  checked={huboDanos}
                  onChange={(e) => setHuboDanos(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4"
                />
                <span>Hubo Daños / Roturas</span>
              </label>

              <label className={`p-2.5 rounded-xl border flex items-center space-x-2 cursor-pointer text-xs transition ${
                dejoBasura ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' : 'bg-white border-slate-200 text-slate-700'
              }`}>
                <input
                  type="checkbox"
                  checked={dejoBasura}
                  onChange={(e) => setDejoBasura(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                />
                <span>Dejó Basura o Sucio</span>
              </label>

              <label className={`p-2.5 rounded-xl border flex items-center space-x-2 cursor-pointer text-xs transition ${
                excedioHorario ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold' : 'bg-white border-slate-200 text-slate-700'
              }`}>
                <input
                  type="checkbox"
                  checked={excedioHorario}
                  onChange={(e) => setExcedioHorario(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>Excedió el Horario</span>
              </label>
            </div>

            {huboDanos && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
                <label className="text-xs font-bold text-rose-900 block">Detalle de los daños ocasionados *</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Especifica qué elementos se rompieron o dañaron (ej: silla rota, mancha en pared, vidrio)..."
                  value={detalleDanos}
                  onChange={(e) => setDetalleDanos(e.target.value)}
                  className="w-full p-2.5 bg-white border border-rose-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                />
              </div>
            )}

            {excedioHorario && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-between text-xs">
                <span className="font-semibold text-indigo-900">¿Cuántos minutos adicionales se demoró en entregar?</span>
                <div className="flex items-center space-x-1.5">
                  <input
                    type="number"
                    min="5"
                    max="240"
                    step="5"
                    value={minutosExceso}
                    onChange={(e) => setMinutosExceso(Number(e.target.value))}
                    className="w-20 px-2.5 py-1 bg-white border border-indigo-300 rounded-lg font-mono font-bold text-indigo-900 text-center"
                  />
                  <span className="font-medium text-indigo-800">min</span>
                </div>
              </div>
            )}
          </div>

          {/* Observaciones Generales */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Observaciones Generales de la Evaluación</label>
            <textarea
              rows={2}
              placeholder="Comentarios adicionales sobre el retiro de personas, volumen de música, llaves, etc..."
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-2xs"
            />
          </div>

          {/* Alert of Future Precedent */}
          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl flex items-start space-x-2 text-[11px] text-blue-900">
            <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p>
              Esta evaluación quedará <strong>registrada permanentemente</strong> en la ficha del solicitante ({reservation.responsable}). El sistema avisará de estos antecedentes al personal cuando se intente solicitar un nuevo préstamo en el futuro.
            </p>
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
            >
              Cancelar
            </button>

            {(() => {
              const missingCriteria: string[] = [];
              if (!puntajeGeneral) missingCriteria.push('General');
              if (!limpieza) missingCriteria.push('Limpieza');
              if (!puntualidad) missingCriteria.push('Puntualidad');
              if (!cuidadoInstalaciones) missingCriteria.push('Cuidado');
              if (!comportamiento) missingCriteria.push('Normas');

              const isAllCriteriaRated = missingCriteria.length === 0;
              const isSaveDisabled = isFutureOrBlocked || !isAllCriteriaRated || !auxiliarName.trim();

              return (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  {!isFutureOrBlocked && missingCriteria.length > 0 && (
                    <span className="text-[11px] text-amber-800 font-medium bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 text-center">
                      Faltan por calificar: <strong className="text-amber-950">{missingCriteria.join(', ')}</strong>
                    </span>
                  )}
                  <button
                    type="submit"
                    id="btn-guardar-calificacion"
                    disabled={isSaveDisabled}
                    className={`min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center space-x-1.5 ${
                      isSaveDisabled
                        ? 'bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                    }`}
                    title={
                      isFutureOrBlocked
                        ? eligibility.reason
                        : !isAllCriteriaRated
                        ? `Debes calificar todos los criterios. Faltan: ${missingCriteria.join(', ')}`
                        : !auxiliarName.trim()
                        ? 'Indica el nombre del evaluador'
                        : undefined
                    }
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {isFutureOrBlocked
                        ? 'Evaluación Bloqueada (Evento Futuro)'
                        : !isAllCriteriaRated
                        ? 'Faltan criterios por calificar'
                        : existingRating
                        ? 'Actualizar Calificación'
                        : 'Guardar Calificación'}
                    </span>
                  </button>
                </div>
              );
            })()}
          </div>
        </form>
    </BaseModal>
  );
};
