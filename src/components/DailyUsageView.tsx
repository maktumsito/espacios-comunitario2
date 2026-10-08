import { NotificationPortal } from './common/NotificationPortal';
import { useTimelineViewport, intersectsViewport } from '../hooks/useTimelineViewport';
import React, { useState, useMemo, useEffect, useRef, Suspense, useCallback } from 'react';
import { Reservation, SpaceInfo, FilterState, SpaceBlock } from '../types';
import { SPACES_LIST, normalizeSpaceName } from '../data/spacesData';
import { timeToMinutes, formatMinutesToTime, getConflictReservationIds, doSpacesConflict, isReservationActiveForAvailability } from '../utils/conflictDetector';
import { getChileanHolidayInfo } from '../utils/holidayUtils';
import {
  Calendar as CalendarIcon,
  Printer,
  Plus,
  Flame,
  Search,
  X,
  AlertTriangle,
  Edit2,
  Trash2,
  GripVertical,
  Check,
  Star,
  Copy,
  Filter,
  RotateCcw,
  Hammer,
  ChevronLeft,
  ChevronRight,
  User,
  Clock,
  Phone,
  MapPin,
  Mail
} from 'lucide-react';
import {
  format,
  addDays,
  subDays,
  parseISO,
  isSameDay,
  isWithinInterval,
  startOfDay,
  endOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { validateStrictCalendarDate, clampAndFixCalendarDate } from '../utils/validationUtils';
import { useReservationDateIndex } from '../utils/reservationIndex';
import { formatActivitiesCount } from '../utils/pluralUtils';
import { getReservationTypeVisual, formatDisplayTitle } from '../utils/reservationVisuals';

const PrintScheduleModal = React.lazy(() =>
  import('./PrintScheduleModal').then((m) => ({ default: m.PrintScheduleModal }))
);

interface DailyUsageViewProps {
  reservations: Reservation[];
  allReservations?: Reservation[];
  conflictReservationIds?: Set<string>;
  spaceBlocks?: readonly SpaceBlock[];
  globalFilters?: FilterState;
  onFilterChange?: (filters: FilterState) => void;
  onClearGlobalFilters?: () => void;
  spaces?: SpaceInfo[];
  selectedDate?: Date;
  initialDate?: Date;
  onSelectReservation: (reserva: Reservation) => void;
  onEditReservation?: (reserva: Reservation) => void;
  onDuplicateReservation?: (reserva: Reservation) => void;
  onDeleteReservation?: (id: string, isSeries?: boolean, seriesId?: string) => void;
  onRequestDelete?: (reserva: Reservation) => void;
  onNewReservationWithSlot: (space: string, date: string, startTime: string, endTime: string) => void;
  onUpdateReservation?: (reserva: Reservation) => Promise<boolean | void> | boolean | void;
  onReorderSpaces?: (spaces: SpaceInfo[]) => void;
  onNavigateToMaintenance?: () => void;
  onDateChange?: (date: Date) => void;
}

// Default ordered space list matching the user's required canonical layout:
// Auditorio, Gimnasio, Sala Espejos, Tatami, Sala 2, Sala 3, Sala 4, Sala 5, Sala 6, Biblioteca, Patio Exterior, Cocina, Multicancha, Box 1
const DEFAULT_ORDERED_SPACES: string[] = [
  'AUDITORIO',
  'GIMNASIO',
  'SALA DE ESPEJOS',
  'TATAMI',
  'SALA 2',
  'SALA 3',
  'SALA 4',
  'SALA 5',
  'SALA 6',
  'BIBLIOTECA',
  'PATIO EXTERIOR',
  'COCINA',
  'MULTICANCHA',
  'BOX 1'
];

const DailyUsageViewComponent: React.FC<DailyUsageViewProps> = ({
  reservations,
  allReservations,
  conflictReservationIds,
  spaceBlocks = [],
  globalFilters,
  onFilterChange,
  onClearGlobalFilters,
  spaces = SPACES_LIST,
  selectedDate: propSelectedDate,
  initialDate,
  onSelectReservation,
  onEditReservation,
  onDuplicateReservation,
  onDeleteReservation,
  onRequestDelete,
  onNewReservationWithSlot,
  onUpdateReservation,
  onReorderSpaces,
  onNavigateToMaintenance,
  onDateChange
}) => {
  // Single controlled source of truth for the active date rendering the agenda.
  // Supports both controlled mode (via propSelectedDate) and uncontrolled mode (via initialDate).
  const [currentDate, setCurrentDate] = useState<Date>(() => propSelectedDate || initialDate || new Date());

  // Synchronize internal state when propSelectedDate changes from parent
  useEffect(() => {
    if (propSelectedDate) {
      setCurrentDate(propSelectedDate);
    }
  }, [propSelectedDate]);

  // Synchronize internal state if initialDate changes while propSelectedDate is not provided
  useEffect(() => {
    if (initialDate && !propSelectedDate) {
      setCurrentDate(initialDate);
    }
  }, [initialDate, propSelectedDate]);

  // The active date rendering the agenda is currentDate
  const selectedDate = currentDate;
  const [searchQuery, setSearchQuery] = useState<string>(() => globalFilters?.search || '');
  const [dateErrorMessage, setDateErrorMessage] = useState<string | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<{ space: string; hour: number } | null>(null);
  const [hoveredCardInfo, setHoveredCardInfo] = useState<{
    res: Reservation;
    rect: DOMRect;
    isConflict: boolean;
  } | null>(null);

  const getHoverPopupStyle = useCallback((rect: DOMRect): React.CSSProperties => {
    const popupWidth = 280;
    const popupEstimatedHeight = 240;
    const padding = 12;

    let left = rect.right + 10;
    if (left + popupWidth > window.innerWidth - padding) {
      left = rect.left - popupWidth - 10;
    }
    if (left < padding) {
      left = Math.max(padding, window.innerWidth - popupWidth - padding);
    }

    let top = rect.top - 6;
    if (top + popupEstimatedHeight > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - popupEstimatedHeight - padding);
    }
    if (top < padding) {
      top = padding;
    }

    return {
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${popupWidth}px`,
      // Passive previews stay below modal windows and status notifications.
      zIndex: 50,
      pointerEvents: 'none',
    };
  }, []);

  const updateSelectedDate = useCallback((newDate: Date) => {
    setCurrentDate(newDate);
    onDateChange?.(newDate);
  }, [onDateChange]);

  // Drag & Drop State for Reservations
  const [draggedReservation, setDraggedReservation] = useState<Reservation | null>(null);
  const [dragTargetInfo, setDragTargetInfo] = useState<{
    spaceName: string;
    startMinutes: number;
    endMinutes: number;
    startTime: string;
    endTime: string;
    hasConflict?: boolean;
    conflictDetails?: string;
    isBlocked?: boolean;
    blockReason?: string;
  } | null>(null);
  const [dragOverHeaderSpace, setDragOverHeaderSpace] = useState<string | null>(null);

  // Drag & Drop State for Space Columns Reordering
  const [draggedHeaderIndex, setDraggedHeaderIndex] = useState<number | null>(null);
  const [dragOverHeaderIndex, setDragOverHeaderIndex] = useState<number | null>(null);

  // State to enable/disable reordering spaces (locked by default to prevent accidental dragging)
  const [allowSpaceReorder, setAllowSpaceReorder] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('allow_reorder_spaces');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleSync = (e: Event) => {
      const customEvent = e as CustomEvent<boolean>;
      if (typeof customEvent.detail === 'boolean') {
        setAllowSpaceReorder(customEvent.detail);
      }
    };
    window.addEventListener('app_spaces_reorder_toggled', handleSync);
    return () => window.removeEventListener('app_spaces_reorder_toggled', handleSync);
  }, []);

  // Local state for spaces columns to allow 0ms instantaneous ("altiro") reordering
  const [localSpaces, setLocalSpaces] = useState<SpaceInfo[]>(() => (spaces && spaces.length > 0 ? spaces : SPACES_LIST));

  useEffect(() => {
    if (spaces && spaces.length > 0) {
      setLocalSpaces(spaces);
    }
  }, [spaces]);

  // Notification feedback banner
  const [toastMessage, setToastMessage] = useState<{ text: string; sub?: string } | null>(null);

  // Print PDF Preview Modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);

  // Clear toast after 3.5s

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const isToday = isSameDay(selectedDate, new Date());

  // High-performance pre-indexed date map: O(1) day retrieval
  const reservationIndex = useReservationDateIndex(reservations);
  const rawDayReservations = useMemo(() => {
    return reservationIndex.get(dateStr) || [];
  }, [reservationIndex, dateStr]);

  // Dynamic hours: baseline 08:00 - 22:00, automatically expanding earlier (down to 06:00) or later (up to 24:00)
  // when reservations are authorized outside regular operating hours
  const { startHour, endHour } = useMemo(() => {
    let minH = 8;
    let maxH = 22;
    for (const r of rawDayReservations) {
      const isOvernight = Boolean(r.terminaDiaSiguiente) || (timeToMinutes(r.horaFin) <= timeToMinutes(r.horaInicio) && timeToMinutes(r.horaFin) > 0);
      const isSecondDay = isOvernight && r.fecha !== dateStr;
      const sMin = isSecondDay ? 0 : timeToMinutes(r.horaInicio);
      const eMin = (isOvernight && !isSecondDay) ? (24 * 60) : timeToMinutes(r.horaFin);

      if (sMin >= 0) {
        const sHour = Math.floor(sMin / 60);
        if (sHour < minH) minH = Math.max(0, sHour);
      }
      if (eMin > 0) {
        const eHour = Math.ceil(eMin / 60);
        if (eHour > maxH) maxH = Math.min(24, eHour);
      }
    }
    return { startHour: minH, endHour: maxH };
  }, [rawDayReservations, dateStr]);

  // Vista compacta de fábrica (optimizada para máxima visibilidad horizontal y vertical)
  const isCompact = true;
  const START_HOUR = startHour;
  const END_HOUR = endHour;
  const HOUR_HEIGHT = 56; // px per hour (compacta de fábrica)
  const START_MINUTES = START_HOUR * 60;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const TOTAL_MINUTES = TOTAL_HOURS * 60;
  const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

  // Calculate important reservations from 3 days prior
  const upcomingImportant3Days = useMemo(() => {
    try {
      const start = startOfDay(selectedDate);
      const end = endOfDay(addDays(selectedDate, 3));
      return reservations.filter((r) => {
        if (r.importante !== 'Sí') return false;
        if (!r.fecha) return false;
        const rDate = parseISO(r.fecha);
        if (isNaN(rDate.getTime())) return false;
        return isWithinInterval(rDate, { start, end });
      });
    } catch {
      return [];
    }
  }, [reservations, selectedDate]);


  // Fixed simulated current time for demo matching screenshot (15:06) or real local time
  const [currentTimeMinutes, setCurrentTimeMinutes] = useState<number>(15 * 60 + 6); // 15:06 = 906 mins

  useEffect(() => {
    // If viewing real today, calculate current minutes
    const now = new Date();
    if (isSameDay(selectedDate, now)) {
      const updateNow = () => {
        const n = new Date();
        setCurrentTimeMinutes(n.getHours() * 60 + n.getMinutes());
      };
      updateNow();
      const interval = setInterval(updateNow, 60000);
      return () => clearInterval(interval);
    } else {
      // Default to 15:06 as in screenshot
      setCurrentTimeMinutes(15 * 60 + 6);
    }
  }, [selectedDate]);

  // Current time formatted
  const currentTimeFormatted = useMemo(() => {
    const h = Math.floor(currentTimeMinutes / 60);
    const m = currentTimeMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [currentTimeMinutes]);

  // Current time top position
  const currentTimeTop = useMemo(() => {
    if (currentTimeMinutes < START_MINUTES || currentTimeMinutes > START_MINUTES + TOTAL_MINUTES) {
      return null;
    }
    return ((currentTimeMinutes - START_MINUTES) / 60) * HOUR_HEIGHT;
  }, [currentTimeMinutes, START_MINUTES, TOTAL_MINUTES, HOUR_HEIGHT]);

  // Hour slots array: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
  const hourSlots = useMemo(() => {
    const slots: number[] = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      slots.push(h);
    }
    return slots;
  }, [START_HOUR, END_HOUR]);

  // Synchronize local search state with shared globalFilters
  useEffect(() => {
    if (globalFilters?.search !== undefined && globalFilters.search !== searchQuery) {
      setSearchQuery(globalFilters.search);
    }
  }, [globalFilters?.search]);

  // Debounced propagation of search changes to globalFilters
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onFilterChange && globalFilters && globalFilters.search !== searchQuery) {
        onFilterChange({ ...globalFilters, search: searchQuery });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery, globalFilters, onFilterChange]);

  // Handle search changes in DailyUsageView
  const handleDailySearchChange = (val: string) => {
    setSearchQuery(val);
  };

  // Clear all filters handler (recovering all hidden activities)
  const handleClearAllFilters = () => {
    setSearchQuery('');
    if (onClearGlobalFilters) {
      onClearGlobalFilters();
    } else if (onFilterChange && globalFilters) {
      onFilterChange({
        ...globalFilters,
        search: '',
        espacio: '',
        tipoActividad: '',
        fechaDesde: '',
        fechaHasta: '',
        soloRecurrentes: false,
        soloImportantes: false,
        soloConTopamiento: false
      });
    }
  };

  // Total unfiltered reservations registered for this day (retrieved directly from index)
  const allReservationsForToday = useMemo(() => {
    return rawDayReservations;
  }, [rawDayReservations]);

  // Detect whether any global or local filter is currently active
  const hasActiveGlobalFilters = useMemo(() => {
    if (!globalFilters) return Boolean(searchQuery.trim());
    return (
      Boolean(globalFilters.search?.trim()) ||
      Boolean(globalFilters.espacio) ||
      Boolean(globalFilters.tipoActividad) ||
      Boolean(globalFilters.fechaDesde) ||
      Boolean(globalFilters.fechaHasta) ||
      Boolean(globalFilters.soloRecurrentes) ||
      Boolean(globalFilters.soloImportantes) ||
      Boolean(globalFilters.soloConTopamiento) ||
      Boolean(searchQuery.trim())
    );
  }, [globalFilters, searchQuery]);

  // User-friendly descriptions of active filters
  const activeFilterDescriptions = useMemo(() => {
    const list: string[] = [];
    if (globalFilters?.search?.trim()) list.push(`Búsqueda: "${globalFilters.search.trim()}"`);
    else if (searchQuery.trim()) list.push(`Búsqueda: "${searchQuery.trim()}"`);
    if (globalFilters?.espacio) list.push(`Espacio: ${globalFilters.espacio}`);
    if (globalFilters?.tipoActividad) list.push(`Tipo: ${globalFilters.tipoActividad}`);
    if (globalFilters?.soloImportantes) list.push(`Solo Importantes`);
    if (globalFilters?.soloRecurrentes) list.push(`Series Recurrentes`);
    if (globalFilters?.soloConTopamiento) list.push(`Con Topamiento`);
    return list;
  }, [globalFilters, searchQuery]);

  // Filter reservations for current day (operating only on day's reservations)
  const dayReservations = useMemo(() => {
    if (!searchQuery.trim()) {
      return rawDayReservations;
    }
    const q = searchQuery.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return rawDayReservations.filter((r) => {
      const normDesc = (r.descripcion || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normResp = (r.responsable || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normEsp = (r.espacio || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const normTipo = (r.tipoActividad || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return normDesc.includes(q) || normResp.includes(q) || normEsp.includes(q) || normTipo.includes(q);
    });
  }, [rawDayReservations, searchQuery]);

  // Normalize, map and assemble spaces preserving user's customized column order (respecting active space filters)
  const activeSpaces = useMemo(() => {
    let list: SpaceInfo[] = [...(localSpaces && localSpaces.length > 0 ? localSpaces : (spaces && spaces.length > 0 ? spaces : SPACES_LIST))];

    // Check if day reservations have any space not in list
    const knownSpaces = new Set(list.map((s) => normalizeSpaceName(s.name)));
    dayReservations.forEach((r) => {
      const norm = normalizeSpaceName(r.espacio);
      if (norm && !knownSpaces.has(norm)) {
        knownSpaces.add(norm);
        list.push({
          id: norm,
          name: norm,
          capacity: 20,
          category: 'Salas de Clases',
          iconName: 'Layers',
          color: '#6366f1',
          description: norm
        });
      }
    });

    // If global space filter is active, filter space list
    if (globalFilters?.espacio && globalFilters.espacio.trim()) {
      const filterNorm = normalizeSpaceName(globalFilters.espacio);
      const filtered = list.filter((s) => normalizeSpaceName(s.name) === filterNorm);
      if (filtered.length > 0) {
        list = filtered;
      }
    }

    // Do NOT force hardcoded sort: preserves user's chosen column order exactly!
    return list;
  }, [localSpaces, spaces, dayReservations, globalFilters?.espacio]);


  // Conflict IDs for the day (utilizes precomputed global Set when provided for O(1) lookups)
  const conflictIdsToday = useMemo(() => {
    if (conflictReservationIds) {
      return conflictReservationIds;
    }
    return getConflictReservationIds(dayReservations);
  }, [conflictReservationIds, dayReservations]);

  // Shared reservation-type palette used across agenda, calendar and matrix views.
  const getCardStyle = (res: Reservation, isConflict: boolean) => {
    if (isConflict) {
      return {
        bg: 'bg-rose-50',
        border: 'border-rose-400 ring-2 ring-rose-300',
        shadow: 'shadow-[0_3px_0_rgba(244,63,94,0.6),0_4px_6px_rgba(0,0,0,0.08)]',
        text: 'text-rose-950',
        accent: '#e11d48'
      };
    }

    const visual = getReservationTypeVisual(res);
    return {
      bg: visual.bgClass,
      border: visual.borderClass,
      shadow: 'shadow-xs',
      text: 'text-slate-900',
      accent: visual.accent
    };
  };

  // --- DRAG & DROP HANDLERS FOR RESERVATIONS ---
  const handleReservationDragStart = (e: React.DragEvent, res: Reservation) => {
    e.stopPropagation();
    setHoveredCardInfo(null);
    setDraggedReservation(res);
    e.dataTransfer.setData('text/plain', res.id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      id: res.id,
      espacio: res.espacio,
      horaInicio: res.horaInicio,
      horaFin: res.horaFin
    }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleReservationDragEnd = () => {
    setDraggedReservation(null);
    setDragTargetInfo(null);
    setDragOverHeaderSpace(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, spaceName: string) => {
    if (!draggedReservation) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Calculate Y offset relative to timetable body
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    // Snapping to 15-minute intervals
    const origStartMin = timeToMinutes(draggedReservation.horaInicio);
    const rawEndMin = timeToMinutes(draggedReservation.horaFin);
    const origEndMin = rawEndMin + (draggedReservation.terminaDiaSiguiente || rawEndMin === 0 && origStartMin > 0 ? 1440 : 0);
    const duration = Math.max(30, origEndMin - origStartMin);

    const relativeMinutes = (offsetY / HOUR_HEIGHT) * 60;
    const rawTargetStart = START_MINUTES + relativeMinutes;
    // Snap to nearest 15 mins
    const snappedStart = Math.round(rawTargetStart / 15) * 15;
    const clampedStart = Math.max(START_MINUTES, Math.min(START_MINUTES + TOTAL_MINUTES - duration, snappedStart));
    const clampedEnd = clampedStart + duration;

    const startTimeStr = formatMinutesToTime(clampedStart);
    const endTimeStr = formatMinutesToTime(clampedEnd);

    // Detect active maintenance blocks in this slot
    const normTargetSpace = normalizeSpaceName(spaceName);
    const matchingBlock = spaceBlocks?.find((b) => {
      if (!b.activo) return false;
      if (dateStr < b.fechaInicio || dateStr > b.fechaFin) return false;
      const bNorm = normalizeSpaceName(b.espacio);
      const sNorm = normTargetSpace;
      const matchesSpace =
        bNorm === sNorm ||
        (b.bloquearSubEspacios && sNorm.includes(bNorm)) ||
        (b.bloquearSubEspacios && bNorm.includes(sNorm));
      if (!matchesSpace) return false;
      if (b.todoElDia) return true;
      const bStart = timeToMinutes(b.horaInicio || '08:00');
      const bEnd = timeToMinutes(b.horaFin || '22:30');
      return bStart < clampedEnd && clampedStart < bEnd;
    });

    // Detect conflicting reservations in this space and time (excluding current reservation being dragged)
    const conflictingRes = rawDayReservations.find((r) => {
      if (r.id === draggedReservation.id) return false;
      if (!isReservationActiveForAvailability(r)) return false;
      if (!doSpacesConflict(r.espacio, spaceName)) return false;
      const rStart = timeToMinutes(r.horaInicio);
      let rEnd = timeToMinutes(r.horaFin);
      if ((r.horaFin === '00:00' || r.horaFin === '24:00' || rEnd === 0) && rStart > 0 && !r.terminaDiaSiguiente) {
        rEnd = 1440;
      }
      return rStart < clampedEnd && clampedStart < rEnd;
    });

    setDragTargetInfo({
      spaceName,
      startMinutes: clampedStart,
      endMinutes: clampedEnd,
      startTime: startTimeStr,
      endTime: endTimeStr,
      hasConflict: !!conflictingRes,
      conflictDetails: conflictingRes ? `${conflictingRes.descripcion || conflictingRes.tipoActividad} (${conflictingRes.horaInicio} – ${conflictingRes.horaFin})` : undefined,
      isBlocked: !!matchingBlock,
      blockReason: matchingBlock ? `${matchingBlock.motivo || 'Mantención'}${matchingBlock.descripcion ? `: ${matchingBlock.descripcion}` : ''}` : undefined
    });
  };

  const handleColumnDrop = async (e: React.DragEvent, spaceName: string) => {
    e.preventDefault();
    if (!draggedReservation || !dragTargetInfo || !onUpdateReservation) {
      setDraggedReservation(null);
      setDragTargetInfo(null);
      setDragOverHeaderSpace(null);
      return;
    }

    // Check if dropping on the exact same space and time (no-op)
    const isSameSpace = normalizeSpaceName(draggedReservation.espacio) === normalizeSpaceName(spaceName);
    const isSameStart = draggedReservation.horaInicio === dragTargetInfo.startTime;
    const isSameEnd = draggedReservation.horaFin === dragTargetInfo.endTime;
    if (isSameSpace && isSameStart && isSameEnd) {
      setDraggedReservation(null);
      setDragTargetInfo(null);
      setDragOverHeaderSpace(null);
      return;
    }

    // Block moving to a space with active maintenance block
    if (dragTargetInfo.isBlocked) {
      setToastMessage({
        text: 'Reubicación cancelada: Espacio en mantención',
        sub: `${spaceName}: ${dragTargetInfo.blockReason || 'Bloqueo activo en este horario'}`
      });
      setDraggedReservation(null);
      setDragTargetInfo(null);
      setDragOverHeaderSpace(null);
      return;
    }

    const updatedRes: Reservation = {
      ...draggedReservation,
      espacio: spaceName,
      horaInicio: dragTargetInfo.startTime,
      horaFin: dragTargetInfo.endTime,
      terminaDiaSiguiente: false
    };

    const prevRes = draggedReservation;
    setDraggedReservation(null);
    setDragTargetInfo(null);
    setDragOverHeaderSpace(null);

    const result = await Promise.resolve(onUpdateReservation(updatedRes));
    if (result !== false) {
      setToastMessage({
        text: 'Actividad reasignada exitosamente',
        sub: `${prevRes.tipoActividad || 'Reserva'} en ${spaceName} (${updatedRes.horaInicio} – ${updatedRes.horaFin})`
      });
    }
  };

  const handleHeaderDrop = async (e: React.DragEvent, targetSpaceName: string) => {
    e.preventDefault();
    if (!draggedReservation || !onUpdateReservation) return;

    if (normalizeSpaceName(draggedReservation.espacio) === normalizeSpaceName(targetSpaceName)) {
      setDraggedReservation(null);
      setDragTargetInfo(null);
      setDragOverHeaderSpace(null);
      return;
    }

    const updatedRes: Reservation = {
      ...draggedReservation,
      espacio: targetSpaceName
    };

    const prevRes = draggedReservation;
    setDraggedReservation(null);
    setDragTargetInfo(null);
    setDragOverHeaderSpace(null);

    const result = await Promise.resolve(onUpdateReservation(updatedRes));
    if (result !== false) {
      setToastMessage({
        text: 'Espacio reasignado exitosamente',
        sub: `${prevRes.tipoActividad || 'Reserva'} ahora en ${targetSpaceName} (${updatedRes.horaInicio} – ${updatedRes.horaFin})`
      });
    }
  };

  // --- INSTANT SPACE COLUMNS REORDERING & DRAG-AND-DROP ---
  const handleMoveSpace = useCallback((fromIndex: number, toIndex: number) => {
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= activeSpaces.length ||
      toIndex >= activeSpaces.length
    ) {
      return;
    }

    const targetSpace = activeSpaces[fromIndex];
    const newSpaces = [...activeSpaces];
    const [moved] = newSpaces.splice(fromIndex, 1);
    newSpaces.splice(toIndex, 0, moved);

    // 1. Optimistic state update: Instant 0ms visual reordering ("altiro")
    setLocalSpaces(newSpaces);

    // 2. Propagate to parent & storage without blocking
    if (onReorderSpaces) {
      onReorderSpaces(newSpaces);
    }

    setToastMessage({
      text: `Espacio reordenado al instante`,
      sub: `"${targetSpace.name}" movido a la posición ${toIndex + 1}`
    });
  }, [activeSpaces, onReorderSpaces]);

  const handleHeaderDragStart = (e: React.DragEvent, index: number) => {
    if (!allowSpaceReorder) {
      e.preventDefault();
      return;
    }
    setDraggedHeaderIndex(index);
    e.dataTransfer.setData('text/plain', `COL_${index}`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleHeaderDragOver = (e: React.DragEvent, index: number) => {
    if (draggedHeaderIndex === null) {
      // If we are dragging a reservation over the header
      if (draggedReservation) {
        e.preventDefault();
        const sp = activeSpaces[index];
        if (sp) setDragOverHeaderSpace(sp.name);
      }
      return;
    }
    if (!allowSpaceReorder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverHeaderIndex !== index) {
      setDragOverHeaderIndex(index);
    }
  };

  const handleHeaderColumnDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!allowSpaceReorder || draggedHeaderIndex === null || draggedHeaderIndex === targetIndex) {
      setDraggedHeaderIndex(null);
      setDragOverHeaderIndex(null);
      return;
    }

    const fromIndex = draggedHeaderIndex;
    setDraggedHeaderIndex(null);
    setDragOverHeaderIndex(null);

    handleMoveSpace(fromIndex, targetIndex);
  };

  // Quick navigation handlers
  const handlePrevDay = () => updateSelectedDate(subDays(selectedDate, 1));
  const handleNextDay = () => updateSelectedDate(addDays(selectedDate, 1));
  const handleToday = () => updateSelectedDate(new Date());

  // Compute overlap lanes once per data change, never once per scroll frame.
  const bookingsBySpace = useMemo(() => new Map(activeSpaces.map(space => {
    const getBookingInterval = (r: Reservation) => {
      const isOvernight = Boolean(r.terminaDiaSiguiente) || (timeToMinutes(r.horaFin) <= timeToMinutes(r.horaInicio) && timeToMinutes(r.horaFin) > 0);
      const isSecondDay = isOvernight && r.fecha !== dateStr;
      const s = isSecondDay ? 0 : timeToMinutes(r.horaInicio);
      const e = (isOvernight && !isSecondDay) ? (24 * 60) : timeToMinutes(r.horaFin);
      return { s, e, isOvernight, isSecondDay };
    };

    const spaceBookings = dayReservations
      .filter((r) => doSpacesConflict(r.espacio, space.name))
      .sort((a, b) => {
        const intA = getBookingInterval(a);
        const intB = getBookingInterval(b);
        const startDiff = intA.s - intB.s;
        if (startDiff !== 0) return startDiff;
        return intB.e - intA.e;
      });

    // Calculate non-overlapping sub-column layout for concurrent bookings
    const layoutMap = new Map<string, { colIndex: number; totalCols: number }>();
    if (spaceBookings.length > 0) {
      const clusters: Reservation[][] = [];
      let currentCluster: Reservation[] = [];
      let clusterEnd = -1;

      spaceBookings.forEach((b) => {
        const bInt = getBookingInterval(b);
        if (currentCluster.length === 0) {
          currentCluster.push(b);
          clusterEnd = bInt.e;
        } else if (bInt.s < clusterEnd) {
          currentCluster.push(b);
          clusterEnd = Math.max(clusterEnd, bInt.e);
        } else {
          clusters.push(currentCluster);
          currentCluster = [b];
          clusterEnd = bInt.e;
        }
      });
      if (currentCluster.length > 0) {
        clusters.push(currentCluster);
      }

      clusters.forEach((cluster) => {
        if (cluster.length === 1) {
          layoutMap.set(cluster[0].id, { colIndex: 0, totalCols: 1 });
          return;
        }
        const cols: Reservation[][] = [];
        cluster.forEach((b) => {
          const bInt = getBookingInterval(b);
          let placed = false;
          for (let c = 0; c < cols.length; c++) {
            const lastInCol = cols[c][cols[c].length - 1];
            const lastInt = getBookingInterval(lastInCol);
            if (lastInt.e <= bInt.s) {
              cols[c].push(b);
              layoutMap.set(b.id, { colIndex: c, totalCols: 0 });
              placed = true;
              break;
            }
          }
          if (!placed) {
            cols.push([b]);
            layoutMap.set(b.id, { colIndex: cols.length - 1, totalCols: 0 });
          }
        });
        const totalColumnsInCluster = cols.length;
        cluster.forEach((b) => {
          const entry = layoutMap.get(b.id);
          if (entry) {
            entry.totalCols = totalColumnsInCluster;
          }
        });
      });
    }


    const geometry = new Map(spaceBookings.map(res => {
      const { s, e } = getBookingInterval(res);
      const from = Math.max(s, START_MINUTES);
      const to = Math.min(e, START_MINUTES + TOTAL_MINUTES);
      return [res.id, { top: ((from - START_MINUTES) / 60) * HOUR_HEIGHT + 2,
        height: Math.max(38, ((to - from) / 60) * HOUR_HEIGHT) - 4, valid: to > from }];
    }));
    return [space.id, { spaceBookings, layoutMap, getBookingInterval, geometry }] as const;
  })), [activeSpaces, dayReservations, dateStr, START_MINUTES, TOTAL_MINUTES]);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const viewport = useTimelineViewport(scrollContainerRef, headerRef, TOTAL_HOURS, HOUR_HEIGHT);
  const [focusedReservationId, setFocusedReservationId] = useState<string | null>(null);
  const pendingFocus = useRef<string | null>(null);

  // Auto scroll horizontally or vertically on mount if needed
  useEffect(() => {
    if (scrollContainerRef.current && currentTimeTop) {
      const targetScroll = Math.max(0, currentTimeTop - 180);
      scrollContainerRef.current.scrollTop = targetScroll;
    }
  }, [selectedDate]);

  // Dynamic minimum width adapted to selected density mode
  const gridMinWidth = useMemo(() => {
    const colWidth = isCompact ? 130 : 150;
    const timeColWidth = isCompact ? 64 : 72;
    return Math.max(isCompact ? 1050 : 1320, activeSpaces.length * colWidth + timeColWidth);
  }, [activeSpaces.length, isCompact]);

  return (
    <div className="w-full space-y-2 pb-1 relative">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <NotificationPortal><div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center space-x-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">{toastMessage.text}</div>
            {toastMessage.sub && (
              <div className="text-[11px] text-slate-300 font-mono">{toastMessage.sub}</div>
            )}
          </div>
        </div></NotificationPortal>
      )}

      {/* Top Banner if there are conflicts on this day */}
      {conflictIdsToday.size > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl px-5 py-2.5 flex items-center justify-between shadow-xs text-xs text-rose-900">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>
              <strong>¡Atención!</strong> Se detectaron <strong>{conflictIdsToday.size}</strong> {conflictIdsToday.size === 1 ? 'actividad' : 'actividades'} con topamiento de horario en esta fecha.
            </span>
          </div>
          <span className="text-[11px] text-rose-700 bg-white px-2 py-0.5 rounded-lg border border-rose-200 font-semibold">
            Destacadas con borde rojo
          </span>
        </div>
      )}

      {/* Top Banner if Today is a Chilean Holiday */}
      {getChileanHolidayInfo(dateStr) && (
        <div className="bg-rose-50/90 border border-rose-200 rounded-2xl px-5 py-3 flex items-center justify-between shadow-xs text-xs text-rose-900">
          <div className="flex items-center space-x-2.5">
            <span className="text-xl">🇨🇱</span>
            <div>
              <div className="font-extrabold text-rose-950 flex items-center space-x-2">
                <span>DÍA FERIADO EN CHILE: {getChileanHolidayInfo(dateStr)?.name}</span>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-rose-200 text-rose-900">
                  {getChileanHolidayInfo(dateStr)?.isIrrenunciable ? 'Feriado Irrenunciable' : 'Feriado Oficial'}
                </span>
              </div>
              <p className="text-[11px] text-rose-800 mt-0.5">
                Por normativa, no se programan reservas estándar en días feriados. Cualquier reserva en esta fecha requiere autorización con clave especial CCD.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-rose-800 bg-white px-2.5 py-1 rounded-xl border border-rose-200 shadow-2xs">
            {dayReservations.length === 0 ? 'Sin reservas (Día Libre)' : `${dayReservations.length} reserva(s) autorizada(s)`}
          </span>
        </div>
      )}

      {/* 1. TOP HEADER TOOLBAR (Sticky / Frozen) */}
      <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3 sm:px-4 py-2.5 shadow-xs flex flex-col md:flex-row lg:items-center justify-between gap-3">
        {/* Left Side: Date pill card with green "HOY" badge */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          <div className="flex items-center space-x-2.5 px-3 py-1.5 min-h-[44px] bg-slate-50 border border-slate-200 rounded-xl">
            <span className="text-sm md:text-base font-bold text-slate-800 capitalize">
              {format(selectedDate, "EEEE, dd-MM-yyyy", { locale: es })}
            </span>
            {isToday && (
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#059669] text-white tracking-wider shadow-2xs">
                HOY
              </span>
            )}
            {getChileanHolidayInfo(dateStr) && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 flex items-center space-x-1 shadow-2xs">
                <span>🇨🇱</span>
                <span>Feriado</span>
              </span>
            )}
          </div>

          {hasActiveGlobalFilters && (
            <div className="flex items-center space-x-1.5 text-xs text-blue-800 bg-blue-50 px-2.5 py-1 min-h-[44px] rounded-lg border border-blue-200">
              <Filter className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                Filtrado ({dayReservations.length}/{allReservationsForToday.length})
              </span>
              <button
                type="button"
                id="btn-clear-daily-top-filter"
                aria-label="Limpiar filtro de búsqueda"
                onClick={handleClearAllFilters}
                className="hover:text-blue-900 ml-1 p-1 rounded hover:bg-blue-100 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                title="Limpiar filtros"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Action and Date Navigation controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Navegación cronológica en bloque unificado */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5 shadow-2xs min-h-[44px]">
            {/* Anterior */}
            <button
              id="btn-schedule-prev"
              aria-label="Ir al día anterior"
              onClick={handlePrevDay}
              className="px-3 py-2 min-h-[44px] min-w-[44px] rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:text-slate-900 transition cursor-pointer flex items-center justify-center space-x-1"
            >
              <span>◀</span>
              <span className="hidden sm:inline">Anterior</span>
            </button>

            {/* Hoy */}
            <button
              id="btn-schedule-today"
              aria-label="Ir a la fecha de hoy"
              onClick={handleToday}
              className="px-3.5 py-2 min-h-[44px] min-w-[44px] rounded-lg text-xs font-bold bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 transition cursor-pointer flex items-center justify-center"
            >
              Hoy
            </button>

            {/* Siguiente */}
            <button
              id="btn-schedule-next"
              aria-label="Ir al día siguiente"
              onClick={handleNextDay}
              className="px-3 py-2 min-h-[44px] min-w-[44px] rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:text-slate-900 transition cursor-pointer flex items-center justify-center space-x-1"
            >
              <span className="hidden sm:inline">Siguiente</span>
              <span>▶</span>
            </button>
          </div>

          {/* Ir a fecha Picker input pill */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1 min-h-[44px] bg-white border border-slate-200 rounded-xl text-xs shadow-2xs focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
            <span className="text-slate-500 font-semibold whitespace-nowrap text-[11px]">Ir a fecha:</span>
            <input
              id="input-goto-date"
              aria-label="Seleccionar fecha para ver el horario"
              type="date"
              min="2020-01-01"
              max="2035-12-31"
              value={dateStr}
              onChange={(e) => {
                const rawVal = e.target.value;
                if (rawVal) {
                  const { correctedIso, wasAdjusted, message } = clampAndFixCalendarDate(rawVal);
                  const targetVal = correctedIso || rawVal;
                  const validation = validateStrictCalendarDate(targetVal, 2020, 2035);
                  if (validation.isValid && validation.date) {
                    setDateErrorMessage(null);
                    updateSelectedDate(validation.date);
                    if (wasAdjusted && message) {
                      setToastMessage({
                        text: 'Fecha ajustada automáticamente',
                        sub: message
                      });
                    }
                  } else {
                    setDateErrorMessage(validation.error || 'Fecha no válida.');
                    setTimeout(() => setDateErrorMessage(null), 6000);
                  }
                }
              }}
              className="px-1 py-1 text-xs text-slate-700 font-mono font-medium focus:outline-none bg-transparent cursor-pointer min-h-[36px]"
            />
          </div>

          {/* Quick Filter in Daily Timeline */}
          <div className="relative flex items-center">
            <label htmlFor="input-daily-search" className="sr-only">
              Buscar actividades en este día
            </label>
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="input-daily-search"
              type="text"
              aria-label="Buscar actividades en este día"
              placeholder="Buscar en este día..."
              value={searchQuery}
              onChange={(e) => handleDailySearchChange(e.target.value)}
              className="pl-8 pr-7 py-2 min-h-[44px] text-xs bg-white hover:bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-32 sm:w-40 lg:w-48 transition shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpiar búsqueda del día"
                onClick={handleClearAllFilters}
                className="absolute right-1.5 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 cursor-pointer min-w-[32px] min-h-[32px] flex items-center justify-center"
                title="Borrar búsqueda"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Imprimir / Exportar PDF */}
          <button
            id="btn-print-schedule"
            aria-label="Imprimir o exportar esta planilla como PDF"
            onClick={() => setIsPrintModalOpen(true)}
            className="px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-semibold bg-[#eff6ff] hover:bg-[#dbeafe] text-[#0369a1] border border-[#bfdbfe] shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
            title="Imprimir o exportar esta planilla como PDF oficial"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir/Exportar</span>
          </button>
        </div>
      </div>

      {/* Active Global / Daily Filters Notification Bar */}
      {hasActiveGlobalFilters && (
        <div
          id="daily-active-filters-banner"
          className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-2xs text-xs text-blue-950"
        >
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <Filter className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="font-bold text-blue-900">Filtro activo compartido:</span>
            {activeFilterDescriptions.map((desc, i) => (
              <span
                key={i}
                className="px-2 py-0.5 bg-white border border-blue-200 rounded-lg text-blue-800 text-[11px] font-semibold"
              >
                {desc}
              </span>
            ))}
            <span className="text-[11px] text-blue-700 ml-1">
              (Mostrando <strong>{dayReservations.length}</strong> de <strong>{formatActivitiesCount(allReservationsForToday.length)}</strong> del día)
            </span>
          </div>
          <button
            type="button"
            id="btn-clear-daily-filters"
            onClick={handleClearAllFilters}
            className="px-3 py-1 bg-white hover:bg-blue-100 active:scale-95 text-blue-700 border border-blue-300 rounded-xl text-xs font-bold transition flex items-center space-x-1 cursor-pointer shadow-2xs"
          >
            <RotateCcw className="w-3 h-3 text-blue-600" />
            <span>Limpiar filtros</span>
          </button>
        </div>
      )}

      {/* Differentiated Empty State Banner when no reservations match */}
      {dayReservations.length === 0 && (
        allReservationsForToday.length > 0 ? (
          <div
            id="banner-no-matches-filtered"
            className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 text-amber-950 animate-fadeIn"
          >
            <div className="flex items-center space-x-3 text-left">
              <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
                <Search className="w-5 h-5 text-amber-800" />
              </div>
              <div>
                <div className="text-sm font-bold text-amber-950">
                  Sin coincidencias con los filtros activos para este día
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  Hay <strong>{formatActivitiesCount(allReservationsForToday.length)} programadas</strong> en esta fecha ({format(selectedDate, 'dd-MM-yyyy')}) que están ocultas por el filtro actual ({activeFilterDescriptions.join(', ')}).
                </p>
              </div>
            </div>
            <button
              type="button"
              id="btn-recover-filtered-reservations"
              onClick={handleClearAllFilters}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold text-xs transition shadow-xs flex items-center space-x-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar filtros (Recuperar {formatActivitiesCount(allReservationsForToday.length)})</span>
            </button>
          </div>
        ) : (
          <div
            id="banner-no-reservations-today"
            className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center text-slate-600 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs"
          >
            <div className="flex items-center space-x-3 text-left">
              <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                <CalendarIcon className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800">
                  Sin reservas programadas para este día
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  No se registran actividades agendadas en ningún espacio para el {format(selectedDate, 'EEEE, dd-MM-yyyy', { locale: es })}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNewReservationWithSlot(activeSpaces[0]?.name || 'AUDITORIO', dateStr, '10:00', '11:00')}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs transition shadow-2xs flex items-center space-x-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agendar Reserva</span>
            </button>
          </div>
        )
      )}

      {/* Invalid date feedback alert if triggered */}
      {dateErrorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-900 flex items-center justify-between shadow-xs animate-fadeIn">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-semibold">{dateErrorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setDateErrorMessage(null)}
            className="text-rose-700 hover:text-rose-950 font-bold text-sm ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* 1.1 AVISO ACTIVIDADES IMPORTANTES (Desde 3 días antes) */}
      {upcomingImportant3Days.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800 font-bold flex items-center space-x-1">
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-700" />
            </span>
            <div>
              <div className="text-xs font-bold text-amber-950 flex items-center space-x-1.5">
                <span>Actividades Importantes en los Próximos 3 Días</span>
                <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-extrabold">
                  {upcomingImportant3Days.length}
                </span>
              </div>
              <p className="text-[11px] text-amber-800">
                Se detectaron actividades destacadas entre el {format(selectedDate, 'dd-MM-yyyy')} y el{' '}
                {format(addDays(selectedDate, 3), 'dd-MM-yyyy')}. Puedes revisarlas o imprimirlas en la planilla.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-2xs transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Planilla Diaria</span>
          </button>
        </div>
      )}


      {/* 2. MAIN HORIZONTAL/VERTICAL DAILY TIMETABLE GRID */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={() => {
            if (hoveredCardInfo) setHoveredCardInfo(null);
          }}
          className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-140px)] min-h-0 h-[calc(100dvh-140px)] scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100"
        >
          <div className="relative" style={{ minWidth: `${gridMinWidth}px` }}>
            {/* STICKY HEADER ROW: "HORA" + All Space Columns */}
            <div ref={headerRef} className="sticky top-0 z-30 flex border-b border-slate-200 bg-[#f8fafc] text-xs font-bold text-slate-700 shadow-2xs">
              {/* Left "HORA" header (Sticky on horizontal & vertical scroll) */}
              <div className={`${isCompact ? 'w-[64px] p-2 text-[10px]' : 'w-[72px] p-3 text-[11px]'} shrink-0 text-center uppercase tracking-wider font-extrabold text-slate-600 border-r border-slate-200 bg-[#f1f5f9] flex items-center justify-center select-none sticky left-0 z-40 shadow-xs`}>
                HORA
              </div>

              {/* Space Column Headers (Draggable, Drop Target & Full Text Adaptive Wrapping) */}
              {activeSpaces.map((space, idx) => {
                const isSpecial = space.name === 'SALA 4';
                const isHeaderDragged = draggedHeaderIndex === idx;
                const isHeaderDropTarget = dragOverHeaderIndex === idx;
                const isReservationHeaderTarget = dragOverHeaderSpace === space.name;

                return (
                  <div
                    key={space.id}
                    draggable={allowSpaceReorder}
                    onDragStart={(e) => handleHeaderDragStart(e, idx)}
                    onDragOver={(e) => handleHeaderDragOver(e, idx)}
                    onDragLeave={() => {
                      if (dragOverHeaderIndex === idx) setDragOverHeaderIndex(null);
                      if (dragOverHeaderSpace === space.name) setDragOverHeaderSpace(null);
                    }}
                    onDrop={(e) => {
                      if (draggedReservation) {
                        handleHeaderDrop(e, space.name);
                      } else if (allowSpaceReorder) {
                        handleHeaderColumnDrop(e, idx);
                      }
                    }}
                    className={`flex-1 ${isCompact ? 'min-w-[124px] sm:min-w-[130px] p-1.5' : 'min-w-[145px] sm:min-w-[150px] p-2'} text-center border-r border-slate-200 transition-all select-none relative group/header flex flex-col justify-center ${
                      allowSpaceReorder ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                    } ${
                      isReservationHeaderTarget
                        ? 'bg-blue-100 text-blue-900 ring-2 ring-blue-500 ring-inset scale-[1.02] z-40'
                        : isHeaderDropTarget
                        ? 'bg-blue-100/90 text-blue-950 border-l-4 border-l-blue-600 ring-2 ring-blue-400/70 shadow-inner z-30'
                        : isHeaderDragged
                        ? 'opacity-30 bg-slate-300 border-2 border-dashed border-slate-400'
                        : isSpecial
                        ? 'bg-[#fffaf5] text-amber-900'
                        : 'bg-[#f8fafc] text-slate-800 hover:bg-slate-100/90'
                    }`}
                    title={
                      allowSpaceReorder
                        ? `Arrastra la columna para reordenar o usa las flechas ◀ ▶ para mover ${space.name} al instante`
                        : `${space.name} (orden fijo)`
                    }
                  >
                    <div className="flex items-center justify-between w-full gap-0.5">
                      {/* Botón mover a la izquierda */}
                      {allowSpaceReorder && idx > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSpace(idx, idx - 1);
                          }}
                          className="p-1 rounded-md text-slate-400 hover:text-blue-700 hover:bg-blue-100/80 transition cursor-pointer active:scale-90 shrink-0"
                          title={`Mover "${space.name}" a la izquierda`}
                          aria-label={`Mover "${space.name}" a la izquierda`}
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        allowSpaceReorder && <span className="w-4 shrink-0" />
                      )}

                      {/* Título de espacio completo - Adaptado con salto de línea natural y sin truncar */}
                      <div className="flex items-center justify-center space-x-1 min-w-0 flex-1 px-1">
                        {allowSpaceReorder && (
                          <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover/header:text-blue-600 transition shrink-0 cursor-grab active:cursor-grabbing" />
                        )}
                        <span className="font-extrabold text-[10.5px] sm:text-[11px] uppercase tracking-tight text-slate-800 leading-tight text-center break-words select-none hyphens-auto">
                          {space.name}
                        </span>
                      </div>

                      {/* Botón mover a la derecha */}
                      {allowSpaceReorder && idx < activeSpaces.length - 1 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMoveSpace(idx, idx + 1);
                          }}
                          className="p-1 rounded-md text-slate-400 hover:text-blue-700 hover:bg-blue-100/80 transition cursor-pointer active:scale-90 shrink-0"
                          title={`Mover "${space.name}" a la derecha`}
                          aria-label={`Mover "${space.name}" a la derecha`}
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        allowSpaceReorder && <span className="w-4 shrink-0" />
                      )}
                    </div>
                    {isReservationHeaderTarget && (
                      <span className="text-[9px] font-bold text-blue-600 block leading-tight mt-0.5">
                        🎯 Soltar aquí
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* GRID BODY: Left time labels + Space Columns + Time Line + Floating Event Cards */}
            <div className="relative flex" style={{ height: `${TOTAL_HEIGHT}px` }}>
              {/* 1. LEFT TIME COLUMN (08:00 to 22:00) - Sticky on horizontal scroll */}
              <div className={`${isCompact ? 'w-[64px]' : 'w-[72px]'} shrink-0 bg-[#f8fafc] border-r border-slate-200 sticky left-0 select-none z-20 shadow-xs`}>
                {hourSlots.map((h, i) => {
                  const topPx = i * HOUR_HEIGHT;
                  const hourLabel = `${String(h).padStart(2, '0')}:00`;

                  return (
                    <div
                      key={h}
                      style={{ top: `${topPx}px`, height: `${HOUR_HEIGHT}px` }}
                      className="absolute left-0 right-0 border-b border-slate-200 flex items-start justify-center pt-1.5 text-[10px] sm:text-[10.5px] font-semibold font-mono text-slate-500"
                    >
                      {hourLabel}
                    </div>
                  );
                })}

                {/* RED BADGE FOR CURRENT TIME (e.g. "15:06") */}
                {isToday && currentTimeTop !== null && (
                  <div
                    style={{ top: `${currentTimeTop - 11}px` }}
                    className="absolute left-1.5 z-40 bg-[#dc2626] text-white text-[10.5px] font-mono font-extrabold px-1.5 py-0.5 rounded shadow-sm text-center leading-none"
                  >
                    {currentTimeFormatted}
                  </div>
                )}
              </div>

              {/* 2. SPACE COLUMNS & GRID BACKGROUND */}
              <div className="flex-1 flex relative">
                {/* Horizontal Hour Lines */}
                <div className="absolute inset-0 pointer-events-none z-0">
                  {hourSlots.map((h, i) => (
                    <div
                      key={h}
                      style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                      className="w-full border-b border-slate-100"
                    />
                  ))}
                </div>

                {/* CURRENT TIME RED HORIZONTAL LINE ACROSS ALL COLUMNS */}
                {isToday && currentTimeTop !== null && (
                  <div
                    style={{ top: `${currentTimeTop}px` }}
                    className="absolute left-0 right-0 h-[2px] bg-[#dc2626] z-30 pointer-events-none shadow-xs"
                  >
                    <div className="absolute -top-1 -bottom-1 left-0 right-0 bg-red-500/10 pointer-events-none" />
                  </div>
                )}

                {/* Space Columns Container (Droppable Zones) */}
                {activeSpaces.map((space) => {
                  const { spaceBookings, layoutMap, getBookingInterval, geometry } = bookingsBySpace.get(space.id)!;
                  const isSpecial = space.name === 'SALA 4';
                  const isDragTarget = dragTargetInfo?.spaceName === space.name;

                  return (
                    <div
                      key={space.id}
                      onDragOver={(e) => handleColumnDragOver(e, space.name)}
                      onDragLeave={() => {
                        if (dragTargetInfo?.spaceName === space.name) {
                          setDragTargetInfo(null);
                        }
                      }}
                      onDrop={(e) => handleColumnDrop(e, space.name)}
                      className={`flex-1 ${isCompact ? 'min-w-[124px] sm:min-w-[130px]' : 'min-w-[145px] sm:min-w-[150px]'} border-r border-slate-200/80 relative transition group/col ${
                        isDragTarget
                          ? 'bg-blue-50/40 ring-2 ring-blue-400/80 ring-inset'
                          : isSpecial
                          ? 'bg-[#fffaf5]/40'
                          : 'bg-transparent'
                      }`}
                    >
                      {/* Clickable hourly slots for quick booking creation */}
                      {hourSlots.slice(0, -1).map((h, i) => {
                        const topPx = i * HOUR_HEIGHT;
                        // Toda reserva desde temprano: cargar de manera predeterminada desde las 08:30 como inicio
                        const isEarlySlot = h <= 8;
                        const startH = isEarlySlot ? '08:30' : `${String(h).padStart(2, '0')}:00`;
                        const endH = isEarlySlot ? '09:30' : `${String(h + 1).padStart(2, '0')}:00`;

                        return (
                          <button
                            type="button"
                            key={h}
                            style={{ top: `${topPx}px`, height: `${HOUR_HEIGHT}px` }}
                            onKeyDown={event => {
                              if (event.key !== 'Tab') return;
                              let next: Reservation | undefined;
                              let nextGeometry = geometry;
                              if (!event.shiftKey && i === TOTAL_HOURS - 1) next = spaceBookings[0];
                              if (event.shiftKey && i === 0) {
                                const previousSpace = activeSpaces[activeSpaces.indexOf(space) - 1];
                                const previous = previousSpace && bookingsBySpace.get(previousSpace.id);
                                if (previous) {
                                  next = previous.spaceBookings[previous.spaceBookings.length - 1];
                                  nextGeometry = previous.geometry;
                                }
                              }
                              if (next) {
                                event.preventDefault();
                                pendingFocus.current = next.id;
                                setFocusedReservationId(next.id);
                                scrollContainerRef.current?.scrollTo({ top: Math.max(0, nextGeometry.get(next.id)!.top - 10) });
                              }
                            }}
                            onClick={() => onNewReservationWithSlot(space.name, dateStr, startH, endH)}
                            onMouseEnter={() => setHoveredSlot({ space: space.name, hour: h })}
                            onMouseLeave={() => setHoveredSlot(null)}
                            aria-label={isEarlySlot ? `Reservar ${space.name} desde las 08:30` : `Reservar ${space.name} a las ${startH}`}
                            className="absolute inset-x-0 w-full text-left bg-transparent border-0 cursor-pointer hover:bg-blue-50/30 transition-colors z-5 flex items-center justify-center group/cell p-0"
                            title={isEarlySlot ? `Haga clic para reservar en ${space.name} desde las 08:30 (ingreso manual si requiere antes)` : `Haga clic para reservar en ${space.name} a las ${startH}`}
                          >
                            <span className="opacity-0 group-hover/cell:opacity-100 text-[10px] font-semibold text-blue-600 bg-white/80 px-1.5 py-0.5 rounded shadow-2xs transition pointer-events-none">
                              + Reservar
                            </span>
                          </button>
                        );
                      })}


                      {/* ACTIVE MAINTENANCE / SPACE BLOCKS OVERLAY */}
                      {spaceBlocks
                        .filter((b) => {
                          if (!b.activo) return false;
                          if (dateStr < b.fechaInicio || dateStr > b.fechaFin) return false;
                          const bNorm = normalizeSpaceName(b.espacio);
                          const sNorm = normalizeSpaceName(space.name);
                          return bNorm === sNorm ||
                            (b.bloquearSubEspacios && sNorm.includes(bNorm)) ||
                            (b.bloquearSubEspacios && bNorm.includes(sNorm));
                        })
                        .map((block) => {
                          const bStartMin = block.todoElDia ? START_MINUTES : timeToMinutes(block.horaInicio || '08:00');
                          const bEndMin = block.todoElDia ? (START_MINUTES + TOTAL_MINUTES) : timeToMinutes(block.horaFin || '22:30');
                          const clampStart = Math.max(bStartMin, START_MINUTES);
                          const clampEnd = Math.min(bEndMin, START_MINUTES + TOTAL_MINUTES);
                          if (clampEnd <= clampStart) return null;

                          const blockTop = ((clampStart - START_MINUTES) / 60) * HOUR_HEIGHT;
                          const blockHeight = Math.max(34, ((clampEnd - clampStart) / 60) * HOUR_HEIGHT);

                          if (!intersectsViewport(blockTop, blockHeight, viewport.start, viewport.end)) return null;
                          return (
                            <div
                              key={block.id}
                              style={{ top: `${blockTop}px`, height: `${blockHeight}px` }}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onNavigateToMaintenance) onNavigateToMaintenance();
                              }}
                              className="absolute left-0.5 right-0.5 z-15 rounded-xl bg-amber-100/90 border-2 border-dashed border-amber-500/80 p-2 overflow-hidden shadow-xs cursor-pointer hover:bg-amber-200/90 transition flex flex-col justify-between"
                              title={`🚧 ${block.motivo}: ${block.descripcion} (${block.todoElDia ? 'Todo el día' : `${block.horaInicio} - ${block.horaFin}`})`}
                            >
                              <div className="flex items-center space-x-1 text-amber-900 font-extrabold text-[10px]">
                                <Hammer className="w-3 h-3 text-amber-700 shrink-0" />
                                <span className="uppercase tracking-tight truncate">{block.motivo}</span>
                              </div>
                              <p className="text-[9.5px] text-amber-800 font-medium line-clamp-2 leading-tight">
                                {block.descripcion}
                              </p>
                              <div className="text-[9px] font-mono text-amber-700 font-bold">
                                {block.todoElDia ? 'Jornada Completa' : `${block.horaInicio} - ${block.horaFin}`}
                              </div>
                            </div>
                          );
                        })}

                      {/* GHOST PREVIEW DROP TARGET INDICATOR */}
                      {isDragTarget && dragTargetInfo && (
                        <div
                          style={{
                            top: `${((dragTargetInfo.startMinutes - START_MINUTES) / 60) * HOUR_HEIGHT}px`,
                            height: `${Math.max(42, ((dragTargetInfo.endMinutes - dragTargetInfo.startMinutes) / 60) * HOUR_HEIGHT)}px`
                          }}
                          className={`absolute left-1 right-1 rounded-xl border-2 border-dashed z-30 pointer-events-none flex flex-col items-center justify-center p-1.5 shadow-lg transition-all ${
                            dragTargetInfo.isBlocked
                              ? 'bg-amber-500/25 border-amber-600 text-amber-950 ring-2 ring-amber-400/40'
                              : dragTargetInfo.hasConflict
                              ? 'bg-rose-500/25 border-rose-600 text-rose-950 ring-2 ring-rose-400/40'
                              : 'bg-blue-500/20 border-blue-600 text-blue-900 ring-2 ring-blue-400/30'
                          }`}
                        >
                          <div className="flex items-center space-x-1">
                            <span className="text-[10px] font-extrabold bg-white/95 px-2 py-0.5 rounded shadow-xs">
                              📍 {dragTargetInfo.startTime} – {dragTargetInfo.endTime}
                            </span>
                          </div>
                          {dragTargetInfo.isBlocked ? (
                            <span className="text-[9px] font-bold text-amber-950 bg-amber-100/90 px-1.5 py-0.2 rounded mt-0.5 truncate max-w-[95%]">
                              🚧 {dragTargetInfo.blockReason || 'Espacio en mantención'}
                            </span>
                          ) : dragTargetInfo.hasConflict ? (
                            <span className="text-[9px] font-bold text-rose-950 bg-rose-100/90 px-1.5 py-0.2 rounded mt-0.5 truncate max-w-[95%]">
                              ⚠️ Topamiento con {dragTargetInfo.conflictDetails}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-blue-900 mt-0.5">
                              ✓ Disponible en {space.name} (Soltar para reasignar)
                            </span>
                          )}
                        </div>
                      )}

                      {/* FLOATING EVENT CARDS (Pastel blocks with full collision prevention) */}
                      {spaceBookings.map((res, bookingIndex) => {
                        const box = geometry.get(res.id)!;
                        if (!box.valid || (!intersectsViewport(box.top, box.height, viewport.start, viewport.end)
                          && draggedReservation?.id !== res.id && focusedReservationId !== res.id)) return null;
                        const { s: startMin, e: endMin } = getBookingInterval(res);

                        const clampStart = Math.max(startMin, START_MINUTES);
                        const clampEnd = Math.min(endMin, START_MINUTES + TOTAL_MINUTES);

                        if (clampEnd <= clampStart) return null;

                        const topPosition = ((clampStart - START_MINUTES) / 60) * HOUR_HEIGHT;
                        const cardHeight = Math.max(34, ((clampEnd - clampStart) / 60) * HOUR_HEIGHT);

                        const isConflict = conflictIdsToday.has(res.id);
                        const isBeingDragged = draggedReservation?.id === res.id;

                        const layout = layoutMap.get(res.id) || { colIndex: 0, totalCols: 1 };
                        const isOverlapping = layout.totalCols > 1;

                        // Precise geometric positioning preventing visual occlusion
                        const colWidthPercent = 100 / layout.totalCols;
                        const cardLeftStyle = isOverlapping
                          ? `calc(${layout.colIndex * colWidthPercent}% + 2px)`
                          : '3px';
                        const cardWidthStyle = isOverlapping
                          ? `calc(${colWidthPercent}% - 4px)`
                          : 'calc(100% - 6px)';

                        const styling = getCardStyle(res, isConflict);

                        // Dynamic text and spacing adaptation tiers based on card height & width
                        const isVeryShort = cardHeight < 44;
                        const isShort = cardHeight >= 44 && cardHeight < 68;
                        const isMedium = cardHeight >= 68 && cardHeight < 110;
                        const isTall = cardHeight >= 110;

                        // Primary activity title and subcategory distinction
                        const mainTitle = (res.descripcion && res.descripcion.trim()) ? res.descripcion.trim() : res.tipoActividad;
                        const displayTitle = formatDisplayTitle(mainTitle);
                        const hasDistinctSubcategory = Boolean(res.descripcion && res.descripcion.trim() && res.tipoActividad && res.tipoActividad.trim().toLowerCase() !== res.descripcion.trim().toLowerCase());

                        // Adaptive padding class
                        const paddingClass = isVeryShort
                          ? 'p-1 px-1.5'
                          : isShort
                          ? 'p-1.5'
                          : isMedium
                          ? 'p-1.5 sm:p-2'
                          : 'p-2 sm:p-2.5';

                        return (
                          <div
                            key={res.id}
                            data-reservation-id={res.id}
                            ref={node => {
                              if (node && pendingFocus.current === res.id) {
                                pendingFocus.current = null;
                                node.focus({ preventScroll: true });
                              }
                            }}
                            onFocus={() => setFocusedReservationId(res.id)}
                            onBlur={() => setFocusedReservationId(current => current === res.id ? null : current)}
                            role="button"
                            tabIndex={0}
                            aria-label={`Reserva de ${formatDisplayTitle(res.tipoActividad)}, ${res.horaInicio} a ${res.horaFin}, responsable ${formatDisplayTitle(res.responsable)}. Presiona Enter o Espacio para ver detalles.`}
                            draggable
                            onDragStart={(e) => handleReservationDragStart(e, res)}
                            onDragEnd={handleReservationDragEnd}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectReservation(res);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Tab') {
                                const next = spaceBookings[bookingIndex + (e.shiftKey ? -1 : 1)];
                                if (next) {
                                  e.preventDefault();
                                  pendingFocus.current = next.id;
                                  setFocusedReservationId(next.id);
                                  scrollContainerRef.current?.scrollTo({ top: Math.max(0, geometry.get(next.id)!.top - 10) });
                                }
                              }
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                onSelectReservation(res);
                              }
                            }}
                            style={{
                              top: `${topPosition + 1}px`,
                              height: `${cardHeight - 2}px`,
                              left: cardLeftStyle,
                              width: cardWidthStyle,
                              borderLeftColor: styling.accent,
                              borderLeftWidth: '3.5px'
                            }}
                            onMouseEnter={(e) => {
                              if (isBeingDragged || draggedReservation) return;
                              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                              setHoveredCardInfo({ res, rect, isConflict });
                            }}
                            onMouseLeave={() => {
                              setHoveredCardInfo((current) => (current?.res.id === res.id ? null : current));
                            }}
                            className={`absolute rounded-md ${paddingClass} ${styling.bg} border ${styling.border} ${styling.shadow} cursor-grab active:cursor-grabbing hover:z-30 hover:ring-2 hover:ring-blue-400/80 transition-all flex flex-col justify-between overflow-hidden select-none z-10 group/card focus:ring-2 focus:ring-blue-500 focus:outline-none focus:z-40 ${
                              isBeingDragged ? 'opacity-30 scale-95 ring-2 ring-blue-500' : ''
                            } ${isOverlapping ? 'ring-1 ring-rose-400/50' : ''}`}
                            title={`${isConflict || isOverlapping ? '⚠️ ¡TOPAMIENTO / RESERVAS PARALELAS!\n' : ''}${res.horaInicio} - ${res.horaFin}\nActividad: ${formatDisplayTitle(mainTitle)}${hasDistinctSubcategory ? `\nTipo: ${formatDisplayTitle(res.tipoActividad)}` : ''}\nResponsable: ${formatDisplayTitle(res.responsable)}${res.telefonoContacto ? `\nTel: ${res.telefonoContacto}` : ''}\n\n👉 ¡Arrastra esta tarjeta a cualquier espacio u horario para moverla!\n(Haz clic para ver detalles)`}
                          >
                            {/* Main Content Area */}
                            <div className="flex-1 min-h-0 flex flex-col justify-start overflow-hidden">
                              {/* Header row: Time Badge, Status Badges & Quick Action Icons */}
                              <div className="flex items-center justify-between min-h-[13px] mb-1 gap-1">
                                <div className="flex items-center space-x-1 min-w-0">
                                  <GripVertical className="w-2.5 h-2.5 text-slate-400 shrink-0 opacity-40 group-hover/card:opacity-100 transition" />
                                  <span className="font-mono tabular-nums font-bold text-[8.5px] sm:text-[9px] text-slate-700 bg-white/95 px-1 py-0.2 rounded border border-black/5 shadow-2xs shrink-0 select-none">
                                    {isOverlapping && layout.totalCols >= 2 ? res.horaInicio : `${res.horaInicio} – ${res.horaFin}`}
                                  </span>
                                  {isConflict && (
                                    <span title="Topamiento de horario" className="text-[7.5px] bg-rose-600 text-white px-1 py-0.2 rounded font-black uppercase tracking-tight shrink-0">
                                      ⚠️ TOP
                                    </span>
                                  )}
                                  {res.solicitudEliminacion && (
                                    <span title="Solicitud de eliminación en espera de autorización" className="text-[7.5px] bg-amber-500 text-white px-1 py-0.2 rounded font-bold uppercase tracking-tight shrink-0 flex items-center gap-0.5">
                                      <span>⏳</span>
                                    </span>
                                  )}
                                  {res.importante === 'Sí' && (
                                    <Flame className="w-2.5 h-2.5 text-amber-600 shrink-0 ml-0.5" />
                                  )}
                                  {normalizeSpaceName(res.espacio) !== normalizeSpaceName(space.name) && (
                                    <span
                                      title={`Reserva compartida en múltiples espacios: ${formatDisplayTitle(res.espacio)}`}
                                      className="text-[7.5px] bg-indigo-600/90 text-white px-1 py-0.2 rounded font-bold normal-case tracking-tight shrink-0 truncate max-w-[80px]"
                                    >
                                      {formatDisplayTitle(res.espacio)}
                                    </span>
                                  )}
                                </div>
                                
                                {/* Quick edit/duplicate/delete icons on hover */}
                                <div className="hidden group-hover/card:flex items-center space-x-0.5 ml-1 shrink-0 bg-white/95 backdrop-blur-xs p-0.5 rounded shadow-2xs">
                                  {onDuplicateReservation && (
                                    <button
                                      type="button"
                                      title="Duplicar reserva"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onDuplicateReservation(res);
                                      }}
                                      className="p-0.5 rounded hover:bg-indigo-600 hover:text-white text-indigo-600 transition"
                                    >
                                      <Copy className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                  {onEditReservation && (
                                    <button
                                      type="button"
                                      title="Editar reserva"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onEditReservation(res);
                                      }}
                                      className="p-0.5 rounded hover:bg-slate-900/10 text-slate-700 transition"
                                    >
                                      <Edit2 className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                  {(onRequestDelete || onDeleteReservation) && (
                                    <button
                                      type="button"
                                      aria-label="Eliminar reserva"
                                      title={res.actividadRecurrente === 'Sí' || res.recurrenteId || res.serieRecurrente ? "Eliminar reserva (abrir opciones de serie)" : "Eliminar reserva"}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (res.actividadRecurrente === 'Sí' || res.recurrenteId || res.serieRecurrente) {
                                          onSelectReservation(res);
                                        } else if (onRequestDelete) {
                                          onRequestDelete(res);
                                        } else if (onDeleteReservation) {
                                          onDeleteReservation(res.id, false);
                                        }
                                      }}
                                      className="p-0.5 rounded hover:bg-rose-600 hover:text-white text-rose-600 transition"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Adaptive Text Layout based on Card Height (clean title-only face) */}
                              {isVeryShort ? (
                                /* Very short layout (height < 44px, e.g. 30 min) */
                                <div className="flex flex-col justify-center min-w-0 overflow-hidden leading-tight">
                                  <div className="text-[9px] font-bold text-slate-900 truncate leading-tight" title={formatDisplayTitle(mainTitle)}>
                                    {displayTitle}
                                  </div>
                                </div>
                              ) : isShort ? (
                                /* Short layout (44px - 68px, e.g. 45-60 min) */
                                <div className="flex-1 min-h-0 flex flex-col justify-center overflow-hidden">
                                  <div className="text-[9.5px] font-bold text-slate-900 leading-tight line-clamp-2 break-words" title={formatDisplayTitle(mainTitle)}>
                                    {displayTitle}
                                  </div>
                                </div>
                              ) : isMedium ? (
                                /* Medium layout (68px - 110px, e.g. 1.5 - 2 hrs) */
                                <div className="flex-1 min-h-0 flex flex-col justify-start overflow-hidden">
                                  <div className="text-[10px] sm:text-[10.5px] font-bold text-slate-900 leading-tight line-clamp-3 sm:line-clamp-4 break-words" title={formatDisplayTitle(mainTitle)}>
                                    {displayTitle}
                                  </div>
                                </div>
                              ) : (
                                /* Tall layout (height >= 110px, e.g. 2+ hrs) */
                                <div className="flex-1 min-h-0 flex flex-col justify-start overflow-hidden">
                                  <div className="text-[10.5px] sm:text-[11px] font-bold text-slate-900 leading-snug line-clamp-5 sm:line-clamp-6 break-words" title={formatDisplayTitle(mainTitle)}>
                                    {displayTitle}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Legend & Quick Summary (Ultra-compact footer) */}
        <div className="py-1 px-3 bg-[#f8fafc] border-t border-slate-200 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10px] text-slate-600 leading-tight">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold text-slate-700 text-[10px]">Categorías:</span>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#dbeafe] border border-[#bfdbfe]" />
              <span className="text-[10px]">Taller Municipal</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#fef3c7] border border-[#fde047]" />
              <span className="text-[10px]">Taller JJV</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#dcfce7] border border-[#bbf7d0]" />
              <span className="text-[10px]">Taller CCD / Deportes</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#d1fae5] border border-[#a7f3d0]" />
              <span className="text-[10px]">Préstamo / CAM</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#ffedd5] border border-[#fed7aa]" />
              <span className="text-[10px]">Ensayo / Danza</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-slate-500 font-mono text-[10px]">
            <span>Total: <strong>{dayReservations.length}</strong> {dayReservations.length === 1 ? 'actividad' : 'actividades'} en <strong>{activeSpaces.length}</strong> {activeSpaces.length === 1 ? 'espacio' : 'espacios'}</span>
          </div>
        </div>
      </div>

      {/* Print PDF Schedule Modal - Lazy Loaded with Suspense */}
      {isPrintModalOpen && (
        <Suspense fallback={null}>
          <PrintScheduleModal
            isOpen={isPrintModalOpen}
            onClose={() => setIsPrintModalOpen(false)}
            reservations={reservations}
            spaces={spaces}
            initialDate={dateStr}
          />
        </Suspense>
      )}

      {/* Floating Hover Card Popup (Appears on Mouse Over with full details) */}
      {hoveredCardInfo && !draggedReservation && (() => {
        const hoverRes = hoveredCardInfo.res;
        const hoverVisual = getReservationTypeVisual(hoverRes);
        const hoverTitle = (hoverRes.descripcion && hoverRes.descripcion.trim()) ? hoverRes.descripcion.trim() : hoverRes.tipoActividad;
        const hoverDisplayTitle = formatDisplayTitle(hoverTitle);
        const isConflict = hoveredCardInfo.isConflict;

        return (
          <div
            style={getHoverPopupStyle(hoveredCardInfo.rect)}
            className="bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-slate-300 p-3 text-slate-800 animate-in fade-in zoom-in-95 duration-150 transition-all select-none ring-1 ring-black/10"
          >
            {/* Top color stripe */}
            <div
              className="h-1.5 -mx-3 -mt-3 mb-2.5 rounded-t-xl"
              style={{ backgroundColor: hoverVisual.accent }}
            />

            {/* Header: Time, Space & Status */}
            <div className="flex items-center justify-between gap-1.5 mb-2 pb-1.5 border-b border-slate-100">
              <div className="flex items-center space-x-1.5 font-mono text-xs font-bold text-slate-900 tabular-nums">
                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>{hoverRes.horaInicio} – {hoverRes.horaFin}</span>
              </div>
              <div className="flex items-center space-x-1">
                {isConflict && (
                  <span className="text-[9px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-black uppercase tracking-tight flex items-center gap-0.5">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    <span>Topamiento</span>
                  </span>
                )}
                {hoverRes.importante === 'Sí' && (
                  <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                    <Flame className="w-2.5 h-2.5 text-amber-600" />
                    <span>Importante</span>
                  </span>
                )}
                {hoverRes.solicitudEliminacion && (
                  <span className="text-[9px] bg-amber-500 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-tight">
                    ⏳ En espera
                  </span>
                )}
              </div>
            </div>

            {/* Activity Title */}
            <div className="mb-2">
              <h4 className="text-xs font-bold text-slate-900 leading-snug line-clamp-3">
                {hoverDisplayTitle}
              </h4>
            </div>

            {/* Details Box */}
            <div className="bg-slate-50/90 rounded-lg p-2 space-y-1.5 border border-slate-200/70 text-[11px]">
              {/* Tipo de Reserva */}
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-slate-500 font-medium">Tipo de reserva:</span>
                <span className={`font-semibold px-2 py-0.5 rounded-full text-[10px] border ${hoverVisual.bgClass} ${hoverVisual.borderClass} ${hoverVisual.softTextClass}`}>
                  {formatDisplayTitle(hoverRes.tipoActividad || hoverVisual.label)}
                </span>
              </div>

              {/* Responsable */}
              <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200/50">
                <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  <span>Responsable:</span>
                </span>
                <span className="font-bold text-slate-800 text-right truncate max-w-[150px]" title={formatDisplayTitle(hoverRes.responsable)}>
                  {formatDisplayTitle(hoverRes.responsable || 'No especificado')}
                </span>
              </div>

              {/* Espacio */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-slate-400" />
                  <span>Espacio:</span>
                </span>
                <span className="font-semibold text-slate-700 text-right truncate max-w-[150px]">
                  {formatDisplayTitle(hoverRes.espacio)}
                </span>
              </div>

              {/* Contact Phone if present */}
              {hoverRes.telefonoContacto && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/50">
                  <span className="text-slate-500 font-medium shrink-0 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>Teléfono:</span>
                  </span>
                  <span className="font-mono text-[10.5px] font-semibold text-slate-700">
                    {hoverRes.telefonoContacto}
                  </span>
                </div>
              )}
            </div>

            {/* Footer instruction */}
            <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-slate-500 flex items-center justify-between">
              <span>💡 Clic para ver detalles completos</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export const DailyUsageView = React.memo(DailyUsageViewComponent);

