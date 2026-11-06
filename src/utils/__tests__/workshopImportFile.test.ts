import { expect, it, vi } from 'vitest';
import { parseWorkshopCsv, readReservationImportFile } from '../workshopImportFile';
import { parseWorkshopRows } from '../workshopImport';
const { readSheet } = vi.hoisted(() => ({ readSheet: vi.fn() }));
vi.mock('read-excel-file/browser', () => ({ readSheet }));
const header = ['NOMBRE TALLER', 'HORARIO 1', 'HORARIO 2', 'PROFESOR'];
function file(name: string, bytes: Uint8Array): File { return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer } as File; }

it.each([';', ',', '\t'])('recognizes Excel CSV separator %s and quoted cells', separator => {
  const text = [header.join(separator), ['"Danza; música, juegos"', 'mié 18:00 - 19:00', '', '"María ""Profesora"" Pérez"'].join(separator)].join('\r\n');
  const [row] = parseWorkshopRows(parseWorkshopCsv(`\uFEFF${text}`));
  expect(row.name).toBe('Danza; música, juegos');
  expect(row.teacher).toBe('María "Profesora" Pérez');
  expect(row.schedules[0]).toEqual({ day: 3, start: '18:00', end: '19:00' });
});
it('reads separator declarations and multiline quoted cells', () => {
  expect(parseWorkshopCsv('sep=;\r\nNOMBRE TALLER;HORARIO 1;PROFESOR\r\n"Danza\ny música";LUN 10:00-11:00;María')[1][0]).toBe('Danza\ny música');
  expect(() => parseWorkshopCsv('"incompleto')).toThrow('comillas');
});
it('decodes Windows-1252 Excel CSV exports without losing Spanish names', async () => {
  const bytes = Uint8Array.from([...`${header.join(';')}\r\nNIÑOS;LUN 10:00-11:00;;MUÑOZ`].map(char => char.charCodeAt(0)));
  const result = await readReservationImportFile(file('talleres.csv', bytes));
  expect(result.workshops?.[0]).toMatchObject({ name: 'NIÑOS', teacher: 'MUÑOZ' });
});
it('routes both workshop formats to review and leaves reservation backup CSV compatible', async () => {
  readSheet.mockResolvedValue([header, ['Danza', 'LUN 10:00-11:00', null, 'María']]);
  expect((await readReservationImportFile(file('talleres.xlsx', new Uint8Array()))).workshops).toHaveLength(1);
  const csv = `${header.join(';')}\nDanza;LUN 10:00-11:00;;María`;
  expect((await readReservationImportFile(file('talleres.csv', new TextEncoder().encode(csv)))).workshops).toHaveLength(1);
  const backup = 'id,fecha,horaInicio\n1,2027-03-01,10:00';
  expect(await readReservationImportFile(file('respaldo.csv', new TextEncoder().encode(backup)))).toEqual({ csv: backup });
});
