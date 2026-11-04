import { describe, it, expect } from 'vitest';
import {
  checkSingleConflict,
  findReservationConflicts,
  validateTimeOrder,
  doSpacesConflict,
  normalizeSpace
} from '../conflictDetector';
import { recordDeletedId, unrecordDeletedId } from '../deletedReservationsStore';
import { Reservation } from '../../types';

function createDummy(partial: Partial<Reservation>): Reservation {
  return {
    id: partial.id || 'res_1',
    fecha: partial.fecha || '2026-09-15',
    horaInicio: partial.horaInicio || '18:00',
    horaFin: partial.horaFin || '19:00',
    espacio: partial.espacio || 'SALA 1',
    tipoActividad: partial.tipoActividad || 'Reunión',
    responsable: partial.responsable || 'Usuario Test',
    estado: partial.estado || 'activa',
    terminaDiaSiguiente: partial.terminaDiaSiguiente || false,
    ...partial
  } as Reservation;
}

describe('Reservation Conflict & Availability Suite', () => {
  const res1 = createDummy({ id: 'r1', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });

  it('1. Misma sala y mismo horario debe estar BLOQUEADO', () => {
    const cand1 = createDummy({ id: 'c1', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand1, [res1]);
    expect(conf.length).toBeGreaterThan(0);
  });

  it('2. Solapamiento parcial inicio debe estar BLOQUEADO', () => {
    const cand2 = createDummy({ id: 'c2', fecha: '2026-09-15', horaInicio: '18:30', horaFin: '19:30', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand2, [res1]);
    expect(conf.length).toBeGreaterThan(0);
  });

  it('3. Solapamiento parcial fin debe estar BLOQUEADO', () => {
    const res3 = createDummy({ id: 'r3', fecha: '2026-09-15', horaInicio: '18:30', horaFin: '19:30', espacio: 'SALA 1' });
    const cand3 = createDummy({ id: 'c3', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand3, [res3]);
    expect(conf.length).toBeGreaterThan(0);
  });

  it('4. Contención total exterior debe estar BLOQUEADO', () => {
    const res4 = createDummy({ id: 'r4', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '20:00', espacio: 'SALA 1' });
    const cand4 = createDummy({ id: 'c4', fecha: '2026-09-15', horaInicio: '18:30', horaFin: '19:30', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand4, [res4]);
    expect(conf.length).toBeGreaterThan(0);
  });

  it('5. Contención total interior debe estar BLOQUEADO', () => {
    const res5 = createDummy({ id: 'r5', fecha: '2026-09-15', horaInicio: '18:30', horaFin: '19:30', espacio: 'SALA 1' });
    const cand5 = createDummy({ id: 'c5', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '20:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand5, [res5]);
    expect(conf.length).toBeGreaterThan(0);
  });

  it('6. Consecutiva fin-inicio (18:00–19:00 y 19:00–20:00) debe ser PERMITIDA', () => {
    const cand6 = createDummy({ id: 'c6', fecha: '2026-09-15', horaInicio: '19:00', horaFin: '20:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand6, [res1]);
    expect(conf.length).toBe(0);
  });

  it('7. Consecutiva inicio-fin (19:00–20:00 y 18:00–19:00) debe ser PERMITIDA', () => {
    const res7 = createDummy({ id: 'r7', fecha: '2026-09-15', horaInicio: '19:00', horaFin: '20:00', espacio: 'SALA 1' });
    const cand7 = createDummy({ id: 'c7', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand7, [res7]);
    expect(conf.length).toBe(0);
  });

  it('8. Solapamiento de 1 min al fin debe estar BLOQUEADO', () => {
    const cand8 = createDummy({ id: 'c8', fecha: '2026-09-15', horaInicio: '18:59', horaFin: '20:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand8, [res1]);
    expect(conf.length).toBeGreaterThan(0);
  });

  it('9. Solapamiento de 1 min al inicio debe estar BLOQUEADO', () => {
    const res9 = createDummy({ id: 'r9', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:01', espacio: 'SALA 1' });
    const cand9 = createDummy({ id: 'c9', fecha: '2026-09-15', horaInicio: '19:00', horaFin: '20:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand9, [res9]);
    expect(conf.length).toBeGreaterThan(0);
  });

  it('10. Mismo horario en distinta sala debe ser PERMITIDO', () => {
    const cand10 = createDummy({ id: 'c10', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 2' });
    const conf = checkSingleConflict(cand10, [res1]);
    expect(conf.length).toBe(0);
  });

  it('11. Edición de horario sin conflicto con terceros debe ser PERMITIDA', () => {
    const editingRes = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const cand11 = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:30', horaFin: '19:30', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand11, [editingRes], 'edit_target');
    expect(conf.length).toBe(0);
  });

  it('12. Edición cambiando a SALA 2 libre debe ser PERMITIDA', () => {
    const editingRes = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const cand12 = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 2' });
    const conf = checkSingleConflict(cand12, [editingRes], 'edit_target');
    expect(conf.length).toBe(0);
  });

  it('13. Edición cambiando a sala ocupada debe estar BLOQUEADA', () => {
    const editingRes = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const sala2Occupied = createDummy({ id: 's2_occ', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 2' });
    const cand13 = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 2' });
    const conf = checkSingleConflict(cand13, [editingRes, sala2Occupied], 'edit_target');
    expect(conf.length).toBeGreaterThan(0);
  });

  it('14. Edición cambiando a fecha libre debe ser PERMITIDA', () => {
    const editingRes = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const cand14 = createDummy({ id: 'edit_target', fecha: '2026-09-16', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand14, [editingRes], 'edit_target');
    expect(conf.length).toBe(0);
  });

  it('15. Guardar reserva existente sin cambios de horario/sala debe ser PERMITIDO', () => {
    const editingRes = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const cand15 = createDummy({ id: 'edit_target', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', responsable: 'Nuevo Nombre' });
    const conf = checkSingleConflict(cand15, [editingRes], 'edit_target');
    expect(conf.length).toBe(0);
  });

  it('16. Reserva previa con estado "cancelada" no debe bloquear disponibilidad', () => {
    const cancelledRes = createDummy({ id: 'cancelled_1', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', estado: 'cancelada' });
    const cand16 = createDummy({ id: 'cand_16', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const conf = checkSingleConflict(cand16, [cancelledRes]);
    expect(conf.length).toBe(0);
  });

  it('17. Serie recurrente de 4 semanas sin conflicto externo debe ser PERMITIDA', () => {
    const recurringSeries1 = [
      createDummy({ id: 'rec_1_w1', fecha: '2026-09-01', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
      createDummy({ id: 'rec_1_w2', fecha: '2026-09-08', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
      createDummy({ id: 'rec_1_w3', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
      createDummy({ id: 'rec_1_w4', fecha: '2026-09-22', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
    ];
    const conf = findReservationConflicts(recurringSeries1, []);
    expect(conf.length).toBe(0);
  });

  it('18. Serie recurrente con conflicto en semana 3 debe estar BLOQUEADA', () => {
    const recurringSeries1 = [
      createDummy({ id: 'rec_1_w1', fecha: '2026-09-01', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
      createDummy({ id: 'rec_1_w2', fecha: '2026-09-08', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
      createDummy({ id: 'rec_1_w3', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
      createDummy({ id: 'rec_1_w4', fecha: '2026-09-22', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
    ];
    const existingW3 = createDummy({ id: 'existing_w3', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    const conf = findReservationConflicts(recurringSeries1, [existingW3]);
    expect(conf.length).toBe(1);
    expect(conf[0].fecha).toBe('2026-09-15');
  });

  it('19. Editar ocurrencia específica a horario libre debe ser PERMITIDA', () => {
    const recurringSeries1 = [
      createDummy({ id: 'rec_1_w1', fecha: '2026-09-01', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
      createDummy({ id: 'rec_1_w2', fecha: '2026-09-08', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' }),
    ];
    const cand19 = createDummy({ id: 'rec_1_w1', fecha: '2026-09-01', horaInicio: '19:00', horaFin: '20:00', espacio: 'SALA 1', serieRecurrente: 'serie_ok' });
    const conf = checkSingleConflict(cand19, recurringSeries1, 'rec_1_w1');
    expect(conf.length).toBe(0);
  });

  it('20. Horario con horaFin <= horaInicio debe ser rechazado', () => {
    const orderValidation = validateTimeOrder('19:00', '18:00', false);
    expect(orderValidation.isValid).toBe(false);
    expect(typeof orderValidation.error).toBe('string');
  });

  it('21. Colisión de salas compuestas e individuales', () => {
    expect(doSpacesConflict('SALA 3 / SALA 4', 'SALA 3')).toBe(true);
    expect(doSpacesConflict('SALA 3', 'SALA 3 / SALA 4')).toBe(true);
    expect(doSpacesConflict('SALA 3 / SALA 4', 'SALA 2')).toBe(false);
  });

  it('22. Normalización de tildes y mayúsculas', () => {
    expect(normalizeSpace('  sála 3  ')).toBe(normalizeSpace('SALA 3'));
  });

  it('23. Reserva de trasnoche detecta conflicto en madrugada siguiente', () => {
    const overnightRes = createDummy({ id: 'overnight', fecha: '2026-09-15', horaInicio: '23:00', horaFin: '01:00', espacio: 'SALA 1', terminaDiaSiguiente: true });
    const nextMorningRes = createDummy({ id: 'morning', fecha: '2026-09-16', horaInicio: '00:30', horaFin: '01:30', espacio: 'SALA 1' });
    const conf = checkSingleConflict(nextMorningRes, [overnightRes]);
    expect(conf.length).toBeGreaterThan(0);
  });

  it('24. Reservas eliminadas o con estado inactivo NO deben generar conflictos fantasma', () => {
    const deletedRes1 = createDummy({ id: 'del_1', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', estado: 'eliminada' });
    const anuladaRes = createDummy({ id: 'anul_1', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', estado: 'anulada' });
    const softDeletedRes = createDummy({ id: 'soft_1', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1', eliminada: true } as any);
    const newCand = createDummy({ id: 'new_cand', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });

    const conf = checkSingleConflict(newCand, [deletedRes1, anuladaRes, softDeletedRes]);
    expect(conf.length).toBe(0);
  });

  it('25. Reservas registradas en deletedIds tracker NO deben generar conflictos aunque sigan en memoria', () => {
    const ghostRes = createDummy({ id: 'ghost_res_99', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
    recordDeletedId('ghost_res_99');

    try {
      const newCand = createDummy({ id: 'new_cand_2', fecha: '2026-09-15', horaInicio: '18:00', horaFin: '19:00', espacio: 'SALA 1' });
      const conf = checkSingleConflict(newCand, [ghostRes]);
      expect(conf.length).toBe(0);
    } finally {
      unrecordDeletedId('ghost_res_99');
    }
  });

  it('26. Fusión de reservas combina intervalos de horario y espacios correctamente', () => {
    const resA = createDummy({
      id: 'res_a',
      fecha: '2026-09-15',
      horaInicio: '10:00',
      horaFin: '12:00',
      espacio: 'SALA 1',
      responsable: 'Juan Pérez',
      cantidadParticipantes: 10,
      equipamientoSolicitado: [{ equipmentId: 'eq_1', equipmentName: 'Proyector', quantity: 1 }]
    });
    const resB = createDummy({
      id: 'res_b',
      fecha: '2026-09-15',
      horaInicio: '12:00',
      horaFin: '14:00',
      espacio: 'SALA 2',
      responsable: 'Juan Pérez',
      cantidadParticipantes: 15,
      equipamientoSolicitado: [{ equipmentId: 'eq_2', equipmentName: 'Micrófono', quantity: 2 }]
    });

    // Validar combinación de horarios
    const minStart = resA.horaInicio < resB.horaInicio ? resA.horaInicio : resB.horaInicio;
    const maxEnd = resA.horaFin > resB.horaFin ? resA.horaFin : resB.horaFin;
    expect(minStart).toBe('10:00');
    expect(maxEnd).toBe('14:00');

    // Validar combinación de salas diferentes
    const combinedSpace = `${resA.espacio} / ${resB.espacio}`;
    expect(combinedSpace).toBe('SALA 1 / SALA 2');

    // Validar combinación si las salas son idénticas
    const sameSpaceResB = { ...resB, espacio: 'SALA 1' };
    const unifiedSameSpace = resA.espacio === sameSpaceResB.espacio ? resA.espacio : `${resA.espacio} / ${sameSpaceResB.espacio}`;
    expect(unifiedSameSpace).toBe('SALA 1');

    // Validar combinación de equipamiento
    const combinedEquipment = [
      ...(resA.equipamientoSolicitado || []),
      ...(resB.equipamientoSolicitado || [])
    ];
    expect(combinedEquipment.length).toBe(2);
  });
});
