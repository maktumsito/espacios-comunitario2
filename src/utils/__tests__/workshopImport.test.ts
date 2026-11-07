import { describe, expect, it } from 'vitest';
import { buildWorkshopImport, parseWorkshopRows, parseWorkshopSchedule } from '../workshopImport';
import { SPACES_LIST } from '../../data/spacesData';
import { ReservationSchema } from '../../schemas/reservationSchema';

const header = ['NOMBRE TALLER', 'HORARIO 1', 'HORARIO 2', 'PROFESOR'];
const rows = () => parseWorkshopRows([header, ['Danza', 'LUN 19:00-20:00', 'MIÉ 18:00 - 19:00', 'María Pérez']]);
const build = (existing: Parameters<typeof buildWorkshopImport>[3] = []) => buildWorkshopImport(rows(), { 2: 'SALA 2' }, SPACES_LIST, existing);

describe('workshop Excel import', () => {
  it.each(['lun 9:00-10:00', 'LUN. 09:00 – 10:00'])('recognizes abbreviated days and time formatting: %s', value => {
    expect(parseWorkshopSchedule(value)).toEqual({ day: 1, start: '09:00', end: '10:00' });
  });
  it.each(['LUN 25:00-26:00', 'LUN 20:00-19:00', 'LUN 09:80-10:00', 'XXX 09:00-10:00', 'LUN 09:00-24:30'])('rejects invalid schedules without defaults: %s', value => {
    expect(() => parseWorkshopSchedule(value)).toThrow();
  });
  it('validates all rows and required columns before generating any reservations', () => {
    expect(() => parseWorkshopRows([header, ['Danza', 'incorrecto', '', 'Profesora']])).toThrow('Fila 2');
    expect(() => parseWorkshopRows([['NOMBRE TALLER'], ['Danza']])).toThrow('PROFESOR');
    expect(() => parseWorkshopRows([header, ['Danza', '', '', 'Profesora']])).toThrow('horario');
    expect(() => parseWorkshopRows([header, ['Danza', 'LUN 10:00-11:00', 'LUN 10:00-11:00', 'Profesora']])).toThrow('repetidos');
  });
  it('preserves different weekday times, period boundaries, teacher and recurring metadata', async () => {
    const preview = await build();
    expect(preview.reservations[0].fecha).toBe('2027-03-01');
    expect(preview.reservations.at(-1)!.fecha).toBe('2027-12-29');
    expect(new Set(preview.reservations.map(row => row.serieRecurrente)).size).toBe(1);
    expect(new Set(preview.reservations.map(row => `${row.horaInicio}-${row.horaFin}`))).toEqual(new Set(['19:00-20:00', '18:00-19:00']));
    for (const [index, reservation] of preview.reservations.entries()) {
      expect(ReservationSchema.safeParse(reservation).success).toBe(true);
      expect(reservation).toMatchObject({ responsable: 'María Pérez', tipoActividad: 'TALLER CCD', actividadRecurrente: 'Sí', fechaInicioRecurrencia: '2027-03-01', fechaFinRecurrencia: '2027-12-31', indiceEnSerie: index + 1, totalEnSerie: preview.reservations.length });
    }
    expect(preview.omittedHolidays.length).toBeGreaterThan(0);
    expect(preview.omittedHolidays.every(holiday => !preview.reservations.some(row => row.fecha === holiday.date))).toBe(true);
  });
  it('makes retries idempotent, including partial imports and archived sessions', async () => {
    const first = await build();
    const repeat = await build(first.reservations);
    expect(repeat.reservations).toHaveLength(0);
    expect(repeat.duplicates).toBe(first.reservations.length);
    const partial = await build(first.reservations.slice(0, 3).map(row => ({ ...row, estado: 'cancelada' })));
    expect(partial.duplicates).toBe(3);
    expect(partial.reservations).toHaveLength(first.reservations.length - 3);
    await expect(buildWorkshopImport(rows(), { 2: 'TATAMI' }, SPACES_LIST, first.reservations)).rejects.toThrow('otros datos o espacio');
  });
  it('detects equivalent sessions that predate this importer', async () => {
    const first = await build();
    expect((await build([{ ...first.reservations[0], id: 'legacy-session' }])).duplicates).toBe(1);
  });
  it('adds only December sessions when reimporting a series from the old default period', async () => {
    const prior = await buildWorkshopImport(rows(), { 2: 'SALA 2' }, SPACES_LIST, [], {}, {}, { start: '2027-03-01', end: '2027-11-30' });
    const extended = await build(prior.reservations);
    expect(extended.duplicates).toBe(prior.reservations.length);
    expect(extended.reservations.length).toBeGreaterThan(0);
    expect(extended.reservations.every(row => row.fecha.startsWith('2027-12-'))).toBe(true);
  });
  it('rejects missing or disabled spaces', async () => {
    await expect(buildWorkshopImport(rows(), {}, SPACES_LIST, [])).rejects.toThrow('espacio activo');
    await expect(buildWorkshopImport(rows(), { 2: 'SALA 2' }, SPACES_LIST.map(space => ({ ...space, activo: false })), [])).rejects.toThrow('espacio activo');
  });
  it('preserves every edited reservation option, individual dates and rooms through preview and retries', async () => {
    const initial = await build();
    const custom = initial.reservations.slice(0, 2).map((row, index) => ({ ...row,
      fecha: index === 0 ? '2028-03-01' : '2028-03-02', espacio: index === 0 ? 'SALA 2' : 'TATAMI',
      descripcion: 'Nombre editado', responsable: 'Otro profesor', tipoActividad: 'ENSAYO', tipoPrestamo: 'ENSAYO',
      telefonoContacto: '912345678', emailContacto: 'correo@example.com', cantidadParticipantes: 7,
      importante: 'Sí', comentarios: 'Detalles del taller', montaje: { tipo: 'circulo' as const, instrucciones: 'Siete sillas' },
      equipamientoSolicitado: [{ equipmentId: 'chair', equipmentName: 'Sillas', quantity: 7 }],
      fechaInicioRecurrencia: '2028-03-01', fechaFinRecurrencia: '2028-03-02', tipoRecurrencia: 'especificas', diasSemana: '',
    }));
    const edited = await buildWorkshopImport(rows(), {}, SPACES_LIST, [], { 2: custom });
    expect(edited.reservations).toHaveLength(2);
    expect(edited.omittedHolidays).toHaveLength(0);
    expect(edited.reservations[0]).toMatchObject({ ...custom[0], id: expect.any(String), totalEnSerie: 2, indiceEnSerie: 1 });
    expect((await buildWorkshopImport(rows(), {}, SPACES_LIST, edited.reservations, { 2: custom })).duplicates).toBe(2);
  });
  it('keeps names with different schedules separate and stable after row reordering', async () => {
    const parsed = parseWorkshopRows([header, ['Danza', 'LUN 10:00-11:00', '', 'Profesora'], ['Danza', 'MAR 10:00-11:00', '', 'Profesora']]);
    const first = await buildWorkshopImport(parsed, { 2: 'SALA 2', 3: 'SALA 2' }, SPACES_LIST, []);
    const reordered = await buildWorkshopImport([...parsed].reverse(), { 2: 'SALA 2', 3: 'SALA 2' }, SPACES_LIST, first.reservations);
    expect(new Set(first.reservations.map(row => row.serieRecurrente)).size).toBe(2);
    expect(first.reservations.at(-1)!.fecha).toBe('2027-12-28');
    const tuesdays = first.reservations.filter(row => row.serieRecurrente === first.reservations.at(-1)!.serieRecurrente).length;
    const omittedTuesdays = first.omittedHolidays.filter(holiday => new Date(`${holiday.date}T12:00:00Z`).getUTCDay() === 2).reduce((sum, holiday) => sum + holiday.sessions, 0);
    expect(tuesdays + omittedTuesdays).toBe(44);
    expect(reordered.reservations).toHaveLength(0);
    await expect(buildWorkshopImport([parsed[0], { ...parsed[0], row: 4 }], { 2: 'SALA 2', 4: 'SALA 2' }, SPACES_LIST, [])).rejects.toThrow('ya aparecen');
  });
});
