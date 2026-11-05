import React from 'react';
import { User } from 'lucide-react';
import { Reservation } from '../types';
import { ResponsibleHistoryAlert } from '../services/ratingService';
import { ApplicantContactSection } from './ApplicantContactSection';

interface ReservationStep2ApplicantProps {
  isWizardMode: boolean;
  wizardStep: 1 | 2 | 3;
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

export const ReservationStep2Applicant: React.FC<ReservationStep2ApplicantProps> = React.memo(({
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
  if (isWizardMode && wizardStep !== 2) return null;

  return (
    <div id="reservation-step-2-container" className="space-y-4">
      <div className="flex items-center space-x-2 pb-1 border-b border-slate-100">
        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black flex items-center justify-center">
          2
        </span>
        <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
          <User className="w-3.5 h-3.5 text-blue-600" />
          <span>Datos del Solicitante y Contacto</span>
        </h4>
      </div>

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
        responsibleHistoryAlert={responsibleHistoryAlert}
        descargarCartaAlCrear={descargarCartaAlCrear}
        setDescargarCartaAlCrear={setDescargarCartaAlCrear}
        setShowCommitmentLetterModal={setShowCommitmentLetterModal}
        editingReservation={editingReservation}
        effectiveFormDataForLetter={effectiveFormDataForLetter}
        effectiveSeriesSlotsForLetter={effectiveSeriesSlotsForLetter}
        allReservations={allReservations}
      />
    </div>
  );
});

ReservationStep2Applicant.displayName = 'ReservationStep2Applicant';
