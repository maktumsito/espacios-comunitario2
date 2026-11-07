import type { Reservation, SpaceInfo } from '../types';
import { getChileanHolidayInfo, verifyHolidayOverrideKey } from './holidayUtils';
import { getEnabledSpaces } from './spaceAvailability';
import { ReservationSchema } from '../schemas/reservationSchema';

export const WORKSHOP_START = '2027-03-01';
export const WORKSHOP_END = '2027-11-30';
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase();
const weekdays: Record<string, number> = { DOM: 0, LUN: 1, MAR: 2, MIE: 3, JUE: 4, VIE: 5, SAB: 6 };
export interface WorkshopSchedule { day: number; start: string; end: string }
export interface WorkshopScheduleChoice extends WorkshopSchedule { enabled: boolean }
export interface WorkshopRow {
  row: number;
  name: string;
  teacher: string;
  schedules: WorkshopSchedule[];
  scheduleChoices?: WorkshopScheduleChoice[];
}

export function getWorkshopSchedules(row: WorkshopRow): WorkshopSchedule[] {
  if (!row.scheduleChoices) return row.schedules;
  return row.scheduleChoices.filter(slot => slot.enabled).map(({ day, start, end }) => ({ day, start, end }));
}

export function getWorkshopScheduleError(schedules: readonly WorkshopSchedule[]): string | undefined {
  if (!schedules.length) return 'Selecciona al menos un horario.';
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (schedules.some(({ start, end }) => !time.test(start) || (!time.test(end) && end !== '24:00') || end <= start)) {
    return 'La hora de fin debe ser posterior a la de inicio en cada horario seleccionado.';
  }
  const keys = new Set(schedules.map(({ day, start, end }) => `${day}:${start}-${end}`));
  if (keys.size !== schedules.length) return 'Hay horarios seleccionados repetidos.';
}

export function parseWorkshopSchedule(value: unknown): WorkshopSchedule {
  const match = normalize(value).match(/^(DOM|LUN|MAR|MIE|JUE|VIE|SAB)\.?\s+(\d{1,2}:[0-5]\d)\s*[-–—]\s*(\d{1,2}:[0-5]\d)$/);
  if (!match) throw new Error(`Horario no reconocido: «${String(value)}». Usa LUN 16:00-17:00.`);
  const start = match[2].padStart(5, '0');
  const end = match[3].padStart(5, '0');
  if (start >= end || start >= '24:00' || end > '24:00') throw new Error(`Rango horario inválido: ${String(value)}.`);
  return { day: weekdays[match[1]], start, end };
}

/** Read data only: spreadsheet text is never executed or treated as instructions. */
export function parseWorkshopRows(data: readonly (readonly unknown[])[]): WorkshopRow[] {
  const headerIndex = data.findIndex(row => row.some(cell => normalize(cell) === 'NOMBRE TALLER'));
  if (headerIndex < 0) throw new Error('Falta la columna NOMBRE TALLER.');
  const headers = data[headerIndex].map(normalize);
  const nameIndex = headers.indexOf('NOMBRE TALLER');
  const teacherIndex = headers.indexOf('PROFESOR');
  const scheduleIndexes = headers.flatMap((header, index) => /^HORARIO\s*\d+$/.test(header) ? [index] : []);
  if (teacherIndex < 0 || !scheduleIndexes.length) throw new Error('Se requieren las columnas PROFESOR y HORARIO 1 (HORARIO 2 es opcional).');
  const rows: WorkshopRow[] = [];
  for (let i = headerIndex + 1; i < data.length; i++) {
    const cells = data[i];
    if (cells.every(cell => !String(cell ?? '').trim())) continue;
    const name = String(cells[nameIndex] ?? '').trim();
    const teacher = String(cells[teacherIndex] ?? '').trim();
    try {
      if (!name || !teacher) throw new Error('Falta el nombre del taller o el profesor.');
      const schedules = scheduleIndexes.filter(index => String(cells[index] ?? '').trim()).map(index => parseWorkshopSchedule(cells[index]));
      if (!schedules.length) throw new Error('Falta al menos un horario.');
      if (new Set(schedules.map(slot => JSON.stringify(slot))).size !== schedules.length) throw new Error('Hay horarios repetidos en esta fila.');
      rows.push({ row: i + 1, name, teacher, schedules });
    } catch (error) {
      throw new Error(`Fila ${i + 1}: ${(error as Error).message}`);
    }
  }
  if (!rows.length) throw new Error('El archivo no contiene talleres.');
  if (rows.length > 500) throw new Error('Importa como máximo 500 talleres por archivo.');
  return rows;
}

export interface WorkshopImportPreview {
  reservations: Reservation[];
  omittedHolidays: { date: string; name: string; sessions: number }[];
  duplicates: number;
  total: number;
}

async function digest(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function sessionKey(row: Reservation): string {
  return JSON.stringify([row.fecha, row.horaInicio, row.horaFin, normalize(row.espacio), normalize(row.descripcion), normalize(row.responsable), normalize(row.tipoActividad)]);
}

export async function buildWorkshopImport(rows: readonly WorkshopRow[], assignments: Record<number, string>, spaces: readonly SpaceInfo[], existing: readonly Reservation[], drafts: Record<number, Reservation[]> = {}, activityAssignments: Record<number, string> = {}): Promise<WorkshopImportPreview> {
  const enabledNames = new Set(getEnabledSpaces(spaces).map(space => space.name));
  const byId = new Map(existing.map(row => [row.id, row]));
  const existingKeys = new Set(existing.map(sessionKey));
  const result: WorkshopImportPreview = { reservations: [], omittedHolidays: [], duplicates: 0, total: 0 };
  const holidays = new Map<string, { date: string; name: string; sessions: number }>();
  const identities = new Set<string>();
  for (const row of rows) {
    const space = assignments[row.row];
    const draft = drafts[row.row];
    if (!draft && !enabledNames.has(space)) throw new Error(`Fila ${row.row}: selecciona un espacio activo.`);
    const sortSchedules = (a: WorkshopSchedule, b: WorkshopSchedule) => a.day - b.day || a.start.localeCompare(b.start) || a.end.localeCompare(b.end);
    const schedules = [...getWorkshopSchedules(row)].sort(sortSchedules);
    if (!draft) {
      const error = getWorkshopScheduleError(schedules);
      if (error) throw new Error(`Fila ${row.row}: ${error}`);
    }
    const identity = JSON.stringify([normalize(row.name), normalize(row.teacher), [...row.schedules].sort(sortSchedules), WORKSHOP_START, WORKSHOP_END]);
    if (identities.has(identity)) throw new Error(`Fila ${row.row}: este taller y sus horarios ya aparecen en el archivo.`);
    identities.add(identity);
    // Independent of filename, row order and selected room: retrying cannot create another copy.
    const seriesId = `CCD_XLSX_${await digest(identity)}`;
    const series: Reservation[] = [];
    // Calendar dates must not drift across Chile's daylight-saving transitions.
    const end = Date.parse(`${WORKSHOP_END}T12:00:00Z`);
    for (let timestamp = Date.parse(`${WORKSHOP_START}T12:00:00Z`); !draft && timestamp <= end; timestamp += 86_400_000) {
      const date = new Date(timestamp);
      for (const slot of schedules.filter(slot => slot.day === date.getUTCDay())) {
        const iso = date.toISOString().slice(0, 10);
        const holiday = getChileanHolidayInfo(iso);
        if (holiday) {
          const item = holidays.get(iso) || { date: iso, name: holiday.name, sessions: 0 };
          item.sessions++;
          holidays.set(iso, item);
          continue;
        }
        series.push({ id: `${seriesId}_${iso}_${slot.start.replace(':', '')}_${slot.end.replace(':', '')}`, fecha: iso, horaInicio: slot.start, horaFin: slot.end,
          espacio: space, responsable: row.teacher, descripcion: row.name, tipoActividad: activityAssignments[row.row] || 'TALLER CCD',
          ...(activityAssignments[row.row] ? { tipoPrestamo: activityAssignments[row.row] } : {}), actividadRecurrente: 'Sí',
          tipoRecurrencia: 'semanal', serieRecurrente: seriesId, recurrenteId: seriesId,
          fechaInicioRecurrencia: WORKSHOP_START, fechaFinRecurrencia: WORKSHOP_END,
          diasSemana: [...new Set(schedules.map(slot => Object.keys(weekdays).find(key => weekdays[key] === slot.day)!.toLowerCase()))].join(','),
          estado: 'activa', realizada: 'No' });
      }
    }
    if (draft) {
      if (!draft.length) throw new Error(`Fila ${row.row}: el taller debe tener al menos una sesión.`);
      const used = new Set<string>();
      const ids = new Set<string>();
      for (const item of [...draft].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio) || a.espacio.localeCompare(b.espacio))) {
        if (!enabledNames.has(item.espacio)) throw new Error(`Fila ${row.row}: selecciona un espacio activo para ${item.fecha}.`);
        const check = ReservationSchema.safeParse(item);
        if (!check.success) throw new Error(`Fila ${row.row}: ${check.error.issues[0].message}`);
        const key = JSON.stringify([item.fecha, item.horaInicio, item.horaFin, item.espacio]);
        if (used.has(key)) throw new Error(`Fila ${row.row}: hay sesiones repetidas.`);
        used.add(key);
        const holiday = getChileanHolidayInfo(item.fecha);
        if (holiday && !verifyHolidayOverrideKey(item.claveAutorizacionFeriado || item.claveAutorizacion || '')) {
          const omitted = holidays.get(item.fecha) || { date: item.fecha, name: holiday.name, sessions: 0 };
          omitted.sessions++; holidays.set(item.fecha, omitted); continue;
        }
        let id = `${seriesId}_${item.fecha}_${item.horaInicio.replace(':', '')}_${item.horaFin.replace(':', '')}`;
        if (ids.has(id)) id += `_${(await digest(item.espacio)).slice(0, 8)}`;
        ids.add(id);
        series.push({ ...item, id, serieRecurrente: item.actividadRecurrente === 'Sí' ? seriesId : undefined,
          recurrenteId: item.actividadRecurrente === 'Sí' ? seriesId : undefined, version: 0 });
      }
    }
    series.forEach((reservation, index) => {
      reservation.indiceEnSerie = index + 1;
      reservation.totalEnSerie = series.length;
      result.total++;
      const known = byId.get(reservation.id);
      if (known && sessionKey(known) !== sessionKey(reservation)) throw new Error(`Fila ${row.row}: este taller ya fue importado con otros datos o espacio. Modifica su serie existente.`);
      if (known || existingKeys.has(sessionKey(reservation))) result.duplicates++;
      else result.reservations.push(reservation);
    });
  }
  result.omittedHolidays = [...holidays.values()].sort((a, b) => a.date.localeCompare(b.date));
  return result;
}
