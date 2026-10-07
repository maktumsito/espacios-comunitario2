import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  X,
  History,
  Trash2,
  Edit3,
  PlusCircle,
  RotateCcw,
  Search,
  Calendar,
  Clock,
  MapPin,
  User,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Filter,
  Download,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { AuditChangeLogEntry, AuditActionType, Reservation } from '../types';
import { restoreAuditChange, initializeAuditBaselineFromReservations } from '../services/auditLogService';
import { AuthUser, isCoordinatorOrAdmin } from '../services/authService';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { BaseModal } from './common/BaseModal';
import { ConfirmationModal } from './common/ConfirmationModal';
import { AuditLogItemCard } from './AuditLogItemCard';

interface AuditLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: AuditChangeLogEntry[];
  currentUser: AuthUser | null;
  allReservations: Reservation[];
  onReservationsChanged?: () => void;
}

type FilterTab = 'ALL' | 'DELETED' | 'UPDATED' | 'CREATED' | 'RESTORED';

export const AuditLogModal: React.FC<AuditLogModalProps> = ({
  isOpen,
  onClose,
  logs,
  currentUser,
  allReservations,
  onReservationsChanged
}) => {
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK'>('ALL');
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [quotaWarning, setQuotaWarning] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'danger' | 'warning' | 'info';
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'danger',
    confirmLabel: 'Confirmar',
    onConfirm: () => {}
  });

  // Security Gate: Only Administrator or Coordinator can view and use this tool
  const isAuthorized = isCoordinatorOrAdmin(currentUser);

  // Storage Quota Event Listener
  React.useEffect(() => {
    const onQuotaWarn = (e: Event) => {
      const customEvent = e as CustomEvent<{ service?: string; message?: string }>;
      if (customEvent.detail?.message) {
        setQuotaWarning(customEvent.detail.message);
      }
    };
    window.addEventListener('app_storage_quota_warning', onQuotaWarn);
    return () => window.removeEventListener('app_storage_quota_warning', onQuotaWarn);
  }, []);

  // Baseline audit records are not auto-fabricated on open.
  // Admins can explicitly sync the baseline using handleSyncBaseline.

  const handleSyncBaseline = () => {
    if (!allReservations || allReservations.length === 0) {
      setFeedbackMessage({
        type: 'error',
        text: 'No hay reservas activas en el sistema para sincronizar.'
      });
      return;
    }
    initializeAuditBaselineFromReservations(allReservations, true);
    setFeedbackMessage({
      type: 'success',
      text: 'Se ha sincronizado exitosamente la línea base de auditoría con las reservas maestras del sistema.'
    });
  };

  // Filter logs based on tab, search term, and date
  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // Tab Filter
    if (activeTab === 'DELETED') {
      result = result.filter((l) => l.action === 'DELETE' || l.action === 'DELETE_SERIES' || l.action === 'DELETE_ALL_HOLIDAYS');
    } else if (activeTab === 'UPDATED') {
      result = result.filter((l) => l.action === 'UPDATE' || l.action === 'CLEAR_PARTICIPANTS' || l.action === 'TOGGLE_REALIZADA');
    } else if (activeTab === 'CREATED') {
      result = result.filter((l) => l.action === 'CREATE' || l.action === 'BULK_IMPORT');
    } else if (activeTab === 'RESTORED') {
      result = result.filter((l) => l.action === 'RESTORE' || l.isReverted);
    }

    // Date Filter
    if (dateFilter === 'TODAY') {
      const todayStr = new Date().toISOString().slice(0, 10);
      result = result.filter((l) => l.timestamp.startsWith(todayStr));
    } else if (dateFilter === 'WEEK') {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      result = result.filter((l) => l.timestamp >= sevenDaysAgo);
    }

    // Search Filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter((l) => {
        const text = `
          ${l.description} 
          ${l.user} 
          ${l.userRole || ''} 
          ${l.reservaTitle || ''} 
          ${l.reservaResponsable || ''} 
          ${l.reservaEspacio || ''} 
          ${l.reservaFecha || ''}
        `.toLowerCase();
        return text.includes(q);
      });
    }

    return result;
  }, [logs, activeTab, dateFilter, searchTerm]);

  // Virtualizer for smooth rendering of hundreds/thousands of audit entries
  const listParentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredLogs.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 140,
    overscan: 5
  });

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      all: logs.length,
      deleted: logs.filter((l) => l.action === 'DELETE' || l.action === 'DELETE_SERIES' || l.action === 'DELETE_ALL_HOLIDAYS').length,
      updated: logs.filter((l) => l.action === 'UPDATE' || l.action === 'CLEAR_PARTICIPANTS' || l.action === 'TOGGLE_REALIZADA').length,
      created: logs.filter((l) => l.action === 'CREATE' || l.action === 'BULK_IMPORT').length,
      restored: logs.filter((l) => l.action === 'RESTORE' || l.isReverted).length
    };
  }, [logs]);

  const handleRestore = async (entry: AuditChangeLogEntry) => {
    if (!isAuthorized) {
      setFeedbackMessage({
        type: 'error',
        text: 'Solo los Administradores o Coordinadores pueden restaurar cambios.'
      });
      return;
    }

    const actionText = entry.action.startsWith('DELETE')
      ? '¿Estás seguro de que deseas recuperar esta reserva y volver a agregarla a la programación activa?'
      : '¿Estás seguro de que deseas revertir este cambio y restablecer los valores anteriores de la reserva?';

    setConfirmDialog({
      isOpen: true,
      title: entry.action.startsWith('DELETE') ? 'Recuperar Reserva' : 'Revertir Cambio',
      message: actionText,
      variant: 'warning',
      confirmLabel: entry.action.startsWith('DELETE') ? 'Recuperar Reserva' : 'Revertir Cambio',
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        setIsRestoringId(entry.id);
        setFeedbackMessage(null);

        setTimeout(async () => {
          try {
            const res = await restoreAuditChange(entry.id, currentUser);
            if (res.success) {
              setFeedbackMessage({ type: 'success', text: res.message });
              if (onReservationsChanged) {
                onReservationsChanged();
              }
            } else {
              setFeedbackMessage({ type: 'error', text: res.message });
            }
          } catch (err: any) {
            setFeedbackMessage({ type: 'error', text: `Error al restaurar: ${err?.message || 'Fallo desconocido'}` });
          } finally {
            setIsRestoringId(null);
          }
        }, 40);
      }
    });
  };

  const handleExportCsv = () => {
    if (logs.length === 0) {
      setFeedbackMessage({
        type: 'error',
        text: 'No hay registros de auditoría para exportar.'
      });
      return;
    }

    const headers = ['Fecha y Hora', 'Usuario', 'Rol', 'Acción', 'Descripción', 'Fecha Reserva', 'Horario', 'Espacio', 'Responsable', 'Restaurado'];
    const rows = logs.map((l) => [
      new Date(l.timestamp).toLocaleString('es-CL'),
      `"${(l.user || '').replace(/"/g, '""')}"`,
      `"${(l.userRole || '').replace(/"/g, '""')}"`,
      l.action,
      `"${(l.description || '').replace(/"/g, '""')}"`,
      l.reservaFecha || '',
      `"${l.reservaHorario || ''}"`,
      `"${(l.reservaEspacio || '').replace(/"/g, '""')}"`,
      `"${(l.reservaResponsable || '').replace(/"/g, '""')}"`,
      l.isReverted ? 'Sí' : 'No'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Auditoria_Cambios_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTimestamp = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return isoStr;
    }
  };

  const getActionBadge = (action: AuditActionType) => {
    switch (action) {
      case 'DELETE':
      case 'DELETE_SERIES':
      case 'DELETE_ALL_HOLIDAYS':
        return {
          label: action === 'DELETE_SERIES' ? 'Serie Eliminada' : 'Eliminación',
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-600" />
        };
      case 'UPDATE':
      case 'CLEAR_PARTICIPANTS':
      case 'TOGGLE_REALIZADA':
        return {
          label: action === 'CLEAR_PARTICIPANTS' ? 'Aforo Limpiado' : action === 'TOGGLE_REALIZADA' ? 'Estado Realizada' : 'Modificación',
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: <Edit3 className="w-3.5 h-3.5 text-amber-600" />
        };
      case 'CREATE':
      case 'BULK_IMPORT':
        return {
          label: action === 'BULK_IMPORT' ? 'Importación Masiva' : 'Nueva Reserva',
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
        };
      case 'RESTORE':
        return {
          label: 'Restauración',
          bg: 'bg-blue-50 text-blue-800 border-blue-200',
          icon: <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
        };
      default:
        return {
          label: action,
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          icon: <History className="w-3.5 h-3.5 text-slate-600" />
        };
    }
  };

  if (!isOpen) return null;

  const modalHeader = (
    <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
      <div className="flex items-center space-x-3">
        <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
          <RotateCcw className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
              Sistema de Restauración & Registro de Cambios
            </h3>
            <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full flex items-center space-x-1 shadow-2xs">
              <ShieldCheck className="w-3 h-3 text-slate-950" />
              <span>Solo Administradores</span>
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            Recupera reservas eliminadas, revierte ediciones accidentales y supervisa el registro de auditoría completo.
          </p>
        </div>
      </div>

      <button
        id="btn-close-audit-modal"
        type="button"
        aria-label="Cerrar ventana de auditoría"
        onClick={onClose}
        className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="5xl"
        layer="base"
        customHeader={modalHeader}
        containerClassName="max-h-[92vh] flex flex-col overflow-hidden"
        bodyClassName="p-0 overflow-hidden flex flex-col flex-1"
      >
        {/* Unauthorized Warning if not admin */}
        {!isAuthorized ? (
          <div className="p-8 text-center space-y-3">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
            <h4 className="font-bold text-lg text-slate-800">Acceso Restringido</h4>
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              El sistema de restauración de cambios y papelera de eliminaciones está reservado exclusivamente para usuarios con rol de <strong>Administrador</strong> o <strong>Coordinador</strong>.
            </p>
            <button
              id="btn-unauthorized-close-audit"
              type="button"
              aria-label="Cerrar diálogo de acceso restringido"
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            {/* Storage Quota Warning Notice (Hallazgo 4) */}
            {quotaWarning && (
              <div className="mx-5 mt-3 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-950 text-xs font-semibold flex items-center justify-between animate-fadeIn">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>{quotaWarning}</span>
                </div>
                <button
                  id="btn-close-quota-warning"
                  type="button"
                  aria-label="Cerrar advertencia de cuota"
                  onClick={() => setQuotaWarning(null)}
                  className="text-amber-800 hover:text-amber-950 p-1 rounded-md cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Feedback Alert if present */}
            {feedbackMessage && (
              <div
                className={`mx-5 mt-3 p-3 rounded-xl border text-xs font-bold flex items-center justify-between animate-fadeIn ${
                  feedbackMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}
              >
                <div className="flex items-center space-x-2">
                  {feedbackMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{feedbackMessage.text}</span>
                </div>
                <button
                  id="btn-close-feedback-alert"
                  type="button"
                  aria-label="Cerrar mensaje de notificación"
                  onClick={() => setFeedbackMessage(null)}
                  className="text-slate-400 hover:text-slate-700 ml-2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Filter Tabs & Search Bar */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 space-y-3 shrink-0">
              {/* Tabs */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Todos los Registros ({counts.all})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('DELETED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'DELETED'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>🗑️ Papelera / Eliminaciones ({counts.deleted})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('UPDATED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'UPDATED'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-amber-800 border border-amber-200 hover:bg-amber-50'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                  <span>✏️ Modificaciones ({counts.updated})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('CREATED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'CREATED'
                      ? 'bg-emerald-700 text-white shadow-xs'
                      : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>➕ Creaciones ({counts.created})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('RESTORED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer ${
                    activeTab === 'RESTORED'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-blue-800 border border-blue-200 hover:bg-blue-50'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                  <span>🔄 Restaurados ({counts.restored})</span>
                </button>
              </div>

              {/* Search & Date Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por actividad, responsable, espacio, fecha o autor..."
                    className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-bold text-slate-500 flex items-center space-x-1">
                    <Filter className="w-3 h-3" />
                    <span>Fecha:</span>
                  </span>
                  <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5 shadow-2xs text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setDateFilter('ALL')}
                      className={`px-2.5 py-1 rounded-md transition ${dateFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateFilter('TODAY')}
                      className={`px-2.5 py-1 rounded-md transition ${dateFilter === 'TODAY' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateFilter('WEEK')}
                      className={`px-2.5 py-1 rounded-md transition ${dateFilter === 'WEEK' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      7 días
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Log List */}
            <div ref={listParentRef} className="flex-1 overflow-y-auto p-4">
              {filteredLogs.length === 0 ? (
                <div className="py-14 text-center space-y-3">
                  <div className="p-3 bg-slate-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto text-slate-400">
                    <History className="w-6 h-6" />
                  </div>
                  <h5 className="text-sm font-bold text-slate-700">No hay registros con los filtros seleccionados</h5>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Los cambios de reservas, eliminaciones y modificaciones quedan respaldados automáticamente aquí para su recuperación inmediata.
                  </p>
                  {logs.length === 0 && allReservations.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSyncBaseline}
                      className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 mx-auto shadow-xs cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Sincronizar Línea Base desde las {allReservations.length.toLocaleString('es-CL')} Reservas Activas</span>
                    </button>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative'
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const entry = filteredLogs[virtualRow.index];
                    if (!entry) return null;
                    const badge = getActionBadge(entry.action);
                    const isExpanded = expandedLogId === entry.id;
                    const canBeRestored =
                      !entry.isReverted &&
                      entry.action !== 'RESTORE' &&
                      (entry.previousState !== undefined || entry.action === 'CREATE' || entry.action === 'BULK_IMPORT');

                    return (
                      <div
                        key={entry.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          paddingBottom: '12px'
                        }}
                      >
                        <AuditLogItemCard
                          entry={entry}
                          badge={badge}
                          isExpanded={isExpanded}
                          onToggleExpand={() => setExpandedLogId(isExpanded ? null : entry.id)}
                          canBeRestored={canBeRestored}
                          isRestoring={isRestoringId === entry.id}
                          onRestore={handleRestore}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 font-medium">
                Mostrando <strong>{filteredLogs.length}</strong> de <strong>{logs.length}</strong> eventos registrados
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                  title="Exportar registro completo a archivo CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Exportar CSV</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </>
        )}
      </BaseModal>

      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
};
