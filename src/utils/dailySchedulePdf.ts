import { formatDisplayTitle } from './reservationVisuals';
import { isDispatchableReservation } from './activityDispatchSelection';
import type { Table, UserOptions } from 'jspdf-autotable';
import type { jsPDF } from 'jspdf';
import { loadPdfLibraries } from './loadPdfLibraries';
import { format, parseISO, addDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';
import { Reservation, SpaceInfo } from '../types';
import { SPACES_LIST, normalizeSpaceName } from '../data/spacesData';
import { formatDateDDMMYYYY } from './dateUtils';
import { getChileanHolidayInfo } from './holidayUtils';

export interface DailySchedulePdfOptions {
  dateStr: string; // YYYY-MM-DD
  reservations: Reservation[];
  spaces?: SpaceInfo[];
  selectedActivityTypes?: string[];
  onlyOccupiedSpaces?: boolean;
  include3DaysImportant?: boolean;
  customNote?: string;
  generatedBy?: string;
}

export interface GeneratedDailyPdfItem {
  date: string;
  filename: string;
  doc: jsPDF;
  base64: string;
  activitiesCount: number;
}

const DEFAULT_ORDERED_SPACES = [
  'AUDITORIO',
  'GIMNASIO',
  'SALA DE ESPEJOS',
  'TATAMI',
  'COCINA',
  'SALA 2',
  'SALA 3',
  'SALA 4',
  'SALA 5',
  'SALA 6',
  'MULTICANCHA',
  'BIBLIOTECA',
  'PATIO EXTERIOR',
  'BOX 1'
];

/**
 * Returns a standardized filename for the daily activities sheet, e.g.:
 * "Planilla_Actividades_Sabado_26-09-2026.pdf"
 */
export function getDailySchedulePdfFilename(dateStr: string): string {
  try {
    const cleanDate = dateStr.split('T')[0];
    const parsed = parseISO(cleanDate);
    if (!isNaN(parsed.getTime())) {
      const weekday = format(parsed, 'EEEE', { locale: es });
      const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
      const normalizedWeekday = capitalized
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const formattedDate = formatDateDDMMYYYY(cleanDate);
      return `Planilla_Actividades_${normalizedWeekday}_${formattedDate}.pdf`;
    }
  } catch {
    // fallback
  }
  return `Planilla_Actividades_${dateStr}.pdf`;
}

/**
 * Converts a jsPDF document to pure base64 string without data URI prefix.
 * Works seamlessly across both Browser (window / btoa) and Node.js (Buffer) environments.
 */
export function docToBase64(doc: jsPDF): string {
  try {
    // 1. In Node.js environment
    if (typeof Buffer !== 'undefined') {
      const arrayBuf = doc.output('arraybuffer');
      return Buffer.from(arrayBuf).toString('base64');
    }
    // 2. In Browser environment
    const arrayBuf = doc.output('arraybuffer');
    const bytes = new Uint8Array(arrayBuf);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  } catch (err) {
    // Fallback via datauristring
    const dataUri = doc.output('datauristring');
    const commaIndex = dataUri.indexOf(',');
    return commaIndex >= 0 ? dataUri.substring(commaIndex + 1) : dataUri;
  }
}

/**
 * Generates the official printable daily activities schedule PDF for a specific day.
 * Formatted specifically for clear paper printing on 8.5" x 13" (Oficio / Folio) landscape, high contrast, clean tables.
 */
export async function generateDailySchedulePdf(options: DailySchedulePdfOptions): Promise<jsPDF> {
  const { jsPDF, autoTable } = await loadPdfLibraries();
  const {
    dateStr,
    reservations,
    spaces = SPACES_LIST,
    selectedActivityTypes,
    onlyOccupiedSpaces = true,
    include3DaysImportant = false,
    customNote,
    generatedBy = 'Centro Comunitario Diaguitas'
  } = options;

  // Hoja configurada en 8.5 x 13 pulgadas = 215.9 mm x 330.2 mm (Tamaño Oficio / Folio tradicional)
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [215.9, 330.2]
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 330.2 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 215.9 mm
  const margin = 8;
  let currentY = 11;

  // Target Date calculation
  let targetDate: Date;
  try {
    const parsed = parseISO(dateStr.split('T')[0]);
    targetDate = isNaN(parsed.getTime()) ? new Date() : parsed;
  } catch {
    targetDate = new Date();
  }

  // Filter reservations for this exact date
  const filteredDailyReservations = reservations.filter((r) => {
    if (!r.fecha || !isDispatchableReservation(r)) return false;
    if (r.fecha !== dateStr) return false;
    if (
      selectedActivityTypes &&
      !selectedActivityTypes.includes('ALL')
    ) {
      const actType = (r.tipoActividad || '').trim().toUpperCase();
      const matches = selectedActivityTypes.some(
        (t) => t.trim().toUpperCase() === actType
      );
      if (!matches) return false;
    }
    return true;
  });

  // Calculate ordered space names
  const configuredNames = spaces.map((s) => s.name.toUpperCase());
  const orderedSpaceNames = [...configuredNames];
  DEFAULT_ORDERED_SPACES.forEach((s) => {
    if (!orderedSpaceNames.includes(s)) {
      orderedSpaceNames.push(s);
    }
  });

  // Group reservations by space
  const reservationsBySpace = new Map<string, Reservation[]>();
  orderedSpaceNames.forEach((name) => reservationsBySpace.set(name, []));

  filteredDailyReservations.forEach((r) => {
    const normSpace = normalizeSpaceName(r.espacio).toUpperCase();
    let matchedKey = orderedSpaceNames.find(
      (s) => s === normSpace || s.replace(/SALA DE /g, 'SALA ') === normSpace
    );
    if (!matchedKey) {
      matchedKey = normSpace;
    }
    if (!reservationsBySpace.has(matchedKey)) {
      reservationsBySpace.set(matchedKey, []);
    }
    reservationsBySpace.get(matchedKey)!.push(r);
  });

  // Sort inside each space by start time
  reservationsBySpace.forEach((list) => {
    list.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
  });

  // Determine visible spaces
  const visibleSpaces: { spaceName: string; bookings: Reservation[] }[] = [];
  const processed = new Set<string>();

  orderedSpaceNames.forEach((spaceName) => {
    const bookings = reservationsBySpace.get(spaceName) || [];
    if (!onlyOccupiedSpaces || bookings.length > 0) {
      visibleSpaces.push({ spaceName, bookings });
    }
    processed.add(spaceName);
  });

  reservationsBySpace.forEach((bookings, spaceName) => {
    if (!processed.has(spaceName)) {
      if (!onlyOccupiedSpaces || bookings.length > 0) {
        visibleSpaces.push({ spaceName, bookings });
      }
    }
  });

  // Calculate important reservations (next 3 days window)
  let importantUpcomingReservations: Reservation[] = [];
  if (include3DaysImportant) {
    try {
      const start = startOfDay(targetDate);
      const end = endOfDay(addDays(targetDate, 3));
      importantUpcomingReservations = reservations
        .filter((r) => {
          if (r.importante !== 'Sí') return false;
          if (!r.fecha) return false;
          const rDate = parseISO(r.fecha);
          if (isNaN(rDate.getTime())) return false;
          return isWithinInterval(rDate, { start, end });
        })
        .sort((a, b) => {
          if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
          return (a.horaInicio || '').localeCompare(b.horaInicio || '');
        });
    } catch {
      importantUpcomingReservations = [];
    }
  }

  // Header: Main Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42); // #0f172a
  doc.text('Centro Comunitario Diaguitas', margin, currentY);
  currentY += 6.5;

  // Subtitle
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(51, 65, 85); // #334155
  doc.text('Planilla Diaria de Actividades - Reservas por Espacio', margin, currentY);
  currentY += 5.5;

  // Date with weekday in Spanish
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  const weekdayName = format(targetDate, "EEEE d 'de' MMMM, yyyy", { locale: es });
  const capitalizedWeekday = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1);
  const holidayInfo = getChileanHolidayInfo(dateStr);
  const dateLine = holidayInfo
    ? `${capitalizedWeekday}   [FERIADO NACIONAL: ${holidayInfo.name.toUpperCase()}]`
    : capitalizedWeekday;
  doc.text(dateLine, margin, currentY);
  currentY += 4.5;

  // Emission timestamp
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // #64748b
  const now = new Date();
  const emissionTimestamp = format(now, 'dd-MM-yyyy HH:mm');
  doc.text(
    `Documento oficial para impresión diaria (Hoja 8.5" × 13" Oficio) | Total actividades: ${filteredDailyReservations.length} | Generado: ${emissionTimestamp}`,
    margin,
    currentY
  );
  currentY += 4;

  // Optional custom note from dispatcher
  if (customNote && customNote.trim()) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Nota: ${customNote.trim().slice(0, 120)}`, margin, currentY);
    currentY += 4;
  }

  // Horizontal Divider Line
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 3;

  // 1. IMPORTANT UPCOMING ACTIVITIES (if any)
  if (include3DaysImportant && importantUpcomingReservations.length > 0) {
    const dateRangeStart = formatDateDDMMYYYY(targetDate);
    const dateRangeEnd = formatDateDDMMYYYY(addDays(targetDate, 3));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(120, 53, 15); // #78350f

    const calloutTitle = `AVISO DE ACTIVIDADES IMPORTANTES (Próximos 3 Días: ${dateRangeStart} al ${dateRangeEnd})`;
    doc.text(calloutTitle, margin, currentY);
    currentY += 2;

    const importantTableRows = importantUpcomingReservations.map((imp) => {
      const eqText =
        imp.equipamientoSolicitado && imp.equipamientoSolicitado.length > 0
          ? `\n[Equipamiento (${imp.equipamientoSolicitado.reduce((acc, curr) => acc + curr.quantity, 0)}): ${imp.equipamientoSolicitado.map((e) => `${e.equipmentName} (x${e.quantity})`).join(', ')}]`
          : '';
      return [
        formatDateDDMMYYYY(imp.fecha),
        `${imp.horaInicio || ''}-${imp.horaFin || ''}`,
        formatDisplayTitle(imp.espacio),
        `${formatDisplayTitle(imp.tipoActividad || 'ACTIVIDAD')}${imp.descripcion ? '\n' + formatDisplayTitle(imp.descripcion) : ''}${eqText}`,
        formatDisplayTitle(imp.responsable || '-')
      ];
    });

    autoTable(doc, {
      startY: currentY,
      margin: { left: margin, right: margin },
      head: [['Fecha', 'Horario', 'Espacio', 'Actividad', 'Responsable']],
      body: importantTableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [254, 243, 199], // #fef3c7
        textColor: [120, 53, 15], // #78350f
        fontStyle: 'bold',
        fontSize: 8,
        lineWidth: 0.2,
        lineColor: [252, 211, 77]
      },
      bodyStyles: {
        textColor: [15, 23, 42],
        fontSize: 7.5,
        lineWidth: 0.2,
        lineColor: [252, 211, 77]
      },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: 'bold' },
        1: { cellWidth: 24, font: 'courier' },
        2: { cellWidth: 32, fontStyle: 'bold' },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 38 }
      },
      didDrawPage: (data) => {
        currentY = data.cursor?.y ? data.cursor.y + 5 : currentY + 5;
      }
    });

    // @ts-expect-error - jspdf-autotable lastAutoTable position
    currentY = (doc.lastAutoTable?.finalY || currentY) + 5;
  }

  // 2. SPACES AND RESERVATIONS
  if (visibleSpaces.length === 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'No hay actividades programadas para este día en los espacios seleccionados.',
      margin,
      currentY + 4
    );
  } else {
    // One continuous full-width table avoids repeated space headers and unused gaps.
    const entries = visibleSpaces.flatMap<{ spaceName: string; booking: Reservation | null }>(({ spaceName, bookings }) =>
      bookings.length > 0 ? bookings.map(booking => ({ spaceName, booking })) : [{ spaceName, booking: null }]
    );
    const rows = entries.map(({ spaceName, booking: b }) => {
      if (!b) return [formatDisplayTitle(spaceName), '-', 'Sin reservas programadas', '-'];
      const equipment = b.equipamientoSolicitado?.length
        ? '\nEquipamiento: ' + b.equipamientoSolicitado.map(e => e.equipmentName + ' (x' + e.quantity + ')').join(', ')
        : '';
      return [
        formatDisplayTitle(spaceName),
        (b.horaInicio || '') + ' - ' + (b.horaFin || ''),
        formatDisplayTitle(b.tipoActividad || 'ACTIVIDAD') + (b.importante === 'Sí' ? ' [IMPORTANTE]' : '')
          + (b.descripcion ? '\n' + formatDisplayTitle(b.descripcion) : '') + equipment
          + (b.comentarios ? '\nNota: ' + b.comentarios : ''),
        formatDisplayTitle(b.responsable || '-')
      ];
    });
    const tableWidth = pageWidth - margin * 2;
    const fontSize = rows.length <= 10 ? 12 : rows.length <= 18 ? 10.5 : 9;
    const tableOptions: UserOptions = {
      startY: currentY,
      margin: { left: margin, right: margin, top: margin, bottom: 14 },
      tableWidth,
      head: [['Espacio', 'Horario', 'Actividad / Observaciones / Equipamiento', 'Responsable']],
      body: rows,
      theme: 'grid',
      rowPageBreak: 'avoid',
      styles: { fontSize, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle', lineWidth: 0.2, lineColor: [148, 163, 184], textColor: [15, 23, 42] },
      headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: tableWidth * 0.16, fontStyle: 'bold' },
        1: { cellWidth: tableWidth * 0.13, font: 'courier' },
        2: { cellWidth: tableWidth * 0.49 },
        3: { cellWidth: tableWidth * 0.22 }
      }
    };
    // Measure wrapped text first, then distribute the spare height across rows.
    // Dense days flow onto additional pages of the same daily PDF without shrinking illegibly.
    let measurement = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [215.9, 330.2] });
    autoTable(measurement, tableOptions);
    // Choose the largest readable text that fits the actual content on one sheet.
    for (const candidateSize of [11, 10, 9]) {
      if (measurement.getNumberOfPages() === 1) break;
      if (candidateSize >= fontSize) continue;
      tableOptions.styles = { ...tableOptions.styles, fontSize: candidateSize };
      measurement = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [215.9, 330.2] });
      autoTable(measurement, tableOptions);
    }
    const measuredTable = (measurement as jsPDF & { lastAutoTable: Table }).lastAutoTable;
    const spareHeight = measurement.getNumberOfPages() === 1
      ? Math.max(0, pageHeight - 14 - (measuredTable.finalY ?? currentY) - 0.5) / rows.length
      : 0;
    autoTable(doc, {
      ...tableOptions,
      didParseCell: data => {
        if (data.section !== 'body') return;
        data.cell.styles.minCellHeight = measuredTable.body[data.row.index].height + spareHeight;
        if (entries[data.row.index].booking?.importante === 'Sí') {
          data.cell.styles.fillColor = [255, 251, 235];
        }
      }
    });
  }

  // Footers on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184); // #94a3b8
    doc.text(
      `Centro Comunitario Diaguitas - Planilla Oficial de Actividades (${formatDateDDMMYYYY(targetDate)})   |   Papel: 8.5" × 13" (Oficio horizontal)   |   Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  return doc;
}

/**
 * Generates the pure base64 string for a daily schedule PDF
 */
export async function generateDailySchedulePdfBase64(options: DailySchedulePdfOptions): Promise<string> {
  const doc = await generateDailySchedulePdf(options);
  return docToBase64(doc);
}

/**
 * Generates an array of daily PDF objects (one for each date in the dates array).
 * Each item contains:
 * - date (YYYY-MM-DD)
 * - filename (e.g. Planilla_Actividades_Sabado_26-09-2026.pdf)
 * - doc (jsPDF instance)
 * - base64 (ready for email attachments)
 * - activitiesCount (number of activities on that date)
 */
export async function generateDailyPdfsForDates(
  dates: string[],
  reservations: Reservation[],
  options?: Omit<DailySchedulePdfOptions, 'dateStr' | 'reservations'>
): Promise<GeneratedDailyPdfItem[]> {
  const items: GeneratedDailyPdfItem[] = [];
  for (const dateStr of [...new Set(dates)].sort()) {
    const dailyBookings = reservations.filter(r => r.fecha === dateStr && isDispatchableReservation(r) && (
      !options?.selectedActivityTypes || options.selectedActivityTypes.includes('ALL') ||
      options.selectedActivityTypes.some(type => type.trim().toUpperCase() === (r.tipoActividad || '').trim().toUpperCase())
    ));
    const doc = await generateDailySchedulePdf({
      dateStr,
      ...options,
      reservations: dailyBookings,
      include3DaysImportant: false
    });
    const filename = getDailySchedulePdfFilename(dateStr);
    const base64 = docToBase64(doc);

    items.push({
      date: dateStr,
      filename,
      doc,
      base64,
      activitiesCount: dailyBookings.length
    });
  }
  return items;
}
