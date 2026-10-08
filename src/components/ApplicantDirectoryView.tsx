import { formatDisplayTitle } from '../utils/reservationVisuals';
import React, { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Reservation, SpaceRating, ApplicantSummary } from '../types';
import {
  buildApplicantSummaries,
  isApplicantReservation,
  categorizeApplicantActivity,
  ApplicantActivityCategory
} from '../services/applicantDirectoryService';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { getPhoneContactActions } from '../utils/phoneUtils';
import { ApplicantSummaryCard } from './ApplicantSummaryCard';
import {
  Users,
  Search,
  Star,
  Calendar,
  AlertTriangle,
  FileSignature,
  Phone,
  Mail,
  Home,
  ChevronRight,
  X,
  Tag
} from 'lucide-react';

interface ApplicantDirectoryViewProps {
  reservations: readonly Reservation[];
  ratings: readonly SpaceRating[];
  onSelectReservation?: (reserva: Reservation) => void;
  onNewReservationForApplicant?: (applicant: ApplicantSummary) => void;
}

function getActivityBadgeStyle(cat: string) {
  switch (cat) {
    case 'PRÉSTAMO':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'ENSAYO':
      return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'CUMPLEAÑOS':
      return 'bg-pink-50 text-pink-700 border-pink-200';
    case 'OTROS':
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
}

export const ApplicantDirectoryView: React.FC<ApplicantDirectoryViewProps> = ({
  reservations,
  ratings,
  onSelectReservation,
  onNewReservationForApplicant
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'with_incidents' | 'with_letters' | 'high_usage'>('all');
  const [activityCategoryFilter, setActivityCategoryFilter] = useState<'all' | ApplicantActivityCategory>('all');
  const [selectedApplicant, setSelectedApplicant] = useState<ApplicantSummary | null>(null);

  // Build aggregated summaries (only applicant activities: prestamos, ensayos, cumpleaños, otros)
  const allSummaries = useMemo(() => {
    return buildApplicantSummaries(reservations, ratings);
  }, [reservations, ratings]);

  // Filter list
  const filteredSummaries = useMemo(() => {
    return allSummaries.filter((s) => {
      if (filterType === 'with_incidents' && s.incidentesCount === 0) return false;
      if (filterType === 'with_letters' && s.cartasAdjuntasCount === 0) return false;
      if (filterType === 'high_usage' && s.totalReservas < 5) return false;

      // Activity category filter (Préstamos, Ensayos, Cumpleaños, Otros)
      if (activityCategoryFilter !== 'all') {
        if (!s.tiposActividad || !s.tiposActividad.includes(activityCategoryFilter)) {
          return false;
        }
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = s.responsable.toLowerCase().includes(q);
        const matchRut = (s.rut || '').toLowerCase().includes(q);
        const matchPhone = (s.telefonoContacto || '').toLowerCase().includes(q);
        const matchEmail = (s.emailContacto || '').toLowerCase().includes(q);
        if (!matchName && !matchRut && !matchPhone && !matchEmail) return false;
      }
      return true;
    });
  }, [allSummaries, filterType, activityCategoryFilter, searchTerm]);

  // Virtualizer for smooth rendering of hundreds of applicants
  const directoryParentRef = useRef<HTMLDivElement>(null);
  const directoryVirtualizer = useVirtualizer({
    count: filteredSummaries.length,
    getScrollElement: () => directoryParentRef.current,
    estimateSize: () => 160,
    overscan: 5
  });

  // Counts by activity category
  const activityCategoryCounts = useMemo(() => {
    let prestamos = 0;
    let ensayos = 0;
    let cumpleanos = 0;
    let otros = 0;

    for (const s of allSummaries) {
      if (s.tiposActividad?.includes('PRÉSTAMO')) prestamos++;
      if (s.tiposActividad?.includes('ENSAYO')) ensayos++;
      if (s.tiposActividad?.includes('CUMPLEAÑOS')) cumpleanos++;
      if (s.tiposActividad?.includes('OTROS')) otros++;
    }

    return { prestamos, ensayos, cumpleanos, otros };
  }, [allSummaries]);

  // Total KPIs
  const totalApplicants = allSummaries.length;
  const applicantsWithIncidents = allSummaries.filter((s) => s.incidentesCount > 0).length;
  const totalHours = Math.round(allSummaries.reduce((acc, curr) => acc + curr.totalHorasUsadas, 0));

  // Get reservations belonging to the selected applicant (strictly applicant activities only)
  const selectedApplicantReservations = useMemo(() => {
    if (!selectedApplicant) return [];
    const targetName = selectedApplicant.responsable.toLowerCase();
    const targetRut = selectedApplicant.rut ? selectedApplicant.rut.trim().toUpperCase() : '';

    return reservations
      .filter((r) => {
        // Strictly only applicant activities (prestamos, ensayos, cumpleaños, otros)
        if (!isApplicantReservation(r)) return false;
        if (targetRut && r.rut && r.rut.trim().toUpperCase() === targetRut) return true;
        const rName = (r.responsable || '').toLowerCase();
        return rName === targetName || rName.includes(targetName) || targetName.includes(rName);
      })
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  }, [selectedApplicant, reservations]);

  // Get ratings belonging to selected applicant
  const selectedApplicantRatings = useMemo(() => {
    if (!selectedApplicant) return [];
    const targetName = selectedApplicant.responsable.toLowerCase();
    return ratings.filter((rat) => {
      const rName = (rat.responsable || '').toLowerCase();
      return rName === targetName || rName.includes(targetName) || targetName.includes(rName);
    });
  }, [selectedApplicant, ratings]);

  return (
    <div className="w-full max-w-[1680px] mx-auto px-3 sm:px-4 lg:px-6 py-6 space-y-6">
      {/* View Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/20 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Directorio y Registro de Solicitantes</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-bold">
                {totalApplicants} solicitantes únicos
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Registro exclusivo de solicitudes vecinales: <strong>Préstamos, Ensayos, Cumpleaños y Otros</strong>. Talleres y actividades institucionales quedan excluidos.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Total Solicitantes Únicos</span>
          <p className="text-2xl font-black text-slate-800 mt-2">{totalApplicants}</p>
          <span className="text-[11px] text-slate-400">Vecinos con préstamos, ensayos, cumpleaños u otros</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">Horas Totales en Solicitudes</span>
          <p className="text-2xl font-black text-emerald-600 mt-2">{totalHours} hrs</p>
          <span className="text-[11px] text-slate-400">Tiempo acumulado de uso vecinal</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Con Antecedentes / Incidentes</span>
            {applicantsWithIncidents > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
            )}
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">{applicantsWithIncidents}</p>
          <span className="text-[11px] text-slate-400">Solicitantes con daños, basura o notas bajas</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, R.U.T., teléfono o correo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
          </div>

          {/* Condition Filters */}
          <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                filterType === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos ({allSummaries.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('high_usage')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                filterType === 'high_usage'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Uso Frecuente (5+)
            </button>
            <button
              type="button"
              onClick={() => setFilterType('with_letters')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                filterType === 'with_letters'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Con Cartas Adjuntas
            </button>
            <button
              type="button"
              onClick={() => setFilterType('with_incidents')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer shrink-0 ${
                filterType === 'with_incidents'
                  ? 'bg-rose-600 text-white'
                  : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              ⚠️ Con Incidentes ({applicantsWithIncidents})
            </button>
          </div>
        </div>

        {/* Activity Category Filter Pills (Préstamos, Ensayos, Cumpleaños, Otros) */}
        <div className="flex items-center space-x-2 pt-2 border-t border-slate-100 overflow-x-auto text-xs">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] shrink-0 flex items-center gap-1">
            <Tag className="w-3 h-3" />
            <span>Tipo de Solicitud:</span>
          </span>

          <button
            type="button"
            onClick={() => setActivityCategoryFilter('all')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer shrink-0 ${
              activityCategoryFilter === 'all'
                ? 'bg-blue-600 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todas ({allSummaries.length})
          </button>

          <button
            type="button"
            onClick={() => setActivityCategoryFilter('PRÉSTAMO')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activityCategoryFilter === 'PRÉSTAMO'
                ? 'bg-blue-700 text-white shadow-2xs'
                : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
            }`}
          >
            <span>Préstamos</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/30">{activityCategoryCounts.prestamos}</span>
          </button>

          <button
            type="button"
            onClick={() => setActivityCategoryFilter('ENSAYO')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activityCategoryFilter === 'ENSAYO'
                ? 'bg-purple-700 text-white shadow-2xs'
                : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
            }`}
          >
            <span>Ensayos</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/30">{activityCategoryCounts.ensayos}</span>
          </button>

          <button
            type="button"
            onClick={() => setActivityCategoryFilter('CUMPLEAÑOS')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activityCategoryFilter === 'CUMPLEAÑOS'
                ? 'bg-pink-700 text-white shadow-2xs'
                : 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100'
            }`}
          >
            <span>Cumpleaños</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/30">{activityCategoryCounts.cumpleanos}</span>
          </button>

          <button
            type="button"
            onClick={() => setActivityCategoryFilter('OTROS')}
            className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1.5 ${
              activityCategoryFilter === 'OTROS'
                ? 'bg-slate-700 text-white shadow-2xs'
                : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
            }`}
          >
            <span>Otros</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/30">{activityCategoryCounts.otros}</span>
          </button>
        </div>
      </div>

      {/* Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Applicant Cards List (7 cols) */}
        <div className="lg:col-span-7">
          {filteredSummaries.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-xs">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-700">No se encontraron solicitantes</p>
              <p className="text-xs text-slate-400 mt-1">Prueba con otro término de búsqueda o filtro</p>
            </div>
          ) : (
            <div
              ref={directoryParentRef}
              className="max-h-[85vh] overflow-y-auto pr-1"
            >
              <div
                style={{
                  height: `${directoryVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative'
                }}
              >
                {directoryVirtualizer.getVirtualItems().map((virtualRow) => {
                  const applicant = filteredSummaries[virtualRow.index];
                  if (!applicant) return null;
                  const isSelected = selectedApplicant?.responsable === applicant.responsable;

                  return (
                    <div
                      key={applicant.responsable}
                      data-index={virtualRow.index}
                      ref={directoryVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                        paddingBottom: '12px'
                      }}
                    >
                      <ApplicantSummaryCard
                        applicant={applicant}
                        isSelected={isSelected}
                        onSelect={(app) => setSelectedApplicant(app)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Selected Applicant Detail Profile (5 cols) */}
        <div className="lg:col-span-5">
          {selectedApplicant ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs sticky top-24 space-y-4 max-h-[85vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-slate-200">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
                    Ficha de Solicitante
                  </span>
                  <h2 className="text-lg font-black text-slate-900 leading-tight">
                    {formatDisplayTitle(selectedApplicant.responsable)}
                  </h2>
                  {selectedApplicant.rut && (
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      R.U.T.: {selectedApplicant.rut}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedApplicant(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Contact card */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2 text-xs">
                {(() => {
                  const phoneAction = getPhoneContactActions(selectedApplicant.telefonoContacto);
                  if (!phoneAction) return null;
                  return (
                    <div className="flex items-center justify-between gap-2 p-2 bg-white rounded-lg border border-slate-200">
                      <div className="flex items-center space-x-2 text-slate-700 min-w-0">
                        <Phone className="w-4 h-4 text-blue-600 shrink-0" />
                        <a
                          href={phoneAction.telHref}
                          className="font-semibold text-slate-800 hover:text-blue-700 hover:underline transition truncate"
                          title={`Llamar a ${formatDisplayTitle(selectedApplicant.responsable)} (${selectedApplicant.telefonoContacto})`}
                        >
                          {selectedApplicant.telefonoContacto}
                        </a>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <a
                          href={phoneAction.telHref}
                          className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-bold text-[11px] transition flex items-center space-x-1"
                          title="Llamar directamente por teléfono"
                        >
                          <span>Llamar</span>
                        </a>
                        <a
                          href={phoneAction.waHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md font-bold text-[11px] transition flex items-center space-x-1"
                          title="Enviar mensaje por WhatsApp"
                        >
                          <span>WhatsApp</span>
                        </a>
                      </div>
                    </div>
                  );
                })()}
                {selectedApplicant.emailContacto && (
                  <div className="flex items-center space-x-2 text-slate-700">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-semibold truncate">{selectedApplicant.emailContacto}</span>
                  </div>
                )}
                {selectedApplicant.domicilio && (
                  <div className="flex items-center space-x-2 text-slate-700">
                    <Home className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{selectedApplicant.domicilio}</span>
                  </div>
                )}
              </div>

              {/* Action Button: Reservar para este solicitante */}
              {onNewReservationForApplicant && (
                <button
                  type="button"
                  id="btn-applicant-new-reserva"
                  onClick={() => onNewReservationForApplicant(selectedApplicant)}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Calendar className="w-4 h-4" />
                  <span>+ Nueva Solicitud para {selectedApplicant.responsable.split(' ')[0]}</span>
                </button>
              )}

              {/* Incident Alert if exists */}
              {selectedApplicant.incidentesCount > 0 && (
                <div className="bg-rose-50 border border-rose-300 rounded-xl p-3 text-xs text-rose-900">
                  <div className="flex items-center space-x-2 font-bold mb-1">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>Registro de Incidentes Previos ({selectedApplicant.incidentesCount})</span>
                  </div>
                  <p className="text-[11.5px] leading-relaxed">
                    Este solicitante registra observaciones desfavorables por auxiliares de turno (daños en dependencias, restos de basura o sobreuso de horario).
                  </p>
                </div>
              )}

              {/* History of Applicant Bookings */}
              <div>
                <h3 className="text-xs font-extrabold uppercase text-slate-500 mb-2 flex items-center justify-between">
                  <span>Historial de Solicitudes ({selectedApplicantReservations.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal">Préstamos, Ensayos, Cumpleaños, Otros</span>
                </h3>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {selectedApplicantReservations.map((res) => {
                    const actCat = categorizeApplicantActivity(res.tipoActividad, res.tipoPrestamo, res.descripcion);
                    return (
                      <div
                        key={res.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Ver detalles de la reserva del ${formatDateDDMMYYYY(res.fecha)}: ${formatDisplayTitle(res.espacio)}`}
                        onClick={() => onSelectReservation && onSelectReservation(res)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectReservation && onSelectReservation(res);
                          }
                        }}
                        className="p-2.5 bg-white border border-slate-200 rounded-xl text-xs hover:bg-slate-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition flex items-center justify-between"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-0.5">
                            <span className="font-bold text-slate-900">{formatDateDDMMYYYY(res.fecha)}</span>
                            <span className="text-slate-400 font-mono text-[11px]">
                              {res.horaInicio} - {res.horaFin}
                            </span>
                            {actCat && (
                              <span className={`text-[9.5px] font-extrabold px-1.5 py-0.2 rounded border ${getActivityBadgeStyle(actCat)}`}>
                                {actCat}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-600 block truncate mt-0.5">
                            {formatDisplayTitle(res.espacio)} • {formatDisplayTitle(res.tipoActividad)} {res.descripcion ? `(${formatDisplayTitle(res.descripcion)})` : ''}
                          </span>
                        </div>

                        {res.cartaCompromisoAdjunta && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0 flex items-center gap-1">
                            <FileSignature className="w-3 h-3" />
                            <span>Carta</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Auxiliary Evaluations History */}
              {selectedApplicantRatings.length > 0 && (
                <div>
                  <h3 className="text-xs font-extrabold uppercase text-slate-500 mb-2">
                    Evaluaciones del Personal Auxiliar ({selectedApplicantRatings.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedApplicantRatings.map((rat) => (
                      <div
                        key={rat.id}
                        className={`p-2.5 rounded-xl border text-xs ${
                          rat.huboDanos || rat.dejoBasura || rat.puntajeGeneral <= 2
                            ? 'bg-rose-50 border-rose-200 text-rose-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span>{formatDateDDMMYYYY(rat.fecha)} - {formatDisplayTitle(rat.espacio)}</span>
                          <span className="flex items-center gap-0.5 text-amber-600">
                            ★ {rat.puntajeGeneral}/5
                          </span>
                        </div>
                        {rat.observaciones && (
                          <p className="text-[11px] mt-1 italic opacity-90">
                            "{rat.observaciones}"
                          </p>
                        )}
                        <span className="text-[10px] text-slate-400 block mt-1">
                          Evaluado por auxiliar: {rat.auxiliarName}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-xs text-slate-400 sticky top-24">
              <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <h3 className="text-sm font-bold text-slate-700">Ningún solicitante seleccionado</h3>
              <p className="text-xs text-slate-400 mt-1">
                Haz clic en una ficha para consultar su historial de solicitudes y antecedentes
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

