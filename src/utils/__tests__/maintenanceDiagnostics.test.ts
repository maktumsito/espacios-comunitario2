import { expect, it } from 'vitest';
import { findDuplicateCandidates, automaticBackupsToRotate } from '../maintenanceDiagnostics';
import type { Reservation } from '../../types';
const reservation = (id: string, changes: Partial<Reservation> = {}) => ({ id, fecha: '2026-10-24', espacio: 'SALA 2', horaInicio: '10:00', horaFin: '11:00', responsable: 'Claudia Muñoz', descripcion: 'Taller de acuarela', tipoActividad: 'Taller', estado: 'activa', ...changes } as Reservation);

it('distinguishes event duplicates from legitimate overlaps, cancelled events, series and overnight intervals', () => {
  const base = reservation('original');
  const candidates = findDuplicateCandidates([base, reservation('copy'), reservation('offset', {horaInicio:'10:30', horaFin:'11:30'}),
    reservation('other-event', {descripcion:'Encuentro de teatro'}), reservation('other-person', {responsable:'Mónica Leiva'}),
    reservation('cancelled', {estado:'cancelada'}), reservation('series', {serieRecurrente:'SER_other'}),
    reservation('overnight', {terminaDiaSiguiente:true}), base]);
  expect(candidates).toHaveLength(1);
  expect(candidates[0].reservations.map(row => row.id)).toEqual(['original', 'copy']);
});

it('preserves manual, protected and local-only backups while rotating only surplus automatic copies', () => {
  const rows = Array.from({length:8}, (_, index) => ({id:`auto-${index}`, timestamp:`2026-10-${String(index + 1).padStart(2,'0')}T12:00:00Z`, tipo:'automatica_15_dias'}));
  const result = automaticBackupsToRotate([...rows, { ...rows[0], id:'manual', tipo:'manual' },
    {...rows[0], id:'pinned', protected:true}, {...rows[0], id:'local', storageStatus:'local_only'}]);
  expect(result.map(row => row.id)).toEqual(['auto-2','auto-1','auto-0']);
  expect(() => automaticBackupsToRotate(rows, 0)).toThrow();
});
