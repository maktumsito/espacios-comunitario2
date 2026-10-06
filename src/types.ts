export interface CommitmentLetterAttachment {
  name: string;
  type: string; // e.g. 'application/pdf', 'image/jpeg', 'image/png'
  size: number;
  dataUrl: string; // Base64 Data URL for scanned PDF or image
  uploadedAt: string; // ISO date string
  uploadedBy?: string;
  notes?: string;
}

export interface Reservation {
  id: string;
  reemplazaReservaId?: string;
  reemplazadaPorReservaId?: string;
  motivoReemplazo?: string;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:mm
  horaFin: string; // HH:mm
  espacio: string;
  responsable: string;
  telefonoContacto?: string;
  emailContacto?: string;
  tipoActividad: string;
  tipoPrestamo?: string;
  descripcion: string;
  actividadRecurrente: 'Sí' | 'No' | 'Múltiples' | string;
  comentarios?: string;
  editadoPor?: string;
  fechaEdicion?: string;
  serieRecurrente?: string;
  recurrenteId?: string;
  indiceEnSerie?: number;
  totalEnSerie?: number;
  tipoRecurrencia?: string;
  diasSemana?: string;
  fechaInicioRecurrencia?: string;
  fechaFinRecurrencia?: string;
  cantidadParticipantes?: number;
  realizada?: 'Sí' | 'No' | 'Pendiente' | string;
  rut?: string;
  domicilio?: string;
  informeSemanal?: string;
  googleEventId?: string;
  importante?: 'Sí' | 'No' | string;
  requiereCartaCompromiso?: boolean;
  descargarCartaAlCrear?: boolean;
  cartaCompromisoDescargada?: boolean;
  cartaCompromisoAdjunta?: CommitmentLetterAttachment;
  equipamientoSolicitado?: ReservationEquipmentRequest[];
  terminaDiaSiguiente?: boolean;
  horarioExtendidoAutorizado?: boolean;
  claveAutorizacion?: string;
  claveAutorizacionFeriado?: string;
  autorizadoPor?: string;
  actoAutorizaUso?: string;
  normativaUsoAplicable?: string;
  fundamentoGratuidad?: string;
  delegacionFacultades?: string;
  solicitudEliminacion?: DeletionRequest;
  estado?: 'activa' | 'cancelada' | 'rechazada' | 'eliminada' | string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  version?: number;
}

export type UpdateScope = 'single' | 'future' | 'series' | 'dateRange' | 'selected';

export interface BatchUpdateInfo {
  replacementOriginal?: Reservation;
  scope: UpdateScope;
  updatedReservations: Reservation[];
  affectedIds: string[];
  description?: string;
  sourceReservationId?: string;
  deletedIds?: string[];
  addedIds?: string[];
  expectedVersions?: Record<string,number>;
}

export interface DeletionRequest {
  solicitadoPor: string;
  solicitadoPorNombre?: string;
  solicitadoPorRol?: string;
  fechaSolicitud: string;
  motivo?: string;
  esSerie?: boolean;
  serieId?: string;
}

/**
 * Helper to identify single-day multi-space reservations (Hallazgo 3)
 * Differentiates multi-space bookings from true multi-date recurring series
 */
export function isSingleDayMultiSpaceReservation(reservation?: Partial<Reservation> | null): boolean {
  if (!reservation) return false;
  if (reservation.tipoRecurrencia === 'doble_espacio') return true;
  if (reservation.actividadRecurrente === 'Sí' || reservation.tipoRecurrencia === 'semanal' || reservation.tipoRecurrencia === 'especificas') return false;
  if (
    reservation.totalEnSerie === 2 &&
    (!reservation.fechaInicioRecurrencia ||
      !reservation.fechaFinRecurrencia ||
      reservation.fechaInicioRecurrencia === reservation.fechaFinRecurrencia)
  ) {
    return true;
  }
  return false;
}

export interface EquipmentItem {
  id: string;
  name: string;
  category: 'Audiovisual' | 'Audio' | 'Mobiliario' | 'Informática' | 'Climatización' | 'Deportes' | 'Otros' | string;
  totalQuantity: number;
  iconName?: string;
  description?: string;
  isCustom?: boolean;
}

export interface ReservationEquipmentRequest {
  equipmentId: string;
  equipmentName: string;
  quantity: number;
  notes?: string;
}

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'DELETE_SERIES'
  | 'RESTORE'
  | 'CLEAR_PARTICIPANTS'
  | 'TOGGLE_REALIZADA'
  | 'BULK_IMPORT'
  | 'DELETE_ALL_HOLIDAYS'
  | 'REQUEST_DELETE'
  | 'AUTHORIZE_DELETE'
  | 'REJECT_DELETE_REQUEST'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED';

export interface AuditFieldDiff {
  field: string;
  label: string;
  oldValue: any;
  newValue: any;
}

export interface AuditChangeLogEntry {
  id: string;
  timestamp: string; // ISO string
  user: string; // Username / author name
  userRole?: string;
  action: AuditActionType;
  description: string;
  reservaId: string;
  reservaTitle?: string;
  reservaFecha?: string;
  reservaEspacio?: string;
  reservaHorario?: string;
  reservaResponsable?: string;
  diffs?: AuditFieldDiff[];
  // Snapshot states for exact restoration
  previousState?: Reservation | Reservation[];
  newState?: Reservation | Reservation[];
  isReverted?: boolean;
  revertedAt?: string;
  revertedBy?: string;
}

export interface SpaceInfo {
  id: string;
  name: string;
  capacity?: number;
  category: 'Deportes' | 'Salas de Clases' | 'Eventos' | 'Especiales' | 'Exterior' | string;
  iconName: string;
  color: string;
  description: string;
  isCustom?: boolean;
}

export interface LoanType {
  id: string;
  name: string;
  category?: string;
  description?: string;
  color?: string;
  defaultDurationMinutes?: number;
  isCustom?: boolean;
}

export interface ActivityTypeItem {
  id: string;
  name: string;
  category: string;
  color: string;
  description?: string;
  isCustom?: boolean;
}

export interface SpaceRating {
  id: string;
  reservationId: string;
  fecha: string; // Fecha de la actividad YYYY-MM-DD
  espacio: string;
  tipoActividad: string;
  responsable: string;
  telefonoContacto?: string;
  emailContacto?: string;
  esCumpleanos: boolean;
  auxiliarName: string; // Nombre del auxiliar que califica
  
  // Calificaciones detalladas (1 a 5 estrellas)
  puntajeGeneral: number; // 1-5
  limpieza: number; // 1-5 (¿Dejaron el espacio limpio y ordenado?)
  puntualidad: number; // 1-5 (¿Respetaron la hora de término?)
  cuidadoInstalaciones: number; // 1-5 (¿Cuidaron mobiliario, baños, enchufes, etc.?)
  comportamiento: number; // 1-5 (¿Hubo respeto, ruidos moderados, cumplimiento de normas?)
  
  // Aspectos específicos de incidentes
  huboDanos: boolean;
  detalleDanos?: string;
  dejoBasura: boolean;
  excedioHorario: boolean;
  minutosExceso?: number;
  
  observaciones: string;
  createdAt: string; // ISO
  createdBy?: string;
}

export type ViewMode = 'mobile' | 'calendar' | 'daily' | 'timeline' | 'spaces' | 'analytics' | 'conflicts' | 'ratings' | 'directory' | 'maintenance' | 'admin';

export interface SpaceBlock {
  id: string;
  espacio: string;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  horaInicio?: string; // HH:mm (default '08:00' if todoElDia is true)
  horaFin?: string; // HH:mm (default '22:30' if todoElDia is true)
  todoElDia: boolean;
  motivo: 'Mantención' | 'Pintura' | 'Reparaciones' | 'Aseo Profundo' | 'Obras' | 'Evento Institucional' | 'Otro' | string;
  descripcion: string;
  responsableMantenimiento?: string;
  contactoEmpresa?: string;
  bloquearSubEspacios?: boolean;
  activo: boolean;
  createdAt: string; // ISO
  createdBy?: string;
  // Recurrence support
  esRecurrente?: boolean;
  diasSemana?: number[];
  fechaFinRecurrencia?: string;
  serieBloqueoId?: string;
}

export interface ApplicantSummary {
  responsable: string;
  rut?: string;
  telefonoContacto?: string;
  emailContacto?: string;
  domicilio?: string;
  totalReservas: number;
  reservasActivas: number;
  reservasCumplidas: number;
  reservasCanceladas: number;
  totalHorasUsadas: number;
  espaciosMasUsados: { espacio: string; count: number }[];
  promedioCalificacion?: number;
  calificacionesCount: number;
  incidentesCount: number;
  cartasAdjuntasCount: number;
  ultimaActividad?: string; // YYYY-MM-DD
  tiposActividad?: string[];
  actividadesCount?: {
    prestamos: number;
    ensayos: number;
    cumpleanos: number;
    otros: number;
  };
}

export interface FilterState {
  search: string;
  espacio: string;
  tipoActividad: string;
  fechaDesde: string;
  fechaHasta: string;
  soloRecurrentes: boolean;
  soloImportantes: boolean;
  soloConTopamiento?: boolean;
}

export interface BookingConflict {
  reservaA: Reservation;
  reservaB: Reservation;
  espacio: string;
  fecha: string;
  solapamiento: string;
}

export interface CustomScheduleSlot {
  horaInicio: string;
  horaFin: string;
  espacio?: string;
  hasSecondSlot?: boolean;
  secondHoraInicio?: string;
  secondHoraFin?: string;
  secondEspacio?: string;
}

export interface ConflictSavePayload {
  bookingMode?: 'single' | 'specific' | 'pattern';
  specificDates?: string[];
  dateSchedules?: Record<string, CustomScheduleSlot>;
  useCustomSchedulesPerDate?: boolean;
  formDataUpdates?: Partial<Reservation>;
  secondSpaceUpdates?: {
    space?: string;
    startTime?: string;
    endTime?: string;
  };
}
