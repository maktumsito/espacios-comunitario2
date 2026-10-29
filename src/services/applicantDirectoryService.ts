import { Reservation, SpaceRating, ApplicantSummary } from '../types';
import { timeToMinutes } from '../utils/conflictDetector';

export type ApplicantActivityCategory = 'PRÉSTAMO' | 'ENSAYO' | 'CUMPLEAÑOS' | 'OTROS';

/**
 * Categorizes an activity into one of the allowed applicant types:
 * PRÉSTAMO, ENSAYO, CUMPLEAÑOS, or OTROS.
 * Returns null if the activity is institutional (TALLER CCD, TALLER MUNICIPAL, TALLER JJV, ACTIVIDAD MUNICIPAL, CHARLA).
 */
export function categorizeApplicantActivity(
  tipoActividad?: string,
  tipoPrestamo?: string,
  descripcion?: string
): ApplicantActivityCategory | null {
  const normalize = (val?: string) =>
    (val || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const act = normalize(tipoActividad);
  const prest = normalize(tipoPrestamo);

  // Strictly exclude municipal/institutional activities, workshops and lectures
  if (
    act.includes('taller') ||
    prest.includes('taller') ||
    act.includes('municipal') ||
    prest.includes('municipal') ||
    act.includes('charla') ||
    prest.includes('charla')
  ) {
    return null;
  }

  // 1. Cumpleaños
  if (act.includes('cumplean') || prest.includes('cumplean')) {
    return 'CUMPLEAÑOS';
  }

  // 2. Ensayos
  if (act.includes('ensayo') || prest.includes('ensayo')) {
    return 'ENSAYO';
  }

  // 3. Préstamos
  if (act.includes('prestamo') || prest.includes('prestamo')) {
    return 'PRÉSTAMO';
  }

  // 4. Otros
  if (act.includes('otro') || prest.includes('otro')) {
    return 'OTROS';
  }

  // Fallback on description keywords if tipoActividad was not explicitly set
  const desc = normalize(descripcion);
  if (desc.includes('cumplean')) return 'CUMPLEAÑOS';
  if (desc.includes('ensayo')) return 'ENSAYO';
  if (desc.includes('prestamo')) return 'PRÉSTAMO';
  if (desc.includes('otro')) return 'OTROS';

  return null;
}

/**
 * Evaluates whether a reservation belongs to the Applicant Registry.
 * Only loans, rehearsals, birthdays and others are permitted.
 */
export function isApplicantReservation(r: {
  tipoActividad?: string;
  tipoPrestamo?: string;
  descripcion?: string;
}): boolean {
  return categorizeApplicantActivity(r?.tipoActividad, r?.tipoPrestamo, r?.descripcion) !== null;
}

/**
 * Aggregates only applicant reservations (préstamos, ensayos, cumpleaños, otros)
 * and ratings into a consolidated applicant summary list.
 */
export function buildApplicantSummaries(
  reservations: readonly Reservation[],
  ratings: readonly SpaceRating[]
): ApplicantSummary[] {
  const map = new Map<string, {
    responsable: string;
    rut?: string;
    telefonoContacto?: string;
    emailContacto?: string;
    domicilio?: string;
    reservas: Reservation[];
  }>();

  // Index reservations: ONLY applicant activities (préstamos, ensayos, cumpleaños, otros)
  for (const r of reservations) {
    // Strictly filter by allowed applicant activity types
    if (!isApplicantReservation(r)) continue;

    const rawName = (r.responsable || '').trim();
    if (!rawName) continue;
    
    // Normalization key: preferential RUT or lowercase trimmed name
    const rutKey = r.rut ? r.rut.trim().toUpperCase().replace(/[^0-9K]/g, '') : '';
    const nameKey = rawName.toLowerCase();
    const key = rutKey ? `RUT_${rutKey}` : `NAME_${nameKey}`;

    let entry = map.get(key);
    if (!entry) {
      entry = {
        responsable: rawName,
        rut: r.rut,
        telefonoContacto: r.telefonoContacto,
        emailContacto: r.emailContacto,
        domicilio: r.domicilio,
        reservas: []
      };
      map.set(key, entry);
    } else {
      // Keep best contact info if missing
      if (!entry.rut && r.rut) entry.rut = r.rut;
      if (!entry.telefonoContacto && r.telefonoContacto) entry.telefonoContacto = r.telefonoContacto;
      if (!entry.emailContacto && r.emailContacto) entry.emailContacto = r.emailContacto;
      if (!entry.domicilio && r.domicilio) entry.domicilio = r.domicilio;
    }

    entry.reservas.push(r);
  }

  // Pre-calculate ratings map by normalized applicant name and reservationId for O(1) lookup
  const normalizeApplicantName = (name?: string) =>
    (name || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const ratingsByApplicant = new Map<string, SpaceRating[]>();
  const ratingsByReservationId = new Map<string, SpaceRating[]>();
  for (const rat of ratings) {
    if (rat.reservationId) {
      const byRes = ratingsByReservationId.get(rat.reservationId) || [];
      byRes.push(rat);
      ratingsByReservationId.set(rat.reservationId, byRes);
    }
    const ratName = normalizeApplicantName(rat.responsable);
    if (!ratName) continue;
    const existing = ratingsByApplicant.get(ratName) || [];
    existing.push(rat);
    ratingsByApplicant.set(ratName, existing);
  }

  const summaries: ApplicantSummary[] = [];

  for (const entry of map.values()) {
    const totalReservas = entry.reservas.length;
    let activas = 0;
    let cumplidas = 0;
    let canceladas = 0;
    let totalMinutes = 0;
    let cartasCount = 0;
    let latestDate = '';

    const spaceUsageMap = new Map<string, number>();
    const activityTypesSet = new Set<string>();
    const actCount = {
      prestamos: 0,
      ensayos: 0,
      cumpleanos: 0,
      otros: 0
    };

    for (const r of entry.reservas) {
      if (r.estado === 'cancelada') {
        canceladas++;
      } else if (r.realizada === 'Sí') {
        cumplidas++;
      } else {
        activas++;
      }

      if (r.cartaCompromisoAdjunta) {
        cartasCount++;
      }

      if (r.fecha && (!latestDate || r.fecha > latestDate)) {
        latestDate = r.fecha;
      }

      const sp = r.espacio || 'Desconocido';
      spaceUsageMap.set(sp, (spaceUsageMap.get(sp) || 0) + 1);

      // Track activity category
      const cat = categorizeApplicantActivity(r.tipoActividad, r.tipoPrestamo, r.descripcion);
      if (cat === 'PRÉSTAMO') {
        actCount.prestamos++;
        activityTypesSet.add('PRÉSTAMO');
      } else if (cat === 'ENSAYO') {
        actCount.ensayos++;
        activityTypesSet.add('ENSAYO');
      } else if (cat === 'CUMPLEAÑOS') {
        actCount.cumpleanos++;
        activityTypesSet.add('CUMPLEAÑOS');
      } else if (cat === 'OTROS') {
        actCount.otros++;
        activityTypesSet.add('OTROS');
      }

      const start = timeToMinutes(r.horaInicio || '00:00');
      const end = timeToMinutes(r.horaFin || '00:00');
      if (end > start) {
        totalMinutes += (end - start);
      }
    }

    // Match ratings in O(1) via pre-indexed reservation IDs and normalized applicant name
    const cleanName = normalizeApplicantName(entry.responsable);
    const matchedRatingsMap = new Map<string, SpaceRating>();
    for (const r of entry.reservas) {
      for (const rat of ratingsByReservationId.get(r.id) || []) {
        matchedRatingsMap.set(rat.id || `${rat.reservationId}_${rat.createdAt}`, rat);
      }
    }
    for (const rat of ratingsByApplicant.get(cleanName) || []) {
      matchedRatingsMap.set(rat.id || `${rat.reservationId}_${rat.createdAt}`, rat);
    }
    const applicantRatings = Array.from(matchedRatingsMap.values());

    let ratingSum = 0;
    let incidentesCount = 0;
    for (const rat of applicantRatings) {
      ratingSum += (rat.puntajeGeneral || 0);
      if (rat.huboDanos || rat.dejoBasura || rat.excedioHorario || (rat.puntajeGeneral && rat.puntajeGeneral <= 2)) {
        incidentesCount++;
      }
    }

    const espaciosSorted = Array.from(spaceUsageMap.entries())
      .map(([espacio, count]) => ({ espacio, count }))
      .sort((a, b) => b.count - a.count);

    summaries.push({
      responsable: entry.responsable,
      rut: entry.rut,
      telefonoContacto: entry.telefonoContacto,
      emailContacto: entry.emailContacto,
      domicilio: entry.domicilio,
      totalReservas,
      reservasActivas: activas,
      reservasCumplidas: cumplidas,
      reservasCanceladas: canceladas,
      totalHorasUsadas: Math.round((totalMinutes / 60) * 10) / 10,
      espaciosMasUsados: espaciosSorted.slice(0, 3),
      promedioCalificacion: applicantRatings.length > 0 ? ratingSum / applicantRatings.length : undefined,
      calificacionesCount: applicantRatings.length,
      incidentesCount,
      cartasAdjuntasCount: cartasCount,
      ultimaActividad: latestDate,
      tiposActividad: Array.from(activityTypesSet),
      actividadesCount: actCount
    });
  }

  // Default sort by most active
  return summaries.sort((a, b) => b.totalReservas - a.totalReservas);
}

