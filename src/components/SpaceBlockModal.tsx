import { ModalOverlay } from './common/ModalOverlay';
import React, { useState, useMemo } from 'react';
import { SpaceBlock, SpaceInfo } from '../types';
import { SPACES_LIST } from '../data/spacesData';
import { X, AlertTriangle, Check, Hammer, Repeat } from 'lucide-react';
import { format, parseISO, addMonths, addDays, getDay, isAfter } from 'date-fns';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

const WEEKDAYS = [
  { dayNum: 1, short: 'Lun' },
  { dayNum: 2, short: 'Mar' },
  { dayNum: 3, short: 'Mié' },
  { dayNum: 4, short: 'Jue' },
  { dayNum: 5, short: 'Vie' },
  { dayNum: 6, short: 'Sáb' },
  { dayNum: 0, short: 'Dom' }
];

interface SpaceBlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (block: SpaceBlock) => Promise<void>;
  editingBlock?: SpaceBlock | null;
  defaultSpace?: string;
  defaultDate?: string;
  availableSpaces?: SpaceInfo[];
}

export const SpaceBlockModal: React.FC<SpaceBlockModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingBlock,
  defaultSpace,
  defaultDate,
  availableSpaces
}) => {
  const spacesList = useMemo(() => {
    return availableSpaces && availableSpaces.length > 0 ? availableSpaces : SPACES_LIST;
  }, [availableSpaces]);

  const [espacio, setEspacio] = useState<string>(
    editingBlock?.espacio || defaultSpace || spacesList[0]?.name || 'AUDITORIO'
  );
  const [fechaInicio, setFechaInicio] = useState<string>(
    editingBlock?.fechaInicio || defaultDate || new Date().toISOString().split('T')[0]
  );
  const [fechaFin, setFechaFin] = useState<string>(
    editingBlock?.fechaFin || defaultDate || new Date().toISOString().split('T')[0]
  );
  const [todoElDia, setTodoElDia] = useState<boolean>(
    editingBlock?.todoElDia !== undefined ? editingBlock.todoElDia : true
  );
  const [horaInicio, setHoraInicio] = useState<string>(editingBlock?.horaInicio || '08:00');
  const [horaFin, setHoraFin] = useState<string>(editingBlock?.horaFin || '22:30');
  const [motivo, setMotivo] = useState<string>(editingBlock?.motivo || 'Mantención');
  const [descripcion, setDescripcion] = useState<string>(editingBlock?.descripcion || '');
  const [responsableMantenimiento, setResponsableMantenimiento] = useState<string>(
    editingBlock?.responsableMantenimiento || ''
  );
  const [contactoEmpresa, setContactoEmpresa] = useState<string>(
    editingBlock?.contactoEmpresa || ''
  );
  const [bloquearSubEspacios, setBloquearSubEspacios] = useState<boolean>(
    editingBlock?.bloquearSubEspacios !== undefined ? editingBlock.bloquearSubEspacios : true
  );

  // Recurrence state
  const [esRecurrente, setEsRecurrente] = useState<boolean>(editingBlock?.esRecurrente || false);
  const [diasSemana, setDiasSemana] = useState<number[]>(
    editingBlock?.diasSemana || [new Date().getDay()]
  );
  const [fechaFinRecurrencia, setFechaFinRecurrencia] = useState<string>(() => {
    if (editingBlock?.fechaFinRecurrencia) return editingBlock.fechaFinRecurrencia;
    try {
      return format(addMonths(new Date(), 2), 'yyyy-MM-dd');
    } catch {
      return '2026-12-31';
    }
  });

  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview generated dates for recurring block
  const previewRecurringDates = useMemo(() => {
    if (!esRecurrente || !fechaInicio || !fechaFinRecurrencia || diasSemana.length === 0) return [];
    if (fechaFinRecurrencia < fechaInicio) return [];

    const dates: string[] = [];
    try {
      let runner = parseISO(fechaInicio);
      const endTarget = parseISO(fechaFinRecurrencia);

      while (!isAfter(runner, endTarget)) {
        const dayNum = getDay(runner);
        if (diasSemana.includes(dayNum)) {
          dates.push(format(runner, 'yyyy-MM-dd'));
        }
        runner = addDays(runner, 1);
      }
    } catch {
      // ignore
    }
    return dates;
  }, [esRecurrente, fechaInicio, fechaFinRecurrencia, diasSemana]);

  if (!isOpen) return null;

  const toggleDay = (dayNum: number) => {
    setDiasSemana((prev) =>
      prev.includes(dayNum) ? prev.filter((d) => d !== dayNum) : [...prev, dayNum].sort((a, b) => a - b)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!espacio) {
      setErrorMsg('Debe seleccionar el espacio a bloquear.');
      return;
    }
    if (!fechaInicio) {
      setErrorMsg('Debe especificar la fecha de inicio.');
      return;
    }
    if (!esRecurrente && !fechaFin) {
      setErrorMsg('Debe especificar la fecha de término.');
      return;
    }
    if (!esRecurrente && fechaFin < fechaInicio) {
      setErrorMsg('La fecha de término no puede ser anterior a la fecha de inicio.');
      return;
    }
    if (esRecurrente) {
      if (fechaFinRecurrencia < fechaInicio) {
        setErrorMsg('La fecha hasta la que se repite no puede ser anterior a la fecha de inicio.');
        return;
      }
      if (diasSemana.length === 0) {
        setErrorMsg('Debe seleccionar al menos un día de la semana para la repetición.');
        return;
      }
      if (previewRecurringDates.length === 0) {
        setErrorMsg('No se encontraron fechas válidas para la repetición en el rango configurado.');
        return;
      }
    }
    if (!todoElDia && horaFin <= horaInicio) {
      setErrorMsg('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }
    if (!descripcion.trim()) {
      setErrorMsg('Ingrese una breve descripción o detalle de los trabajos a realizar.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      if (esRecurrente && !editingBlock) {
        // Create a series of blocks
        const seriesId = `BLOCK_SERIES_${Date.now()}`;
        for (const dateStr of previewRecurringDates) {
          await onSave({
            id: '',
            espacio,
            fechaInicio: dateStr,
            fechaFin: dateStr,
            todoElDia,
            horaInicio: todoElDia ? '08:00' : horaInicio,
            horaFin: todoElDia ? '22:30' : horaFin,
            motivo,
            descripcion: descripcion.trim(),
            responsableMantenimiento: responsableMantenimiento.trim(),
            contactoEmpresa: contactoEmpresa.trim(),
            bloquearSubEspacios,
            activo: true,
            createdAt: new Date().toISOString(),
            esRecurrente: true,
            diasSemana,
            fechaFinRecurrencia,
            serieBloqueoId: seriesId
          });
        }
      } else {
        await onSave({
          id: editingBlock?.id || '',
          espacio,
          fechaInicio,
          fechaFin: esRecurrente ? fechaInicio : fechaFin,
          todoElDia,
          horaInicio: todoElDia ? '08:00' : horaInicio,
          horaFin: todoElDia ? '22:30' : horaFin,
          motivo,
          descripcion: descripcion.trim(),
          responsableMantenimiento: responsableMantenimiento.trim(),
          contactoEmpresa: contactoEmpresa.trim(),
          bloquearSubEspacios,
          activo: true,
          createdAt: editingBlock?.createdAt || new Date().toISOString(),
          esRecurrente,
          diasSemana: esRecurrente ? diasSemana : undefined,
          fechaFinRecurrencia: esRecurrente ? fechaFinRecurrencia : undefined,
          serieBloqueoId: editingBlock?.serieBloqueoId
        });
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al guardar el bloqueo del espacio.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalOverlay onClose={() => { if (!isSaving) onClose(); }} className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-amber-500 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-amber-600 rounded-xl shadow-xs">
              <Hammer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg">
                {editingBlock ? 'Editar Bloqueo de Espacio' : 'Nuevo Bloqueo / Mantención'}
              </h2>
              <p className="text-xs text-amber-100">
                Inhabilita el espacio para impedir nuevas reservas durante obras
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-amber-100 hover:text-white hover:bg-amber-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Espacio Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Espacio a Bloquear *
            </label>
            <select
              value={espacio}
              onChange={(e) => setEspacio(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            >
              {spacesList.map((sp: SpaceInfo) => (
                <option key={sp.id} value={sp.name}>
                  {sp.name}
                </option>
              ))}
            </select>
          </div>

          {/* Motivo Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Motivo del Bloqueo *
            </label>
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            >
              <option value="Mantención">Mantención General</option>
              <option value="Pintura">Pintura y Reparación de Paredes</option>
              <option value="Reparaciones">Reparación Eléctrica / Gasfitería</option>
              <option value="Aseo Profundo">Aseo Profundo / Fumigación</option>
              <option value="Obras">Obras Mayores / Remodelación</option>
              <option value="Evento Institucional">Evento Institucional Municipal</option>
              <option value="Otro">Otro Motivo</option>
            </select>
          </div>

          {/* Fechas Inicio y Fin / Repetición Admin */}
          <div className="space-y-3">
            {/* Opción Admin Toggle: Repetición */}
            <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="checkbox-block-recurrence"
                    checked={esRecurrente}
                    onChange={(e) => setEsRecurrente(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                    <Repeat className="w-3.5 h-3.5 text-amber-700" />
                    <span>Repetir este bloqueo periódicamente</span>
                  </span>
                </label>
                <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                  Opción Admin
                </span>
              </div>

              {esRecurrente && (
                <div className="pt-2 border-t border-amber-200/80 space-y-3 animate-fadeIn">
                  {/* Días de la semana */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-amber-900 block">
                      Días en que se repite el bloqueo:
                    </label>
                    <div className="grid grid-cols-7 gap-1">
                      {WEEKDAYS.map((day) => {
                        const isSelected = diasSemana.includes(day.dayNum);
                        return (
                          <button
                            key={day.dayNum}
                            type="button"
                            onClick={() => toggleDay(day.dayNum)}
                            className={`py-1.5 rounded-lg text-xs font-bold border transition text-center cursor-pointer ${
                              isSelected
                                ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-amber-50'
                            }`}
                          >
                            {day.short}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Rango de fechas: Desde y HASTA QUÉ FECHA SE REPITE */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Fecha Inicio Serie *
                      </label>
                      <input
                        type="date"
                        required
                        value={fechaInicio}
                        onChange={(e) => setFechaInicio(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-black text-amber-950 block">
                          ¿Hasta qué fecha se repite? *
                        </label>
                        <span className="text-[9.5px] font-bold text-amber-800">Fecha Término</span>
                      </div>
                      <input
                        type="date"
                        required
                        id="input-block-until-date"
                        min={fechaInicio}
                        value={fechaFinRecurrencia}
                        onChange={(e) => setFechaFinRecurrencia(e.target.value)}
                        className="w-full px-3 py-2 bg-white border-2 border-amber-500 rounded-xl text-xs font-bold text-amber-950 font-mono focus:ring-2 focus:ring-amber-600 focus:outline-hidden shadow-2xs"
                      />
                    </div>
                  </div>

                  {/* Quick Shortcuts */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    <span className="text-amber-900 font-semibold">Repetir hasta:</span>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const base = parseISO(fechaInicio);
                          setFechaFinRecurrencia(format(addMonths(base, 1), 'yyyy-MM-dd'));
                        } catch {}
                      }}
                      className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 cursor-pointer"
                    >
                      +1 Mes
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const base = parseISO(fechaInicio);
                          setFechaFinRecurrencia(format(addMonths(base, 2), 'yyyy-MM-dd'));
                        } catch {}
                      }}
                      className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 cursor-pointer"
                    >
                      +2 Meses
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try {
                          const base = parseISO(fechaInicio);
                          setFechaFinRecurrencia(format(addMonths(base, 3), 'yyyy-MM-dd'));
                        } catch {}
                      }}
                      className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 cursor-pointer"
                    >
                      +3 Meses
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFechaFinRecurrencia('2026-12-31');
                      }}
                      className="px-2 py-0.5 rounded-md bg-white hover:bg-amber-100 text-amber-900 font-bold border border-amber-300 cursor-pointer"
                    >
                      Fin de Año (31 Dic)
                    </button>
                  </div>

                  {/* Preview summary */}
                  <div className="text-[11px] text-amber-900 font-bold bg-white/80 p-2 rounded-lg border border-amber-200 flex items-center justify-between">
                    <span>Total a programar: {previewRecurringDates.length} bloqueos</span>
                    <span>Hasta: {formatDateDDMMYYYY(fechaFinRecurrencia)}</span>
                  </div>
                </div>
              )}
            </div>

            {!esRecurrente && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fecha Desde *
                  </label>
                  <input
                    type="date"
                    value={fechaInicio}
                    onChange={(e) => setFechaInicio(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fecha Hasta *
                  </label>
                  <input
                    type="date"
                    value={fechaFin}
                    onChange={(e) => setFechaFin(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Checkbox Todo el Día */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={todoElDia}
                onChange={(e) => setTodoElDia(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800">
                Bloquear jornada completa (Todo el día)
              </span>
            </label>

            {!todoElDia && (
              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Hora Inicio
                  </label>
                  <input
                    type="time"
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Hora Término
                  </label>
                  <input
                    type="time"
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Descripción / Detalle de los Trabajos */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Detalle del Trabajo / Obra *
            </label>
            <textarea
              rows={2}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej: Pintura de cancha central y demarcación de líneas..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
            />
          </div>

          {/* Responsable y Contacto Técnico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Responsable Técnico / Encargado
              </label>
              <input
                type="text"
                value={responsableMantenimiento}
                onChange={(e) => setResponsableMantenimiento(e.target.value)}
                placeholder="Ej: Juan Silva (Mantención)"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Empresa / Teléfono de Contacto
              </label>
              <input
                type="text"
                value={contactoEmpresa}
                onChange={(e) => setContactoEmpresa(e.target.value)}
                placeholder="Ej: Constructora ABC / +569..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Subespacios */}
          <label className="flex items-center space-x-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={bloquearSubEspacios}
              onChange={(e) => setBloquearSubEspacios(e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
            />
            <span className="text-xs text-slate-600">
              Inhabilitar también divisiones internas o salas contiguas compuestas
            </span>
          </label>

          {/* Modal Footer Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold shadow-md transition cursor-pointer flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? 'Guardando...' : editingBlock ? 'Guardar Cambios' : 'Crear Bloqueo'}</span>
            </button>
          </div>
        </form>
      </div>
    </ModalOverlay>
  );
};
