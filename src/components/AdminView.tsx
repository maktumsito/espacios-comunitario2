import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { SpaceInfo, LoanType, ActivityTypeItem, EquipmentItem, Reservation, SpaceBlock, SpaceRating, ApplicantSummary } from '../types';
import {
  UserAccount,
  getAllAuthorizedUsers,
  AuthUser,
  isCoordinatorOrAdmin,
  isAuxiliar,
  isMasterAdmin,
  isCristianShute,
  userCanCreateReservations,
  userCanEditReservations,
  userCanDeleteReservations
} from '../services/authService';
import {
  getStoredEquipment,
  saveEquipmentItem,
  deleteEquipmentItem,
  resetEquipmentToDefaults
} from '../services/equipmentService';
import { ConfirmationModal } from './common/ConfirmationModal';
import { lazyWithRetry } from '../utils/lazyWithRetry';

const MaintenanceDashboardView = lazyWithRetry(
  () => import('./MaintenanceDashboardView').then(m => ({ default: m.MaintenanceDashboardView })),
  'MaintenanceDashboardView'
);
const ApplicantDirectoryView = lazyWithRetry(
  () => import('./ApplicantDirectoryView').then(m => ({ default: m.ApplicantDirectoryView })),
  'ApplicantDirectoryView'
);
const AdminGmailConfig = lazyWithRetry(
  () => import('./AdminGmailConfig').then(m => ({ default: m.AdminGmailConfig })),
  'AdminGmailConfig'
);
const AdminRecurringView = lazyWithRetry(
  () => import('./AdminRecurringView').then(m => ({ default: m.AdminRecurringView })),
  'AdminRecurringView'
);
import { executeMinuteConflictCleanupMigration } from '../services/migrations/cleanMinuteConflictsMigration';
import {
  Building2,
  Sparkles,
  Plus,
  Edit2,
  Trash2,
  Check,
  RotateCcw,
  Users,
  ShieldCheck,
  Activity,
  ChefHat,
  Dumbbell,
  Trophy,
  Presentation,
  Layers,
  BookOpen,
  Grid,
  GraduationCap,
  Library,
  Stethoscope,
  Sun,
  Music,
  Video,
  Smile,
  Laptop,
  Move,
  ArrowUp,
  ArrowDown,
  UserPlus,
  KeyRound,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Database,
  Phone,
  Search,
  AlertCircle,
  UserCheck,
  Wrench,
  Hammer,
  X,
  LogOut,
  Package,
  Mail,
  Repeat,
  ShieldAlert,
  CalendarPlus,
  FilePenLine
} from 'lucide-react';

export type AdminTab = 'spaces' | 'activities' | 'equipment' | 'users' | 'maintenance' | 'applicants' | 'gmail' | 'recurring';

interface AdminViewProps {
  spaces: SpaceInfo[];
  loanTypes: LoanType[];
  activityTypes: ActivityTypeItem[];
  equipmentList?: EquipmentItem[];
  users?: UserAccount[];
  currentUser?: AuthUser | null;
  reservations?: Reservation[];
  spaceBlocks?: SpaceBlock[];
  ratings?: SpaceRating[];
  initialTab?: AdminTab;
  onTabChange?: (tab: AdminTab) => void;
  onLogout?: () => void;
  onSaveSpace: (space: SpaceInfo) => void;
  onDeleteSpace: (id: string) => void;
  onSaveLoanType: (loan: LoanType) => void;
  onDeleteLoanType: (id: string) => void;
  onSaveActivityType: (activity: ActivityTypeItem) => void;
  onDeleteActivityType: (id: string) => void;
  onSaveEquipment?: (item: EquipmentItem) => void;
  onDeleteEquipment?: (id: string) => void;
  onResetEquipment?: () => void;
  onSaveUser?: (user: UserAccount, originalUsername?: string) => void;
  onDeleteUser?: (username: string) => { success: boolean; message?: string };
  onResetUsers?: () => void;
  onResetDefaults: () => void;
  onReorderSpaces?: (spaces: SpaceInfo[]) => void;
  onDeleteAllHolidays?: () => Promise<{ deletedCount: number }>;
  onOpenChangePassword?: (targetUser?: AuthUser) => void;
  onOpenImportExport?: () => void;
  onSaveBlock?: (block: SpaceBlock) => Promise<void>;
  onDeleteBlock?: (id: string) => Promise<void>;
  onSelectReservation?: (reservation: Reservation) => void;
  onNewReservationForApplicant?: (applicant: ApplicantSummary) => void;
  onOpenGmailDispatch?: (date?: string) => void;
  onSaveReservation?: (
    reserva: Reservation,
    generateSeries?: boolean,
    explicitSlots?: Array<{ fecha: string; horaInicio: string; horaFin: string; espacio: string }>,
    updateWholeSeries?: boolean
  ) => Promise<boolean>;
  onDeleteReservation?: (id: string, seriesId?: string) => Promise<void>;
  onEditReservation?: (reservation: Reservation) => void;
}

const PRESET_COLORS = [
  '#0284c7', // Sky Blue
  '#2563eb', // Royal Blue
  '#4f46e5', // Indigo
  '#7c3aed', // Violet
  '#c026d3', // Fuchsia
  '#db2777', // Pink
  '#dc2626', // Red
  '#ea580c', // Orange
  '#d97706', // Amber
  '#ca8a04', // Yellow Gold
  '#65a30d', // Lime
  '#059669', // Emerald
  '#0d9488', // Teal
  '#0891b2', // Cyan
  '#64748b', // Slate
];

export const AVATAR_COLOR_OPTIONS = [
  { id: 'bg-blue-600', label: 'Azul Real', hex: '#2563eb' },
  { id: 'bg-sky-600', label: 'Cielo', hex: '#0284c7' },
  { id: 'bg-indigo-600', label: 'Índigo', hex: '#4f46e5' },
  { id: 'bg-violet-600', label: 'Violeta', hex: '#7c3aed' },
  { id: 'bg-purple-600', label: 'Púrpura', hex: '#9333ea' },
  { id: 'bg-fuchsia-600', label: 'Fucsia', hex: '#c026d3' },
  { id: 'bg-rose-600', label: 'Rosa Carmín', hex: '#e11d48' },
  { id: 'bg-emerald-600', label: 'Esmeralda', hex: '#059669' },
  { id: 'bg-teal-600', label: 'Turquesa', hex: '#0d9488' },
  { id: 'bg-amber-600', label: 'Ámbar', hex: '#d97706' },
  { id: 'bg-orange-600', label: 'Naranja', hex: '#ea580c' },
  { id: 'bg-slate-600', label: 'Pizarra', hex: '#475569' },
];

const AVAILABLE_ICONS = [
  { id: 'Activity', label: 'Actividad', icon: Activity },
  { id: 'Sparkles', label: 'Danza/Artes', icon: Sparkles },
  { id: 'ChefHat', label: 'Cocina', icon: ChefHat },
  { id: 'Dumbbell', label: 'Gimnasio', icon: Dumbbell },
  { id: 'Trophy', label: 'Deportes', icon: Trophy },
  { id: 'Presentation', label: 'Auditorio', icon: Presentation },
  { id: 'Layers', label: 'Salas', icon: Layers },
  { id: 'BookOpen', label: 'Lectura', icon: BookOpen },
  { id: 'Grid', label: 'Manualidades', icon: Grid },
  { id: 'GraduationCap', label: 'Educación', icon: GraduationCap },
  { id: 'Library', label: 'Biblioteca', icon: Library },
  { id: 'Stethoscope', label: 'Salud/Box', icon: Stethoscope },
  { id: 'Sun', label: 'Exterior', icon: Sun },
  { id: 'Music', label: 'Música', icon: Music },
  { id: 'Video', label: 'Audiovisual', icon: Video },
  { id: 'Laptop', label: 'Tecnología', icon: Laptop },
  { id: 'Users', label: 'Comunidad', icon: Users },
  { id: 'Smile', label: 'Infantil/Social', icon: Smile },
];

function getInitialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function generateRandomPassword(name?: string): string {
  const cleanName = (name || 'clave')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const randomNum = Math.floor(100 + Math.random() * 900);
  return `${cleanName || 'acceso'}${randomNum}`;
}

export const AdminView: React.FC<AdminViewProps> = ({
  spaces,
  loanTypes,
  activityTypes,
  equipmentList: propEquipment,
  users: propUsers,
  currentUser,
  reservations = [],
  spaceBlocks = [],
  ratings = [],
  initialTab = 'spaces',
  onTabChange,
  onLogout,
  onSaveSpace,
  onDeleteSpace,
  onSaveLoanType,
  onDeleteLoanType,
  onSaveActivityType,
  onDeleteActivityType,
  onSaveEquipment,
  onDeleteEquipment,
  onResetEquipment,
  onSaveUser,
  onDeleteUser,
  onResetUsers,
  onResetDefaults,
  onReorderSpaces,
  onDeleteAllHolidays,
  onOpenChangePassword,
  onOpenImportExport,
  onSaveBlock,
  onDeleteBlock,
  onSelectReservation,
  onNewReservationForApplicant,
  onOpenGmailDispatch,
  onSaveReservation,
  onDeleteReservation,
  onEditReservation
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const [isDeletingHolidays, setIsDeletingHolidays] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    variant?: 'danger' | 'warning' | 'info' | 'primary';
    confirmLabel?: string;
    cancelLabel?: string;
    hideCancel?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [equipmentFormError, setEquipmentFormError] = useState('');
  const [spaceFormError, setSpaceFormError] = useState('');
  const [loanFormError, setLoanFormError] = useState('');
  const [activityFormError, setActivityFormError] = useState('');

  // ----------------------------------------------------
  // FIRESTORE QUOTA & MINUTE CONFLICTS MIGRATION
  // ----------------------------------------------------
  const [isMigratingConflicts, setIsMigratingConflicts] = useState(false);
  const [conflictMigrationResult, setConflictMigrationResult] = useState<string | null>(null);

  const handleRunConflictMigration = async () => {
    setIsMigratingConflicts(true);
    try {
      const res = await executeMinuteConflictCleanupMigration({ force: true });
      if (res.success) {
        setConflictMigrationResult(
          `✓ Depuración completada: ${res.deletedFromFirestore} IDs verificados/eliminados en Firestore, ${res.deletedFromLocal} registros eliminados en cachés locales.`
        );
      } else {
        setConflictMigrationResult(`⚠️ Error en depuración: ${res.error || 'Error de conexión'}`);
      }
    } catch (err: any) {
      setConflictMigrationResult(`⚠️ Error ejecutando depuración: ${err?.message || err}`);
    } finally {
      setIsMigratingConflicts(false);
    }
  };

  // ----------------------------------------------------
  // EQUIPMENT MANAGEMENT STATE
  // ----------------------------------------------------
  const [localEquipment, setLocalEquipment] = useState<EquipmentItem[]>(() => getStoredEquipment());
  const effectiveEquipment = propEquipment || localEquipment;
  const [isEquipmentFormOpen, setIsEquipmentFormOpen] = useState(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<string | null>(null);
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState('');
  const [equipmentCategoryFilter, setEquipmentCategoryFilter] = useState('');
  const [equipmentToDelete, setEquipmentToDelete] = useState<EquipmentItem | null>(null);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentItem>({
    id: '',
    name: '',
    category: 'Audiovisual',
    totalQuantity: 2,
    iconName: 'Package',
    description: ''
  });

  const handleOpenEquipmentForm = (item?: EquipmentItem) => {
    setEquipmentFormError('');
    if (item) {
      setEditingEquipmentId(item.id);
      setEquipmentForm({ ...item });
    } else {
      setEditingEquipmentId(null);
      setEquipmentForm({
        id: `EQ_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        name: '',
        category: 'Audiovisual',
        totalQuantity: 2,
        iconName: 'Package',
        description: ''
      });
    }
    setIsEquipmentFormOpen(true);
  };

  const handleSaveEquipmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setEquipmentFormError('');
    if (!equipmentForm.name.trim()) {
      setEquipmentFormError('Por favor, ingresa el nombre del equipamiento.');
      return;
    }
    const cleanName = equipmentForm.name.trim();
    const finalItem: EquipmentItem = {
      ...equipmentForm,
      id: equipmentForm.id || `EQ_${cleanName.toUpperCase().replace(/\s+/g, '_')}`,
      name: cleanName,
      totalQuantity: Math.max(1, Number(equipmentForm.totalQuantity) || 1),
      isCustom: true
    };

    if (onSaveEquipment) {
      onSaveEquipment(finalItem);
    } else {
      const updated = saveEquipmentItem(finalItem);
      setLocalEquipment(updated);
    }
    setIsEquipmentFormOpen(false);
  };

  const handleDeleteEquipmentConfirm = () => {
    if (!equipmentToDelete) return;
    if (onDeleteEquipment) {
      onDeleteEquipment(equipmentToDelete.id);
    } else {
      const updated = deleteEquipmentItem(equipmentToDelete.id);
      setLocalEquipment(updated);
    }
    setEquipmentToDelete(null);
  };

  const handleQuickStockChange = (item: EquipmentItem, delta: number) => {
    const newQty = Math.max(0, item.totalQuantity + delta);
    const updated: EquipmentItem = { ...item, totalQuantity: newQty };
    if (onSaveEquipment) {
      onSaveEquipment(updated);
    } else {
      const res = saveEquipmentItem(updated);
      setLocalEquipment(res);
    }
  };

  const filteredEquipment = useMemo(() => {
    return effectiveEquipment.filter((eq) => {
      if (equipmentCategoryFilter && eq.category !== equipmentCategoryFilter) return false;
      if (equipmentSearchQuery.trim()) {
        const q = equipmentSearchQuery.toLowerCase();
        const matchName = eq.name.toLowerCase().includes(q);
        const matchCat = eq.category.toLowerCase().includes(q);
        const matchDesc = eq.description?.toLowerCase().includes(q);
        if (!matchName && !matchCat && !matchDesc) return false;
      }
      return true;
    });
  }, [effectiveEquipment, equipmentCategoryFilter, equipmentSearchQuery]);

  // Space ordering lock/toggle state (default false / locked)
  const [allowSpaceReorder, setAllowSpaceReorder] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('allow_reorder_spaces');
      return saved === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleSpaceReorder = () => {
    setAllowSpaceReorder((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('allow_reorder_spaces', String(next));
      } catch {}
      window.dispatchEvent(new CustomEvent('app_spaces_reorder_toggled', { detail: next }));
      return next;
    });
  };

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

  // Drag & Drop State for Space Cards Reordering
  const [draggedSpaceIndex, setDraggedSpaceIndex] = useState<number | null>(null);
  const [dragOverSpaceIndex, setDragOverSpaceIndex] = useState<number | null>(null);

  // Space Form State
  const [isSpaceFormOpen, setIsSpaceFormOpen] = useState(false);
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [spaceForm, setSpaceForm] = useState<SpaceInfo>({
    id: '',
    name: '',
    category: 'Salas de Clases',
    iconName: 'Layers',
    color: '#0284c7',
    description: ''
  });

  // Loan Type Form State
  const [isLoanFormOpen, setIsLoanFormOpen] = useState(false);
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [loanForm, setLoanForm] = useState<LoanType>({
    id: '',
    name: '',
    category: 'Comunitario',
    description: '',
    color: '#2563eb',
    defaultDurationMinutes: 120
  });

  // Activity Type Form State
  const [isActivityFormOpen, setIsActivityFormOpen] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [activityForm, setActivityForm] = useState<ActivityTypeItem>({
    id: '',
    name: '',
    category: 'Formación y Desarrollo',
    color: '#0284c7',
    description: ''
  });

  // ----------------------------------------------------
  // USER MANAGEMENT STATE
  // ----------------------------------------------------
  const [localUsers, setLocalUsers] = useState<UserAccount[]>(() => getAllAuthorizedUsers());
  const effectiveUsers = propUsers || localUsers;

  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedUsername, setCopiedUsername] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserAccount | null>(null);
  const [userFormError, setUserFormError] = useState('');
  const [showFormPassword, setShowFormPassword] = useState(false);

  const isShute = isCristianShute(currentUser);
  const [permissionSuccessToast, setPermissionSuccessToast] = useState<string | null>(null);

  const [userForm, setUserForm] = useState<UserAccount>({
    username: '',
    name: '',
    passwordHash: '',
    role: 'Coordinador',
    initials: 'NU',
    avatarColor: 'bg-blue-600',
    phone: '',
    canCreateReservations: true,
    canEditReservations: true,
    canDeleteReservations: true
  });

  // Drag and Drop handlers for Spaces
  const handleSpaceDragStart = (e: React.DragEvent, index: number) => {
    if (!allowSpaceReorder) {
      e.preventDefault();
      return;
    }
    setDraggedSpaceIndex(index);
    e.dataTransfer.setData('text/plain', `SPACE_${index}`);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSpaceDragOver = (e: React.DragEvent, index: number) => {
    if (!allowSpaceReorder || draggedSpaceIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSpaceIndex(index);
  };

  const handleSpaceDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (!allowSpaceReorder || draggedSpaceIndex === null || draggedSpaceIndex === targetIndex || !onReorderSpaces) {
      setDraggedSpaceIndex(null);
      setDragOverSpaceIndex(null);
      return;
    }

    const reordered = [...spaces];
    const [moved] = reordered.splice(draggedSpaceIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    onReorderSpaces(reordered);
    setDraggedSpaceIndex(null);
    setDragOverSpaceIndex(null);
  };

  const handleMoveSpace = (index: number, direction: 'up' | 'down') => {
    if (!allowSpaceReorder || !onReorderSpaces) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= spaces.length) return;

    const reordered = [...spaces];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    onReorderSpaces(reordered);
  };

  // Open Space Form
  const handleOpenSpaceForm = (space?: SpaceInfo) => {
    setSpaceFormError('');
    if (space) {
      setEditingSpaceId(space.id);
      setSpaceForm(space);
    } else {
      setEditingSpaceId(null);
      setSpaceForm({
        id: `SPC_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        name: '',
        category: 'Salas de Clases',
        iconName: 'Layers',
        color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
        description: ''
      });
    }
    setIsSpaceFormOpen(true);
  };

  const handleSaveSpaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSpaceFormError('');
    if (!spaceForm.name.trim()) {
      setSpaceFormError('Por favor, ingresa el nombre del espacio.');
      return;
    }
    const cleanName = spaceForm.name.trim().toUpperCase();
    const finalSpace: SpaceInfo = {
      ...spaceForm,
      id: spaceForm.id || cleanName,
      name: cleanName,
      description: spaceForm.description || `Espacio asignado para actividades de ${spaceForm.category.toLowerCase()}.`,
      isCustom: true
    };
    onSaveSpace(finalSpace);
    setIsSpaceFormOpen(false);
  };

  // Open Loan Type Form
  const handleOpenLoanForm = (loan?: LoanType) => {
    setLoanFormError('');
    if (loan) {
      setEditingLoanId(loan.id);
      setLoanForm(loan);
    } else {
      setEditingLoanId(null);
      setLoanForm({
        id: `LOAN_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        name: '',
        category: 'Comunitario',
        description: '',
        color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
        defaultDurationMinutes: 120
      });
    }
    setIsLoanFormOpen(true);
  };

  const handleSaveLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoanFormError('');
    if (!loanForm.name.trim()) {
      setLoanFormError('Por favor, ingresa el nombre del tipo de préstamo.');
      return;
    }
    const finalLoan: LoanType = {
      ...loanForm,
      id: loanForm.id || `LOAN_${loanForm.name.trim().toUpperCase().replace(/\s+/g, '_')}`,
      name: loanForm.name.trim(),
      defaultDurationMinutes: Number(loanForm.defaultDurationMinutes) || 120,
      isCustom: true
    };
    onSaveLoanType(finalLoan);
    setIsLoanFormOpen(false);
  };

  // Open Activity Type Form
  const handleOpenActivityForm = (activity?: ActivityTypeItem) => {
    setActivityFormError('');
    if (activity) {
      setEditingActivityId(activity.id);
      setActivityForm(activity);
    } else {
      setEditingActivityId(null);
      setActivityForm({
        id: `ACT_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        name: '',
        category: 'Formación y Desarrollo',
        color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
        description: ''
      });
    }
    setIsActivityFormOpen(true);
  };

  const handleSaveActivitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActivityFormError('');
    if (!activityForm.name.trim()) {
      setActivityFormError('Por favor, ingresa el nombre de la actividad o préstamo.');
      return;
    }
    const finalActivity: ActivityTypeItem = {
      ...activityForm,
      id: activityForm.id || `ACT_${activityForm.name.trim().toUpperCase().replace(/\s+/g, '_')}`,
      name: activityForm.name.trim().toUpperCase(),
      isCustom: true
    };
    onSaveActivityType(finalActivity);
    if (onSaveLoanType) {
      onSaveLoanType({
        id: finalActivity.id,
        name: finalActivity.name,
        category: finalActivity.category,
        color: finalActivity.color,
        description: finalActivity.description,
        defaultDurationMinutes: 120,
        isCustom: true
      });
    }
    setIsActivityFormOpen(false);
  };

  // ----------------------------------------------------
  // USER MANAGEMENT HANDLERS
  // ----------------------------------------------------
  const handleOpenUserForm = (user?: UserAccount) => {
    if (!isCoordinatorOrAdmin(currentUser)) {
      setConfirmDialog({
        isOpen: true,
        title: 'Permiso Denegado',
        message: 'Solo los usuarios con rol Administrador o Coordinador están autorizados para crear o modificar usuarios.',
        variant: 'warning',
        confirmLabel: 'Entendido',
        hideCancel: true,
        onConfirm: () => setConfirmDialog(null)
      });
      return;
    }
    setUserFormError('');
    setShowFormPassword(false);
    if (user) {
      setEditingUsername(user.username);
      setUserForm({
        ...user,
        canCreateReservations: userCanCreateReservations(user),
        canEditReservations: userCanEditReservations(user),
        canDeleteReservations: userCanDeleteReservations(user)
      });
    } else {
      setEditingUsername(null);
      const initialName = '';
      const autoPass = generateRandomPassword('usuario');
      setUserForm({
        username: '',
        name: initialName,
        passwordHash: autoPass,
        role: 'Coordinador',
        initials: 'NU',
        avatarColor: AVATAR_COLOR_OPTIONS[Math.floor(Math.random() * AVATAR_COLOR_OPTIONS.length)].id,
        phone: '',
        isCustom: true,
        canCreateReservations: true,
        canEditReservations: true,
        canDeleteReservations: false
      });
    }
    setIsUserFormOpen(true);
  };

  const handleUserNameChange = (newName: string) => {
    setUserFormError('');
    if (editingUsername) {
      setUserForm((prev) => ({
        ...prev,
        name: newName,
        initials: prev.initials || getInitialsFromName(newName)
      }));
    } else {
      // Auto suggest username and initials on create
      const cleanUsername = newName.trim().toLowerCase();
      const initials = getInitialsFromName(newName);
      setUserForm((prev) => ({
        ...prev,
        name: newName,
        username: prev.username ? prev.username : cleanUsername,
        initials: initials
      }));
    }
  };

  const handleSaveUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCoordinatorOrAdmin(currentUser)) {
      setUserFormError('Permiso denegado: Solo usuarios Administradores o Coordinadores pueden crear o modificar usuarios.');
      return;
    }
    setUserFormError('');

    const cleanName = userForm.name.trim();
    const cleanUsername = (userForm.username || cleanName).trim().toLowerCase();
    const cleanPassword = userForm.passwordHash.trim();

    if (!cleanName) {
      setUserFormError('Por favor ingresa el nombre completo del usuario.');
      return;
    }

    if (!cleanUsername) {
      setUserFormError('Por favor ingresa un identificador de usuario.');
      return;
    }

    if (!cleanPassword) {
      setUserFormError('Por favor asigna una clave de acceso al usuario.');
      return;
    }

    // Check duplicate username (except when editing self)
    const existingUser = effectiveUsers.find(
      (u) => u.username.toLowerCase() === cleanUsername && u.username.toLowerCase() !== (editingUsername || '').toLowerCase()
    );
    if (existingUser) {
      setUserFormError(`El identificador de usuario "${cleanUsername}" ya está en uso.`);
      return;
    }

    // Check duplicate password with another user (since password identifies user)
    const existingPass = effectiveUsers.find(
      (u) => u.passwordHash === cleanPassword && u.username.toLowerCase() !== (editingUsername || '').toLowerCase()
    );
    if (existingPass) {
      setUserFormError(`La clave "${cleanPassword}" ya está asignada a ${existingPass.name}. Elige una clave única.`);
      return;
    }

    const finalUser: UserAccount = {
      ...userForm,
      name: cleanName,
      username: cleanUsername,
      passwordHash: cleanPassword,
      initials: (userForm.initials || getInitialsFromName(cleanName)).toUpperCase().substring(0, 3),
      isCustom: true,
      canCreateReservations: Boolean(userForm.canCreateReservations),
      canEditReservations: Boolean(userForm.canEditReservations),
      canDeleteReservations: Boolean(userForm.canDeleteReservations)
    };

    if (onSaveUser) {
      onSaveUser(finalUser, editingUsername || undefined);
    } else {
      // Local fallback
      setLocalUsers((prev) => {
        const idx = prev.findIndex((u) => u.username.toLowerCase() === (editingUsername || cleanUsername).toLowerCase());
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = finalUser;
          return updated;
        }
        return [...prev, finalUser];
      });
    }

    setIsUserFormOpen(false);
  };

  // ----------------------------------------------------
  // CRISTIAN SHUTE PERMISSION TOGGLE HANDLERS
  // ----------------------------------------------------
  const handleToggleUserPermission = (
    targetUser: UserAccount,
    permKey: 'canCreateReservations' | 'canEditReservations' | 'canDeleteReservations',
    newValue: boolean
  ) => {
    if (!isCristianShute(currentUser)) {
      setConfirmDialog({
        isOpen: true,
        title: 'Acceso Exclusivo',
        message: 'Solo Cristian Shute posee autorización para modificar los permisos de reservas en los usuarios.',
        variant: 'warning',
        confirmLabel: 'Entendido',
        hideCancel: true,
        onConfirm: () => setConfirmDialog(null)
      });
      return;
    }

    if (isCristianShute(targetUser)) {
      setConfirmDialog({
        isOpen: true,
        title: 'Usuario Maestro Protegido',
        message: 'La cuenta de Cristian Shute mantiene acceso maestro permanente y no puede ser restringida.',
        variant: 'info',
        confirmLabel: 'Aceptar',
        hideCancel: true,
        onConfirm: () => setConfirmDialog(null)
      });
      return;
    }

    const updatedUser: UserAccount = {
      ...targetUser,
      canCreateReservations: permKey === 'canCreateReservations' ? newValue : userCanCreateReservations(targetUser),
      canEditReservations: permKey === 'canEditReservations' ? newValue : userCanEditReservations(targetUser),
      canDeleteReservations: permKey === 'canDeleteReservations' ? newValue : userCanDeleteReservations(targetUser)
    };

    if (onSaveUser) {
      onSaveUser(updatedUser, targetUser.username);
    } else {
      setLocalUsers((prev) => {
        const idx = prev.findIndex((u) => u.username.toLowerCase() === targetUser.username.toLowerCase());
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = updatedUser;
          return next;
        }
        return [...prev, updatedUser];
      });
    }

    const permLabel =
      permKey === 'canCreateReservations'
        ? 'Registro de nuevas reservas'
        : permKey === 'canEditReservations'
        ? 'Edición y modificación de reservas'
        : 'Eliminación de reservas';
    setPermissionSuccessToast(`✓ ${permLabel} ${newValue ? 'HABILITADO' : 'DESACTIVADO'} para ${targetUser.name} en Firestore.`);
    setTimeout(() => {
      setPermissionSuccessToast(null);
    }, 4000);
  };

  const handleBulkSetPermissions = (mode: 'all_enabled' | 'create_only' | 'view_only') => {
    if (!isCristianShute(currentUser)) return;

    let targetCount = 0;
    effectiveUsers.forEach((usr) => {
      if (isMasterAdmin(usr) || isCristianShute(usr)) return;

      const newPerms = {
        canCreateReservations: mode === 'all_enabled' || mode === 'create_only',
        canEditReservations: mode === 'all_enabled',
        canDeleteReservations: mode === 'all_enabled'
      };

      const updated: UserAccount = {
        ...usr,
        ...newPerms
      };

      targetCount++;
      if (onSaveUser) {
        onSaveUser(updated, usr.username);
      }
    });

    const modeLabels = {
      all_enabled: 'Total (Crear, Editar y Eliminar habilitados para todos)',
      create_only: 'Registro Único (Solo creación permitida; edición y eliminación bloqueadas)',
      view_only: 'Solo Lectura (Bloqueada creación, edición y eliminación)'
    };

    setPermissionSuccessToast(`✓ Modo "${modeLabels[mode]}" aplicado exitosamente a ${targetCount} usuarios en Firestore.`);
    setTimeout(() => {
      setPermissionSuccessToast(null);
    }, 4500);
  };

  const handleDeleteUserConfirm = () => {
    if (!userToDelete) return;
    if (!isCoordinatorOrAdmin(currentUser)) {
      setUserToDelete(null);
      setConfirmDialog({
        isOpen: true,
        title: 'Permiso Denegado',
        message: 'Permiso denegado: Solo los usuarios Administradores o Coordinadores están autorizados para eliminar usuarios.',
        variant: 'warning',
        confirmLabel: 'Entendido',
        hideCancel: true,
        onConfirm: () => setConfirmDialog(null)
      });
      return;
    }

    if (onDeleteUser) {
      const res = onDeleteUser(userToDelete.username);
      if (!res.success) {
        setUserToDelete(null);
        setConfirmDialog({
          isOpen: true,
          title: 'No se pudo eliminar el usuario',
          message: res.message || 'No se pudo eliminar el usuario.',
          variant: 'danger',
          confirmLabel: 'Entendido',
          hideCancel: true,
          onConfirm: () => setConfirmDialog(null)
        });
        return;
      }
    } else {
      // Local fallback
      setLocalUsers((prev) => prev.filter((u) => u.username !== userToDelete.username));
    }

    setUserToDelete(null);
  };

  const handleTogglePasswordVisibility = (username: string) => {
    setRevealedPasswords((prev) => ({
      ...prev,
      [username]: !prev[username]
    }));
  };

  const handleCopyPassword = (username: string, pass: string) => {
    navigator.clipboard.writeText(pass);
    setCopiedUsername(username);
    setTimeout(() => {
      setCopiedUsername((curr) => (curr === username ? null : curr));
    }, 2000);
  };

  // Filtered Users List
  const filteredUsers = useMemo(() => {
    return effectiveUsers.filter((usr) => {
      if (userRoleFilter && usr.role !== userRoleFilter) return false;
      if (userSearchQuery.trim()) {
        const q = userSearchQuery.toLowerCase();
        const matchName = usr.name.toLowerCase().includes(q);
        const matchUser = usr.username.toLowerCase().includes(q);
        const matchRole = usr.role.toLowerCase().includes(q);
        const matchPhone = (usr.phone || '').toLowerCase().includes(q);
        return matchName || matchUser || matchRole || matchPhone;
      }
      return true;
    });
  }, [effectiveUsers, userRoleFilter, userSearchQuery]);

  // Role Badge Helper
  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'Administrador':
        return {
          label: 'Administrador',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: ShieldCheck
        };
      case 'Coordinador':
        return {
          label: 'Coordinador',
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: UserCheck
        };
      case 'Gestión':
        return {
          label: 'Gestión',
          bg: 'bg-violet-50 text-violet-700 border-violet-200',
          icon: Sparkles
        };
      case 'Recepción':
        return {
          label: 'Recepción',
          bg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
          icon: KeyRound
        };
      case 'Auxiliar':
        return {
          label: 'Personal Auxiliar (Operativo)',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: Wrench
        };
      default:
        return {
          label: role || 'Operador',
          bg: 'bg-slate-50 text-slate-700 border-slate-200',
          icon: Users
        };
    }
  };

  // Check if current user is allowed to create / edit master configs
  const canManage = !isAuxiliar(currentUser);
  const showCategories = isCoordinatorOrAdmin(currentUser);
  const canManageUsers = isCoordinatorOrAdmin(currentUser);

  return (
    <div className="w-full max-w-[1600px] mx-auto p-3 sm:p-6 space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                Panel de Administración
              </h1>
              <p className="text-xs text-slate-500">
                Configuración maestra de Espacios, Préstamos, Actividades, Equipamiento, Mantención, Solicitantes y Usuarios
              </p>
            </div>
          </div>
        </div>

        {/* Header Right Actions: User info, Logout and Reset */}
        <div className="flex flex-wrap items-center gap-3">
          {currentUser && (
            <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200 py-1.5 px-3 rounded-xl shadow-2xs">
              <div
                className={`w-6 h-6 rounded-full ${currentUser.avatarColor || 'bg-blue-600'} text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-xs`}
              >
                {currentUser.initials}
              </div>
              <div className="text-left leading-tight">
                <span className="text-xs font-bold text-slate-800 block truncate max-w-[120px]">
                  {currentUser.name}
                </span>
                {showCategories && (
                  <span className="text-[10px] text-slate-500 font-medium block">
                    {currentUser.role}
                  </span>
                )}
              </div>
              {onOpenChangePassword && (
                <button
                  type="button"
                  onClick={() => onOpenChangePassword()}
                  title="Cambiar mi clave de acceso personal"
                  className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-blue-700 hover:bg-blue-100 bg-blue-50 border border-blue-200 text-xs font-bold transition cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">Cambiar mi Clave</span>
                </button>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Cerrar sesión"
                  className="ml-1 flex items-center space-x-1 px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-semibold transition cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cerrar Sesión</span>
                </button>
              )}
            </div>
          )}

          {/* Global Reset Defaults */}
          {showCategories && (
            <button
              id="btn-admin-reset-defaults"
              onClick={() => {
                setConfirmDialog({
                  isOpen: true,
                  title: '¿Restaurar Valores por Defecto?',
                  message: '¿Deseas restaurar los espacios, préstamos, actividades y usuarios a sus valores predeterminados?',
                  variant: 'warning',
                  confirmLabel: 'Restaurar Valores',
                  onConfirm: () => {
                    onResetDefaults();
                    if (onResetUsers) onResetUsers();
                    setConfirmDialog(null);
                  }
                });
              }}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 transition shadow-xs cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Restaurar Valores por Defecto</span>
            </button>
          )}

          {onOpenImportExport && (
            <button
              id="btn-admin-open-backups"
              onClick={onOpenImportExport}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 transition shadow-xs cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Copias de Seguridad (15 Días)</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 overflow-x-auto">
        <button
          id="admin-tab-spaces"
          onClick={() => handleTabChange('spaces')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'spaces'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Espacios y Salas ({spaces.length})</span>
        </button>

        <button
          id="admin-tab-activities"
          onClick={() => handleTabChange('activities')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'activities'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Tipos de Actividades y Préstamos ({activityTypes.length})</span>
        </button>

        <button
          id="admin-tab-equipment"
          onClick={() => handleTabChange('equipment')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'equipment'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Equipamiento y Recursos ({effectiveEquipment.length})</span>
        </button>

        <button
          id="admin-tab-maintenance"
          onClick={() => handleTabChange('maintenance')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'maintenance'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Hammer className="w-4 h-4" />
          <span>Mantención y Bloqueos ({(spaceBlocks || []).length})</span>
        </button>

        <button
          id="admin-tab-applicants"
          onClick={() => handleTabChange('applicants')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'applicants'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Registro de Solicitantes</span>
        </button>

        <button
          id="admin-tab-recurring"
          onClick={() => handleTabChange('recurring')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'recurring'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Repeat className="w-4 h-4" />
          <span>Actividades Recurrentes</span>
        </button>

        <button
          id="admin-tab-users"
          onClick={() => handleTabChange('users')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'users'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Usuarios y Accesos ({effectiveUsers.length})</span>
        </button>

        <button
          id="admin-tab-gmail"
          onClick={() => handleTabChange('gmail')}
          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'gmail'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Despacho Gmail</span>
        </button>
      </div>

      {/* TAB 1: SPACES MANAGEMENT */}
      {activeTab === 'spaces' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Gestión de Espacios Comunitarios
              </h2>
              <p className="text-xs text-slate-500">
                Crea nuevas salas, recintos exteriores, talleres y áreas deportivas con color e ícono personalizado.
              </p>
            </div>

            {canManage && (
              <button
                id="btn-add-new-space"
                onClick={() => handleOpenSpaceForm()}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition active:scale-95 self-start cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Nuevo Espacio</span>
              </button>
            )}
          </div>

          {/* Space Management Banner with DnD hint and toggle */}
          <div className="bg-blue-50/60 border border-blue-200/70 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs text-blue-900">
            <div className="flex items-center space-x-2">
              {allowSpaceReorder ? (
                <Move className="w-4 h-4 text-blue-600 shrink-0" />
              ) : (
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              )}
              <span>
                {allowSpaceReorder ? (
                  <>
                    <strong>Reordenamiento Drag & Drop:</strong> Arrastra las tarjetas para definir el orden en que se visualizan los espacios en el Horario Diario y el Calendario.
                  </>
                ) : (
                  <>
                    <strong>Orden de salas bloqueado:</strong> El reordenamiento de espacios está desactivado para prevenir movimientos involuntarios.
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                id="btn-admin-toggle-reorder-spaces"
                onClick={handleToggleSpaceReorder}
                className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition shadow-2xs cursor-pointer active:scale-95 ${
                  allowSpaceReorder
                    ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                    : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                }`}
                title={
                  allowSpaceReorder
                    ? 'Desactivar ordenar salas: Bloquea las tarjetas para que no se muevan por error'
                    : 'Activar ordenar salas: Permite arrastrar tarjetas o usar los botones de subir/bajar'
                }
              >
                {allowSpaceReorder ? (
                  <>
                    <Unlock className="w-3.5 h-3.5 text-amber-600" />
                    <span>Ordenar salas: <strong>Activado</strong> (Desactivar)</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Ordenar salas: <strong>Desactivado</strong> (Activar)</span>
                  </>
                )}
              </button>
              <span className="text-[11px] font-semibold text-blue-700 bg-white px-2.5 py-1 rounded-lg border border-blue-200">
                Total: {spaces.length} espacios
              </span>
            </div>
          </div>

          {/* Spaces Grid (Draggable Cards) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {spaces.map((space, index) => {
              const isDragged = draggedSpaceIndex === index;
              const isDropTarget = dragOverSpaceIndex === index;

              return (
                <div
                  key={space.id}
                  draggable={allowSpaceReorder}
                  onDragStart={(e) => handleSpaceDragStart(e, index)}
                  onDragOver={(e) => handleSpaceDragOver(e, index)}
                  onDragLeave={() => {
                    if (dragOverSpaceIndex === index) setDragOverSpaceIndex(null);
                  }}
                  onDrop={(e) => handleSpaceDrop(e, index)}
                  className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                    allowSpaceReorder ? 'cursor-grab active:cursor-grabbing' : ''
                  } relative group ${
                    isDropTarget
                      ? 'border-blue-500 ring-2 ring-blue-400 bg-blue-50/30 scale-[1.02] z-20'
                      : isDragged
                      ? 'opacity-40 border-dashed border-slate-400 bg-slate-100 scale-95'
                      : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
                          style={{ backgroundColor: space.color || '#0284c7' }}
                        >
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900">{space.name}</h3>
                          <span className="text-[11px] font-semibold text-slate-500">{space.category}</span>
                        </div>
                      </div>

                      {allowSpaceReorder && (
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleMoveSpace(index, 'up')}
                            disabled={index === 0}
                            title="Subir orden"
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveSpace(index, 'down')}
                            disabled={index === spaces.length - 1}
                            title="Bajar orden"
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                      {space.description || 'Sin descripción.'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-[10px] font-mono text-slate-400">ID: {space.id}</span>
                    {canManage && (
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleOpenSpaceForm(space)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => {
                            setConfirmDialog({
                              isOpen: true,
                              title: '¿Eliminar Espacio?',
                              message: `¿Estás seguro de que deseas eliminar el espacio "${space.name}"?`,
                              variant: 'danger',
                              confirmLabel: 'Eliminar Espacio',
                              onConfirm: () => {
                                onDeleteSpace(space.id);
                                setConfirmDialog(null);
                              }
                            });
                          }}
                          className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer flex items-center justify-center"
                          title="Eliminar espacio"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: ACTIVIDADES Y PRÉSTAMOS MANAGEMENT */}
      {activeTab === 'activities' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Tipos de Actividades y Préstamos
              </h2>
              <p className="text-xs text-slate-500">
                Catálogo unificado de actividades, talleres, cursos y modalidades de préstamo de espacios.
              </p>
            </div>

            {canManage && (
              <button
                id="btn-add-new-activity"
                onClick={() => handleOpenActivityForm()}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition active:scale-95 self-start cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Tipo de Actividad / Préstamo</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activityTypes.map((act) => (
              <div
                key={act.id}
                className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs"
                        style={{ backgroundColor: act.color || '#0284c7' }}
                      >
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-slate-900">{act.name}</h3>
                        <span className="text-[11px] font-semibold text-slate-500">{act.category}</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {act.description || 'Sin descripción específica.'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <span className="text-[10px] font-mono text-slate-400">ID: {act.id}</span>
                  {canManage && (
                    <div className="flex items-center space-x-1.5">
                      <button
                        onClick={() => handleOpenActivityForm(act)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>Editar</span>
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: '¿Eliminar Actividad?',
                            message: `¿Estás seguro de que deseas eliminar la actividad "${act.name}"?`,
                            variant: 'danger',
                            confirmLabel: 'Eliminar Actividad',
                            onConfirm: () => {
                              onDeleteActivityType(act.id);
                              setConfirmDialog(null);
                            }
                          });
                        }}
                        className="min-h-[44px] min-w-[44px] p-2 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer flex items-center justify-center"
                        title="Eliminar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: USERS AND ACCESS MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {/* Header & Primary Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                Gestión de Usuarios y Claves de Acceso
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Crea y administra los usuarios autorizados, sus roles, iniciales, colores y contraseñas de desbloqueo.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {currentUser && onOpenChangePassword && (
                <button
                  type="button"
                  onClick={() => onOpenChangePassword()}
                  className="flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>Cambiar mi Clave</span>
                </button>
              )}

              {canManageUsers && (
                <button
                  id="btn-add-new-user"
                  onClick={() => handleOpenUserForm()}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition active:scale-95 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Crear Nuevo Usuario</span>
                </button>
              )}
            </div>
          </div>

          {/* Cristian Shute Master Reservation Permissions Executive Banner */}
          {isShute && (
            <div className="bg-gradient-to-r from-blue-900 via-indigo-950 to-slate-900 rounded-3xl p-5 sm:p-6 text-white shadow-lg border border-blue-700/50 space-y-4 animate-fadeIn">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] tracking-wider uppercase flex items-center gap-1 shadow-xs">
                      👑 Sesión Maestra: Cristian Shute
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30 text-[10px] font-bold">
                      Control Exclusivo
                    </span>
                  </div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                    <span>Control Maestro de Permisos de Reservas por Usuario</span>
                  </h3>
                  <p className="text-xs text-blue-100/80 leading-relaxed">
                    Como titular de la cuenta, puedes <strong>activar o desactivar</strong> en cada usuario la facultad de <strong>registrar nuevas reservas</strong> o <strong>editar, cambiar y eliminar</strong> las reservas existentes. Los cambios se guardan y sincronizan de forma inmediata en Firestore hacia todos los dispositivos.
                  </p>
                </div>

                {/* Bulk Quick Actions */}
                <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/15 space-y-2 shrink-0">
                  <div className="text-[10.5px] font-bold text-blue-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Acciones Rápidas Globales:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleBulkSetPermissions('all_enabled')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/90 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Permite a todos los operadores crear, editar y eliminar reservas"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Habilitar Todo a Todos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkSetPermissions('create_only')}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/90 hover:bg-amber-500 active:scale-95 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Permite a los usuarios registrar nuevas reservas pero bloquea editar o eliminar existentes"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Solo Crear Reservas</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkSetPermissions('view_only')}
                      className="px-3 py-1.5 rounded-xl bg-slate-700/90 hover:bg-slate-700 active:scale-95 text-white text-xs font-bold transition shadow-xs flex items-center gap-1.5 cursor-pointer"
                      title="Bloquea creación, edición y eliminación para operadores"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Modo Solo Consulta</span>
                    </button>
                  </div>
                </div>
              </div>

              {permissionSuccessToast && (
                <div className="text-xs font-bold px-3.5 py-2 bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 rounded-xl animate-fadeIn flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{permissionSuccessToast}</span>
                </div>
              )}
            </div>
          )}

          {/* Quick Metrics Bar */}
          {showCategories ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Usuarios</div>
                <div className="text-2xl font-black text-slate-900 mt-1">{effectiveUsers.length}</div>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Administradores</div>
                <div className="text-2xl font-black text-blue-700 mt-1">
                  {effectiveUsers.filter((u) => u.role === 'Administrador').length}
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Coordinación</div>
                <div className="text-2xl font-black text-emerald-700 mt-1">
                  {effectiveUsers.filter((u) => u.role === 'Coordinador' || u.role === 'Gestión').length}
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs">
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Recepción / Otros</div>
                <div className="text-2xl font-black text-indigo-700 mt-1">
                  {effectiveUsers.filter((u) => u.role !== 'Administrador' && u.role !== 'Coordinador' && u.role !== 'Gestión').length}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs inline-block">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Usuarios</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{effectiveUsers.length}</div>
            </div>
          )}

          {/* Search & Filter Tools */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={showCategories ? "Buscar por nombre, usuario, rol o teléfono..." : "Buscar por nombre, usuario o teléfono..."}
                value={userSearchQuery}
                onChange={(e) => setUserSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            {showCategories && (
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos los Roles</option>
                <option value="Administrador">Administrador</option>
                <option value="Coordinador">Coordinador</option>
                <option value="Gestión">Gestión</option>
                <option value="Recepción">Recepción</option>
                <option value="Auxiliar">Personal Auxiliar (Operativo)</option>
              </select>
            )}
          </div>

          {/* Users Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((usr) => {
              const roleBadge = getRoleBadge(usr.role);
              const RoleIcon = roleBadge.icon;
              const isMaster = isMasterAdmin(usr);

              return (
                <div
                  key={usr.username}
                  className={`bg-white border rounded-2xl p-5 shadow-xs flex flex-col justify-between space-y-4 transition ${
                    isMaster ? 'border-amber-300 ring-1 ring-amber-200/60 hover:border-amber-400' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* User Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-11 h-11 rounded-2xl ${usr.avatarColor || 'bg-blue-600'} text-white font-black text-sm flex items-center justify-center shadow-xs ring-2 ring-white`}
                        >
                          {usr.initials || getInitialsFromName(usr.name)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-extrabold text-sm text-slate-900 leading-tight">{usr.name}</h3>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[11px] font-mono font-medium text-slate-500">@{usr.username}</span>
                            {isMaster && (
                              <span className="text-[9.5px] font-black px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded border border-amber-300">
                                👑 Master
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {showCategories && (
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${roleBadge.bg}`}
                        >
                          <RoleIcon className="w-3 h-3" />
                          {roleBadge.label}
                        </span>
                      )}
                    </div>

                    {/* Contact details */}
                    {usr.phone && (
                      <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{usr.phone}</span>
                        </div>
                      </div>
                    )}

                    {/* Protected Credential Status Card */}
                    <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-600 shrink-0">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">
                            Credencial de Acceso
                          </div>
                          <div className="font-mono text-xs font-bold text-slate-700 tracking-wider flex items-center gap-1.5">
                            <span>••••••••••••</span>
                            <span className="text-[9px] font-semibold font-sans px-1.5 py-0.2 bg-emerald-100/70 text-emerald-800 rounded">
                              Activa
                            </span>
                          </div>
                        </div>
                      </div>
                      {canManageUsers && (
                        <button
                          type="button"
                          onClick={() => {
                            if (onOpenChangePassword) {
                              onOpenChangePassword(usr);
                            } else {
                              handleOpenUserForm(usr);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 transition cursor-pointer flex items-center gap-1"
                          title="Restablecer o modificar clave de este usuario"
                        >
                          <KeyRound className="w-3 h-3 text-amber-600" />
                          <span>Cambiar Clave</span>
                        </button>
                      )}
                    </div>

                    {/* Reservation Capabilities Section */}
                    <div className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                          <CalendarPlus className="w-3.5 h-3.5 text-blue-600" />
                          <span>Permisos de Reservas</span>
                        </span>
                        {isShute ? (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                            Editable por ti
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            Por Cristian Shute
                          </span>
                        )}
                      </div>

                      {isCristianShute(usr) ? (
                        <div className="p-2 rounded-lg bg-amber-50/80 border border-amber-200/80 text-[11px] text-amber-900 flex items-center gap-2">
                          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="font-bold leading-tight">Acceso Maestro Permanente: Registro, edición y eliminación sin restricciones.</span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {/* Permiso 1: Registrar Nuevas Reservas */}
                          <div className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60">
                            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                              <span>Registrar nuevas</span>
                            </span>
                            {isShute ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleUserPermission(
                                    usr,
                                    'canCreateReservations',
                                    !userCanCreateReservations(usr)
                                  )
                                }
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1 border ${
                                  userCanCreateReservations(usr)
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                                }`}
                                title="Haz clic para activar o desactivar este permiso"
                              >
                                {userCanCreateReservations(usr) ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                    <span>Activado</span>
                                  </>
                                ) : (
                                  <>
                                    <X className="w-3 h-3 text-rose-600 stroke-[3]" />
                                    <span>Bloqueado</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  userCanCreateReservations(usr)
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {userCanCreateReservations(usr) ? 'Permitido' : 'Restringido'}
                              </span>
                            )}
                          </div>

                          {/* Permiso 2: Editar o Modificar Reservas */}
                          <div className="flex items-center justify-between text-xs py-1 border-b border-slate-200/60">
                            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                              <span>Editar / Modificar</span>
                            </span>
                            {isShute ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleUserPermission(
                                    usr,
                                    'canEditReservations',
                                    !userCanEditReservations(usr)
                                  )
                                }
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1 border ${
                                  userCanEditReservations(usr)
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                                }`}
                                title="Haz clic para activar o desactivar este permiso"
                              >
                                {userCanEditReservations(usr) ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                    <span>Activado</span>
                                  </>
                                ) : (
                                  <>
                                    <X className="w-3 h-3 text-rose-600 stroke-[3]" />
                                    <span>Bloqueado</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  userCanEditReservations(usr)
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {userCanEditReservations(usr) ? 'Permitido' : 'Restringido'}
                              </span>
                            )}
                          </div>

                          {/* Permiso 3: Eliminar Reservas */}
                          <div className="flex items-center justify-between text-xs py-1">
                            <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                              <span>Eliminar reservas</span>
                            </span>
                            {isShute ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleUserPermission(
                                    usr,
                                    'canDeleteReservations',
                                    !userCanDeleteReservations(usr)
                                  )
                                }
                                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold transition cursor-pointer flex items-center gap-1 border ${
                                  userCanDeleteReservations(usr)
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200'
                                }`}
                                title="Haz clic para activar o desactivar este permiso"
                              >
                                {userCanDeleteReservations(usr) ? (
                                  <>
                                    <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                    <span>Activado</span>
                                  </>
                                ) : (
                                  <>
                                    <X className="w-3 h-3 text-rose-600 stroke-[3]" />
                                    <span>Bloqueado</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                  userCanDeleteReservations(usr)
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                              >
                                {userCanDeleteReservations(usr) ? 'Permitido' : 'Restringido'}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <span className="text-[10px] font-mono text-slate-400">
                      {isMaster ? 'Super Administrador' : (usr.isCustom ? 'Personalizado' : 'Sistema')}
                    </span>
                    {canManageUsers && (
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleOpenUserForm(usr)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Editar</span>
                        </button>
                        {isMaster ? (
                          <span
                            title="Usuario Maestro Protegido. Acceso permanente no eliminable."
                            className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200/80 rounded-lg text-[10px] font-bold flex items-center gap-1 shadow-2xs"
                          >
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                            Protegido
                          </span>
                        ) : (
                          <button
                            onClick={() => setUserToDelete(usr)}
                            className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer flex items-center justify-center"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredUsers.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">No se encontraron usuarios</div>
              <p className="text-xs text-slate-500">Prueba ajustando los filtros de búsqueda o crea un nuevo usuario.</p>
              {canManage && (
                <button
                  onClick={() => handleOpenUserForm()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-blue-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Crear Nuevo Usuario
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EQUIPMENT & RESOURCE MANAGEMENT */}
      {activeTab === 'equipment' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Inventario de Equipamiento y Recursos Compartidos
              </h2>
              <p className="text-xs text-slate-500">
                Gestiona el stock de proyectores, micrófonos, parlantes, mobiliario y tecnología con control de disponibilidad en tiempo real.
              </p>
            </div>
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: '¿Restaurar Catálogo de Equipamiento?',
                      message: '¿Deseas restaurar el catálogo de equipamiento a los valores predeterminados?',
                      variant: 'warning',
                      confirmLabel: 'Restablecer Catálogo',
                      onConfirm: () => {
                        if (onResetEquipment) {
                          onResetEquipment();
                        } else {
                          const def = resetEquipmentToDefaults();
                          setLocalEquipment(def);
                        }
                        setConfirmDialog(null);
                      }
                    });
                  }}
                  className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 transition shadow-xs cursor-pointer"
                  title="Restablecer catálogo estándar"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Restablecer</span>
                </button>
                <button
                  id="btn-add-equipment"
                  onClick={() => handleOpenEquipmentForm()}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nuevo Equipamiento</span>
                </button>
              </div>
            )}
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por nombre, categoría o descripción..."
                value={equipmentSearchQuery}
                onChange={(e) => setEquipmentSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>
            <select
              value={equipmentCategoryFilter}
              onChange={(e) => setEquipmentCategoryFilter(e.target.value)}
              className="w-full sm:w-56 px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las categorías ({effectiveEquipment.length})</option>
              <option value="Audiovisual">Audiovisual</option>
              <option value="Audio">Audio y Sonido</option>
              <option value="Informática">Informática y Tecnología</option>
              <option value="Mobiliario">Mobiliario</option>
              <option value="Deportes">Deportes</option>
              <option value="Otros">Otros</option>
            </select>
          </div>

          {/* Equipment Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEquipment.map((eq) => {
              return (
                <div
                  key={eq.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center font-bold shadow-xs shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900 leading-tight">
                            {eq.name}
                          </div>
                          <span className="inline-block mt-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                            {eq.category}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg">
                          Stock: {eq.totalQuantity} un.
                        </span>
                      </div>
                    </div>

                    {eq.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        {eq.description}
                      </p>
                    )}
                  </div>

                  {/* Bottom Controls */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3">
                    {/* Quick stock stepper */}
                    <div className="flex items-center space-x-1">
                      <span className="text-[10px] font-bold text-slate-400 mr-1">Cantidad:</span>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleQuickStockChange(eq, -1)}
                            disabled={eq.totalQuantity <= 1}
                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center disabled:opacity-40 cursor-pointer"
                            title="Disminuir stock"
                          >
                            -
                          </button>
                          <span className="text-xs font-bold text-slate-800 px-1.5">{eq.totalQuantity}</span>
                          <button
                            type="button"
                            onClick={() => handleQuickStockChange(eq, 1)}
                            className="w-6 h-6 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center cursor-pointer"
                            title="Aumentar stock"
                          >
                            +
                          </button>
                        </>
                      )}
                    </div>

                    {/* Action buttons */}
                    {canManage && (
                      <div className="flex items-center space-x-1.5">
                        <button
                          onClick={() => handleOpenEquipmentForm(eq)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition cursor-pointer flex items-center gap-1.5"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Editar</span>
                        </button>
                        <button
                          onClick={() => setEquipmentToDelete(eq)}
                          className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition cursor-pointer flex items-center justify-center"
                          title="Eliminar equipamiento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredEquipment.length === 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
              <Package className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">No se encontraron ítems de equipamiento</div>
              <p className="text-xs text-slate-500">Prueba ajustando los filtros o registra un nuevo recurso para préstamos.</p>
              {canManage && (
                <button
                  onClick={() => handleOpenEquipmentForm()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xs hover:bg-blue-700 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Crear Nuevo Equipamiento
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: MAINTENANCE & SPACE BLOCKS */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <Suspense
            fallback={
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Cargando mantenciones...</span>
              </div>
            }
          >
            <MaintenanceDashboardView
              blocks={spaceBlocks || []}
              availableSpaces={spaces}
              onSaveBlock={onSaveBlock || (async () => {})}
              onDeleteBlock={onDeleteBlock || (async () => {})}
            />
          </Suspense>

          {/* Card de Optimización de Base de Datos y Cuotas Firestore */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="max-w-xl">
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-600" />
                  <span>Depuración Definitiva de Conflictos y Cuotas de Firestore</span>
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Elimina registros obsoletos de desfase de minutos en Firestore y limpia la caché local para preservar la cuota diaria del Spark Plan y evitar transacciones duplicadas.
                </p>
              </div>
              <button
                type="button"
                onClick={handleRunConflictMigration}
                disabled={isMigratingConflicts}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>{isMigratingConflicts ? 'Depurando en Firestore...' : 'Ejecutar Limpieza Definitiva'}</span>
              </button>
            </div>
            {conflictMigrationResult && (
              <div className="text-xs font-semibold px-3 py-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl animate-fadeIn">
                {conflictMigrationResult}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: APPLICANTS DIRECTORY */}
      {activeTab === 'applicants' && (
        <div className="space-y-4">
          <Suspense
            fallback={
              <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span>Cargando directorio de solicitantes...</span>
              </div>
            }
          >
            <ApplicantDirectoryView
              reservations={reservations || []}
              ratings={ratings || []}
              onSelectReservation={onSelectReservation}
              onNewReservationForApplicant={onNewReservationForApplicant}
            />
          </Suspense>
        </div>
      )}

      {/* TAB 7: GMAIL DISPATCH CONFIGURATION (cristianshute@gmail.com) */}
      {activeTab === 'gmail' && (
        <Suspense
          fallback={
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span>Cargando configuración de despacho...</span>
            </div>
          }
        >
          <AdminGmailConfig
            activityTypes={activityTypes}
            loanTypes={loanTypes}
            onOpenGmailDispatch={onOpenGmailDispatch}
            currentUser={currentUser}
          />
        </Suspense>
      )}

      {/* TAB 8: RECURRING ACTIVITIES & PROGRAMMED SERIES */}
      {activeTab === 'recurring' && (
        <Suspense
          fallback={
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span>Cargando actividades recurrentes...</span>
            </div>
          }
        >
          <AdminRecurringView
            reservations={reservations || []}
            spaces={spaces}
            activityTypes={activityTypes}
            onSaveReservation={onSaveReservation}
            onDeleteReservation={onDeleteReservation}
            onEditReservation={onEditReservation}
          />
        </Suspense>
      )}

      {/* --- MODAL FORM: CREATE / EDIT USER --- */}
      {isUserFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto my-8 animate-scaleUp">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div
                  className={`w-10 h-10 rounded-xl ${userForm.avatarColor || 'bg-blue-600'} flex items-center justify-center text-white font-extrabold text-sm shadow-xs`}
                >
                  {userForm.initials || 'NU'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingUsername ? 'Editar Usuario' : 'Crear Nuevo Usuario'}
                  </h3>
                  <p className="text-xs text-slate-500">Asigna nombre, rol, clave y opciones de perfil</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUserFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Notification */}
            {userFormError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{userFormError}</span>
              </div>
            )}

            <form onSubmit={handleSaveUserSubmit} className="space-y-4">
              {/* Nombre Completo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre Completo del Usuario *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Carla Morales, Roberto Lagos"
                  value={userForm.name}
                  onChange={(e) => handleUserNameChange(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Username Identifier */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Identificador de Usuario (@login) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej: carla.morales"
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value.toLowerCase() })}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>

                {/* Iniciales */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Iniciales de Avatar (2-3 letras) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={3}
                    placeholder="Ej: CM"
                    value={userForm.initials}
                    onChange={(e) => setUserForm({ ...userForm, initials: e.target.value.toUpperCase() })}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  />
                </div>
              </div>

              {/* Rol */}
              {showCategories && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Rol y Nivel de Acceso *
                  </label>
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Administrador">👑 Administrador (Acceso total, panel maestro y usuarios)</option>
                    <option value="Coordinador">📋 Coordinador (Planificación, edición y reservas)</option>
                    <option value="Gestión">📊 Gestión (Monitoreo de espacios y seguimiento)</option>
                    <option value="Recepción">🛎️ Recepción (Atención presencial y consultas)</option>
                    <option value="Auxiliar">🧹 Personal Auxiliar (Operativo: Soporte en terreno, mantención y evaluaciones)</option>
                  </select>
                </div>
              )}

              {/* Clave de Acceso */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Clave de Acceso (Contraseña de desbloqueo) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const newPass = generateRandomPassword(userForm.name);
                      setUserForm({ ...userForm, passwordHash: newPass });
                    }}
                    className="text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer flex items-center gap-1"
                    title="Generar nueva clave segura"
                  >
                    🎲 Generar Clave Segura
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showFormPassword ? 'text' : 'password'}
                    required
                    placeholder="Ingresa clave única..."
                    value={userForm.passwordHash}
                    onChange={(e) => setUserForm({ ...userForm, passwordHash: e.target.value })}
                    className="w-full pl-3.5 pr-10 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormPassword(!showFormPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    title={showFormPassword ? "Ocultar clave" : "Mostrar clave"}
                  >
                    {showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>Por seguridad institucional, las claves se almacenan de forma protegida y no se exponen en texto plano.</span>
                </p>
              </div>

              {/* Color del Avatar */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Color del Avatar
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {AVATAR_COLOR_OPTIONS.map((opt) => {
                    const isSelected = userForm.avatarColor === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setUserForm({ ...userForm, avatarColor: opt.id })}
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-white transition-all cursor-pointer ${
                          opt.id
                        } ${isSelected ? 'ring-2 ring-blue-600 ring-offset-2 scale-110 shadow-sm' : 'opacity-80 hover:opacity-100'}`}
                        title={opt.label}
                      >
                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contact Information (Optional) */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Teléfono / Celular de Contacto (opcional)
                </label>
                <input
                  type="text"
                  placeholder="+56 9 1234 5678"
                  value={userForm.phone || ''}
                  onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Reservation Permissions Section (Controlled by Cristian Shute) */}
              <div className="pt-2.5 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CalendarPlus className="w-3.5 h-3.5 text-blue-600" />
                    <span>Permisos de Gestión de Reservas</span>
                  </label>
                  {isShute ? (
                    <span className="text-[9.5px] font-black px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                      Exclusivo Cristian Shute
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-500">
                      Solo lectura
                    </span>
                  )}
                </div>

                <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
                  <label className="flex items-center justify-between text-xs font-medium text-slate-800 cursor-pointer">
                    <div className="space-y-0.5 pr-2">
                      <div className="font-bold text-slate-900">Registrar nuevas reservas</div>
                      <div className="text-[10px] text-slate-500">Permite ingresar y agendar reservas nuevas en el calendario</div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!isShute}
                      checked={Boolean(userForm.canCreateReservations)}
                      onChange={(e) =>
                        setUserForm({ ...userForm, canCreateReservations: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-40 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs font-medium text-slate-800 cursor-pointer pt-2 border-t border-slate-200/60">
                    <div className="space-y-0.5 pr-2">
                      <div className="font-bold text-slate-900">Editar y modificar reservas existentes</div>
                      <div className="text-[10px] text-slate-500">Permite editar horarios, espacios, actividades o cancelar/reactivar</div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!isShute}
                      checked={Boolean(userForm.canEditReservations)}
                      onChange={(e) =>
                        setUserForm({ ...userForm, canEditReservations: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-40 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between text-xs font-medium text-slate-800 cursor-pointer pt-2 border-t border-slate-200/60">
                    <div className="space-y-0.5 pr-2">
                      <div className="font-bold text-slate-900">Eliminar reservas directamente</div>
                      <div className="text-[10px] text-slate-500">Permite suprimir y borrar reservas sin requerir autorización</div>
                    </div>
                    <input
                      type="checkbox"
                      disabled={!isShute}
                      checked={Boolean(userForm.canDeleteReservations)}
                      onChange={(e) =>
                        setUserForm({ ...userForm, canDeleteReservations: e.target.checked })
                      }
                      className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 disabled:opacity-40 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Live Preview Chip */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-9 h-9 rounded-xl ${userForm.avatarColor || 'bg-blue-600'} text-white font-bold text-xs flex items-center justify-center shadow-xs`}
                  >
                    {userForm.initials || 'NU'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 truncate">
                      {userForm.name || 'Vista previa de usuario'}
                    </div>
                    <div className="text-[10px] font-medium text-slate-500">
                      {userForm.role} • @{userForm.username || 'usuario'}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  Vista Previa
                </span>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUserFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition cursor-pointer"
                >
                  {editingUsername ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CONFIRM DELETE USER --- */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">¿Eliminar Usuario?</h3>
              <p className="text-xs text-slate-500">
                Estás a punto de revocar el acceso a <strong>{userToDelete.name}</strong> (@{userToDelete.username}). Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setUserToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteUserConfirm}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL FORM: CREATE / EDIT SPACE --- */}
      {isSpaceFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: spaceForm.color || '#0284c7' }}
                >
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingSpaceId ? 'Editar Espacio' : 'Nuevo Espacio / Sala'}
                  </h3>
                  <p className="text-xs text-slate-500">Configura nombre, categoría y apariencia</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSpaceFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSpaceSubmit} className="space-y-4">
              {spaceFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{spaceFormError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre del Espacio *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: SALA 7, SALA MULTIUSO COMUNITARIA"
                  value={spaceForm.name}
                  onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Categoría *
                </label>
                <select
                  value={spaceForm.category}
                  onChange={(e) => setSpaceForm({ ...spaceForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Salas de Clases">Salas de Clases</option>
                  <option value="Eventos">Eventos y Auditorios</option>
                  <option value="Deportes">Deportes y Acondicionamiento</option>
                  <option value="Exterior">Exterior y Patios</option>
                  <option value="Salud y Atención">Salud y Atención</option>
                  <option value="General">General / Otros</option>
                </select>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Color Identificador
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSpaceForm({ ...spaceForm, color: c })}
                      className={`w-6 h-6 rounded-full border transition-all flex items-center justify-center cursor-pointer ${
                        spaceForm.color === c ? 'ring-2 ring-blue-600 ring-offset-2 scale-110' : 'border-slate-300'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {spaceForm.color === c && <Check className="w-3 h-3 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descripción
                </label>
                <textarea
                  rows={3}
                  placeholder="Detalles sobre equipamiento disponible, mobiliario o restricciones..."
                  value={spaceForm.description}
                  onChange={(e) => setSpaceForm({ ...spaceForm, description: e.target.value })}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSpaceFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  {editingSpaceId ? 'Guardar Cambios' : 'Crear Espacio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL FORM: CREATE / EDIT ACTIVITY & LOAN TYPE --- */}
      {isActivityFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: activityForm.color || '#0284c7' }}
                >
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingActivityId ? 'Editar Tipo de Actividad / Préstamo' : 'Nuevo Tipo de Actividad / Préstamo'}
                  </h3>
                  <p className="text-xs text-slate-500">Configura nombre, área temática, color y descripción</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsActivityFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveActivitySubmit} className="space-y-4">
              {activityFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{activityFormError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre de la Actividad o Préstamo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: TALLER DE DANZA, PRÉSTAMO VECINAL, CONVENIO MUNICIPAL"
                  value={activityForm.name}
                  onChange={(e) => setActivityForm({ ...activityForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 uppercase focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Categoría Temática *
                </label>
                <select
                  value={activityForm.category}
                  onChange={(e) => setActivityForm({ ...activityForm, category: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Formación y Desarrollo">Formación y Desarrollo</option>
                  <option value="Deportes y Actividad Física">Deportes y Actividad Física</option>
                  <option value="Cultura y Artes">Cultura y Artes</option>
                  <option value="Social y Familiar">Social y Familiar</option>
                  <option value="Vecinal y Comunitario">Vecinal y Comunitario</option>
                  <option value="Educación y Salud">Educación y Salud</option>
                  <option value="Institucional y Municipal">Institucional y Municipal</option>
                  <option value="General">General</option>
                </select>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Color de Etiqueta
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActivityForm({ ...activityForm, color: c })}
                      className={`w-6 h-6 rounded-full border transition-all flex items-center justify-center cursor-pointer ${
                        activityForm.color === c ? 'ring-2 ring-blue-600 ring-offset-2 scale-110' : 'border-slate-300'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {activityForm.color === c && <Check className="w-3 h-3 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descripción
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe los objetivos, público objetivo, condiciones o requisitos..."
                  value={activityForm.description}
                  onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsActivityFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  {editingActivityId ? 'Guardar Cambios' : 'Crear Tipo de Actividad / Préstamo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL FORM: CREATE / EDIT EQUIPMENT --- */}
      {isEquipmentFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto my-8 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingEquipmentId ? 'Editar Equipamiento' : 'Nuevo Equipamiento / Recurso'}
                  </h3>
                  <p className="text-xs text-slate-500">Configura nombre, categoría, stock total y descripción</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEquipmentFormOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEquipmentSubmit} className="space-y-4">
              {equipmentFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{equipmentFormError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre del Equipamiento / Recurso *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Data Show HD, Telón Móvil, Set de Colchonetas, Micrófono"
                  value={equipmentForm.name}
                  onChange={(e) => setEquipmentForm({ ...equipmentForm, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Categoría *
                  </label>
                  <select
                    value={equipmentForm.category}
                    onChange={(e) => setEquipmentForm({ ...equipmentForm, category: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Audiovisual">Audiovisual</option>
                    <option value="Audio">Audio y Sonido</option>
                    <option value="Informática">Informática y Tecnología</option>
                    <option value="Mobiliario">Mobiliario</option>
                    <option value="Deportes">Deportes</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Stock Total Disponible (unidades) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={500}
                    value={equipmentForm.totalQuantity}
                    onChange={(e) => setEquipmentForm({ ...equipmentForm, totalQuantity: parseInt(e.target.value, 10) || 1 })}
                    className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-bold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descripción y Especificaciones Técnicas
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe los conectores (HDMI/VGA), accesorios incluidos, marcas o condiciones de uso..."
                  value={equipmentForm.description || ''}
                  onChange={(e) => setEquipmentForm({ ...equipmentForm, description: e.target.value })}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEquipmentFormOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  {editingEquipmentId ? 'Guardar Cambios' : 'Crear Equipamiento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL CONFIRM DELETE EQUIPMENT --- */}
      {equipmentToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">¿Eliminar Equipamiento?</h3>
              <p className="text-xs text-slate-500">
                Estás a punto de eliminar <strong>{equipmentToDelete.name}</strong> del inventario.
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setEquipmentToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDeleteEquipmentConfirm}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* --- CONFIRMATION MODAL --- */}
      {confirmDialog && (
        <ConfirmationModal
          isOpen={confirmDialog.isOpen}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={confirmDialog.cancelLabel}
          hideCancel={confirmDialog.hideCancel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  );
};

export default AdminView;
