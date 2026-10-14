import type { Reservation, ReservationEquipmentRequest } from '../types';
import { normalizeSpaceName } from '../data/spacesData';
import { formatMinutesToTime, getConstituentSpaces, timeToMinutes } from './conflictDetector';

/** Shared by the preview and the write so every selected reservation is included. */
export function buildMergedReservation(target: Reservation, sources: readonly Reservation[]): Reservation {
  const reservations = [target, ...sources];
  const start = Math.min(...reservations.map(r => timeToMinutes(r.horaInicio)));
  const end = Math.max(...reservations.map(r => {
    const startMin = timeToMinutes(r.horaInicio);
    const endMin = timeToMinutes(r.horaFin);
    if (r.terminaDiaSiguiente || (endMin <= startMin && endMin > 0)) return endMin + 1440;
    return endMin === 0 && startMin > 0 ? 1440 : endMin;
  }));
  const sameSpace = reservations.every(r => normalizeSpaceName(r.espacio) === normalizeSpaceName(target.espacio));
  const spaces = [...new Set(reservations.flatMap(r => getConstituentSpaces(r.espacio)))];
  const equipment = new Map<string, ReservationEquipmentRequest>();
  let description = (target.descripcion || '').trim();
  let comments = (target.comentarios || '').trim();

  for (const source of sources) {
    const sourceDescription = (source.descripcion || '').trim();
    if (sourceDescription && !description.includes(sourceDescription)) {
      description = description ? `${description}\n[Unida con ${source.tipoActividad}]: ${sourceDescription}` : sourceDescription;
    }
    const sourceComments = (source.comentarios || '').trim();
    if (sourceComments && !comments.includes(sourceComments)) {
      comments = comments ? `${comments} | ${sourceComments}` : sourceComments;
    }
  }
  for (const reservation of reservations) {
    for (const request of reservation.equipamientoSolicitado || []) {
      const key = request.equipmentId || request.equipmentName;
      const existing = equipment.get(key);
      equipment.set(key, existing ? {
        ...existing,
        quantity: Math.max(existing.quantity, request.quantity),
        notes: [existing.notes, request.notes].filter(Boolean).join(' | '),
      } : { ...request });
    }
  }
  const firstValue = (field: 'tipoActividad' | 'responsable' | 'rut' | 'telefonoContacto' | 'emailContacto' | 'domicilio') =>
    reservations.find(r => r[field])?.[field] || '';

  return {
    ...target,
    horaInicio: formatMinutesToTime(start),
    horaFin: end > 1440 ? formatMinutesToTime(end % 1440) : end === 1440 ? '23:59' : formatMinutesToTime(end),
    terminaDiaSiguiente: end > 1440,
    espacio: sameSpace ? target.espacio : spaces.join(' / '),
    tipoActividad: firstValue('tipoActividad'),
    descripcion: description,
    comentarios: comments,
    responsable: firstValue('responsable'),
    rut: firstValue('rut'),
    telefonoContacto: firstValue('telefonoContacto'),
    emailContacto: firstValue('emailContacto'),
    domicilio: firstValue('domicilio'),
    cantidadParticipantes: Math.max(...reservations.map(r => Number(r.cantidadParticipantes) || 0)) || 10,
    equipamientoSolicitado: [...equipment.values()],
    importante: reservations.some(r => r.importante === 'Sí') ? 'Sí' : 'No',
    requiereCartaCompromiso: reservations.some(r => r.requiereCartaCompromiso),
    estado: 'activa',
  };
}
