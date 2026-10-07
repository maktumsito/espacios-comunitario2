import type { Reservation, SpaceRating } from '../src/types';

export function reservationEndDate(reservation: Pick<Reservation, 'fecha' | 'terminaDiaSiguiente'>): string {
  if (!reservation.terminaDiaSiguiente) return reservation.fecha;
  const [year, month, day] = reservation.fecha.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/** Keep the frontend schema, while deriving reservation identity/details from the official row. */
export function buildConfirmedRating(input: Partial<SpaceRating> & Record<string, unknown>,
  reservation: Reservation, id: string, actor: string, now: string): SpaceRating & { reservaId: string; puntaje: number } {
  const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const stars = (value: unknown) => {
    const score = Number(value);
    return Number.isFinite(score) ? Math.max(1, Math.min(5, score)) : 5;
  };
  const score = stars(input.puntajeGeneral ?? input.puntaje);
  return {
    id, reservationId: reservation.id, reservaId: reservation.id,
    fecha: reservation.fecha, espacio: reservation.espacio, responsable: reservation.responsable,
    tipoActividad: reservation.tipoActividad, telefonoContacto: text(input.telefonoContacto, 50),
    emailContacto: text(input.emailContacto, 200), esCumpleanos: input.esCumpleanos === true,
    auxiliarName: text(input.auxiliarName, 200) || actor,
    puntajeGeneral: score, puntaje: score,
    limpieza: stars(input.limpieza), puntualidad: stars(input.puntualidad),
    cuidadoInstalaciones: stars(input.cuidadoInstalaciones), comportamiento: stars(input.comportamiento),
    huboDanos: input.huboDanos === true, detalleDanos: text(input.detalleDanos, 2000),
    dejoBasura: input.dejoBasura === true, excedioHorario: input.excedioHorario === true,
    minutosExceso: Math.max(0, Math.min(1440, Number(input.minutosExceso) || 0)),
    observaciones: text(input.observaciones, 2000), createdAt: now, createdBy: actor,
  };
}
