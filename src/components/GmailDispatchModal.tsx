import { formatDisplayTitle } from '../utils/reservationVisuals';
import { ModalOverlay } from './common/ModalOverlay';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Mail,
  Send,
  Calendar,
  Users,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Eye,
  Settings,
  Plus,
  Sparkles,
  ShieldCheck,
  Filter,
  Repeat,
  CalendarDays,
  CheckSquare,
  Square,
  Check,
  FileText,
  Printer,
  Download,
  Building2,
  Tag,
  BookmarkCheck
} from 'lucide-react';
import {
  Reservation,
  SpaceInfo,
  ActivityTypeItem,
  LoanType
} from '../types';
import {
  format,
  parseISO,
  addDays,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths
} from 'date-fns';
import { es } from 'date-fns/locale';
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
  generateActivitiesEmailContent,
  sendActivitiesViaGmail,
  ActivityEmailItem,
  GmailDispatchConfig,
  calculateScheduledDates,
  WEEKDAY_LABELS,
  AlcanceActividadesTipo,
  calculateActivityDatesForDispatchDate,
  EmailDispatchFilterMode,
  isLoanReservation
} from '../services/gmailDispatchService';
import { filterDatesToDispatchWeek, getSantiagoDateStr, selectDispatchReservations } from '../utils/activityDispatchSelection';
import { recordAuditEntry } from '../services/auditLogService';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { formatActivitiesInDays } from '../utils/pluralUtils';
import { generateDailyPdfsForDates, getDailySchedulePdfFilename } from '../utils/dailySchedulePdf';

interface GmailDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservations: Reservation[];
  availableSpaces?: SpaceInfo[];
  availableActivityTypes?: ActivityTypeItem[];
  availableLoanTypes?: LoanType[];
  initialDate?: string;
  initialFilterMode?: EmailDispatchFilterMode;
  initialReservationId?: string;
  currentUser?: any;
}

type DateSelectionMode = 'single' | 'range' | 'multiple' | 'weekday_duration';

export const GmailDispatchModal: React.FC<GmailDispatchModalProps> = ({
  isOpen,
  onClose,
  reservations,
  availableSpaces = [],
  availableActivityTypes = [],
  availableLoanTypes = [],
  initialDate,
  initialFilterMode,
  initialReservationId,
  currentUser
}) => {
  // Google Auth State
  const [googleUser, setGoogleUser] = useState<{ email: string | null; displayName: string | null } | null>(
    getCurrentGoogleUser()
  );
  const [hasToken, setHasToken] = useState<boolean>(isGmailConnected());
  const [connectionPersistent, setConnectionPersistent] = useState(isPersistentGmailConnection());
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Form State
  const [dateMode, setDateMode] = useState<DateSelectionMode>('single');
  const [singleDate, setSingleDate] = useState<string>(
    initialDate || getSantiagoDateStr()
  );
  const [rangeStart, setRangeStart] = useState<string>(
    initialDate || getSantiagoDateStr()
  );
  const [rangeEnd, setRangeEnd] = useState<string>(
    initialDate ? format(addDays(parseISO(initialDate), 4), 'yyyy-MM-dd') : format(addDays(new Date(), 4), 'yyyy-MM-dd')
  );
  const [multipleDates, setMultipleDates] = useState<string[]>([
    initialDate || getSantiagoDateStr()
  ]);
  const [datePickerInput, setDatePickerInput] = useState<string>('');

  // Schedule / Recurring state ("Día de la semana y Duración")
  const [scheduleDays, setScheduleDays] = useState<number[]>([1]); // default Lunes
  const [scheduleStartDate, setScheduleStartDate] = useState<string>(
    initialDate || getSantiagoDateStr()
  );
  const [scheduleEndDate, setScheduleEndDate] = useState<string>(
    initialDate
      ? format(addMonths(parseISO(initialDate), 3), 'yyyy-MM-dd')
      : format(addMonths(new Date(), 3), 'yyyy-MM-dd')
  );
  const [scheduleDurationMonths, setScheduleDurationMonths] = useState<number | 'endOfYear' | undefined>(3);
  const [scheduleScope, setScheduleScope] = useState<AlcanceActividadesTipo>('fin_de_semana');
  const [scheduleSpecificActivityDays, setScheduleSpecificActivityDays] = useState<number[]>([6, 0]);

  // Activity Type Filters & Loan Filter Mode
  const [dispatchFilterMode, setDispatchFilterMode] = useState<EmailDispatchFilterMode>(
    initialFilterMode || 'solo_prestamos'
  );
  const [allActivityTypesSelected, setAllActivityTypesSelected] = useState<boolean>(true);
  const [selectedActivityTypes, setSelectedActivityTypes] = useState<string[]>([]);

  // Recipients
  const [recipientInput, setRecipientInput] = useState<string>('');
  const [recipients, setRecipients] = useState<string[]>([DEFAULT_GMAIL_SENDER]);
  const [recipientError, setRecipientError] = useState<string | null>(null);

  // Email customization
  const [subject, setSubject] = useState<string>('');
  const [customNote, setCustomNote] = useState<string>('');
  const [includeObservations, setIncludeObservations] = useState<boolean>(true);
  const [includeResponsibleContact, setIncludeResponsibleContact] = useState<boolean>(true);

  // UI States
  const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);
  const [sendErrorMessage, setSendErrorMessage] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [configSavedToast, setConfigSavedToast] = useState<boolean>(false);

  // Subscribe to auth changes
  useEffect(() => {
    const unsub = subscribeGmailAuthState((user, token, serverConnected, persistent) => {
      setGoogleUser(user);
      setHasToken(Boolean(token) || Boolean(serverConnected));
      setConnectionPersistent(Boolean(persistent));
    });
    return unsub;
  }, []);

  // Load saved configuration on mount
  useEffect(() => {
    if (!isOpen) return;

    loadGmailDispatchConfig().then(cfg => {
      if (initialFilterMode) {
        setDispatchFilterMode(initialFilterMode);
      } else if (cfg.dispatchFilterMode) {
        setDispatchFilterMode(cfg.dispatchFilterMode);
      }

      if (cfg.defaultRecipients && cfg.defaultRecipients.length > 0) {
        setRecipients(cfg.defaultRecipients);
      }
      if (cfg.selectedActivityTypes) {
        if (cfg.selectedActivityTypes.includes('ALL')) {
          setAllActivityTypesSelected(true);
        } else {
          setAllActivityTypesSelected(false);
          setSelectedActivityTypes(cfg.selectedActivityTypes);
        }
      }
      if (cfg.customHeaderNote) {
        setCustomNote(cfg.customHeaderNote);
      }
      setIncludeObservations(cfg.includeObservations !== false);
      setIncludeResponsibleContact(cfg.includeResponsibleContact !== false);

      if (cfg.schedule) {
        if (cfg.schedule.diasSemana && cfg.schedule.diasSemana.length > 0) {
          setScheduleDays(cfg.schedule.diasSemana);
        }
        if (cfg.schedule.fechaInicio) setScheduleStartDate(cfg.schedule.fechaInicio);
        if (cfg.schedule.fechaFin) setScheduleEndDate(cfg.schedule.fechaFin);
        if (cfg.schedule.duracionMeses) setScheduleDurationMonths(cfg.schedule.duracionMeses);
        if (cfg.schedule.alcanceActividades) setScheduleScope(cfg.schedule.alcanceActividades === 'proxima_semana' ? 'semana_en_curso' : cfg.schedule.alcanceActividades);
        if (cfg.schedule.diasActividadesEspecificos && cfg.schedule.diasActividadesEspecificos.length > 0) {
          setScheduleSpecificActivityDays(cfg.schedule.diasActividadesEspecificos);
        }
      }
    });
  }, [isOpen, initialFilterMode]);

  // Compute list of selected activity dates based on mode
  const dispatchReferenceDate = getSantiagoDateStr();
  const requestedDates = useMemo<string[]>(() => {
    if (dateMode === 'single') {
      return singleDate ? [singleDate] : [];
    }
    if (dateMode === 'range') {
      if (!rangeStart || !rangeEnd) return [];
      try {
        const weekDates = calculateActivityDatesForDispatchDate(dispatchReferenceDate, 'semana_en_curso');
        const start = parseISO(rangeStart > weekDates[0] ? rangeStart : weekDates[0]);
        const end = parseISO(rangeEnd < weekDates[6] ? rangeEnd : weekDates[6]);
        if (start > end) return [];
        const days = eachDayOfInterval({ start, end });
        return days.map(d => format(d, 'yyyy-MM-dd'));
      } catch {
        return [rangeStart];
      }
    }
    if (dateMode === 'multiple') {
      return [...new Set(multipleDates)].sort();
    }
    if (dateMode === 'weekday_duration') {
      return calculateActivityDatesForDispatchDate(
        dispatchReferenceDate,
        scheduleScope,
        scheduleSpecificActivityDays
      ).filter(date => date >= scheduleStartDate && date <= scheduleEndDate);
    }
    return [];
  }, [
    dispatchReferenceDate,
    dateMode,
    singleDate,
    rangeStart,
    rangeEnd,
    multipleDates,
    scheduleDays,
    scheduleStartDate,
    scheduleEndDate,
    scheduleScope,
    scheduleSpecificActivityDays
  ]);

  const effectiveDates = useMemo(() => filterDatesToDispatchWeek(requestedDates, dispatchReferenceDate), [requestedDates, dispatchReferenceDate]);

  // Scheduled dates when email dispatch will trigger
  const scheduledDispatchDates = useMemo<string[]>(() => {
    return calculateScheduledDates(scheduleDays, scheduleStartDate, scheduleEndDate);
  }, [scheduleDays, scheduleStartDate, scheduleEndDate]);

  // Dynamically extract all available unique activity types from catalog and reservations
  const allDistinctActivityTypes = useMemo(() => {
    const set = new Set<string>();
    if (availableActivityTypes && availableActivityTypes.length > 0) {
      availableActivityTypes.forEach(a => set.add(a.name));
    }
    reservations.forEach(r => {
      if (r.tipoActividad) set.add(r.tipoActividad);
    });
    return Array.from(set).sort();
  }, [availableActivityTypes, reservations]);

  // Filter reservations by selected dates, filter mode (loans or activities), and specific activity types
  const matchingActivities = useMemo<ActivityEmailItem[]>(() => {
    return selectDispatchReservations(reservations, {
      dates: effectiveDates,
      referenceDate: dispatchReferenceDate,
      filterMode: dispatchFilterMode,
      selectedActivityTypes: allActivityTypesSelected ? ['ALL'] : selectedActivityTypes
    })
      .map(r => ({
        id: r.id,
        fecha: r.fecha,
        horaInicio: r.horaInicio,
        horaFin: r.horaFin,
        espacio: r.espacio,
        tipoActividad: r.tipoActividad || 'Actividad',
        tipoPrestamo: r.tipoPrestamo,
        responsable: r.responsable || 'Sin responsable',
        descripcion: r.descripcion || '',
        comentarios: r.comentarios,
        cantidadParticipantes: r.cantidadParticipantes,
        telefonoContacto: r.telefonoContacto,
        emailContacto: r.emailContacto
      }))
      .sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        return a.horaInicio.localeCompare(b.horaInicio);
      });
  }, [reservations, effectiveDates, dispatchReferenceDate, dispatchFilterMode, allActivityTypesSelected, selectedActivityTypes]);

  // Activity Selection State (user can select/deselect individual activities to dispatch)
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);

  // Number of loan activities among candidates
  const totalLoansInMatching = useMemo(() => {
    return matchingActivities.filter(a => isLoanReservation(a)).length;
  }, [matchingActivities]);

  // Preserve explicit exclusions when live reservations refresh.
  const selectionInitialized = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      selectionInitialized.current = false;
      return;
    }
    if (!selectionInitialized.current && matchingActivities.length > 0) {
      selectionInitialized.current = true;
      setSelectedActivityIds(initialReservationId
        ? matchingActivities.filter(a => a.id === initialReservationId).map(a => a.id)
        : matchingActivities.map(a => a.id));
    } else {
      const candidates = new Set(matchingActivities.map(a => a.id));
      setSelectedActivityIds(previous => previous.filter(id => candidates.has(id)));
    }
  }, [matchingActivities, initialReservationId, isOpen]);

  // Subset of activities explicitly selected by user to be sent
  const activitiesToDispatch = useMemo<ActivityEmailItem[]>(() => {
    const selectedSet = new Set(selectedActivityIds);
    return matchingActivities.filter(a => selectedSet.has(a.id));
  }, [matchingActivities, selectedActivityIds]);

  const dispatchDates = useMemo(() => [...new Set(activitiesToDispatch.map(a => a.fecha))].sort(), [activitiesToDispatch]);
  const dispatchReservations = useMemo(() => selectDispatchReservations(reservations, {
    dates: dispatchDates,
    referenceDate: dispatchReferenceDate,
    filterMode: dispatchFilterMode,
    selectedActivityTypes: allActivityTypesSelected ? ['ALL'] : selectedActivityTypes,
    selectedActivityIds
  }), [reservations, dispatchDates, dispatchReferenceDate, dispatchFilterMode, allActivityTypesSelected, selectedActivityTypes, selectedActivityIds]);

  // Group matching activities by date for structured display
  const activitiesByDate = useMemo(() => {
    const map: Record<string, ActivityEmailItem[]> = {};
    matchingActivities.forEach(act => {
      if (!map[act.fecha]) map[act.fecha] = [];
      map[act.fecha].push(act);
    });
    return map;
  }, [matchingActivities]);

  // Activity Selection Handlers
  const handleToggleActivity = (id: string) => {
    setSelectedActivityIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllActivities = () => {
    setSelectedActivityIds(matchingActivities.map(a => a.id));
  };

  const handleSelectOnlyLoans = () => {
    const loanIds = matchingActivities.filter(a => isLoanReservation(a)).map(a => a.id);
    setSelectedActivityIds(loanIds);
  };

  const handleDeselectAllActivities = () => {
    setSelectedActivityIds([]);
  };

  const handleToggleActivitiesForDate = (dateStr: string) => {
    const activitiesForDate = matchingActivities.filter(a => a.fecha === dateStr);
    const dateIds = activitiesForDate.map(a => a.id);
    const allSelected = dateIds.length > 0 && dateIds.every(id => selectedActivityIds.includes(id));
    if (allSelected) {
      setSelectedActivityIds(prev => prev.filter(id => !dateIds.includes(id)));
    } else {
      setSelectedActivityIds(prev => Array.from(new Set([...prev, ...dateIds])));
    }
  };

  // Update default subject dynamically when dates change
  useEffect(() => {
    if (dateMode === 'weekday_duration') {
      const daysNames = (scheduleDays || [1]).map(d => WEEKDAY_LABELS[d]?.name || 'Día').join(', ');
      setSubject(`Actividades Comunitarias - Cada ${daysNames} (${effectiveDates.length} fechas)`);
      return;
    }

    if (effectiveDates.length === 0) {
      setSubject('Actividades Comunitarias');
      return;
    }

    if (effectiveDates.length === 1) {
      try {
        const formatted = format(parseISO(effectiveDates[0]), "EEEE d 'de' MMMM, yyyy", { locale: es });
        const capitalized = formatted.charAt(0).toUpperCase() + formatted.slice(1);
        setSubject(`Actividades ${capitalized}`);
      } catch {
        setSubject(`Actividades Diarias - ${effectiveDates[0]}`);
      }
    } else if (effectiveDates.length === 2) {
      try {
        const d1 = parseISO(effectiveDates[0]);
        const d2 = parseISO(effectiveDates[1]);
        if (d1.getDay() === 6 && d2.getDay() === 0) {
          const m1 = format(d1, "d 'de' MMMM", { locale: es });
          const m2 = format(d2, "d 'de' MMMM, yyyy", { locale: es });
          setSubject(`Actividades Fin de Semana - Sábado ${m1} y Domingo ${m2}`);
        } else {
          const f1 = format(d1, "d 'de' MMMM", { locale: es });
          const f2 = format(d2, "d 'de' MMMM, yyyy", { locale: es });
          setSubject(`Actividades Comunitarias - ${f1} y ${f2}`);
        }
      } catch {
        setSubject(`Actividades Comunitarias (${effectiveDates.length} fechas)`);
      }
    } else {
      const first = effectiveDates[0];
      const last = effectiveDates[effectiveDates.length - 1];
      try {
        const f1 = format(parseISO(first), "d 'de' MMMM", { locale: es });
        const f2 = format(parseISO(last), "d 'de' MMMM, yyyy", { locale: es });
        setSubject(`Actividades Comunitarias - del ${f1} al ${f2}`);
      } catch {
        setSubject(`Actividades Comunitarias (${effectiveDates.length} días)`);
      }
    }
  }, [effectiveDates, dateMode, scheduleDays]);

  // Generate Email Previews with ONLY the selected activities
  const emailContent = useMemo(() => {
    return generateActivitiesEmailContent({
      dates: dispatchDates,
      activities: activitiesToDispatch,
      customNote,
      senderEmail: DEFAULT_GMAIL_SENDER,
      includeObservations,
      includeResponsibleContact
    });
  }, [dispatchDates, activitiesToDispatch, customNote, includeObservations, includeResponsibleContact]);


  // Handle Google Connection
  const handleConnectGoogle = async () => {
    setIsConnecting(true);
    setAuthError(null);
    try {
      await connectGoogleGmailAccount(DEFAULT_GMAIL_SENDER);
    } catch (err: any) {
      setAuthError(err?.message || 'Error al conectar con la cuenta de Google');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try { await disconnectGoogleGmail(); }
    catch (error) { setAuthError((error as Error).message); }
  };

  // Add Recipient
  const handleAddRecipient = () => {
    setRecipientError(null);
    const trimmed = recipientInput.trim().toLowerCase();
    if (!trimmed) return;

    // Support comma or semicolon separated list
    const candidateEmails = trimmed
      .split(/[,;\s]+/)
      .map(e => e.trim())
      .filter(Boolean);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidList = candidateEmails.filter(e => !emailRegex.test(e));

    if (invalidList.length > 0) {
      setRecipientError(`Correo(s) inválido(s): ${invalidList.join(', ')}`);
      return;
    }

    const uniqueNew = candidateEmails.filter(e => !recipients.includes(e));
    if (uniqueNew.length === 0) {
      setRecipientInput('');
      return;
    }

    setRecipients(prev => [...prev, ...uniqueNew]);
    setRecipientInput('');
  };

  const handleRemoveRecipient = (emailToRemove: string) => {
    setRecipients(prev => prev.filter(e => e !== emailToRemove));
  };

  // Add date to multiple list
  const handleAddDateToMultiple = () => {
    if (!datePickerInput) return;
    if (!multipleDates.includes(datePickerInput)) {
      setMultipleDates(prev => [...prev, datePickerInput].sort());
    }
    setDatePickerInput('');
  };

  const handleAddQuickDateToMultiple = (dateToAdd: string) => {
    if (!multipleDates.includes(dateToAdd)) {
      setMultipleDates(prev => [...prev, dateToAdd].sort());
    }
  };

  const handleAddWeekendDateToMultiple = () => {
    const weekend = calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'fin_de_semana');
    setMultipleDates(prev => Array.from(new Set([...prev, ...weekend])).sort());
  };

  const handleRemoveDateFromMultiple = (dateToRemove: string) => {
    if (multipleDates.length <= 1) return;
    setMultipleDates(prev => prev.filter(d => d !== dateToRemove));
  };

  // Quick Date presets
  const handleSetQuickPreset = (preset: 'today' | 'tomorrow' | 'next_saturday' | 'next_sunday' | 'weekend' | 'this_week') => {
    const today = parseISO(getSantiagoDateStr());
    if (preset === 'today') {
      setDateMode('single');
      setSingleDate(format(today, 'yyyy-MM-dd'));
    } else if (preset === 'tomorrow') {
      setDateMode('single');
      setSingleDate(format(addDays(today, 1), 'yyyy-MM-dd'));
    } else if (preset === 'next_saturday') {
      setDateMode('single');
      setSingleDate(calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'siguiente_sabado')[0]);
    } else if (preset === 'next_sunday') {
      setDateMode('single');
      setSingleDate(calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'siguiente_domingo')[0]);
    } else if (preset === 'weekend') {
      setDateMode('multiple');
      setMultipleDates(calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'fin_de_semana'));
    } else if (preset === 'this_week') {
      setDateMode('range');
      const start = startOfWeek(today, { weekStartsOn: 1 });
      const end = endOfWeek(today, { weekStartsOn: 1 });
      setRangeStart(format(start, 'yyyy-MM-dd'));
      setRangeEnd(format(end, 'yyyy-MM-dd'));

    }
  };

  // Schedule / Recurring helper handlers
  const handleToggleScheduleDay = (dayNum: number) => {
    setScheduleDays(prev => {
      if (prev.includes(dayNum)) {
        if (prev.length <= 1) return prev; // Mantener al menos un día
        return prev.filter(d => d !== dayNum);
      }
      return [...prev, dayNum].sort((a, b) => {
        const aNorm = a === 0 ? 7 : a;
        const bNorm = b === 0 ? 7 : b;
        return aNorm - bNorm;
      });
    });
  };

  const handleSetScheduleWeekdayPreset = (preset: 'lunes' | 'viernes' | 'sabado' | 'domingo' | 'fin_de_semana' | 'habiles' | 'todos') => {
    if (preset === 'lunes') setScheduleDays([1]);
    else if (preset === 'viernes') setScheduleDays([5]);
    else if (preset === 'sabado') setScheduleDays([6]);
    else if (preset === 'domingo') setScheduleDays([0]);
    else if (preset === 'fin_de_semana') setScheduleDays([6, 0]);
    else if (preset === 'habiles') setScheduleDays([1, 2, 3, 4, 5]);
    else if (preset === 'todos') setScheduleDays([1, 2, 3, 4, 5, 6, 0]);
  };

  const handleSetScheduleDurationPreset = (months: number | 'endOfYear') => {
    setScheduleDurationMonths(months);
    const base = scheduleStartDate ? parseISO(scheduleStartDate) : new Date();
    if (months === 'endOfYear') {
      setScheduleEndDate(`${base.getFullYear()}-12-31`);
    } else {
      setScheduleEndDate(format(addMonths(base, months), 'yyyy-MM-dd'));
    }
  };

  const handleToggleScheduleSpecificActivityDay = (dayNum: number) => {
    setScheduleSpecificActivityDays(prev => {
      const updated = prev.includes(dayNum) ? prev.filter(d => d !== dayNum) : [...prev, dayNum];
      return updated.length > 0 ? updated : [dayNum];
    });
  };

  // Toggle activity type filter
  const handleToggleActivityType = (type: string) => {
    if (allActivityTypesSelected) {
      setAllActivityTypesSelected(false);
      setSelectedActivityTypes([type]);
      return;
    }

    if (selectedActivityTypes.includes(type)) {
      const next = selectedActivityTypes.filter(t => t !== type);
      setSelectedActivityTypes(next);
    } else {
      setSelectedActivityTypes(prev => [...prev, type]);
    }
  };

  // Save current preferences to Firestore
  const handleSavePreferences = async () => {
    setIsSavingConfig(true);
    const configToSave: GmailDispatchConfig = {
      senderEmail: DEFAULT_GMAIL_SENDER,
      defaultRecipients: recipients,
      dispatchFilterMode,
      selectedActivityTypes: allActivityTypesSelected ? ['ALL'] : selectedActivityTypes,
      subjectTemplate: subject,
      customHeaderNote: customNote,
      includeObservations,
      includeResponsibleContact,
      schedule: {
        enabled: true,
        diasSemana: scheduleDays,
        horaEnvio: '08:30',
        fechaInicio: scheduleStartDate,
        fechaFin: scheduleEndDate,
        duracionMeses: typeof scheduleDurationMonths === 'number' ? scheduleDurationMonths : undefined,
        alcanceActividades: scheduleScope,
        diasActividadesEspecificos: scheduleSpecificActivityDays
      },
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || DEFAULT_GMAIL_SENDER
    };

    const ok = await saveGmailDispatchConfig(configToSave, currentUser?.email || DEFAULT_GMAIL_SENDER);
    setIsSavingConfig(false);
    if (ok) {
      setConfigSavedToast(true);
      setTimeout(() => setConfigSavedToast(false), 3000);
    }
  };

  // Metadata is cheap; document generation happens only in explicit actions.
  const dailyPdfAttachments = useMemo(() => dispatchDates.map(date => {
    const activitiesCount = dispatchReservations.filter(r => r.fecha === date).length;
    return {
      date,
      filename: getDailySchedulePdfFilename(date),
      activitiesCount,
    };
  }), [dispatchDates, dispatchReservations]);

  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const pdfOptions = {
    spaces: availableSpaces,
    onlyOccupiedSpaces: true,
    include3DaysImportant: false,
    customNote,
  };
  const handleDownloadDailyPdf = async (date: string) => {
    if (downloadingPdf) return;
    setDownloadingPdf(date);
    try {
      if (!dispatchDates.includes(date)) throw new Error('El día no tiene actividades seleccionadas.');
      const [item] = await generateDailyPdfsForDates([date], dispatchReservations, pdfOptions);
      item.doc.save(item.filename);
    } catch (error) {
      setSendErrorMessage('No se pudo generar el PDF. Intente nuevamente.');
    } finally {
      setDownloadingPdf(null);
    }
  };

  // Execute Real Gmail Sending
  const handleConfirmSend = async () => {
    if (isSending) return;
    setShowConfirmModal(false);
    setIsSending(true);
    setSendErrorMessage(null);
    setSendSuccessMessage(null);

    try {
      const currentDates = filterDatesToDispatchWeek(dispatchDates);
      if (currentDates.length !== dispatchDates.length || dispatchReservations.length === 0) {
        throw new Error('Selecciona actividades de la semana en curso antes de enviar.');
      }
      const documents = await generateDailyPdfsForDates(currentDates, dispatchReservations, pdfOptions);
      const attachmentsToSend = documents.map(item => ({
        filename: item.filename,
        contentType: 'application/pdf',
        contentBase64: item.base64
      }));

      const result = await sendActivitiesViaGmail({
        from: DEFAULT_GMAIL_SENDER,
        to: recipients,
        subject: subject.trim() || 'Reporte de Actividades Comunitarias',
        htmlBody: emailContent.html,
        textBody: emailContent.text,
        attachments: attachmentsToSend
      });

      if (!result.success) {
        setSendErrorMessage(result.error || 'No se pudo enviar el correo.');
        return;
      }

      setSendSuccessMessage(
        `¡Correo enviado exitosamente a ${recipients.length} destinatario(s) desde ${DEFAULT_GMAIL_SENDER} con ${attachmentsToSend.length} planilla(s) PDF adjunta(s)! (ID: ${result.messageId})`
      );

      // Record in audit log
      recordAuditEntry({
        action: 'UPDATE',
        reservaId: 'GMAIL_DISPATCH',
        reservaTitle: `Despacho Gmail: ${recipients.join(', ')}`,
        user: currentUser || 'Cristian Shute',
        description: `Envío de reporte de actividades vía Gmail API (${DEFAULT_GMAIL_SENDER}) a: ${recipients.join(', ')}. Fechas: ${dispatchDates.join(', ')}. Actividades: ${dispatchReservations.length}. Planillas PDF adjuntas para impresión: ${attachmentsToSend.length}. ID: ${result.messageId}`
      });
    } catch (err: any) {
      setSendErrorMessage(err?.message || 'Error inesperado durante el envío.');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={() => { if (!isSending) onClose(); }}
      id="modal-gmail-dispatch"
      className="fixed inset-0 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
    >
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shadow-inner">
              <Mail className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base sm:text-lg font-bold">Enviar Actividades por Gmail</h2>
                <span className="text-[11px] font-semibold bg-blue-500/30 text-blue-100 border border-blue-400/30 px-2 py-0.5 rounded-full">
                  Gmail API
                </span>
              </div>
              <p className="text-xs text-blue-200/90 mt-0.5">
                Emisor configurado: <strong className="text-white font-mono">{DEFAULT_GMAIL_SENDER}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sender Connection Status Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className={`w-3 h-3 rounded-full ${hasToken ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-amber-500 ring-4 ring-amber-100'}`} />
            <div className="text-xs">
              {hasToken ? (
                <span className="text-slate-700">
                  Conectado con Google: <strong className="text-emerald-700">{googleUser?.email || DEFAULT_GMAIL_SENDER}</strong>
                  <span className="block text-xs text-slate-500">{connectionPersistent ? 'Renovación automática de la autorización' : 'Sesión temporal; se conserva al recargar y requiere reconectar cuando vence'}</span>
                </span>
              ) : (
                <span className="text-slate-600">
                  Requiere autorización de Google para enviar correos desde <strong>{DEFAULT_GMAIL_SENDER}</strong>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!hasToken ? (
              <button
                type="button"
                id="btn-connect-google-gmail"
                onClick={handleConnectGoogle}
                disabled={isConnecting}
                className="min-h-[38px] flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 text-xs font-semibold shadow-2xs transition cursor-pointer disabled:opacity-50"
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
                onClick={handleDisconnectGoogle}
                className="text-xs text-slate-500 hover:text-red-600 underline transition cursor-pointer"
              >
                Desconectar
              </button>
            )}
          </div>
        </div>

        {authError && (
          <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{authError}</span>
          </div>
        )}

        {/* Tab Selector */}
        <div className="px-6 pt-3 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
          <div className="flex space-x-1">
            <button
              type="button"
              onClick={() => setActiveTab('config')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'config'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configuración y Filtros</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-2 text-xs font-bold border-b-2 transition cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'preview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Vista Previa del Correo ({matchingActivities.length})</span>
            </button>
          </div>

          <div className="text-xs text-slate-600 font-semibold bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
            {formatActivitiesInDays(matchingActivities.length, effectiveDates.length)}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'config' ? (
            <div className="space-y-6">
              {/* Section 1: Días Seleccionados */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>1. Días de las Actividades</span>
                  </label>
                  {/* Quick presets */}
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => handleSetQuickPreset('today')}
                      className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 border border-slate-200 text-slate-600 hover:text-blue-700 font-medium transition cursor-pointer"
                    >
                      Hoy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickPreset('tomorrow')}
                      className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 border border-slate-200 text-slate-600 hover:text-blue-700 font-medium transition cursor-pointer"
                    >
                      Mañana
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickPreset('next_saturday')}
                      className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold transition cursor-pointer"
                    >
                      Sábado de esta semana
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickPreset('next_sunday')}
                      className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold transition cursor-pointer"
                    >
                      Domingo de esta semana
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickPreset('weekend')}
                      className="px-2 py-0.5 rounded bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold transition cursor-pointer"
                    >
                      Fin de Semana (Sáb+Dom)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickPreset('this_week')}
                      className="px-2 py-0.5 rounded bg-white hover:bg-blue-50 border border-slate-200 text-slate-600 hover:text-blue-700 font-medium transition cursor-pointer"
                    >
                      Esta Semana
                    </button>
                  </div>
                </div>

                <p className="text-xs text-blue-800">El envío incluye únicamente actividades seleccionadas de la semana en curso (lunes a domingo, hora de Chile). La duración configura futuros despachos; cada envío genera un PDF independiente por día seleccionado.</p>
                {/* Top-Level Mode Tabs: Envío Puntual vs Programación Periódica */}
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 p-1 bg-slate-200/80 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (dateMode === 'weekday_duration') {
                          setDateMode('single');
                        }
                      }}
                      className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                        dateMode !== 'weekday_duration'
                          ? 'bg-white text-blue-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                      }`}
                    >
                      <CalendarDays className="w-4 h-4 text-blue-600" />
                      <span>Envío Puntual (Por Fechas)</span>
                    </button>
                    <button
                      type="button"
                      id="modal-btn-mode-weekday-duration"
                      onClick={() => setDateMode('weekday_duration')}
                      className={`py-2 px-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                        dateMode === 'weekday_duration'
                          ? 'bg-white text-indigo-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/50'
                      }`}
                    >
                      <Repeat className="w-4 h-4 text-indigo-600" />
                      <span>Programación Periódica (Recurrente)</span>
                    </button>
                  </div>

                  {/* Context Banner & Sub-selector for Punctual Mode */}
                  {dateMode !== 'weekday_duration' ? (
                    <div className="space-y-3 pt-1">
                      {/* Sub-modes for Punctual Dispatch */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setDateMode('single')}
                          className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition cursor-pointer ${
                            dateMode === 'single'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Día Específico
                        </button>
                        <button
                          type="button"
                          onClick={() => setDateMode('range')}
                          className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition cursor-pointer ${
                            dateMode === 'range'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Rango de Fechas
                        </button>
                        <button
                          type="button"
                          onClick={() => setDateMode('multiple')}
                          className={`py-2 px-2 text-xs font-semibold rounded-xl border text-center transition cursor-pointer ${
                            dateMode === 'multiple'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Días Específicos ({multipleDates.length})
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-start gap-2.5">
                      <Repeat className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Modo Programación Periódica:</span> Define el día de despacho, meses de cobertura y alcance de actividades para entregas automáticas periódicas.
                      </div>
                    </div>
                  )}
                </div>

                {/* Date Inputs based on mode */}
                {dateMode === 'single' && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-600 mb-1 block">Fecha a enviar:</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={singleDate}
                        onChange={e => setSingleDate(e.target.value)}
                        className="w-full sm:w-64 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                      <button
                        type="button"
                        onClick={() => setSingleDate(calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'siguiente_sabado')[0])}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium transition cursor-pointer"
                      >
                        Próx. Sábado
                      </button>
                      <button
                        type="button"
                        onClick={() => setSingleDate(calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'siguiente_domingo')[0])}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 text-xs font-medium transition cursor-pointer"
                      >
                        Próx. Domingo
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDateMode('multiple');
                          setMultipleDates([calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'siguiente_sabado')[0], calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'siguiente_domingo')[0]]);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition cursor-pointer"
                      >
                        Fin de Semana (Sáb + Dom)
                      </button>
                    </div>
                  </div>
                )}

                {dateMode === 'range' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Desde:</label>
                      <input
                        type="date"
                        value={rangeStart}
                        onChange={e => setRangeStart(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600 mb-1 block">Hasta:</label>
                      <input
                        type="date"
                        value={rangeEnd}
                        onChange={e => setRangeEnd(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                )}

                {dateMode === 'multiple' && (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="date"
                          value={datePickerInput}
                          onChange={e => setDatePickerInput(e.target.value)}
                          className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={handleAddDateToMultiple}
                          disabled={!datePickerInput}
                          className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center space-x-1 shadow-2xs transition cursor-pointer disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Añadir Fecha</span>
                        </button>
                      </div>

                      {/* Quick helpers to accumulate specific days */}
                      <div className="flex flex-wrap items-center gap-1 text-xs">
                        <span className="text-[11px] text-slate-400 mr-0.5">Agregar rápido:</span>
                        <button
                          type="button"
                          onClick={() => handleAddQuickDateToMultiple(calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'siguiente_sabado')[0])}
                          className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold border border-blue-200 transition cursor-pointer"
                        >
                          + Próx. Sábado
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddQuickDateToMultiple(calculateActivityDatesForDispatchDate(getSantiagoDateStr(), 'siguiente_domingo')[0])}
                          className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold border border-blue-200 transition cursor-pointer"
                        >
                          + Próx. Domingo
                        </button>
                        <button
                          type="button"
                          onClick={handleAddWeekendDateToMultiple}
                          className="px-2 py-0.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold border border-indigo-200 transition cursor-pointer"
                        >
                          + Fin de Semana
                        </button>
                      </div>
                    </div>

                    {/* Chips showing added dates */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {multipleDates.map(d => {
                        let dateFormatted = d;
                        try {
                          dateFormatted = format(parseISO(d), "EEE d 'de' MMM", { locale: es });
                        } catch {}
                        const countForDate = reservations.filter(r => r.fecha === d).length;

                        return (
                          <span
                            key={d}
                            className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-800 shadow-2xs"
                          >
                            <span className="capitalize font-semibold text-blue-900">{dateFormatted}</span>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded font-mono">
                              {countForDate} act.
                            </span>
                            {multipleDates.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveDateFromMultiple(d)}
                                className="text-slate-400 hover:text-red-600 transition cursor-pointer ml-1"
                                title="Eliminar fecha"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {dateMode === 'weekday_duration' && (
                  <div className="space-y-4 p-4 bg-blue-50/50 border border-blue-200 rounded-2xl">
                    {/* 1. ¿Qué día de la semana se envía? */}
                    <div className="space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                          <Calendar className="w-4 h-4 text-blue-600" />
                          <span>1. ¿Qué día de la semana se envía?</span>
                        </label>
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleSetScheduleWeekdayPreset('lunes')}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-md font-medium transition cursor-pointer"
                          >
                            Cada Lunes
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetScheduleWeekdayPreset('viernes')}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-md font-medium transition cursor-pointer"
                          >
                            Cada Viernes
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetScheduleWeekdayPreset('sabado')}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-md font-medium transition cursor-pointer"
                          >
                            Cada Sábado
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetScheduleWeekdayPreset('domingo')}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-md font-medium transition cursor-pointer"
                          >
                            Cada Domingo
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetScheduleWeekdayPreset('fin_de_semana')}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-md font-medium transition cursor-pointer"
                          >
                            Fin de Semana
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetScheduleWeekdayPreset('habiles')}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-md font-medium transition cursor-pointer"
                          >
                            Lun a Vie
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetScheduleWeekdayPreset('todos')}
                            className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:text-blue-700 text-slate-600 rounded-md font-medium transition cursor-pointer"
                          >
                            Todos
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                        {[1, 2, 3, 4, 5, 6, 0].map(dayNum => {
                          const info = WEEKDAY_LABELS[dayNum];
                          const isSelected = scheduleDays.includes(dayNum);
                          return (
                            <button
                              key={dayNum}
                              type="button"
                              id={`modal-btn-weekday-${dayNum}`}
                              onClick={() => handleToggleScheduleDay(dayNum)}
                              className={`p-2 rounded-xl border text-center transition cursor-pointer ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600 text-white font-bold shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              <div className="text-xs">{info.short}</div>
                              <div className={`text-[10px] mt-0.5 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                {info.name.slice(0, 3)}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. ¿Por cuánto tiempo se envía? (Duración y Fecha Término) */}
                    <div className="space-y-2 pt-2 border-t border-blue-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                          <CalendarDays className="w-4 h-4 text-blue-600" />
                          <span>2. ¿Por cuánto tiempo se envía? (Duración y Fecha Término)</span>
                        </label>
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          {[
                            { label: '1 Mes', val: 1 },
                            { label: '2 Meses', val: 2 },
                            { label: '3 Meses', val: 3 },
                            { label: '6 Meses', val: 6 },
                            { label: 'Fin de Año', val: 'endOfYear' as const }
                          ].map(p => {
                            const isActive =
                              p.val === 'endOfYear'
                                ? scheduleEndDate.endsWith('-12-31')
                                : scheduleDurationMonths === p.val;
                            return (
                              <button
                                key={p.label}
                                type="button"
                                onClick={() => handleSetScheduleDurationPreset(p.val)}
                                className={`px-2 py-0.5 rounded-md font-medium transition cursor-pointer ${
                                  isActive
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-blue-50'
                                }`}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[11px] font-medium text-slate-600 mb-1 block">
                            Fecha de Inicio:
                          </label>
                          <input
                            type="date"
                            value={scheduleStartDate}
                            onChange={e => setScheduleStartDate(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-slate-600 mb-1 flex items-center justify-between">
                            <span className="font-bold text-blue-900">¿Hasta qué fecha se envía? (Término):</span>
                            <span className="text-[10px] text-blue-600 font-bold">Límite</span>
                          </label>
                          <input
                            type="date"
                            min={scheduleStartDate}
                            value={scheduleEndDate}
                            onChange={e => setScheduleEndDate(e.target.value)}
                            className="w-full px-3 py-1.5 bg-blue-50/80 border border-blue-300 rounded-xl text-xs font-bold text-slate-900 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 3. ¿Qué días de actividades se envían en cada despacho? */}
                    <div className="space-y-2 pt-2 border-t border-blue-100">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                        <label className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                          <Filter className="w-4 h-4 text-blue-600" />
                          <span>3. ¿Qué días de actividades se envían en cada despacho?</span>
                        </label>
                        <span className="text-[11px] text-blue-600 font-semibold">
                          Alcance por cada envío
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {[
                          {
                            id: 'fin_de_semana' as AlcanceActividadesTipo,
                            title: 'Fin de Semana (Sáb + Dom)',
                            badge: 'Recomendado',
                            desc: 'Actividades del sábado y domingo de la semana en curso. Ideal para despachos en viernes.'
                          },
                          {
                            id: 'siguiente_sabado' as AlcanceActividadesTipo,
                            title: 'Sábado de esta semana',
                            badge: 'Solo sábado',
                            desc: 'Envía las actividades programadas para el sábado de la semana en curso.'
                          },
                          {
                            id: 'siguiente_domingo' as AlcanceActividadesTipo,
                            title: 'Domingo de esta semana',
                            badge: 'Solo domingo',
                            desc: 'Envía las actividades programadas para el domingo de la semana en curso.'
                          },
                          {
                            id: 'dia_del_envio' as AlcanceActividadesTipo,
                            title: 'Mismo Día del Envío',
                            badge: 'Día exacto',
                            desc: 'Actividades del mismo día en que sale el correo.'
                          },
                          {
                            id: 'semana_en_curso' as AlcanceActividadesTipo,
                            title: 'Semana en Curso',
                            badge: 'Lun a Dom',
                            desc: 'Consolidado semanal completo de la semana en ejecución.'
                          },
                          {
                            id: 'dias_especificos' as AlcanceActividadesTipo,
                            title: 'Días Específicos Personalizados',
                            badge: 'Tú eliges',
                            desc: 'Selecciona qué días de la semana de actividades se envían cada vez.'
                          }
                        ].map(item => {
                          const isSelected = scheduleScope === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setScheduleScope(item.id)}
                              className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-blue-50/50'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full mb-1">
                                <span className="font-bold text-xs">{item.title}</span>
                                {item.badge && (
                                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                                    isSelected ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-700'
                                  }`}>
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p className={`text-[11px] leading-tight ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                                {item.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      {/* Selector de días de actividades específicos */}
                      {scheduleScope === 'dias_especificos' && (
                        <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-2 mt-2">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                            <span className="text-[11px] font-bold text-slate-800">
                              Selecciona qué días de actividades incluir en cada envío:
                            </span>
                            <div className="flex flex-wrap gap-1 text-[11px]">
                              <button
                                type="button"
                                onClick={() => setScheduleSpecificActivityDays([6, 0])}
                                className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold transition cursor-pointer"
                              >
                                Sábado y Domingo
                              </button>
                              <button
                                type="button"
                                onClick={() => setScheduleSpecificActivityDays([1, 2, 3, 4, 5])}
                                className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold transition cursor-pointer"
                              >
                                Lun a Vie
                              </button>
                              <button
                                type="button"
                                onClick={() => setScheduleSpecificActivityDays([1, 2, 3, 4, 5, 6, 0])}
                                className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold transition cursor-pointer"
                              >
                                Todos
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 pt-1">
                            {[1, 2, 3, 4, 5, 6, 0].map(dayNum => {
                              const info = WEEKDAY_LABELS[dayNum];
                              const isChecked = scheduleSpecificActivityDays.includes(dayNum);
                              return (
                                <button
                                  key={dayNum}
                                  type="button"
                                  onClick={() => handleToggleScheduleSpecificActivityDay(dayNum)}
                                  className={`p-1.5 rounded-lg border text-center transition cursor-pointer ${
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

                    {/* Resumen de cálculo de fechas */}
                    <div className="p-3 bg-white border border-blue-200 rounded-xl space-y-2 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <span className="font-bold text-slate-900 flex items-center space-x-1.5">
                          <Sparkles className="w-4 h-4 text-blue-600" />
                          <span>
                            {scheduledDispatchDates.length} envíos programados (cada{' '}
                            {(scheduleDays || [1]).map(d => WEEKDAY_LABELS[d]?.name || 'Lunes').join(', ')})
                          </span>
                        </span>
                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                          {effectiveDates.length} fechas de actividades incluidas
                        </span>
                      </div>

                      {/* Ejemplo claro del primer envío */}
                      {scheduledDispatchDates.length > 0 && (
                        <div className="p-2 bg-blue-50/70 border border-blue-200 rounded-lg text-[11px] text-slate-700">
                          <strong>Primer envío:</strong> Saldrá el <strong>{formatDateDDMMYYYY(scheduledDispatchDates[0])}</strong> e incluirá las actividades del:{' '}
                          <span className="font-bold text-blue-900">
                            {calculateActivityDatesForDispatchDate(
                              scheduledDispatchDates[0],
                              scheduleScope,
                              scheduleSpecificActivityDays
                            )
                              .map(formatDateDDMMYYYY)
                              .join(', ') || 'Sin fechas'}
                          </span>
                        </div>
                      )}

                      <div>
                        <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                          Fechas de actividades a despachar:
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                          {effectiveDates.slice(0, 12).map(d => (
                            <span
                              key={d}
                              className="px-2 py-0.5 bg-blue-50 border border-blue-100 rounded-md text-[11px] font-medium text-blue-800"
                            >
                              {formatDateDDMMYYYY(d)}
                            </span>
                          ))}
                          {effectiveDates.length > 12 && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[11px] font-semibold">
                              +{effectiveDates.length - 12} más
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Filtro de Contenido (Solo Préstamos / Actividades Seleccionadas) */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
                      <Tag className="w-4 h-4 text-blue-600" />
                      <span>2. Filtro de Contenido del Correo</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Elige si el correo y las planillas PDF se envían <strong>solo para préstamos</strong> o para actividades específicas.
                    </p>
                  </div>
                </div>

                {/* Filter Mode Selector Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setDispatchFilterMode('solo_prestamos')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      dispatchFilterMode === 'solo_prestamos'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Solo Préstamos</span>
                      </span>
                      {dispatchFilterMode === 'solo_prestamos' && (
                        <Check className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <span className={`text-[10px] mt-1 ${dispatchFilterMode === 'solo_prestamos' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Solo reservas de préstamos
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDispatchFilterMode('prestamos_y_seleccionadas')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      dispatchFilterMode === 'prestamos_y_seleccionadas'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1">
                        <BookmarkCheck className="w-3.5 h-3.5" />
                        <span>Préstamos + Selección</span>
                      </span>
                      {dispatchFilterMode === 'prestamos_y_seleccionadas' && (
                        <Check className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <span className={`text-[10px] mt-1 ${dispatchFilterMode === 'prestamos_y_seleccionadas' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Préstamos y tipos marcados
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDispatchFilterMode('actividades_seleccionadas')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      dispatchFilterMode === 'actividades_seleccionadas'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1">
                        <Filter className="w-3.5 h-3.5" />
                        <span>Solo Selección</span>
                      </span>
                      {dispatchFilterMode === 'actividades_seleccionadas' && (
                        <Check className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <span className={`text-[10px] mt-1 ${dispatchFilterMode === 'actividades_seleccionadas' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Solo tipos marcados abajo
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDispatchFilterMode('todas')}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      dispatchFilterMode === 'todas'
                        ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Todas</span>
                      </span>
                      {dispatchFilterMode === 'todas' && (
                        <Check className="w-3.5 h-3.5 text-white" />
                      )}
                    </div>
                    <span className={`text-[10px] mt-1 ${dispatchFilterMode === 'todas' ? 'text-blue-100' : 'text-slate-400'}`}>
                      Sin filtro por categoría
                    </span>
                  </button>
                </div>

                {/* Sub-selector of activity types when not purely solo_prestamos */}
                {dispatchFilterMode !== 'solo_prestamos' && (
                  <div className="pt-2 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700">
                        Tipos de Actividades Específicas:
                      </span>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAllActivityTypesSelected(true);
                            setSelectedActivityTypes([]);
                          }}
                          className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline"
                        >
                          Seleccionar Todos
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAllActivityTypesSelected(true);
                          setSelectedActivityTypes([]);
                        }}
                        className={`flex items-center justify-between p-2 rounded-xl border text-xs font-semibold transition cursor-pointer text-left ${
                          allActivityTypesSelected
                            ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span>Todos los Tipos</span>
                        {allActivityTypesSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>

                      {allDistinctActivityTypes.map(type => {
                        const isSelected = !allActivityTypesSelected && selectedActivityTypes.includes(type);
                        return (
                          <button
                            key={type}
                            type="button"
                            onClick={() => handleToggleActivityType(type)}
                            className={`flex items-center justify-between p-2 rounded-xl border text-xs font-semibold transition cursor-pointer text-left truncate ${
                              isSelected
                                ? 'bg-blue-50 border-blue-400 text-blue-800 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                            title={type}
                          >
                            <span className="truncate">{type}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Selección de Actividades a Enviar */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                      <span>3. Selección de Actividades a Enviar</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Marca o desmarca las actividades que deseas incluir en este correo.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-100/70 text-blue-800 border border-blue-200">
                      {activitiesToDispatch.length} de {matchingActivities.length} seleccionadas
                    </span>

                    {totalLoansInMatching > 0 && (
                      <button
                        type="button"
                        id="btn-select-only-loans"
                        onClick={handleSelectOnlyLoans}
                        className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition cursor-pointer flex items-center space-x-1"
                        title="Marcar únicamente las reservas catalogadas como préstamos"
                      >
                        <Building2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Solo Préstamos ({totalLoansInMatching})</span>
                      </button>
                    )}

                    <button
                      type="button"
                      id="btn-select-all-activities"
                      onClick={handleSelectAllActivities}
                      disabled={matchingActivities.length === 0 || activitiesToDispatch.length === matchingActivities.length}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      id="btn-deselect-all-activities"
                      onClick={handleDeselectAllActivities}
                      disabled={activitiesToDispatch.length === 0}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-red-50 hover:text-red-700 hover:border-red-300 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Ninguna
                    </button>
                  </div>
                </div>

                {matchingActivities.length === 0 ? (
                  <div className="p-4 bg-white border border-dashed border-slate-300 rounded-xl text-center space-y-1 text-xs text-slate-500">
                    <Calendar className="w-5 h-5 text-slate-400 mx-auto" />
                    <p className="font-semibold text-slate-700">No hay actividades registradas</p>
                    <p>No se encontraron reservas para las fechas o categorías seleccionadas.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {Object.entries(activitiesByDate).map(([dateStr, dateActs]) => {
                      let dateHeaderFormatted = dateStr;
                      try {
                        dateHeaderFormatted = format(parseISO(dateStr), "EEEE d 'de' MMMM, yyyy", { locale: es });
                      } catch {}

                      const selectedCountInDate = dateActs.filter(a => selectedActivityIds.includes(a.id)).length;
                      const allInDateSelected = selectedCountInDate === dateActs.length;

                      return (
                        <div key={dateStr} className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-2xs">
                          {/* Header for this date */}
                          <div className="bg-slate-100/80 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <CalendarDays className="w-4 h-4 text-blue-600" />
                              <span className="text-xs font-bold text-slate-800 capitalize">
                                {dateHeaderFormatted}
                              </span>
                              <span className="text-[11px] font-medium text-slate-500">
                                ({selectedCountInDate}/{dateActs.length} sel.)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleActivitiesForDate(dateStr)}
                              className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                            >
                              {allInDateSelected ? 'Desmarcar día' : 'Marcar todo el día'}
                            </button>
                          </div>

                          {/* List of activity cards */}
                          <div className="divide-y divide-slate-100">
                            {dateActs.map(act => {
                              const isChecked = selectedActivityIds.includes(act.id);
                              return (
                                <div
                                  key={act.id}
                                  id={`activity-item-${act.id}`}
                                  onClick={() => handleToggleActivity(act.id)}
                                  className={`p-3 transition cursor-pointer flex items-start space-x-3 select-none ${
                                    isChecked
                                      ? 'bg-blue-50/40 hover:bg-blue-50/70'
                                      : 'bg-white hover:bg-slate-50 opacity-60'
                                  }`}
                                >
                                  <div className="pt-0.5">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}} // toggled by parent onClick
                                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer pointer-events-none"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[11px] font-bold font-mono">
                                        {act.horaInicio} - {act.horaFin}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-[11px] font-bold">
                                        {formatDisplayTitle(act.espacio)}
                                      </span>
                                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-semibold">
                                        {formatDisplayTitle(act.tipoActividad)}
                                      </span>
                                      {isLoanReservation(act) && (
                                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 border border-emerald-200 text-emerald-800 text-[10px] font-bold flex items-center gap-1 shadow-2xs">
                                          <Building2 className="w-3 h-3 text-emerald-700" />
                                          <span>Préstamo {act.tipoPrestamo ? `(${formatDisplayTitle(act.tipoPrestamo)})` : ''}</span>
                                        </span>
                                      )}
                                      {act.cantidadParticipantes && (
                                        <span className="text-[10px] text-slate-500">
                                          👥 {act.cantidadParticipantes} pers.
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-800 font-medium">
                                      {act.descripcion ? (
                                        <span>{formatDisplayTitle(act.descripcion)}</span>
                                      ) : (
                                        <span className="text-slate-500 italic">Sin descripción</span>
                                      )}
                                      <span className="text-slate-500 font-normal"> — Resp: <strong className="text-slate-700">{formatDisplayTitle(act.responsable)}</strong></span>
                                    </div>
                                    {(act.telefonoContacto || act.emailContacto) && (
                                      <div className="text-[11px] text-slate-500">
                                        📞 {[act.telefonoContacto, act.emailContacto].filter(Boolean).join(' • ')}
                                      </div>
                                    )}
                                    {act.comentarios && (
                                      <div className="text-[11px] text-amber-800 bg-amber-50/70 border border-amber-200/60 rounded px-2 py-0.5 inline-block">
                                        💬 {act.comentarios}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {matchingActivities.length > 0 && activitiesToDispatch.length === 0 && (
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center space-x-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      No has seleccionado ninguna actividad. Marca las casillas de las actividades que deseas enviar por correo.
                    </span>
                  </div>
                )}
              </div>

              {/* Section 4: Correos Destinatarios */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                    <Users className="w-4 h-4 text-blue-600" />
                    <span>4. Correos Destinatarios ({recipients.length})</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!recipients.includes(DEFAULT_GMAIL_SENDER)) {
                        setRecipients(prev => [DEFAULT_GMAIL_SENDER, ...prev]);
                      }
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    + Añadir mi correo
                  </button>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="email"
                    id="input-gmail-recipient"
                    placeholder="Escribe un correo o varios separados por coma..."
                    value={recipientInput}
                    onChange={e => setRecipientInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRecipient();
                      }
                    }}
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    id="btn-add-recipient"
                    onClick={handleAddRecipient}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition cursor-pointer"
                  >
                    Añadir
                  </button>
                </div>

                {recipientError && (
                  <p className="text-xs text-red-600 font-medium">{recipientError}</p>
                )}

                {/* Recipient Chips */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {recipients.map(email => (
                    <span
                      key={email}
                      className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-800 shadow-2xs"
                    >
                      <Mail className="w-3 h-3 text-slate-400" />
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(email)}
                        className="text-slate-400 hover:text-red-600 transition cursor-pointer ml-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Section 5: Asunto y Opciones Adicionales */}
              <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4.5 space-y-3.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <span>5. Asunto y Mensaje</span>
                </label>

                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Asunto del Correo:</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="Asunto del correo..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">
                    Nota introductoria / Saludo personalizado (opcional):
                  </label>
                  <textarea
                    value={customNote}
                    onChange={e => setCustomNote(e.target.value)}
                    rows={2}
                    placeholder="Ej: Estimados, adjuntamos la nómina de actividades coordinadas para los próximos días..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-normal text-slate-800 shadow-2xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden resize-none"
                  />
                </div>

                <div className="flex flex-wrap gap-4 pt-1 text-xs">
                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeResponsibleContact}
                      onChange={e => setIncludeResponsibleContact(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="font-medium text-slate-700">Incluir contacto del responsable (teléfono / email)</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeObservations}
                      onChange={e => setIncludeObservations(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="font-medium text-slate-700">Incluir observaciones / comentarios</span>
                  </label>
                </div>
              </div>
            </div>
          ) : (
            /* Email Live Preview Tab */
            <div className="space-y-4">
              <div className="bg-slate-100 p-3.5 rounded-xl text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2 border border-slate-200">
                <div className="space-y-0.5">
                  <div>
                    <strong>De:</strong> {DEFAULT_GMAIL_SENDER} &nbsp;|&nbsp; <strong>Para:</strong>{' '}
                    {recipients.join(', ') || 'Sin destinatarios'}
                  </div>
                  <div>
                    <strong>Asunto:</strong> {subject}
                  </div>
                  <div className="text-[11px] text-blue-700 font-semibold pt-0.5">
                    ✓ {activitiesToDispatch.length} actividad(es) seleccionada(s) para este envío ({effectiveDates.length} días)
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('config')}
                    className="text-xs font-semibold px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-blue-700 hover:bg-blue-50 transition cursor-pointer shadow-2xs"
                  >
                    Personalizar Selección ({activitiesToDispatch.length}/{matchingActivities.length})
                  </button>
                </div>
              </div>

              {/* Planillas PDF Oficiales Adjuntas (Una por cada día para imprimir) */}
              <div className="bg-slate-50 border border-blue-200/80 rounded-xl p-3.5 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                  <div className="flex items-center space-x-2">
                    <FileText className="w-4 h-4 text-blue-700 shrink-0" />
                    <span className="text-xs font-bold text-slate-800">
                      Planillas PDF Oficiales Adjuntas ({dailyPdfAttachments.length} archivo{dailyPdfAttachments.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-blue-800 bg-blue-100/70 px-2 py-0.5 rounded-md border border-blue-200 self-start sm:self-auto">
                    Hoja: 8.5" × 13" horizontal • 1 por día
                  </span>
                </div>

                <p className="text-[11px] text-slate-600">
                  El correo adjuntará automáticamente una planilla PDF vectorizada en <strong>hoja de 8.5" × 13" (Oficio), horizontal</strong> por cada día que se envíe con el fin de imprimir directamente en portería/administración:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {dailyPdfAttachments.map(item => (
                    <div
                      key={item.date}
                      className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="min-w-0 flex items-center space-x-2">
                        <Printer className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-800 truncate" title={item.filename}>
                            {item.filename}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {formatDateDDMMYYYY(item.date)} • {item.activitiesCount} actividades
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={downloadingPdf !== null}
                        onClick={() => void handleDownloadDailyPdf(item.date)}
                        className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md text-[11px] font-semibold border border-blue-200 shrink-0 flex items-center space-x-1 cursor-pointer transition"
                        title="Descargar PDF para verificar cómo se imprimirá"
                      >
                        <Download className="w-3 h-3" />
                        <span>{downloadingPdf === item.date ? 'Generando…' : 'Descargar'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-inner">
                <div
                  className="p-4 overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: emailContent.html }}
                />
              </div>
            </div>
          )}

          {/* Toast / Status Notifications */}
          {sendSuccessMessage && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start space-x-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">¡Envío Exitoso!</strong>
                <span>{sendSuccessMessage}</span>
              </div>
            </div>
          )}

          {sendErrorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start space-x-2.5">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Error en el envío</strong>
                <span>{sendErrorMessage}</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSavePreferences}
              disabled={isSavingConfig}
              className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold shadow-2xs transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
              title="Guarda destinatarios frecuentes y filtros para futuros envíos"
            >
              {isSavingConfig ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              )}
              <span>Guardar como Predeterminado</span>
            </button>
            {configSavedToast && (
              <span className="text-xs font-semibold text-emerald-700 animate-in fade-in">
                ✓ Configuración guardada
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              id="btn-trigger-gmail-send"
              disabled={isSending || recipients.length === 0 || effectiveDates.length === 0 || activitiesToDispatch.length === 0}
              onClick={() => {
                if (!hasToken) {
                  handleConnectGoogle();
                  return;
                }
                setShowConfirmModal(true);
              }}
              className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer flex items-center space-x-2 disabled:opacity-50"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              <span>
                {!hasToken ? 'Conectar y Enviar por Gmail' : `Enviar por Gmail (${activitiesToDispatch.length} act.)`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Mandatory User Confirmation Dialog according to Google Workspace guidelines */}
      {showConfirmModal && (
        <ModalOverlay onClose={() => { if (!isSending) setShowConfirmModal(false); }} className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  ¿Confirmas el envío de este correo desde Gmail?
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Se enviará un correo electrónico oficial mediante la API de Google Workspace.
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Cuenta emisora:</span>
                <strong className="text-slate-800 font-mono">{DEFAULT_GMAIL_SENDER}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Destinatarios:</span>
                <strong className="text-slate-800">{recipients.length} correo(s)</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Actividades incluidas:</span>
                <strong className="text-blue-700">{activitiesToDispatch.length} actividades seleccionadas</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Días abarcados:</span>
                <strong className="text-slate-800">{dispatchDates.length} día(s)</strong>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                id="btn-confirm-send-gmail-api"
                onClick={handleConfirmSend}
                className="min-h-[40px] px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer flex items-center space-x-1.5"
              >
                <Send className="w-4 h-4" />
                <span>Confirmar y Enviar</span>
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </ModalOverlay>
  );
};
