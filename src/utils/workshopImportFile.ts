import { parseWorkshopRows, type WorkshopRow } from './workshopImport';

/** Excel CSV exports may use ;, comma or tabs, quoted separators and multiline cells. */
export function parseWorkshopCsv(text: string): string[][] {
  let source = text.replace(/^\uFEFF/, '');
  const separatorLine = source.match(/^sep=([;,\t])\r?\n/i);
  if (separatorLine) source = source.slice(separatorLine[0].length);
  const firstLine = source.split(/\r?\n/, 1)[0];
  const separator = separatorLine?.[1] || [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell.trim()) quoted = !quoted;
      else cell += char;
    } else if (!quoted && char === separator) { row.push(cell); cell = ''; }
    else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('El CSV tiene una celda con comillas sin cerrar.');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function isWorkshopTable(data: readonly (readonly unknown[])[]): boolean {
  return data.some(row => row.some(cell => String(cell ?? '').replace(/^\uFEFF/, '').trim().toUpperCase() === 'NOMBRE TALLER'));
}

export async function readReservationImportFile(file: File): Promise<{ workshops: WorkshopRow[]; csv?: never } | { csv: string; workshops?: never }> {
  if (file.size > 10 * 1024 * 1024) throw new Error('El archivo debe pesar como máximo 10 MB.');
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    return { workshops: parseWorkshopRows(await readSheet(file)) };
  }
  if (!/\.csv$/i.test(file.name)) throw new Error('Selecciona un archivo Excel (.xlsx) o CSV (.csv).');
  const bytes = await file.arrayBuffer();
  let csv: string;
  try { csv = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { csv = new TextDecoder('windows-1252').decode(bytes); }
  const table = parseWorkshopCsv(csv);
  return isWorkshopTable(table) ? { workshops: parseWorkshopRows(table) } : { csv };
}
