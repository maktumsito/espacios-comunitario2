import type { jsPDF } from 'jspdf';
import { loadPdfLibraries } from './loadPdfLibraries';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Reservation } from '../types';
import { formatDateDDMMYYYY, getDayOfWeekFromDateString } from './dateUtils';
import { getRecommendedSpaceCapacity } from './validationUtils';

export interface CommitmentScheduleSlot {
  fecha: string;
  horaInicio: string;
  horaFin: string;
  espacio: string;
}

export interface CommitmentLetterOptions {
  seriesScheduleItems?: CommitmentScheduleSlot[];
  allReservations?: Reservation[];
  isDraft?: boolean;
}

/**
 * Safely formats a 'YYYY-MM-DD' or date string to full Spanish date with weekday
 * (e.g., 'VIERNES 4 DE SEPTIEMBRE DE 2026') without timezone drift.
 */
export function formatFechaConDiaEsp(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.split('T')[0].trim();
  const parts = clean.split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const date = new Date(y, m, d, 12, 0, 0);
      return format(date, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    }
  }
  try {
    return format(parseISO(clean), "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
  } catch {
    return formatDateDDMMYYYY(dateStr);
  }
}

/**
 * Determines if a reservation activity or loan type requires / activates the Carta de Compromiso by default.
 * Eligible types: únicamente PRÉSTAMO o CUMPLEAÑOS.
 */
export function isCommitmentLetterEligible(tipoActividad?: string, tipoPrestamo?: string): boolean {
  const normalize = (val?: string) =>
    (val || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const combined = `${normalize(tipoActividad)} ${normalize(tipoPrestamo)}`;
  if (!combined.trim()) return false;

  const allowedKeywords = ['prestamo', 'cumplean'];
  return allowedKeywords.some((keyword) => combined.includes(keyword));
}

/**
 * Determines if the Carta de Compromiso is active for a reservation,
 * either by default (préstamo o cumpleaños) or explicitly activated via 1-click (requiereCartaCompromiso = true).
 */
export function isCommitmentLetterActive(
  reserva?: { tipoActividad?: string; tipoPrestamo?: string; requiereCartaCompromiso?: boolean } | null
): boolean {
  if (!reserva) return false;
  if (reserva.requiereCartaCompromiso) return true;
  return isCommitmentLetterEligible(reserva.tipoActividad, reserva.tipoPrestamo);
}

export function formatCommitmentFolio(id?: string, dateStr?: string): string {
  const year = dateStr ? dateStr.substring(0, 4) : format(new Date(), 'yyyy');
  const rawId = id || 'NUEVO';
  const clean = rawId.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();
  return `CC-${year}-${clean || '001'}`;
}

export function extractScheduleSlots(
  reservation: Partial<Reservation>,
  options?: CommitmentLetterOptions
): CommitmentScheduleSlot[] {
  if (options?.seriesScheduleItems && options.seriesScheduleItems.length > 0) {
    return [...options.seriesScheduleItems].sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
      return (a.horaInicio || '').localeCompare(b.horaInicio || '');
    });
  }

  // 1. Match by serieRecurrente / recurrenteId across all reservations
  const sId = reservation.serieRecurrente || reservation.recurrenteId;
  if (sId && options?.allReservations && options.allReservations.length > 0) {
    const matches = options.allReservations.filter(
      (r) => r.serieRecurrente === sId || r.recurrenteId === sId
    );
    if (matches.length > 0) {
      return matches
        .map((r) => ({
          fecha: r.fecha,
          horaInicio: r.horaInicio || '10:00',
          horaFin: r.horaFin || '12:00',
          espacio: r.espacio || 'ESPACIO'
        }))
        .sort((a, b) => {
          if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
          return (a.horaInicio || '').localeCompare(b.horaInicio || '');
        });
    }
  }

  // 2. Sibling lookup for single-day multi-space reservations in allReservations
  if (options?.allReservations && options.allReservations.length > 0 && reservation.fecha) {
    const respLower = (reservation.responsable || '').trim().toLowerCase();
    const isMultiSpaceCandidate =
      reservation.tipoRecurrencia === 'doble_espacio' ||
      reservation.totalEnSerie === 2 ||
      (typeof reservation.espacio === 'string' && (reservation.espacio.includes('/') || reservation.espacio.includes(',')));

    if (isMultiSpaceCandidate && respLower) {
      const siblingMatches = options.allReservations.filter((r) => {
        if (r.fecha !== reservation.fecha) return false;
        const rResp = (r.responsable || '').trim().toLowerCase();
        if (rResp !== respLower) return false;
        return (
          r.id === reservation.id ||
          r.tipoRecurrencia === 'doble_espacio' ||
          r.totalEnSerie === 2 ||
          (r.createdAt && reservation.createdAt && Math.abs(new Date(r.createdAt).getTime() - new Date(reservation.createdAt).getTime()) < 60000)
        );
      });

      if (siblingMatches.length > 1) {
        return siblingMatches
          .map((r) => ({
            fecha: r.fecha,
            horaInicio: r.horaInicio || '10:00',
            horaFin: r.horaFin || '12:00',
            espacio: r.espacio || 'ESPACIO'
          }))
          .sort((a, b) => {
            if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
            return (a.horaInicio || '').localeCompare(b.horaInicio || '');
          });
      }
    }
  }

  // 3. Direct second space fields on the reservation object
  const anyRes = reservation as any;
  const rawSecondSpace = anyRes?.secondEspacio || anyRes?.segundoEspacio;
  if (rawSecondSpace && typeof rawSecondSpace === 'string' && rawSecondSpace.trim()) {
    const secEsp = rawSecondSpace.trim();
    const baseEsp = (reservation.espacio || 'ESPACIO').split(/[/,]/)[0].trim();
    const s1Start = reservation.horaInicio || '10:00';
    const s1End = reservation.horaFin || '12:00';
    const s2Start = anyRes?.secondHoraInicio || anyRes?.segundoHoraInicio || reservation.horaFin || '11:00';
    const s2End = anyRes?.secondHoraFin || anyRes?.segundoHoraFin || '12:00';
    const dateStr = reservation.fecha || format(new Date(), 'yyyy-MM-dd');
    return [
      {
        fecha: dateStr,
        horaInicio: s1Start,
        horaFin: s1End,
        espacio: baseEsp
      },
      {
        fecha: dateStr,
        horaInicio: s2Start,
        horaFin: s2End,
        espacio: secEsp
      }
    ];
  }

  // 4. Combined space string like "SALA 1 / SALA 2"
  if (reservation.espacio && (reservation.espacio.includes('/') || reservation.espacio.includes(','))) {
    const parts = reservation.espacio.split(/[/,]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const dateStr = reservation.fecha || format(new Date(), 'yyyy-MM-dd');
      return parts.map((p) => ({
        fecha: dateStr,
        horaInicio: reservation.horaInicio || '10:00',
        horaFin: reservation.horaFin || '12:00',
        espacio: p
      }));
    }
  }

  // Fallback to single slot
  return [
    {
      fecha: reservation.fecha || format(new Date(), 'yyyy-MM-dd'),
      horaInicio: reservation.horaInicio || '10:00',
      horaFin: reservation.horaFin || '12:00',
      espacio: reservation.espacio || 'ESPACIO'
    }
  ];
}

export interface CommitmentDateRangeSummary {
  isMultiSlot: boolean;
  startDate: string;
  endDate: string;
  formattedStart: string;
  formattedEnd: string;
  formattedRange: string;
  formattedDateWithDay: string;
  totalSessions: number;
  daysAndHoursText: string;
  uniqueSpacesText: string;
  daySummaries: {
    dayName: string;
    dayNum: number;
    horaInicio: string;
    horaFin: string;
    espacio: string;
    count: number;
  }[];
  slots: CommitmentScheduleSlot[];
}

export function computeCommitmentDateRangeAndDays(
  slots: CommitmentScheduleSlot[],
  reservation: Partial<Reservation>
): CommitmentDateRangeSummary {
  const effectiveSlots = slots.length > 0 ? slots : extractScheduleSlots(reservation);
  const sortedSlots = [...effectiveSlots].sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
    return (a.horaInicio || '').localeCompare(b.horaInicio || '');
  });

  const startDate = sortedSlots[0]?.fecha || reservation.fecha || format(new Date(), 'yyyy-MM-dd');
  const endDate = sortedSlots[sortedSlots.length - 1]?.fecha || startDate;
  const isMultiSlot = sortedSlots.length > 1;
  const isSameDay = startDate === endDate;

  const formattedStart = formatDateDDMMYYYY(startDate);
  const formattedEnd = formatDateDDMMYYYY(endDate);

  const formattedRange = !isSameDay && isMultiSlot
    ? `Desde el ${formattedStart} hasta el ${formattedEnd}`
    : `Fecha: ${formattedStart}`;

  const formattedDateWithDay = formatFechaConDiaEsp(startDate);

  // Group by day of week, preserving all distinct schedule segments per day
  const dayMap = new Map<number, { dayName: string; dayNum: number; slots: CommitmentScheduleSlot[] }>();
  const spacesSet = new Set<string>();

  sortedSlots.forEach((slot) => {
    const dayNum = getDayOfWeekFromDateString(slot.fecha);
    let dayName = '';
    const cleanSlotDate = (slot.fecha || '').split('T')[0];
    const parts = cleanSlotDate.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        dayName = format(new Date(y, m, d, 12, 0, 0), 'EEEE', { locale: es });
      }
    }
    if (!dayName) {
      dayName = `Día ${dayNum}`;
    }

    if (slot.espacio) {
      const partsEsp = slot.espacio.split(/[/,]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      partsEsp.forEach((p) => spacesSet.add(p));
    }

    if (!dayMap.has(dayNum)) {
      dayMap.set(dayNum, {
        dayName,
        dayNum,
        slots: [slot]
      });
    } else {
      const entry = dayMap.get(dayNum)!;
      entry.slots.push(slot);
    }
  });

  // Also harvest any combined spaces in reservation.espacio
  if (reservation.espacio) {
    const partsEsp = reservation.espacio.split(/[/,]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    partsEsp.forEach((p) => spacesSet.add(p));
  }

  const sortedDayEntries = Array.from(dayMap.values()).sort((a, b) => a.dayNum - b.dayNum);

  let daysAndHoursText = '';
  if (isSameDay && sortedSlots.length > 1) {
    // Single day with multiple slots / spaces
    const allSameHours = sortedSlots.every(
      (s) => s.horaInicio === sortedSlots[0].horaInicio && s.horaFin === sortedSlots[0].horaFin
    );
    if (allSameHours) {
      daysAndHoursText = `${sortedSlots[0].horaInicio} a ${sortedSlots[0].horaFin} hrs.`;
    } else {
      daysAndHoursText = sortedSlots
        .map((s) => `${s.horaInicio} a ${s.horaFin} hrs. (${s.espacio})`)
        .join(' / ');
    }
  } else if (sortedDayEntries.length > 0) {
    daysAndHoursText = sortedDayEntries
      .map((d) => {
        const uniqueTimesInDay = d.slots.filter(
          (s, idx, arr) =>
            arr.findIndex(
              (x) => x.horaInicio === s.horaInicio && x.horaFin === s.horaFin && x.espacio === s.espacio
            ) === idx
        );
        const allSameInDay = uniqueTimesInDay.every(
          (s) => s.horaInicio === uniqueTimesInDay[0].horaInicio && s.horaFin === uniqueTimesInDay[0].horaFin
        );
        if (allSameInDay && uniqueTimesInDay.length > 0) {
          return `${d.dayName} (${uniqueTimesInDay[0].horaInicio} a ${uniqueTimesInDay[0].horaFin} hrs.)`;
        }
        const timesStr = uniqueTimesInDay
          .map((s) => `${s.horaInicio} a ${s.horaFin} hrs. (${s.espacio})`)
          .join(' / ');
        return `${d.dayName} (${timesStr})`;
      })
      .join(', ');
  }

  const uniqueSpacesText =
    Array.from(spacesSet).join(' / ') || (reservation.espacio || 'ESPACIO').toUpperCase();

  const daySummaries = sortedDayEntries.map((d) => ({
    dayName: d.dayName,
    dayNum: d.dayNum,
    horaInicio: d.slots[0]?.horaInicio || '10:00',
    horaFin: d.slots[0]?.horaFin || '12:00',
    espacio: d.slots.map((s) => s.espacio).join(' / '),
    count: d.slots.length
  }));

  return {
    isMultiSlot,
    startDate,
    endDate,
    formattedStart,
    formattedEnd,
    formattedRange,
    formattedDateWithDay,
    totalSessions: sortedSlots.length,
    daysAndHoursText: daysAndHoursText || `${reservation.horaInicio || '14:00'} a ${reservation.horaFin || '22:00'} hrs.`,
    uniqueSpacesText,
    daySummaries,
    slots: sortedSlots
  };
}

export interface CommitmentPoint2Details {
  fechaDiaStr: string;
  horarioStr: string;
  espacioStr: string;
  modalidadStr: string;
  aforoStr: string;
  propositoStr: string;
}

/**
 * Computes all 6 fields of Section 2 ('DETALLES DEL ESPACIO Y HORARIO AUTORIZADO')
 * fully populated and styled from the reservation data entered by the user.
 */
export function computeCommitmentPoint2Details(
  reservation: Partial<Reservation>,
  rangeInfo: CommitmentDateRangeSummary
): CommitmentPoint2Details {
  const isMultiSlot = rangeInfo.isMultiSlot;
  const isSameDay = rangeInfo.startDate === rangeInfo.endDate;

  // 1. FECHA Y DÍA
  let fechaDiaStr = '';
  if (isMultiSlot && !isSameDay) {
    const sessionsLabel = `${rangeInfo.totalSessions} ${rangeInfo.totalSessions === 1 ? 'SESIÓN' : 'SESIONES'}`;
    fechaDiaStr = `${rangeInfo.formattedRange.toUpperCase()} (${sessionsLabel})`;
  } else {
    const singleDateFormatted = formatFechaConDiaEsp(reservation.fecha || rangeInfo.startDate);
    fechaDiaStr = singleDateFormatted ? singleDateFormatted.toUpperCase() : rangeInfo.formattedStart.toUpperCase();
  }

  // 2. HORARIO AUTORIZADO
  let horarioStr = '';
  if (rangeInfo.daysAndHoursText) {
    horarioStr = rangeInfo.daysAndHoursText.toUpperCase();
  } else {
    const hInicio = (reservation.horaInicio || '14:00').trim();
    const hFin = (reservation.horaFin || '22:00').trim();
    horarioStr = `${hInicio} A ${hFin} HRS.`;
  }

  // 3. ESPACIO ASIGNADO
  let espacioStr = '';
  if (rangeInfo.uniqueSpacesText) {
    espacioStr = rangeInfo.uniqueSpacesText.trim().toUpperCase();
  } else {
    espacioStr = (reservation.espacio || 'SALA 3').trim().toUpperCase();
  }

  // 4. MODALIDAD / TIPO
  let modalidadStr = '';
  const tipoPrestamoRaw = (reservation.tipoPrestamo || '').trim().toUpperCase();
  const periodicidad = isMultiSlot && !isSameDay ? 'REGULAR / PERIÓDICA' : 'PUNTUAL';
  if (tipoPrestamoRaw) {
    if (
      tipoPrestamoRaw.includes('PUNTUAL') ||
      tipoPrestamoRaw.includes('REGULAR') ||
      tipoPrestamoRaw.includes('PERIÓDICA') ||
      tipoPrestamoRaw.includes('PERIODICA')
    ) {
      modalidadStr = tipoPrestamoRaw;
    } else {
      modalidadStr = `${tipoPrestamoRaw} (${periodicidad})`;
    }
  } else {
    modalidadStr = periodicidad;
  }

  // 5. AFORO ESTIMADO
  let aforoStr = '';
  if (typeof reservation.cantidadParticipantes === 'number' && reservation.cantidadParticipantes > 0) {
    aforoStr = reservation.cantidadParticipantes === 1
      ? '1 PERSONA'
      : `${reservation.cantidadParticipantes} PERSONAS`;
  } else if (reservation.espacio) {
    const recCap = getRecommendedSpaceCapacity(reservation.espacio);
    aforoStr = recCap ? `SEGÚN CAPACIDAD DEL ESPACIO (${recCap} PERSONAS MÁX)` : 'SEGÚN CAPACIDAD DEL ESPACIO';
  } else {
    aforoStr = 'SEGÚN CAPACIDAD';
  }

  // 6. PROPÓSITO / EVENTO
  let propositoStr = '';
  const desc = (reservation.descripcion || '').trim();
  const tipoAct = (reservation.tipoActividad || '').trim();
  if (desc && tipoAct) {
    if (desc.toLowerCase().includes(tipoAct.toLowerCase())) {
      propositoStr = desc.toUpperCase();
    } else {
      propositoStr = `${tipoAct.toUpperCase()} — ${desc.toUpperCase()}`;
    }
  } else if (desc) {
    propositoStr = desc.toUpperCase();
  } else if (tipoAct) {
    propositoStr = tipoAct.toUpperCase();
  } else {
    propositoStr = 'USO AUTORIZADO DE ESPACIO';
  }

  return {
    fechaDiaStr,
    horarioStr,
    espacioStr,
    modalidadStr,
    aforoStr,
    propositoStr
  };
}

export async function generateCommitmentLetterPdfDoc(
  reservation: Partial<Reservation>,
  options?: CommitmentLetterOptions
): Promise<jsPDF> {
  const { jsPDF, autoTable } = await loadPdfLibraries();
  // 8.5 x 13 inches = 215.9 mm x 330.2 mm (Tamaño Oficio / Folio tradicional chileno)
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [215.9, 330.2]
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 11;
  const contentWidth = pageWidth - margin * 2;

  const folioNumber = formatCommitmentFolio(reservation.id, reservation.fecha);
  const slots = extractScheduleSlots(reservation, options);
  const rangeInfo = computeCommitmentDateRangeAndDays(slots, reservation);
  const point2 = computeCommitmentPoint2Details(reservation, rangeInfo);

  // Format data from reservation to complete the template blanks
  const resp = (reservation.responsable || '').trim().toUpperCase();
  const rutStr = (reservation.rut || '').trim().toUpperCase();
  const tel = (reservation.telefonoContacto || '').trim().toUpperCase();
  const emailStr = (reservation.emailContacto || '').trim().toUpperCase();
  const dom = (reservation.domicilio || '').trim().toUpperCase();
  const tipoAct = (reservation.tipoActividad || 'PRÉSTAMO DE ESPACIO').trim().toUpperCase();

  const fechaDiaStr = point2.fechaDiaStr;
  const horarioStr = point2.horarioStr;
  const esp = point2.espacioStr;
  const modalidadStr = point2.modalidadStr;
  const aforoStr = point2.aforoStr;
  const propositoStr = point2.propositoStr;

  // Color constants matching the official template
  const navyHeaderBg = [24, 43, 73]; // #182b49 navy blue
  const navyBorder = [185, 200, 220];

  // Helper for drawing blue section banner
  const drawBanner = (title: string, currentY: number) => {
    doc.setFillColor(navyHeaderBg[0], navyHeaderBg[1], navyHeaderBg[2]);
    doc.rect(margin, currentY, contentWidth, 5.2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.9);
    doc.text(title, margin + 2.5, currentY + 3.7);
    return currentY + 5.2;
  };

  // Helper for drawing a clause occupying maximum text space with readable typography
  const drawClauseItem = (title: string, text: string, currentY: number) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin, currentY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.1);
    doc.setTextColor(30, 41, 59);
    const split = doc.splitTextToSize(text, contentWidth);
    doc.text(split, margin, currentY + 3.3);

    return currentY + 3.3 + split.length * 3.15 + 2.1;
  };

  // =========================================================================
  // PAGE 1: FULL DOCUMENT SIZED SPECIFICALLY TO 8.5 X 13 (OFICIO)
  // =========================================================================
  let y = 8.5;

  // Document Main Header & Subtitle
  doc.setFont('times', 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(20, 35, 65);
  doc.text('CARTA DE COMPROMISO Y CONDICIONES DE USO DE ESPACIOS', pageWidth / 2, y + 2, { align: 'center' });
  y += 5.8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(80, 95, 120);
  doc.text('CENTRO COMUNITARIO DIAGUITAS — MUNICIPALIDAD DE LAS CONDES', pageWidth / 2, y + 2, { align: 'center' });
  y += 4.8;

  // SECTION 1: IDENTIFICACIÓN DEL SOLICITANTE / TITULAR RESPONSABLE
  y = drawBanner('1. IDENTIFICACIÓN DEL SOLICITANTE / TITULAR RESPONSABLE', y);

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: margin, right: margin },
    body: [
      [
        { content: `Nombre Completo: ${resp || '__________________________________________'}` },
        { content: `Cédula / R.U.T.: ${rutStr || '______________________'}` }
      ],
      [
        { content: `Teléfono Contacto: ${tel || '__________________________________________'}` },
        { content: `Correo Electrónico: ${emailStr || '______________________'}` }
      ],
      [
        { content: `Domicilio / Dirección: ${dom || '__________________________________________'}` },
        { content: `Tipo de Actividad: ${tipoAct || '______________________'}` }
      ]
    ],
    styles: {
      font: 'helvetica',
      fontSize: 8.3,
      textColor: [20, 30, 45],
      lineColor: [navyBorder[0], navyBorder[1], navyBorder[2]],
      lineWidth: 0.25,
      cellPadding: 2.1,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: contentWidth / 2 },
      1: { cellWidth: contentWidth / 2 }
    }
  });

  // @ts-expect-error autoTable adds lastAutoTable to doc
  y = doc.lastAutoTable.finalY + 2.8;

  // SECTION 2: DETALLES DEL ESPACIO Y HORARIO AUTORIZADO
  y = drawBanner('2. DETALLES DEL ESPACIO Y HORARIO AUTORIZADO', y);

  autoTable(doc, {
    startY: y,
    theme: 'grid',
    margin: { left: margin, right: margin },
    body: [
      [
        { content: `Fecha y Día: ${fechaDiaStr || '__________________________________________'}` },
        { content: `Horario Autorizado: ${horarioStr || '______________________'}` }
      ],
      [
        { content: `Espacio Asignado: ${esp || '__________________________________________'}` },
        { content: `Modalidad / Tipo: ${modalidadStr || '______________________'}` }
      ],
      [
        { content: `Aforo Estimado: ${aforoStr || '__________________________________________'}` },
        { content: `Propósito / Evento: ${propositoStr || '______________________'}` }
      ]
    ],
    styles: {
      font: 'helvetica',
      fontSize: 8.3,
      textColor: [20, 30, 45],
      lineColor: [navyBorder[0], navyBorder[1], navyBorder[2]],
      lineWidth: 0.25,
      cellPadding: 2.1,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: contentWidth / 2 },
      1: { cellWidth: contentWidth / 2 }
    }
  });

  // @ts-expect-error autoTable adds lastAutoTable to doc
  y = doc.lastAutoTable.finalY + 2.8;

  // SECTION 3: MARCO LEGAL, COMPROMISOS DE COMPORTAMIENTO Y CONDICIONES DE USO
  y = drawBanner('3. MARCO LEGAL, COMPROMISOS DE COMPORTAMIENTO Y CONDICIONES DE USO', y);
  y += 2.4;

  // Clause 1
  y = drawClauseItem(
    '1. NATURALEZA JURÍDICA Y AUTORIZACIÓN PRECARIA DE USO:',
    'Este documento no es un arriendo ni un préstamo pagado: es una autorización precaria para usar un espacio municipal por un tiempo determinado (comodato precario, Arts. 2174, 2194 y 2195 Código Civil; Arts. 5° letra c) y 36 Ley N° 18.695). «Comodato» es un préstamo gratuito que se devuelve en las mismas condiciones; «precario» significa que se otorga por mera tolerancia, sin plazo garantizado, y puede terminarse antes si la Municipalidad lo decide.',
    y
  );

  // Clause 2
  y = drawClauseItem(
    '2. GRATUIDAD ABSOLUTA Y PROHIBICIÓN DE LUCRO:',
    'El uso del espacio es completamente gratuito (Art. 2174 inc. 1° Código Civil; Arts. 41 y 42 D.L. N° 3.063; Art. 36 Ley N° 18.695). Queda prohibido cobrar entradas, aportes u otro pago, o vender productos dentro del recinto sin autorización expresa del municipio.',
    y
  );

  // Clause 3
  y = drawClauseItem(
    '3. TRATO DIGNO Y RESPETO IRRESTRICTO A FUNCIONARIOS, VECINOS Y OTROS USUARIOS:',
    'El solicitante y sus invitados deben tratar con respeto a otros vecinos o usuarios del Centro Comunitario, a los funcionarios municipales, coordinadores, personal de aseo y personal de seguridad. Insultar, amenazar o agredir a un funcionario en ejercicio de sus funciones puede constituir delito (Arts. 261, 262, 264 y 296 Código Penal), en el marco de prevención institucional de la Ley N° 21.643 (Ley Karin). Una falta grave permite suspender la actividad, pedir auxilio de la fuerza pública, desalojar e inhabilitar al solicitante.',
    y
  );

  // Clause 4
  y = drawClauseItem(
    '4. CONDUCTO REGULAR Y CANALIZACIÓN EXCLUSIVA ANTE LA JEFATURA:',
    'Cualquier problema, reclamo o desperfecto debe informarse de manera formal EXCLUSIVAMENTE a la jefatura o administración del Centro Comunitario, y no discutirse con el personal de turno (Arts. 3°, 7° y 24 Ley N° 19.880; Arts. 52 y 53 Ley N° 18.575).',
    y
  );

  // Clause 5
  y = drawClauseItem(
    '5. MANTENER EL ESPACIO LIMPIO Y EN BUEN ESTADO:',
    'El solicitante debe mantener el espacio limpio y en buen estado durante toda la actividad, y devolverlo tal como lo recibió (Arts. 2178, 2179 y 2180 Código Civil).',
    y
  );

  // Clause 6
  y = drawClauseItem(
    '6. PUNTUALIDAD RIGUROSA Y HORARIO CONCEDIDO:',
    'El horario autorizado debe respetarse estrictamente, inicio y término (Arts. 1545 y 2180 N° 1 Código Civil; Art. 5° letra c) Ley N° 18.695; Ordenanza Comunal). Como el Centro Comunitario recibe muchas actividades en paralelo, si la actividad se extiende o corre riesgo de exceder el tiempo autorizado, el solicitante debe avisar de inmediato a la administración. No está permitido exigir directamente a la persona o grupo que esté usando la sala que la desocupe: cualquier situación de este tipo debe informarse a la administración, quien coordinará la solución.',
    y
  );

  // Clause 7
  y = drawClauseItem(
    '7. PROHIBICIÓN TOTAL DE ALCOHOL, TABACO Y SUSTANCIAS:',
    'No se permite portar, vender ni consumir alcohol (Arts. 25 y 26 Ley N° 19.925), ni fumar o usar cigarrillos electrónicos en espacios interiores o patios (Arts. 10 y 11 Leyes N° 20.660 y 21.575). Tampoco se permite portar ni consumir sustancias estupefacientes o psicotrópicas, sancionado como falta (Art. 50 Ley N° 20.000), sin perjuicio de responsabilidades penales mayores si la conducta excede el simple consumo personal.',
    y
  );

  // Clause 8
  y = drawClauseItem(
    '8. CONVIVENCIA, RUIDO MODERADO Y ORDEN PÚBLICO:',
    'Debe mantenerse un volumen moderado, sin molestar a los vecinos ni a otras actividades del Centro Comunitario (D.S. N° 38/2011 MMA; Arts. 495 N° 1 y 496 N° 1 y 5 Código Penal; Art. 4° letra h) Ley N° 18.695).',
    y
  );

  // Clause 9
  y = drawClauseItem(
    '9. ASEO, HIGIENE Y RETIRO DE RESIDUOS:',
    'Al finalizar, el solicitante debe retirar toda la basura, dejando el recinto limpio y las bolsas en los contenedores habilitados (Arts. 78, 79 y 80 Código Sanitario DFL N° 725; Art. 494 N° 3 Código Penal; Ordenanza Municipal).',
    y
  );

  // Clause 10
  y = drawClauseItem(
    '10. FACULTAD DE SUSPENSIÓN INMEDIATA Y DESALOJO POR INCUMPLIMIENTO DEL SOLICITANTE:',
    'Por ser un comodato precario, la administración y la autoridad municipal pueden suspender, revocar o dejar sin efecto de inmediato la autorización, y disponer el desalojo con auxilio de la fuerza pública, ante falta de respeto, incumplimiento o desórdenes graves (Arts. 2194 y 2195 Código Civil; Arts. 5°, 36 y 63 letras f) e i) Ley N° 18.695; Art. 61 Ley N° 19.880). No procede indemnización ni reclamo, y el solicitante puede quedar inhabilitado.',
    y
  );

  // Clause 11
  y = drawClauseItem(
    '11. FACULTAD DE LA MUNICIPALIDAD PARA REPROGRAMAR O CANCELAR EL PRÉSTAMO POR NECESIDAD SUPERIOR:',
    'Por ser una autorización gratuita y precaria, la Municipalidad puede disponer del espacio ante una necesidad superior o institucional (emergencia, actividad municipal prioritaria, reparación o contingencia de infraestructura), conforme a los Arts. 2194 y 2195 Código Civil, Arts. 5° letra c) y 36 Ley N° 18.695, y Art. 61 Ley N° 19.880 (revocación por mérito, oportunidad o conveniencia). Podrá modificar el horario, reprogramar o cancelar el préstamo, avisando al solicitante con la debida anticipación —salvo caso fortuito o fuerza mayor— y, de ser posible, ofreciendo una alternativa. No genera derecho a indemnización.',
    y
  );

  y += 1.5;

  // Sworn Statement (Juramento)
  doc.setFont('times', 'italic');
  doc.setFontSize(8.2);
  doc.setTextColor(30, 41, 59);
  const splitOath = doc.splitTextToSize(
    'Declaro bajo fe de juramento haber leído, comprendido y aceptado en su totalidad las condiciones precedentes, reconociendo el carácter gratuito de la facilitación, su naturaleza no contractual y la plena facultad legal de suspensión inmediata e inhabilitación ante cualquier incumplimiento normativo.',
    contentWidth
  );
  doc.text(splitOath, margin, y);
  y += splitOath.length * 3.3 + 3.5;

  // Horizontal line separating content from signatures
  doc.setDrawColor(navyBorder[0], navyBorder[1], navyBorder[2]);
  doc.setLineWidth(0.35);
  doc.line(margin, y, margin + contentWidth, y);
  y += 4.5;

  // Signatures 2 columns
  const col1X = margin;
  const col2X = margin + contentWidth / 2 + 5;
  const signatureLineWidth = (contentWidth / 2) - 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  // Column 1: Solicitante
  doc.text('FIRMA DEL SOLICITANTE', col1X, y);

  // Column 2: Administración
  doc.text('ADMINISTRACIÓN CENTRO COMUNITARIO DIAGUITAS', col2X, y);

  // Guide lines for physical signing & stamping
  doc.setDrawColor(200, 210, 225);
  doc.setLineWidth(0.2);
  doc.line(col1X, y + 12.5, col1X + signatureLineWidth, y + 12.5);
  doc.line(col2X, y + 12.5, col2X + signatureLineWidth, y + 12.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.0);
  doc.text(`Nombre: ${resp || '____________________________________'}`, col1X, y + 16.5);
  doc.text(`RUT: ${rutStr || '____________________________________'}`, col1X, y + 21.0);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.6);
  doc.setTextColor(100, 115, 135);
  doc.text('Firma y Timbre de Autorización', col2X, y + 16.5);

  // Footer tracking on Page 1 (at bottom of 8.5 x 13 sheet)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(120, 130, 145);
  doc.text(`Folio: ${folioNumber} | Papel: 8.5" × 13" (Oficio) | Centro Comunitario Diaguitas`, pageWidth - margin, 323, { align: 'right' });

  // =========================================================================
  // OPTIONAL PAGE 2: MULTI-SLOT CALENDAR ANNEX (IF SERIES HAS MULTIPLE SESSIONS)
  // =========================================================================
  if (
    rangeInfo.isMultiSlot &&
    rangeInfo.slots.length > 1 &&
    (rangeInfo.startDate !== rangeInfo.endDate || rangeInfo.slots.length > 2)
  ) {
    doc.addPage([215.9, 330.2], 'portrait');
    let y3 = 10;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`ANEXO: CALENDARIO DETALLADO DE SESIONES (${rangeInfo.totalSessions} SESIONES)`, margin, y3);
    y3 += 5.0;

    const isDocDraft = Boolean(options?.isDraft || !reservation.id || reservation.estado !== 'activa');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.0);
    doc.setTextColor(71, 85, 105);
    doc.text(`Folio de referencia: ${folioNumber} | Solicitante: ${resp || '______________________'}`, margin, y3);
    y3 += 5.5;

    const slotsTableBody = rangeInfo.slots.map((s, idx) => {
      let dayName = '';
      try {
        dayName = format(parseISO(s.fecha), "EEEE d 'de' MMMM, yyyy", { locale: es });
        dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      } catch {
        dayName = formatDateDDMMYYYY(s.fecha);
      }

      return [
        `${idx + 1}`,
        dayName,
        (s.espacio || 'ESPACIO').toUpperCase(),
        `${s.horaInicio} - ${s.horaFin} hrs.`,
        isDocDraft ? 'Borrador' : 'Autorizado'
      ];
    });

    autoTable(doc, {
      startY: y3,
      head: [['N°', 'Fecha y Día', 'Espacio Asignado', 'Horario Concedido', 'Estado']],
      body: slotsTableBody,
      theme: 'grid',
      margin: { left: margin, right: margin },
      headStyles: {
        fillColor: [navyHeaderBg[0], navyHeaderBg[1], navyHeaderBg[2]],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.2,
        halign: 'center',
        cellPadding: 2.2
      },
      styles: {
        fontSize: 8.0,
        cellPadding: 2.0,
        textColor: [30, 41, 59],
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { cellWidth: 70 },
        2: { cellWidth: 55 },
        3: { halign: 'center', cellWidth: 35 },
        4: { halign: 'center', cellWidth: 22 }
      }
    });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.setTextColor(120, 130, 145);
    doc.text(`Folio: ${folioNumber} | Anexo de Sesiones (Pág. 2) | Papel: 8.5" × 13" (Oficio)`, pageWidth - margin, 323, { align: 'right' });
  }

  return doc;
}

export async function downloadCommitmentLetterPdf(
  reservation: Partial<Reservation>,
  options?: CommitmentLetterOptions
): Promise<void> {
  try {
    const doc = await generateCommitmentLetterPdfDoc(reservation, options);
    const slots = extractScheduleSlots(reservation, options);
    const rangeInfo = computeCommitmentDateRangeAndDays(slots, reservation);
    const spaceLabel = (rangeInfo.uniqueSpacesText || reservation.espacio || 'Espacio')
      .replace(/[\/\\]/g, '_')
      .replace(/\s+/g, '_');
    const filename = `Carta_Compromiso_${spaceLabel}_${reservation.fecha || 'Fecha'}.pdf`;
    doc.save(filename);
  } catch (err) {
    console.error('Error generating and downloading Commitment Letter PDF:', err);
    throw err;
  }
}
