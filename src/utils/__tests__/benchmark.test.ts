import { describe, it, expect } from 'vitest';
import { Reservation } from '../../types';
import { findReservationConflicts, detectAllConflicts } from '../conflictDetector';
import { buildReservationDateIndex } from '../reservationIndex';
import { calculateReservationsHash } from '../../services/reservationService';

function generateMockReservations(count: number): Reservation[] {
  const spaces = ['GIMNASIO', 'MULTICANCHA', 'SALA 2', 'SALA 3', 'AUDITORIO'];
  const activities = ['Taller Municipal', 'Deportes', 'JJV', 'Préstamo'];
  const reservations: Reservation[] = [];

  for (let i = 0; i < count; i++) {
    const dayOffset = i % 90;
    const date = new Date(2026, 8, 1);
    date.setDate(date.getDate() + dayOffset);
    const dateStr = date.toISOString().split('T')[0];

    const hourStart = 8 + (i % 12);
    const hourEnd = hourStart + 1 + (i % 3);
    const horaInicio = `${hourStart.toString().padStart(2, '0')}:00`;
    const horaFin = `${Math.min(23, hourEnd).toString().padStart(2, '0')}:00`;

    reservations.push({
      id: `RSV_MOCK_${i.toString().padStart(6, '0')}`,
      fecha: dateStr,
      horaInicio,
      horaFin,
      espacio: spaces[i % spaces.length],
      tipoActividad: activities[i % activities.length],
      responsable: `Vecino Responsable ${i % 200}`,
      descripcion: `Actividad comunitaria de prueba número ${i}`,
      cantidadParticipantes: 10 + (i % 40),
      importante: i % 10 === 0 ? 'Sí' : 'No',
      actividadRecurrente: i % 3 === 0 ? 'Sí' : 'No',
      serieRecurrente: i % 3 === 0 ? `SERIE_${Math.floor(i / 10)}` : undefined,
      estado: i % 25 === 0 ? 'cancelada' : 'confirmada'
    });
  }

  return reservations;
}

describe('System Performance & Bottleneck Benchmark', () => {
  const dataset2500 = generateMockReservations(2500);

  it('measures buildReservationDateIndex execution speed', () => {
    const t0 = performance.now();
    for (let r = 0; r < 20; r++) {
      buildReservationDateIndex(dataset2500);
    }
    const t1 = performance.now();
    const avgMs = (t1 - t0) / 20;
    console.log(`[PERF] buildReservationDateIndex (2,500 reservations) avg: ${avgMs.toFixed(2)}ms`);
    expect(avgMs).toBeLessThan(50);
  });

  it('measures calculateReservationsHash execution speed', () => {
    const t0 = performance.now();
    for (let r = 0; r < 10; r++) {
      calculateReservationsHash(dataset2500);
    }
    const t1 = performance.now();
    const avgMs = (t1 - t0) / 10;
    console.log(`[PERF] calculateReservationsHash (2,500 reservations) avg: ${avgMs.toFixed(2)}ms`);
    expect(avgMs).toBeLessThan(100);
  });

  it('measures conflict detection for 50 recurring candidate batch against 2,500 bookings', () => {
    const candidateBatch: Reservation[] = [];
    for (let i = 0; i < 50; i++) {
      const date = new Date(2026, 8, 1);
      date.setDate(date.getDate() + i);
      candidateBatch.push({
        id: `NEW_CANDIDATE_${i}`,
        fecha: date.toISOString().split('T')[0],
        horaInicio: '10:00',
        horaFin: '12:00',
        espacio: 'Gimnasio',
        tipoActividad: 'Taller Municipal',
        responsable: 'Profesor Carlos',
        descripcion: 'Taller deportivo',
        actividadRecurrente: 'Sí',
        cantidadParticipantes: 20
      });
    }

    const t0 = performance.now();
    for (let r = 0; r < 50; r++) {
      findReservationConflicts(candidateBatch, dataset2500);
    }
    const t1 = performance.now();
    const avgMs = (t1 - t0) / 50;
    console.log(`[PERF] findReservationConflicts 50 candidates vs 2,500 bookings avg: ${avgMs.toFixed(2)}ms`);
    expect(avgMs).toBeLessThan(20);
  });

  it('measures detectAllConflicts across the full 2,500 reservations dataset', () => {
    const t0 = performance.now();
    for (let r = 0; r < 5; r++) {
      detectAllConflicts(dataset2500);
    }
    const t1 = performance.now();
    const avgMs = (t1 - t0) / 5;
    console.log(`[PERF] detectAllConflicts across 2,500 reservations avg: ${avgMs.toFixed(2)}ms`);
    expect(avgMs).toBeLessThan(100);
  });

  it('measures search filter execution speed comparison (unoptimized vs optimized)', () => {
    const searchQuery = 'taller municipal 12';

    // 1. Unoptimized (re-normalizing query on each of 2,500 items)
    const t0 = performance.now();
    for (let r = 0; r < 20; r++) {
      dataset2500.filter((item) => {
        const rawQ = searchQuery.trim();
        const normQ = rawQ.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const cleanRutQ = rawQ.replace(/[^0-9kK]/g, '').toLowerCase();

        const normDesc = (item.descripcion || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normResp = (item.responsable || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normEsp = (item.espacio || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normTipo = (item.tipoActividad || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normEmail = (item.emailContacto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const cleanRutR = (item.rut || '').replace(/[^0-9kK]/g, '').toLowerCase();
        const idMatch = (item.id || '').toLowerCase().includes(normQ);

        const matchText = normDesc.includes(normQ) || normResp.includes(normQ) || normEsp.includes(normQ) || normTipo.includes(normQ) || normEmail.includes(normQ) || idMatch;
        const matchRut = cleanRutQ.length >= 3 && cleanRutR.includes(cleanRutQ);
        return matchText || matchRut;
      });
    }
    const t1 = performance.now();
    const unoptimizedAvg = (t1 - t0) / 20;

    // 2. Optimized (query pre-normalized outside filter loop)
    const t2 = performance.now();
    for (let r = 0; r < 20; r++) {
      const rawSearch = searchQuery.trim();
      const normQ = rawSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const cleanRutQ = rawSearch.replace(/[^0-9kK]/g, '').toLowerCase();

      dataset2500.filter((item) => {
        const normDesc = (item.descripcion || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normResp = (item.responsable || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normEsp = (item.espacio || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normTipo = (item.tipoActividad || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normEmail = (item.emailContacto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const cleanRutR = (item.rut || '').replace(/[^0-9kK]/g, '').toLowerCase();
        const idMatch = (item.id || '').toLowerCase().includes(normQ);

        const matchText = normDesc.includes(normQ) || normResp.includes(normQ) || normEsp.includes(normQ) || normTipo.includes(normQ) || normEmail.includes(normQ) || idMatch;
        const matchRut = cleanRutQ.length >= 3 && cleanRutR.includes(cleanRutQ);
        return matchText || matchRut;
      });
    }
    const t3 = performance.now();
    const optimizedAvg = (t3 - t2) / 20;

    const improvementPct = ((unoptimizedAvg - optimizedAvg) / unoptimizedAvg) * 100;
    console.log(`[PERF] Search unoptimized: ${unoptimizedAvg.toFixed(2)}ms vs optimized: ${optimizedAvg.toFixed(2)}ms (${improvementPct.toFixed(1)}% improvement)`);
    expect(optimizedAvg).toBeLessThan(unoptimizedAvg);
  });
});
