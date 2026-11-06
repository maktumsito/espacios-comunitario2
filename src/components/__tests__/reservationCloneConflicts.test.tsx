// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReservationModal } from '../ReservationModal';
import { SPACES_LIST } from '../../data/spacesData';
import type { Reservation } from '../../types';

vi.mock('../../utils/commitmentLetterPdf', async original => ({
  ...await original<typeof import('../../utils/commitmentLetterPdf')>(),
  isCommitmentLetterEligible: () => false,
  downloadCommitmentLetterPdf: vi.fn(),
}));
const source: Reservation = { id: 'cam-source', fecha: '2026-11-11', horaInicio: '15:00', horaFin: '18:00',
  espacio: 'SALA 3', responsable: 'Sofia Cordero', tipoActividad: 'PRÉSTAMO', descripcion: 'CAM',
  actividadRecurrente: 'Sí', tipoRecurrencia: 'semanal', serieRecurrente: 'cam-wednesdays-2026',
  diasSemana: 'miercoles', fechaInicioRecurrencia: '2026-03-01', fechaFinRecurrencia: '2026-12-31', estado: 'activa' };
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T15:00:00Z'));
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
function open(extra: Reservation[] = []) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<ReservationModal isOpen isDuplicating editingReservation={source} onClose={vi.fn()} onSave={onSave}
    allReservations={[source, ...extra]} availableSpaces={SPACES_LIST}
    currentUser={{ username: 'test', name: 'Test', role: 'Administrador', initials: 'T', avatarColor: 'blue' }} />);
  fireEvent.click(screen.getByRole('button', { name: /Ver formulario completo/ }));
  return onSave;
}
function configure() {
  fireEvent.change(document.getElementById('input-reserva-fecha')!, { target: { value: '01/02/2027' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Modalidad de Reserva o Repetición' }), { target: { value: 'pattern' } });
  fireEvent.change(document.getElementById('input-hasta-que-fecha-se-repite')!, { target: { value: '31/12/2027' } });
}
it('clones CAM Wednesdays into February–December 2027 without retaining conflicts or dates from 2026', async () => {
  const save = open();
  configure();
  expect(screen.queryByRole('button', { name: /Solucionar Topamientos/ })).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' })); });
  expect(save).toHaveBeenCalledOnce();
  const slots = save.mock.calls[0][2];
  expect(slots[0].fecha).toBe('2027-02-03');
  expect(slots.at(-1).fecha).toBe('2027-12-29');
  expect(slots.every((slot: { fecha: string }) => slot.fecha >= '2027-02-01' && slot.fecha <= '2027-12-31' && new Date(`${slot.fecha}T12:00:00Z`).getUTCDay() === 3)).toBe(true);
});
it('ignores occupancy on a range boundary that is not a selected Wednesday', () => {
  open([{ ...source, id: 'occupied-monday', fecha: '2027-02-01' }]);
  configure();
  expect(screen.queryByRole('button', { name: /Solucionar Topamientos/ })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Modalidad de Reserva o Repetición' }), { target: { value: 'single' } });
  expect(screen.getByRole('button', { name: /Solucionar Topamientos/ })).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox', { name: 'Modalidad de Reserva o Repetición' }), { target: { value: 'pattern' } });
  expect(screen.queryByRole('button', { name: /Solucionar Topamientos/ })).toBeNull();
});
it('still detects a real overlapping Wednesday in the new series', () => {
  open([{ ...source, id: 'occupied-wednesday', fecha: '2027-02-03' }]);
  configure();
  fireEvent.click(screen.getByRole('button', { name: /Solucionar Topamientos/ }));
  expect(screen.getByText('Quedan 1 conflicto(s) sin resolver.')).toBeTruthy();
  expect(screen.queryByText('¡Todos los topamientos han sido resueltos!')).toBeNull();
});
it('replaces the original selected date when a single clone moves and becomes a specific-date booking', async () => {
  const save = open();
  fireEvent.change(document.getElementById('input-reserva-fecha')!, { target: { value: '03/02/2027' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Modalidad de Reserva o Repetición' }), { target: { value: 'specific' } });
  expect(screen.queryByRole('button', { name: /Solucionar Topamientos/ })).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' })); });
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][2].map((slot: { fecha: string }) => slot.fecha)).toEqual(['2027-02-03']);
});
it('clears conflicts when moving a single clone to an empty date, and restores them on returning', () => {
  open();
  expect(screen.getByRole('button', { name: /Solucionar Topamientos/ })).toBeTruthy();
  fireEvent.change(document.getElementById('input-reserva-fecha')!, { target: { value: '03/02/2027' } });
  expect(screen.queryByRole('button', { name: /Solucionar Topamientos/ })).toBeNull();
  fireEvent.change(document.getElementById('input-reserva-fecha')!, { target: { value: '11/11/2026' } });
  expect(screen.getByRole('button', { name: /Solucionar Topamientos/ })).toBeTruthy();
});
