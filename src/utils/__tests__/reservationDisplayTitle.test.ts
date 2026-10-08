import { describe, expect, it } from 'vitest';
import { formatDisplayTitle } from '../reservationVisuals';

describe('reservation display title', () => {
  it.each([
    ['taller de danza árabe', 'Taller De Danza Árabe'],
    ['TALLER DE DANZA ÁRABE', 'Taller De Danza Árabe'],
    ['TaLLeR CCD y música', 'Taller Ccd Y Música'],
    ['a', 'A'],
    ['NIÑOS Y ÁRBOLES', 'Niños Y Árboles'],
    ["ana-maría d'ávila", "Ana-María D'Ávila"],
    ['  sala 2 / gimnasio   ', 'Sala 2 / Gimnasio'],
    ['taller\tde\nyoga', 'Taller\tDe\nYoga'],
    ['👩‍🎨 reunión (áREA verde)', '👩‍🎨 Reunión (Área Verde)'],
    ['e\u0301l y ella', 'Él Y Ella'],
    ['123 / 08:30–10:00', '123 / 08:30–10:00'],
    ['𐐨𐐨', '𐐀𐐨'],
    ['', ''],
    ['  \n ', ''],
  ])('formats %j as %j', (input, expected) => {
    expect(formatDisplayTitle(input)).toBe(expected);
  });

  it('handles an absent title and produces stable output when applied again', () => {
    expect(formatDisplayTitle()).toBe('');
    const title = formatDisplayTitle('TALLER de ÑUÑOA');
    expect(formatDisplayTitle(title)).toBe(title);
  });
});
