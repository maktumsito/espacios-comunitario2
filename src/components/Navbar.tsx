import React, { useEffect, useRef, useState } from "react";
import { ModalOverlay } from "./common/ModalOverlay";
import { ViewMode } from "../types";
import {
  AuthUser,
  isCoordinatorOrAdmin,
  getSessionRemainingMs,
  refreshSession,
} from "../services/authService";
import { showToast } from "../services/toastNotificationService";
import {
  Calendar,
  BarChart3,
  AlertTriangle,
  Plus,
  ShieldCheck,
  Printer,
  LogOut,
  KeyRound,
  Building2,
  Bell,
  Star,
  History,
  MoreHorizontal,
  Cloud,
  CloudOff,
  RefreshCw,
  Database,
  Mail,
  Search,
  X,
  Trash2,
} from "lucide-react";

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
  onDeleteDay?: () => void;
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

const agendaViews: ViewMode[] = ["calendar", "daily", "timeline", "mobile"];

const NavbarComponent: React.FC<NavbarProps> = ({
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
  conflictsCount,
  currentUser,
  onLogout,
  isFirebaseConnected = false,
  isFirebaseSyncing = false,
  lastSyncTime = null,
  syncErrorMessage,
  onRetrySync,
  onDeleteDay,
}) => {
  const [sessionMinutesLeft, setSessionMinutesLeft] = useState(60);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const lastAgenda = useRef<ViewMode>(
    window.innerWidth < 1024 ? "mobile" : "calendar",
  );
  const isAgenda = agendaViews.includes(currentView);
  if (isAgenda) lastAgenda.current = currentView;

  useEffect(() => {
    if (!currentUser) return;
    const update = () =>
      setSessionMinutesLeft(
        Math.max(1, Math.ceil(getSessionRemainingMs() / 60000)),
      );
    update();
    const timer = setInterval(update, 15000);
    return () => clearInterval(timer);
  }, [currentUser]);

  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (!toolsMenuRef.current?.contains(event.target as Node))
        setIsToolsMenuOpen(false);
      if (!userMenuRef.current?.contains(event.target as Node))
        setIsUserMenuOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing
      )
        return;
      if (!isToolsMenuOpen && !isUserMenuOpen) return;
      event.preventDefault();
      (isUserMenuOpen ? userMenuRef : toolsMenuRef).current
        ?.querySelector("button")
        ?.focus();
      setIsToolsMenuOpen(false);
      setIsUserMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    window.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      window.removeEventListener("keydown", closeEscape);
    };
  }, [isToolsMenuOpen, isUserMenuOpen]);

  useEffect(() => {
    const closeDrawer = () => {
      if (window.innerWidth >= 1024) setIsMobileDrawerOpen(false);
    };
    window.addEventListener("resize", closeDrawer);
    return () => window.removeEventListener("resize", closeDrawer);
  }, []);

  const run = (action?: () => void) => {
    setIsMobileDrawerOpen(false);
    setIsToolsMenuOpen(false);
    setIsUserMenuOpen(false);
    action?.();
  };
  const navItems = [
    {
      view: lastAgenda.current,
      id: "nav-tab-agenda",
      label: "Agenda",
      Icon: Calendar,
      active: isAgenda,
    },
    {
      view: "ratings" as ViewMode,
      id: "nav-tab-ratings",
      label: "Calificaciones",
      Icon: Star,
      active: currentView === "ratings",
    },
    {
      view: "conflicts" as ViewMode,
      id: "nav-tab-conflicts",
      label: "Conflictos",
      Icon: AlertTriangle,
      active: currentView === "conflicts",
      count: conflictsCount,
    },
    {
      view: "analytics" as ViewMode,
      id: "nav-tab-analytics",
      label: "Informes",
      Icon: BarChart3,
      active: currentView === "analytics",
    },
    {
      view: "admin" as ViewMode,
      id: "nav-tab-admin",
      label: "Administración",
      Icon: ShieldCheck,
      active: ["admin", "directory", "maintenance"].includes(currentView),
    },
  ];
  const navigation = (mobile = false) =>
    navItems.map(({ view, id, label, Icon, active, count }) => (
      <button
        key={id}
        id={mobile ? id.replace("nav-tab-", "nav-mobile-tab-") : id}
        type="button"
        onClick={() => run(() => onViewChange(view))}
        aria-current={active ? "page" : undefined}
        className={`flex w-full min-h-12 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-left transition-colors ${active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="flex-1">{label}</span>
        {!!count && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            {count}
          </span>
        )}
      </button>
    ));
  const toolButton = (
    label: string,
    action: (() => void) | undefined,
    Icon: typeof Printer,
    id?: string,
  ) =>
    action && (
      <button
        key={label}
        id={id}
        type="button"
        onClick={() => run(action)}
        className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
      </button>
    );
  const tools = () => (
    <>
      {toolButton("Imprimir agenda diaria", onOpenPrintModal, Printer)}
      {toolButton(
        "Preparar envío por Gmail",
        onOpenGmailDispatch,
        Mail,
        isMobileDrawerOpen
          ? "mobile-drawer-btn-gmail-dispatch"
          : "navbar-btn-gmail-dispatch",
      )}
      {toolButton(
        "Importar, exportar y respaldos",
        onOpenImportExport,
        Database,
      )}
      {isCoordinatorOrAdmin(currentUser) && (
        <>
          {toolButton(
            `Solicitudes de eliminación${pendingDeletionsCount ? ` (${pendingDeletionsCount})` : ""}`,
            onOpenPendingDeletions,
            History,
          )}
          {toolButton("Papelera y auditoría", onOpenAuditLog, History)}
        </>
      )}
      {onDeleteDay && (
        <div className="mt-2 border-t border-slate-200 pt-2">
          {toolButton(
            "Eliminar reservas de un día",
            onDeleteDay,
            Trash2,
            "btn-tools-delete-day",
          )}
        </div>
      )}
    </>
  );
  const pageTitle = isAgenda
    ? "Agenda"
    : navItems.find((item) => item.active)?.label || "Espacios";
  const iconButton =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-600";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-white focus:p-3 focus:text-blue-800"
      >
        Ir al contenido
      </a>
      <aside
        className="no-print fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-slate-200 bg-white lg:flex"
        aria-label="Menú principal"
      >
        <div className="flex h-20 items-center gap-3 px-5">
          <Building2 className="h-8 w-8 shrink-0 text-blue-700" />
          <div>
            <p className="font-bold text-slate-900">CCD Diaguitas</p>
            <p className="text-xs text-slate-500">Espacios comunitarios</p>
          </div>
        </div>
        <nav aria-label="Navegación principal" className="space-y-1 px-3 py-4">
          {navigation()}
        </nav>
        <div className="mt-auto border-t border-slate-100 p-4">
          <div
            id={
              isFirebaseSyncing
                ? "sync-status-syncing"
                : isFirebaseConnected
                  ? "sync-status-connected"
                  : "sync-status-local"
            }
            className="flex items-center gap-2 text-sm text-slate-600"
            role="status"
            title={
              syncErrorMessage ||
              (lastSyncTime
                ? `Última actualización: ${lastSyncTime.toLocaleString("es-CL")}`
                : "Estado de conexión")
            }
          >
            {isFirebaseSyncing ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : isFirebaseConnected ? (
              <Cloud className="h-4 w-4 text-emerald-700" />
            ) : (
              <CloudOff className="h-4 w-4 text-amber-700" />
            )}
            <span>
              {isFirebaseSyncing
                ? "Sincronizando"
                : isFirebaseConnected
                  ? "Conectado"
                  : "Sin conexión"}
            </span>
          </div>
          {!isFirebaseConnected && !isFirebaseSyncing && onRetrySync && (
            <button
              type="button"
              onClick={onRetrySync}
              className="mt-2 min-h-11 text-sm font-semibold text-blue-700 underline"
            >
              Reintentar conexión
            </button>
          )}
        </div>
      </aside>

      <header className="no-print sticky top-0 z-40 border-b border-slate-200 bg-white text-slate-900">
        <div className="mx-auto flex h-16 w-full max-w-[1680px] items-center justify-between gap-2 px-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold lg:text-base">
              <span className="lg:hidden">CCD Diaguitas</span>
              <span className="hidden lg:inline">{pageTitle}</span>
            </p>
            <p className="hidden text-xs text-slate-500 sm:block lg:hidden">
              Espacios comunitarios
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {onOpenCommandPalette && (
              <button
                id="btn-navbar-command-palette"
                type="button"
                onClick={onOpenCommandPalette}
                aria-label="Buscar reservas o ejecutar comandos (Ctrl+K o Cmd+K)"
                className={`${iconButton} sm:gap-2 sm:px-3`}
              >
                <Search className="h-5 w-5" />
                <span className="hidden text-sm xl:inline">
                  Buscar reservas
                </span>
                <kbd className="hidden rounded border border-slate-200 px-1 text-xs text-slate-500 xl:inline">
                  Ctrl K
                </kbd>
              </button>
            )}
            {onOpenNotificationCenter && (
              <button
                id="btn-navbar-notifications"
                type="button"
                onClick={onOpenNotificationCenter}
                aria-label={`Centro de notificaciones${unreadNotificationsCount ? `: ${unreadNotificationsCount} sin leer` : ""}`}
                className={`${iconButton} relative`}
              >
                <Bell className="h-5 w-5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute right-0 top-0 rounded-full bg-rose-600 px-1.5 text-[11px] font-bold text-white">
                    {unreadNotificationsCount > 99
                      ? "99+"
                      : unreadNotificationsCount}
                  </span>
                )}
              </button>
            )}
            <div className="relative hidden lg:block" ref={toolsMenuRef}>
              <button
                id="btn-navbar-more-options"
                type="button"
                onClick={() => {
                  setIsToolsMenuOpen(!isToolsMenuOpen);
                  setIsUserMenuOpen(false);
                }}
                aria-label="Menú de herramientas del sistema"
                aria-expanded={isToolsMenuOpen}
                aria-controls="navbar-tools-panel"
                className={iconButton}
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {isToolsMenuOpen && (
                <div
                  id="navbar-tools-panel"
                  className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                >
                  {tools()}
                </div>
              )}
            </div>
            {currentUser ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  id="btn-navbar-user-profile"
                  type="button"
                  onClick={() => {
                    setIsUserMenuOpen(!isUserMenuOpen);
                    setIsToolsMenuOpen(false);
                  }}
                  aria-label={`Perfil de usuario: ${currentUser.name}`}
                  aria-expanded={isUserMenuOpen}
                  aria-controls="navbar-user-panel"
                  className={`${iconButton} gap-2 px-1 sm:px-2`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white ${currentUser.avatarColor || "bg-blue-700"}`}
                  >
                    {currentUser.initials}
                  </span>
                  <span className="hidden text-sm xl:inline">
                    {currentUser.name}
                  </span>
                  {sessionMinutesLeft <= 5 && (
                    <span className="text-xs text-amber-800">
                      {sessionMinutesLeft} min
                    </span>
                  )}
                </button>
                {isUserMenuOpen && (
                  <div
                    id="navbar-user-panel"
                    className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
                  >
                    <div className="border-b border-slate-100 p-3">
                      <p className="font-semibold">{currentUser.name}</p>
                      <p className="text-sm text-slate-500">
                        {currentUser.role}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        Sesión: {sessionMinutesLeft} min restantes
                      </p>
                      <button
                        type="button"
                        className="min-h-11 text-sm font-semibold text-blue-700"
                        disabled={isRefreshingSession}
                        onClick={async () => {
                          setIsRefreshingSession(true);
                          try {
                            await refreshSession();
                            setSessionMinutesLeft(
                              Math.max(
                                1,
                                Math.ceil(getSessionRemainingMs() / 60000),
                              ),
                            );
                            showToast.success("Sesión renovada");
                          } catch (error) {
                            showToast.error(
                              error instanceof Error
                                ? error.message
                                : "No se pudo renovar la sesión",
                            );
                          } finally {
                            setIsRefreshingSession(false);
                          }
                        }}
                      >
                        Renovar sesión
                      </button>
                    </div>
                    <p className="px-3 py-2 text-sm text-slate-600">
                      {isFirebaseSyncing
                        ? "Sincronizando cambios"
                        : isFirebaseConnected
                          ? "Conectado a la nube"
                          : "Sin conexión · datos locales"}
                    </p>
                    {toolButton(
                      "Cambiar mi clave",
                      onOpenChangePassword,
                      KeyRound,
                    )}
                    {toolButton("Cerrar sesión", onLogout, LogOut)}
                  </div>
                )}
              </div>
            ) : (
              <button
                id="btn-navbar-unlock"
                type="button"
                onClick={onOpenPasswordPrompt}
                aria-label="Habilitar permisos de edición"
                className={iconButton}
              >
                <KeyRound className="h-5 w-5" />
              </button>
            )}
            <button
              id="btn-new-reservation"
              type="button"
              onClick={onNewReservation}
              className="ml-2 hidden min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 lg:inline-flex"
            >
              <Plus className="h-4 w-4" />
              Nueva reserva
            </button>
          </div>
        </div>
      </header>

      <nav
        aria-label="Navegación móvil"
        className="no-print fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-200 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <button
          id="nav-mobile-tab-mobile"
          type="button"
          onClick={() => onViewChange(lastAgenda.current)}
          aria-current={isAgenda ? "page" : undefined}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold ${isAgenda ? "bg-blue-50 text-blue-800" : "text-slate-600"}`}
        >
          <Calendar className="h-5 w-5" />
          Agenda
        </button>
        <button
          id="btn-mobile-new-reservation"
          type="button"
          onClick={onNewReservation}
          className="mx-2 flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-blue-700 text-sm font-semibold text-white"
        >
          <Plus className="h-5 w-5" />
          Reservar
        </button>
        <button
          id="btn-mobile-more-tools"
          type="button"
          onClick={() => setIsMobileDrawerOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold text-slate-600"
        >
          <MoreHorizontal className="h-5 w-5" />
          Más
        </button>
      </nav>
      {isMobileDrawerOpen && (
        <ModalOverlay
          onClose={() => setIsMobileDrawerOpen(false)}
          closeOnBackdrop
          aria-label="Navegación y herramientas"
          className="fixed inset-0 flex items-end justify-center bg-slate-900/40 lg:hidden"
        >
          <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-bold">Más opciones</h2>
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                aria-label="Cerrar opciones"
                className={iconButton}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav aria-label="Secciones">{navigation(true)}</nav>
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Herramientas
              </p>
              {tools()}
            </div>
          </div>
        </ModalOverlay>
      )}
    </>
  );
};

export const Navbar = React.memo(NavbarComponent);
