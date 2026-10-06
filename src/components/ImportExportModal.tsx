import React, { useState, useEffect, useMemo } from 'react';
import { Reservation } from '../types';
import { exportToCsv } from '../utils/csvExportImport';
import { parseCsvRows } from '../utils/csvParser';
import { INITIAL_RESERVATIONS } from '../data/initialData';
import { AuthUser, canPerformMassDataSync, getRoleDisplayName } from '../services/authService';
import { BaseModal } from './common/BaseModal';
import { ConfirmationModal } from './common/ConfirmationModal';
import {
  getBackupScheduleConfig,
  saveBackupScheduleConfig,
  createDatabaseBackup,
  getDatabaseBackupsList,
  downloadBackupFile,
  restoreDatabaseFromBackup,
  deleteDatabaseBackup,
  DatabaseBackupMetadata,
  DatabaseBackupRecord,
  calculateNextBackupDate,
  getDaysUntilNextBackup,
  getBackupIdentitySignature
} from '../services/backupService';
import {
  X,
  FileSpreadsheet,
  Upload,
  Download,
  CloudUpload,
  CheckCircle2,
  AlertCircle,
  Database,
  RefreshCw,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Info,
  Clock,
  Trash2,
  RotateCcw,
  Calendar,
  Layers
} from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservations: Reservation[];
  onImportReservations: (newReservations: Reservation[]) => void;
  onSyncAllToFirebase: () => Promise<{ count: number; error?: string }>;
  currentUser?: AuthUser | null;
  onRestoreFromBackup?: (restoredReservations: Reservation[]) => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  reservations,
  onImportReservations,
  onSyncAllToFirebase,
  currentUser,
  onRestoreFromBackup
}) => {
  const [activeTab, setActiveTab] = useState<'backups' | 'csv'>('backups');
  const [isUploading, setIsUploading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; msg?: string }>({
    type: 'idle'
  });
  const [importedCount, setImportedCount] = useState<number | null>(null);

  // Backup state
  const [backupConfig, setBackupConfig] = useState(getBackupScheduleConfig());
  const [backupList, setBackupList] = useState<DatabaseBackupMetadata[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'info' | 'primary';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // Load backups when opening modal
  useEffect(() => {
    if (isOpen) {
      loadBackups();
      setBackupConfig(getBackupScheduleConfig());
    }
  }, [isOpen]);

  const loadBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const list = await getDatabaseBackupsList();
      setBackupList(list);
    } catch (err) {
      console.warn('Error loading backups:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  if (!isOpen) return null;

  const canManageSync = canPerformMassDataSync(currentUser);
  const roleName = getRoleDisplayName(currentUser?.role);

  const handleManualBackup = async () => {
    setIsCreatingBackup(true);
    setBackupMessage(null);
    try {
      const record = await createDatabaseBackup({
        tipo: 'manual',
        creadoPor: currentUser?.name || currentUser?.username || 'Administrador',
        customReservations: reservations
      });
      setBackupMessage({
        type: 'success',
        text: `¡Copia de seguridad creada exitosamente! Respaldo ${record.id} con ${record.totalReservas} reservas guardado en Firebase.`
      });
      setBackupConfig(getBackupScheduleConfig());
      await loadBackups();
    } catch (err: any) {
      setBackupMessage({
        type: 'error',
        text: `Error al crear la copia de seguridad: ${err?.message || 'Fallo de conexión'}`
      });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleRestoreBackup = async (backupMeta: DatabaseBackupMetadata) => {
    if (!canManageSync) {
      setBackupMessage({
        type: 'error',
        text: `Acceso restringido: El perfil ${roleName} no tiene permisos para restaurar copias de seguridad.`
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Restaurar Copia de Seguridad',
      message: `¿Está seguro de restaurar la base de datos a la copia del ${backupMeta.fecha} (${backupMeta.id})? Se restablecerán las ${backupMeta.totalReservas} reservas contenidas en este respaldo.`,
      variant: 'warning',
      confirmLabel: 'Restaurar Respaldo',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        setRestoringBackupId(backupMeta.id);
        setBackupMessage(null);
        try {
          // Fetch full payload and restore
          const res = await restoreDatabaseFromBackup(backupMeta as DatabaseBackupRecord, currentUser);
          if (res.success) {
            setBackupMessage({
              type: 'success',
              text: `¡Base de datos restaurada con éxito! ${res.count} reservas aplicadas.`
            });
            const restoredList = res.restoredReservations || (backupMeta as any).data?.reservas;
            if (onRestoreFromBackup && restoredList) {
              onRestoreFromBackup(restoredList);
            } else if (restoredList) {
              // If in-memory reservations need refresh
              onImportReservations(restoredList);
            }
          } else {
            setBackupMessage({
              type: 'error',
              text: res.error || 'No se pudo restaurar la copia de seguridad.'
            });
          }
        } catch (err: any) {
          setBackupMessage({
            type: 'error',
            text: `Error durante la restauración: ${err?.message || 'Error inesperado'}`
          });
        } finally {
          setRestoringBackupId(null);
        }
      }
    });
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!canManageSync) {
      setBackupMessage({
        type: 'error',
        text: 'Solo coordinadores y administradores pueden eliminar copias de seguridad.'
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Eliminar Copia de Seguridad',
      message: '¿Desea eliminar permanentemente este registro de copia de seguridad?',
      variant: 'danger',
      confirmLabel: 'Eliminar Respaldo',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
        try {
          await deleteDatabaseBackup(backupId);
          setBackupList(prev => prev.filter(b => b.id !== backupId));
          setBackupMessage({
            type: 'success',
            text: 'Copia de seguridad eliminada.'
          });
        } catch {
          setBackupMessage({
            type: 'error',
            text: 'Error al eliminar la copia de seguridad.'
          });
        }
      }
    });
  };

  const handleToggleAutoBackup = async (enabled: boolean) => {
    const updated = await saveBackupScheduleConfig({ enabled });
    setBackupConfig(updated);
    setBackupMessage({
      type: 'info',
      text: enabled
        ? 'Copia de seguridad automática cada 15 días ACTIVADA.'
        : 'Copia de seguridad automática cada 15 días DESACTIVADA.'
    });
  };

  const handleDownloadBackup = async (backupId: string) => {
    try {
      await downloadBackupFile(backupId);
    } catch (err: any) {
      setBackupMessage({
        type: 'error',
        text: err?.message || 'No se pudo descargar la copia de seguridad.'
      });
    }
  };

  const handleUploadBackupJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageSync) {
      setSyncStatus({
        type: 'error',
        msg: `Acceso restringido: El perfil ${roleName} no tiene permisos para restaurar archivos de respaldo.`
      });
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed.data?.reservas && !Array.isArray(parsed.reservas)) {
          setSyncStatus({
            type: 'error',
            msg: 'El archivo JSON no tiene un formato válido de copia de seguridad.'
          });
          return;
        }

        const reservationsList = parsed.data?.reservas || parsed.reservas;
        setConfirmDialog({
          isOpen: true,
          title: 'Restaurar Reservas desde Archivo JSON',
          message: `Archivo JSON verificado (${parsed.fecha || 'Sin fecha'}). Se restaurarán ${reservationsList.length} reservas en la base de datos de Firebase. ¿Deseas continuar?`,
          variant: 'warning',
          confirmLabel: 'Restaurar Reservas',
          onConfirm: async () => {
            setConfirmDialog(prev => ({ ...prev, isOpen: false }));
            setSyncStatus({ type: 'loading', msg: 'Restaurando reservas desde archivo JSON...' });
            onImportReservations(reservationsList);
            const res = await onSyncAllToFirebase();
            if (res.error) {
              setSyncStatus({ type: 'error', msg: res.error });
            } else {
              setSyncStatus({
                type: 'success',
                msg: `¡Copia restaurada exitosamente! ${reservationsList.length} reservas registradas en Firebase.`
              });
            }
          }
        });
      } catch (err) {
        console.error('Error parsing backup JSON', err);
        setSyncStatus({
          type: 'error',
          msg: 'Error al procesar el archivo JSON de copia de seguridad.'
        });
      }
    };
    reader.readAsText(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageSync) {
      setSyncStatus({
        type: 'error',
        msg: `Acceso restringido: El perfil ${roleName} no tiene permisos para importar archivos.`
      });
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = parseCsvRows(text);
        if (parsed.length > 0) {
          onImportReservations(parsed);
          setImportedCount(parsed.length);
          setSyncStatus({
            type: 'success',
            msg: `¡Se importaron correctamente ${parsed.length} reservas desde el archivo CSV!`
          });
        } else {
          setSyncStatus({
            type: 'error',
            msg: 'No se pudieron extraer filas válidas del archivo CSV.'
          });
        }
      } catch (err) {
        console.error('Error parsing CSV', err);
        setSyncStatus({
          type: 'error',
          msg: 'Error al leer el archivo CSV.'
        });
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsText(file);
  };

  const handleSyncFirestore = async () => {
    if (!canManageSync) {
      setSyncStatus({
        type: 'error',
        msg: `Acceso restringido: El perfil ${roleName} no tiene permisos de sincronización masiva.`
      });
      return;
    }

    setSyncStatus({ type: 'loading', msg: 'Sincronizando todas las reservas con Firebase Firestore...' });
    const res = await onSyncAllToFirebase();
    if (res.error) {
      setSyncStatus({ type: 'error', msg: res.error });
    } else {
      setSyncStatus({
        type: 'success',
        msg: `¡Sincronización exitosa! ${res.count} reservas guardadas en Firebase Firestore en tiempo real.`
      });
    }
  };

  const handleLoadAndSyncSpreadsheet = async () => {
    if (!canManageSync) {
      setSyncStatus({
        type: 'error',
        msg: `Acceso restringido: El perfil ${roleName} no tiene permisos para sobreescribir la planilla.`
      });
      return;
    }

    setSyncStatus({ type: 'loading', msg: `Cargando las ${INITIAL_RESERVATIONS.length} reservas de la plantilla base a Firestore...` });
    onImportReservations(INITIAL_RESERVATIONS);
    const res = await onSyncAllToFirebase();
    if (res.error) {
      setSyncStatus({ type: 'error', msg: res.error });
    } else {
      setSyncStatus({
        type: 'success',
        msg: `¡Plantilla base restaurada! ${INITIAL_RESERVATIONS.length} reservas registradas en la base de datos.`
      });
    }
  };

  const nextBackupDateStr = calculateNextBackupDate(backupConfig.lastBackupTimestamp, backupConfig.intervalDays);
  const daysRemaining = getDaysUntilNextBackup(backupConfig.lastBackupTimestamp, backupConfig.intervalDays);

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="2xl"
        layer="base"
        title="Base de Datos y Copias de Seguridad"
        subtitle="Respaldos periódicos automáticos cada 15 días, snapshots en Firebase y exportación CSV"
        icon={<Database className="w-5 h-5 text-blue-600" />}
        containerClassName="max-h-[92vh] flex flex-col overflow-hidden"
        bodyClassName="p-4 sm:p-6 overflow-y-auto space-y-4"
        footer={
          <div className="flex justify-end w-full">
            <button
              onClick={onClose}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold shadow-2xs transition cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        }
      >
        {/* Tab Navigation */}
        <div className="flex items-center p-1 bg-slate-100/80 rounded-2xl border border-slate-200 gap-1 text-xs font-semibold">
          <button
            id="tab-btn-backups"
            onClick={() => setActiveTab('backups')}
            className={`min-h-[44px] flex-1 py-2 px-3 rounded-xl flex items-center justify-center space-x-2 transition cursor-pointer ${
              activeTab === 'backups'
                ? 'bg-white text-blue-700 font-bold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Copias de Seguridad (Cada 15 Días)</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 text-emerald-800 font-bold">
              {backupConfig.enabled ? 'ACTIVO' : 'PAUSADO'}
            </span>
          </button>

          <button
            id="tab-btn-csv"
            onClick={() => setActiveTab('csv')}
            className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center space-x-2 transition cursor-pointer ${
              activeTab === 'csv'
                ? 'bg-white text-blue-700 font-bold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span>Planilla y Archivos CSV</span>
          </button>
        </div>

        {/* Backup Feedback Message */}
        {backupMessage && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
              backupMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : backupMessage.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              {backupMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {backupMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              {backupMessage.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
              <span>{backupMessage.text}</span>
            </div>
            <button
              onClick={() => setBackupMessage(null)}
              className="text-slate-400 hover:text-slate-700 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: COPIAS DE SEGURIDAD AUTOMÁTICAS (CADA 15 DÍAS)                     */}
        {/* ========================================================================= */}
        {activeTab === 'backups' && (
          <div className="space-y-4">
            {/* 1. Automated 15-Day Status Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/70 via-blue-50/40 to-slate-50 border border-emerald-200/80 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 bg-emerald-600 text-white rounded-lg shadow-2xs">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Copia de Seguridad Automática de Base de Datos
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Ciclo programado: <strong>Una vez cada 15 días</strong> (Firestore + Caché local)
                    </p>
                  </div>
                </div>

                {/* Automation Toggle Switch */}
                <div className="flex items-center space-x-2">
                  {(() => {
                    const hasConfirmedRemote = backupList.some(b => b.storageStatus === 'firestore_confirmed');
                    return (
                      <span className={`text-[11px] font-bold ${
                        !backupConfig.enabled
                          ? 'text-slate-400'
                          : hasConfirmedRemote
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}>
                        {!backupConfig.enabled
                          ? 'Automatización Pausada'
                          : hasConfirmedRemote
                          ? 'Automatización Activa (Confirmada en Firestore)'
                          : 'Solo Local (Sin confirmación remota)'}
                      </span>
                    );
                  })()}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={backupConfig.enabled}
                      onChange={(e) => handleToggleAutoBackup(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              </div>

              {/* Status metrics grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 text-xs">
                {(() => {
                  const latestBackup = backupList.length > 0 ? backupList[0] : null;
                  const displayDate = latestBackup ? latestBackup.fecha : null;
                  const displayTimestamp = latestBackup?.timestamp ? new Date(latestBackup.timestamp).getTime() : null;

                  return (
                    <div className="p-3 bg-white/90 rounded-xl border border-emerald-100 shadow-2xs">
                      <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] font-medium">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Último Respaldo:</span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 mt-1">
                        {displayDate || 'Sin respaldos registrados'}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {displayTimestamp
                          ? `Hace ${Math.floor((Date.now() - displayTimestamp) / (1000 * 60 * 60 * 24))} día(s) (${latestBackup?.storageStatus === 'firestore_confirmed' ? 'Confirmado en Firestore' : 'Solo local'})`
                          : 'Aún no hay copias de seguridad'}
                      </div>
                    </div>
                  );
                })()}

                <div className="p-3 bg-white/90 rounded-xl border border-blue-100 shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] font-medium">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <span>Próximo Respaldo:</span>
                  </div>
                  <div className="text-sm font-bold text-blue-800 mt-1">
                    {nextBackupDateStr}
                  </div>
                  <div className="text-[10px] text-blue-600 font-medium mt-0.5">
                    {daysRemaining === 0 ? 'Programado para hoy' : `En ${daysRemaining} día(s)`}
                  </div>
                </div>

                <div className="p-3 bg-white/90 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] font-medium">
                    <Layers className="w-3.5 h-3.5 text-slate-600" />
                    <span>Alcance del Snapshot:</span>
                  </div>
                  <div className="text-sm font-bold text-slate-800 mt-1">
                    {reservations.length} reservas
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Incluye salas, inventario y usuarios
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  id="btn-create-manual-backup"
                  onClick={handleManualBackup}
                  disabled={isCreatingBackup}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs flex items-center justify-center space-x-2 transition cursor-pointer"
                >
                  {isCreatingBackup ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Generando Copia de Seguridad en Firebase...</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload className="w-4 h-4" />
                      <span>Crear Copia de Seguridad Ahora (Manual)</span>
                    </>
                  )}
                </button>

                {/* Upload and restore JSON file */}
                {canManageSync && (
                  <label className="py-2.5 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-2xs flex items-center justify-center space-x-1.5 cursor-pointer transition">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Cargar Respaldo JSON</span>
                    <input
                      type="file"
                      accept=".json,application/json"
                      onChange={handleUploadBackupJson}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* 2. Historial de Copias de Seguridad Guardadas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Historial de Copias de Seguridad Disponibles</span>
                  <span className="text-[11px] font-mono text-slate-400 font-normal">
                    ({backupList.length})
                  </span>
                </h4>

                <button
                  onClick={loadBackups}
                  disabled={isLoadingBackups}
                  className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center space-x-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                  <span>Actualizar lista</span>
                </button>
              </div>

              {(() => {
                // Deduplicación reactiva garantizada: evita mostrar respaldos idénticos (misma fecha, hora, tamaño y cantidad de reservas)
                const seenKeys = new Set<string>();
                const deduplicatedBackups = backupList.filter((b) => {
                  const sig = getBackupIdentitySignature(b);
                  if (seenKeys.has(sig)) return false;
                  seenKeys.add(sig);
                  return true;
                });

                if (isLoadingBackups) {
                  return (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-500 mb-1" />
                      <span>Cargando lista de copias de seguridad...</span>
                    </div>
                  );
                }

                if (deduplicatedBackups.length === 0) {
                  return (
                    <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-1">
                      <ShieldCheck className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
                      <p className="font-semibold text-slate-700">Aún no hay copias de seguridad registradas</p>
                      <p className="text-[11px] text-slate-400">
                        El sistema creará la primera copia automáticamente en segundo plano o puedes pulsar "Crear Copia de Seguridad Ahora".
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {deduplicatedBackups.map((backup) => (
                    <div
                      key={backup.id}
                      className="p-3 bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-2xs flex items-center justify-between gap-3 text-xs transition"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                          <span className="font-bold text-slate-800">
                            {backup.fecha}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${
                              backup.tipo === 'automatica_15_dias'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-purple-50 text-purple-700 border border-purple-200'
                            }`}
                          >
                            {backup.tipo === 'automatica_15_dias' ? 'Automática (15 días)' : 'Manual'}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-semibold flex items-center space-x-1 ${
                              backup.storageStatus === 'firestore_confirmed'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            <span>{backup.storageStatus === 'firestore_confirmed' ? '☁️ En Firestore' : '💾 Solo local'}</span>
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            {backup.timestamp.slice(11, 16)} hrs
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-500 truncate">
                          {backup.totalReservas} {backup.totalReservas === 1 ? 'reserva' : 'reservas'} • {backup.totalEspacios} {backup.totalEspacios === 1 ? 'espacio' : 'espacios'} • {Math.round((backup.tamanoBytes || 0) / 1024)} KB
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          id={`btn-download-${backup.id}`}
                          onClick={() => handleDownloadBackup(backup.id)}
                          title="Descargar copia como archivo JSON"
                          className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-blue-600" />
                        </button>

                        {canManageSync && (
                          <button
                            id={`btn-restore-${backup.id}`}
                            onClick={() => handleRestoreBackup(backup)}
                            disabled={restoringBackupId === backup.id}
                            title="Restaurar base de datos a este punto"
                            className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 transition cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className={`w-3.5 h-3.5 ${restoringBackupId === backup.id ? 'animate-spin' : ''}`} />
                          </button>
                        )}

                        {canManageSync && (
                          <button
                            id={`btn-delete-${backup.id}`}
                            onClick={() => handleDeleteBackup(backup.id)}
                            title="Eliminar registro de copia de seguridad"
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: PLANILLA Y ARCHIVOS CSV                                            */}
        {/* ========================================================================= */}
        {activeTab === 'csv' && (
          <div className="space-y-4">
            {/* Informative Explanation */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 text-xs">
              <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                <Info className="w-4 h-4 text-blue-600 shrink-0" />
                <span>Gestión de Planilla y Exportaciones CSV:</span>
              </div>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                • <strong>Exportar CSV ({reservations.length} registros):</strong> Genera un archivo tabular compatible con Excel y Google Sheets con todas las reservas registradas.
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                • <strong>Restaurar Planilla Base ({INITIAL_RESERVATIONS.length} registros):</strong> Restaura el catálogo a la plantilla estándar inicial de talleres y préstamos fijos.
              </p>
            </div>

            {/* Firebase Mass Sync Section */}
            {canManageSync ? (
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CloudUpload className="w-5 h-5 text-blue-600" />
                    <span className="font-bold text-sm text-slate-900">Sincronización a Base de Datos</span>
                  </div>
                  <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                    {reservations.length} reservas activas
                  </span>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">
                  Sube y actualiza en masa todas las reservas a Firebase Firestore para mantener sincronizados todos los dispositivos de la red municipal.
                </p>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    id="btn-sync-all-firebase"
                    onClick={handleSyncFirestore}
                    disabled={syncStatus.type === 'loading'}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs flex items-center justify-center space-x-2 transition cursor-pointer"
                  >
                    {syncStatus.type === 'loading' ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sincronizando...</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-4 h-4" />
                        <span>Sincronizar a Firebase ({reservations.length})</span>
                      </>
                    )}
                  </button>

                  <button
                    id="btn-load-full-spreadsheet"
                    onClick={handleLoadAndSyncSpreadsheet}
                    disabled={syncStatus.type === 'loading'}
                    className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs flex items-center justify-center space-x-1.5 transition cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Restaurar Planilla Base ({INITIAL_RESERVATIONS.length})</span>
                  </button>
                </div>

                {syncStatus.type === 'success' && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{syncStatus.msg}</span>
                  </div>
                )}

                {syncStatus.type === 'error' && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{syncStatus.msg}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  <span>Funciones de Carga Masiva y Sincronización Restringidas</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  El perfil de usuario actual (<strong>{roleName}</strong>) tiene permisos de operación y consulta. Por seguridad de los datos municipales, la sobreescritura masiva de la base de datos y la restauración de la plantilla están reservadas exclusivamente a los perfiles <strong>Administrador</strong> y <strong>Coordinador</strong>.
                </p>
              </div>
            )}

            {/* CSV Export */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>Exportar Respaldo CSV</span>
                </span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
                  Lectura y Descarga
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Descarga un archivo CSV compatible con Excel y Google Sheets con los {reservations.length} registros actualmente disponibles.
              </p>
              <button
                id="btn-modal-export-csv"
                onClick={() => exportToCsv(reservations, `respaldo_reservas_${new Date().toISOString().slice(0, 10)}.csv`)}
                className="w-full py-2.5 px-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 shadow-2xs flex items-center justify-center space-x-2 transition cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Descargar Archivo CSV ({reservations.length} registros)</span>
              </button>
            </div>

            {/* CSV Import */}
            {canManageSync && (
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 flex items-center space-x-1.5">
                    <Upload className="w-4 h-4 text-blue-600" />
                    <span>Importar Archivo CSV</span>
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-semibold">
                    Gestión
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Sube un archivo CSV con columnas de reservas para incorporarlas al sistema.
                </p>
                <label className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-50 border border-dashed border-slate-300 hover:border-blue-500 text-xs font-semibold text-slate-600 flex flex-col items-center justify-center cursor-pointer transition shadow-2xs">
                  <Upload className="w-5 h-5 text-slate-400 mb-1" />
                  <span>Haz clic para seleccionar o arrastra tu archivo CSV</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                {importedCount !== null && (
                  <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>¡Se importaron correctamente {importedCount} registros!</span>
                  </div>
                )}
              </div>
            )}
          </div>
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
