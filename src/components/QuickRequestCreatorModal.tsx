import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  X,
  User,
  Calendar,
  Clock,
  MapPin,
  Users,
  CheckCircle2,
  AlertTriangle,
  Zap,
  FileEdit,
  Package,
  Repeat,
  Phone,
  Mail,
  CreditCard,
  Home
} from 'lucide-react';
import { ModalOverlay } from './common/ModalOverlay';
import {
  ActivityTypeItem,
  EquipmentItem,
  LoanType,
  Reservation,
  SpaceBlock,
  SpaceInfo
} from '../types';
import {
  parseReservationRequestText,
  ParsedReservationRequest
} from '../utils/requestTextParser';
import { formatDisplayTitle } from '../utils/reservationVisuals';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { checkSingleConflict, findMaintenanceBlockConflicts } from '../utils/conflictDetector';

export interface QuickRequestCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  defaultSpace?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  availableSpaces: readonly SpaceInfo[];
  availableActivityTypes?: readonly ActivityTypeItem[];
  availableLoanTypes?: readonly LoanType[];
  availableEquipment?: readonly EquipmentItem[];
  allReservations: readonly Reservation[];
  spaceBlocks?: readonly SpaceBlock[];
  onCreateDirectly: (
    reservation: Reservation,
    generateSeries: boolean,
    seriesDates?: string[]
  ) => Promise<boolean | void> | boolean | void;
  onOpenInFullForm: (parsed: ParsedReservationRequest) => void;
}

const SAMPLE_PROMPTS = [
  {
    label: 'Ejemplo Taller Individual',
    text: 'Nombre: María González, RUT 12.345.678-5, tel +56 9 8765 4321, correo maria@gmail.com, domicilio Av. Apoquindo 4500. Solicita Sala de Espejos para Taller de Yoga Adulto Mayor el 20-11-2026 de 10:00 a 11:30 para 20 personas. Requiere parlante.'
  },
  {
    label: 'Ejemplo Reunión JJVV',
    text: 'Juan Pérez (RUT 9.876.543-3, fono 912345678, juan.perez@vecinos.cl) solicita Auditorio para Asamblea Junta de Vecinos de 18:30 a 20:00 hrs para 60 personas, requiere proyector y 2 micrófonos.'
  },
  {
    label: 'Ejemplo Serie Semanal',
    text: 'Solicitante: Carolina Muñoz, tel +56955443322, carolina@lascondes.cl. Actividad: Taller de Pilates en Tatami todos los lunes y miércoles del 10-11-2026 al 18-12-2026 de 09:30 a 11:00 para 18 participantes.'
  }
];

export const QuickRequestCreatorModal: React.FC<QuickRequestCreatorModalProps> = ({
  isOpen,
  onClose,
  defaultDate,
  defaultSpace,
  defaultStartTime,
  defaultEndTime,
  availableSpaces,
  availableActivityTypes,
  availableLoanTypes,
  availableEquipment,
  allReservations,
  spaceBlocks = [],
  onCreateDirectly,
  onOpenInFullForm
}) => {
  const [rawText, setRawText] = useState('');
  const [overrides, setOverrides] = useState<Partial<ParsedReservationRequest>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setIsSaving(false);
    }
  }, [isOpen]);

  const baseParsed = useMemo(() => {
    return parseReservationRequestText(rawText, {
      defaultDate,
      defaultSpace,
      defaultStartTime,
      defaultEndTime,
      availableSpaces,
      availableActivityTypes,
      availableLoanTypes,
      availableEquipment,
      allReservations,
      spaceBlocks
    });
  }, [
    rawText,
    defaultDate,
    defaultSpace,
    defaultStartTime,
    defaultEndTime,
    availableSpaces,
    availableActivityTypes,
    availableLoanTypes,
    availableEquipment,
    allReservations,
    spaceBlocks
  ]);

  // Reset overrides when rawText changes significantly
  const handleTextChange = (nextText: string) => {
    setRawText(nextText);
    setOverrides({});
    setErrorMsg(null);
  };

  const effective: ParsedReservationRequest = useMemo(() => {
    const merged: ParsedReservationRequest = {
      ...baseParsed,
      ...overrides
    };

    // Recompute conflict if space, date, or time was overridden
    const datesToCheck =
      merged.bookingMode === 'pattern' && merged.generatedSeriesDates.length > 0
        ? merged.generatedSeriesDates
        : [merged.fecha];

    const reasons: string[] = [];
    for (const dt of datesToCheck) {
      const candidateSlot: Partial<Reservation> = {
        espacio: merged.espacio,
        fecha: dt,
        horaInicio: merged.horaInicio,
        horaFin: merged.horaFin
      };
      const blocks = findMaintenanceBlockConflicts(
        [candidateSlot],
        spaceBlocks
      );
      if (blocks.length > 0) {
        reasons.push(`Mantención en ${merged.espacio} el ${formatDateDDMMYYYY(dt)}`);
      }
      const conflicts = checkSingleConflict(
        candidateSlot,
        allReservations
      );
      if (conflicts.length > 0) {
        reasons.push(
          `Topamiento en ${merged.espacio} el ${formatDateDDMMYYYY(dt)} (${conflicts[0].horaInicio}–${conflicts[0].horaFin}: ${conflicts[0].descripcion || conflicts[0].tipoActividad})`
        );
      }
    }

    return {
      ...merged,
      hasConflict: reasons.length > 0,
      conflictDetails: reasons
    };
  }, [baseParsed, overrides, spaceBlocks, allReservations]);

  if (!isOpen) return null;

  const buildReservationFromEffective = (): Reservation => {
    const isRecurring =
      effective.bookingMode === 'pattern' && effective.generatedSeriesDates.length > 1;
    const seriesId = isRecurring ? `SER_${crypto.randomUUID()}` : undefined;

    return {
      id: `RSV_${crypto.randomUUID()}`,
      fecha: isRecurring ? effective.generatedSeriesDates[0] : effective.fecha,
      horaInicio: effective.horaInicio,
      horaFin: effective.horaFin,
      espacio: effective.espacio,
      responsable: effective.responsable.trim() || 'Solicitante por confirmar',
      rut: effective.rut.trim(),
      telefonoContacto: effective.telefonoContacto.trim(),
      emailContacto: effective.emailContacto.trim(),
      domicilio: effective.domicilio.trim(),
      descripcion: effective.descripcion.trim() || effective.tipoActividad,
      tipoActividad: effective.tipoActividad,
      tipoPrestamo: effective.tipoPrestamo,
      cantidadParticipantes: effective.cantidadParticipantes || 15,
      actividadRecurrente: isRecurring ? 'Sí' : 'No',
      tipoRecurrencia: isRecurring ? 'semanal' : undefined,
      diasSemana: isRecurring ? effective.diasSemana : undefined,
      fechaInicioRecurrencia: isRecurring ? effective.recurrenceStartDate : undefined,
      fechaFinRecurrencia: isRecurring ? effective.recurrenceEndDate : undefined,
      serieRecurrente: seriesId,
      recurrenteId: seriesId,
      realizada: 'No',
      importante: 'No',
      estado: 'activa',
      requiereCartaCompromiso: effective.requiereCartaCompromiso,
      equipamientoSolicitado: effective.equipamientoSolicitado,
      montaje: effective.montaje,
      comentarios: effective.comentarios
    };
  };

  const handleAutoCreate = async () => {
    if (!rawText.trim() && !effective.responsable.trim() && !effective.descripcion.trim()) {
      setErrorMsg('Escribe o pega los datos de la persona y su solicitud antes de crear la reserva.');
      return;
    }
    if (!effective.horaInicio || !effective.horaFin || effective.horaFin <= effective.horaInicio) {
      setErrorMsg('El horario de término debe ser posterior al horario de inicio.');
      return;
    }
    if (effective.hasConflict) {
      setErrorMsg(
        effective.suggestedFreeSpace
          ? `El espacio ${effective.espacio} tiene topamiento en ese horario. Haz clic en "Cambiar a ${formatDisplayTitle(effective.suggestedFreeSpace)}" o abre en el formulario completo.`
          : `El espacio ${effective.espacio} tiene topamiento en ese horario (${effective.conflictDetails[0]}). Elige otro espacio u horario.`
      );
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const newRes = buildReservationFromEffective();
      const isSeries =
        effective.bookingMode === 'pattern' && effective.generatedSeriesDates.length > 1;
      const result = await onCreateDirectly(
        newRes,
        isSeries,
        isSeries ? effective.generatedSeriesDates : undefined
      );
      if (result !== false) {
        setRawText('');
        setOverrides({});
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo crear la reserva automáticamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalOverlay
      onClose={() => {
        if (!isSaving) onClose();
      }}
      aria-label="Crear reserva automática desde solicitud escrita"
      className="fixed inset-0 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div className="relative my-auto w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <header className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold tracking-tight truncate">
                Crear Reserva Automática desde Solicitud
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Escribe o pega los datos de la persona y lo que solicita; el sistema detecta todo y agenda al instante.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar asistente de solicitud"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {/* Input Section */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="quick-request-textarea"
                className="text-xs font-bold uppercase tracking-wider text-slate-700"
              >
                1. Escribe o pega la solicitud (WhatsApp, correo o texto libre)
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500">Ejemplos rápidos:</span>
                {SAMPLE_PROMPTS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleTextChange(sample.text)}
                    className="px-2 py-0.5 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 text-[11px] font-semibold transition cursor-pointer"
                  >
                    {sample.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              id="quick-request-textarea"
              rows={4}
              value={rawText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Ejemplo: Juan Pérez, RUT 12.345.678-9, tel +56 9 8765 4321, correo juan@lascondes.cl, solicita Auditorio para Taller de Yoga el 15-11-2026 de 10:00 a 12:00 para 25 personas, requiere proyector y micrófono..."
              className="w-full rounded-xl border border-slate-300 bg-slate-50/60 focus:bg-white p-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition"
              autoFocus
            />

            {/* Detected badges bar */}
            {effective.detectedFields.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Detectado automáticamente:
                </span>
                {effective.detectedFields.map((field) => (
                  <span
                    key={field}
                    className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold"
                  >
                    {field}
                  </span>
                ))}
                {effective.matchedFromHistory && (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800 text-[11px] font-bold">
                    ✓ Ficha autocompletada desde historial de solicitantes
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Live Extracted Preview & Inline Quick Adjustment */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 sm:p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                2. Vista Previa de la Reserva a Crear (puedes ajustar cualquier dato)
              </span>
              {effective.bookingMode === 'pattern' && effective.generatedSeriesDates.length > 1 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-900">
                  <Repeat className="w-3.5 h-3.5" />
                  Serie de {effective.generatedSeriesDates.length} sesiones
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-900">
                  Reserva en fecha única
                </span>
              )}
            </div>

            {/* Grid of extracted fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Solicitante */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  Nombre Solicitante / Responsable
                </span>
                <input
                  type="text"
                  value={effective.responsable}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, responsable: e.target.value }))}
                  placeholder="Ej: María González"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* RUT */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-slate-500" />
                  R.U.T.
                </span>
                <input
                  type="text"
                  value={effective.rut}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, rut: e.target.value }))}
                  placeholder="12.345.678-9"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Teléfono */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  Teléfono
                </span>
                <input
                  type="text"
                  value={effective.telefonoContacto}
                  onChange={(e) =>
                    setOverrides((prev) => ({ ...prev, telefonoContacto: e.target.value }))
                  }
                  placeholder="+56 9 1234 5678"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Correo */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-indigo-600" />
                  Correo Electrónico
                </span>
                <input
                  type="email"
                  value={effective.emailContacto}
                  onChange={(e) =>
                    setOverrides((prev) => ({ ...prev, emailContacto: e.target.value }))
                  }
                  placeholder="correo@ejemplo.cl"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Domicilio */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Home className="w-3.5 h-3.5 text-slate-500" />
                  Domicilio
                </span>
                <input
                  type="text"
                  value={effective.domicilio}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, domicilio: e.target.value }))}
                  placeholder="Av. Apoquindo 3400"
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Participantes */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-amber-600" />
                  Participantes (Aforo)
                </span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={effective.cantidadParticipantes}
                  onChange={(e) =>
                    setOverrides((prev) => ({
                      ...prev,
                      cantidadParticipantes: Math.max(1, parseInt(e.target.value, 10) || 1)
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Actividad / Descripción */}
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  Nombre de la Actividad / Motivo
                </span>
                <input
                  type="text"
                  value={effective.descripcion}
                  onChange={(e) =>
                    setOverrides((prev) => ({ ...prev, descripcion: e.target.value }))
                  }
                  placeholder="Ej: Taller de Yoga, Asamblea Vecinal..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Espacio */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-rose-600" />
                  Espacio Asignado
                </span>
                <select
                  value={effective.espacio}
                  onChange={(e) =>
                    setOverrides((prev) => ({
                      ...prev,
                      espacio: e.target.value,
                      spaceWasAutoSelected: false
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableSpaces.map((sp) => (
                    <option key={sp.id} value={sp.name}>
                      {formatDisplayTitle(sp.name)} {sp.capacity ? `(Cap. ${sp.capacity})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              {/* Fecha */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  {effective.bookingMode === 'pattern' ? 'Inicio de Serie' : 'Fecha'}
                </span>
                <input
                  type="date"
                  value={effective.fecha}
                  onChange={(e) =>
                    setOverrides((prev) => ({
                      ...prev,
                      fecha: e.target.value,
                      recurrenceStartDate: e.target.value
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Hora Inicio */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  Hora Inicio
                </span>
                <input
                  type="time"
                  value={effective.horaInicio}
                  onChange={(e) =>
                    setOverrides((prev) => ({ ...prev, horaInicio: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>

              {/* Hora Término */}
              <label className="block space-y-1">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-indigo-600" />
                  Hora Término
                </span>
                <input
                  type="time"
                  value={effective.horaFin}
                  onChange={(e) => setOverrides((prev) => ({ ...prev, horaFin: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>

            {/* Equipment & Recurrence Extra Info */}
            {(effective.equipamientoSolicitado.length > 0 ||
              (effective.bookingMode === 'pattern' && effective.generatedSeriesDates.length > 1)) && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70 text-xs">
                {effective.equipamientoSolicitado.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-bold text-slate-600 inline-flex items-center gap-1">
                      <Package className="w-3.5 h-3.5 text-amber-600" />
                      Equipamiento:
                    </span>
                    {effective.equipamientoSolicitado.map((eq) => (
                      <span
                        key={eq.equipmentId}
                        className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-semibold"
                      >
                        {eq.quantity}x {eq.equipmentName}
                      </span>
                    ))}
                  </div>
                )}
                {effective.bookingMode === 'pattern' && effective.generatedSeriesDates.length > 1 && (
                  <div className="text-indigo-800 font-semibold">
                    Días: <span className="uppercase">{effective.diasSemana}</span> (del{' '}
                    {formatDateDDMMYYYY(effective.recurrenceStartDate)} al{' '}
                    {formatDateDDMMYYYY(effective.recurrenceEndDate)})
                  </div>
                )}
              </div>
            )}

            {/* Availability Status Banner */}
            {effective.hasConflict ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">
                      Atención: {effective.conflictDetails[0]}
                      {effective.conflictDetails.length > 1
                        ? ` (+${effective.conflictDetails.length - 1} fechas más)`
                        : ''}
                    </p>
                    {effective.suggestedFreeSpace && (
                      <p className="text-amber-800 mt-0.5">
                        Espacio sugerido libre con capacidad compatible:{' '}
                        <strong>{formatDisplayTitle(effective.suggestedFreeSpace)}</strong>
                      </p>
                    )}
                  </div>
                </div>
                {effective.suggestedFreeSpace && (
                  <button
                    type="button"
                    onClick={() =>
                      setOverrides((prev) => ({
                        ...prev,
                        espacio: effective.suggestedFreeSpace,
                        spaceWasAutoSelected: false
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition cursor-pointer shrink-0"
                  >
                    Cambiar a {formatDisplayTitle(effective.suggestedFreeSpace)}
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 flex items-center justify-between gap-2 text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Horario disponible en{' '}
                    <strong>{formatDisplayTitle(effective.espacio)}</strong> (
                    {formatDateDDMMYYYY(effective.fecha)} · {effective.horaInicio}–{effective.horaFin})
                  </span>
                </div>
                {effective.spaceWasAutoSelected && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                    Sala asignada automáticamente por disponibilidad
                  </span>
                )}
              </div>
            )}
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-900 flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="bg-slate-50 border-t border-slate-200 px-4 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="btn-open-in-full-form"
              onClick={() => {
                onOpenInFullForm(effective);
              }}
              className="px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileEdit className="w-4 h-4 text-blue-600" />
              <span>Abrir en Formulario Completo</span>
            </button>

            <button
              type="button"
              id="btn-auto-create-reservation"
              disabled={isSaving}
              onClick={handleAutoCreate}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
            >
              <Zap className="w-4 h-4" />
              <span>
                {isSaving
                  ? 'Creando reserva...'
                  : effective.bookingMode === 'pattern' && effective.generatedSeriesDates.length > 1
                  ? `Crear Serie Automáticamente (${effective.generatedSeriesDates.length} fechas)`
                  : 'Crear Reserva Automáticamente'}
              </span>
            </button>
          </div>
        </footer>
      </div>
    </ModalOverlay>
  );
};
