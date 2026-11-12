import { Reservation } from '../types';

// ==========================================
// CONSTANTS & CSV CONFIGURATION
// ==========================================

const DEFAULT_CSV_FILENAME = 'reservas_espacios.csv';
const CSV_MIME_TYPE = 'text/csv;charset=utf-8;';
const UTF8_BOM_HEADER = '\uFEFF';
const CRLF_LINE_DELIMITER = '\r\n';

const CSV_EXPORT_HEADERS: readonly string[] = Object.freeze([
  'id',
  'fecha',
  'horaInicio',
  'horaFin',
  'espacio',
  'responsable',
  'telefonoContacto',
  'emailContacto',
  'tipoActividad',
  'tipoPrestamo',
  'unidadMunicipal',
  'descripcion',
  'actividadRecurrente',
  'comentarios',
  'editadoPor',
  'fechaEdicion',
  'serieRecurrente',
  'recurrenteId',
  'indiceEnSerie',
  'totalEnSerie',
  'tipoRecurrencia',
  'diasSemana',
  'fechaInicioRecurrencia',
  'fechaFinRecurrencia',
  'cantidadParticipantes',
  'realizada',
  'rut',
  'domicilio',
  'informeSemanal',
  'googleEventId',
  'importante',
  'estado',
  'terminaDiaSiguiente'
]);

/**
 * Escapes and sanitizes a cell value according to RFC 4180 CSV specifications
 * with strict defense against CSV / Formula Injection attacks (=, +, -, @, \t, \r).
 */
function escapeCsvCell(cellValue: unknown): string {
  if (cellValue === undefined || cellValue === null) {
    return '';
  }

  let stringValue = String(cellValue);

  // Prevent Formula Injection in spreadsheets: neutralize leading execution characters
  if (/^[=+\-@\t\r]/.test(stringValue.trimStart())) {
    stringValue = `'${stringValue}`;
  }

  const containsSpecialCharacters =
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r') ||
    stringValue.startsWith("'");

  if (containsSpecialCharacters) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Serializes a typed Reservation entity to an array of escaped CSV column values.
 */
function mapReservationToCsvColumns(reservation: Reservation): string[] {
  return [
    escapeCsvCell(reservation.id),
    escapeCsvCell(reservation.fecha),
    escapeCsvCell(reservation.horaInicio),
    escapeCsvCell(reservation.horaFin),
    escapeCsvCell(reservation.espacio),
    escapeCsvCell(reservation.responsable),
    escapeCsvCell(reservation.telefonoContacto || ''),
    escapeCsvCell(reservation.emailContacto || ''),
    escapeCsvCell(reservation.tipoActividad),
    escapeCsvCell(reservation.tipoPrestamo || ''),
    escapeCsvCell(reservation.unidadMunicipal),
    escapeCsvCell(reservation.descripcion),
    escapeCsvCell(reservation.actividadRecurrente),
    escapeCsvCell(reservation.comentarios || ''),
    escapeCsvCell(reservation.editadoPor || ''),
    escapeCsvCell(reservation.fechaEdicion || ''),
    escapeCsvCell(reservation.serieRecurrente || ''),
    escapeCsvCell(reservation.recurrenteId || ''),
    escapeCsvCell(reservation.indiceEnSerie || ''),
    escapeCsvCell(reservation.totalEnSerie || ''),
    escapeCsvCell(reservation.tipoRecurrencia || ''),
    escapeCsvCell(reservation.diasSemana || ''),
    escapeCsvCell(reservation.fechaInicioRecurrencia || ''),
    escapeCsvCell(reservation.fechaFinRecurrencia || ''),
    escapeCsvCell(reservation.cantidadParticipantes || ''),
    escapeCsvCell(reservation.realizada || 'No'),
    escapeCsvCell(reservation.rut || ''),
    escapeCsvCell(reservation.domicilio || ''),
    escapeCsvCell(reservation.informeSemanal || ''),
    escapeCsvCell(reservation.googleEventId || ''),
    escapeCsvCell(reservation.importante || 'No'),
    escapeCsvCell(reservation.estado || 'activa'),
    escapeCsvCell(reservation.terminaDiaSiguiente ? 'Sí' : 'No')
  ];
}

/**
 * Exports a collection of reservations into a downloadable CSV file.
 *
 * @param reservations - Array of reservations to export.
 * @param exportFilename - Custom target filename (defaults to 'reservas_espacios.csv').
 */
export function exportToCsv(
  reservations: readonly Reservation[],
  exportFilename: string = DEFAULT_CSV_FILENAME
): void {
  // Early exit if dataset is empty
  if (!reservations || reservations.length === 0) {
    return;
  }

  const csvHeaderRow = CSV_EXPORT_HEADERS.join(',');
  const csvDataRows = reservations.map((reservation) =>
    mapReservationToCsvColumns(reservation).join(',')
  );

  const fullCsvContent = `${UTF8_BOM_HEADER}${[csvHeaderRow, ...csvDataRows].join(CRLF_LINE_DELIMITER)}`;
  const fileBlob = new Blob([fullCsvContent], { type: CSV_MIME_TYPE });
  const objectDownloadUrl = URL.createObjectURL(fileBlob);

  const anchorElement = document.createElement('a');
  anchorElement.setAttribute('href', objectDownloadUrl);
  anchorElement.setAttribute('download', exportFilename);

  document.body.appendChild(anchorElement);
  anchorElement.click();
  document.body.removeChild(anchorElement);

  URL.revokeObjectURL(objectDownloadUrl);
}
