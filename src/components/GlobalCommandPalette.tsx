import { formatDisplayTitle } from '../utils/reservationVisuals';
import { ModalOverlay } from './common/ModalOverlay';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Reservation, SpaceInfo, ViewMode } from '../types';
import {
  Search,
  Calendar,
  Clock,
  Building2,
  User,
  Plus,
  AlertTriangle,
  Printer,
  Mail,
  History,
  BarChart3,
  ShieldCheck,
  Star,
  Users,
  Database,
  Filter,
  X,
  CornerDownLeft,
  ChevronRight,
  ArrowUpDown,
  Tag
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { fuzzySearchReservations, fuzzySearchItems } from '../utils/fuzzySearch';
import { ConfirmationModal } from './common/ConfirmationModal';
import { isTopmostDialog } from '../utils/dialogKeyboard';

interface PaletteCommandItem {
  id: string;
  type: 'action' | 'reservation' | 'applicant' | 'space';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: 'blue' | 'rose' | 'amber' | 'emerald' | 'purple' | 'slate';
  icon: React.ReactNode;
  metadata?: string;
  isDestructive?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
  onSelect: () => void;
}

interface GlobalCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  reservations: readonly Reservation[];
  spaces: readonly SpaceInfo[];
  onSelectReservation: (reservation: Reservation) => void;
  onNavigateToView: (view: ViewMode) => void;
  onNewReservation: () => void;
  onOpenPrintModal?: () => void;
  onOpenGmailDispatch?: () => void;
  onOpenAuditLog?: () => void;
  onOpenImportExport?: () => void;
  onNavigateToDate?: (date: Date) => void;
  onFilterBySpace?: (spaceName: string) => void;
  onFilterByApplicant?: (nameOrRut: string) => void;
  onClearFilters?: () => void;
  conflictsCount?: number;
  hasActiveFilters?: boolean;
}

function normalizeStr(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export const GlobalCommandPalette: React.FC<GlobalCommandPaletteProps> = ({
  isOpen,
  onClose,
  reservations,
  spaces,
  onSelectReservation,
  onNavigateToView,
  onNewReservation,
  onOpenPrintModal,
  onOpenGmailDispatch,
  onOpenAuditLog,
  onOpenImportExport,
  onNavigateToDate,
  onFilterBySpace,
  onFilterByApplicant,
  onClearFilters,
  conflictsCount = 0,
  hasActiveFilters = false
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus input automatically when palette opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        if (isTopmostDialog(dialogRef.current)) inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Unique applicants index derived from reservations
  const applicantsList = useMemo(() => {
    const map = new Map<string, { responsable: string; rut?: string; phone?: string; count: number }>();
    for (const r of reservations) {
      const resp = (r.responsable || '').trim();
      if (!resp) continue;
      const key = resp.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.rut && r.rut) existing.rut = r.rut;
        if (!existing.phone && r.telefonoContacto) existing.phone = r.telefonoContacto;
      } else {
        map.set(key, {
          responsable: resp,
          rut: r.rut,
          phone: r.telefonoContacto,
          count: 1
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [reservations]);

  // Categorized items based on query
  const { actions, reservationItems, applicantItems, spaceItems, flattenedItems } = useMemo(() => {
    const normQ = normalizeStr(query);
    const cleanRutQ = query.replace(/[^0-9kK]/g, '').toLowerCase();

    // 1. SYSTEM ACTIONS
    const systemActions: PaletteCommandItem[] = [
      {
        id: 'action-new-res',
        type: 'action',
        title: 'Nueva Reserva de Espacio',
        subtitle: 'Crear una reserva puntual o taller recurrente',
        badge: 'Atajo: Alt+N',
        badgeColor: 'blue',
        icon: <Plus className="w-4 h-4 text-blue-600" />,
        onSelect: () => {
          onClose();
          onNewReservation();
        }
      },
      {
        id: 'action-view-calendar',
        type: 'action',
        title: 'Ver Calendario Mensual',
        subtitle: 'Cuadrícula general de actividades y ocupación',
        badge: 'Vista',
        badgeColor: 'slate',
        icon: <Calendar className="w-4 h-4 text-indigo-600" />,
        onSelect: () => {
          onClose();
          onNavigateToView('calendar');
        }
      },
      {
        id: 'action-view-timeline',
        type: 'action',
        title: 'Ver Uso Diario / Cronograma',
        subtitle: 'Línea de tiempo horaria por cancha y sala',
        badge: 'Vista',
        badgeColor: 'slate',
        icon: <Clock className="w-4 h-4 text-cyan-600" />,
        onSelect: () => {
          onClose();
          onNavigateToView('timeline');
        }
      },
      {
        id: 'action-view-conflicts',
        type: 'action',
        title: 'Revisar Conflictos y Topamientos',
        subtitle: conflictsCount > 0 ? `${conflictsCount} topamientos detectados en el sistema` : 'Sin conflictos activos detectados',
        badge: conflictsCount > 0 ? `${conflictsCount} Alertas` : 'Al día',
        badgeColor: conflictsCount > 0 ? 'rose' : 'emerald',
        icon: <AlertTriangle className={`w-4 h-4 ${conflictsCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />,
        onSelect: () => {
          onClose();
          onNavigateToView('conflicts');
        }
      },
      {
        id: 'action-view-applicants',
        type: 'action',
        title: 'Directorio de Solicitantes y Vecinos',
        subtitle: 'Historial, RUT, teléfonos y asistencia comunitaria',
        badge: 'Directorio',
        badgeColor: 'slate',
        icon: <Users className="w-4 h-4 text-teal-600" />,
        onSelect: () => {
          onClose();
          onNavigateToView('directory');
        }
      },
      {
        id: 'action-view-analytics',
        type: 'action',
        title: 'Métricas y Analítica D3',
        subtitle: 'Horas reservadas, aforo y demanda por espacio',
        badge: 'D3 BI',
        badgeColor: 'purple',
        icon: <BarChart3 className="w-4 h-4 text-purple-600" />,
        onSelect: () => {
          onClose();
          onNavigateToView('analytics');
        }
      },
      {
        id: 'action-view-ratings',
        type: 'action',
        title: 'Calificaciones de Espacios',
        subtitle: 'Evaluaciones de limpieza, puntualidad y cuidado',
        badge: 'Opiniones',
        badgeColor: 'amber',
        icon: <Star className="w-4 h-4 text-amber-500 fill-amber-400" />,
        onSelect: () => {
          onClose();
          onNavigateToView('ratings');
        }
      },
      {
        id: 'action-view-admin',
        type: 'action',
        title: 'Panel de Administración',
        subtitle: 'Configuración de espacios, tipos de préstamo y usuarios',
        badge: 'Admin',
        badgeColor: 'blue',
        icon: <ShieldCheck className="w-4 h-4 text-blue-700" />,
        onSelect: () => {
          onClose();
          onNavigateToView('admin');
        }
      }
    ];

    if (onOpenPrintModal) {
      systemActions.push({
        id: 'action-print',
        type: 'action',
        title: 'Imprimir Planilla Diaria en PDF',
        subtitle: 'Exportar hoja de ruta de turnos y eventos',
        badge: 'PDF',
        badgeColor: 'slate',
        icon: <Printer className="w-4 h-4 text-slate-700" />,
        onSelect: () => {
          onClose();
          onOpenPrintModal();
        }
      });
    }

    if (onOpenGmailDispatch) {
      systemActions.push({
        id: 'action-gmail',
        type: 'action',
        title: 'Despacho Diario por Gmail',
        subtitle: 'Enviar resumen de actividades del día por correo',
        badge: 'Email',
        badgeColor: 'blue',
        icon: <Mail className="w-4 h-4 text-blue-600" />,
        onSelect: () => {
          onClose();
          onOpenGmailDispatch();
        }
      });
    }

    if (onOpenAuditLog) {
      systemActions.push({
        id: 'action-audit',
        type: 'action',
        title: 'Restaurar Cambios y Auditoría',
        subtitle: 'Registro histórico de altas, bajas y modificaciones',
        badge: 'Seguridad',
        badgeColor: 'slate',
        icon: <History className="w-4 h-4 text-slate-600" />,
        onSelect: () => {
          onClose();
          onOpenAuditLog();
        }
      });
    }

    if (onOpenImportExport) {
      systemActions.push({
        id: 'action-backup',
        type: 'action',
        title: 'Copias de Seguridad y Base de Datos',
        subtitle: 'Descargar respaldo JSON/CSV o sincronizar',
        badge: 'Datos',
        badgeColor: 'emerald',
        icon: <Database className="w-4 h-4 text-emerald-600" />,
        onSelect: () => {
          onClose();
          onOpenImportExport();
        }
      });
    }

    if (hasActiveFilters && onClearFilters) {
      systemActions.unshift({
        id: 'action-clear-filters',
        type: 'action',
        title: 'Limpiar Filtros Activos',
        subtitle: 'Restablecer búsqueda para ver todas las reservas',
        badge: 'Filtros',
        badgeColor: 'amber',
        icon: <Filter className="w-4 h-4 text-amber-600" />,
        onSelect: () => {
          onClose();
          onClearFilters();
        }
      });
    }

    // 1. SYSTEM ACTIONS (Typo-tolerant matching e.g. "calednario", "topamiento")
    const filteredActions = normQ
      ? fuzzySearchItems(systemActions, query, ['title', 'subtitle', 'badge'], 0.45)
      : systemActions;

    // 2. RESERVATIONS SEARCH (up to 8 matches, with Fuse.js fuzzy search)
    let matchedReservations: PaletteCommandItem[] = [];
    if (normQ.length >= 2) {
      const results = fuzzySearchReservations(Array.from(reservations), query).slice(0, 8);

      matchedReservations = results.map((r) => {
        let dateLabel = r.fecha;
        try {
          dateLabel = format(parseISO(r.fecha), "EEEE d 'de' MMMM", { locale: es });
        } catch {
          // fallback
        }

        const isRecurrente = r.actividadRecurrente === 'Sí' || r.actividadRecurrente === 'Múltiples';

        return {
          id: `res-${r.id}`,
          type: 'reservation',
          title: formatDisplayTitle(r.tipoActividad || r.descripcion || 'Reserva sin título'),
          subtitle: `${formatDisplayTitle(r.responsable)}${r.rut ? ` (${r.rut})` : ''} • ${formatDisplayTitle(r.espacio)}`,
          metadata: `${dateLabel} • ${r.horaInicio} - ${r.horaFin}`,
          badge: isRecurrente ? 'Recurrente' : undefined,
          badgeColor: isRecurrente ? 'purple' : undefined,
          icon: <Calendar className="w-4 h-4 text-blue-600" />,
          onSelect: () => {
            onClose();
            onSelectReservation(r);
            if (onNavigateToDate && r.fecha) {
              try {
                onNavigateToDate(parseISO(r.fecha));
              } catch {
                // ignore
              }
            }
          }
        };
      });
    }

    // 3. APPLICANTS SEARCH (up to 4 matches, typo-tolerant)
    let matchedApplicants: PaletteCommandItem[] = [];
    if (normQ.length >= 2) {
      const fuzzyApps = fuzzySearchItems(applicantsList, query, ['responsable', 'rut', 'phone'], 0.4);
      const matchingApps = fuzzyApps.slice(0, 4);

      matchedApplicants = matchingApps.map((app) => ({
        id: `applicant-${app.responsable}`,
        type: 'applicant',
        title: formatDisplayTitle(app.responsable),
        subtitle: `${app.rut ? `RUT: ${app.rut} • ` : ''}${app.count === 1 ? '1 reserva registrada' : `${app.count} reservas registradas`}`,
        badge: 'Vecino',
        badgeColor: 'emerald',
        icon: <User className="w-4 h-4 text-emerald-600" />,
        onSelect: () => {
          onClose();
          if (onFilterByApplicant) {
            onFilterByApplicant(app.responsable);
          }
        }
      }));
    }

    // 4. SPACES SEARCH (up to 4 matches, typo-tolerant)
    const matchedSpaces: PaletteCommandItem[] = (
      normQ
        ? fuzzySearchItems(spaces as SpaceInfo[], query, ['name', 'description'], 0.45).slice(0, 4)
        : (spaces as SpaceInfo[]).slice(0, 5)
    ).map((s) => ({
      id: `space-${s.id}`,
      type: 'space',
      title: formatDisplayTitle(s.name),
      subtitle: s.capacity ? `Aforo: ${s.capacity} personas` : 'Espacio comunitario',
      badge: 'Espacio',
      badgeColor: 'blue',
      icon: <Building2 className="w-4 h-4 text-blue-600" />,
      onSelect: () => {
        onClose();
        if (onFilterBySpace) {
          onFilterBySpace(s.name);
        }
      }
    }));


    // Flatten all for keyboard navigation
    const allItems = [
      ...filteredActions,
      ...matchedReservations,
      ...matchedApplicants,
      ...(normQ ? matchedSpaces : [])
    ];

    return {
      actions: filteredActions,
      reservationItems: matchedReservations,
      applicantItems: matchedApplicants,
      spaceItems: matchedSpaces,
      flattenedItems: allItems
    };
  }, [
    query,
    reservations,
    spaces,
    applicantsList,
    conflictsCount,
    hasActiveFilters,
    onClose,
    onNewReservation,
    onNavigateToView,
    onOpenPrintModal,
    onOpenGmailDispatch,
    onOpenAuditLog,
    onOpenImportExport,
    onSelectReservation,
    onNavigateToDate,
    onFilterBySpace,
    onFilterByApplicant,
    onClearFilters
  ]);

  // Adjust selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelectItem = useCallback((item: PaletteCommandItem) => {
    if (item.isDestructive) {
      setConfirmDialog({
        isOpen: true,
        title: item.confirmTitle || item.title,
        message:
          item.confirmMessage ||
          '¿Estás seguro de que deseas ejecutar esta acción? Esta operación puede ser irreversible.',
        variant: 'danger',
        confirmLabel: 'Confirmar y Ejecutar',
        onConfirm: () => {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          item.onSelect();
        }
      });
      return;
    }
    item.onSelect();
  }, []);

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== inputRef.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229 || confirmDialog.isOpen || flattenedItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flattenedItems.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flattenedItems.length) % flattenedItems.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const currentItem = flattenedItems[Math.min(selectedIndex, flattenedItems.length - 1)];
      if (currentItem) {
        handleSelectItem(currentItem);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(`[data-index="${selectedIndex}"]`);
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex, flattenedItems.length, query]);

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={onClose}
      id="global-command-palette"
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="Buscador rápido global y comandos"
      className="fixed inset-0 flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh] transition-all">
        {/* Search Header Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 bg-slate-50/70">
          <Search className="w-5 h-5 text-blue-600 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar reservas y comandos"
            placeholder="Buscar por taller, vecino, RUT, cancha, ID o comando..."
            className="flex-1 bg-transparent text-sm sm:text-base font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/60 transition cursor-pointer"
              title="Borrar texto"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium text-slate-500 bg-white border border-slate-200 rounded-md shadow-2xs">
              ESC
            </kbd>
          )}
          <button type="button" aria-label="Cerrar buscador" title="Cerrar buscador (Esc)" onClick={onClose}
            className="ml-2 p-1 text-slate-500 hover:text-slate-800 rounded-md hover:bg-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 divide-y divide-slate-100/60 space-y-2 overscroll-contain"
        >
          {flattenedItems.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No se encontraron resultados para "{query}"</p>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Prueba buscando por nombre del vecino, RUT (sin puntos), tipo de taller o espacio.
              </p>
            </div>
          ) : (
            <>
              {/* Categoría: Reservas */}
              {reservationItems.length > 0 && (
                <div className="pt-1">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Reservas Encontradas</span>
                    <span className="text-slate-400 font-mono font-normal">({reservationItems.length})</span>
                  </div>
                  <div className="space-y-1">
                    {reservationItems.map((item) => {
                      const itemIdx = flattenedItems.findIndex((f) => f.id === item.id);
                      const isSelected = itemIdx === selectedIndex;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          data-index={itemIdx}
                          onFocus={() => setSelectedIndex(itemIdx)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          onClick={() => handleSelectItem(item)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition text-left ${
                            isSelected
                              ? 'bg-blue-50/90 text-blue-950 ring-1 ring-blue-500/30'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-start space-x-3 min-w-0 flex-1">
                            <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${isSelected ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}>
                              {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-xs sm:text-sm truncate block">
                                  {item.title}
                                </span>
                                {item.badge && (
                                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 shrink-0">
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                {item.subtitle}
                              </p>
                              {item.metadata && (
                                <p className="text-[11px] font-medium text-slate-400 mt-0.5 flex items-center space-x-1">
                                  <span>{item.metadata}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 ml-2">
                            <span className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center space-x-1 ${
                              isSelected ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-400'
                            }`}>
                              <span>Abrir</span>
                              <CornerDownLeft className="w-3 h-3" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Categoría: Vecinos / Solicitantes */}
              {applicantItems.length > 0 && (
                <div className="pt-2">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Vecinos y Solicitantes</span>
                    <span className="text-slate-400 font-mono font-normal">({applicantItems.length})</span>
                  </div>
                  <div className="space-y-1">
                    {applicantItems.map((item) => {
                      const itemIdx = flattenedItems.findIndex((f) => f.id === item.id);
                      const isSelected = itemIdx === selectedIndex;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          data-index={itemIdx}
                          onFocus={() => setSelectedIndex(itemIdx)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          onClick={() => handleSelectItem(item)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition text-left ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-500/30'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                              {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-xs sm:text-sm block truncate">
                                {item.title}
                              </span>
                              <p className="text-xs text-slate-500 truncate mt-0.5">
                                {item.subtitle}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 ml-2">
                            <span className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center space-x-1 ${
                              isSelected ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-400'
                            }`}>
                              <span>Filtrar</span>
                              <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Categoría: Espacios Físicos (si hay query o como atajo) */}
              {query && spaceItems.length > 0 && (
                <div className="pt-2">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Espacios Físicos</span>
                  </div>
                  <div className="space-y-1">
                    {spaceItems.map((item) => {
                      const itemIdx = flattenedItems.findIndex((f) => f.id === item.id);
                      const isSelected = itemIdx === selectedIndex;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          data-index={itemIdx}
                          onFocus={() => setSelectedIndex(itemIdx)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          onClick={() => handleSelectItem(item)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition text-left ${
                            isSelected
                              ? 'bg-blue-50 text-blue-950 ring-1 ring-blue-500/30'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className={`p-2 rounded-lg shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}>
                              {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-xs sm:text-sm block truncate">
                                {item.title}
                              </span>
                              <p className="text-xs text-slate-500 truncate">
                                {item.subtitle}
                              </p>
                            </div>
                          </div>
                          <div className="shrink-0 ml-2">
                            <span className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center space-x-1 ${
                              isSelected ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-400'
                            }`}>
                              <span>Ver agenda</span>
                              <ChevronRight className="w-3 h-3" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Categoría: Acciones y Navegación del Sistema */}
              {actions.length > 0 && (
                <div className="pt-2">
                  <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>{query ? 'Comandos y Vistas' : 'Acciones Rápidas del Sistema'}</span>
                  </div>
                  <div className="space-y-1">
                    {actions.map((item) => {
                      const itemIdx = flattenedItems.findIndex((f) => f.id === item.id);
                      const isSelected = itemIdx === selectedIndex;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          data-index={itemIdx}
                          onFocus={() => setSelectedIndex(itemIdx)}
                          onMouseEnter={() => setSelectedIndex(itemIdx)}
                          onClick={() => handleSelectItem(item)}
                          className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition text-left ${
                            isSelected
                              ? 'bg-slate-100 text-slate-900 ring-1 ring-slate-300'
                              : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0 flex-1">
                            <div className="p-2 rounded-lg bg-slate-100 text-slate-700 shrink-0">
                              {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-xs sm:text-sm truncate block">
                                  {item.title}
                                </span>
                                {item.badge && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                      item.badgeColor === 'rose'
                                        ? 'bg-rose-100 text-rose-700'
                                        : item.badgeColor === 'emerald'
                                        ? 'bg-emerald-100 text-emerald-700'
                                        : item.badgeColor === 'amber'
                                        ? 'bg-amber-100 text-amber-800'
                                        : item.badgeColor === 'purple'
                                        ? 'bg-purple-100 text-purple-700'
                                        : item.badgeColor === 'blue'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {item.badge}
                                  </span>
                                )}
                              </div>
                              {item.subtitle && (
                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                  {item.subtitle}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 ml-2">
                            <span className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center space-x-1 ${
                              isSelected ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-400'
                            }`}>
                              <span>Ejecutar</span>
                              <CornerDownLeft className="w-3 h-3" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="inline-flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-600">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-600">↓</kbd>
              <span className="hidden sm:inline text-slate-400">navegar</span>
            </span>
            <span className="inline-flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-600">↵</kbd>
              <span className="hidden sm:inline text-slate-400">seleccionar</span>
            </span>
            <span className="inline-flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono text-[10px] text-slate-600">esc</kbd>
              <span className="hidden sm:inline text-slate-400">cerrar</span>
            </span>
          </div>
          <span className="font-semibold text-slate-400 hidden sm:inline">
            CCD Diaguitas • Spotlight
          </span>
        </div>
      </div>

      <ConfirmationModal
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        variant={confirmDialog.variant}
        confirmLabel={confirmDialog.confirmLabel}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />
    </ModalOverlay>
  );
};
