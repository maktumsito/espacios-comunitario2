import { describe, expect, it } from 'vitest';
import type { DistributionRequest, DistributionSnapshot, Reservation, SpaceInfo } from '../../types';
import { detectDistributionCriteria, newDistributionRequest, planRoomDistribution } from '../roomDistribution';
import { findEquipmentShortage } from '../equipmentAllocation';

const fecha = '2099-10-06';
const room = (name: string, capacity?: number): SpaceInfo => ({ id: name, name, capacity, description: 'Sala para talleres', category: 'Salas de Clases', iconName: 'Users', color: '#64748b' });
const spaces = [room('SALA 2', 20), room('SALA 3', 30)];
const equipment = [{ id: 'projector', name: 'Proyector', category: 'Audiovisual', totalQuantity: 1 }];
const request = (id: string, extra: Partial<DistributionRequest> = {}): DistributionRequest => ({ ...newDistributionRequest(id), descripcion: 'Taller práctico', responsable: 'Equipo comunitario', cantidadParticipantes: 15, fixedTime: true, ...extra });
const snapshot = (extra: Partial<DistributionSnapshot> = {}): DistributionSnapshot => ({ fecha, loadedAt: new Date().toISOString(), spaces, equipment, reservations: [], blocks: [], ...extra });
const booking = (id: string, extra: Partial<Reservation> = {}): Reservation => ({ id, fecha, espacio: 'SALA 2', horaInicio: '10:00', horaFin: '11:00', descripcion: 'Taller', responsable: 'Equipo comunitario', tipoActividad: 'TALLER CCD', actividadRecurrente: 'No', estado: 'activa', ...extra });
const resource = [{ equipmentId: 'projector', equipmentName: 'Proyector', quantity: 1 }];

describe('room distribution', () => {
  it('places simultaneous activities in separate rooms and prefers a suitable smaller capacity', () => {
    const single = planRoomDistribution([request('a')], snapshot());
    expect(single.proposals[0].reservation.espacio).toBe('SALA 2');
    const result = planRoomDistribution([request('a'), request('b')], snapshot());
    expect(result.unresolved).toEqual([]);
    expect(new Set(result.proposals.map(p => p.reservation.espacio)).size).toBe(2);
  });
  it('moves flexible activities around fixed bookings and permits adjacent intervals', () => {
    const result = planRoomDistribution([request('a', { fixedTime: false, startTime: '10:00', endTime: '12:00', allowedSpaces: ['SALA 2'] })], snapshot({ reservations: [booking('occupied')] }));
    expect(result.proposals[0].reservation).toMatchObject({ horaInicio: '11:00', horaFin: '12:00' });
  });
  it('excludes blocked and compound rooms and ignores cancellations', () => {
    expect(planRoomDistribution([request('a')], snapshot({ reservations: [booking('compound', { espacio: 'SALA 2 / SALA 3' })] })).unresolved).toHaveLength(1);
    expect(planRoomDistribution([request('a')], snapshot({ reservations: [booking('cancelled', { estado: 'cancelada', espacio: 'SALA 2 / SALA 3' })] })).unresolved).toEqual([]);
    const blocked = planRoomDistribution([request('a', { allowedSpaces: ['SALA 2'] })], snapshot({ blocks: [{ id: 'maintenance', espacio: 'SALA 2', fechaInicio: fecha, fechaFin: fecha, activo: true, todoElDia: true, motivo: 'Obras' } as any] }));
    expect(blocked.unresolved[0].reason).toMatch(/mantenimiento/);
  });
  it('honors the previous day of an overnight reservation', () => {
    const result = planRoomDistribution([request('a', { startTime: '08:30', endTime: '09:00', allowedSpaces: ['SALA 2'] })], snapshot({ reservations: [booking('overnight', { fecha: '2099-10-05', horaInicio: '23:00', horaFin: '09:00', terminaDiaSiguiente: true })] }));
    expect(result.proposals).toHaveLength(0);
  });
  it('allows a jointly valid swap and preserves recurring links, contacts and documents', () => {
    const a = booking('a', { version: 4, serieRecurrente: 'series', recurrenteId: 'series', indiceEnSerie: 2, emailContacto: 'equipo@example.cl', cartaCompromisoAdjunta: { name: 'carta.pdf' } as any });
    const b = booking('b', { espacio: 'SALA 3', version: 2 });
    const next = booking('next', { fecha: '2099-10-13', serieRecurrente: 'series' });
    const result = planRoomDistribution([request('a', { source: a, allowedSpaces: ['SALA 3'] }), request('b', { source: b, allowedSpaces: ['SALA 2'] })], snapshot({ reservations: [a, b, next] }));
    expect(result.unresolved).toEqual([]);
    expect(result.proposals[0].reservation).toMatchObject({ espacio: 'SALA 3', serieRecurrente: 'series', indiceEnSerie: 2, emailContacto: 'equipo@example.cl', version: 4, cartaCompromisoAdjunta: { name: 'carta.pdf' } });
    expect(next.espacio).toBe('SALA 2');
  });
  it('never claims that an unassigned existing activity has released its original room', () => {
    const a = booking('a');
    const result = planRoomDistribution([request('a', { source: a, allowedSpaces: ['NO EXISTE'] }), request('b', { allowedSpaces: ['SALA 2'] })], snapshot({ reservations: [a] }));
    expect(result.proposals).toHaveLength(0);
  });
  it('excludes insufficient capacities but explains an unknown capacity', () => {
    expect(planRoomDistribution([request('a', { cantidadParticipantes: 40 })], snapshot()).unresolved).toHaveLength(1);
    const result = planRoomDistribution([request('a', { cantidadParticipantes: 40 })], snapshot({ spaces: [room('SALA NUEVA')] }));
    expect(result.proposals[0].reasons.join(' ')).toMatch(/Aforo sin registrar/);
  });
  it('checks resources across the final agenda and searches a later slot when necessary', () => {
    const result = planRoomDistribution([request('a', { equipment: resource }), request('b', { equipment: resource, fixedTime: false, startTime: '10:00', endTime: '12:00' })], snapshot());
    expect(result.unresolved).toEqual([]);
    expect(result.proposals[1].reservation.horaInicio).toBe('11:00');
    const impossible = planRoomDistribution([request('a', { equipment: resource }), request('b', { equipment: resource })], snapshot());
    expect(impossible.unresolved).toHaveLength(1);
  });
  it('normalizes accents and supports all setup styles without inferring room dimensions', () => {
    expect(detectDistributionCriteria('Capacitación con presentación').setup).toBe('auditorio');
    expect(detectDistributionCriteria('Clases de inglés').setup).toBe('aula');
    expect(detectDistributionCriteria('DANZA').setup).toBe('despejado');
    for (const montaje of ['auditorio', 'aula', 'u', 'circulo', 'mesas', 'despejado'] as const) {
      expect(planRoomDistribution([request(montaje, { montaje })], snapshot()).proposals[0].reservation.montaje?.tipo).toBe(montaje);
    }
  });
  it('rejects malformed inputs and enforces the activity and search limits without claiming impossibility', () => {
    expect(planRoomDistribution([request('a', { cantidadParticipantes: -1 })], snapshot()).proposals).toEqual([]);
    expect(planRoomDistribution(Array.from({ length: 13 }, (_, i) => request(`${i}`)), snapshot()).unresolved[0].reason).toMatch(/12/);
    const result = planRoomDistribution([request('a'), request('b')], snapshot(), 1);
    expect(result.searchLimitReached).toBe(true);
    expect(result.unresolved[0].reason).toMatch(/puede existir/);
  });
});

describe('joint equipment inventory', () => {
  it('does not sum disjoint users of a resource across a long reservation', () => {
    const catalog = [{ ...equipment[0], totalQuantity: 2 }];
    const rows = [booking('long', { equipamientoSolicitado: resource, horaFin: '12:00' }), booking('first', { equipamientoSolicitado: resource }), booking('second', { equipamientoSolicitado: resource, horaInicio: '11:00', horaFin: '12:00' })];
    expect(findEquipmentShortage(rows, catalog, new Set(['long']))).toBeNull();
  });
  it('counts resources across midnight, duplicate requests and legacy aliases', () => {
    const rows = [booking('night', { fecha: '2099-10-05', horaInicio: '23:00', horaFin: '11:00', terminaDiaSiguiente: true, equipamientoSolicitado: resource }), booking('new', { equipamientoSolicitado: [{ ...resource[0], equipmentId: 'legacy' }] })];
    expect(findEquipmentShortage(rows, equipment, new Set(['new']))).toMatch(/insuficiente/);
    expect(findEquipmentShortage([booking('duplicate', { equipamientoSolicitado: [...resource, ...resource] })], equipment, new Set(['duplicate']))).toMatch(/insuficiente/);
  });
});
