import { ReservationSectionHeader } from './ReservationSectionHeader';
import React from 'react';
import { User } from 'lucide-react';
import { Reservation } from '../types';
import { ResponsibleHistoryAlert } from '../services/ratingService';
import { ApplicantContactSection } from './ApplicantContactSection';

export interface ReservationStep3ApplicantProps {
  isWizardMode: boolean;
  wizardStep: 1 | 2 | 3 | 4 | 5;
  formData: Partial<Reservation>;
  setFormData: React.Dispatch<React.SetStateAction<Partial<Reservation>>>;
  handleResponsableChange: (name: string) => void;
  uniqueResponsablesList: {
    responsable: string;
    rut?: string;
    telefonoContacto?: string;
    emailContacto?: string;
    domicilio?: string;
  }[];
  autoFilledContactNotice: boolean;
  phoneValidation: { isValid: boolean; error?: string };
  rutValidation: { isValid: boolean; error?: string };
  emailValidation: { isValid: boolean; error?: string };
  primarySpaceCapacityWarning: { hasWarning: boolean; recommendedCapacity: number; requestedCount: number };
  secondSpaceCapacityWarning?: { hasWarning: boolean; recommendedCapacity: number; requestedCount: number } | null;
  singleSecondSpace?: string;
  responsibleHistoryAlert: ResponsibleHistoryAlert;
  descargarCartaAlCrear: boolean;
  setDescargarCartaAlCrear: (val: boolean) => void;
  setShowCommitmentLetterModal: (show: boolean) => void;
  editingReservation?: Reservation | null;
  effectiveFormDataForLetter?: any;
  effectiveSeriesSlotsForLetter?: any;
  allReservations?: readonly Reservation[] | Reservation[];
}

export const ReservationStep3Applicant: React.FC<ReservationStep3ApplicantProps> = React.memo(({
  isWizardMode,
  wizardStep,
  formData,
  setFormData,
  handleResponsableChange,
  uniqueResponsablesList,
  autoFilledContactNotice,
  phoneValidation,
  rutValidation,
  emailValidation,
  primarySpaceCapacityWarning,
  secondSpaceCapacityWarning,
  singleSecondSpace = '',
  responsibleHistoryAlert,
  descargarCartaAlCrear,
  setDescargarCartaAlCrear,
  setShowCommitmentLetterModal,
  editingReservation,
  effectiveFormDataForLetter,
  effectiveSeriesSlotsForLetter,
  allReservations = []
}) => {
  if (isWizardMode && wizardStep !== 3) return null;

  return (
    <div id="reservation-step-3-container" className="space-y-4">
      <ReservationSectionHeader title="3. Solicitante y Participantes" description="Datos de la persona u organización solicitante y aforo esperado" icon={<User className="h-4 w-4" />} />

      <ApplicantContactSection
        formData={formData}
        setFormData={setFormData}
        handleResponsableChange={handleResponsableChange}
        uniqueResponsablesList={uniqueResponsablesList}
        hasAutoFilledContact={autoFilledContactNotice}
        phoneValidation={phoneValidation}
        rutValidation={rutValidation}
        emailValidation={emailValidation}
        primarySpaceCapacityWarning={primarySpaceCapacityWarning}
        secondSpaceCapacityWarning={secondSpaceCapacityWarning}
        singleSecondSpace={singleSecondSpace}
        descargarCartaAlCrear={descargarCartaAlCrear}
        setDescargarCartaAlCrear={setDescargarCartaAlCrear}
        setShowCommitmentLetterModal={setShowCommitmentLetterModal}
        editingReservation={editingReservation}
        effectiveFormDataForLetter={effectiveFormDataForLetter}
        effectiveSeriesSlotsForLetter={effectiveSeriesSlotsForLetter}
        allReservations={allReservations}
        responsibleHistoryAlert={responsibleHistoryAlert}
      />
    </div>
  );
});

ReservationStep3Applicant.displayName = 'ReservationStep3Applicant';
