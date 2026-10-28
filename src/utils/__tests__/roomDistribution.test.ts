import { describe, expect, it } from 'vitest';
import type { DistributionRequest, DistributionSnapshot, Reservation, SpaceInfo } from '../../types';
import { analyzeRoomDistribution, buildVacateSpacesPlan, detectDistributionCriteria, newDistributionRequest, planRoomDistribution, validateDistributionRequestInput } from '../roomDistribution';
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
  it('keeps a complete active-only plan even when an inactive room is preferred', () => {
    const result = analyzeRoomDistribution([request('a', { preferredSpace: 'SALA 3' })], snapshot({ spaces: [spaces[0], { ...spaces[1], activo: false }] }));
    expect(result.proposals[0].reservation.espacio).toBe('SALA 2');
    expect(result.activationRecommendations).toEqual([]);
  });
  it('recommends activation only when it places additional activities and does not mutate the catalog', () => {
    const inactive = { ...spaces[1], activo: false };
    const data = snapshot({ spaces: [spaces[0], inactive] });
    const result = analyzeRoomDistribution([request('a'), request('b')], data);
    expect(result.unresolved).toEqual([]);
    expect(result.activationRecommendations).toHaveLength(1);
    expect(result.activationRecommendations![0]).toMatchObject({ spaceId: 'SALA 3', name: 'SALA 3' });
    expect(result.proposals.filter(p => p.requiresActivation)).toHaveLength(1);
    expect(inactive.activo).toBe(false);
  });
  it('excludes inactive rooms occupied or blocked for maintenance and still checks shared equipment', () => {
    const data = snapshot({ spaces: [{ ...spaces[0], activo: false }], reservations: [booking('occupied')] });
    expect(analyzeRoomDistribution([request('a')], data).proposals).toEqual([]);
    expect(analyzeRoomDistribution([request('a')], { ...data, reservations: [], blocks: [{ id: 'closed', espacio: 'SALA 2', fechaInicio: fecha, fechaFin: fecha, activo: true, todoElDia: true } as any] }).proposals).toEqual([]);
    const equipmentBusy = snapshot({ spaces: [{ ...spaces[0], activo: false }], reservations: [booking('resources', { espacio: 'OTRA SALA', equipamientoSolicitado: resource })] });
    expect(analyzeRoomDistribution([request('a', { equipment: resource })], equipmentBusy).proposals).toEqual([]);
  });
  it('minimizes distinct reactivated rooms before satisfying preferences and honors capacity', () => {
    const data = snapshot({ spaces: [{ ...spaces[0], capacity: 40, activo: false }, { ...spaces[1], capacity: 40, activo: false }] });
    const result = analyzeRoomDistribution([
      request('a', { cantidadParticipantes: 35, preferredSpace: 'SALA 2' }),
      request('b', { cantidadParticipantes: 35, preferredSpace: 'SALA 3', startTime: '11:00', endTime: '12:00' }),
    ], data);
    expect(result.unresolved).toEqual([]);
    expect(result.activationRecommendations).toHaveLength(1);
    expect(result.activationRecommendations![0].requestIds).toHaveLength(2);
    expect(analyzeRoomDistribution([request('large', { cantidadParticipantes: 50 })], data).proposals).toEqual([]);
  });
  it('shares the state budget between the active and expanded searches', () => {
    const result = analyzeRoomDistribution([request('a'), request('b')], snapshot({ spaces: [spaces[0], { ...spaces[1], activo: false }] }), 7);
    expect(result.exploredStates).toBeLessThanOrEqual(7);
    expect(result.searchLimitReached).toBe(true);
  });
  it('can recommend activation when automatically vacating an occupied room', () => {
    const data = snapshot({ spaces: [spaces[0], { ...spaces[1], activo: false }], reservations: [booking('move', { cantidadParticipantes: 15 })] });
    const plan = buildVacateSpacesPlan(data, { spacesToVacate: ['SALA 2'], startTime: '09:00', endTime: '12:00' });
    expect(plan.result.unresolved).toEqual([]);
    expect(plan.result.proposals[0].reservation.espacio).toBe('SALA 3');
    expect(plan.result.activationRecommendations![0].spaceId).toBe('SALA 3');
  });
  it('never proposes deactivated rooms', () => {
    const result = planRoomDistribution([request('a')], snapshot({ spaces: spaces.map(space => ({ ...space, activo: false })) }));
    expect(result.proposals).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
  });
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
  it('does not blame capacity when suitable rooms are occupied and a smaller room appears last in the catalog', () => {
    const catalogWithSmallLast = [...spaces, room('BOX 1', 8)];
    const occupied = [booking('occ-2', { espacio: 'SALA 2' }), booking('occ-3', { espacio: 'SALA 3' })];
    const result = planRoomDistribution([request('a', { cantidadParticipantes: 15 })], snapshot({ spaces: catalogWithSmallLast, reservations: occupied }));
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].reason).toMatch(/ocupadas/);
    expect(result.unresolved[0].reason).not.toMatch(/no tienen aforo suficiente/);
  });
  it('validates missing responsible and invalid flexible duration before proposing an uncommitable plan', () => {
    const missingResponsible = planRoomDistribution([request('a', { responsable: ' ' })], snapshot());
    expect(missingResponsible.proposals).toHaveLength(0);
    expect(missingResponsible.unresolved[0].reason).toMatch(/responsable/i);
    expect(validateDistributionRequestInput(request('flex', { fixedTime: false, startTime: '10:00', endTime: '11:00', durationMinutes: 90 }))).toMatch(/supera la franja/);
  });
  it('vacates selected rooms in a time window following the specified space order and cascade-relocates when needed', () => {
    const multiSpaces = [room('SALA 2', 20), room('SALA 3', 30), room('SALA 4', 20), room('SALA 6', 50)];
    const r1 = booking('r1', { espacio: 'SALA 2', horaInicio: '10:00', horaFin: '11:00', cantidadParticipantes: 18 });
    const r2 = booking('r2', { espacio: 'SALA 2', horaInicio: '16:00', horaFin: '17:00', cantidadParticipantes: 15 });
    // User wants to vacate SALA 2 between 09:00 and 12:00 and prefers SALA 6 over SALA 4/3
    const orderedPlan = buildVacateSpacesPlan(
      snapshot({ spaces: multiSpaces, reservations: [r1, r2] }),
      { spacesToVacate: ['SALA 2'], startTime: '09:00', endTime: '12:00', prioritySpaces: ['SALA 6', 'SALA 3'] }
    );
    expect(orderedPlan.displacedCount).toBe(1);
    expect(orderedPlan.result.unresolved).toEqual([]);
    expect(orderedPlan.result.proposals[0].reservation.espacio).toBe('SALA 6');

    // Cascade scenario: SALA 2 needs 25 people moved (only fits in SALA 3 cap 30),
    // while SALA 3 currently has a 10-person booking that can move to SALA 4 (cap 20).
    const bigInSala2 = booking('big', { espacio: 'SALA 2', horaInicio: '10:00', horaFin: '11:00', cantidadParticipantes: 25 });
    const smallInSala3 = booking('small', { espacio: 'SALA 3', horaInicio: '10:00', horaFin: '11:00', cantidadParticipantes: 10 });
    const cascadeSpaces = [room('SALA 2', 30), room('SALA 3', 30), room('SALA 4', 15)];
    const cascadePlan = buildVacateSpacesPlan(
      snapshot({ spaces: cascadeSpaces, reservations: [bigInSala2, smallInSala3] }),
      { spacesToVacate: ['SALA 2'], startTime: '09:30', endTime: '11:30', allowCascade: true }
    );
    expect(cascadePlan.result.unresolved).toEqual([]);
    expect(cascadePlan.cascadeCount).toBe(1);
    const byId = Object.fromEntries(cascadePlan.result.proposals.map(p => [p.requestId, p.reservation.espacio]));
    expect(byId.big).toBe('SALA 3');
    expect(byId.small).toBe('SALA 4');
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
    expect(detectDistributionCriteria('Ensayo de guitarra y coro').setup).toBe('circulo');
    expect(detectDistributionCriteria('Reunión Club Adulto Mayor CAM').setup).toBe('mesas');
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
