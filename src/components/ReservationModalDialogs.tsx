import React from 'react';
import { Reservation, SpaceInfo } from '../types';
import { ConflictResolutionModal, type ConflictSavePayload } from './ConflictResolutionModal';
import { CommitmentLetterModal } from './CommitmentLetterModal';
import { ConfirmationModal } from './common/ConfirmationModal';
import { CustomScheduleSlot } from './RecurrenceScheduleSection';

export interface DeleteConfirmModalState {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  secondaryAction?: {
    label: string;
    onClick: () => void;
    className?: string;
  };
}

interface ReservationModalDialogsProps {
  // Conflict resolution modal
  showConflictDialog: boolean;
  setShowConflictDialog: (show: boolean) => void;
  handleConfirmSaveFromConflictModal: (overrideAllowed: boolean, payload?: ConflictSavePayload) => void;
  bookingMode: 'single' | 'specific' | 'pattern';
  formData: Partial<Reservation>;
  isEditingSingleOccurrence: boolean;
  editingReservation?: Reservation | null;
  enableSingleSecondSpace: boolean;
  singleSecondSpace: string;
  singleSecondStartTime: string;
  singleSecondEndTime: string;
  specificDates: string[];
  dateSchedules: Record<string, CustomScheduleSlot>;
  useCustomSchedulesPerDate: boolean;
  generatedDates: readonly string[] | string[];
  daySchedules: Record<number, CustomScheduleSlot>;
  useCustomSchedulesPerDay: boolean;
  availableSpaces: SpaceInfo[];
  allReservations: Reservation[];
  excludeReservationIds: string[];
  excludeSeriesId?: string;
  allowConflictOverride: boolean;
  canOverrideConflicts?: boolean;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  handleUpdateSecondSpace: (updates: { space?: string; startTime?: string; endTime?: string }) => void;
  setSpecificDates: React.Dispatch<React.SetStateAction<string[]>>;
  setDateSchedules: React.Dispatch<React.SetStateAction<Record<string, CustomScheduleSlot>>>;
  handleConvertToSpecificDates: (dates: string[], schedules: Record<string, CustomScheduleSlot>) => void;
  setAllowConflictOverride: (allow: boolean) => void;

  // Commitment letter modal
  showCommitmentLetterModal: boolean;
  setShowCommitmentLetterModal: (show: boolean) => void;
  effectiveFormDataForLetter: any;
  effectiveSeriesSlotsForLetter: any;

  // Deletion confirmation modal
  deleteConfirmModal: DeleteConfirmModalState;
  setDeleteConfirmModal: React.Dispatch<React.SetStateAction<DeleteConfirmModalState>>;
}

export const ReservationModalDialogs: React.FC<ReservationModalDialogsProps> = React.memo(({
  showConflictDialog,
  setShowConflictDialog,
  handleConfirmSaveFromConflictModal,
  bookingMode,
  formData,
  isEditingSingleOccurrence,
  editingReservation,
  enableSingleSecondSpace,
  singleSecondSpace,
  singleSecondStartTime,
  singleSecondEndTime,
  specificDates,
  dateSchedules,
  useCustomSchedulesPerDate,
  generatedDates,
  daySchedules,
  useCustomSchedulesPerDay,
  availableSpaces,
  allReservations,
  excludeReservationIds,
  excludeSeriesId,
  allowConflictOverride,
  canOverrideConflicts = true,
  setFormData,
  handleUpdateSecondSpace,
  setSpecificDates,
  setDateSchedules,
  handleConvertToSpecificDates,
  setAllowConflictOverride,
  showCommitmentLetterModal,
  setShowCommitmentLetterModal,
  effectiveFormDataForLetter,
  effectiveSeriesSlotsForLetter,
  deleteConfirmModal,
  setDeleteConfirmModal
}) => {
  return (
    <>
      {/* Topamiento Conflict Resolution Modal with Mass & Individual Options */}
      {showConflictDialog && (
        <ConflictResolutionModal
          isOpen={showConflictDialog}
          onClose={() => setShowConflictDialog(false)}
          onConfirmSaveDirectly={handleConfirmSaveFromConflictModal}
          bookingMode={bookingMode}
          formData={formData}
          isEditingSingleOccurrence={isEditingSingleOccurrence}
          editingReservation={editingReservation}
          enableSingleSecondSpace={enableSingleSecondSpace}
          singleSecondSpace={singleSecondSpace}
          singleSecondStartTime={singleSecondStartTime}
          singleSecondEndTime={singleSecondEndTime}
          specificDates={specificDates}
          dateSchedules={dateSchedules}
          useCustomSchedulesPerDate={useCustomSchedulesPerDate}
          generatedDates={generatedDates as string[]}
          daySchedules={daySchedules}
          useCustomSchedulesPerDay={useCustomSchedulesPerDay}
          availableSpaces={availableSpaces}
          allReservations={allReservations}
          excludeReservationIds={excludeReservationIds}
          excludeSeriesId={excludeSeriesId}
          allowConflictOverride={allowConflictOverride}
          canOverrideConflicts={canOverrideConflicts}
          onUpdateFormData={setFormData}
          onUpdateSecondSpace={handleUpdateSecondSpace}
          onUpdateSpecificDates={setSpecificDates}
          onUpdateDateSchedules={setDateSchedules}
          onConvertToSpecificDates={handleConvertToSpecificDates}
          onSetAllowConflictOverride={setAllowConflictOverride}
        />
      )}

      {/* Carta de Compromiso Modal */}
      {showCommitmentLetterModal && (
        <CommitmentLetterModal
          isOpen={showCommitmentLetterModal}
          onClose={() => setShowCommitmentLetterModal(false)}
          reservationData={effectiveFormDataForLetter}
          onUpdateReservationData={(updated) => {
            setFormData((prev) => ({
              ...prev,
              ...updated
            }));
          }}
          spaces={availableSpaces}
          allReservations={allReservations}
          seriesScheduleItems={effectiveSeriesSlotsForLetter}
        />
      )}

      {/* Confirmation Modal for Deletions */}
      <ConfirmationModal
        isOpen={deleteConfirmModal.isOpen}
        title={deleteConfirmModal.title}
        message={deleteConfirmModal.message}
        variant="danger"
        confirmLabel={deleteConfirmModal.confirmLabel}
        onConfirm={deleteConfirmModal.onConfirm}
        onCancel={() => setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        secondaryAction={deleteConfirmModal.secondaryAction}
      />
    </>
  );
});

ReservationModalDialogs.displayName = 'ReservationModalDialogs';
