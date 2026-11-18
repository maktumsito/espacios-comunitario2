import type { Reservation } from '../types';

const BIRTHDAY_KEYWORDS_REGEX = /(cumple|cumplea[nñ]os?|bday|fiesta infantil)/i;

/**
 * Rule: Exclude Municipal Activities and any loan mentioning 'CAM'
 * (e.g. Centro de Atención Municipal, actividades municipales) from birthday evaluations.
 */
export function isCamOrMunicipalActivity(r: Reservation): boolean {
  if (!r) return false;
  const desc = r.descripcion || '';
  const resp = r.responsable || '';
  const act = r.tipoActividad || '';
  const prest = r.tipoPrestamo || '';
  const comentarios = r.comentarios || '';

  // Exclude Municipal activities
  if (
    act.toUpperCase().includes('MUNICIPAL') ||
    prest.toUpperCase().includes('MUNICIPAL') ||
    desc.toUpperCase().includes('ACTIVIDAD MUNICIPAL') ||
    desc.toUpperCase().includes('ACTIVIDADES MUNICIPALES')
  ) {
    return true;
  }

  // Exclude CAM (case-insensitive word boundary or standalone acronym)
  const camRegex = /\bCAM\b/i;
  if (
    camRegex.test(desc) ||
    camRegex.test(resp) ||
    camRegex.test(act) ||
    camRegex.test(prest) ||
    camRegex.test(comentarios)
  ) {
    return true;
  }

  return false;
}

/**
 * Determines whether a reservation matches Birthday Loan criteria using optimized regex matching.
 * Excludes municipal activities and CAM loans.
 */
export function isBirthdayReservation(r: Reservation): boolean {
  if (!r) return false;
  if (isCamOrMunicipalActivity(r)) return false;

  const combinedText = `${r.descripcion || ''} ${r.tipoActividad || ''} ${r.tipoPrestamo || ''} ${r.comentarios || ''}`;
  return BIRTHDAY_KEYWORDS_REGEX.test(combinedText);
}

/**
 * Single source of truth: Only Birthday Loans are eligible for rating.
 * Excludes CAM loans and Municipal activities per business rules.
 */
export function isEligibleForRating(r: Reservation): boolean {
  if (isCamOrMunicipalActivity(r)) return false;
  return isBirthdayReservation(r);
}
