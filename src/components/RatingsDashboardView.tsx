import { formatDisplayTitle } from '../utils/reservationVisuals';
import React, { useState, useMemo } from 'react';
import { subDays, format } from 'date-fns';
import { SpaceRating, Reservation } from '../types';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { getPhoneContactActions } from '../utils/phoneUtils';
import {
  generateMondayEmailReport,
  isEligibleForRating,
  getCurrentWeekendEndStr
} from '../services/ratingService';
import {
  Star,
  Cake,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Trash2,
  Search,
  Building2,
  Clock,
  Send,
  Zap
} from 'lucide-react';
import { ConfirmationModal } from './common/ConfirmationModal';

interface RatingsDashboardViewProps {
  ratings: SpaceRating[];
  reservations: Reservation[];
  currentUser?: { name?: string; role?: string; email?: string; [key: string]: any } | null;
  onOpenRatingModal: (reservation: Reservation, rating?: SpaceRating) => void;
  onDeleteRating: (ratingId: string) => void;
}

export const RatingsDashboardView: React.FC<RatingsDashboardViewProps> = ({
  ratings,
  reservations,
  currentUser,
  onOpenRatingModal,
  onDeleteRating
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'incidents' | 'positive'>('all');
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [autoSendSuccess, setAutoSendSuccess] = useState(false);
  const [ratingToDelete, setRatingToDelete] = useState<string | null>(null);

  // Date boundary: 1 week ago from today (yyyy-MM-dd)
  const oneWeekAgoStr = useMemo(() => {
    const d = subDays(new Date(), 7);
    return format(d, 'yyyy-MM-dd');
  }, []);

  // End of current weekend (Sunday of current week) to prevent rating birthdays in advance
  const currentWeekendEndStr = useMemo(() => {
    return getCurrentWeekendEndStr(new Date());
  }, []);

  // Calculate Monday report data strictly for Birthday loans
  const mondayReport = useMemo(() => {
    return generateMondayEmailReport(ratings, reservations);
  }, [ratings, reservations]);

  // Filter reservations strictly to Birthday Loans from the current weekend or past 7 days (never in advance)
  const birthdayReservations = useMemo(() => {
    return reservations.filter(r => 
      isEligibleForRating(r) && 
      r.fecha >= oneWeekAgoStr && 
      r.fecha <= currentWeekendEndStr
    );
  }, [reservations, oneWeekAgoStr, currentWeekendEndStr]);

  const ratedReservationIds = useMemo(() => {
    return new Set(ratings.map(r => r.reservationId));
  }, [ratings]);

  const todayStr = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);
  const [pendingTab, setPendingTab] = useState<'ready' | 'upcoming'>('ready');

  // Pending Birthday loans that haven't been rated yet
  const { readyToRateReservations, upcomingReservations, pendingBirthdayReservations } = useMemo(() => {
    const unrated = birthdayReservations
      .filter(r => !ratedReservationIds.has(r.id))
      .sort((a, b) => b.fecha.localeCompare(a.fecha));

    return {
      pendingBirthdayReservations: unrated,
      readyToRateReservations: unrated.filter(r => r.fecha <= todayStr),
      upcomingReservations: unrated.filter(r => r.fecha > todayStr)
    };
  }, [birthdayReservations, ratedReservationIds, todayStr]);

  // Filtered ratings list (strictly Birthday loans ratings from 1 week ago onwards)
  const filteredRatings = useMemo(() => {
    return ratings
      .filter(r => r.esCumpleanos !== false && r.fecha >= oneWeekAgoStr) // Only birthday ratings from 1 week ago onwards
      .filter((r) => {
        const matchSearch =
          !searchTerm.trim() ||
          r.responsable.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.espacio.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.tipoActividad.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.auxiliarName && r.auxiliarName.toLowerCase().includes(searchTerm.toLowerCase()));

        if (!matchSearch) return false;

        if (filterMode === 'incidents') return r.huboDanos || r.dejoBasura || (typeof r.puntajeGeneral === 'number' && r.puntajeGeneral > 0 && r.puntajeGeneral <= 2);
        if (filterMode === 'positive') return (typeof r.puntajeGeneral === 'number' && r.puntajeGeneral >= 4 && !r.huboDanos);

        return true;
      });
  }, [ratings, searchTerm, filterMode, oneWeekAgoStr]);

  // Overall statistics
  const stats = useMemo(() => {
    const bdayRatings = ratings.filter(r => r.esCumpleanos !== false && r.fecha >= oneWeekAgoStr);
    const total = bdayRatings.length;
    const incidents = bdayRatings.filter(r => r.huboDanos || r.dejoBasura || (typeof r.puntajeGeneral === 'number' && r.puntajeGeneral > 0 && r.puntajeGeneral <= 2)).length;
    const validRatings = bdayRatings.filter(r => typeof r.puntajeGeneral === 'number' && !isNaN(r.puntajeGeneral) && r.puntajeGeneral > 0);
    const avg = validRatings.length > 0
      ? validRatings.reduce((acc, r) => acc + r.puntajeGeneral, 0) / validRatings.length
      : null;
    return { total, incidents, avg, pending: pendingBirthdayReservations.length };
  }, [ratings, pendingBirthdayReservations, oneWeekAgoStr]);

  const handleCopyEmailText = () => {
    navigator.clipboard.writeText(mondayReport.body);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 3000);
  };

  const handleTriggerAutoSend = () => {
    // Open mail client with pre-filled automated report
    window.location.href = mondayReport.mailtoUrl;
    setAutoSendSuccess(true);
    setTimeout(() => setAutoSendSuccess(false), 4000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Banner: Automatic Monday Email Summary & Quick Actions */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-blue-700/30 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-amber-400 text-slate-950 rounded-full text-xs font-black uppercase tracking-wider flex items-center space-x-1.5 shadow-sm">
                <Cake className="w-3.5 h-3.5" />
                <span>Solo Préstamos de Cumpleaños</span>
              </span>
              <span className="px-3 py-1 bg-blue-800 text-blue-100 rounded-full text-xs font-bold flex items-center space-x-1 border border-blue-600/50">
                <Zap className="w-3.5 h-3.5 text-amber-300" />
                <span>Envío Automático los Lunes</span>
              </span>
              <span className="px-3 py-1 bg-white/15 text-white rounded-full text-xs font-semibold flex items-center space-x-1 border border-white/20">
                <Clock className="w-3.5 h-3.5 text-amber-300" />
                <span>Última semana y próximas fechas</span>
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Calificaciones de Préstamos de Cumpleaños
            </h2>
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              Exclusivo para evaluar eventos y celebraciones de cumpleaños (limpieza, puntualidad, mobiliario y comportamiento). Los días lunes se envía y consolida automáticamente el reporte para <strong>cristianshute@gmail.com</strong>.
            </p>
          </div>

          {/* Email Actions buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              onClick={handleCopyEmailText}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-2xl text-xs font-bold transition flex items-center space-x-2 backdrop-blur-xs cursor-pointer"
            >
              {copiedEmail ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copiedEmail ? '¡Copiado al Portapapeles!' : 'Copiar Texto del Informe'}</span>
            </button>

            <button
              onClick={handleTriggerAutoSend}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 rounded-2xl text-xs font-black shadow-lg transition flex items-center space-x-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>{autoSendSuccess ? '¡Enviando Correo...!' : 'Enviar Correo Automático (Lunes)'}</span>
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-white/10 text-xs">
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
            <span className="text-amber-300 block text-[11px]">🎂 Cumpleaños Evaluados</span>
            <span className="text-2xl font-black text-white">{stats.total}</span>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
            <span className="text-blue-300 block text-[11px]">⏳ Pendientes de Calificar</span>
            <span className="text-2xl font-black text-amber-300">{stats.pending}</span>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
            <span className="text-rose-300 block text-[11px]">⚠️ Con Incidentes / Daños</span>
            <span className="text-2xl font-black text-rose-300">{stats.incidents}</span>
          </div>
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
            <span className="text-emerald-300 block text-[11px]">Promedio de Cumpleaños</span>
            <div className="text-2xl font-black text-emerald-300 flex items-center space-x-1">
              {stats.avg !== null ? (
                <>
                  <span>{stats.avg.toFixed(1)}</span>
                  <Star className="w-4 h-4 fill-emerald-300 text-emerald-300" />
                </>
              ) : (
                <span className="text-xs font-semibold text-slate-300 italic">Sin calificaciones</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Pending Birthday Loans on Left, Completed Ratings on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Préstamos de Cumpleaños Pendientes de Calificar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
              <Cake className="w-4 h-4 text-amber-600" />
              <span>Cumpleaños por Calificar</span>
            </h3>
          </div>

          {/* Sub-tabs for Pending: Listas vs Por Realizar */}
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setPendingTab('ready')}
              className={`flex-1 py-1.5 px-2 rounded-lg transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                pendingTab === 'ready'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Listas</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                pendingTab === 'ready' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {readyToRateReservations.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPendingTab('upcoming')}
              className={`flex-1 py-1.5 px-2 rounded-lg transition cursor-pointer flex items-center justify-center space-x-1.5 ${
                pendingTab === 'upcoming'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Por realizar</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                pendingTab === 'upcoming' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {upcomingReservations.length}
              </span>
            </button>
          </div>

          <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
            {pendingTab === 'ready' ? (
              readyToRateReservations.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-slate-700">¡Al día con los Cumpleaños!</p>
                  <p>No hay préstamos de cumpleaños pasados pendientes de calificación.</p>
                </div>
              ) : (
                readyToRateReservations.map((res) => (
                  <div
                    key={res.id}
                    className="p-4 bg-white border border-amber-200 rounded-2xl shadow-2xs hover:shadow-md transition space-y-2.5 dynamic-hover-card"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-md border border-amber-300 flex items-center space-x-1">
                            <Cake className="w-3 h-3 text-amber-700" />
                            <span>Cumpleaños</span>
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate block">
                            {formatDisplayTitle(res.descripcion || res.tipoActividad)}
                          </span>
                        </div>
                        <span className="text-[11px] text-blue-600 font-semibold flex items-center space-x-1">
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{formatDisplayTitle(res.espacio)}</span>
                        </span>
                      </div>

                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-1 rounded-lg shrink-0">
                        {formatDateDDMMYYYY(res.fecha)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">Solicitante: {formatDisplayTitle(res.responsable)}</span>
                        <span className="font-mono text-slate-500">{res.horaInicio} - {res.horaFin}</span>
                      </div>
                      {res.telefonoContacto && (() => {
                        const phoneAction = getPhoneContactActions(res.telefonoContacto);
                        if (!phoneAction) return <div className="text-[10px] text-slate-500 font-mono">📞 {res.telefonoContacto}</div>;
                        return (
                          <div className="flex items-center space-x-1.5 text-[10px] font-mono">
                            <a
                              href={phoneAction.telHref}
                              className="text-blue-600 hover:text-blue-800 hover:underline flex items-center space-x-1"
                              title="Llamar"
                            >
                              <span>📞</span>
                              <span>{res.telefonoContacto}</span>
                            </a>
                            <a
                              href={phoneAction.waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              title="WhatsApp"
                            >
                              WA
                            </a>
                          </div>
                        );
                      })()}
                    </div>

                    <button
                      onClick={() => onOpenRatingModal(res)}
                      className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black rounded-xl shadow-xs transition flex items-center justify-center space-x-1.5 cursor-pointer"
                    >
                      <Star className="w-3.5 h-3.5 fill-slate-950 text-slate-950" />
                      <span>Calificar Cumpleaños</span>
                    </button>
                  </div>
                ))
              )
            ) : (
              upcomingReservations.length === 0 ? (
                <div className="p-6 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                  <Clock className="w-8 h-8 text-blue-500 mx-auto mb-2 opacity-80" />
                  <p className="font-semibold text-slate-700">Sin cumpleaños futuros</p>
                  <p>No hay préstamos de cumpleaños programados para los próximos días del ciclo.</p>
                </div>
              ) : (
                upcomingReservations.map((res) => (
                  <div
                    key={res.id}
                    className="p-4 bg-white border border-blue-200 rounded-2xl shadow-2xs space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-md border border-blue-300 flex items-center space-x-1">
                            <Clock className="w-3 h-3 text-blue-700" />
                            <span>Por Realizar</span>
                          </span>
                          <span className="text-xs font-bold text-slate-900 truncate block">
                            {formatDisplayTitle(res.descripcion || res.tipoActividad)}
                          </span>
                        </div>
                        <span className="text-[11px] text-blue-600 font-semibold flex items-center space-x-1">
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{formatDisplayTitle(res.espacio)}</span>
                        </span>
                      </div>

                      <span className="text-[10px] font-mono font-bold bg-blue-50 text-blue-800 border border-blue-200 px-2 py-1 rounded-lg shrink-0">
                        {formatDateDDMMYYYY(res.fecha)}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-600 space-y-0.5 pt-1 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">Solicitante: {formatDisplayTitle(res.responsable)}</span>
                        <span className="font-mono text-slate-500">{res.horaInicio} - {res.horaFin}</span>
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-500 text-center font-medium">
                      🔒 La calificación se habilitará cuando concluya el evento
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* Right Column (2 cols wide): Historial de Calificaciones de Cumpleaños */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filters & Search Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por solicitante, espacio, evaluador de turno..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos ({filteredRatings.length})
              </button>
              <button
                onClick={() => setFilterMode('positive')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  filterMode === 'positive'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                ⭐ Excelentes (4.0+)
              </button>
              <button
                onClick={() => setFilterMode('incidents')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  filterMode === 'incidents'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                }`}
              >
                ⚠️ Incidentes / Daños
              </button>
            </div>
          </div>

          {/* Ratings Cards List */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {filteredRatings.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-400 text-xs">
                <Cake className="w-10 h-10 text-amber-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">No hay evaluaciones de cumpleaños registradas desde la última semana</p>
                <p className="mt-1">Selecciona un préstamo de cumpleaños del panel izquierdo para calificarlo.</p>
              </div>
            ) : (
              filteredRatings.map((rating) => {
                const res = reservations.find(r => r.id === rating.reservationId);

                return (
                  <div
                    key={rating.id}
                    className={`p-4 bg-white rounded-2xl border transition shadow-2xs dynamic-hover-card space-y-3 ${
                      rating.huboDanos || rating.puntajeGeneral <= 2
                        ? 'border-rose-300 ring-1 ring-rose-200'
                        : 'border-amber-200'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm">{formatDisplayTitle(rating.responsable)}</span>
                          {rating.telefonoContacto && (() => {
                            const phoneAction = getPhoneContactActions(rating.telefonoContacto);
                            if (!phoneAction) return <span className="text-[11px] font-mono text-slate-500">📞 {rating.telefonoContacto}</span>;
                            return (
                              <div className="flex items-center space-x-1.5">
                                <a
                                  href={phoneAction.telHref}
                                  className="text-[11px] font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center space-x-1"
                                  title="Llamar"
                                >
                                  <span>📞</span>
                                  <span>{rating.telefonoContacto}</span>
                                </a>
                                <a
                                  href={phoneAction.waHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                  title="WhatsApp"
                                >
                                  WA
                                </a>
                              </div>
                            );
                          })()}
                          <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-300 flex items-center space-x-1">
                            <Cake className="w-3 h-3 text-amber-700" />
                            <span>Cumpleaños</span>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                          <span className="font-semibold text-blue-700">{formatDisplayTitle(rating.espacio)}</span>
                          <span>•</span>
                          <span className="font-mono">{formatDateDDMMYYYY(rating.fecha)}</span>
                          <span>•</span>
                          <span>Actividad: {formatDisplayTitle(rating.tipoActividad)}</span>
                        </div>
                      </div>

                      {/* Overall Star Badge */}
                      <div className="flex items-center space-x-2">
                        <div className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center space-x-1.5 shadow-2xs ${
                          rating.puntajeGeneral >= 4
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                            : rating.puntajeGeneral === 3
                            ? 'bg-amber-50 text-amber-800 border border-amber-300'
                            : 'bg-rose-50 text-rose-800 border border-rose-300'
                        }`}>
                          <Star className="w-4 h-4 fill-current" />
                          <span className="text-sm font-black">{rating.puntajeGeneral}.0</span>
                        </div>

                        {res && (
                          <button
                            onClick={() => onOpenRatingModal(res, rating)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
                            title="Editar calificación"
                          >
                            Editar
                          </button>
                        )}

                        <button
                          onClick={() => setRatingToDelete(rating.id)}
                          className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer flex items-center justify-center"
                          title="Eliminar calificación"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Breakdown Scores Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-[11px]">
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-slate-500 block">Limpieza y Orden</span>
                        <span className="font-bold text-slate-800">{rating.limpieza} / 5 ⭐</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-slate-500 block">Puntualidad</span>
                        <span className="font-bold text-slate-800">{rating.puntualidad} / 5 ⭐</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-slate-500 block">Cuidado Mobiliario</span>
                        <span className="font-bold text-slate-800">{rating.cuidadoInstalaciones} / 5 ⭐</span>
                      </div>
                      <div className="p-2 bg-slate-50 rounded-xl">
                        <span className="text-slate-500 block">Normas / Convivencia</span>
                        <span className="font-bold text-slate-800">{rating.comportamiento} / 5 ⭐</span>
                      </div>
                    </div>

                    {/* Critical Flags / Incident Alerts */}
                    {(rating.huboDanos || rating.dejoBasura || rating.excedioHorario) && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
                        <span className="font-bold flex items-center space-x-1 text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Incidentes Reportados en Cumpleaños:</span>
                        </span>
                        <ul className="list-disc list-inside text-[11px] space-y-0.5 pl-1">
                          {rating.huboDanos && (
                            <li><strong>Daños / Roturas:</strong> {rating.detalleDanos || 'Daños en el mobiliario o espacio.'}</li>
                          )}
                          {rating.dejoBasura && <li><strong>Limpieza:</strong> Dejó residuos, restos de comida o basura acumulada.</li>}
                          {rating.excedioHorario && (
                            <li><strong>Horario:</strong> Excedió la hora de salida en {rating.minutosExceso || 15} minutos.</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Observaciones & Evaluator Signature */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                      {rating.observaciones ? (
                        <p className="italic text-slate-700 max-w-lg">
                          "{rating.observaciones}"
                        </p>
                      ) : (
                        <span>Sin observaciones adicionales.</span>
                      )}

                      <span className="font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                        Evaluado por: <strong>{rating.auxiliarName}</strong>
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {ratingToDelete && (
        <ConfirmationModal
          isOpen={Boolean(ratingToDelete)}
          title="¿Eliminar Calificación?"
          message="¿Estás seguro de que deseas eliminar permanentemente esta calificación de espacio?"
          variant="danger"
          confirmLabel="Eliminar Calificación"
          onConfirm={() => {
            onDeleteRating(ratingToDelete);
            setRatingToDelete(null);
          }}
          onCancel={() => setRatingToDelete(null)}
        />
      )}
    </div>
  );
};
