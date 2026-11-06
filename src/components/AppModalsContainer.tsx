import React, { Suspense } from 'react';
import { Reservation, SpaceInfo, SpaceRating, ViewMode, ActivityTypeItem, LoanType, SpaceBlock, EquipmentItem } from '../types';
import { AuthUser, isCoordinatorOrAdmin } from '../services/authService';
import { lazyWithRetry } from '../utils/lazyWithRetry';

// Lazy-loaded auxiliary modals
const SpaceRatingModal = lazyWithRetry(
  () => import('./SpaceRatingModal').then((m) => ({ default: m.SpaceRatingModal })),
  'SpaceRatingModal'
);
const DeleteConfirmationModal = lazyWithRetry(
  () => import('./DeleteConfirmationModal').then((m) => ({ default: m.DeleteConfirmationModal })),
  'DeleteConfirmationModal'
);
const PendingDeletionsModal = lazyWithRetry(
  () => import('./PendingDeletionsModal').then((m) => ({ default: m.PendingDeletionsModal })),
  'PendingDeletionsModal'
);
const ImportExportModal = lazyWithRetry(
  () => import('./ImportExportModal').then((m) => ({ default: m.ImportExportModal })),
  'ImportExportModal'
);
const AuditLogModal = lazyWithRetry(
  () => import('./AuditLogModal').then((m) => ({ default: m.AuditLogModal })),
  'AuditLogModal'
);
const ConflictReportModal = lazyWithRetry(
  () => import('./ConflictReportModal').then((m) => ({ default: m.ConflictReportModal })),
  'ConflictReportModal'
);
const PrintScheduleModal = lazyWithRetry(
  () => import('./PrintScheduleModal').then((m) => ({ default: m.PrintScheduleModal })),
  'PrintScheduleModal'
);
const NotificationCenterModal = lazyWithRetry(
  () => import('./NotificationCenterModal').then((m) => ({ default: m.NotificationCenterModal })),
  'NotificationCenterModal'
);
const PasswordPromptModal = lazyWithRetry(
  () => import('./PasswordPromptModal').then((m) => ({ default: m.PasswordPromptModal })),
  'PasswordPromptModal'
);
const ChangePasswordModal = lazyWithRetry(
  () => import('./ChangePasswordModal').then((m) => ({ default: m.ChangePasswordModal })),
  'ChangePasswordModal'
);
const GmailDispatchModal = lazyWithRetry(
  () => import('./GmailDispatchModal').then((m) => ({ default: m.GmailDispatchModal })),
  'GmailDispatchModal'
);

export interface AppModalsContainerProps {
  currentUser: AuthUser | null;
  reservations: Reservation[];
  spaces: SpaceInfo[];
  spaceBlocks?: SpaceBlock[];
  equipment?: EquipmentItem[];
  activityTypes: ActivityTypeItem[];
  loanTypes: LoanType[];

  // Space Rating
  isRatingModalOpen: boolean;
  ratingTargetReservation: Reservation | null;
  editingRating: SpaceRating | null;
  onCloseRatingModal: () => void;
  onSaveRating: (rating: SpaceRating) => Promise<void>;

  // Delete modal
  isDeleteModalOpen: boolean;
  deleteTargetReservation: Reservation | null;
  onCloseDeleteModal: () => void;
  onConfirmDeleteSingle: (id: string) => void;
  onConfirmDeleteSeries: (seriesId: string) => void;
  onClearParticipants?: (reservation: Reservation) => void;
  onSubmitDeleteRequest?: (
    reservation: Reservation,
    motivo?: string,
    isSeries?: boolean,
    seriesId?: string
  ) => void;
  onAuthorizeDelete?: (reservation: Reservation) => void;
  onRejectDeleteRequest?: (reservation: Reservation) => void;

  // Pending deletions
  isPendingDeletionsModalOpen: boolean;
  pendingReservations: Reservation[];
  onClosePendingDeletionsModal: () => void;
  onSelectPendingReservation: (res: Reservation) => void;

  // Import / Export
  isImportExportModalOpen: boolean;
  onCloseImportExportModal: () => void;
  onImportReservations: (imported: Reservation[]) => Promise<void>;
  onSyncAllToFirebase: () => Promise<any>;
  onRestoreFromBackup: (restored: Reservation[]) => void;

  // Audit Logs
  isAuditLogOpen: boolean;
  auditLogs: any[];
  onCloseAuditLog: () => void;
  onReservationsChanged: () => Promise<void>;

  // Conflict Report
  conflictReportData: {
    isOpen: boolean;
    conflicts: any[];
    savedCount: number;
  };
  onCloseConflictReport: () => void;

  // Print Modal
  isGlobalPrintModalOpen: boolean;
  globalPrintInitialDate?: string;
  onClosePrintModal: () => void;

  // Notification Center
  isNotificationCenterOpen: boolean;
  onCloseNotificationCenter: () => void;
  onNavigateToView: (view: ViewMode) => void;
  onSelectReservationFromNotification: (resId: string) => void;

  // Password Prompt
  isPasswordPromptOpen: boolean;
  authActionDescription: string;
  onClosePasswordPrompt: () => void;
  onAuthSuccess: (user: AuthUser) => void;

  // Change Password
  isChangePasswordOpen: boolean;
  passwordTargetUser: AuthUser | null;
  onCloseChangePassword: () => void;
  onPasswordChanged?: (updatedUser?: AuthUser) => void;

  // Gmail Dispatch
  isGmailDispatchModalOpen: boolean;
  gmailDispatchInitialDate?: string;
  gmailDispatchFilterMode?: 'solo_prestamos' | 'prestamos_y_seleccionadas' | 'actividades_seleccionadas' | 'todas';
  gmailDispatchReservationId?: string;
  onCloseGmailDispatch: () => void;
}

export const AppModalsContainer: React.FC<AppModalsContainerProps> = ({
  currentUser,
  reservations,
  spaces,
  spaceBlocks,
  equipment,
  activityTypes,
  loanTypes,

  isRatingModalOpen,
  ratingTargetReservation,
  editingRating,
  onCloseRatingModal,
  onSaveRating,

  isDeleteModalOpen,
  deleteTargetReservation,
  onCloseDeleteModal,
  onConfirmDeleteSingle,
  onConfirmDeleteSeries,
  onClearParticipants,
  onSubmitDeleteRequest,
  onAuthorizeDelete,
  onRejectDeleteRequest,

  isPendingDeletionsModalOpen,
  pendingReservations,
  onClosePendingDeletionsModal,
  onSelectPendingReservation,

  isImportExportModalOpen,
  onCloseImportExportModal,
  onImportReservations,
  onSyncAllToFirebase,
  onRestoreFromBackup,

  isAuditLogOpen,
  auditLogs,
  onCloseAuditLog,
  onReservationsChanged,

  conflictReportData,
  onCloseConflictReport,

  isGlobalPrintModalOpen,
  globalPrintInitialDate,
  onClosePrintModal,

  isNotificationCenterOpen,
  onCloseNotificationCenter,
  onNavigateToView,
  onSelectReservationFromNotification,

  isPasswordPromptOpen,
  authActionDescription,
  onClosePasswordPrompt,
  onAuthSuccess,

  isChangePasswordOpen,
  passwordTargetUser,
  onCloseChangePassword,
  onPasswordChanged,

  isGmailDispatchModalOpen,
  gmailDispatchInitialDate,
  gmailDispatchFilterMode,
  gmailDispatchReservationId,
  onCloseGmailDispatch
}) => {
  return (
    <>
      {/* Modal de Calificación de Espacios */}
      {isRatingModalOpen && (
        <Suspense fallback={null}>
          <SpaceRatingModal
            isOpen={isRatingModalOpen}
            reservation={ratingTargetReservation}
            existingRating={editingRating}
            currentUserName={currentUser?.name}
            onClose={onCloseRatingModal}
            onSaveRating={onSaveRating}
          />
        </Suspense>
      )}

      {/* Modal de Confirmación de Eliminación */}
      {isDeleteModalOpen && (
        <Suspense fallback={null}>
          <DeleteConfirmationModal
            isOpen={isDeleteModalOpen}
            reservation={deleteTargetReservation}
            onClose={onCloseDeleteModal}
            onConfirmDeleteSingle={onConfirmDeleteSingle}
            onConfirmDeleteSeries={onConfirmDeleteSeries}
            onClearParticipants={onClearParticipants}
            currentUser={currentUser}
            onSubmitDeleteRequest={onSubmitDeleteRequest}
            onAuthorizeDelete={onAuthorizeDelete}
            onRejectDeleteRequest={onRejectDeleteRequest}
          />
        </Suspense>
      )}

      {/* Modal de Solicitudes de Eliminación en Espera */}
      {isPendingDeletionsModalOpen && isCoordinatorOrAdmin(currentUser) && (
        <Suspense fallback={null}>
          <PendingDeletionsModal
            isOpen={isPendingDeletionsModalOpen && isCoordinatorOrAdmin(currentUser)}
            onClose={onClosePendingDeletionsModal}
            pendingReservations={pendingReservations}
            onAuthorizeDelete={onAuthorizeDelete || (() => {})}
            onRejectDeleteRequest={onRejectDeleteRequest || (() => {})}
            onSelectReservation={onSelectPendingReservation}
          />
        </Suspense>
      )}

      {/* Modal de Importar / Exportar / Respaldo */}
      {isImportExportModalOpen && (
        <Suspense fallback={null}>
          <ImportExportModal
            isOpen={isImportExportModalOpen}
            spaces={spaces}
            spaceBlocks={spaceBlocks}
            activityTypes={activityTypes}
            loanTypes={loanTypes}
            equipment={equipment}
            onClose={onCloseImportExportModal}
            reservations={reservations}
            currentUser={currentUser}
            onImportReservations={onImportReservations}
            onSyncAllToFirebase={onSyncAllToFirebase}
            onRestoreFromBackup={onRestoreFromBackup}
          />
        </Suspense>
      )}

      {/* Registro de Auditoría & Control de Restauración */}
      {isAuditLogOpen && isCoordinatorOrAdmin(currentUser) && (
        <Suspense fallback={null}>
          <AuditLogModal
            isOpen={isAuditLogOpen && isCoordinatorOrAdmin(currentUser)}
            onClose={onCloseAuditLog}
            logs={auditLogs}
            currentUser={currentUser}
            allReservations={reservations}
            onReservationsChanged={onReservationsChanged}
          />
        </Suspense>
      )}

      {/* Reporte de Conflictos / Topamientos */}
      {conflictReportData.isOpen && (
        <Suspense fallback={null}>
          <ConflictReportModal
            isOpen={conflictReportData.isOpen}
            onClose={onCloseConflictReport}
            conflicts={conflictReportData.conflicts}
            savedCount={conflictReportData.savedCount}
          />
        </Suspense>
      )}

      {/* Modal de Impresión / PDF */}
      {isGlobalPrintModalOpen && (
        <Suspense fallback={null}>
          <PrintScheduleModal
            isOpen={isGlobalPrintModalOpen}
            onClose={onClosePrintModal}
            reservations={reservations}
            spaces={spaces}
            initialDate={globalPrintInitialDate}
          />
        </Suspense>
      )}

      {/* Centro de Notificaciones */}
      {isNotificationCenterOpen && (
        <Suspense fallback={null}>
          <NotificationCenterModal
            isOpen={isNotificationCenterOpen}
            onClose={onCloseNotificationCenter}
            onNavigateToView={onNavigateToView}
            onSelectReservation={onSelectReservationFromNotification}
          />
        </Suspense>
      )}

      {/* Modal de Contraseña / Desbloqueo de Edición */}
      {isPasswordPromptOpen && (
        <Suspense fallback={null}>
          <PasswordPromptModal
            isOpen={isPasswordPromptOpen}
            onClose={onClosePasswordPrompt}
            onSuccess={onAuthSuccess}
            actionDescription={authActionDescription}
          />
        </Suspense>
      )}

      {/* Modal de Cambio de Contraseña */}
      {isChangePasswordOpen && (
        <Suspense fallback={null}>
          <ChangePasswordModal
            isOpen={isChangePasswordOpen}
            onClose={onCloseChangePassword}
            targetUser={passwordTargetUser}
            currentUser={currentUser}
            onPasswordChanged={onPasswordChanged}
          />
        </Suspense>
      )}

      {/* Modal de Despacho de Correo Gmail */}
      {isGmailDispatchModalOpen && (
        <Suspense fallback={null}>
          <GmailDispatchModal
            isOpen={isGmailDispatchModalOpen}
            onClose={onCloseGmailDispatch}
            reservations={reservations}
            availableSpaces={spaces}
            availableActivityTypes={activityTypes}
            availableLoanTypes={loanTypes}
            initialDate={gmailDispatchInitialDate}
            initialFilterMode={gmailDispatchFilterMode}
            initialReservationId={gmailDispatchReservationId}
            currentUser={currentUser}
          />
        </Suspense>
      )}
    </>
  );
};
