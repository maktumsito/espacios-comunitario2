import React, { useState, useEffect } from 'react';
import {
  AppNotificationItem,
  NotificationSettings,
  getNotificationSettings,
  saveNotificationSettings,
  getNotificationHistory,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearNotificationHistory,
  requestPushPermission,
  getNotificationPermission,
  sendTestNotification,
  isAndroidDevice,
  isPushNotificationSupported
} from '../services/notificationService';
import {
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Star,
  RefreshCw,
  Smartphone,
  Volume2,
  Vibrate,
  Calendar,
  X,
  Trash2,
  CheckCheck,
  ExternalLink,
  Sparkles,
  Info
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ViewMode } from '../types';
import { BaseModal } from './common/BaseModal';

interface NotificationCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToView?: (view: ViewMode) => void;
  onSelectReservation?: (reservationId: string) => void;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  isOpen,
  onClose,
  onNavigateToView,
  onSelectReservation
}) => {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(getNotificationPermission());
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [history, setHistory] = useState<AppNotificationItem[]>(getNotificationHistory());
  const [isTesting, setIsTesting] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'settings'>('history');

  const isAndroid = isAndroidDevice();
  const isSupported = isPushNotificationSupported();

  useEffect(() => {
    if (!isOpen) return;

    setPermission(getNotificationPermission());
    setSettings(getNotificationSettings());
    setHistory(getNotificationHistory());

    const handleHistoryChange = (e: Event) => {
      const customEvent = e as CustomEvent<AppNotificationItem[]>;
      setHistory(customEvent.detail || getNotificationHistory());
    };

    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationSettings>;
      setSettings(customEvent.detail || getNotificationSettings());
    };

    window.addEventListener('app_notification_history_changed', handleHistoryChange);
    window.addEventListener('app_notification_settings_changed', handleSettingsChange);

    return () => {
      window.removeEventListener('app_notification_history_changed', handleHistoryChange);
      window.removeEventListener('app_notification_settings_changed', handleSettingsChange);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    const res = await requestPushPermission();
    setPermission(res);
  };

  const handleToggleSetting = (key: keyof NotificationSettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    saveNotificationSettings(updated);
  };

  const handleRunTest = async () => {
    setIsTesting(true);
    await sendTestNotification();
    setTimeout(() => {
      setHistory(getNotificationHistory());
      setIsTesting(false);
    }, 400);
  };

  const handleNotificationClick = (item: AppNotificationItem) => {
    markNotificationAsRead(item.id);
    setHistory(getNotificationHistory());

    if (item.reservationId && onSelectReservation) {
      onSelectReservation(item.reservationId);
      onClose();
    } else if (item.view && onNavigateToView) {
      onNavigateToView(item.view as ViewMode);
      onClose();
    }
  };

  const unreadCount = history.filter(h => !h.read).length;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      id="notification-center-modal"
      customHeader={
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-xl text-white shadow-xs">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold tracking-tight">Notificaciones & Alertas</h3>
                {isAndroid && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold border border-emerald-400/30 flex items-center space-x-1">
                    <Smartphone className="w-3 h-3" />
                    <span>Android</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Doble reserva, reemplazos por un día y actividades importantes
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer flex items-center justify-center"
            title="Cerrar notificaciones"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      }
      bodyClassName="p-0 overflow-y-auto max-h-[calc(85vh-130px)]"
      footer={
        <div className="w-full flex items-center justify-between">
          <div className="text-[11px] text-slate-500 flex items-center space-x-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Integrado con Web Notifications & FCM</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl shadow-2xs transition cursor-pointer flex items-center justify-center"
          >
            Cerrar
          </button>
        </div>
      }
    >

        {/* Push Status Banner */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center space-x-2.5">
            {permission === 'granted' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 shrink-0" />
            ) : permission === 'denied' ? (
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 ring-4 ring-slate-200 shrink-0" />
            ) : (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-4 ring-amber-100 shrink-0" />
            )}

            <div className="text-xs">
              <span className="font-bold text-slate-800">
                {permission === 'granted'
                  ? 'Notificaciones Push Activas'
                  : permission === 'denied'
                  ? 'Notificaciones en Navegador Desactivadas'
                  : 'Permiso de Notificación Disponible'}
              </span>
              <p className="text-[11px] text-slate-500">
                {permission === 'granted'
                  ? isAndroid ? 'Recibirás avisos directos en tu teléfono Android' : 'Recibirás avisos en este navegador y sonido'
                  : permission === 'denied'
                  ? 'Puedes habilitarlas desde los permisos del navegador si deseas recibir alertas sonoras y push.'
                  : 'Activa para recibir alertas de topamiento, reemplazos y actividades marcadas.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 self-end sm:self-auto">
            {permission !== 'granted' ? (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Activar Notificaciones</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRunTest}
                disabled={isTesting}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>{isTesting ? 'Probando...' : 'Probar Notificación'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 px-5 pt-2 bg-white shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition cursor-pointer ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Historial de Alertas</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-extrabold">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 flex items-center space-x-2 transition cursor-pointer ${
              activeTab === 'settings'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Configuración y Preferencias</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {activeTab === 'history' ? (
            <div className="space-y-3">
              {/* Actions Toolbar */}
              <div className="flex items-center justify-between text-xs pb-1">
                <span className="text-slate-500 font-medium">
                  {history.length === 0
                    ? 'No hay notificaciones registradas'
                    : `${history.length} notificación(es)`}
                </span>

                {history.length > 0 && (
                  <div className="flex items-center space-x-2">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsAsRead}
                        className="text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1 cursor-pointer"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        <span>Marcar leídas</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearNotificationHistory}
                      className="text-rose-600 hover:text-rose-700 font-semibold flex items-center space-x-1 cursor-pointer ml-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpiar</span>
                    </button>
                  </div>
                )}
              </div>

              {history.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center">
                    <Bell className="w-6 h-6" />
                  </div>
                  <div className="max-w-xs space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">Bandeja al día</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Aquí aparecerán los avisos de topamiento de horario, alertas de reemplazos por un día y actividades marcadas como importantes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRunTest}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                  >
                    Enviar notificación de prueba
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((item) => {
                    let timeAgo = '';
                    try {
                      timeAgo = formatDistanceToNow(parseISO(item.timestamp), {
                        addSuffix: true,
                        locale: es
                      });
                    } catch {
                      timeAgo = 'hace un momento';
                    }

                    const isConflict = item.type === 'conflict';
                    const isImportant = item.type === 'important';
                    const isReplacement = item.type === 'replacement';

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-start space-x-3 ${
                          !item.read
                            ? isConflict
                              ? 'bg-rose-50/80 border-rose-200 hover:bg-rose-100/70 shadow-2xs'
                              : isImportant || isReplacement
                              ? 'bg-amber-50/80 border-amber-200 hover:bg-amber-100/70 shadow-2xs'
                              : 'bg-blue-50/80 border-blue-200 hover:bg-blue-100/70 shadow-2xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {/* Icon */}
                        <div
                          className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                            isConflict
                              ? 'bg-rose-100 text-rose-600'
                              : isImportant || isReplacement
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}
                        >
                          {isConflict ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : isReplacement ? (
                            <RefreshCw className="w-4 h-4" />
                          ) : isImportant ? (
                            <Star className="w-4 h-4 fill-amber-500" />
                          ) : (
                            <Bell className="w-4 h-4" />
                          )}
                        </div>

                        {/* Text Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <h4
                              className={`text-xs font-bold truncate ${
                                isConflict
                                  ? 'text-rose-900'
                                  : isImportant || isReplacement
                                  ? 'text-amber-900'
                                  : 'text-slate-900'
                              }`}
                            >
                              {item.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                              {timeAgo}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 leading-snug break-words">
                            {item.body}
                          </p>

                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center space-x-2">
                              {item.spaceName && (
                                <span className="text-[10px] bg-white/80 px-2 py-0.5 rounded-md border border-slate-200 font-bold text-slate-700">
                                  {item.spaceName}
                                </span>
                              )}
                              {item.targetDate && (
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {item.targetDate}
                                </span>
                              )}
                            </div>

                            <span className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold flex items-center space-x-1">
                              <span>Ver</span>
                              <ExternalLink className="w-3 h-3" />
                            </span>
                          </div>
                        </div>

                        {!item.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0 mt-1.5" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* Settings Tab */
            <div className="space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold text-slate-800">
                    Canales y Notificaciones Push
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Las alertas se envían al navegador y celulares Android mediante Web Push y Service Worker. Personaliza qué tipo de avisos deseas recibir:
                </p>
              </div>

              <div className="space-y-3">
                {/* 1. Alertas de Topamiento */}
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-rose-50 text-rose-600 rounded-xl mt-0.5">
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Detección de Topamiento / Doble Reserva
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Notificar inmediatamente si una nueva reserva se solapa en horario y sala.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.notifyTopamiento}
                      onChange={() => handleToggleSetting('notifyTopamiento')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* 2. Actividades Importantes */}
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl mt-0.5">
                      <Star className="w-4 h-4 fill-amber-400" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Actividades Marcadas como Importantes ⭐
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Alertar al celular cuando se cree o modifique una actividad prioritaria.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.notifyImportant}
                      onChange={() => handleToggleSetting('notifyImportant')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* 2.5. Reemplazos por un Día */}
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl mt-0.5">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Reemplazos de Actividad por un Día 🔄
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Avisar días antes del cambio y al agendar un reemplazo excepcional para coordinar a los involucrados.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.notifyReplacement}
                      onChange={() => handleToggleSetting('notifyReplacement')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* 3. Recordatorio Diario */}
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl mt-0.5">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Recordatorio Diario de Actividades de Hoy
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Aviso matutino con el resumen de actividades importantes del día.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.notifyDailyReminder}
                      onChange={() => handleToggleSetting('notifyDailyReminder')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* 4. Vibración en Celular Android */}
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl mt-0.5">
                      <Vibrate className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Vibración Háptica en Celular
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Vibrar el teléfono Android al detectar un topamiento, reemplazo o actividad importante.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.vibrationEnabled}
                      onChange={() => handleToggleSetting('vibrationEnabled')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                {/* 5. Sonido de Notificación */}
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl mt-0.5">
                      <Volume2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        Sonido y Campanilla de Alerta
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Reproducir tono de aviso sintetizado para llamadas de atención.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.soundEnabled}
                      onChange={() => handleToggleSetting('soundEnabled')}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
    </BaseModal>
  );
};
