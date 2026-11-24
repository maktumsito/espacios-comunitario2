import { useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { Reservation, SpaceRating } from '../types';
import { AuthUser } from '../services/authService';
import { DetectedConflictDetail } from '../utils/conflictDetector';

export interface UseReservationModalsReturn {
  // Modal visibility states
  isReservationModalOpen: boolean;
  setIsReservationModalOpen: (open: boolean) => void;
  isDetailModalOpen: boolean;
  setIsDetailModalOpen: (open: boolean) => void;
  isImportExportModalOpen: boolean;
  setIsImportExportModalOpen: (open: boolean) => void;
  isAuditLogOpen: boolean;
  setIsAuditLogOpen: (open: boolean) => void;
  isDeleteModalOpen: boolean;
  setIsDeleteModalOpen: (open: boolean) => void;
  isPendingDeletionsModalOpen: boolean;
  setIsPendingDeletionsModalOpen: (open: boolean) => void;
  isChangePasswordOpen: boolean;
  setIsChangePasswordOpen: (open: boolean) => void;
  isPasswordPromptOpen: boolean;
  setIsPasswordPromptOpen: (open: boolean) => void;
  isRatingModalOpen: boolean;
  setIsRatingModalOpen: (open: boolean) => void;
  isGlobalPrintModalOpen: boolean;
  setIsGlobalPrintModalOpen: (open: boolean) => void;
  isGmailDispatchModalOpen: boolean;
  setIsGmailDispatchModalOpen: (open: boolean) => void;
  isNotificationCenterOpen: boolean;
  setIsNotificationCenterOpen: (open: boolean) => void;

  // Selected entities and targets
  selectedReservation: Reservation | null;
  setSelectedReservation: Dispatch<SetStateAction<Reservation | null>>;
  editingReservation: Reservation | null;
  setEditingReservation: (res: Reservation | null) => void;
  isDuplicating: boolean;
  setIsDuplicating: (duplicating: boolean) => void;
  deleteTargetReservation: Reservation | null;
  setDeleteTargetReservation: (res: Reservation | null) => void;
  ratingTargetReservation: Reservation | null;
  setRatingTargetReservation: (res: Reservation | null) => void;
  editingRating: SpaceRating | null;
  setEditingRating: (rating: SpaceRating | null) => void;
  passwordTargetUser: AuthUser | null;
  setPasswordTargetUser: (user: AuthUser | null) => void;
  globalPrintInitialDate: string | undefined;
  setGlobalPrintInitialDate: (date: string | undefined) => void;
  gmailDispatchInitialDate: string | undefined;
  setGmailDispatchInitialDate: (date: string | undefined) => void;
  gmailDispatchFilterMode: 'solo_prestamos' | 'prestamos_y_seleccionadas' | 'actividades_seleccionadas' | 'todas' | undefined;
  setGmailDispatchFilterMode: (mode: 'solo_prestamos' | 'prestamos_y_seleccionadas' | 'actividades_seleccionadas' | 'todas' | undefined) => void;
  gmailDispatchReservationId: string | undefined;
  setGmailDispatchReservationId: (id: string | undefined) => void;
  openGmailDispatchModal: (
    initialDate?: string,
    filterMode?: 'solo_prestamos' | 'prestamos_y_seleccionadas' | 'actividades_seleccionadas' | 'todas',
    reservationId?: string
  ) => void;

  // Conflict report dialog state
  conflictReportData: {
    isOpen: boolean;
    savedCount: number;
    conflicts: DetectedConflictDetail[];
  };
  setConflictReportData: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    savedCount: number;
    conflicts: DetectedConflictDetail[];
  }>>;

  // Auth gate prompt
  pendingAuthAction: (() => void) | null;
  setPendingAuthAction: (action: (() => void) | null) => void;
  authActionDescription: string;
  setAuthActionDescription: (desc: string) => void;

  // Modal Prefills
  prefillDate: string;
  setPrefillDate: (val: string) => void;
  prefillSpace: string;
  setPrefillSpace: (val: string) => void;
  prefillStartTime: string;
  setPrefillStartTime: (val: string) => void;
  prefillEndTime: string;
  setPrefillEndTime: (val: string) => void;
  prefillResponsable: string;
  setPrefillResponsable: (val: string) => void;
  prefillRut: string;
  setPrefillRut: (val: string) => void;
  prefillPhone: string;
  setPrefillPhone: (val: string) => void;
  prefillEmail: string;
  setPrefillEmail: (val: string) => void;

  // Helper actions
  closeReservationModal: () => void;
  openCreateModal: (params?: {
    date?: string;
    space?: string;
    startTime?: string;
    endTime?: string;
    responsable?: string;
    rut?: string;
    phone?: string;
    email?: string;
  }) => void;
}

export function useReservationModals(): UseReservationModalsReturn {
  // Modal visibility
  const [isReservationModalOpen, setIsReservationModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPendingDeletionsModalOpen, setIsPendingDeletionsModalOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [isGlobalPrintModalOpen, setIsGlobalPrintModalOpen] = useState(false);
  const [isGmailDispatchModalOpen, setIsGmailDispatchModalOpen] = useState(false);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);

  // Targets & entities
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [deleteTargetReservation, setDeleteTargetReservation] = useState<Reservation | null>(null);
  const [ratingTargetReservation, setRatingTargetReservation] = useState<Reservation | null>(null);
  const [editingRating, setEditingRating] = useState<SpaceRating | null>(null);
  const [passwordTargetUser, setPasswordTargetUser] = useState<AuthUser | null>(null);
  const [globalPrintInitialDate, setGlobalPrintInitialDate] = useState<string | undefined>(undefined);
  const [gmailDispatchInitialDate, setGmailDispatchInitialDate] = useState<string | undefined>(undefined);
  const [gmailDispatchFilterMode, setGmailDispatchFilterMode] = useState<
    'solo_prestamos' | 'prestamos_y_seleccionadas' | 'actividades_seleccionadas' | 'todas' | undefined
  >(undefined);
  const [gmailDispatchReservationId, setGmailDispatchReservationId] = useState<string | undefined>(undefined);

  // Conflicts report dialog
  const [conflictReportData, setConflictReportData] = useState<{
    isOpen: boolean;
    savedCount: number;
    conflicts: DetectedConflictDetail[];
  }>({
    isOpen: false,
    savedCount: 0,
    conflicts: []
  });

  // Auth gate prompt
  const [pendingAuthAction, setPendingAuthAction] = useState<(() => void) | null>(null);
  const [authActionDescription, setAuthActionDescription] = useState('modificar o crear reservas');

  // Modal prefills
  const [prefillDate, setPrefillDate] = useState<string>('');
  const [prefillSpace, setPrefillSpace] = useState<string>('');
  const [prefillStartTime, setPrefillStartTime] = useState<string>('08:30');
  const [prefillEndTime, setPrefillEndTime] = useState<string>('09:30');
  const [prefillResponsable, setPrefillResponsable] = useState<string>('');
  const [prefillRut, setPrefillRut] = useState<string>('');
  const [prefillPhone, setPrefillPhone] = useState<string>('');
  const [prefillEmail, setPrefillEmail] = useState<string>('');

  const closeReservationModal = useCallback(() => {
    setIsReservationModalOpen(false);
    setEditingReservation(null);
    setIsDuplicating(false);
    setPrefillDate('');
    setPrefillSpace('');
    setPrefillStartTime('08:30');
    setPrefillEndTime('09:30');
    setPrefillResponsable('');
    setPrefillRut('');
    setPrefillPhone('');
    setPrefillEmail('');
  }, []);

  const openCreateModal = useCallback((params?: {
    date?: string;
    space?: string;
    startTime?: string;
    endTime?: string;
    responsable?: string;
    rut?: string;
    phone?: string;
    email?: string;
  }) => {
    setEditingReservation(null);
    setIsDuplicating(false);
    setPrefillDate(params?.date || '');
    setPrefillSpace(params?.space || '');
    // Default early start time (< 08:30) to 08:30; manual entry if earlier
    const rawStart = params?.startTime || '08:30';
    const isEarly = rawStart < '08:30';
    setPrefillStartTime(isEarly ? '08:30' : rawStart);
    setPrefillEndTime(params?.endTime || (isEarly ? '09:30' : '09:30'));
    setPrefillResponsable(params?.responsable || '');
    setPrefillRut(params?.rut || '');
    setPrefillPhone(params?.phone || '');
    setPrefillEmail(params?.email || '');
    setIsReservationModalOpen(true);
  }, []);

  const openGmailDispatchModal = useCallback((
    initialDate?: string,
    filterMode?: 'solo_prestamos' | 'prestamos_y_seleccionadas' | 'actividades_seleccionadas' | 'todas',
    reservationId?: string
  ) => {
    setGmailDispatchInitialDate(initialDate);
    setGmailDispatchFilterMode(filterMode);
    setGmailDispatchReservationId(reservationId);
    setIsGmailDispatchModalOpen(true);
  }, []);

  return {
    isReservationModalOpen,
    setIsReservationModalOpen,
    isDetailModalOpen,
    setIsDetailModalOpen,
    isImportExportModalOpen,
    setIsImportExportModalOpen,
    isAuditLogOpen,
    setIsAuditLogOpen,
    isDeleteModalOpen,
    setIsDeleteModalOpen,
    isPendingDeletionsModalOpen,
    setIsPendingDeletionsModalOpen,
    isChangePasswordOpen,
    setIsChangePasswordOpen,
    isPasswordPromptOpen,
    setIsPasswordPromptOpen,
    isRatingModalOpen,
    setIsRatingModalOpen,
    isGlobalPrintModalOpen,
    setIsGlobalPrintModalOpen,
    isGmailDispatchModalOpen,
    setIsGmailDispatchModalOpen,
    isNotificationCenterOpen,
    setIsNotificationCenterOpen,
    selectedReservation,
    setSelectedReservation,
    editingReservation,
    setEditingReservation,
    isDuplicating,
    setIsDuplicating,
    deleteTargetReservation,
    setDeleteTargetReservation,
    ratingTargetReservation,
    setRatingTargetReservation,
    editingRating,
    setEditingRating,
    passwordTargetUser,
    setPasswordTargetUser,
    globalPrintInitialDate,
    setGlobalPrintInitialDate,
    gmailDispatchInitialDate,
    setGmailDispatchInitialDate,
    gmailDispatchFilterMode,
    setGmailDispatchFilterMode,
    gmailDispatchReservationId,
    setGmailDispatchReservationId,
    openGmailDispatchModal,
    conflictReportData,
    setConflictReportData,
    pendingAuthAction,
    setPendingAuthAction,
    authActionDescription,
    setAuthActionDescription,
    prefillDate,
    setPrefillDate,
    prefillSpace,
    setPrefillSpace,
    prefillStartTime,
    setPrefillStartTime,
    prefillEndTime,
    setPrefillEndTime,
    prefillResponsable,
    setPrefillResponsable,
    prefillRut,
    setPrefillRut,
    prefillPhone,
    setPrefillPhone,
    prefillEmail,
    setPrefillEmail,
    closeReservationModal,
    openCreateModal
  };
}
