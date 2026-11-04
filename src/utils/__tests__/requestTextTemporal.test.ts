import { describe, expect, it } from 'vitest';
import { extractRequestDates, extractRequestTime } from '../requestTextTemporal';

describe('fechas de solicitudes en español', () => {
  const dates = (text: string) => extractRequestDates(text, '2026-11-04', '2026-11-04');

  it.each([
    ['2026-11-20', ['2026-11-20']],
    ['20/11/26', ['2026-11-20']],
    ['20/11', ['2026-11-20']],
    ['20 noviembre', ['2026-11-20']],
    ['20 de noviembre de 2026', ['2026-11-20']],
    ['20 nov. 2026', ['2026-11-20']],
    ['5 de setiembre', ['2026-09-05']],
    ['mañana por la mañana', ['2026-11-05']],
    ['pasado mañana', ['2026-11-06']],
    ['hoy', ['2026-11-04']],
    ['este miércoles', ['2026-11-04']],
    ['próximo miércoles', ['2026-11-11']],
    ['el viernes', ['2026-11-06']],
    ['cada viernes', []],
    ['de 9 a 11 por la mañana', []],
    ['RUT 12.345.678-5', []],
    ['desde 20 de noviembre hasta 2026-12-10', ['2026-11-20', '2026-12-10']],
    ['del 10 al 30 de noviembre de 2026', ['2026-11-10', '2026-11-30']],
    ['los días 10, 17 y 24 de noviembre', ['2026-11-10', '2026-11-17', '2026-11-24']],
    ['de 18-20 horas', []],
  ])('interpreta %s', (text, expected) => {
    expect(dates(text).dates).toEqual(expected);
    expect(dates(text).warnings).toEqual([]);
  });

  it.each(['31/02/2026', '29/02/2026', '2026-04-31', '31 de noviembre', '20/13/2026'])('rechaza %s', text => {
    expect(dates(text).dates).toEqual([]);
    expect(dates(text).warnings).toHaveLength(1);
  });

  it('acepta el 29 de febrero en años bisiestos', () => {
    expect(dates('29/02/2028').dates).toEqual(['2028-02-29']);
  });

  it('usa el día actual para mañana aunque se seleccione otro mes en el calendario', () => {
    expect(extractRequestDates('mañana', '2026-12-20', '2026-11-04').dates).toEqual(['2026-11-05']);
  });
});

describe('horarios de solicitudes en español', () => {
  const time = (text: string) => extractRequestTime(text, '08:30', '09:30');
  it.each([
    ['de 18:30 a 20:00', '18:30', '20:00'],
    ['18:30 - 20:00', '18:30', '20:00'],
    ['de 6 a 8 pm', '18:00', '20:00'],
    ['de 6:30 p. m. a 8 p. m.', '18:30', '20:00'],
    ['de 11 a 1 pm', '11:00', '13:00'],
    ['de 9 am a 12 pm', '09:00', '12:00'],
    ['entre las 6 y las 8 de la tarde', '18:00', '20:00'],
    ['de 18.30 a 20.00 horas', '18:30', '20:00'],
    ['de 6 y media a 8 de la tarde', '18:30', '20:00'],
    ['a las 18 por 2 horas', '18:00', '20:00'],
    ['a las 9:15 durante 90 minutos', '09:15', '10:45'],
    ['a las 6 pm por 1,5 horas', '18:00', '19:30'],
    ['desde las 10:00', '10:00', '11:00'],
    ['el 2026-11-20 de 18 a 20', '18:00', '20:00'],
    ['el 20/11/2026 de 18 a 20', '18:00', '20:00'],
    ['de seis y media a ocho de la tarde', '18:30', '20:00'],
    ['de 18-20 horas', '18:00', '20:00'],
  ])('interpreta %s', (text, start, end) => {
    expect(time(text)).toMatchObject({ horaInicio: start, horaFin: end, detected: true, warnings: [] });
  });

  it.each(['2026-11-20', '20/11/2026', 'de 10 a 12 personas', 'necesito 20 sillas'])('no confunde números con horarios: %s', text => {
    expect(time(text)).toMatchObject({ horaInicio: '08:30', horaFin: '09:30', detected: false, warnings: [] });
  });

  it.each(['de 25:00 a 26:00', 'de 18:75 a 20:00', 'de 20 a 18', 'de 13 pm a 15 pm', 'a las 23 por 2 horas'])('advierte un horario inválido: %s', text => {
    expect(time(text).detected).toBe(false);
    expect(time(text).warnings).toHaveLength(1);
  });
});
