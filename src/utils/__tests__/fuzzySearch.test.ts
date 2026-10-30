import { describe, it, expect } from 'vitest';
import { fuzzySearchReservations, fuzzySearchItems } from '../fuzzySearch';
import { Reservation } from '../../types';

describe('fuzzySearch', () => {
  const sampleReservations: Reservation[] = [
    {
      id: 'res-exact-1',
      espacio: 'Cancha Techada',
      fecha: '2026-09-21',
      horaInicio: '10:00',
      horaFin: '12:00',
      responsable: 'Carlos Muñoz',
      rut: '12.345.678-9',
      tipoActividad: 'Básquetbol',
      descripcion: 'Entrenamiento básquetbol juvenil',
      actividadRecurrente: 'No',
      estado: 'confirmada'
    },
    {
      id: 'res-fuzzy-2',
      espacio: 'Sala Multiuso',
      fecha: '2026-09-21',
      horaInicio: '14:00',
      horaFin: '16:00',
      responsable: 'Carla Nuñez',
      rut: '19.876.543-2',
      tipoActividad: 'Yoga',
      descripcion: 'Clase de yoga para adultos',
      actividadRecurrente: 'No',
      estado: 'confirmada'
    },
    {
      id: 'res-auditorio',
      espacio: 'Auditorio Principal',
      fecha: '2026-09-22',
      horaInicio: '18:00',
      horaFin: '20:00',
      responsable: 'Gonzalo González',
      rut: '11.222.333-4',
      tipoActividad: 'Taller de Teatro',
      descripcion: 'Ensayo general de obra comunitaria',
      actividadRecurrente: 'No',
      estado: 'confirmada'
    }
  ];

  it('prioritizes exact ID match at the top', () => {
    const results = fuzzySearchReservations(sampleReservations, 'res-exact-1');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('res-exact-1');
  });

  it('prioritizes exact RUT match at the top', () => {
    const results = fuzzySearchReservations(sampleReservations, '123456789');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].id).toBe('res-exact-1');
  });

  it('prioritizes exact name match over approximate matches', () => {
    const results = fuzzySearchReservations(sampleReservations, 'Carlos Muñoz');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].responsable).toBe('Carlos Muñoz');
  });

  it('allows typo-tolerant searches (e.g. "auditoro" -> Auditorio)', () => {
    const results = fuzzySearchReservations(sampleReservations, 'auditoro');
    expect(results.some((r) => r.espacio.includes('Auditorio'))).toBe(true);
  });

  it('fuzzySearchItems prioritizes exact items over fuzzy matches', () => {
    const items = [
      { id: '1', title: 'Ver Calendario Mensual' },
      { id: '2', title: 'Ver Cronograma Diario' },
      { id: '3', title: 'Calificaciones y Comentarios' }
    ];

    const results = fuzzySearchItems(items, 'Calendario', ['title']);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toBe('Ver Calendario Mensual');
  });

  it('skips expensive fuzzy fallback for short prefix queries under 3 characters', () => {
    const results = fuzzySearchReservations(sampleReservations, 'ca');
    // Finds Carlos and Carla by prefix, but doesn't do expensive typo searches
    expect(results.length).toBe(2);
    expect(results.map(r => r.id).sort()).toEqual(['res-exact-1', 'res-fuzzy-2']);
  });
});
