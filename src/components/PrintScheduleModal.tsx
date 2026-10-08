import { formatDisplayTitle } from '../utils/reservationVisuals';
import { ModalOverlay } from './common/ModalOverlay';
import { showPrintBlob } from '../utils/printWindow';
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Reservation, SpaceInfo } from '../types';
import { SPACES_LIST, normalizeSpaceName } from '../data/spacesData';
import {
  Printer,
  X,
  Calendar,
  Star,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Loader2,
  FileCode,
  CheckCircle2,
  Package
} from 'lucide-react';
import {
  format,
  parseISO,
  addDays,
  subDays,
  isWithinInterval,
  startOfDay,
  endOfDay
} from 'date-fns';
import { es } from 'date-fns/locale';
import { loadPdfLibraries } from '../utils/loadPdfLibraries';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import { getChileanHolidayInfo } from '../utils/holidayUtils';

interface PrintScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  reservations: Reservation[];
  spaces?: SpaceInfo[];
  initialDate?: string;
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

export const PrintScheduleModal: React.FC<PrintScheduleModalProps> = ({
  isOpen,
  onClose,
  reservations,
  spaces = SPACES_LIST,
  initialDate
}) => {
  const [selectedDateStr, setSelectedDateStr] = useState<string>(
    initialDate || format(new Date(), 'yyyy-MM-dd')
  );

  // Sync selectedDateStr when initialDate or isOpen changes
  useEffect(() => {
    if (initialDate && isOpen) {
      setSelectedDateStr(initialDate);
    }
  }, [initialDate, isOpen]);

  const [onlyOccupiedSpaces, setOnlyOccupiedSpaces] = useState<boolean>(true);
  const [include3DaysImportant, setInclude3DaysImportant] = useState<boolean>(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  // Parse target date
  const targetDate = useMemo(() => {
    try {
      const parsed = parseISO(selectedDateStr);
      return isNaN(parsed.getTime()) ? new Date() : parsed;
    } catch {
      return new Date();
    }
  }, [selectedDateStr]);

  // Emission timestamp formatted: "Emitido: 27-08-2026, 11:14:50 a. m."
  const emissionTimestamp = useMemo(() => {
    const now = new Date();
    const dateFormatted = format(now, 'dd-MM-yyyy');
    const timeFormatted = format(now, 'hh:mm:ss a', { locale: es })
      .replace('AM', 'a. m.')
      .replace('PM', 'p. m.')
      .replace('am', 'a. m.')
      .replace('pm', 'p. m.');
    return `${dateFormatted}, ${timeFormatted}`;
  }, []);

  // Ordered spaces
  const orderedSpaceNames = useMemo(() => {
    const configuredNames = spaces.map((s) => s.name.toUpperCase());
    const combined = [...configuredNames];
    DEFAULT_ORDERED_SPACES.forEach((s) => {
      if (!combined.includes(s)) {
        combined.push(s);
      }
    });
    return combined;
  }, [spaces]);

  // Active reservations on selected date
  const dailyReservations = useMemo(() => {
    return reservations.filter((r) => {
      return r.fecha === selectedDateStr;
    });
  }, [reservations, selectedDateStr]);

  // Group reservations by space
  const reservationsBySpace = useMemo(() => {
    const map = new Map<string, Reservation[]>();
    orderedSpaceNames.forEach((name) => map.set(name, []));

    dailyReservations.forEach((r) => {
      const normSpace = normalizeSpaceName(r.espacio).toUpperCase();
      let matchedKey = orderedSpaceNames.find(
        (s) => s === normSpace || s.replace(/SALA DE /g, 'SALA ') === normSpace
      );
      if (!matchedKey) {
        matchedKey = normSpace;
      }
      if (!map.has(matchedKey)) {
        map.set(matchedKey, []);
      }
      map.get(matchedKey)!.push(r);
    });

    // Sort reservations inside each space by start time
    map.forEach((list) => {
      list.sort((a, b) => (a.horaInicio || '').localeCompare(b.horaInicio || ''));
    });

    return map;
  }, [orderedSpaceNames, dailyReservations]);

  // Visible spaces list based on filter
  const visibleSpaces = useMemo(() => {
    const result: { spaceName: string; bookings: Reservation[] }[] = [];
    const processed = new Set<string>();

    orderedSpaceNames.forEach((spaceName) => {
      const bookings = reservationsBySpace.get(spaceName) || [];
      if (!onlyOccupiedSpaces || bookings.length > 0) {
        result.push({ spaceName, bookings });
      }
      processed.add(spaceName);
    });

    // Also include any space present in data that wasn't in ordered list
    reservationsBySpace.forEach((bookings, spaceName) => {
      if (!processed.has(spaceName)) {
        if (!onlyOccupiedSpaces || bookings.length > 0) {
          result.push({ spaceName, bookings });
        }
      }
    });

    return result;
  }, [orderedSpaceNames, reservationsBySpace, onlyOccupiedSpaces]);

  // Calculate Important Reservations within next 3 days window
  const importantUpcomingReservations = useMemo(() => {
    if (!include3DaysImportant) return [];
    try {
      const start = startOfDay(targetDate);
      const end = endOfDay(addDays(targetDate, 3));

      return reservations
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
      return [];
    }
  }, [reservations, targetDate, include3DaysImportant]);

  // Generate clean standalone HTML document (using strict hex colors, zero external css dependencies)
  const buildStandaloneHtml = () => {
    const reportElem = reportRef.current;
    if (!reportElem) return '';

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Planilla Diaria - Centro Comunitario Diaguitas (${formatDateDDMMYYYY(targetDate)})</title>
  <style>
    @page {
      size: portrait;
      margin: 12mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 20px;
      color: #0f172a;
      background: #ffffff;
      font-size: 12px;
      line-height: 1.4;
    }
    .print-toolbar {
      position: sticky;
      top: 0;
      background: #0f172a;
      color: #ffffff;
      padding: 10px 16px;
      margin-bottom: 20px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .print-toolbar button {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      font-weight: bold;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    .print-toolbar button:hover {
      background: #1d4ed8;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 2px 0;
      color: #0f172a;
    }
    .subtitle {
      font-size: 16px;
      font-weight: 600;
      color: #334155;
      margin: 2px 0;
    }
    .date-badge {
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      margin: 2px 0;
    }
    .timestamp {
      font-size: 11px;
      color: #64748b;
      margin-bottom: 8px;
    }
    hr {
      border: 0;
      border-top: 2px solid #0f172a;
      margin: 10px 0 16px 0;
    }
    .space-block {
      margin-bottom: 20px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .space-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: none;
      letter-spacing: 0.05em;
      color: #475569;
      margin-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 11px;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 6px 8px;
      vertical-align: top;
    }
    th {
      background-color: #f1f5f9;
      font-weight: 700;
      color: #334155;
      text-align: left;
    }
    .time-col {
      font-family: monospace;
      font-size: 11px;
      white-space: nowrap;
      width: 14%;
    }
    .act-title {
      font-weight: 700;
      text-transform: none;
      color: #0f172a;
      font-size: 11px;
    }
    .act-desc {
      text-transform: none;
      font-size: 11px;
      color: #334155;
      margin-top: 2px;
    }
    .equip-box {
      margin-top: 4px;
      padding: 3px 6px;
      background-color: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      font-size: 10px;
      color: #1e293b;
    }
    .equip-label {
      font-weight: 700;
      color: #475569;
      margin-right: 4px;
    }
    .important-badge {
      display: inline-block;
      background: #fef3c7;
      color: #78350f;
      border: 1px solid #fcd34d;
      font-size: 9px;
      font-weight: 800;
      padding: 1px 4px;
      border-radius: 3px;
      margin-left: 4px;
      text-transform: uppercase;
    }
    .important-box {
      border: 2px solid #f59e0b;
      background: #fffbeb;
      border-radius: 6px;
      padding: 10px;
      margin-bottom: 20px;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .important-box-title {
      font-size: 12px;
      font-weight: 700;
      color: #78350f;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .footer {
      margin-top: 24px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      page-break-inside: avoid;
    }
    @media print {
      @page {
        size: 8.5in 13in;
        margin: 10mm;
      }
      .no-print, .print-toolbar {
        display: none !important;
      }
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar no-print">
    <span>Planilla Oficial - Centro Comunitario Diaguitas (${selectedDateStr})</span>
    <button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
  </div>
  ${reportElem.innerHTML}
</body>
</html>`;
  };

  // Helper to build jsPDF Document
  const buildPdfDocument = async () => {
    const { jsPDF, autoTable } = await loadPdfLibraries();
    // Hoja 8.5 x 13 pulgadas = 215.9 mm x 330.2 mm (Oficio)
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [215.9, 330.2]
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // ~215.9 mm
    const pageHeight = doc.internal.pageSize.getHeight(); // ~330.2 mm
    const margin = 14;
    let currentY = 18;

    // Header: Main title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(15, 23, 42); // #0f172a
    doc.text('Centro Comunitario Diaguitas', margin, currentY);
    currentY += 7;

    // Subtitle
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(51, 65, 85); // #334155
    doc.text('Reservas por Espacio', margin, currentY);
    currentY += 6;

    // Date string
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const holidayPdfInfo = getChileanHolidayInfo(selectedDateStr);
    const dateLineText = holidayPdfInfo
      ? `${formatDateDDMMYYYY(targetDate)}  [FERIADO NACIONAL: ${holidayPdfInfo.name.toUpperCase()}]`
      : formatDateDDMMYYYY(targetDate);
    doc.text(dateLineText, margin, currentY);
    currentY += 5;

    // Timestamp
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139); // #64748b
    doc.text(`Emitido: ${emissionTimestamp}`, margin, currentY);
    currentY += 4;

    // Horizontal Divider Line
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.6);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 6;

    // 1. IMPORTANT UPCOMING ACTIVITIES (3 Days window)
    if (include3DaysImportant && importantUpcomingReservations.length > 0) {
      const dateRangeStart = formatDateDDMMYYYY(targetDate);
      const dateRangeEnd = formatDateDDMMYYYY(addDays(targetDate, 3));
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(120, 53, 15); // #78350f

      const calloutTitle = `AVISO DE ACTIVIDADES IMPORTANTES (Próximos 3 Días: ${dateRangeStart} al ${dateRangeEnd})`;
      doc.text(calloutTitle, margin, currentY);
      currentY += 2;

      const importantTableRows = importantUpcomingReservations.map((imp) => {
        const eqText = imp.equipamientoSolicitado && imp.equipamientoSolicitado.length > 0
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
          textColor: [120, 53, 15],   // #78350f
          fontStyle: 'bold',
          fontSize: 8.5,
          lineWidth: 0.2,
          lineColor: [252, 211, 77]
        },
        bodyStyles: {
          textColor: [15, 23, 42],
          fontSize: 8,
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
          currentY = data.cursor?.y ? data.cursor.y + 6 : currentY + 6;
        }
      });

      // @ts-expect-error - jspdf-autotable lastAutoTable position
      currentY = (doc.lastAutoTable?.finalY || currentY) + 6;
    }

    // 2. SPACES AND RESERVATIONS
    if (visibleSpaces.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9.5);
      doc.setTextColor(100, 116, 139);
      doc.text('No hay actividades registradas para este día en los espacios seleccionados.', margin, currentY + 4);
    } else {
      for (const { spaceName, bookings } of visibleSpaces) {
        if (currentY > pageHeight - 42) {
          doc.addPage();
          currentY = 18;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(71, 85, 105); // #475569
        doc.text(formatDisplayTitle(spaceName), margin, currentY);
        currentY += 2;

        const rows = bookings.length === 0
          ? [['-', 'Sin reservas programadas', '-', '-']]
          : bookings.map((b) => {
              const isImp = b.importante === 'Sí';
              const eqText = b.equipamientoSolicitado && b.equipamientoSolicitado.length > 0
                ? `\n[Equipamiento y Recursos (${b.equipamientoSolicitado.reduce((acc, curr) => acc + curr.quantity, 0)}): ${b.equipamientoSolicitado.map((e) => `${e.equipmentName} (x${e.quantity})`).join(', ')}]`
                : '';
              const actText = `${formatDisplayTitle(b.tipoActividad || 'ACTIVIDAD')}${isImp ? ' [★ IMPORTANTE]' : ''}${b.descripcion ? '\n' + formatDisplayTitle(b.descripcion) : ''}${eqText}${b.comentarios ? '\nNota: ' + b.comentarios : ''}`;
              return [
                `${b.horaInicio || ''}-${b.horaFin || ''}`,
                actText,
                formatDisplayTitle(b.responsable || '-'),
                formatDateDDMMYYYY(b.fecha || selectedDateStr)
              ];
            });

        autoTable(doc, {
          startY: currentY,
          margin: { left: margin, right: margin },
          head: [['Horario', 'Actividad', 'Responsable', 'Fecha']],
          body: rows,
          theme: 'grid',
          headStyles: {
            fillColor: [241, 245, 249], // #f1f5f9
            textColor: [51, 65, 85],    // #334155
            fontStyle: 'bold',
            fontSize: 8.5,
            lineWidth: 0.2,
            lineColor: [203, 213, 225]
          },
          bodyStyles: {
            textColor: [15, 23, 42],
            fontSize: 8,
            lineWidth: 0.2,
            lineColor: [203, 213, 225]
          },
          columnStyles: {
            0: { cellWidth: 26, font: 'courier' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 42 },
            3: { cellWidth: 24, font: 'courier' }
          },
          didParseCell: (hookData) => {
            if (hookData.section === 'body' && bookings.length > 0) {
              const booking = bookings[hookData.row.index];
              if (booking && booking.importante === 'Sí') {
                hookData.cell.styles.fillColor = [255, 251, 235]; // #fffbeb
              }
            }
          }
        });

        // @ts-expect-error - jspdf-autotable lastAutoTable position
        currentY = (doc.lastAutoTable?.finalY || currentY) + 5;
      }
    }

    // Add page numbers and footer on each page
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // #94a3b8
      doc.text(
        `Centro Comunitario Diaguitas - Planilla Oficial de Actividades   |   Papel: 8.5" × 13" (Oficio)   |   Página ${i} de ${totalPages}`,
        pageWidth / 2,
        pageHeight - 8,
        { align: 'center' }
      );
    }

    return doc;
  };

  // 1. Direct Native Vector PDF Generator
  const handleDownloadPdf = async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    setFeedbackMessage('Generando PDF oficial vectorizado...');

    try {
      const doc = await buildPdfDocument();
      doc.save(`Planilla_Diaria_Diaguitas_${formatDateDDMMYYYY(targetDate)}.pdf`);
      setFeedbackMessage('¡PDF descargado con éxito!');
      setTimeout(() => setFeedbackMessage(null), 3500);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setFeedbackMessage('Error al generar PDF. Intente con el botón Imprimir.');
      setTimeout(() => setFeedbackMessage(null), 4000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Reserve the popup during the user gesture, before asynchronous library loading.
  const handlePrintDirect = async () => {
    if (isPrinting) return;
    setIsPrinting(true);
    setFeedbackMessage('Abriendo diálogo de impresión...');
    let printWin: Window | null = null;
    try {
      printWin = window.open('about:blank', '_blank');
      if (!printWin) {
        window.print();
        return;
      }
      try {
        const doc = await buildPdfDocument();
        if (printWin.closed) return;
        doc.autoPrint();
        showPrintBlob(printWin, doc.output('blob'));
      } catch (error) {
        console.error('Error generating printable PDF:', error);
        if (printWin.closed) return;
        // Reuse the reserved window for the complete HTML document on PDF failure.
        const html = buildStandaloneHtml().replace('</body>', '<script>window.addEventListener("load", () => window.print(), { once: true });</script></body>');
        showPrintBlob(printWin, new Blob([html], { type: 'text/html;charset=utf-8' }));
      }
      setFeedbackMessage('Planilla abierta para imprimir.');
    } catch (error) {
      printWin?.close();
      console.error('Error opening print window:', error);
      setFeedbackMessage('No se pudo abrir la impresión. Intente nuevamente.');
    } finally {
      setIsPrinting(false);
    }
  };

  // 3. Open in Clean New Tab (Guaranteed to work in any browser)
  const handleOpenNewTabPrint = () => {
    try {
      const htmlContent = buildStandaloneHtml();
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const newWin = window.open('about:blank', '_blank');
      if (!newWin) {
        setFeedbackMessage('Por favor permite ventanas emergentes (popups) para abrir la planilla en una nueva pestaña.');
        setTimeout(() => setFeedbackMessage(null), 5000);
      } else {
        showPrintBlob(newWin, blob);
        setFeedbackMessage('Planilla abierta en una nueva pestaña.');
        setTimeout(() => setFeedbackMessage(null), 3000);
      }
    } catch (err) {
      console.error('Error opening new tab:', err);
      setFeedbackMessage('Error al abrir la planilla en nueva pestaña.');
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  // 4. Download Standalone HTML file
  const handleDownloadHtml = () => {
    try {
      const htmlContent = buildStandaloneHtml();
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Planilla_Diaria_${selectedDateStr}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading HTML:', err);
    }
  };

  const handlePrevDay = () => {
    try {
      const newD = subDays(targetDate, 1);
      setSelectedDateStr(format(newD, 'yyyy-MM-dd'));
    } catch {
      // ignore
    }
  };

  const handleNextDay = () => {
    try {
      const newD = addDays(targetDate, 1);
      setSelectedDateStr(format(newD, 'yyyy-MM-dd'));
    } catch {
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClose={() => { if (!isGeneratingPdf) onClose(); }} className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4">
      {/* Modal Container */}
      <div
        id="print-modal-dialog"
        className="relative w-full max-w-4xl max-h-[95vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
      >
        {/* Header Controls (Hidden during print) */}
        <div className="no-print p-4 sm:p-5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-md">
              <Printer className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">Imprimir Planilla Diaria (Formato PDF)</h2>
              <p className="text-xs text-slate-400">
                Genera el documento oficial por espacios con alertas de actividades importantes
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Primary: Direct Download PDF */}
            <button
              id="btn-download-pdf-direct"
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{isGeneratingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
            </button>

            {/* Secondary: Direct Print Dialog */}
            <button
              id="btn-trigger-print-dialog"
              onClick={handlePrintDirect}
              disabled={isPrinting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md transition flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isPrinting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Printer className="w-4 h-4" />
              )}
              <span>Imprimir</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status / Feedback Banner */}
        {feedbackMessage && (
          <div className="no-print bg-emerald-500 text-white text-xs font-semibold py-2 px-4 flex items-center justify-center space-x-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{feedbackMessage}</span>
          </div>
        )}

        {/* Configuration Bar (Hidden during print) */}
        <div className="no-print px-5 py-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700">
          {/* Date Selector */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrevDay}
              className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 transition cursor-pointer"
              title="Día anterior"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-lg shadow-2xs font-semibold">
              <Calendar className="w-4 h-4 text-blue-600" />
              <input
                type="date"
                value={selectedDateStr}
                onChange={(e) => setSelectedDateStr(e.target.value)}
                className="font-mono text-xs focus:outline-none bg-transparent cursor-pointer"
              />
            </div>
            <button
              onClick={handleNextDay}
              className="p-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 transition cursor-pointer"
              title="Día siguiente"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
            <span className="font-bold text-slate-800 capitalize hidden sm:inline">
              {format(targetDate, "EEEE d 'de' MMMM, yyyy", { locale: es })}
            </span>
          </div>

          {/* Options Toggles */}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyOccupiedSpaces}
                onChange={(e) => setOnlyOccupiedSpaces(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <span className="font-medium">Solo espacios con reservas</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={include3DaysImportant}
                onChange={(e) => setInclude3DaysImportant(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              <span className="font-medium flex items-center space-x-1 text-amber-800">
                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 inline" />
                <span>Destacar importantes (3 días antes)</span>
              </span>
            </label>
          </div>
        </div>

        {/* Scrollable Document Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-200/60 flex justify-center">
          {/* Exact Printable Paper Document Matching PDF */}
          <div
            id="printable-schedule-report"
            ref={reportRef}
            className="w-full max-w-[800px] bg-white p-6 sm:p-10 shadow-lg text-slate-900 font-sans border border-slate-300 print:shadow-none print:border-none print:p-0 print:m-0"
          >
            {/* Header Document Block */}
            <div className="mb-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight leading-tight">
                Centro Comunitario Diaguitas
              </h1>
              <div className="text-base sm:text-lg font-semibold text-slate-700 mt-0.5">
                Reservas por Espacio
              </div>
              <div className="text-sm font-semibold text-slate-900 mt-0.5 flex items-center space-x-2">
                <span>{formatDateDDMMYYYY(targetDate)}</span>
                {getChileanHolidayInfo(selectedDateStr) && (
                  <span className="text-xs px-2 py-0.5 rounded bg-rose-100 text-rose-900 font-bold border border-rose-200">
                    🇨🇱 FERIADO NACIONAL: {getChileanHolidayInfo(selectedDateStr)?.name}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Emitido: {emissionTimestamp}
              </div>
              <hr className="border-t-2 border-slate-900 my-3.5" />
            </div>

            {/* SECTION: Important Activities Alert from 3 Days Before */}
            {include3DaysImportant && importantUpcomingReservations.length > 0 && (
              <div className="mb-6 page-break-avoid border-2 border-amber-400 bg-amber-50/50 rounded-lg p-3.5 print:border-amber-500 print:bg-transparent">
                <div className="flex items-center space-x-2 text-amber-900 font-bold text-xs sm:text-sm uppercase tracking-wider mb-2.5">
                  <Star className="w-4 h-4 fill-amber-500 text-amber-600 inline" />
                  <span>
                    AVISO DE ACTIVIDADES IMPORTANTES (Próximos 3 Días: {formatDateDDMMYYYY(targetDate)} al{' '}
                    {formatDateDDMMYYYY(addDays(targetDate, 3))})
                  </span>
                </div>
                <table className="w-full text-left border-collapse border border-amber-300 text-xs">
                  <thead>
                    <tr className="bg-amber-100/80 text-amber-950 font-bold">
                      <th className="border border-amber-300 px-2.5 py-1.5 w-[14%]">Fecha</th>
                      <th className="border border-amber-300 px-2.5 py-1.5 w-[14%]">Horario</th>
                      <th className="border border-amber-300 px-2.5 py-1.5 w-[18%]">Espacio</th>
                      <th className="border border-amber-300 px-2.5 py-1.5 w-[32%]">Actividad</th>
                      <th className="border border-amber-300 px-2.5 py-1.5 w-[22%]">Responsable</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importantUpcomingReservations.map((imp) => (
                      <tr key={`imp-${imp.id}`} className="bg-white">
                        <td className="border border-amber-200 px-2.5 py-1.5 font-bold text-amber-950">
                          {formatDateDDMMYYYY(imp.fecha)}
                        </td>
                        <td className="border border-amber-200 px-2.5 py-1.5 font-mono text-[11px]">
                          {imp.horaInicio}-{imp.horaFin}
                        </td>
                        <td className="border border-amber-200 px-2.5 py-1.5 font-bold normal-case text-[11px]">
                          {formatDisplayTitle(imp.espacio)}
                        </td>
                        <td className="border border-amber-200 px-2.5 py-1.5">
                          <div className="font-bold text-amber-950 normal-case text-[11px]">
                            {formatDisplayTitle(imp.tipoActividad || 'ACTIVIDAD')}
                          </div>
                          <div className="text-[11px] text-slate-800 normal-case leading-snug">
                            {formatDisplayTitle(imp.descripcion || '-')}
                          </div>
                          {imp.equipamientoSolicitado && imp.equipamientoSolicitado.length > 0 && (
                            <div className="mt-1 p-1 bg-amber-100/70 rounded border border-amber-200 text-[10px] text-amber-950 flex flex-wrap items-center gap-1">
                              <span className="font-bold flex items-center gap-1 text-amber-900">
                                <span>📦</span>
                                <span>Equipamiento ({imp.equipamientoSolicitado.reduce((acc, curr) => acc + curr.quantity, 0)}):</span>
                              </span>
                              <span>
                                {imp.equipamientoSolicitado.map((e) => `${e.equipmentName} (x${e.quantity})`).join(' • ')}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="border border-amber-200 px-2.5 py-1.5 text-slate-800 normal-case">
                          {formatDisplayTitle(imp.responsable)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* SPACE BY SPACE TABLES (Matching PDF exact structure) */}
            {visibleSpaces.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
                No hay actividades registradas para este día en los espacios seleccionados.
              </div>
            ) : (
              visibleSpaces.map(({ spaceName, bookings }) => (
                <div key={spaceName} className="mb-6 page-break-avoid">
                  {/* Space Title Header */}
                  <div className="text-slate-500 font-bold normal-case text-xs sm:text-sm tracking-wider mb-1.5">
                    {formatDisplayTitle(spaceName)}
                  </div>

                  {/* Reservations Table */}
                  <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                    <thead>
                      <tr className="bg-slate-100/90 text-slate-700 font-bold">
                        <th className="border border-slate-300 px-3 py-1.5 w-[14%]">Horario</th>
                        <th className="border border-slate-300 px-3 py-1.5 w-[46%]">Actividad</th>
                        <th className="border border-slate-300 px-3 py-1.5 w-[25%]">Responsable</th>
                        <th className="border border-slate-300 px-3 py-1.5 w-[15%]">Fecha</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="border border-slate-300 px-3 py-2 text-center text-slate-400 italic text-xs"
                          >
                            Sin reservas programadas
                          </td>
                        </tr>
                      ) : (
                        bookings.map((b) => {
                          const isImportant = b.importante === 'Sí';
                          return (
                            <tr
                              key={b.id}
                              className={isImportant ? 'bg-amber-50/40 print:bg-transparent' : 'bg-white'}
                            >
                              {/* Horario */}
                              <td className="border border-slate-300 px-3 py-2 font-mono text-[11px] align-top text-slate-900 whitespace-nowrap">
                                {b.horaInicio}-{b.horaFin}
                              </td>

                              {/* Actividad */}
                              <td className="border border-slate-300 px-3 py-2 align-top text-slate-900">
                                <div className="flex items-center space-x-1.5">
                                  <span className="font-bold normal-case text-slate-900 text-[11px]">
                                    {formatDisplayTitle(b.tipoActividad || 'ACTIVIDAD')}
                                  </span>
                                  {isImportant && (
                                    <span className="inline-flex items-center text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-amber-200 text-amber-900 border border-amber-300">
                                      ★ IMPORTANTE
                                    </span>
                                  )}
                                </div>
                                <div className="text-slate-800 normal-case text-[11px] font-normal leading-snug mt-0.5">
                                  {formatDisplayTitle(b.descripcion || '-')}
                                </div>
                                {b.equipamientoSolicitado && b.equipamientoSolicitado.length > 0 && (
                                  <div className="mt-1 p-1 bg-slate-100 rounded border border-slate-200 text-[10px] text-slate-800 flex flex-wrap items-center gap-1">
                                    <span className="font-bold flex items-center gap-1 text-slate-700">
                                      <Package className="w-3 h-3 text-slate-600 inline" />
                                      <span>Equipamiento y Recursos Asignados ({b.equipamientoSolicitado.reduce((acc, curr) => acc + curr.quantity, 0)}):</span>
                                    </span>
                                    <span className="text-slate-900 font-medium">
                                      {b.equipamientoSolicitado.map((e) => `${e.equipmentName} (x${e.quantity})`).join(' • ')}
                                    </span>
                                  </div>
                                )}
                                {b.comentarios && (
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    Nota: {b.comentarios}
                                  </div>
                                )}
                              </td>

                              {/* Responsable */}
                              <td className="border border-slate-300 px-3 py-2 align-top text-slate-800 normal-case text-[11px]">
                                {formatDisplayTitle(b.responsable || '-')}
                              </td>

                              {/* Fecha */}
                              <td className="border border-slate-300 px-3 py-2 align-top text-slate-800 font-mono text-[11px] whitespace-nowrap">
                                {formatDateDDMMYYYY(b.fecha || selectedDateStr)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              ))
            )}

            {/* Document Footer */}
            <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500 font-medium page-break-avoid">
              Centro Comunitario Diaguitas - Sistema de Reservas
            </div>
          </div>
        </div>

        {/* Bottom Actions Bar (Hidden during print) */}
        <div className="no-print px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <span>
              Total: <strong className="text-slate-800">{dailyReservations.length}</strong> actividades
            </span>
            {include3DaysImportant && importantUpcomingReservations.length > 0 && (
              <span className="text-amber-800 font-medium">
                • <strong className="text-amber-900">{importantUpcomingReservations.length}</strong> importantes en 3 días
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Open in new window option */}
            <button
              onClick={handleOpenNewTabPrint}
              title="Abrir reporte en nueva ventana con botón de impresión directa"
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Abrir en Pestaña</span>
            </button>

            {/* Download Standalone HTML */}
            <button
              onClick={handleDownloadHtml}
              title="Descargar archivo HTML autocontenido"
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Guardar HTML</span>
            </button>

            {/* Direct Vector PDF Download Button */}
            <button
              onClick={handleDownloadPdf}
              disabled={isGeneratingPdf}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {isGeneratingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Descargar PDF</span>
            </button>

            {/* Primary Print Button */}
            <button
              onClick={handlePrintDirect}
              disabled={isPrinting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              {isPrinting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Printer className="w-3.5 h-3.5" />
              )}
              <span>Imprimir Planilla</span>
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
};
