import { ModalOverlay } from './common/ModalOverlay';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Repeat,
  Calendar,
  CalendarDays,
  Clock,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Plus,
  ChevronDown,
  Search,
  Filter,
  X,
  Edit2,
  CalendarPlus,
  Check,
  Layers
} from 'lucide-react';
import {
  format,
  parseISO,
  addMonths,
  addDays,
  isAfter,
  getDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Reservation, SpaceInfo, ActivityTypeItem } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { detectBatchConflicts } from '../utils/conflictDetector';
import { usePagination } from '../hooks/usePagination';
import { PaginationControls } from './common/PaginationControls';
import { IndependentReservationGrouping } from './IndependentReservationGrouping';
import { ConfirmationModal } from './common/ConfirmationModal';

const WEEKDAYS = [
  { dayNum: 1, key: 'lunes', short: 'Lun', full: 'Lunes' },
  { dayNum: 2, key: 'martes', short: 'Mar', full: 'Martes' },
  { dayNum: 3, key: 'miercoles', short: 'Mié', full: 'Miércoles' },
  { dayNum: 4, key: 'jueves', short: 'Jue', full: 'Jueves' },
  { dayNum: 5, key: 'viernes', short: 'Vie', full: 'Viernes' },
  { dayNum: 6, key: 'sabado', short: 'Sáb', full: 'Sábado' },
  { dayNum: 0, key: 'domingo', short: 'Dom', full: 'Domingo' }
];

export interface RecurringSeriesGroup {
  seriesId: string;
  tipoActividad: string;
  espacio: string;
  responsable: string;
  telefonoContacto: string;
  emailContacto: string;
  horaInicio: string;
  horaFin: string;
  descripcion: string;
  fechaInicio: string;
  fechaFin: string; // Hasta qué fecha se repite
  diasSemana: number[]; // [1, 3] etc.
  reservations: Reservation[];
  totalSesiones: number;
  sesionesFuturas: number;
  sesionesPasadas: number;
}

/**
 * Formats session counts with accurate singular and plural Spanish grammar:
 * e.g. "(1 sesión: 1 futura, 0 pasadas)" or "(5 sesiones: 3 futuras, 2 pasadas)"
 */
export function formatSessionCounts(total: number, futuras: number, pasadas: number): string {
  const totalText = total === 1 ? '1 sesión' : `${total} sesiones`;
  const futurasText = futuras === 1 ? '1 futura' : `${futuras} futuras`;
  const pasadasText = pasadas === 1 ? '1 pasada' : `${pasadas} pasadas`;
  return `(${totalText}: ${futurasText}, ${pasadasText})`;
}

interface AdminRecurringViewProps {
  reservations: Reservation[];
  spaces: SpaceInfo[];
  activityTypes: ActivityTypeItem[];
  onSaveReservation?: (
    reserva: Reservation,
    generateSeries?: boolean,
    explicitSlots?: Array<{ fecha: string; horaInicio: string; horaFin: string; espacio: string }>,
    updateWholeSeries?: boolean
  ) => Promise<boolean>;
  onDeleteReservation?: (id: string, seriesId?: string) => Promise<void>;
  onEditReservation?: (reservation: Reservation) => void;
}

interface RecurringSeriesCardProps {
  series: RecurringSeriesGroup;
  isExpanded: boolean;
  todayStr: string;
  onToggleExpand: (seriesId: string) => void;
  onOpenModify: (series: RecurringSeriesGroup) => void;
  onEditReservation?: (reservation: Reservation) => void;
  onDeleteReservation?: (id: string, seriesId?: string) => Promise<void>;
}

const RecurringSeriesCard = React.memo<RecurringSeriesCardProps>(({
  series,
  isExpanded,
  todayStr,
  onToggleExpand,
  onOpenModify,
  onEditReservation,
  onDeleteReservation
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Formatted days string
  const daysLabel = series.diasSemana
    .map((d) => WEEKDAYS.find((w) => w.dayNum === d)?.short || '')
    .filter(Boolean)
    .join(', ');

  return (
    <div
      data-virtualized-item={series.seriesId}
      className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden transition-all hover:border-slate-300"
    >
      <div className="p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        {/* Left Column: Activity & Space Info */}
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-sm sm:text-base font-black text-slate-900 truncate">
              {series.tipoActividad}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200 flex items-center space-x-1">
              <Building2 className="w-3 h-3 text-slate-500" />
              <span>{series.espacio}</span>
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200 flex items-center space-x-1">
              <Clock className="w-3 h-3 text-blue-500" />
              <span>{series.horaInicio} - {series.horaFin} hrs</span>
            </span>
          </div>

          <div className="text-xs text-slate-600 flex items-center flex-wrap gap-x-4 gap-y-1">
            <span><strong>Responsable:</strong> {series.responsable}</span>
            {series.telefonoContacto && <span><strong>Tel:</strong> {series.telefonoContacto}</span>}
            {series.emailContacto && <span><strong>Email:</strong> {series.emailContacto}</span>}
          </div>

          {/* Recurrence Summary & Crucial "Hasta qué fecha" */}
          <div className="flex items-center flex-wrap gap-2 pt-1 text-xs">
            <div className="flex items-center space-x-1 text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
              <span><strong>Días:</strong> {daysLabel || 'Días seleccionados'}</span>
            </div>

            <div className="flex items-center space-x-1 text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span><strong>Desde:</strong> {formatDateDDMMYYYY(series.fechaInicio)}</span>
            </div>

            {/* PROMINENT REPEAT UNTIL DATE BADGE */}
            <div className="flex items-center space-x-1.5 text-emerald-800 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-300 font-bold shadow-2xs">
              <Repeat className="w-3.5 h-3.5 text-emerald-600 animate-spin-slow" />
              <span>Se repite hasta: {formatDateDDMMYYYY(series.fechaFin)}</span>
            </div>

            <span className="text-[11px] text-slate-500 font-medium">
              {formatSessionCounts(series.totalSesiones, series.sesionesFuturas, series.sesionesPasadas)}
            </span>
          </div>
        </div>

        {/* Right Column: Actions */}
        <div className="flex items-center flex-wrap gap-2 shrink-0">
          {/* Primary Action: Modificar hasta qué fecha se repite */}
          <button
            type="button"
            id={`btn-modify-until-${series.seriesId}`}
            onClick={() => onOpenModify(series)}
            className="min-h-[40px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1.5 cursor-pointer active:scale-95"
            title="Extiende o recorta hasta qué fecha se repetirá esta actividad"
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Modificar hasta qué fecha se repite</span>
          </button>

          {/* Toggle Sessions Detail */}
          <button
            type="button"
            onClick={() => onToggleExpand(series.seriesId)}
            className="min-h-[40px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
            title="Ver todas las fechas programadas de la serie"
          >
            <span>{isExpanded ? 'Ocultar fechas' : `Ver fechas (${series.totalSesiones})`}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </button>

          {/* Full Edit Modal */}
          {onEditReservation && series.reservations[0] && (
            <button
              type="button"
              onClick={() => onEditReservation(series.reservations[0])}
              className="min-h-[40px] p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition cursor-pointer"
              title="Abrir en formulario completo de reserva"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          )}

          {/* Delete Series */}
          {onDeleteReservation && series.reservations[0] && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="min-h-[40px] p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl border border-rose-200 transition cursor-pointer"
              title="Eliminar todas las sesiones de la serie"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Dates View */}
      {isExpanded && (
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-200 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              Calendario de sesiones programadas ({series.totalSesiones}):
            </span>
            <span className="text-[11px] text-slate-500">
              Inicia: {formatDateDDMMYYYY(series.fechaInicio)} • Finaliza: {formatDateDDMMYYYY(series.fechaFin)}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {series.reservations.map((r, idx) => {
              const isPast = r.fecha < todayStr;
              const isToday = r.fecha === todayStr;

              return (
                <div
                  key={r.id}
                  className={`p-2 rounded-xl border text-center transition ${
                    isToday
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold shadow-2xs'
                      : isPast
                      ? 'bg-slate-100 border-slate-200 text-slate-400'
                      : 'bg-white border-slate-200 text-slate-800 font-medium hover:border-blue-400'
                  }`}
                >
                  <span className="text-[10px] block uppercase font-bold text-slate-500">
                    {(() => {
                      try {
                        return format(parseISO(r.fecha), 'EEE', { locale: es });
                      } catch {
                        return '';
                      }
                    })()}
                  </span>
                  <span className="text-xs font-bold block">{formatDateDDMMYYYY(r.fecha)}</span>
                  <span className="text-[9.5px] block text-slate-500">
                    #{idx + 1} {isToday ? '• Hoy' : isPast ? '• Pasada' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={confirmDelete}
        title="Eliminar serie recurrente"
        message={`Se cancelarán las ${series.totalSesiones} sesiones de "${series.tipoActividad}".`}
        confirmLabel="Eliminar serie"
        variant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (onDeleteReservation) await onDeleteReservation(series.reservations[0].id, series.seriesId);
          setConfirmDelete(false);
        }}
      />
    </div>
  );
});
RecurringSeriesCard.displayName = 'RecurringSeriesCard';

export const AdminRecurringView: React.FC<AdminRecurringViewProps> = ({
  reservations,
  spaces,
  activityTypes,
  onSaveReservation,
  onDeleteReservation,
  onEditReservation
}) => {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  // Search & Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [spaceFilter, setSpaceFilter] = useState('ALL');
  const [expandedSeriesId, setExpandedSeriesId] = useState<string | null>(null);

  // Group reservations into recurring series - Declared FIRST
  const recurringSeriesList: RecurringSeriesGroup[] = useMemo(() => {
    const seriesMap = new Map<string, Reservation[]>();

    reservations.forEach((r) => {
      // Require a stable series identifier (serieRecurrente or recurrenteId)
      // Excludes single/unlinked reservations without a seriesId
      const seriesKey = (r.serieRecurrente || r.recurrenteId || '').trim();
      if (!seriesKey) return;

      const list = seriesMap.get(seriesKey) || [];
      list.push(r);
      seriesMap.set(seriesKey, list);
    });

    const result: RecurringSeriesGroup[] = [];

    seriesMap.forEach((items, key) => {
      // Exclude single-session reservations: a true recurring series must have at least 2 sessions
      if (items.length < 2) return;
      // Sort items by date ascending
      const sorted = [...items].sort((a, b) => a.fecha.localeCompare(b.fecha));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      // Collect weekdays
      const daySet = new Set<number>();
      sorted.forEach((r) => {
        try {
          const d = parseISO(r.fecha);
          daySet.add(getDay(d));
        } catch {
          // ignore
        }
      });
      const diasSemana = Array.from(daySet).sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));

      const sesionesFuturas = sorted.filter((r) => r.fecha >= todayStr).length;
      const sesionesPasadas = sorted.filter((r) => r.fecha < todayStr).length;

      result.push({
        seriesId: key,
        tipoActividad: first.tipoActividad || 'Actividad',
        espacio: first.espacio || 'Espacio',
        responsable: first.responsable || 'Sin responsable',
        telefonoContacto: first.telefonoContacto || '',
        emailContacto: first.emailContacto || '',
        horaInicio: first.horaInicio || '10:00',
        horaFin: first.horaFin || '11:00',
        descripcion: first.descripcion || '',
        fechaInicio: first.fecha,
        fechaFin: last.fecha, // Hasta qué fecha se repite
        diasSemana: diasSemana.length > 0 ? diasSemana : [getDay(parseISO(first.fecha))],
        reservations: sorted,
        totalSesiones: sorted.length,
        sesionesFuturas,
        sesionesPasadas
      });
    });

    // Sort by latest active series first
    return result.sort((a, b) => b.fechaFin.localeCompare(a.fechaFin));
  }, [reservations, todayStr]);

  // Filtered series
  const filteredSeries = useMemo(() => {
    return recurringSeriesList.filter((s) => {
      if (spaceFilter !== 'ALL' && s.espacio !== spaceFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchAct = s.tipoActividad.toLowerCase().includes(q);
        const matchResp = s.responsable.toLowerCase().includes(q);
        const matchSpace = s.espacio.toLowerCase().includes(q);
        if (!matchAct && !matchResp && !matchSpace) return false;
      }
      return true;
    });
  }, [recurringSeriesList, spaceFilter, searchTerm]);

  // Pagination on filteredSeries (renders initially 50 series, strictly limiting DOM nodes)
  const { 
    paginatedItems, 
    currentPage, 
    setCurrentPage, 
    pageSize, 
    setPageSize, 
    totalPages,
    startIndex,
    endIndex,
    totalItems
  } = usePagination(filteredSeries, 10);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, spaceFilter, setCurrentPage]);

  // Modal: Modificar hasta qué fecha se repite
  const [modifyingSeries, setModifyingSeries] = useState<RecurringSeriesGroup | null>(null);
  const [newEndDate, setNewEndDate] = useState<string>('');
  const [isUpdatingEndDate, setIsUpdatingEndDate] = useState(false);
  const [modifyError, setModifyError] = useState<string | null>(null);
  const [modifySuccess, setModifySuccess] = useState<string | null>(null);

  // Modal / Form: Nueva Actividad Recurrente
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newEspacio, setNewEspacio] = useState(spaces[0]?.name || 'GIMNASIO');
  const [newTipoActividad, setNewTipoActividad] = useState(activityTypes[0]?.name || 'TALLER CCD');
  const [newResponsable, setNewResponsable] = useState('');
  const [newTelefono, setNewTelefono] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDescripcion, setNewDescripcion] = useState('');
  const [newHoraInicio, setNewHoraInicio] = useState('10:00');
  const [newHoraFin, setNewHoraFin] = useState('11:30');
  const [newFechaInicio, setNewFechaInicio] = useState(todayStr);
  const [newFechaFin, setNewFechaFin] = useState(() => {
    try {
      return format(addMonths(new Date(), 2), 'yyyy-MM-dd');
    } catch {
      return '2026-12-31';
    }
  });
  const [newSelectedDays, setNewSelectedDays] = useState<number[]>([new Date().getDay()]);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newSeriesError, setNewSeriesError] = useState<string | null>(null);
  const [newSeriesSuccess, setNewSeriesSuccess] = useState<string | null>(null);

  // Calculate upcoming preview dates for modifying series
  const modifyPreview = useMemo(() => {
    if (!modifyingSeries || !newEndDate) return null;
    const { fechaFin: curEnd, fechaInicio, diasSemana, reservations: curList } = modifyingSeries;

    if (newEndDate === curEnd) {
      return { type: 'same', count: 0, newDates: [], datesToRemove: [] };
    }

    if (newEndDate > curEnd) {
      // Extending: generate candidate dates between curEnd and newEndDate
      const newDates: string[] = [];
      const curDateSet = new Set(curList.map((r) => r.fecha));

      try {
        let runner = addDays(parseISO(curEnd), 1);
        const endTarget = parseISO(newEndDate);

        while (!isAfter(runner, endTarget)) {
          const dayNum = getDay(runner);
          if (diasSemana.includes(dayNum)) {
            const dateStr = format(runner, 'yyyy-MM-dd');
            if (!curDateSet.has(dateStr)) {
              newDates.push(dateStr);
            }
          }
          runner = addDays(runner, 1);
        }
      } catch (err) {
        console.error('Error generating preview extension:', err);
      }

      // Check conflicts for new candidate dates
      const candidateSlots = newDates.map((d) => ({
        id: `PREV_${d}`,
        fecha: d,
        horaInicio: modifyingSeries.horaInicio,
        horaFin: modifyingSeries.horaFin,
        espacio: modifyingSeries.espacio,
        responsable: modifyingSeries.responsable,
        tipoActividad: modifyingSeries.tipoActividad,
        actividadRecurrente: 'Sí' as const,
        estado: 'activa' as const
      })) as Reservation[];

      const conflicts = detectBatchConflicts(
        candidateSlots,
        reservations.filter((r) => !curList.some((c) => c.id === r.id))
      );

      return {
        type: 'extend',
        count: newDates.length,
        newDates,
        datesToRemove: [],
        conflicts
      };
    } else {
      // Shortening: find sessions that will be cut off
      const datesToRemove = curList.filter((r) => r.fecha > newEndDate);
      return {
        type: 'shrink',
        count: datesToRemove.length,
        newDates: [],
        datesToRemove,
        conflicts: []
      };
    }
  }, [modifyingSeries, newEndDate, reservations]);

  // Handle open Modify Modal
  const handleOpenModify = (series: RecurringSeriesGroup) => {
    setModifyingSeries(series);
    setNewEndDate(series.fechaFin);
    setModifyError(null);
    setModifySuccess(null);
  };

  // Confirm modification of "Hasta qué fecha se repite"
  const handleConfirmModifyEndDate = async () => {
    if (!modifyingSeries || !newEndDate || !onSaveReservation) return;

    if (newEndDate < modifyingSeries.fechaInicio) {
      setModifyError('La fecha de término no puede ser anterior a la fecha de inicio de la serie.');
      return;
    }

    setIsUpdatingEndDate(true);
    setModifyError(null);
    setModifySuccess(null);

    try {
      const { reservations: curList, diasSemana, horaInicio, horaFin, espacio } = modifyingSeries;
      const firstRes = curList[0];

      // Build explicit slots list from fechaInicio to newEndDate
      const allSlots: Array<{ fecha: string; horaInicio: string; horaFin: string; espacio: string }> = [];

      // 1. Existing sessions that are on or before newEndDate
      curList.forEach((r) => {
        if (r.fecha <= newEndDate) {
          allSlots.push({
            fecha: r.fecha,
            horaInicio: r.horaInicio || horaInicio,
            horaFin: r.horaFin || horaFin,
            espacio: r.espacio || espacio
          });
        }
      });

      // 2. If extending, add the newly generated dates
      if (modifyPreview?.type === 'extend' && modifyPreview.newDates.length > 0) {
        modifyPreview.newDates.forEach((d) => {
          allSlots.push({
            fecha: d,
            horaInicio,
            horaFin,
            espacio
          });
        });
      }

      // Sort all slots chronologically
      allSlots.sort((a, b) => a.fecha.localeCompare(b.fecha));

      const updatedReserva: Reservation = {
        ...firstRes,
        actividadRecurrente: 'Sí',
        fechaFinRecurrencia: newEndDate,
        totalEnSerie: allSlots.length
      };

      const success = await onSaveReservation(updatedReserva, false, allSlots, true);

      if (success !== false) {
        setModifySuccess(`¡Fecha término actualizada con éxito! La serie ahora se repite hasta el ${formatDateDDMMYYYY(newEndDate)} (${allSlots.length} ${allSlots.length === 1 ? 'sesión' : 'sesiones'} en total).`);
        setTimeout(() => {
          setModifyingSeries(null);
        }, 1500);
      } else {
        setModifyError('No se pudo guardar la modificación por conflictos con otras reservas existentes.');
      }
    } catch (err: any) {
      setModifyError(err?.message || 'Error al actualizar la fecha de repetición.');
    } finally {
      setIsUpdatingEndDate(false);
    }
  };

  // Preview dates for creating new recurring series
  const newSeriesDatesPreview = useMemo(() => {
    if (!newFechaInicio || !newFechaFin || newSelectedDays.length === 0) return [];
    if (newFechaFin < newFechaInicio) return [];

    const dates: string[] = [];
    try {
      let runner = parseISO(newFechaInicio);
      const endTarget = parseISO(newFechaFin);

      while (!isAfter(runner, endTarget)) {
        const dayNum = getDay(runner);
        if (newSelectedDays.includes(dayNum)) {
          dates.push(format(runner, 'yyyy-MM-dd'));
        }
        runner = addDays(runner, 1);
      }
    } catch (e) {
      // ignore
    }
    return dates;
  }, [newFechaInicio, newFechaFin, newSelectedDays]);

  // Check conflicts for new series
  const newSeriesConflicts = useMemo(() => {
    if (newSeriesDatesPreview.length === 0) return [];

    const candidateSlots = newSeriesDatesPreview.map((d) => ({
      id: `CAND_${d}`,
      fecha: d,
      horaInicio: newHoraInicio,
      horaFin: newHoraFin,
      espacio: newEspacio,
      responsable: newResponsable || 'Responsable',
      tipoActividad: newTipoActividad,
      actividadRecurrente: 'Sí' as const,
      estado: 'activa' as const
    })) as Reservation[];

    return detectBatchConflicts(candidateSlots, reservations);
  }, [newSeriesDatesPreview, newHoraInicio, newHoraFin, newEspacio, newResponsable, newTipoActividad, reservations]);

  // Handle Create New Series
  const handleCreateNewSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveReservation) return;

    if (!newResponsable.trim()) {
      setNewSeriesError('Debes ingresar el nombre del responsable o solicitante.');
      return;
    }
    if (newSelectedDays.length === 0) {
      setNewSeriesError('Debes seleccionar al menos un día de la semana.');
      return;
    }
    if (newFechaFin < newFechaInicio) {
      setNewSeriesError('La fecha hasta la que se repite no puede ser anterior a la fecha de inicio.');
      return;
    }
    if (newSeriesDatesPreview.length === 0) {
      setNewSeriesError('No se generó ninguna fecha válida en el rango seleccionado.');
      return;
    }
    if (newSeriesConflicts.length > 0) {
      setNewSeriesError(`No se puede crear la serie: hay ${newSeriesConflicts.length} topamientos con reservas existentes.`);
      return;
    }

    setIsCreatingNew(true);
    setNewSeriesError(null);
    setNewSeriesSuccess(null);

    try {
      const explicitSlots = newSeriesDatesPreview.map((d) => ({
        fecha: d,
        horaInicio: newHoraInicio,
        horaFin: newHoraFin,
        espacio: newEspacio
      }));

      const baseReserva: Partial<Reservation> = {
        fecha: newSeriesDatesPreview[0],
        horaInicio: newHoraInicio,
        horaFin: newHoraFin,
        espacio: newEspacio,
        responsable: newResponsable.trim(),
        telefonoContacto: newTelefono.trim(),
        emailContacto: newEmail.trim(),
        tipoActividad: newTipoActividad,
        descripcion: newDescripcion.trim() || `Serie recurrente hasta el ${formatDateDDMMYYYY(newFechaFin)}`,
        actividadRecurrente: 'Sí',
        tipoRecurrencia: 'semanal',
        fechaInicioRecurrencia: newFechaInicio,
        fechaFinRecurrencia: newFechaFin,
        totalEnSerie: explicitSlots.length,
        estado: 'activa',
        realizada: 'No'
      };

      const success = await onSaveReservation(baseReserva as Reservation, true, explicitSlots, false);

      if (success !== false) {
        setNewSeriesSuccess(`¡Serie recurrente creada con éxito! Se programaron ${explicitSlots.length} repeticiones hasta el ${formatDateDDMMYYYY(newFechaFin)}.`);
        setTimeout(() => {
          setIsNewModalOpen(false);
          setNewSeriesSuccess(null);
          setNewResponsable('');
          setNewDescripcion('');
        }, 1500);
      } else {
        setNewSeriesError('Error al crear la serie recurrente por topamientos detectados.');
      }
    } catch (err: any) {
      setNewSeriesError(err?.message || 'Error inesperado al crear la serie recurrente.');
    } finally {
      setIsCreatingNew(false);
    }
  };

  const toggleDaySelection = (dayNum: number) => {
    setNewSelectedDays((prev) =>
      prev.includes(dayNum) ? prev.filter((d) => d !== dayNum) : [...prev, dayNum].sort((a, b) => a - b)
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner with Direct Action */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20 shrink-0">
            <Repeat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Programación de Actividades Recurrentes</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-bold">
                {recurringSeriesList.length} series activas
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Configura talleres y actividades que se repiten periódicamente y define exactamente <strong>hasta qué fecha se repiten</strong>.
            </p>
          </div>
        </div>

        <button
          type="button"
          id="btn-admin-new-recurring"
          onClick={() => {
            setIsNewModalOpen(true);
            setNewSeriesError(null);
            setNewSeriesSuccess(null);
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/20 transition cursor-pointer flex items-center space-x-2 shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Nueva Actividad Recurrente</span>
        </button>
      </div>

      <IndependentReservationGrouping />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Series Recurrentes</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-900">{recurringSeriesList.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">Talleres y cursos regulares</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Sesiones Futuras</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-emerald-600">
            {recurringSeriesList.reduce((acc, s) => acc + s.sesionesFuturas, 0)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Clases y sesiones por realizar</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Espacios Ocupados</span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-purple-600">
            {new Set(recurringSeriesList.map((s) => s.espacio)).size}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Salas con uso periódico fijado</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">Total Histórico</span>
            <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black text-slate-700">
            {recurringSeriesList.reduce((acc, s) => acc + s.totalSesiones, 0)}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Sesiones vinculadas a series</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-2 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por actividad, responsable..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={spaceFilter}
              onChange={(e) => setSpaceFilter(e.target.value)}
              className="px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Todos los espacios</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Mostrando {startIndex + 1} - {endIndex} de {totalItems} series
        </div>
      </div>

      {/* Series List */}
      {totalItems === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <Repeat className="w-10 h-10 mx-auto text-slate-300" />
          <h3 className="text-sm font-bold text-slate-800">No se encontraron actividades recurrentes</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Puedes programar una nueva serie que se repita semanalmente definiendo el día y hasta qué fecha se extenderá.
          </p>
          <button
            type="button"
            onClick={() => setIsNewModalOpen(true)}
            className="inline-flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Crear la primera actividad recurrente</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            role="feed"
            aria-label="Listado de actividades recurrentes"
            aria-busy="false"
            tabIndex={0}
            className="space-y-3 focus:outline-none"
          >
            {paginatedItems.map((series) => (
              <RecurringSeriesCard
                key={series.seriesId}
                series={series}
                isExpanded={expandedSeriesId === series.seriesId}
                todayStr={todayStr}
                onToggleExpand={(id) => setExpandedSeriesId((prev) => (prev === id ? null : id))}
                onOpenModify={handleOpenModify}
                onEditReservation={onEditReservation}
                onDeleteReservation={onDeleteReservation}
              />
            ))}
          </div>

          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={setCurrentPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 20, 50]}
            itemLabel="series"
          />
        </div>
      )}

      {/* MODAL: Modificar hasta qué fecha se repite */}
      {modifyingSeries && (
        <ModalOverlay onClose={() => { if (!isUpdatingEndDate) setModifyingSeries(null); }} className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-700 rounded-xl shadow-xs">
                  <Repeat className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-base sm:text-lg">
                    Modificar Fecha Término de Repetición
                  </h2>
                  <p className="text-xs text-emerald-100">
                    Define hasta qué fecha continuará repitiéndose esta serie
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModifyingSeries(null)}
                className="p-1.5 rounded-lg text-emerald-200 hover:text-white hover:bg-emerald-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4">
              {/* Activity Info Summary */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1 text-xs">
                <div className="font-bold text-slate-900 text-sm">{modifyingSeries.tipoActividad}</div>
                <div className="text-slate-600">
                  {modifyingSeries.espacio} • {modifyingSeries.horaInicio} - {modifyingSeries.horaFin} hrs
                </div>
                <div className="text-slate-500">
                  Responsable: <strong>{modifyingSeries.responsable}</strong>
                </div>
                <div className="text-slate-500 pt-1">
                  Fecha inicio: <strong>{formatDateDDMMYYYY(modifyingSeries.fechaInicio)}</strong> • Fecha término actual: <strong className="text-emerald-700">{formatDateDDMMYYYY(modifyingSeries.fechaFin)}</strong>
                </div>
              </div>

              {/* Input: Hasta qué fecha se repite */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>¿Hasta qué fecha se repetirá la actividad?</span>
                  <span className="text-[11px] font-normal text-emerald-700">Nueva Fecha Término</span>
                </label>

                <input
                  type="date"
                  id="input-admin-new-until-date"
                  required
                  min={modifyingSeries.fechaInicio}
                  value={newEndDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-sm shadow-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />

                {/* Quick Date Shortcuts */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                  <span className="text-slate-500 font-semibold">Extender hasta:</span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const base = parseISO(modifyingSeries.fechaFin);
                        setNewEndDate(format(addMonths(base, 1), 'yyyy-MM-dd'));
                      } catch {}
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                  >
                    +1 Mes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const base = parseISO(modifyingSeries.fechaFin);
                        setNewEndDate(format(addMonths(base, 3), 'yyyy-MM-dd'));
                      } catch {}
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                  >
                    +3 Meses
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewEndDate('2026-12-31');
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                  >
                    Fin de Año (31 Dic)
                  </button>
                </div>
              </div>

              {/* Dynamic Preview Feedback */}
              {modifyPreview && (
                <div className="pt-2">
                  {modifyPreview.type === 'extend' && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-2">
                      <div className="flex items-center space-x-1.5 text-emerald-900 font-bold">
                        <CalendarPlus className="w-4 h-4 text-emerald-600" />
                        <span>Se extenderá la serie en {modifyPreview.count} {modifyPreview.count === 1 ? 'nueva sesión' : 'nuevas sesiones'}</span>
                      </div>
                      <p className="text-[11px] text-emerald-800">
                        La actividad continuará repitiéndose hasta el <strong>{formatDateDDMMYYYY(newEndDate)}</strong>.
                      </p>

                      {modifyPreview.conflicts && modifyPreview.conflicts.length > 0 && (
                        <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-1">
                          <span className="font-bold flex items-center space-x-1">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Atención: {modifyPreview.conflicts.length} fecha(s) tienen topamiento en este espacio</span>
                          </span>
                          <p className="text-[10.5px] text-amber-800">
                            Revisa las fechas en conflicto antes de confirmar para evitar superposiciones con otras actividades.
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {modifyPreview.type === 'shrink' && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center space-x-1.5 text-rose-900 font-bold">
                        <AlertTriangle className="w-4 h-4 text-rose-600" />
                        <span>Se recortará la serie ({modifyPreview.count} {modifyPreview.count === 1 ? 'sesión posterior' : 'sesiones posteriores'} al {formatDateDDMMYYYY(newEndDate)} serán canceladas)</span>
                      </div>
                      <p className="text-[11px] text-rose-800">
                        Las sesiones programadas con fecha posterior al nuevo término serán eliminadas de la programación.
                      </p>
                    </div>
                  )}

                  {modifyPreview.type === 'same' && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600">
                      La fecha seleccionada es idéntica a la fecha de término actual.
                    </div>
                  )}
                </div>
              )}

              {/* Status Messages */}
              {modifyError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 font-medium flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{modifyError}</span>
                </div>
              )}

              {modifySuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{modifySuccess}</span>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setModifyingSeries(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-modify-until"
                disabled={isUpdatingEndDate || newEndDate === modifyingSeries.fechaFin}
                onClick={handleConfirmModifyEndDate}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUpdatingEndDate ? (
                  <span>Guardando cambios...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Guardar y Actualizar Término</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* MODAL: Nueva Actividad Recurrente */}
      {isNewModalOpen && (
        <ModalOverlay onClose={() => { if (!isCreatingNew) setIsNewModalOpen(false); }} className="fixed inset-0 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-700 rounded-xl shadow-xs">
                  <Repeat className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="font-bold text-base sm:text-lg">
                    Nueva Actividad Recurrente (Opción Admin)
                  </h2>
                  <p className="text-xs text-blue-100">
                    Programa una serie periódica indicando los días y hasta qué fecha se repite
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-blue-700 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateNewSeries} className="p-5 overflow-y-auto space-y-4">
              {/* Espacio & Tipo de Actividad */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Espacio o Sala:</label>
                  <select
                    value={newEspacio}
                    onChange={(e) => setNewEspacio(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {spaces.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Tipo de Actividad:</label>
                  <select
                    value={newTipoActividad}
                    onChange={(e) => setNewTipoActividad(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {activityTypes.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Responsable & Contacto */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-xs font-bold text-slate-700">Responsable / Docente:</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej: Profesor Juan Pérez"
                    value={newResponsable}
                    onChange={(e) => setNewResponsable(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Teléfono:</label>
                  <input
                    type="text"
                    placeholder="+56 9 1234 5678"
                    value={newTelefono}
                    onChange={(e) => setNewTelefono(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Email:</label>
                  <input
                    type="email"
                    placeholder="contacto@correo.cl"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Horario */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Hora Inicio:</label>
                  <input
                    type="time"
                    required
                    value={newHoraInicio}
                    onChange={(e) => setNewHoraInicio(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Hora Fin:</label>
                  <input
                    type="time"
                    required
                    value={newHoraFin}
                    onChange={(e) => setNewHoraFin(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Días de la semana en que se repite */}
              <div className="space-y-1.5 pt-1">
                <label className="text-xs font-bold text-slate-800 block">
                  Días de la semana en que se repetirá:
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const isSelected = newSelectedDays.includes(day.dayNum);
                    return (
                      <button
                        key={day.dayNum}
                        type="button"
                        onClick={() => toggleDaySelection(day.dayNum)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rango de fechas: Desde y HASTA QUÉ FECHA SE REPITE */}
              <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700 block">Fecha Inicio:</label>
                    <input
                      type="date"
                      required
                      value={newFechaInicio}
                      onChange={(e) => setNewFechaInicio(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* CRITICAL FIELD: HASTA QUÉ FECHA SE REPITE */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-blue-900 block flex items-center justify-between">
                      <span>¿Hasta qué fecha se repite?</span>
                      <span className="text-[10px] text-blue-700 font-bold">Límite de la serie</span>
                    </label>
                    <input
                      type="date"
                      required
                      min={newFechaInicio}
                      value={newFechaFin}
                      onChange={(e) => setNewFechaFin(e.target.value)}
                      className="w-full px-3 py-2 bg-white border-2 border-blue-500 rounded-xl text-xs font-bold text-blue-950 font-mono focus:ring-2 focus:ring-blue-600 focus:outline-none shadow-2xs"
                    />
                  </div>
                </div>

                {/* Quick Date Shortcuts for Repetition End */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="text-slate-600 font-semibold">Repetir hasta:</span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const base = parseISO(newFechaInicio);
                        setNewFechaFin(format(addMonths(base, 1), 'yyyy-MM-dd'));
                      } catch {}
                    }}
                    className="px-2 py-0.5 rounded-md bg-white hover:bg-blue-100 text-blue-800 font-bold border border-blue-200 cursor-pointer"
                  >
                    +1 Mes
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const base = parseISO(newFechaInicio);
                        setNewFechaFin(format(addMonths(base, 3), 'yyyy-MM-dd'));
                      } catch {}
                    }}
                    className="px-2 py-0.5 rounded-md bg-white hover:bg-blue-100 text-blue-800 font-bold border border-blue-200 cursor-pointer"
                  >
                    +3 Meses
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFechaFin('2026-12-31');
                    }}
                    className="px-2 py-0.5 rounded-md bg-white hover:bg-blue-100 text-blue-800 font-bold border border-blue-200 cursor-pointer"
                  >
                    Fin de Año (31 Dic)
                  </button>
                </div>

                {/* Preview summary */}
                <div className="pt-1 flex items-center justify-between text-xs">
                  <span className="font-bold text-blue-900">
                    Total a generar: {newSeriesDatesPreview.length} {newSeriesDatesPreview.length === 1 ? 'sesión' : 'sesiones'}
                  </span>
                  {newSeriesConflicts.length > 0 ? (
                    <span className="font-bold text-rose-600 flex items-center space-x-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>{newSeriesConflicts.length} topamiento(s) detectado(s)</span>
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-600 flex items-center space-x-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Todas las fechas disponibles</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Status / Error feedback */}
              {newSeriesError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 font-medium flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{newSeriesError}</span>
                </div>
              )}

              {newSeriesSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 font-bold flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{newSeriesSuccess}</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  id="btn-confirm-create-recurring-series"
                  disabled={isCreatingNew || newSeriesDatesPreview.length === 0 || newSeriesConflicts.length > 0}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingNew ? (
                    <span>Programando serie...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Programar {newSeriesDatesPreview.length} Repeticiones</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
};
