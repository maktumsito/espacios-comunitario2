import React, { useState, useEffect, useMemo } from 'react';
import { getAuthSessionToken } from '../services/authService';
import {
  Mail,
  Send,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Users,
  Sparkles,
  Plus,
  X,
  Filter,
  Calendar,
  Clock,
  Repeat,
  CalendarDays,
  Check,
  FileText,
  Printer,
  Building2,
  BookmarkCheck,
  Tag
} from 'lucide-react';
import {
  DEFAULT_GMAIL_SENDER,
  connectGoogleGmailAccount,
  getGmailAccessToken,
  isGmailConnected,
  isPersistentGmailConnection,
  getCurrentGoogleUser,
  disconnectGoogleGmail,
  subscribeGmailAuthState,
  loadGmailDispatchConfig,
  saveGmailDispatchConfig,
  GmailDispatchConfig,
  GoogleAuthUserInfo,
  ScheduledDispatchConfig,
  DEFAULT_SCHEDULED_CONFIG,
  calculateScheduledDates,
  WEEKDAY_LABELS,
  AlcanceActividadesTipo,
  calculateActivityDatesForDispatchDate,
  calculateAllScheduledActivityDates,
  EmailDispatchFilterMode,
  isLoanReservation
} from '../services/gmailDispatchService';
import { ActivityTypeItem, LoanType } from '../types';
import { format, addMonths } from 'date-fns';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

interface AdminGmailConfigProps {
  activityTypes: ActivityTypeItem[];
  loanTypes: LoanType[];
  onOpenGmailDispatch?: (date?: string) => void;
  currentUser?: any;
}

export const AdminGmailConfig: React.FC<AdminGmailConfigProps> = ({
  activityTypes,
  loanTypes,
  onOpenGmailDispatch,
  currentUser
}) => {
  const [googleUser, setGoogleUser] = useState<GoogleAuthUserInfo | null>(getCurrentGoogleUser());
  const [hasToken, setHasToken] = useState(isGmailConnected());
  const [connectionPersistent, setConnectionPersistent] = useState(isPersistentGmailConnection());
  const [isConnecting, setIsConnecting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Configuration state
  const [config, setConfig] = useState<GmailDispatchConfig>({
    senderEmail: DEFAULT_GMAIL_SENDER,
    defaultRecipients: [DEFAULT_GMAIL_SENDER],
    selectedActivityTypes: ['ALL'],
    subjectTemplate: 'Actividades Comunitarias - {FECHAS}',
    customHeaderNote: 'Adjuntamos el detalle consolidado de actividades y uso de espacios programados.',
    includeObservations: true,
    includeResponsibleContact: true
  });

  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessToast, setSaveSuccessToast] = useState(false);
  const [newRecipientInput, setNewRecipientInput] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [isTriggeringAutomated, setIsTriggeringAutomated] = useState(false);
  const [automatedTriggerResult, setAutomatedTriggerResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTriggerAutomatedDispatch = async () => {
    setIsTriggeringAutomated(true);
    setAutomatedTriggerResult(null);
    try {
      const token = getAuthSessionToken();
      if (!token) throw new Error('Selecciona tu usuario e inicia sesión nuevamente.');

      const res = await fetch('/api/email/trigger-scheduled', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ force: true })
      });

      const data = await res.json();
      if (data.success) {
        setAutomatedTriggerResult({
          success: true,
          message: data.message || `Despacho completado con éxito. Se enviaron ${data.attachments?.length || 0} planilla(s) PDF adjunta(s).`
        });
      } else {
        setAutomatedTriggerResult({
          success: false,
          message: data.message || data.error || 'No se pudo completar el despacho automático.'
        });
      }
    } catch (err: any) {
      setAutomatedTriggerResult({
        success: false,
        message: err?.message || 'Error de conexión con el servidor.'
      });
    } finally {
      setIsTriggeringAutomated(false);
    }
  };

  // Subscribe to auth state
  useEffect(() => {
    const unsub = subscribeGmailAuthState((user, token, serverConnected, persistent) => {
      setGoogleUser(user);
      setHasToken(Boolean(token) || Boolean(serverConnected));
      setConnectionPersistent(Boolean(persistent));
    });
    return unsub;
  }, []);

  // Load config on mount
  useEffect(() => {
    let mounted = true;
    loadGmailDispatchConfig().then(saved => {
      if (mounted) {
        setConfig(saved.schedule?.alcanceActividades === 'proxima_semana'
          ? { ...saved, schedule: { ...saved.schedule, alcanceActividades: 'semana_en_curso' } }
          : saved);
        setIsLoadingConfig(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    setAuthError(null);
    try {
      await connectGoogleGmailAccount(DEFAULT_GMAIL_SENDER);
    } catch (err: any) {
      setAuthError(err?.message || 'Error al conectar con Google.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try { await disconnectGoogleGmail(); }
    catch (error) { setAuthError((error as Error).message); }
  };

  const handleAddRecipient = () => {
    setRecipientError(null);
    const val = newRecipientInput.trim().toLowerCase();
    if (!val) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(val)) {
      setRecipientError('Formato de correo inválido.');
      return;
    }

    if (!config.defaultRecipients.includes(val)) {
      setConfig(prev => ({
        ...prev,
        defaultRecipients: [...prev.defaultRecipients, val]
      }));
    }
    setNewRecipientInput('');
  };

  const handleRemoveRecipient = (emailToRemove: string) => {
    setConfig(prev => ({
      ...prev,
      defaultRecipients: prev.defaultRecipients.filter(e => e !== emailToRemove)
    }));
  };

  const handleToggleActivityType = (typeName: string) => {
    setConfig(prev => {
      const current = prev.selectedActivityTypes;
      if (current.includes('ALL')) {
        return {
          ...prev,
          selectedActivityTypes: [typeName]
        };
      }
      if (current.includes(typeName)) {
        const next = current.filter(t => t !== typeName);
        return {
          ...prev,
          selectedActivityTypes: next
        };
      }
      return {
        ...prev,
        selectedActivityTypes: [...current, typeName]
      };
    });
  };

  // Schedule state helpers
  const currentSchedule: ScheduledDispatchConfig = config.schedule || DEFAULT_SCHEDULED_CONFIG;

  const handleToggleScheduleEnabled = (enabled: boolean) => {
    setConfig(prev => ({
      ...prev,
      schedule: {
        ...(prev.schedule || DEFAULT_SCHEDULED_CONFIG),
        enabled
      }
    }));
  };

  const handleToggleWeekday = (dayNum: number) => {
    setConfig(prev => {
      const sch = prev.schedule || DEFAULT_SCHEDULED_CONFIG;
      const currentDays = sch.diasSemana || [1];
      let nextDays: number[];
      if (currentDays.includes(dayNum)) {
        if (currentDays.length <= 1) return prev; // Mantener al menos 1 día
        nextDays = currentDays.filter(d => d !== dayNum);
      } else {
        nextDays = [...currentDays, dayNum].sort((a, b) => {
          const aNorm = a === 0 ? 7 : a;
          const bNorm = b === 0 ? 7 : b;
          return aNorm - bNorm;
        });
      }
      return {
        ...prev,
        schedule: {
          ...sch,
          diasSemana: nextDays
        }
      };
    });
  };

  const handleSetWeekdayPreset = (preset: 'lunes' | 'viernes' | 'sabado' | 'domingo' | 'fin_de_semana' | 'habiles' | 'todos') => {
    let days: number[] = [1];
    if (preset === 'lunes') days = [1];
    else if (preset === 'viernes') days = [5];
    else if (preset === 'sabado') days = [6];
    else if (preset === 'domingo') days = [0];
    else if (preset === 'fin_de_semana') days = [6, 0];
    else if (preset === 'habiles') days = [1, 2, 3, 4, 5];
    else if (preset === 'todos') days = [1, 2, 3, 4, 5, 6, 0];

    setConfig(prev => ({
      ...prev,
      schedule: {
        ...(prev.schedule || DEFAULT_SCHEDULED_CONFIG),
        diasSemana: days
      }
    }));
  };

  const handleSetDurationPreset = (months: number | 'endOfYear') => {
    const today = new Date();
    let endDateStr: string;

    if (months === 'endOfYear') {
      endDateStr = `${today.getFullYear()}-12-31`;
    } else {
      endDateStr = format(addMonths(today, months), 'yyyy-MM-dd');
    }

    setConfig(prev => ({
      ...prev,
      schedule: {
        ...(prev.schedule || DEFAULT_SCHEDULED_CONFIG),
        fechaFin: endDateStr,
        duracionMeses: typeof months === 'number' ? months : undefined
      }
    }));
  };

  const handleScheduleChange = (field: keyof ScheduledDispatchConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      schedule: {
        ...(prev.schedule || DEFAULT_SCHEDULED_CONFIG),
        [field]: value
      }
    }));
  };

  const handleToggleSpecificActivityDay = (dayNum: number) => {
    const current = currentSchedule.diasActividadesEspecificos || [6, 0];
    const updated = current.includes(dayNum)
      ? current.filter(d => d !== dayNum)
      : [...current, dayNum];
    handleScheduleChange('diasActividadesEspecificos', updated.length > 0 ? updated : [dayNum]);
  };

  // Projected scheduled dispatch dates (cuándo se envía el correo)
  const scheduledDates = useMemo(() => {
    if (!currentSchedule.diasSemana || !currentSchedule.fechaInicio || !currentSchedule.fechaFin) {
      return [];
    }
    return calculateScheduledDates(
      currentSchedule.diasSemana,
      currentSchedule.fechaInicio,
      currentSchedule.fechaFin
    );
  }, [currentSchedule.diasSemana, currentSchedule.fechaInicio, currentSchedule.fechaFin]);

  // Projected activity dates (qué días de actividades se enviarán)
  const projectedActivityDates = useMemo(() => {
    if (!currentSchedule.diasSemana || !currentSchedule.fechaInicio || !currentSchedule.fechaFin) {
      return [];
    }
    return calculateAllScheduledActivityDates(
      currentSchedule.diasSemana,
      currentSchedule.fechaInicio,
      currentSchedule.fechaFin,
      currentSchedule.alcanceActividades || 'fin_de_semana',
      currentSchedule.diasActividadesEspecificos || [6, 0]
    );
  }, [
    currentSchedule.diasSemana,
    currentSchedule.fechaInicio,
    currentSchedule.fechaFin,
    currentSchedule.alcanceActividades,
    currentSchedule.diasActividadesEspecificos
  ]);

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveGmailDispatchConfig(config, currentUser?.email || DEFAULT_GMAIL_SENDER);
    setIsSaving(false);
    if (ok) {
      setSaveSuccessToast(true);
      setTimeout(() => setSaveSuccessToast(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Main Dispatch Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Configuración y Despacho de Actividades por Gmail
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Envía el resumen diario o semanal de actividades a los correos que ingreses directamente desde la cuenta oficial{' '}
            <strong className="text-slate-700 font-mono">{DEFAULT_GMAIL_SENDER}</strong>.
          </p>
        </div>

        {onOpenGmailDispatch && (
          <button
            type="button"
            id="admin-btn-open-gmail-dispatch"
            onClick={() => onOpenGmailDispatch()}
            className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer self-start sm:self-auto"
          >
            <Send className="w-4 h-4" />
            <span>Abrir Asistente de Envío</span>
          </button>
        )}
      </div>

      {/* Account Connection Status Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold text-slate-900">Cuenta Emisora Oficial</h3>
              <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                Google Workspace OAuth
              </span>
            </div>
            <p className="text-xs font-mono font-bold text-slate-800 mt-0.5">{DEFAULT_GMAIL_SENDER}</p>
            <div className="flex items-center space-x-2 mt-1.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  hasToken ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-amber-500 ring-4 ring-amber-100'
                }`}
              />
              <span className="text-xs text-slate-600">
                {hasToken ? (
                  <strong className="text-emerald-700">{connectionPersistent ? 'Conectado con renovación automática' : 'Conectado; sesión temporal recuperable al recargar'}</strong>
                ) : (
                  <span className="text-amber-700">Requiere conectar con Google para emitir correos</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {!hasToken ? (
            <button
              type="button"
              id="admin-btn-connect-google"
              onClick={handleConnect}
              disabled={isConnecting}
              className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-bold shadow-2xs transition flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isConnecting ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span>Conectar con Google</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDisconnect}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Cerrar Sesión Google
            </button>
          )}
        </div>
      </div>

      {authError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{authError}</span>
        </div>
      )}

      {/* Programación de Envío Periódico: Día de la semana y Duración */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0 mt-0.5">
              <Repeat className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Programación de Envío Periódico (Día de la semana y Duración)
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    currentSchedule.enabled
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {currentSchedule.enabled ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Elige qué día de la semana se despacha el resumen y por cuánto tiempo o hasta qué fecha debe repetirse.
              </p>
            </div>
          </div>

          <label className="flex items-center space-x-2.5 cursor-pointer select-none self-start sm:self-auto bg-slate-50 hover:bg-slate-100 px-3.5 py-2 rounded-xl border border-slate-200 transition">
            <input
              type="checkbox"
              id="admin-schedule-enabled-toggle"
              checked={currentSchedule.enabled}
              onChange={e => handleToggleScheduleEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
            />
            <span className="text-xs font-bold text-slate-800">
              {currentSchedule.enabled ? 'Programación Habilitada' : 'Habilitar Envío Automático'}
            </span>
          </label>
        </div>

        {/* 1. ¿Qué día de la semana se envía? */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
              <Calendar className="w-4 h-4 text-blue-600" />
              <span>1. ¿Qué día de la semana se envía?</span>
            </label>
            <div className="flex flex-wrap gap-1.5 text-xs">
              <span className="text-slate-400 text-[11px] self-center mr-1">Atajos:</span>
              <button
                type="button"
                onClick={() => handleSetWeekdayPreset('lunes')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
              >
                Cada Lunes
              </button>
              <button
                type="button"
                onClick={() => handleSetWeekdayPreset('viernes')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
              >
                Cada Viernes
              </button>
              <button
                type="button"
                onClick={() => handleSetWeekdayPreset('sabado')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
              >
                Cada Sábado
              </button>
              <button
                type="button"
                onClick={() => handleSetWeekdayPreset('domingo')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
              >
                Cada Domingo
              </button>
              <button
                type="button"
                onClick={() => handleSetWeekdayPreset('fin_de_semana')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
              >
                Fin de Semana
              </button>
              <button
                type="button"
                onClick={() => handleSetWeekdayPreset('habiles')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
              >
                Lun a Vie
              </button>
              <button
                type="button"
                onClick={() => handleSetWeekdayPreset('todos')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 rounded-lg text-[11px] font-medium transition cursor-pointer"
              >
                Todos los días
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Haz clic en los días en que deseas que se emita el correo con el consolidado:
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {[1, 2, 3, 4, 5, 6, 0].map(dayNum => {
              const info = WEEKDAY_LABELS[dayNum];
              const isSelected = currentSchedule.diasSemana?.includes(dayNum);

              return (
                <button
                  key={dayNum}
                  type="button"
                  id={`admin-btn-weekday-${dayNum}`}
                  onClick={() => handleToggleWeekday(dayNum)}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition cursor-pointer ${
                    isSelected
                      ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-2xs ring-1 ring-blue-300'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-xs font-bold">{info.name}</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">({info.short})</span>
                  {isSelected ? (
                    <span className="mt-1 inline-flex items-center text-[10px] font-bold text-blue-700">
                      <Check className="w-3 h-3 mr-0.5" /> Seleccionado
                    </span>
                  ) : (
                    <span className="mt-1 text-[10px] text-slate-300">Desactivado</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Hora de Envío */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
            <Clock className="w-4 h-4 text-blue-600" />
            <span>2. Hora de Despacho</span>
          </label>
          <div className="flex items-center space-x-3">
            <input
              type="time"
              id="admin-schedule-time"
              value={currentSchedule.horaEnvio || '08:30'}
              onChange={e => handleScheduleChange('horaEnvio', e.target.value)}
              className="w-36 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
            <span className="text-xs text-slate-500">
              Hora local sugerida para preparar y emitir el resumen (ej: 08:30 hrs).
            </span>
          </div>
        </div>

        {/* 3. ¿Por cuánto tiempo se envía? (Duración y Fecha Término) */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              <span>3. ¿Por cuánto tiempo se envía? (Duración y Fecha Término)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-slate-400 text-[11px] self-center mr-1">Duración rápida:</span>
              {[
                { label: '1 Mes', val: 1 },
                { label: '2 Meses', val: 2 },
                { label: '3 Meses', val: 3 },
                { label: '6 Meses', val: 6 },
                { label: 'Fin de Año', val: 'endOfYear' as const }
              ].map(preset => {
                const isActive =
                  preset.val === 'endOfYear'
                    ? currentSchedule.fechaFin.endsWith('-12-31')
                    : currentSchedule.duracionMeses === preset.val;

                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSetDurationPreset(preset.val)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Define el período durante el cual se mantendrá activa la programación de envíos:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">
                Fecha de Inicio del ciclo:
              </label>
              <input
                type="date"
                id="admin-schedule-start-date"
                value={currentSchedule.fechaInicio}
                onChange={e => handleScheduleChange('fechaInicio', e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 flex items-center justify-between">
                <span className="font-bold text-blue-900">¿Hasta qué fecha se envía? (Término):</span>
                <span className="text-[10px] text-blue-600 font-bold">Fecha Límite</span>
              </label>
              <input
                type="date"
                id="admin-schedule-end-date"
                min={currentSchedule.fechaInicio}
                value={currentSchedule.fechaFin}
                onChange={e => handleScheduleChange('fechaFin', e.target.value)}
                className="w-full px-3 py-2 bg-blue-50/50 border border-blue-300 rounded-xl text-xs font-bold text-slate-900 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* 4. Alcance de actividades a incluir */}
        <div className="space-y-3 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
              <Filter className="w-4 h-4 text-blue-600" />
              <span>4. ¿Qué días de actividades se envían en cada despacho?</span>
            </label>
            <span className="text-[11px] text-slate-500 font-medium">
              Alcance de fechas por correo
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {[
              {
                id: 'fin_de_semana' as AlcanceActividadesTipo,
                title: 'Fin de Semana (Sáb + Dom)',
                tag: 'Recomendado para envíos en viernes',
                desc: 'Envía las actividades del sábado y domingo siguientes. Ideal para despachar la cartelera de fin de semana.'
              },
              {
                id: 'siguiente_sabado' as AlcanceActividadesTipo,
                title: 'Sábado de esta semana',
                tag: 'Solo sábado',
                desc: 'Envía únicamente las actividades correspondientes al sábado de la semana en curso.'
              },
              {
                id: 'siguiente_domingo' as AlcanceActividadesTipo,
                title: 'Domingo de esta semana',
                tag: 'Solo domingo',
                desc: 'Envía únicamente las actividades correspondientes al domingo de la semana en curso.'
              },
              {
                id: 'dia_del_envio' as AlcanceActividadesTipo,
                title: 'Mismo Día del Envío',
                tag: 'Día exacto',
                desc: 'Actividades programadas exclusivamente para el mismo día en que sale el correo.'
              },
              {
                id: 'semana_en_curso' as AlcanceActividadesTipo,
                title: 'Semana en Curso (Lun a Dom)',
                tag: 'Semana actual',
                desc: 'Consolidado completo de lunes a domingo de la semana en ejecución.'
              },
              {
                id: 'dias_especificos' as AlcanceActividadesTipo,
                title: 'Días Específicos Personalizados',
                tag: 'Tú eliges los días',
                desc: 'Selecciona qué días de la semana de actividades se envían en cada oportunidad.'
              }
            ].map(item => {
              const isSelected = (currentSchedule.alcanceActividades || 'fin_de_semana') === item.id;
              return (
                <label
                  key={item.id}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-50/90 border-blue-500 text-blue-950 ring-1 ring-blue-400 shadow-2xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="alcanceActividades"
                          value={item.id}
                          checked={isSelected}
                          onChange={() => handleScheduleChange('alcanceActividades', item.id)}
                          className="text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                        <span className="font-bold text-slate-900">{item.title}</span>
                      </div>
                    </div>
                    {item.tag && (
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-md mb-1.5 ml-5 ${
                        isSelected ? 'bg-blue-200/70 text-blue-900' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {item.tag}
                      </span>
                    )}
                    <p className="text-[11px] text-slate-500 pl-5 leading-relaxed">{item.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Selector de días de actividades específicos si está seleccionado 'dias_especificos' */}
          {currentSchedule.alcanceActividades === 'dias_especificos' && (
            <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 mt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <span className="text-xs font-bold text-blue-950">
                  Selecciona los días de la semana de actividades que se incluirán en cada correo:
                </span>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleScheduleChange('diasActividadesEspecificos', [6, 0])}
                    className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-100 text-blue-800 rounded-md font-semibold transition cursor-pointer"
                  >
                    Sábado y Domingo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScheduleChange('diasActividadesEspecificos', [1, 2, 3, 4, 5])}
                    className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-100 text-blue-800 rounded-md font-semibold transition cursor-pointer"
                  >
                    Lun a Vie
                  </button>
                  <button
                    type="button"
                    onClick={() => handleScheduleChange('diasActividadesEspecificos', [1, 2, 3, 4, 5, 6, 0])}
                    className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-100 text-blue-800 rounded-md font-semibold transition cursor-pointer"
                  >
                    Todos
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 pt-1">
                {[1, 2, 3, 4, 5, 6, 0].map(dayNum => {
                  const info = WEEKDAY_LABELS[dayNum];
                  const isChecked = (currentSchedule.diasActividadesEspecificos || [6, 0]).includes(dayNum);
                  return (
                    <button
                      key={dayNum}
                      type="button"
                      onClick={() => handleToggleSpecificActivityDay(dayNum)}
                      className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                        isChecked
                          ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium'
                      }`}
                    >
                      <div className="text-xs">{info.short}</div>
                      <div className={`text-[10px] mt-0.5 ${isChecked ? 'text-blue-100' : 'text-slate-400'}`}>
                        {info.name.slice(0, 3)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 5. Proyección y Resumen Dinámico en Tiempo Real */}
        <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200 rounded-2xl p-4.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-blue-900">
                Resumen Proyectado de la Programación
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold bg-white text-blue-800 px-2.5 py-0.5 rounded-full border border-blue-200 shadow-2xs">
                {scheduledDates.length} envíos programados
              </span>
              <span className="text-xs font-bold bg-blue-600 text-white px-2.5 py-0.5 rounded-full shadow-2xs">
                {projectedActivityDates.length} fechas de actividades
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-700 space-y-1.5">
            <p>
              <strong>📅 Día de Envío (Salida del Correo):</strong> Cada{' '}
              <span className="text-blue-700 font-bold">
                {(currentSchedule.diasSemana || [1])
                  .map(d => WEEKDAY_LABELS[d]?.name || 'Lunes')
                  .join(', ')}
              </span>{' '}
              a las <strong className="text-slate-900">{currentSchedule.horaEnvio || '08:30'} hrs</strong>.
            </p>
            <p>
              <strong>📋 Qué Actividades se Envían:</strong>{' '}
              <span className="font-semibold text-blue-900">
                {currentSchedule.alcanceActividades === 'fin_de_semana'
                  ? 'Fin de Semana (Sábado y Domingo siguientes)'
                  : currentSchedule.alcanceActividades === 'siguiente_sabado'
                  ? 'Sábado de esta semana'
                  : currentSchedule.alcanceActividades === 'siguiente_domingo'
                  ? 'Domingo de esta semana'
                  : currentSchedule.alcanceActividades === 'dia_del_envio'
                  ? 'Mismo Día del Envío'
                  : currentSchedule.alcanceActividades === 'proxima_semana'
                  ? 'Próxima Semana completa (Lun a Dom)'
                  : currentSchedule.alcanceActividades === 'dias_especificos'
                  ? `Días específicos de actividades: ${(currentSchedule.diasActividadesEspecificos || [6, 0])
                      .map(d => WEEKDAY_LABELS[d]?.name || '')
                      .join(', ')}`
                  : 'Semana en Curso (Lun a Dom)'}
              </span>
            </p>
            <p>
              <strong>⏳ Período de Vigencia:</strong> Desde el{' '}
              <span className="font-semibold">{formatDateDDMMYYYY(currentSchedule.fechaInicio)}</span> hasta el{' '}
              <span className="font-bold text-blue-800 underline">
                {formatDateDDMMYYYY(currentSchedule.fechaFin)}
              </span>{' '}
              ({scheduledDates.length} despachos en total).
            </p>
            <p>
              <strong>📬 Destinatarios ({config.defaultRecipients.length}):</strong>{' '}
              <span className="font-mono text-[11px] text-slate-600">
                {config.defaultRecipients.join(', ') || 'Sin destinatarios'}
              </span>
            </p>

            {/* Ejemplo en vivo del primer despacho */}
            {scheduledDates.length > 0 && (
              <div className="mt-2 p-2.5 bg-white/90 border border-blue-200 rounded-xl space-y-1">
                <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Ejemplo del primer envío:</span>
                </span>
                <p className="text-[11px] text-slate-700">
                  El primer correo saldrá el <strong>{formatDateDDMMYYYY(scheduledDates[0])}</strong> e incluirá las actividades programadas para:{' '}
                  <span className="font-bold text-blue-800">
                    {calculateActivityDatesForDispatchDate(
                      scheduledDates[0],
                      currentSchedule.alcanceActividades || 'fin_de_semana',
                      currentSchedule.diasActividadesEspecificos || [6, 0]
                    )
                      .map(formatDateDDMMYYYY)
                      .join(', ') || 'Ninguna fecha encontrada'}
                  </span>.
                </p>
              </div>
            )}

            {/* Callout de Planillas PDF Oficiales */}
            <div className="mt-2 p-3 bg-blue-100/80 border border-blue-300 rounded-xl space-y-1.5 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="text-[11px] font-bold text-blue-950 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-blue-700" />
                  <span>Adjuntos Oficiales para Impresión:</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-blue-300 text-[10px] font-bold text-blue-900 shadow-2xs">
                  <FileText className="w-3 h-3 text-blue-600" />
                  <span>Hoja: 8.5" × 13" (Oficio)</span>
                </span>
              </div>
              <p className="text-[11px] text-blue-900 leading-relaxed">
                Cada despacho incluirá solo las actividades seleccionadas de la semana en curso (lunes a domingo, hora de Chile), y generará y adjuntará <strong>una planilla PDF separada por cada día</strong> que se envíe, configurada y diagramada específicamente para imprimirse en <strong>hoja de 8.5 × 13 pulgadas (tamaño Oficio / Folio), horizontal</strong> en formato vectorizado de alta definición y contraste óptimo para imprimir directamente en portería y administración.
              </p>
            </div>
          </div>

          {/* Fechas de ejemplo */}
          {scheduledDates.length > 0 && (
            <div className="pt-2 border-t border-blue-100">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                Próximas fechas en que se enviará el correo:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {scheduledDates.slice(0, 6).map(d => (
                  <span
                    key={d}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-blue-800 shadow-2xs"
                  >
                    <Calendar className="w-3 h-3 text-blue-500" />
                    <span>{formatDateDDMMYYYY(d)}</span>
                  </span>
                ))}
                {scheduledDates.length > 6 && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-lg text-xs font-bold">
                    +{scheduledDates.length - 6} fechas más
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Acciones de la Programación */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              id="admin-btn-save-schedule"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
              <span>Guardar Programación en Firestore</span>
            </button>

            <button
              type="button"
              id="admin-btn-trigger-automated-now"
              onClick={handleTriggerAutomatedDispatch}
              disabled={isTriggeringAutomated}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              title="Dispara el proceso de despacho automático del servidor con las planillas PDF de cada día adjuntas"
            >
              {isTriggeringAutomated ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              <span>Ejecutar Despacho Automático Ahora (con PDFs)</span>
            </button>

            {onOpenGmailDispatch && (
              <button
                type="button"
                id="admin-btn-dispatch-test-schedule"
                onClick={() => onOpenGmailDispatch(currentSchedule.fechaInicio)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer flex items-center space-x-1.5"
              >
                <Send className="w-3.5 h-3.5 text-blue-600" />
                <span>Asistente Manual</span>
              </button>
            )}
          </div>

          <span className="text-[11px] text-slate-400">
            Se sincroniza con el motor de despacho automático en segundo plano.
          </span>
        </div>

        {/* Feedback del Despacho Automático Manual */}
        {automatedTriggerResult && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-start space-x-2.5 ${
              automatedTriggerResult.success
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {automatedTriggerResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <strong className="block font-bold">
                {automatedTriggerResult.success ? '¡Despacho Automático Ejecutado!' : 'Resultado del Despacho'}
              </strong>
              <p className="mt-0.5 leading-relaxed">{automatedTriggerResult.message}</p>
            </div>
            <button
              type="button"
              onClick={() => setAutomatedTriggerResult(null)}
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Settings Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
        <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">
          Preferencias Predeterminadas de Envío
        </h3>

        {/* 1. Destinatarios predeterminados */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
            <Users className="w-4 h-4 text-blue-600" />
            <span>Destinatarios Frecuentes / Predeterminados ({config.defaultRecipients.length})</span>
          </label>
          <p className="text-xs text-slate-500">
            Los correos que ingreses aquí aparecerán automáticamente en el asistente de despacho.
          </p>

          <div className="flex items-center space-x-2">
            <input
              type="email"
              placeholder="Ingresa un correo electrónico (ej: usuario@gmail.com)..."
              value={newRecipientInput}
              onChange={e => setNewRecipientInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddRecipient();
                }
              }}
              className="max-w-md flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
            <button
              type="button"
              onClick={handleAddRecipient}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer flex items-center space-x-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Añadir</span>
            </button>
          </div>

          {recipientError && (
            <p className="text-xs text-red-600 font-medium">{recipientError}</p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {config.defaultRecipients.map(email => (
              <span
                key={email}
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 shadow-2xs"
              >
                <Mail className="w-3 h-3 text-slate-400" />
                <span>{email}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveRecipient(email)}
                  className="text-slate-400 hover:text-red-600 transition cursor-pointer ml-1"
                  title="Eliminar de destinatarios predeterminados"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* 2. Filtro de Despacho por Correo: Préstamos o Actividades Seleccionadas */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
                <Tag className="w-4 h-4 text-blue-600" />
                <span>2. Filtro de Despacho por Correo (¿Qué reservas se envían?)</span>
              </label>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                Regla de Despacho
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Configura el alcance del correo: el despacho puede restringirse <strong>únicamente a préstamos</strong> o a los tipos de actividades que selecciones específicamente.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                id: 'solo_prestamos' as EmailDispatchFilterMode,
                title: 'Solo Préstamos',
                badge: 'Recomendado',
                badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                icon: Building2,
                desc: 'Envía única y exclusivamente reservas que correspondan a préstamos (CAM, Iglesias, Clubes, Mobiliario o con tipo de préstamo asignado).'
              },
              {
                id: 'prestamos_y_seleccionadas' as EmailDispatchFilterMode,
                title: 'Préstamos o Actividades Seleccionadas',
                badge: 'Flexible',
                badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
                icon: BookmarkCheck,
                desc: 'Envía todos los préstamos más los tipos de actividad adicionales que marques en la lista inferior.'
              },
              {
                id: 'actividades_seleccionadas' as EmailDispatchFilterMode,
                title: 'Solo Actividades Seleccionadas',
                badge: 'Estricto',
                badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
                icon: Filter,
                desc: 'Envía exclusivamente los tipos de actividades que tengas expresamente seleccionados abajo.'
              },
              {
                id: 'todas' as EmailDispatchFilterMode,
                title: 'Todas las Actividades',
                badge: 'Sin filtro',
                badgeColor: 'bg-slate-100 text-slate-700 border-slate-200',
                icon: CheckCircle2,
                desc: 'Incluye todas las actividades programadas para la fecha sin ningún filtro de categoría.'
              }
            ].map(item => {
              const Icon = item.icon;
              const isSelected = (config.dispatchFilterMode || 'solo_prestamos') === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setConfig(prev => ({ ...prev, dispatchFilterMode: item.id }))}
                  className={`p-3.5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10 ring-2 ring-blue-600/30'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-2">
                      <div className={`p-1.5 rounded-xl ${isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isSelected ? 'bg-white/20 text-white border-white/30' : item.badgeColor
                      }`}>
                        {item.badge}
                      </span>
                    </div>
                    <div className="font-bold text-xs leading-snug mb-1">{item.title}</div>
                    <p className={`text-[11px] leading-relaxed ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                      {item.desc}
                    </p>
                  </div>
                  {isSelected && (
                    <div className="mt-2.5 pt-2 border-t border-white/20 flex items-center space-x-1 text-[11px] font-semibold text-blue-100">
                      <Check className="w-3.5 h-3.5 text-white" />
                      <span>Modo Activo</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Callout explicativo cuando está en modo Solo Préstamos */}
          {(config.dispatchFilterMode || 'solo_prestamos') === 'solo_prestamos' && (
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start space-x-2.5">
              <Building2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">Regla activa: El correo está restringido estrictamente a Préstamos</span>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Tanto el despacho automático en segundo plano como las planillas PDF adjuntas procesarán únicamente reservas catalogadas como préstamos de espacios, salas o equipamiento (ej. CAM Adulto Mayor, Iglesias, Clubes, organizaciones comunitarias).
                </p>
              </div>
            </div>
          )}

          {/* Selector de tipos de actividad (visible o editable según modo) */}
          {(config.dispatchFilterMode === 'prestamos_y_seleccionadas' || config.dispatchFilterMode === 'actividades_seleccionadas') && (
            <div className="p-4 bg-slate-50 border border-blue-200 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <span>
                    {config.dispatchFilterMode === 'prestamos_y_seleccionadas'
                      ? 'Actividades Adicionales Seleccionadas (además de Préstamos)'
                      : 'Actividades Seleccionadas a Incluir'}
                  </span>
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, selectedActivityTypes: activityTypes.map(a => a.name) }))}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline"
                  >
                    Seleccionar Todas
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setConfig(prev => ({ ...prev, selectedActivityTypes: [] }))}
                    className="text-xs text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {activityTypes.map(act => {
                  const isSelected = Array.isArray(config.selectedActivityTypes) &&
                    (config.selectedActivityTypes.includes('ALL') || config.selectedActivityTypes.includes(act.name));

                  return (
                    <button
                      key={act.id}
                      type="button"
                      onClick={() => handleToggleActivityType(act.name)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer text-left truncate ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                      title={act.name}
                    >
                      <span className="truncate">{act.name}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 3. Plantilla de Asunto y Nota */}
        <div className="space-y-4 pt-2 border-t border-slate-100">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Plantilla de Mensaje</span>
          </label>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Plantilla de Asunto:</label>
            <input
              type="text"
              value={config.subjectTemplate}
              onChange={e => setConfig(prev => ({ ...prev, subjectTemplate: e.target.value }))}
              placeholder="Actividades Comunitarias - {FECHAS}"
              className="max-w-md w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
            <p className="text-[11px] text-slate-400 mt-1">Usa &#123;FECHAS&#125; para insertar automáticamente el rango o día seleccionado.</p>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Nota introductoria por defecto:</label>
            <textarea
              value={config.customHeaderNote || ''}
              onChange={e => setConfig(prev => ({ ...prev, customHeaderNote: e.target.value }))}
              rows={2}
              placeholder="Mensaje introductorio o saludo..."
              className="max-w-xl w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none"
            />
          </div>

          <div className="flex flex-wrap gap-4 text-xs">
            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.includeResponsibleContact}
                onChange={e => setConfig(prev => ({ ...prev, includeResponsibleContact: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-medium text-slate-700">Incluir contacto del responsable (teléfono / email)</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.includeObservations}
                onChange={e => setConfig(prev => ({ ...prev, includeObservations: e.target.checked }))}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
              />
              <span className="font-medium text-slate-700">Incluir observaciones de las actividades</span>
            </label>
          </div>
        </div>

        {/* Save Bar */}
        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              id="admin-btn-save-gmail-config"
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer flex items-center space-x-2 disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
              <span>Guardar Configuración en Firestore</span>
            </button>

            {saveSuccessToast && (
              <span className="text-xs font-semibold text-emerald-700 flex items-center space-x-1 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>¡Preferencias guardadas exitosamente!</span>
              </span>
            )}
          </div>

          <div className="text-[11px] text-slate-400">
            Última actualización: {config.updatedAt ? new Date(config.updatedAt).toLocaleString('es-CL') : 'Predeterminado'}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminGmailConfig;
