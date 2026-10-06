import React, { useState, useEffect, useRef } from 'react';
import { ViewMode } from '../types';
import { AuthUser, isCoordinatorOrAdmin, getSessionRemainingMs, refreshSession } from '../services/authService';
import {
  Calendar,
  Clock,
  BarChart3,
  AlertTriangle,
  Plus,
  ShieldCheck,
  Printer,
  LogOut,
  KeyRound,
  Building2,
  Bell,
  BellRing,
  Star,
  History,
  MoreHorizontal,
  ChevronDown,
  Cloud,
  CloudOff,
  RefreshCw,
  Database,
  Filter,
  Mail,
  Search,
  Smartphone,
  X
} from 'lucide-react';

interface NavbarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onNewReservation: () => void;
  onOpenImportExport: () => void;
  onOpenPrintModal?: () => void;
  onOpenGmailDispatch?: () => void;
  onOpenPasswordPrompt?: () => void;
  onOpenNotificationCenter?: () => void;
  onOpenAuditLog?: () => void;
  onOpenChangePassword?: () => void;
  onOpenCommandPalette?: () => void;
  unreadNotificationsCount?: number;
  pendingDeletionsCount?: number;
  onOpenPendingDeletions?: () => void;
  isFilterBarOpen?: boolean;
  onToggleFilterBar?: () => void;
  hasActiveFilters?: boolean;
  totalReservas: number;
  conflictsCount: number;
  currentUser?: AuthUser | null;
  onLogout?: () => void;
  isFirebaseConnected?: boolean;
  isFirebaseSyncing?: boolean;
  lastSyncTime?: Date | null;
  syncErrorMessage?: string | null;
  onRetrySync?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onViewChange,
  onNewReservation,
  onOpenImportExport,
  onOpenPrintModal,
  onOpenGmailDispatch,
  onOpenPasswordPrompt,
  onOpenNotificationCenter,
  onOpenAuditLog,
  onOpenChangePassword,
  onOpenCommandPalette,
  unreadNotificationsCount = 0,
  pendingDeletionsCount = 0,
  onOpenPendingDeletions,
  isFilterBarOpen = false,
  onToggleFilterBar,
  hasActiveFilters = false,
  totalReservas,
  conflictsCount,
  currentUser,
  onLogout,
  isFirebaseConnected = false,
  isFirebaseSyncing = false,
  lastSyncTime = null,
  syncErrorMessage = null,
  onRetrySync
}) => {
  // Session countdown
  const [sessionMinutesLeft, setSessionMinutesLeft] = useState<number>(60);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState<boolean>(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState<boolean>(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);

  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    const updateTime = () => {
      const ms = getSessionRemainingMs();
      setSessionMinutesLeft(Math.max(1, Math.ceil(ms / 60000)));
    };
    updateTime();
    const interval = setInterval(updateTime, 15000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 text-slate-900">
      <div className="w-full max-w-[1680px] mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-14 gap-1.5 sm:gap-3">
          {/* Logo & Brand Identity */}
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 shrink">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <span className="font-bold text-sm sm:text-base lg:text-lg tracking-tight text-slate-900 block truncate">
                CCD Diaguitas
              </span>
              <p className="text-xs text-slate-500 hidden xl:block truncate">
                Gestión de Espacios Comunitarios
              </p>
            </div>

            {/* Cloud Sync Status Indicator */}
            <div className="hidden xl:flex items-center pl-2.5 border-l border-slate-200">
              {isFirebaseSyncing ? (
                <div
                  id="sync-status-syncing"
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold"
                  title="Sincronizando cambios con Firebase Firestore"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 shrink-0" />
                  <span className="hidden 2xl:inline">Sincronizando...</span>
                </div>
              ) : isFirebaseConnected ? (
                <div
                  id="sync-status-connected"
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold"
                  title={`Conectado en tiempo real.${lastSyncTime ? ` Sincronizado: ${lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <Cloud className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="hidden 2xl:inline">En Línea</span>
                  {lastSyncTime && (
                    <span className="text-emerald-700/80 font-mono text-[11px]">
                      ({lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                    </span>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  id="sync-status-local"
                  onClick={onRetrySync}
                  className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-semibold transition cursor-pointer"
                  title={syncErrorMessage || 'Modo sin conexión. Clic para reintentar sincronización.'}
                >
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <CloudOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="hidden 2xl:inline">Caché Local</span>
                  <span className="underline text-amber-700 font-bold ml-1">Reintentar</span>
                </button>
              )}
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          <nav aria-label="Navegación principal" className="hidden md:flex items-center space-x-0.5 lg:space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink min-w-0 overflow-x-auto scrollbar-none">
            <button
              id="nav-tab-mobile"
              onClick={() => onViewChange('mobile')}
              className={`min-h-[40px] flex items-center space-x-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                currentView === 'mobile'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span className="hidden lg:inline">Agenda Móvil</span>
            </button>

            <button
              id="nav-tab-calendar"
              onClick={() => onViewChange('calendar')}
              className={`min-h-[40px] flex items-center space-x-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                currentView === 'calendar'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Calendario</span>
            </button>

            <button
              id="nav-tab-timeline"
              onClick={() => onViewChange('timeline')}
              className={`min-h-[40px] flex items-center space-x-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                currentView === 'timeline' || currentView === 'daily'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Uso Diario</span>
            </button>

            <button
              id="nav-tab-analytics"
              onClick={() => onViewChange('analytics')}
              className={`min-h-[40px] flex items-center space-x-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                currentView === 'analytics'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span className="hidden lg:inline">Métricas</span>
            </button>

            <button
              id="nav-tab-ratings"
              onClick={() => onViewChange('ratings')}
              className={`min-h-[40px] flex items-center space-x-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                currentView === 'ratings'
                  ? 'bg-white text-amber-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
              <span className="hidden lg:inline">Calificaciones</span>
            </button>

            {conflictsCount > 0 && (
              <button
                id="nav-tab-conflicts"
                onClick={() => onViewChange('conflicts')}
                className={`min-h-[40px] flex items-center space-x-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  currentView === 'conflicts'
                    ? 'bg-rose-600 text-white shadow-xs font-bold'
                    : 'bg-white text-slate-700 hover:text-slate-900 border border-slate-200'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 ${currentView === 'conflicts' ? 'text-white' : 'text-amber-600'}`} />
                <span className="hidden lg:inline">Conflictos</span>
                <span className={`text-[11px] font-extrabold px-1.5 py-0.5 rounded-full ${
                  currentView === 'conflicts'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {conflictsCount}
                </span>
              </button>
            )}

            <button
              id="nav-tab-admin"
              onClick={() => onViewChange('admin')}
              className={`min-h-[40px] flex items-center space-x-1.5 px-2.5 lg:px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                currentView === 'admin'
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Admin</span>
            </button>
          </nav>

          {/* Right Action Toolbar */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* Primary Action: Nueva Reserva (Prominent CTA) */}
            <button
              id="btn-new-reservation"
              onClick={onNewReservation}
              className="min-h-[40px] flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs transition active:scale-95 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0 stroke-[2.5]" />
              <span className="hidden sm:inline">Nueva Reserva</span>
              <span className="sm:hidden">Nueva</span>
            </button>

            {/* Notification Center Bell */}
            {onOpenNotificationCenter && (
              <button
                id="btn-navbar-notifications"
                type="button"
                onClick={onOpenNotificationCenter}
                aria-label={unreadNotificationsCount > 0 ? `Centro de notificaciones: ${unreadNotificationsCount} sin leer` : 'Centro de notificaciones'}
                className="min-w-[40px] min-h-[40px] sm:min-w-[44px] sm:min-h-[44px] relative p-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-blue-600 shadow-xs transition cursor-pointer flex items-center justify-center"
              >
                {unreadNotificationsCount > 0 ? (
                  <BellRing className="w-4 h-4 text-blue-600" />
                ) : (
                  <Bell className="w-4 h-4" />
                )}
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-xs border-2 border-white">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}

            {/* Spotlight / Command Palette Trigger */}
            {onOpenCommandPalette && (
              <button
                id="btn-navbar-command-palette"
                type="button"
                onClick={onOpenCommandPalette}
                aria-label="Buscar reservas o ejecutar comandos (Ctrl+K)"
                className="min-h-[40px] sm:min-h-[44px] hidden sm:flex items-center space-x-1.5 px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-600 hover:text-slate-900 shadow-2xs transition cursor-pointer text-xs font-semibold"
                title="Buscador rápido global y comandos (Ctrl + K)"
              >
                <Search className="w-4 h-4 text-slate-500" />
                <span className="hidden 2xl:inline text-slate-600">Buscar...</span>
                <kbd className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200 rounded shadow-2xs">
                  ⌘K
                </kbd>
              </button>
            )}

            {/* Filter Toggle Button (Kept hidden by default) */}
            {onToggleFilterBar && (
              <button
                id="btn-navbar-toggle-filters"
                type="button"
                onClick={onToggleFilterBar}
                aria-label={isFilterBarOpen ? 'Ocultar panel de filtros' : 'Mostrar panel de filtros'}
                aria-pressed={isFilterBarOpen}
                className={`min-h-[40px] sm:min-h-[44px] flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-xl border transition cursor-pointer text-xs font-semibold ${
                  isFilterBarOpen
                    ? 'bg-blue-50 text-blue-700 border-blue-300 shadow-2xs'
                    : hasActiveFilters
                    ? 'bg-amber-50 text-amber-800 border-amber-300 shadow-2xs'
                    : 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border-slate-200 shadow-2xs'
                }`}
                title={isFilterBarOpen ? 'Ocultar filtros' : 'Mostrar filtros de búsqueda'}
              >
                <Filter className="w-4 h-4 text-slate-600" />
                <span className="hidden xl:inline">Filtros</span>
                {hasActiveFilters && (
                  <span className="w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white"></span>
                )}
              </button>
            )}

            {/* Herramientas Dropdown (Desktop) */}
            <div className="relative hidden md:block" ref={toolsMenuRef}>
              <button
                id="btn-navbar-more-options"
                type="button"
                onClick={() => setIsToolsMenuOpen(!isToolsMenuOpen)}
                aria-label="Menú de herramientas del sistema"
                aria-expanded={isToolsMenuOpen}
                className="min-h-[40px] sm:min-h-[44px] flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 shadow-xs transition cursor-pointer text-xs font-semibold"
              >
                <MoreHorizontal className="w-4 h-4 text-slate-600" />
                <span className="hidden xl:inline">Herramientas</span>
                {pendingDeletionsCount > 0 && (
                  <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 rounded-full">
                    {pendingDeletionsCount}
                  </span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isToolsMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isToolsMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95">
                  {onOpenPendingDeletions && isCoordinatorOrAdmin(currentUser) && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        onOpenPendingDeletions();
                      }}
                      className="min-h-[44px] w-full text-left px-4 py-2.5 text-xs font-medium text-amber-900 hover:bg-amber-50 flex items-center space-x-3 transition cursor-pointer"
                    >
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">Eliminaciones en Espera</span>
                          {pendingDeletionsCount > 0 && (
                            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 rounded-full">
                              {pendingDeletionsCount}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 block truncate">Autorizar o descartar solicitudes</span>
                      </div>
                    </button>
                  )}

                  {onOpenPrintModal && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        onOpenPrintModal();
                      }}
                      className="min-h-[44px] w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-3 transition cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold block">Imprimir Planilla</span>
                        <span className="text-[11px] text-slate-400 block truncate">Exportar horario diario en PDF</span>
                      </div>
                    </button>
                  )}

                  {onOpenGmailDispatch && (
                    <button
                      type="button"
                      id="navbar-btn-gmail-dispatch"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        onOpenGmailDispatch();
                      }}
                      className="min-h-[44px] w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-3 transition cursor-pointer"
                    >
                      <Mail className="w-4 h-4 text-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold block">Enviar por Gmail</span>
                          <span className="text-[9px] font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">API</span>
                        </div>
                        <span className="text-[11px] text-slate-400 block truncate">Despacho diario cristianshute@gmail.com</span>
                      </div>
                    </button>
                  )}

                  {onOpenAuditLog && isCoordinatorOrAdmin(currentUser) && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsToolsMenuOpen(false);
                        onOpenAuditLog();
                      }}
                      className="min-h-[44px] w-full text-left px-4 py-2.5 text-xs font-medium text-indigo-900 hover:bg-indigo-50 flex items-center space-x-3 transition cursor-pointer"
                    >
                      <History className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-bold block">Restaurar Cambios</span>
                        <span className="text-[11px] text-slate-500 block truncate">Papelera y registro de auditoría</span>
                      </div>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsToolsMenuOpen(false);
                      onOpenImportExport();
                    }}
                    className="min-h-[44px] w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center space-x-3 transition cursor-pointer"
                  >
                    <Database className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-bold block">Copias de Seguridad y Base de Datos</span>
                      <span className="text-[11px] text-slate-400 block truncate">Respaldos periódicos y CSV</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* User Session & Profile Controls */}
            {currentUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  id="btn-navbar-user-profile"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  aria-label={`Perfil de usuario: ${currentUser.name}. Tiempo de sesión: ${sessionMinutesLeft} minutos.`}
                  className="min-h-[44px] flex items-center space-x-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition cursor-pointer"
                >
                  <div className={`w-7 h-7 rounded-lg ${currentUser.avatarColor || 'bg-blue-600'} text-white text-xs font-bold flex items-center justify-center shadow-xs shrink-0`}>
                    {currentUser.initials}
                  </div>
                  <div className="hidden xl:block text-left leading-tight">
                    <span className="text-xs font-bold text-slate-800 block truncate max-w-[100px]">
                      {currentUser.name}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium block truncate">
                      {currentUser.role}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-1.5 py-0.5 rounded-md hidden sm:inline-block">
                    {sessionMinutesLeft}m
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isUserMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 animate-in fade-in zoom-in-95">
                    <div className="px-4 py-2 border-b border-slate-100">
                      <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</p>
                      <p className="text-[11px] text-slate-500 capitalize">{currentUser.role}</p>
                      <div className="mt-2 flex items-center justify-between bg-blue-50/70 p-2 rounded-lg text-[11px] text-blue-800">
                        <span>Sesión restante: {sessionMinutesLeft} min</span>
                        <button
                          type="button"
                          onClick={() => {
                            refreshSession();
                            setSessionMinutesLeft(60);
                          }}
                          className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                        >
                          Reiniciar
                        </button>
                      </div>
                    </div>

                    {onOpenChangePassword && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onOpenChangePassword();
                        }}
                        className="min-h-[44px] w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-2.5 transition cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4 text-amber-600" />
                        <span>Cambiar mi Clave</span>
                      </button>
                    )}

                    {onLogout && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          onLogout();
                        }}
                        className="min-h-[44px] w-full text-left px-4 py-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 flex items-center space-x-2.5 transition cursor-pointer border-t border-slate-100"
                      >
                        <LogOut className="w-4 h-4 text-rose-600" />
                        <span>Cerrar Sesión</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <button
                id="btn-navbar-unlock"
                type="button"
                onClick={onOpenPasswordPrompt}
                className="min-h-[42px] flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold transition cursor-pointer"
              >
                <KeyRound className="w-4 h-4 text-amber-600" />
                <span>Clave de Edición</span>
              </button>
            )}

            {/* Mobile Quick Search Button */}
            {onOpenCommandPalette && (
              <button
                type="button"
                id="btn-mobile-command-palette"
                onClick={onOpenCommandPalette}
                aria-label="Búsqueda rápida y comandos (Ctrl+K)"
                className="sm:hidden min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition"
                title="Buscador rápido"
              >
                <Search className="w-5 h-5 text-slate-600" />
              </button>
            )}

            {/* Mobile Tools Drawer Button */}
            <button
              type="button"
              id="btn-mobile-more-tools"
              onClick={() => setIsMobileDrawerOpen(true)}
              aria-label="Abrir menú de herramientas y opciones"
              className="md:hidden min-w-[44px] min-h-[44px] p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer transition"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Tab Bar (WCAG 2.5.8 Compliant: min-h-[44px] touch targets) */}
      <nav aria-label="Navegación móvil" className="flex md:hidden overflow-x-auto px-2 py-1.5 space-x-1.5 border-t border-slate-200 bg-slate-50 scrollbar-none items-center">
        <button
          type="button"
          id="nav-mobile-tab-mobile"
          onClick={() => onViewChange('mobile')}
          className={`min-h-[44px] min-w-[44px] flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap font-bold transition cursor-pointer ${
            currentView === 'mobile' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'
          }`}
        >
          <Smartphone className="w-4 h-4 shrink-0" />
          <span>Agenda Móvil</span>
        </button>

        <button
          type="button"
          onClick={() => onViewChange('calendar')}
          className={`min-h-[44px] min-w-[44px] flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap font-bold transition cursor-pointer ${
            currentView === 'calendar' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span>Calendario</span>
        </button>

        <button
          type="button"
          onClick={() => onViewChange('timeline')}
          className={`min-h-[44px] min-w-[44px] flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap font-bold transition cursor-pointer ${
            currentView === 'timeline' || currentView === 'daily' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4 shrink-0" />
          <span>Uso Diario</span>
        </button>

        <button
          type="button"
          onClick={() => onViewChange('analytics')}
          className={`min-h-[44px] min-w-[44px] flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap font-bold transition cursor-pointer ${
            currentView === 'analytics' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          <span>Métricas</span>
        </button>

        <button
          type="button"
          onClick={() => onViewChange('ratings')}
          className={`min-h-[44px] min-w-[44px] flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap font-bold transition cursor-pointer ${
            currentView === 'ratings' ? 'bg-amber-500 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'
          }`}
        >
          <Star className="w-4 h-4 shrink-0" />
          <span>Calificaciones</span>
        </button>

        {conflictsCount > 0 && (
          <button
            type="button"
            onClick={() => onViewChange('conflicts')}
            className={`min-h-[44px] min-w-[44px] flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap font-bold transition cursor-pointer ${
              currentView === 'conflicts' ? 'bg-rose-600 text-white shadow-xs' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Topamientos ({conflictsCount})</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onViewChange('admin')}
          className={`min-h-[44px] min-w-[44px] flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs whitespace-nowrap font-bold transition cursor-pointer ${
            currentView === 'admin' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 border border-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Admin</span>
        </button>
      </nav>

      {/* Mobile Tools Drawer Modal (Clean touch-friendly interface) */}
      {isMobileDrawerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menú de herramientas móviles"
          className="fixed inset-0 z-50 md:hidden flex flex-col justify-end bg-slate-900/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsMobileDrawerOpen(false)}
        >
          <div
            className="bg-white rounded-t-2xl p-5 space-y-3 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="font-bold text-base text-slate-900">Herramientas del Sistema</span>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Cerrar herramientas"
                className="min-w-[44px] min-h-[44px] p-2 text-slate-400 hover:text-slate-700 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {onOpenCommandPalette && (
                <button
                  type="button"
                  id="mobile-drawer-btn-command-palette"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenCommandPalette();
                  }}
                  className="min-h-[48px] w-full px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-between bg-blue-50/80 hover:bg-blue-100/80 text-blue-900 border border-blue-200 transition cursor-pointer"
                >
                  <div className="flex items-center space-x-3">
                    <Search className="w-5 h-5 text-blue-600" />
                    <span>Buscador Rápido (Spotlight)</span>
                  </div>
                  <kbd className="text-xs font-mono font-bold px-2 py-0.5 bg-white border border-blue-200 rounded text-blue-700">
                    ⌘K
                  </kbd>
                </button>
              )}

              {onToggleFilterBar && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onToggleFilterBar();
                  }}
                  className={`min-h-[48px] w-full px-4 py-3 rounded-xl text-sm font-bold flex items-center justify-between border transition cursor-pointer ${
                    isFilterBarOpen
                      ? 'bg-blue-50 text-blue-900 border-blue-300'
                      : hasActiveFilters
                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                      : 'bg-slate-50 text-slate-800 border-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Filter className="w-5 h-5 text-blue-600" />
                    <span>Filtros de Búsqueda</span>
                  </div>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200">
                    {isFilterBarOpen ? 'Visible' : hasActiveFilters ? 'Activo (Oculto)' : 'Oculto'}
                  </span>
                </button>
              )}

              {onOpenPendingDeletions && isCoordinatorOrAdmin(currentUser) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenPendingDeletions();
                  }}
                  className="min-h-[48px] w-full px-4 py-3 rounded-xl bg-amber-50 text-amber-900 text-sm font-bold flex items-center justify-between border border-amber-200"
                >
                  <div className="flex items-center space-x-3">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <span>Eliminaciones en Espera</span>
                  </div>
                  {pendingDeletionsCount > 0 && (
                    <span className="bg-amber-500 text-white text-xs font-black px-2 py-0.5 rounded-full">
                      {pendingDeletionsCount}
                    </span>
                  )}
                </button>
              )}

              {onOpenPrintModal && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenPrintModal();
                  }}
                  className="min-h-[48px] w-full px-4 py-3 rounded-xl bg-blue-50 text-blue-900 text-sm font-bold flex items-center space-x-3 border border-blue-200"
                >
                  <Printer className="w-5 h-5 text-blue-600" />
                  <span>Imprimir Planilla Diaria (PDF)</span>
                </button>
              )}

              {onOpenGmailDispatch && (
                <button
                  type="button"
                  id="mobile-drawer-btn-gmail-dispatch"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenGmailDispatch();
                  }}
                  className="min-h-[48px] w-full px-4 py-3 rounded-xl bg-blue-50 text-blue-900 text-sm font-bold flex items-center space-x-3 border border-blue-200"
                >
                  <Mail className="w-5 h-5 text-blue-600" />
                  <span>Enviar Actividades por Gmail</span>
                </button>
              )}

              {onOpenAuditLog && isCoordinatorOrAdmin(currentUser) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileDrawerOpen(false);
                    onOpenAuditLog();
                  }}
                  className="min-h-[48px] w-full px-4 py-3 rounded-xl bg-indigo-50 text-indigo-900 text-sm font-bold flex items-center space-x-3 border border-indigo-200"
                >
                  <History className="w-5 h-5 text-indigo-600" />
                  <span>Restaurar Cambios y Auditoría</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsMobileDrawerOpen(false);
                  onOpenImportExport();
                }}
                className="min-h-[48px] w-full px-4 py-3 rounded-xl bg-emerald-50 text-emerald-900 text-sm font-bold flex items-center space-x-3 border border-emerald-200"
              >
                <Database className="w-5 h-5 text-emerald-600" />
                <span>Respaldos y Base de Datos</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
