import { formatDisplayTitle } from '../utils/reservationVisuals';
import React from 'react';
import {
  MapPin,
  Calendar,
  Clock,
  AlertTriangle,
  Sparkles,
  KeyRound,
  CheckCircle2,
  Check,
  Layers,
  ShieldCheck,
  Repeat,
  Building2,
  ChevronRight
} from 'lucide-react';
import { Reservation, SpaceInfo, SpaceBlock, UpdateScope } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { timeStringToMinutes } from '../utils/validationUtils';
import { timeToMinutes, formatMinutesToTime } from '../utils/conflictDetector';
import { SpaceAvailabilityTimeline } from './SpaceAvailabilityTimeline';
import { RecurrenceScheduleSection, type CustomScheduleSlot } from './RecurrenceScheduleSection';
import { ReservationConflictBanner } from './ReservationConflictBanner';
import { ConflictRecommendation } from '../utils/conflictRecommender';
import { AuthUser, isCoordinatorOrAdmin } from '../services/authService';

interface ReservationStep2DateTimeProps {
  isWizardMode: boolean;
  wizardStep: 1 | 2 | 3 | 4 | 5;
  formData: Partial<Reservation>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  availableSpaces: SpaceInfo[];
  allReservations: Reservation[];
  spaceBlocks: readonly SpaceBlock[];
  editingReservation?: Reservation | null;
  isDuplicating: boolean;
  isEditingRecurring: boolean;
  updateScope: UpdateScope;
  affectedReservations: Reservation[];
  isEditingSingleOccurrence: boolean;
  singleDateHolidayInfo: { name: string; isIrrenunciable?: boolean } | null;
  handlePrimaryDateChange: (date: string) => void;
  timeValidation: { isValid: boolean; error?: string };
  // Conflicts & Quick Suggestions
  conflicts: Reservation[];
  candidateConflictDates: readonly string[] | string[];
  mainDuration: number;
  allowConflictOverride: boolean;
  setAllowConflictOverride: (allow: boolean) => void;
  showInlineSuggestions: boolean;
  setShowInlineSuggestions: (show: boolean) => void;
  handleShiftImmediatelyAfter: (newStartTime: string) => void;
  handleApplyRecommendation: (rec: ConflictRecommendation) => void;
  handleFindNextAvailableSlot: () => void;
  quickFreeSlots: ConflictRecommendation[];
  quickAltSpaces: ConflictRecommendation[];
  setShowConflictDialog: (show: boolean) => void;
  // Schedule Unlock outside regular hours
  loanScheduleCheck: { requiresAuthorization: boolean; reason?: string };
  currentUser?: AuthUser | null;
  extendedAuthKey: string;
  setExtendedAuthKey: (key: string) => void;
  isExtensionAuthorized: boolean;
  // Multi-space optional (2nd space)
  enableSingleSecondSpace: boolean;
  setEnableSingleSecondSpace: (enable: boolean) => void;
  singleSecondSpace: string;
  setSingleSecondSpace: (space: string) => void;
  singleSecondStartTime: string;
  setSingleSecondStartTime: (time: string) => void;
  singleSecondEndTime: string;
  setSingleSecondEndTime: (time: string) => void;
  singleSecondTimeValidation: { isValid: boolean; error?: string };
  singleSecondSpaceConflicts: Reservation[];
  handleFindNextSlotForSecondSpace: () => void;
  handleSwitchSecondSpaceToAvailable: () => void;
  // Holiday Authorization
  holidayOverrideKey: string;
  setHolidayOverrideKey: (key: string) => void;
  isHolidayAuthorized: boolean;
  // Booking mode & Recurrence
  bookingMode: 'single' | 'specific' | 'pattern';
  setBookingMode: (mode: 'single' | 'specific' | 'pattern') => void;
  generateFullSeries: boolean;
  setGenerateFullSeries: (gen: boolean) => void;
  specificDates: string[];
  setSpecificDates: React.Dispatch<React.SetStateAction<string[]>>;
  dateInputToAdd: string;
  setDateInputToAdd: (date: string) => void;
  currentCalendarMonth: Date;
  setCurrentCalendarMonth: React.Dispatch<React.SetStateAction<Date>>;
  handleAddSpecificDate: (date: string) => void;
  handleToggleSpecificDate: (date: string) => void;
  handleAddRelativeDays: (days: number) => void;
  specificHolidayAnalysis: any;
  useCustomSchedulesPerDate: boolean;
  setUseCustomSchedulesPerDate: (use: boolean) => void;
  dateSchedules: Record<string, CustomScheduleSlot>;
  handleUpdateDateSchedule: (date: string, field: any, value: any) => void;
  handleCopyDateScheduleToAll: (date: string) => void;
  handleAutoFixDateSchedule: (date: string) => void;
  handleAutoFixAllDatesWithConflicts: () => void;
  handleApplyBaseToAllDates: () => void;
  getDateSlotConflict: (date: string) => any;
  selectedDays: number[];
  setSelectedDays: React.Dispatch<React.SetStateAction<number[]>>;
  toggleDay: (dayNum: number) => void;
  recurrenceStartDate: string;
  setRecurrenceStartDate: (date: string) => void;
  recurrenceEndDate: string;
  setRecurrenceEndDate: (date: string) => void;
  includeHolidaysInSeries: boolean;
  setIncludeHolidaysInSeries: (inc: boolean) => void;
  patternHolidayAnalysis: any;
  useCustomSchedulesPerDay: boolean;
  setUseCustomSchedulesPerDay: (use: boolean) => void;
  daySchedules: Record<number, CustomScheduleSlot>;
  handleUpdateDaySchedule: (day: number, field: any, value: any) => void;
  handleCopyDayScheduleToAll: (day: number) => void;
  handleApplyBaseToAllDays: () => void;
  generatedDates: readonly string[] | string[];
}

export const ReservationStep2DateTime: React.FC<ReservationStep2DateTimeProps> = React.memo(({
  isWizardMode,
  wizardStep,
  formData,
  setFormData,
  availableSpaces,
  allReservations,
  spaceBlocks,
  editingReservation,
  isDuplicating,
  isEditingRecurring,
  updateScope,
  affectedReservations,
  isEditingSingleOccurrence,
  singleDateHolidayInfo,
  handlePrimaryDateChange,
  timeValidation,
  conflicts,
  candidateConflictDates,
  mainDuration,
  allowConflictOverride,
  setAllowConflictOverride,
  showInlineSuggestions,
  setShowInlineSuggestions,
  handleShiftImmediatelyAfter,
  handleApplyRecommendation,
  handleFindNextAvailableSlot,
  quickFreeSlots,
  quickAltSpaces,
  setShowConflictDialog,
  loanScheduleCheck,
  currentUser,
  extendedAuthKey,
  setExtendedAuthKey,
  isExtensionAuthorized,
  enableSingleSecondSpace,
  setEnableSingleSecondSpace,
  singleSecondSpace,
  setSingleSecondSpace,
  singleSecondStartTime,
  setSingleSecondStartTime,
  singleSecondEndTime,
  setSingleSecondEndTime,
  singleSecondTimeValidation,
  singleSecondSpaceConflicts,
  handleFindNextSlotForSecondSpace,
  handleSwitchSecondSpaceToAvailable,
  holidayOverrideKey,
  setHolidayOverrideKey,
  isHolidayAuthorized,
  bookingMode,
  setBookingMode,
  generateFullSeries,
  setGenerateFullSeries,
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
  useCustomSchedulesPerDate,
  setUseCustomSchedulesPerDate,
  dateSchedules,
  handleUpdateDateSchedule,
  handleCopyDateScheduleToAll,
  handleAutoFixDateSchedule,
  handleAutoFixAllDatesWithConflicts,
  handleApplyBaseToAllDates,
  getDateSlotConflict,
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
  generatedDates
}) => {
  if (isWizardMode && wizardStep !== 2) {
    return null;
  }

  return (
    <div id="wizard-step-section-2" className="space-y-4">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
            <MapPin className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-xs">2. Espacio, Fecha y Horarios</h3>
            <p className="text-[11px] text-slate-500">Espacio físico, fecha, horarios y modalidad de repetición</p>
          </div>
        </div>
        {isWizardMode && (
          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            Paso 2 de 5
          </span>
        )}
      </div>

      {/* Topamiento Conflict Banner if detected with Instant 1-Click Resolution */}
      <ReservationConflictBanner
        conflicts={conflicts}
        candidateConflictDates={candidateConflictDates}
        formData={formData}
        mainDuration={mainDuration}
        allReservations={allReservations}
        availableSpaces={availableSpaces}
        editingReservation={editingReservation}
        allowConflictOverride={allowConflictOverride}
        setAllowConflictOverride={setAllowConflictOverride}
        onOpenConflictDialog={() => setShowConflictDialog(true)}
        onShiftImmediatelyAfter={handleShiftImmediatelyAfter}
        onApplyRecommendation={handleApplyRecommendation}
        onFindNextAvailableSlot={handleFindNextAvailableSlot}
      />

      {/* Row 3: Espacio, Fecha y Horarios */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="input-reserva-espacio" className="font-semibold text-slate-700 flex items-center space-x-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-500" />
            <span>Espacio Requerido *</span>
          </label>
          <select
            id="input-reserva-espacio"
            aria-label="Espacio Requerido"
            value={formData.espacio || availableSpaces[0]?.name}
            onChange={(e) => setFormData({ ...formData, espacio: e.target.value })}
            className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs font-bold"
          >
            {availableSpaces.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="input-reserva-fecha" className="font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <span>
                {isEditingRecurring && updateScope !== 'single'
                  ? 'Fecha Base de la Serie'
                  : isEditingSingleOccurrence
                  ? 'Fecha de esta Ocurrencia *'
                  : bookingMode === 'specific'
                  ? 'Fecha Principal / Inicial *'
                  : bookingMode === 'pattern'
                  ? 'Fecha Inicio Serie *'
                  : 'Fecha *'}
              </span>
            </span>
            {singleDateHolidayInfo && (
              <span className="text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 flex items-center space-x-1">
                <span>🇨🇱</span>
                <span>Feriado: {singleDateHolidayInfo.name}</span>
              </span>
            )}
          </label>
          <input
            id="input-reserva-fecha"
            aria-label="Fecha de la reserva"
            type="date"
            required
            disabled={isEditingRecurring && updateScope !== 'single'}
            value={formData.fecha || ''}
            onChange={(e) => handlePrimaryDateChange(e.target.value)}
            className={`w-full px-3.5 py-2.5 rounded-xl font-mono focus:outline-none focus:ring-2 shadow-xs ${
              isEditingRecurring && updateScope !== 'single'
                ? 'bg-slate-100 text-slate-700 cursor-not-allowed border border-slate-300 font-bold'
                : singleDateHolidayInfo
                ? 'bg-white border-rose-300 ring-1 ring-rose-300 focus:ring-rose-500 text-slate-900'
                : 'bg-white border-slate-200 focus:ring-blue-500 text-slate-900'
            }`}
          />
          {isEditingRecurring && updateScope !== 'single' ? (
            <p className="text-[11px] text-indigo-700 font-medium">
              Modificación por lote ({affectedReservations.length} reservas): Cada ocurrencia mantendrá su fecha en el calendario; los cambios de horario, espacio y datos se aplicarán a todas ellas.
            </p>
          ) : isEditingSingleOccurrence ? (
            <p className="text-[11px] text-indigo-700 font-medium">
              Puedes mover esta ocurrencia a otra fecha si es necesario. El resto de la serie conservará sus fechas originales.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="input-reserva-inicio" className="font-semibold text-slate-700 flex items-center justify-between">
            <span className="flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-500" />
              <span>Hora Inicio *</span>
            </span>
            <span className="text-[10px] font-normal text-slate-500">
              Estándar: 08:30
            </span>
          </label>
          <input
            id="input-reserva-inicio"
            aria-label="Hora de inicio de la reserva"
            type="time"
            required
            value={formData.horaInicio || '08:30'}
            onChange={(e) => {
              const newStart = e.target.value;
              setFormData(prev => ({
                ...prev,
                horaInicio: newStart
              }));
            }}
            className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 shadow-xs font-bold ${
              !timeValidation.isValid
                ? 'border-rose-400 bg-rose-50/30 text-rose-950 focus:ring-rose-400'
                : 'border-slate-200 focus:ring-blue-500'
            }`}
          />
          <p className="text-[10px] text-slate-500">
            Carga predeterminada desde las 08:30. Si requiere un horario más temprano, ingréselo de manera manual.
          </p>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="input-reserva-fin" className="font-semibold text-slate-700 flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>Hora Término *</span>
          </label>
          <input
            id="input-reserva-fin"
            aria-label="Hora de término de la reserva"
            type="time"
            required
            value={formData.horaFin || '11:00'}
            onChange={(e) => {
              const newEnd = e.target.value;
              setFormData(prev => ({
                ...prev,
                horaFin: newEnd
              }));
              if (enableSingleSecondSpace) {
                setSingleSecondStartTime(newEnd);
                try {
                  const endMin = timeToMinutes(newEnd);
                  const eNext = Math.min(1439, endMin + 30);
                  setSingleSecondEndTime(formatMinutesToTime(eNext));
                } catch {
                  // ignore
                }
              }
            }}
            className={`w-full px-3.5 py-2.5 bg-white border rounded-xl text-slate-900 font-mono focus:outline-none focus:ring-2 shadow-xs font-bold ${
              !timeValidation.isValid
                ? 'border-rose-400 bg-rose-50/30 text-rose-950 focus:ring-rose-400'
                : 'border-slate-200 focus:ring-blue-500'
            }`}
          />
        </div>

        {!timeValidation.isValid && (
          <div
            id="time-validation-error-message"
            role="alert"
            className="sm:col-span-4 p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center space-x-2.5 shadow-2xs animate-fadeIn font-semibold"
          >
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>⚠️ {timeValidation.error || 'La hora de término debe ser posterior a la de inicio.'}</span>
          </div>
        )}

        {/* VISUAL REAL-TIME AVAILABILITY TIMELINE & SLOT ADVISOR (OPTIMIZATION STEP 3) */}
        <div className="sm:col-span-4">
          <SpaceAvailabilityTimeline
            space={formData.espacio || availableSpaces[0]?.name || ''}
            date={formData.fecha || editingReservation?.fecha || ''}
            currentStartTime={formData.horaInicio || '08:30'}
            currentEndTime={formData.horaFin || '09:30'}
            allReservations={allReservations}
            spaceBlocks={spaceBlocks}
            excludeReservationId={editingReservation?.id}
            terminaDiaSiguiente={Boolean(formData.terminaDiaSiguiente)}
            onSelectTimeRange={(start, end) => {
              setFormData(prev => ({
                ...prev,
                horaInicio: start,
                horaFin: end
              }));
            }}
          />
        </div>

        {/* INLINE CONFLICT REPORTING & 1-CLICK RECOMMENDATIONS (D9) */}
        {conflicts.length > 0 && (
          <div
            id="inline-conflict-warning"
            className="sm:col-span-4 p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-3 shadow-xs animate-fadeIn"
          >
            <div className="flex items-start space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="font-bold text-rose-950 text-xs sm:text-sm">
                    ⚠️ Conflicto de horario: {formatDisplayTitle(formData.espacio)} ya está ocupado en este rango
                  </p>
                  <span className="text-[11px] font-bold bg-rose-200 text-rose-900 px-2 py-0.5 rounded-md">
                    {conflicts.length} topamiento(s)
                  </span>
                </div>
                <div className="text-xs text-rose-800 space-y-1">
                  {conflicts.slice(0, 3).map((c, idx) => (
                    <div key={idx} className="flex flex-wrap items-center gap-1.5 bg-white/70 p-2 rounded-lg border border-rose-200">
                      <span className="font-bold text-slate-800">{c.horaInicio} - {c.horaFin}</span>
                      <span className="text-slate-500">•</span>
                      <span className="font-medium text-slate-900">{formatDisplayTitle(c.tipoActividad)}</span>
                      {c.responsable && (
                        <span className="text-slate-600 text-[11px]">(Resp: {formatDisplayTitle(c.responsable)})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 1-Click Inline Quick-Fix Actions */}
            <div className="pt-2 border-t border-rose-200">
              {!showInlineSuggestions ? (
                <button
                  type="button"
                  onClick={() => setShowInlineSuggestions(true)}
                  className="w-full text-left p-2.5 bg-white/95 hover:bg-white border border-rose-200 hover:border-indigo-300 rounded-xl transition flex items-center justify-between shadow-2xs group cursor-pointer"
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-md bg-indigo-600 text-white shadow-2xs">
                      Aviso
                    </span>
                    <span className="text-xs font-bold text-slate-800 group-hover:text-indigo-900 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Recomendaciones para resolver topamiento</span>
                    </span>
                  </div>
                  <span className="text-xs font-bold text-indigo-600 group-hover:text-indigo-800 flex items-center space-x-1">
                    <span>Hacer clic para ver</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span>Soluciones sugeridas:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowInlineSuggestions(false)}
                      className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      Ocultar
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {conflicts[0]?.horaFin && (
                      <button
                        type="button"
                        onClick={() => handleShiftImmediatelyAfter(conflicts[0].horaFin)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Mover después ({conflicts[0].horaFin})</span>
                      </button>
                    )}
                    {quickFreeSlots.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleApplyRecommendation(quickFreeSlots[0])}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Hueco libre: {quickFreeSlots[0].horaInicio} - {quickFreeSlots[0].horaFin}</span>
                      </button>
                    )}
                    {quickAltSpaces.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleApplyRecommendation(quickAltSpaces[0])}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Cambiar a {formatDisplayTitle(quickAltSpaces[0].espacio)}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowConflictDialog(true)}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer ml-auto"
                    >
                      <span>Asistente avanzado de topamientos</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Banner y Control de Desbloqueo de Horario: Aparece AUTOMÁTICAMENTE solo cuando el horario está fuera del horario normal (08:30 a 22:00 hrs) */}
        {loanScheduleCheck.requiresAuthorization && (
          <div
            id="banner-desbloqueo-horario"
            className="sm:col-span-4 p-3.5 rounded-xl bg-amber-50/95 border border-amber-300 space-y-3 shadow-2xs animate-fadeIn"
          >
            <div className="flex items-start space-x-2.5">
              <KeyRound className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="font-bold text-amber-950 text-xs flex items-center space-x-1.5">
                    <span>🔓 Desbloqueo de Horario (Fuera de Rango Normal 08:30 a 22:00 hrs)</span>
                  </p>
                  {isCoordinatorOrAdmin(currentUser) && (
                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      Perfil {currentUser?.role || 'Admin'} con facultad de desbloqueo
                    </span>
                  )}
                </div>
                <p className="text-amber-800 text-[11.5px] leading-relaxed">
                  {loanScheduleCheck.reason} Este horario opera fuera de la franja regular (08:30 a 22:00 hrs) y requiere desbloqueo oficial para registrarse.
                </p>
              </div>
            </div>

            {/* Opción adicional cuando el horario es nocturno o cruza medianoche */}
            {(formData.terminaDiaSiguiente || (timeStringToMinutes(formData.horaInicio || '') >= 18 * 60)) && (
              <div className="p-2 bg-white/80 rounded-lg border border-amber-200 flex items-center justify-between">
                <label htmlFor="checkbox-termina-dia-siguiente" className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="checkbox-termina-dia-siguiente"
                    checked={Boolean(formData.terminaDiaSiguiente)}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormData((prev) => ({ ...prev, terminaDiaSiguiente: checked }));
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    La actividad finaliza al día siguiente (+1 día / cruza medianoche)
                  </span>
                </label>
                {formData.terminaDiaSiguiente && (
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md flex items-center space-x-1">
                    <span>🌙</span>
                    <span>Cruza medianoche</span>
                  </span>
                )}
              </div>
            )}

            <div className="pt-2 border-t border-amber-200/80 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label htmlFor="input-clave-extension" className="text-xs font-semibold text-amber-950 flex items-center space-x-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-700" />
                  <span>Clave Oficial de Desbloqueo (ccd2026) *:</span>
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    id="input-clave-extension"
                    type="password"
                    placeholder="Ingresa ccd2026"
                    value={extendedAuthKey}
                    onChange={(e) => setExtendedAuthKey(e.target.value)}
                    className={`px-3 py-1.5 text-xs font-mono bg-white border rounded-lg focus:outline-none focus:ring-2 w-36 shadow-2xs ${
                      isExtensionAuthorized
                        ? 'border-emerald-500 ring-1 ring-emerald-500 text-emerald-950 font-bold'
                        : 'border-amber-300 focus:ring-amber-500 text-slate-800'
                    }`}
                  />
                  {isExtensionAuthorized ? (
                    <span className="text-emerald-800 bg-emerald-100 border border-emerald-300 text-[11px] font-bold px-2 py-1 rounded-md flex items-center space-x-1 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Desbloqueado</span>
                    </span>
                  ) : (
                    <span className="text-amber-800 bg-amber-100 border border-amber-300 text-[11px] font-semibold px-2 py-1 rounded-md">
                      Desbloqueo Requerido
                    </span>
                  )}
                </div>
              </div>

              {isExtensionAuthorized ? (
                <p className="text-[11px] text-emerald-700 font-semibold flex items-center space-x-1 bg-emerald-50/80 p-2 rounded-lg border border-emerald-200">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    ✓ Horario especial desbloqueado y autorizado para este préstamo por {currentUser?.name || currentUser?.username || 'Coordinador/Admin'}.
                  </span>
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-amber-100/60 p-2 rounded-lg border border-amber-200">
                  <p className="text-[11px] text-amber-900">
                    Ingresa la clave oficial <strong>ccd2026</strong> para desbloquear este horario fuera del rango normal (08:30 a 22:00 hrs).
                  </p>
                  {isCoordinatorOrAdmin(currentUser) && (
                    <button
                      type="button"
                      onClick={() => setExtendedAuthKey('ccd2026')}
                      className="text-[10.5px] text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-300 font-bold px-2.5 py-1 rounded-lg transition shadow-2xs cursor-pointer whitespace-nowrap"
                    >
                      ⚡ Desbloquear con {currentUser?.role || 'Admin'}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MULTI-SPACE OPTION (2do espacio / tramo horario para la actividad) */}
      {(!editingReservation || isDuplicating) && (
        <div className="p-3.5 bg-gradient-to-r from-blue-50/70 to-indigo-50/70 rounded-2xl border border-blue-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-blue-600 text-white rounded-lg">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                  Registrar 2° espacio / tramo horario para esta actividad
                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-full">
                    Opcional
                  </span>
                </span>
                <p className="text-[11px] text-slate-600">
                  {bookingMode === 'pattern'
                    ? 'Permite agendar un segundo tramo/espacio (ej: SALA 2 de 20:00 a 20:30) para cada día del patrón semanal.'
                    : bookingMode === 'specific'
                    ? 'Permite agendar un segundo tramo o espacio complementario (ej: SALA 2 o GIMNASIO) para cada una de las fechas específicas.'
                    : 'Permite agendar un segundo espacio (ej: SALA 2 o GIMNASIO) para el mismo día con su propio horario.'}
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                id="toggle-single-second-space"
                type="checkbox"
                checked={enableSingleSecondSpace}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setEnableSingleSecondSpace(checked);
                  if (checked) {
                    if (!singleSecondSpace) {
                      const defaultSec = availableSpaces.find((s) => s.name !== formData.espacio)?.name || availableSpaces[1]?.name || availableSpaces[0]?.name;
                      setSingleSecondSpace(defaultSec);
                    }
                    const baseStart = formData.horaFin || '20:00';
                    setSingleSecondStartTime(baseStart);
                    try {
                      const sMin = timeToMinutes(baseStart);
                      const eMin = Math.min(1439, sMin + 30);
                      setSingleSecondEndTime(formatMinutesToTime(eMin));
                    } catch {
                      setSingleSecondEndTime('20:30');
                    }
                  }
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {enableSingleSecondSpace && (
            <div className="pt-2.5 border-t border-blue-200/60 grid grid-cols-1 sm:grid-cols-4 gap-3 animate-fadeIn">
              <div className="space-y-1 sm:col-span-2">
                <label htmlFor="select-single-second-space" className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                  <MapPin className="w-3 h-3 text-indigo-600" />
                  <span>2° Espacio *</span>
                </label>
                <select
                  id="select-single-second-space"
                  aria-label="Segundo espacio requerido"
                  value={singleSecondSpace}
                  onChange={(e) => setSingleSecondSpace(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs font-bold text-xs"
                >
                  {availableSpaces.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name} {s.name === formData.espacio ? '(Mismo que 1er espacio)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="input-single-second-start" className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-indigo-600" />
                  <span>Inicio 2° Espacio</span>
                </label>
                <input
                  id="input-single-second-start"
                  aria-label="Hora de inicio del segundo espacio"
                  type="time"
                  value={singleSecondStartTime}
                  onChange={(e) => setSingleSecondStartTime(e.target.value)}
                  className={`w-full px-2.5 py-2 bg-white border rounded-xl text-slate-900 font-mono text-xs focus:ring-2 shadow-2xs font-bold ${
                    !singleSecondTimeValidation.isValid ? 'border-rose-400 bg-rose-50/40 text-rose-950 focus:ring-rose-400' : 'border-indigo-200 focus:ring-indigo-500'
                  }`}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="input-single-second-end" className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-indigo-600" />
                  <span>Término 2° Espacio</span>
                </label>
                <input
                  id="input-single-second-end"
                  aria-label="Hora de término del segundo espacio"
                  type="time"
                  value={singleSecondEndTime}
                  onChange={(e) => setSingleSecondEndTime(e.target.value)}
                  className={`w-full px-2.5 py-2 bg-white border rounded-xl text-slate-900 font-mono text-xs focus:ring-2 shadow-2xs font-bold ${
                    !singleSecondTimeValidation.isValid ? 'border-rose-400 bg-rose-50/40 text-rose-950 focus:ring-rose-400' : 'border-indigo-200 focus:ring-indigo-500'
                  }`}
                />
              </div>

              {!singleSecondTimeValidation.isValid && (
                <div className="sm:col-span-4 p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-center space-x-2 font-semibold animate-fadeIn">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>⚠️ {singleSecondTimeValidation.error || 'La hora de término del 2° espacio debe ser posterior a la de inicio.'}</span>
                </div>
              )}

              {singleSecondSpaceConflicts.length > 0 && (
                <div className="sm:col-span-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-2 font-medium">
                  <div className="flex items-center space-x-2 font-bold text-rose-950">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      Alerta de topamiento: Ya existe una reserva en {formatDisplayTitle(singleSecondSpace)} entre {singleSecondStartTime} y {singleSecondEndTime}.
                    </span>
                  </div>

                  {/* Direct 1-click solutions for second space */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rose-200/80">
                    <button
                      type="button"
                      onClick={handleFindNextSlotForSecondSpace}
                      className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[11px] font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Buscar horario libre en {formatDisplayTitle(singleSecondSpace)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSwitchSecondSpaceToAvailable}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center space-x-1 shadow-2xs cursor-pointer"
                    >
                      <MapPin className="w-3 h-3" />
                      <span>Cambiar a sala disponible a esta hora</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* SINGLE DATE HOLIDAY BANNER & CCD AUTHORIZATION */}
      {singleDateHolidayInfo && bookingMode === 'single' && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-amber-50 border-2 border-rose-300 text-rose-950 space-y-3 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 bg-rose-200/80 text-rose-900 rounded-xl mt-0.5 shrink-0 text-xl flex items-center justify-center">
              🇨🇱
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center space-x-2">
                <h4 className="text-xs font-extrabold uppercase tracking-wide text-rose-900">
                  Feriado Nacional en Chile: {singleDateHolidayInfo.name}
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-200 text-rose-900">
                  {singleDateHolidayInfo.isIrrenunciable ? 'Feriado Irrenunciable' : 'Día Inhábil Oficial'}
                </span>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">
                La fecha seleccionada ({formatDateDDMMYYYY(formData.fecha || editingReservation?.fecha || '')}) es un día feriado en Chile.
                Por defecto las reservas en días feriados están <strong>bloqueadas/omitidas</strong>.
                Para autorizar el uso excepcional de este espacio en feriado, debes ingresar la clave especial <strong>CCD</strong>.
              </p>
            </div>
          </div>

          {/* Clave CCD Authorization Input */}
          <div className="pt-2 border-t border-rose-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-rose-900">
              <KeyRound className="w-4 h-4 text-rose-700 shrink-0" />
              <span>Clave de Autorización para Feriados (CCD):</span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                id="input-reserva-clave-ccd"
                type="password"
                placeholder="Ingresa clave CCD"
                value={holidayOverrideKey}
                onChange={(e) => setHolidayOverrideKey(e.target.value)}
                aria-describedby="holiday-feedback-status"
                className="px-3 py-1.5 bg-white border border-rose-300 rounded-xl text-xs font-mono font-bold tracking-wider text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 w-44 shadow-2xs"
              />
              {isHolidayAuthorized ? (
                <span id="holiday-feedback-status" className="flex items-center space-x-1 text-emerald-800 bg-emerald-100 px-2.5 py-1 rounded-xl text-[11px] font-bold border border-emerald-300 shadow-2xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Feriado Autorizado</span>
                </span>
              ) : (
                <span id="holiday-feedback-status" className="text-[10px] text-rose-700 bg-rose-100 px-2 py-1 rounded-lg font-semibold border border-rose-200">
                  🚫 Clave requerida para avanzar
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modalidad de Reserva / Repetición */}
      <div className="space-y-1.5">
        <label htmlFor="input-reserva-recurrente" className="font-semibold text-slate-700 flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <Repeat className="w-3.5 h-3.5 text-blue-600" />
            <span>Modalidad de Reserva / Repetición</span>
          </span>
          <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
            Opción Admin
          </span>
        </label>
        <select
          id="input-reserva-recurrente"
          aria-label="Modalidad de Reserva o Repetición"
          disabled={isEditingSingleOccurrence}
          value={isEditingSingleOccurrence ? 'single' : bookingMode}
          onChange={(e) => {
            const val = e.target.value as 'single' | 'specific' | 'pattern';
            setBookingMode(val);
            if (val === 'single') {
              setFormData(prev => ({ ...prev, actividadRecurrente: 'No', tipoRecurrencia: '' }));
            } else if (val === 'specific') {
              setFormData(prev => ({ ...prev, actividadRecurrente: 'Sí', tipoRecurrencia: 'especificas' }));
              setGenerateFullSeries(true);
              if (formData.fecha && !specificDates.includes(formData.fecha)) {
                setSpecificDates([formData.fecha]);
              }
            } else if (val === 'pattern') {
              setFormData(prev => ({ ...prev, actividadRecurrente: 'Sí', tipoRecurrencia: 'semanal' }));
              setGenerateFullSeries(true);
            }
          }}
          className={`w-full px-3.5 py-2.5 border rounded-xl font-bold shadow-xs transition focus:outline-none focus:ring-2 ${
            isEditingSingleOccurrence
              ? 'bg-slate-100 border-slate-300 text-slate-700 cursor-not-allowed'
              : bookingMode !== 'single'
              ? 'bg-blue-50 border-blue-300 text-blue-900 focus:ring-blue-500'
              : 'bg-white border-slate-200 text-slate-900 focus:ring-blue-500'
          }`}
        >
          <option value="single">
            {isEditingSingleOccurrence
              ? `📅 Modificando SOLO esta fecha (${formatDateDDMMYYYY(editingReservation?.fecha || formData.fecha || '')})`
              : '📅 Fecha Única (1 sola sesión)'}
          </option>
          {!isEditingSingleOccurrence && (
            <>
              <option value="specific">🗓️ Fechas Específicas (Libre elección)</option>
              <option value="pattern">🔄 Repetir semanalmente hasta cierta fecha (Opción Admin)</option>
            </>
          )}
        </select>
        {isEditingSingleOccurrence && (
          <p className="text-[11px] text-slate-500">
            La selección de fechas múltiples está deshabilitada porque estás editando una ocurrencia aislada.
          </p>
        )}
      </div>

      {/* Section: Modalidad Fechas Específicas / Patrón Semanal */}
      <RecurrenceScheduleSection
        bookingMode={bookingMode}
        isEditingSingleOccurrence={isEditingSingleOccurrence}
        editingReservation={editingReservation}
        generateFullSeries={generateFullSeries}
        setGenerateFullSeries={setGenerateFullSeries}
        formData={formData}
        setFormData={setFormData}
        specificDates={specificDates}
        setSpecificDates={setSpecificDates}
        dateInputToAdd={dateInputToAdd}
        setDateInputToAdd={setDateInputToAdd}
        currentCalendarMonth={currentCalendarMonth}
        setCurrentCalendarMonth={setCurrentCalendarMonth}
        handleAddSpecificDate={handleAddSpecificDate}
        handleToggleSpecificDate={handleToggleSpecificDate}
        handleAddRelativeDays={handleAddRelativeDays}
        specificHolidayAnalysis={specificHolidayAnalysis}
        holidayOverrideKey={holidayOverrideKey}
        setHolidayOverrideKey={setHolidayOverrideKey}
        isHolidayAuthorized={isHolidayAuthorized}
        useCustomSchedulesPerDate={useCustomSchedulesPerDate}
        setUseCustomSchedulesPerDate={setUseCustomSchedulesPerDate}
        dateSchedules={dateSchedules}
        handleUpdateDateSchedule={handleUpdateDateSchedule}
        handleCopyDateScheduleToAll={handleCopyDateScheduleToAll}
        handleAutoFixDateSchedule={handleAutoFixDateSchedule}
        handleAutoFixAllDatesWithConflicts={handleAutoFixAllDatesWithConflicts}
        handleApplyBaseToAllDates={handleApplyBaseToAllDates}
        getDateSlotConflict={getDateSlotConflict}
        availableSpaces={availableSpaces}
        selectedDays={selectedDays}
        setSelectedDays={setSelectedDays}
        toggleDay={toggleDay}
        recurrenceStartDate={recurrenceStartDate}
        setRecurrenceStartDate={setRecurrenceStartDate}
        recurrenceEndDate={recurrenceEndDate}
        setRecurrenceEndDate={setRecurrenceEndDate}
        includeHolidaysInSeries={includeHolidaysInSeries}
        setIncludeHolidaysInSeries={setIncludeHolidaysInSeries}
        patternHolidayAnalysis={patternHolidayAnalysis}
        useCustomSchedulesPerDay={useCustomSchedulesPerDay}
        setUseCustomSchedulesPerDay={setUseCustomSchedulesPerDay}
        daySchedules={daySchedules}
        handleUpdateDaySchedule={handleUpdateDaySchedule}
        handleCopyDayScheduleToAll={handleCopyDayScheduleToAll}
        handleApplyBaseToAllDays={handleApplyBaseToAllDays}
        generatedDates={generatedDates}
        enableSingleSecondSpace={enableSingleSecondSpace}
        singleSecondSpace={singleSecondSpace}
        singleSecondStartTime={singleSecondStartTime}
        singleSecondEndTime={singleSecondEndTime}
      />
    </div>
  );
});
