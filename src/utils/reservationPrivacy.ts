import type { AuthUser } from '../services/authService';
import type { Reservation } from '../types';
import { reservationPermission } from './userPermissions';

export function canReadReservationPersonalData(user?: AuthUser | null) {
  const role = user?.role?.trim().toLowerCase();
  if (role === 'administrador' || role === 'coordinador') return true;
  return ['recepción', 'recepcion', 'gestión', 'gestion'].includes(role || '') &&
    (reservationPermission(user, 'canCreateReservations') || reservationPermission(user, 'canEditReservations'));
}

const scheduleFields = [
  'id', 'fecha', 'fechaInicio', 'fechaFin', 'horaInicio', 'horaFin', 'espacio', 'tipoActividad',
  'tipoPrestamo', 'actividadRecurrente', 'estado', 'eliminada', 'terminaDiaSiguiente', 'importante',
  'serieRecurrente', 'recurrenteId', 'indiceEnSerie', 'totalEnSerie', 'tipoRecurrencia', 'diasSemana',
  'fechaInicioRecurrencia', 'fechaFinRecurrencia', 'cantidadParticipantes', 'cantidadTortas',
  'horarioExtendidoAutorizado', 'equipamientoSolicitado', 'version', 'realizada',
  'reemplazaReservaId', 'reemplazadaPorReservaId',
];
const ratingFields = ['id', 'reservationId', 'reservaId', 'fecha', 'espacio', 'tipoActividad',
  'esCumpleanos', 'puntajeGeneral', 'puntaje', 'limpieza', 'puntualidad', 'cuidadoInstalaciones',
  'comportamiento', 'huboDanos', 'dejoBasura', 'excedioHorario', 'minutosExceso', 'createdAt'];

export function isAgendaQueryField(collection: string, field: string) {
  return field === '__name__' || (collection === 'reservas' ? scheduleFields : ratingFields).includes(field);
}

export function projectAgendaRecord(collection: string, value: Record<string, unknown>) {
  const fields = collection === 'reservas' ? scheduleFields : ratingFields;
  const projected = Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  if (collection === 'reservas') {
    projected.descripcion = typeof value.tipoActividad === 'string' ? value.tipoActividad : 'Actividad';
    projected.responsable = 'Reservado';
    if (Array.isArray(value.equipamientoSolicitado)) {
      projected.equipamientoSolicitado = value.equipamientoSolicitado.map(item => ({
        equipmentId: item?.equipmentId, quantity: item?.quantity,
      }));
    }
  }
  return projected;
}

export function preserveReservationPersonalData(current: Reservation, proposed: Reservation): Reservation {
  const updated = { ...current };
  for (const key of scheduleFields) {
    if (Object.hasOwn(proposed, key))
      Object.assign(updated, { [key]: proposed[key as keyof Reservation] });
  }
  return updated;
}
