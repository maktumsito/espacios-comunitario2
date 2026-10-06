import type { useReservationSaveHandler } from '../hooks/useReservationSaveHandler';
import type { Reservation } from '../types';
import { validateActivityDescription, validateTimeRange, validateRut, validateEmail, validatePhone } from '../utils/validationUtils';

export const conversionBase: Reservation = {id:'convert-normal',fecha:'2026-10-06',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino Test',descripcion:'Taller comunitario',tipoActividad:'Taller',actividadRecurrente:'No',estado:'activa',version:3};
export function conversionProps(onSave: Parameters<typeof useReservationSaveHandler>[0]['onSave']): Parameters<typeof useReservationSaveHandler>[0] {
  const noop=()=>{};
  return {
    formData:{...conversionBase},editingReservation:{...conversionBase},setFormData:noop,isSubmittingRef:{current:false},isSubmitting:false,setIsSubmitting:noop,
    isEditingExisting:true,canModifyReservation:true,currentUser:{username:'local',name:'Local',role:'Administrador',initials:'L',avatarColor:'blue',canCreateReservations:true,canEditReservations:true,canDeleteReservations:true},
    bookingMode:'pattern',setBookingMode:noop,specificDates:[],setSpecificDates:noop,dateSchedules:{},setDateSchedules:noop,useCustomSchedulesPerDate:false,setUseCustomSchedulesPerDate:noop,
    singleSecondSpace:'',setSingleSecondSpace:noop,singleSecondStartTime:'11:00',setSingleSecondStartTime:noop,singleSecondEndTime:'12:00',setSingleSecondEndTime:noop,enableSingleSecondSpace:false,isEditingSingleOccurrence:false,
    descriptionValidation:validateActivityDescription(conversionBase.descripcion),timeValidation:validateTimeRange('10:00','11:00'),singleSecondTimeValidation:{isValid:true},rutValidation:validateRut('',true),emailValidation:validateEmail('',true),phoneValidation:validatePhone('',true),loanScheduleCheck:{isOutsideRegularHours:false,requiresAuthorization:false},isExtensionAuthorized:false,
    specificHolidayAnalysis:{validDates:[],omittedHolidays:[]},includeHolidaysInSeries:false,isHolidayAuthorized:false,holidayOverrideKey:'',patternHolidayAnalysis:{validDates:['2026-10-06','2026-10-13','2026-10-20'],omittedHolidays:[]},generatedDates:['2026-10-06','2026-10-13','2026-10-20'],recurrenceStartDate:'2026-10-06',recurrenceEndDate:'2026-10-20',rawPatternDates:['2026-10-06','2026-10-13','2026-10-20'],singleDateHolidayInfo:null,selectedDays:[2],useCustomSchedulesPerDay:false,daySchedules:{},spaceBlocks:[],availableSpaces:[],allReservations:[conversionBase],excludeReservationIds:[conversionBase.id],allowConflictOverride:false,setAllowConflictOverride:noop,setShowConflictDialog:noop,generateFullSeries:false,isDuplicating:false,isEditingRecurring:false,updateScope:'single',affectedReservations:[conversionBase],rangeStartDate:'',rangeEndDate:'',descargarCartaAlCrear:false,onSave,clearDraft:noop,onClose:noop,showFormFeedback:noop,
  } as Parameters<typeof useReservationSaveHandler>[0];
}
