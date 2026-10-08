import { formatDisplayTitle } from '../utils/reservationVisuals';
import React, { useMemo } from 'react';
import {
  CalendarDays,
  CalendarPlus,
  Plus,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Trash2,
  CheckCircle2,
  Clock,
  Sparkles,
  AlertTriangle,
  Layers,
  Check,
  Repeat
} from 'lucide-react';
import {
  format,
  parseISO,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Reservation, SpaceInfo, CustomScheduleSlot } from '../types';
import { formatDateDDMMYYYY, WEEKDAYS } from '../utils/dateUtils';
import { getChileanHolidayInfo, HolidayFilterResult } from '../utils/holidayUtils';

export { WEEKDAYS };
export type { CustomScheduleSlot };


export interface RecurrenceScheduleSectionProps {
  bookingMode: 'single' | 'specific' | 'pattern';
  isEditingSingleOccurrence: boolean;
  editingReservation?: Reservation | null;
  generateFullSeries: boolean;
  setGenerateFullSeries: (val: boolean) => void;
  formData: Partial<Reservation>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  specificDates: string[];
  setSpecificDates: React.Dispatch<React.SetStateAction<string[]>>;
  dateInputToAdd: string;
  setDateInputToAdd: (val: string) => void;
  currentCalendarMonth: Date;
  setCurrentCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  handleAddSpecificDate: (dateStr: string) => void;
  handleToggleSpecificDate: (dateStr: string) => void;
  handleAddRelativeDays: (days: number) => void;
  specificHolidayAnalysis: HolidayFilterResult;
  holidayOverrideKey: string;
  setHolidayOverrideKey: (val: string) => void;
  isHolidayAuthorized: boolean;
  useCustomSchedulesPerDate: boolean;
  setUseCustomSchedulesPerDate: (val: boolean) => void;
  dateSchedules: Record<string, CustomScheduleSlot>;
  handleUpdateDateSchedule: (dateStr: string, field: keyof CustomScheduleSlot, value: any) => void;
  handleCopyDateScheduleToAll: (sourceDateStr: string) => void;
  handleAutoFixDateSchedule: (dateStr: string, slotNum?: 1 | 2) => void;
  handleAutoFixAllDatesWithConflicts: () => void;
  handleApplyBaseToAllDates: () => void;
  getDateSlotConflict: (dateStr: string, slot?: CustomScheduleSlot, slotNumber?: 1 | 2) => any[];
  availableSpaces: SpaceInfo[];
  selectedDays: number[];
  setSelectedDays: React.Dispatch<React.SetStateAction<number[]>>;
  toggleDay: (dayNum: number) => void;
  recurrenceStartDate: string;
  setRecurrenceStartDate: (val: string) => void;
  recurrenceEndDate: string;
  setRecurrenceEndDate: (val: string) => void;
  includeHolidaysInSeries: boolean;
  setIncludeHolidaysInSeries: (val: boolean) => void;
  patternHolidayAnalysis: HolidayFilterResult;
  useCustomSchedulesPerDay: boolean;
  setUseCustomSchedulesPerDay: (val: boolean) => void;
  daySchedules: Record<number, CustomScheduleSlot>;
  handleUpdateDaySchedule: (dayNum: number, field: keyof CustomScheduleSlot, value: any) => void;
  handleCopyDayScheduleToAll: (sourceDayNum: number) => void;
  handleApplyBaseToAllDays: () => void;
  generatedDates: readonly string[];
  enableSingleSecondSpace: boolean;
  singleSecondSpace: string;
  singleSecondStartTime: string;
  singleSecondEndTime: string;
}

export const RecurrenceScheduleSection: React.FC<RecurrenceScheduleSectionProps> = ({
  bookingMode,
  isEditingSingleOccurrence,
  editingReservation,
  generateFullSeries,
  setGenerateFullSeries,
  formData,
  setFormData,
  specificDates,
  setSpecificDates,
  dateInputToAdd,
  setDateInputToAdd,
  currentCalendarMonth,
  setCurrentCalendarMonth,
  handleAddSpecificDate,
  handleToggleSpecificDate,
  handleAddRelativeDays,
  specificHolidayAnalysis,
  holidayOverrideKey,
  setHolidayOverrideKey,
  isHolidayAuthorized,
  useCustomSchedulesPerDate,
  setUseCustomSchedulesPerDate,
  dateSchedules,
  handleUpdateDateSchedule,
  handleCopyDateScheduleToAll,
  handleAutoFixDateSchedule,
  handleAutoFixAllDatesWithConflicts,
  handleApplyBaseToAllDates,
  getDateSlotConflict,
  availableSpaces,
  selectedDays,
  setSelectedDays,
  toggleDay,
  recurrenceStartDate,
  setRecurrenceStartDate,
  recurrenceEndDate,
  setRecurrenceEndDate,
  includeHolidaysInSeries,
  setIncludeHolidaysInSeries,
  patternHolidayAnalysis,
  useCustomSchedulesPerDay,
  setUseCustomSchedulesPerDay,
  daySchedules,
  handleUpdateDaySchedule,
  handleCopyDayScheduleToAll,
  handleApplyBaseToAllDays,
  generatedDates,
  enableSingleSecondSpace,
  singleSecondSpace,
  singleSecondStartTime,
  singleSecondEndTime
}) => {
  // Calendar days grid for mini-calendar in specific dates mode
  const miniCalendarDays = useMemo(() => {
    if (bookingMode !== 'specific') return [];
    try {
      const monthStart = startOfMonth(currentCalendarMonth);
      const monthEnd = endOfMonth(currentCalendarMonth);
      const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
      const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
      return eachDayOfInterval({ start: startDate, end: endDate });
    } catch (e) {
      return [];
    }
  }, [bookingMode, currentCalendarMonth]);

  if (isEditingSingleOccurrence || bookingMode === 'single') {
    return null;
  }

  return (
    <>
      {/* Section: Modalidad Fechas Específicas (Arbitrarias / Manuales) */}
      {bookingMode === 'specific' && (
        <div className="p-5 bg-gradient-to-br from-indigo-50/90 via-blue-50/60 to-slate-50 border-2 border-indigo-200/90 rounded-2xl space-y-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-2xs">
                <CalendarPlus className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Reserva en Fechas Específicas (Sin periodicidad fija)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Elige directamente en el calendario o ingresa las fechas exactas en que se ocupará el espacio.
                </p>
              </div>
            </div>

            {!editingReservation && (
              <label className="flex items-center space-x-2 text-indigo-950 font-bold text-xs cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-2xs self-start sm:self-auto">
                <input
                  type="checkbox"
                  checked={generateFullSeries}
                  onChange={(e) => setGenerateFullSeries(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <span>Crear todas las sesiones</span>
              </label>
            )}
          </div>

          {/* 1. Input para agregar fecha + atajos rápidos */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              1. Agregar Fecha Individual:
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dateInputToAdd}
                onChange={(e) => setDateInputToAdd(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none shadow-2xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (dateInputToAdd) {
                    handleAddSpecificDate(dateInputToAdd);
                    setDateInputToAdd('');
                  }
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-2xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Fecha</span>
              </button>

              {/* Atajos de días relativos */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-500 font-medium ml-1">Atajos:</span>
                <button
                  type="button"
                  onClick={() => handleAddRelativeDays(7)}
                  className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-semibold transition cursor-pointer shadow-2xs"
                >
                  +7 Días (Próx. semana)
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRelativeDays(14)}
                  className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-semibold transition cursor-pointer shadow-2xs"
                >
                  +14 Días
                </button>
                <button
                  type="button"
                  onClick={() => handleAddRelativeDays(21)}
                  className="px-2.5 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg font-semibold transition cursor-pointer shadow-2xs"
                >
                  +21 Días
                </button>
              </div>
            </div>
          </div>

          {/* 2. Mini-Calendario Interactivo Mensual para Clics Rápidos */}
          <div className="space-y-2 pt-1 bg-white p-3.5 rounded-2xl border border-indigo-100 shadow-2xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-slate-800 capitalize">
                  {format(currentCalendarMonth, 'MMMM yyyy', { locale: es })}
                </span>
                <span className="text-[10px] text-slate-400">
                  (Haz clic en cualquier día para activarlo o desactivarlo)
                </span>
              </div>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setCurrentCalendarMonth((prev) => subMonths(prev, 1))}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                  title="Mes anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentCalendarMonth(startOfMonth(new Date()))}
                  className="px-2 py-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-md transition cursor-pointer"
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentCalendarMonth((prev) => addMonths(prev, 1))}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition cursor-pointer"
                  title="Mes siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Day of week headers */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px] text-slate-400 pt-1">
              <div>LUN</div>
              <div>MAR</div>
              <div>MIÉ</div>
              <div>JUE</div>
              <div>VIE</div>
              <div>SÁB</div>
              <div>DOM</div>
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {miniCalendarDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isSelected = specificDates.includes(dateStr);
                const isCurrentMonth = isSameMonth(day, currentCalendarMonth);
                const holInfo = getChileanHolidayInfo(dateStr);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => handleToggleSpecificDate(dateStr)}
                    title={holInfo ? `Feriado: ${holInfo.name}` : undefined}
                    className={`h-9 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition relative cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 text-white font-bold shadow-xs scale-105 ring-2 ring-indigo-300'
                        : holInfo
                        ? 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                        : isCurrentMonth
                        ? 'bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-100'
                        : 'bg-transparent text-slate-300 hover:text-slate-500'
                    }`}
                  >
                    <span className="leading-none">{format(day, 'd')}</span>
                    {holInfo && !isSelected && (
                      <span className="text-[7.5px] font-bold text-rose-600 leading-none mt-0.5">🇨🇱</span>
                    )}
                    {isSelected && (
                      <span className="w-1.5 h-1.5 bg-white rounded-full mt-0.5"></span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chilean Holiday Warning & CCD Override in Specific Dates Mode */}
          {specificHolidayAnalysis.omittedHolidays.length > 0 && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5 text-rose-900 text-xs">
              <div className="flex items-start space-x-2">
                <div className="p-1 bg-rose-200 text-rose-900 rounded-md shrink-0 text-sm">🇨🇱</div>
                <div className="flex-1 space-y-0.5">
                  <span className="font-bold block">
                    Se detectaron {specificHolidayAnalysis.omittedHolidays.length} día(s) feriado(s) en tu selección:
                  </span>
                  <p className="text-[11px] text-rose-800">
                    {specificHolidayAnalysis.omittedHolidays.map(h => `${formatDateDDMMYYYY(h.date)} (${h.holiday.name})`).join(', ')}.
                  </p>
                  <p className="text-[10px] text-rose-700 font-medium">
                    Por normativa, los feriados se omiten automáticamente a menos que se autoricen con la clave especial <strong>CCD</strong>.
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <KeyRound className="w-3.5 h-3.5 text-rose-700" />
                  <span className="text-[11px] font-bold text-rose-900">Autorizar feriados con clave CCD:</span>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="password"
                    placeholder="Clave CCD"
                    value={holidayOverrideKey}
                    onChange={(e) => setHolidayOverrideKey(e.target.value)}
                    className="px-2.5 py-1 bg-white border border-rose-300 rounded-lg text-xs font-mono font-bold tracking-wider w-32 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  />
                  {isHolidayAuthorized ? (
                    <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-emerald-300">
                      ✓ Autorizado
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md font-semibold">
                      Omitiendo feriados
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. Lista y resumen de fechas específicas seleccionadas */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                <span>2. Fechas Seleccionadas ({specificDates.length}):</span>
              </label>
              {specificDates.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSpecificDates([specificDates[0]])}
                  className="text-[11px] text-rose-600 hover:text-rose-700 font-semibold cursor-pointer underline"
                >
                  Dejar solo la primera fecha
                </button>
              )}
            </div>

            {specificDates.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                No has seleccionado ninguna fecha. Agrega una arriba o haz clic en los días del calendario.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200">
                {specificDates.map((dateStr) => {
                  let dayName = '';
                  try {
                    dayName = format(parseISO(dateStr), 'EEE', { locale: es });
                  } catch (e) {}
                  const isHol = getChileanHolidayInfo(dateStr);

                  return (
                    <span
                      key={dateStr}
                      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border ${
                        isHol
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-indigo-50 text-indigo-900 border-indigo-200'
                      }`}
                    >
                      <span className="capitalize font-sans text-[10px] text-slate-500 font-bold">{dayName}</span>
                      <span>{formatDateDDMMYYYY(dateStr)}</span>
                      {isHol && <span className="text-[9px] font-bold text-rose-600" title={`Feriado: ${isHol.name}`}>🇨🇱</span>}
                      <button
                        type="button"
                        onClick={() => handleToggleSpecificDate(dateStr)}
                        className="text-slate-400 hover:text-rose-600 ml-1 p-0.5 rounded cursor-pointer"
                        title="Eliminar esta fecha"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Session count info */}
          <div className="flex items-center justify-between text-[11px] text-indigo-900 bg-indigo-50/80 px-3 py-2 rounded-xl border border-indigo-200">
            <div className="flex items-center space-x-1.5 font-bold">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Total a programar: {specificDates.length} reserva(s) individual(es)</span>
            </div>
            <span className="text-[10px] text-indigo-600 font-medium">
              {useCustomSchedulesPerDate ? 'Horarios diferenciados por fecha' : `Mismo horario (${formData.horaInicio} - ${formData.horaFin}) en ${formatDisplayTitle(formData.espacio)}`}
            </span>
          </div>

          {/* Switch for Diverse / Custom Schedules Per Date */}
          {specificDates.length > 1 && (
            <div className="pt-2 border-t border-indigo-100/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white rounded-xl border border-indigo-200/80 shadow-2xs">
                <div className="flex items-center space-x-2.5">
                  <div className={`p-1.5 rounded-lg ${useCustomSchedulesPerDate ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <label htmlFor="toggle-custom-schedules-dates" className="text-xs font-bold text-slate-800 cursor-pointer block">
                      Definir diversos horarios por cada día
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Permite asignar horas de inicio, término o espacios distintos a cada fecha elegida.
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="toggle-custom-schedules-dates"
                      type="checkbox"
                      checked={useCustomSchedulesPerDate}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseCustomSchedulesPerDate(checked);
                        if (checked) {
                          handleApplyBaseToAllDates();
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              </div>

              {/* Table / List of Per-Date Schedule Editors */}
              {useCustomSchedulesPerDate && (
                <div className="p-3 bg-white rounded-xl border border-indigo-200 space-y-2 shadow-2xs animate-fadeIn">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-slate-100 text-[11px]">
                    <span className="font-bold text-slate-700">Configuración individual por fecha ({specificDates.length}):</span>
                    
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={handleAutoFixAllDatesWithConflicts}
                        className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-[10px] font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs"
                        title="Reubica automáticamente los horarios de las fechas que presenten conflicto"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Auto-ajustar fechas con topamiento</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleApplyBaseToAllDates}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer underline text-[10px]"
                      >
                        Restablecer todos ({formData.horaInicio} - {formData.horaFin})
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {specificDates.map((d) => {
                      const customSlot = dateSchedules[d] || {
                        horaInicio: formData.horaInicio || '10:00',
                        horaFin: formData.horaFin || '11:00',
                        espacio: formData.espacio,
                        hasSecondSlot: false,
                        secondHoraInicio: formData.horaFin || '11:00',
                        secondHoraFin: '12:00',
                        secondEspacio: availableSpaces.find((s) => s.name !== formData.espacio)?.name || availableSpaces[1]?.name || 'SALA 2'
                      };

                      let dayName = '';
                      try {
                        dayName = format(parseISO(d), 'EEEE', { locale: es });
                      } catch (e) {}

                      const slot1Conflicts = getDateSlotConflict(d, customSlot, 1);
                      const slot2Conflicts = customSlot.hasSecondSlot ? getDateSlotConflict(d, customSlot, 2) : [];
                      const hasAnyConflict = slot1Conflicts.length > 0 || slot2Conflicts.length > 0;

                      return (
                        <div
                          key={d}
                          className={`p-3 rounded-xl border text-xs flex flex-col space-y-2.5 transition ${
                            hasAnyConflict
                              ? 'bg-rose-50/70 border-rose-300'
                              : 'bg-slate-50/90 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {/* Slot 1 Row */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center space-x-2 min-w-[140px]">
                              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                              <div>
                                <span className="font-mono font-bold text-slate-800 block text-xs">
                                  {formatDateDDMMYYYY(d)}
                                </span>
                                {dayName && (
                                  <span className="text-[10px] text-slate-500 capitalize">
                                    {dayName}
                                  </span>
                                )}
                              </div>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800">
                                1° Espacio
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
                              <div className="flex items-center space-x-1">
                                <span className="text-[10px] font-semibold text-slate-500">De:</span>
                                <input
                                  type="time"
                                  value={customSlot.horaInicio}
                                  onChange={(e) => handleUpdateDateSchedule(d, 'horaInicio', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                                />
                              </div>

                              <div className="flex items-center space-x-1">
                                <span className="text-[10px] font-semibold text-slate-500">A:</span>
                                <input
                                  type="time"
                                  value={customSlot.horaFin}
                                  onChange={(e) => handleUpdateDateSchedule(d, 'horaFin', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                                />
                              </div>

                              <div className="flex items-center space-x-1">
                                <select
                                  value={customSlot.espacio || formData.espacio}
                                  onChange={(e) => handleUpdateDateSchedule(d, 'espacio', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 max-w-[120px] truncate"
                                >
                                  {availableSpaces.map((sp) => (
                                    <option key={sp.id || sp.name} value={sp.name}>
                                      {sp.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleUpdateDateSchedule(d, 'hasSecondSlot', !customSlot.hasSecondSlot)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer shrink-0 ${
                                  customSlot.hasSecondSlot
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                }`}
                              >
                                {customSlot.hasSecondSlot ? '- Quitar 2° Espacio' : '+ 2° Espacio'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyDateScheduleToAll(d)}
                                title="Copiar esta configuración a todas las otras fechas"
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-300 transition cursor-pointer shrink-0"
                              >
                                Copiar a todas
                              </button>
                            </div>
                          </div>

                          {/* Slot 2 Row (if active) */}
                          {customSlot.hasSecondSlot && (
                            <div className="p-2 bg-indigo-50/70 border border-indigo-200/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-fadeIn">
                              <div className="flex items-center space-x-1.5 text-[11px] font-bold text-indigo-900">
                                <Layers className="w-3.5 h-3.5 text-indigo-600" />
                                <span>2° Espacio para {formatDateDDMMYYYY(d)}:</span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 justify-end">
                                <div className="flex items-center space-x-1">
                                  <span className="text-[10px] font-semibold text-indigo-700">De:</span>
                                  <input
                                    type="time"
                                    value={customSlot.secondHoraInicio || '11:00'}
                                    onChange={(e) => handleUpdateDateSchedule(d, 'secondHoraInicio', e.target.value)}
                                    className="px-2 py-1 bg-white border border-indigo-200 rounded-lg text-slate-900 font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>

                                <div className="flex items-center space-x-1">
                                  <span className="text-[10px] font-semibold text-indigo-700">A:</span>
                                  <input
                                    type="time"
                                    value={customSlot.secondHoraFin || '12:00'}
                                    onChange={(e) => handleUpdateDateSchedule(d, 'secondHoraFin', e.target.value)}
                                    className="px-2 py-1 bg-white border border-indigo-200 rounded-lg text-slate-900 font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                                  />
                                </div>

                                <div className="flex items-center space-x-1">
                                  <select
                                    value={customSlot.secondEspacio || availableSpaces[1]?.name || 'SALA 2'}
                                    onChange={(e) => handleUpdateDateSchedule(d, 'secondEspacio', e.target.value)}
                                    className="px-2 py-1 bg-white border border-indigo-200 rounded-lg text-slate-900 text-xs font-semibold focus:ring-1 focus:ring-indigo-500 max-w-[130px] truncate"
                                  >
                                    {availableSpaces.map((sp) => (
                                      <option key={sp.id || sp.name} value={sp.name}>
                                        {sp.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}

                          {hasAnyConflict && (
                            <div className="w-full text-[11px] text-rose-800 font-medium flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-rose-200">
                              <div className="flex items-center space-x-1.5 text-rose-900 font-bold">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>
                                  Topamiento: {slot1Conflicts.length > 0 ? `1° espacio ocupado (${formatDisplayTitle(slot1Conflicts[0].tipoActividad)})` : ''} {slot2Conflicts.length > 0 ? `• 2° espacio ocupado (${formatDisplayTitle(slot2Conflicts[0].tipoActividad)})` : ''}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1.5">
                                {slot1Conflicts.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleAutoFixDateSchedule(d, 1)}
                                    className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-[10px] font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                                  >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    <span>Ajustar 1° Espacio</span>
                                  </button>
                                )}

                                {slot2Conflicts.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleAutoFixDateSchedule(d, 2)}
                                    className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[10px] font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                                  >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    <span>Ajustar 2° Espacio</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section: Configuración Avanzada de Recurrencia por Patrón Semanal */}
      {bookingMode === 'pattern' && (
        <div className="p-5 bg-gradient-to-br from-blue-50/90 via-indigo-50/50 to-slate-50 border-2 border-blue-200/80 rounded-2xl space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-blue-100 pb-2.5">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-2xs">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Configuración de Serie Semanal (Días y Rango)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Selecciona los días de la semana y el rango de fechas en que se repetirá la actividad.
                </p>
              </div>
            </div>

            {!editingReservation && (
              <label className="flex items-center space-x-2 text-blue-900 font-bold text-xs cursor-pointer bg-white px-3 py-1.5 rounded-xl border border-blue-200 shadow-2xs">
                <input
                  type="checkbox"
                  checked={generateFullSeries}
                  onChange={(e) => setGenerateFullSeries(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span>Generar sesiones automáticamente</span>
              </label>
            )}
          </div>

          {/* 1. Selector de Días de la Semana */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              1. Días de la semana que se repetirá:
            </label>
            <div className="flex flex-wrap items-center gap-1.5">
              {WEEKDAYS.map((day) => {
                const isSelected = selectedDays.includes(day.dayNum);
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.dayNum)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-1 scale-102'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    <span>{day.full}</span>
                  </button>
                );
              })}
            </div>

            {/* Quick day presets */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">Atajos:</span>
              <button
                type="button"
                onClick={() => setSelectedDays([1, 3, 5])}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                Lun / Mié / Vie
              </button>
              <button
                type="button"
                onClick={() => setSelectedDays([2, 4])}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                Mar / Jue
              </button>
              <button
                type="button"
                onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                Lun a Vie
              </button>
              <button
                type="button"
                onClick={() => setSelectedDays([6])}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                Solo Sábados
              </button>
            </div>
          </div>

          {/* 2. Rango de Fechas */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-bold text-slate-800">
              2. Rango de Fechas (Desde - Hasta):
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-slate-600 block">Fecha Inicio de la Serie:</span>
                <input
                  type="date"
                  required
                  value={recurrenceStartDate}
                  onChange={(e) => {
                    setRecurrenceStartDate(e.target.value);
                    setFormData((prev) => ({ ...prev, fecha: e.target.value }));
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-blue-900 block flex items-center gap-1">
                    <Repeat className="w-3.5 h-3.5 text-blue-600" />
                    <span>¿Hasta qué fecha se repite?</span>
                  </span>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">
                    Fecha Término (Opción Admin)
                  </span>
                </div>
                <input
                  type="date"
                  id="input-hasta-que-fecha-se-repite"
                  required
                  min={recurrenceStartDate}
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border-2 border-blue-400 rounded-xl text-blue-950 font-bold font-mono shadow-xs focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Date Shortcuts */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
              <span className="font-semibold text-slate-600">Extender hasta:</span>
              <button
                type="button"
                onClick={() => {
                  try {
                    const base = parseISO(recurrenceStartDate || '2026-08-27');
                    setRecurrenceEndDate(format(addMonths(base, 1), 'yyyy-MM-dd'));
                  } catch (e) {}
                }}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                +1 Mes
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const base = parseISO(recurrenceStartDate || '2026-08-27');
                    setRecurrenceEndDate(format(addMonths(base, 2), 'yyyy-MM-dd'));
                  } catch (e) {}
                }}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                +2 Meses
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    const base = parseISO(recurrenceStartDate || '2026-08-27');
                    setRecurrenceEndDate(format(addMonths(base, 3), 'yyyy-MM-dd'));
                  } catch (e) {}
                }}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                +3 Meses
              </button>
              <button
                type="button"
                onClick={() => setRecurrenceEndDate('2026-11-30')}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                Fin de Noviembre (30/11)
              </button>
              <button
                type="button"
                onClick={() => setRecurrenceEndDate('2026-12-31')}
                className="px-2 py-0.5 rounded-md bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium cursor-pointer"
              >
                Fin de Año (31/12)
              </button>
            </div>
          </div>

          {/* 3. Chilean Holiday Analysis & Omission for Pattern Recurrence */}
          {patternHolidayAnalysis.omittedHolidays.length > 0 && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5 text-rose-900 text-xs">
              <div className="flex items-start space-x-2">
                <div className="p-1 bg-rose-200 text-rose-900 rounded-md shrink-0 text-sm">🇨🇱</div>
                <div className="flex-1 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {includeHolidaysInSeries && isHolidayAuthorized
                        ? `✓ Feriados incluidos con clave CCD (${patternHolidayAnalysis.omittedHolidays.length} feriados)`
                        : `Omitiendo ${patternHolidayAnalysis.omittedHolidays.length} día(s) feriado(s) en este período`}
                    </span>
                    <label className="flex items-center space-x-1.5 cursor-pointer text-[11px] font-semibold text-rose-900">
                      <input
                        type="checkbox"
                        checked={includeHolidaysInSeries}
                        onChange={(e) => setIncludeHolidaysInSeries(e.target.checked)}
                        className="rounded text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                      />
                      <span>Incluir feriados (requiere clave CCD)</span>
                    </label>
                  </div>
                  <p className="text-[11px] text-rose-800">
                    {patternHolidayAnalysis.omittedHolidays.map(h => `${formatDateDDMMYYYY(h.date)} (${h.holiday.name})`).join(', ')}
                  </p>
                </div>
              </div>

              {includeHolidaysInSeries && (
                <div className="pt-2 border-t border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <KeyRound className="w-3.5 h-3.5 text-rose-700" />
                    <span className="text-[11px] font-bold text-rose-900">Ingresa la clave CCD para confirmar:</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="password"
                      placeholder="Clave CCD"
                      value={holidayOverrideKey}
                      onChange={(e) => setHolidayOverrideKey(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-rose-300 rounded-lg text-xs font-mono font-bold tracking-wider w-32 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    />
                    {isHolidayAuthorized ? (
                      <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg text-[10px] font-bold border border-emerald-300">
                        ✓ Autorizado
                      </span>
                    ) : (
                      <span className="text-[10px] text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md font-semibold">
                        Clave Requerida
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. Switch for Diverse / Custom Schedules Per Day of Week */}
          {selectedDays.length > 1 && (
            <div className="pt-2 border-t border-blue-100/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white rounded-xl border border-blue-200/80 shadow-2xs">
                <div className="flex items-center space-x-2.5">
                  <div className={`p-1.5 rounded-lg ${useCustomSchedulesPerDay ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <label htmlFor="toggle-custom-schedules-days" className="text-xs font-bold text-slate-800 cursor-pointer block">
                      Definir diversos horarios por día de la semana
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Asigna horarios o espacios específicos según el día (ej: Lunes 10:00-12:00 en TATAMI, Miércoles 16:00-18:00 en GIMNASIO).
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="toggle-custom-schedules-days"
                      type="checkbox"
                      checked={useCustomSchedulesPerDay}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseCustomSchedulesPerDay(checked);
                        if (checked) {
                          handleApplyBaseToAllDays();
                        }
                      }}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* List of Per-Day Schedule Editors */}
              {useCustomSchedulesPerDay && (
                <div className="p-3 bg-white rounded-xl border border-blue-200 space-y-2 shadow-2xs animate-fadeIn">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 text-[11px]">
                    <span className="font-bold text-slate-700">Horarios configurados por día ({selectedDays.length} días):</span>
                    <button
                      type="button"
                      onClick={handleApplyBaseToAllDays}
                      className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline text-[10px]"
                    >
                      Restablecer todos al horario base ({formData.horaInicio} - {formData.horaFin})
                    </button>
                  </div>

                  <div className="space-y-2">
                    {selectedDays.map((dayNum) => {
                      const dayObj = WEEKDAYS.find((w) => w.dayNum === dayNum);
                      const customSlot = daySchedules[dayNum] || {
                        horaInicio: formData.horaInicio || '10:00',
                        horaFin: formData.horaFin || '11:00',
                        espacio: formData.espacio,
                        hasSecondSlot: false,
                        secondHoraInicio: formData.horaFin || '11:00',
                        secondHoraFin: '12:00',
                        secondEspacio: availableSpaces.find((s) => s.name !== formData.espacio)?.name || availableSpaces[1]?.name || 'SALA 2'
                      };

                      return (
                        <div
                          key={dayNum}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/90 hover:bg-slate-50 text-xs flex flex-col space-y-2.5 transition"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center space-x-2 min-w-[140px]">
                              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-xs">
                                {dayObj?.full || 'Día'}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800">
                                1° Espacio
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 flex-1 justify-end">
                              <div className="flex items-center space-x-1">
                                <span className="text-[10px] font-semibold text-slate-500">De:</span>
                                <input
                                  type="time"
                                  value={customSlot.horaInicio}
                                  onChange={(e) => handleUpdateDaySchedule(dayNum, 'horaInicio', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              <div className="flex items-center space-x-1">
                                <span className="text-[10px] font-semibold text-slate-500">A:</span>
                                <input
                                  type="time"
                                  value={customSlot.horaFin}
                                  onChange={(e) => handleUpdateDaySchedule(dayNum, 'horaFin', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 font-mono text-xs focus:ring-1 focus:ring-blue-500"
                                />
                              </div>

                              <div className="flex items-center space-x-1">
                                <select
                                  value={customSlot.espacio || formData.espacio}
                                  onChange={(e) => handleUpdateDaySchedule(dayNum, 'espacio', e.target.value)}
                                  className="px-2 py-1 bg-white border border-slate-300 rounded-lg text-slate-900 text-xs font-semibold focus:ring-1 focus:ring-blue-500 max-w-[120px] truncate"
                                >
                                  {availableSpaces.map((sp) => (
                                    <option key={sp.id || sp.name} value={sp.name}>
                                      {sp.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleUpdateDaySchedule(dayNum, 'hasSecondSlot', !customSlot.hasSecondSlot)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer shrink-0 ${
                                  customSlot.hasSecondSlot
                                    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                                }`}
                              >
                                {customSlot.hasSecondSlot ? '- Quitar 2° Espacio' : '+ 2° Espacio'}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleCopyDayScheduleToAll(dayNum)}
                                title="Copiar esta configuración a los otros días seleccionados"
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold border border-slate-300 transition cursor-pointer shrink-0"
                              >
                                Copiar a todos
                              </button>
                            </div>
                          </div>

                          {/* Second Slot Row */}
                          {customSlot.hasSecondSlot && (
                            <div className="p-2 bg-blue-50/70 border border-blue-200/80 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-fadeIn">
                              <div className="flex items-center space-x-1.5 text-[11px] font-bold text-blue-900">
                                <Layers className="w-3.5 h-3.5 text-blue-600" />
                                <span>2° Espacio para {dayObj?.full || 'este día'}:</span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 justify-end">
                                <div className="flex items-center space-x-1">
                                  <span className="text-[10px] font-semibold text-blue-700">De:</span>
                                  <input
                                    type="time"
                                    value={customSlot.secondHoraInicio || '11:00'}
                                    onChange={(e) => handleUpdateDaySchedule(dayNum, 'secondHoraInicio', e.target.value)}
                                    className="px-2 py-1 bg-white border border-blue-200 rounded-lg text-slate-900 font-mono text-xs focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>

                                <div className="flex items-center space-x-1">
                                  <span className="text-[10px] font-semibold text-blue-700">A:</span>
                                  <input
                                    type="time"
                                    value={customSlot.secondHoraFin || '12:00'}
                                    onChange={(e) => handleUpdateDaySchedule(dayNum, 'secondHoraFin', e.target.value)}
                                    className="px-2 py-1 bg-white border border-blue-200 rounded-lg text-slate-900 font-mono text-xs focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>

                                <div className="flex items-center space-x-1">
                                  <select
                                    value={customSlot.secondEspacio || availableSpaces[1]?.name || 'SALA 2'}
                                    onChange={(e) => handleUpdateDaySchedule(dayNum, 'secondEspacio', e.target.value)}
                                    className="px-2 py-1 bg-white border border-blue-200 rounded-lg text-slate-900 text-xs font-semibold focus:ring-1 focus:ring-blue-500 max-w-[130px] truncate"
                                  >
                                    {availableSpaces.map((sp) => (
                                      <option key={sp.id || sp.name} value={sp.name}>
                                        {sp.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Live Preview of Generated Sessions */}
          <div className="space-y-2">
            <div className="p-3 bg-white rounded-xl border border-blue-200 text-xs flex items-center justify-between gap-3 shadow-2xs">
              <div className="flex items-center space-x-2.5">
                <div className={`p-2 rounded-lg font-bold ${generatedDates.length === 0 ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-700'}`}>
                  {enableSingleSecondSpace && !useCustomSchedulesPerDay ? generatedDates.length * 2 : generatedDates.length}
                </div>
                <div>
                  <span className="font-bold text-slate-800 block">
                    {generatedDates.length === 0
                      ? '0 sesiones calculadas (Serie vacía)'
                      : enableSingleSecondSpace && !useCustomSchedulesPerDay
                      ? `${generatedDates.length * 2} reservas calculadas (${generatedDates.length} fechas con 2 espacios por día)`
                      : `${generatedDates.length} sesiones calculadas`}
                    {!includeHolidaysInSeries && patternHolidayAnalysis.omittedHolidays.length > 0 && (
                      <span className="ml-1.5 text-[10px] text-rose-600 font-semibold">
                        ({patternHolidayAnalysis.omittedHolidays.length} feriados omitidos)
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {generatedDates.length > 0
                      ? enableSingleSecondSpace && !useCustomSchedulesPerDay
                        ? `1°: ${formatDisplayTitle(formData.espacio || 'Espacio 1')} (${formData.horaInicio || '10:00'}-${formData.horaFin || '11:00'}) | 2°: ${singleSecondSpace || 'Espacio 2'} (${singleSecondStartTime || '11:00'}-${singleSecondEndTime || '12:00'})`
                        : `Desde ${formatDateDDMMYYYY(generatedDates[0])} hasta ${formatDateDDMMYYYY(generatedDates[generatedDates.length - 1])}`
                      : recurrenceEndDate < recurrenceStartDate
                      ? 'Fecha Término es anterior a Fecha Inicio'
                      : 'No hay fechas coincidentes en el rango seleccionado'}
                  </span>
                </div>
              </div>

              {generatedDates.length > 0 && (
                <div className="text-[11px] text-right font-mono text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 max-w-[220px] truncate">
                  {generatedDates.slice(0, 3).map(d => formatDateDDMMYYYY(d)).join(', ')}
                  {generatedDates.length > 3 ? ` ... +${generatedDates.length - 3} más` : ''}
                </div>
              )}
            </div>

            {generatedDates.length === 0 && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-950 flex items-start space-x-2.5 shadow-2xs animate-fadeIn">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold text-rose-900 block">Riesgo de crear serie vacía:</span>
                  <p className="text-[11px] text-rose-800 leading-relaxed">
                    {recurrenceEndDate < recurrenceStartDate
                      ? '⚠️ La Fecha Término de la serie no puede ser anterior a la Fecha Inicio. Ajusta las fechas para habilitar el guardado.'
                      : selectedDays.length === 0
                      ? '⚠️ Debes seleccionar al menos un día de la semana (Lunes a Domingo).'
                      : '⚠️ El rango y días configurados no generan ninguna sesión válida.'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
