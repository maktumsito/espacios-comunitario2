// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReservationModal } from '../ReservationModal';
import { ReservationDetailModal } from '../ReservationDetailModal';
import type { Reservation } from '../../types';
vi.mock('../../utils/commitmentLetterPdf', async original => ({ ...(await original<any>()), isCommitmentLetterEligible: () => false, downloadCommitmentLetterPdf: vi.fn() }));
const source: Reservation = { id: 'source', fecha: '2026-10-06', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino Test', descripcion: 'Taller semanal', tipoActividad: 'Taller', actividadRecurrente: 'Sí', serieRecurrente: 'series', estado: 'activa', version: 1, googleEventId: 'original-calendar', equipamientoSolicitado: [{equipmentId:'chair',equipmentName:'Silla',quantity:10}] };
const user = { username: 'test', name: 'Test', role: 'Administrador' as const, initials: 'T', avatarColor: 'blue', canCreateReservations: true, canEditReservations: true };
beforeEach(() => { localStorage.clear(); HTMLElement.prototype.scrollTo = vi.fn(); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it('preserves both same-day sessions when editing only the name through the recurring form', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-06T15:00:00Z'));
  const first = { ...source, equipamientoSolicitado: [], indiceEnSerie: 1, totalEnSerie: 2 };
  const second = { ...first, id: 'second', espacio: 'SALA 3', horaInicio: '14:00', horaFin: '15:00', indiceEnSerie: 2, responsable: 'Otro responsable' };
  const save = vi.fn().mockResolvedValue(true);
  render(<ReservationModal isOpen onClose={vi.fn()} onSave={save} editingReservation={first} currentUser={user}
    allReservations={[first, second]} initialDate={first.fecha} initialSpace={first.espacio}
    initialStartTime={first.horaInicio} initialEndTime={first.horaFin} />);
  fireEvent.change(screen.getByLabelText(/Nombre de la Actividad/), { target: { value: 'Nombre actualizado' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const batch = save.mock.calls[0][4];
  expect(batch.updatedReservations).toHaveLength(2);
  expect(batch.updatedReservations[1]).toMatchObject({ id: second.id, horaInicio: '14:00', espacio: 'SALA 3', responsable: second.responsable, descripcion: 'Nombre actualizado', indiceEnSerie: 2 });
  expect(batch.addedIds).toEqual([]); expect(batch.deletedIds).toBeUndefined();
});
it('keeps unsaved recurring edits when configuration or live reservations refresh', () => {
  const p = { isOpen: true, onClose: vi.fn(), onSave: vi.fn(), editingReservation: source, currentUser: user,
    initialDate: source.fecha, initialSpace: source.espacio, initialStartTime: source.horaInicio, initialEndTime: source.horaFin };
  const { rerender } = render(<ReservationModal {...p} allReservations={[source]} availableSpaces={[]} />);
  fireEvent.change(screen.getByLabelText(/Nombre de la Actividad/), { target: { value: 'Borrador conservado' } });
  rerender(<ReservationModal {...p} allReservations={[{ ...source, version: 2 }, { ...source, id: 'future', fecha: '2026-10-13' }]} availableSpaces={[]} />);
  expect((screen.getByLabelText(/Nombre de la Actividad/) as HTMLInputElement).value).toBe('Borrador conservado');
});
function openReplacement(save = vi.fn().mockResolvedValue(true), close = vi.fn()) {
  render(<ReservationModal isOpen onClose={close} onSave={save} replacementSource={source}
    allReservations={[]} currentUser={user} initialDate={source.fecha} initialSpace={source.espacio}
    initialStartTime={source.horaInicio} initialEndTime={source.horaFin} initialResponsable={source.responsable} />);
  return { save, close };
}
function advanceToReview() {
  fireEvent.change(screen.getByLabelText(/Nombre de la Actividad/), { target: { value: 'Reunión excepcional' } });
  fireEvent.change(screen.getByLabelText('Motivo obligatorio'), { target: { value: 'Reunión de vecinos' } });
  fireEvent.click(screen.getByText('Siguiente: Espacio y Horario'));
  expect(document.getElementById('input-reserva-fecha')).toBeNull();
  expect(screen.getByText(/La fecha, el espacio y el horario se conservan/)).toBeTruthy();
  fireEvent.click(screen.getByText('Siguiente: Solicitante'));
  fireEvent.click(screen.getByText('Siguiente: Recursos'));
  fireEvent.click(screen.getByText('Siguiente: Resumen y Confirmación'));
}
it('uses the existing wizard, keeps the schedule fixed and confirms a linked pair without copying resources', async () => {
  const { save, close } = openReplacement(); advanceToReview();
  expect(screen.getByText(/Actividad original:/)).toBeTruthy();
  expect(screen.getByText(/Actividad nueva:/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const [replacement, _series, _dates, _whole, batch, override] = save.mock.calls[0];
  expect(replacement).toMatchObject({ fecha: source.fecha, espacio: source.espacio, horaInicio: source.horaInicio, horaFin: source.horaFin, responsable: source.responsable, descripcion: 'Reunión excepcional', reemplazaReservaId: source.id, actividadRecurrente: 'No', equipamientoSolicitado: [] });
  expect(replacement.googleEventId).toBeUndefined(); expect(replacement.cartaCompromisoAdjunta).toBeUndefined();
  expect(batch.updatedReservations[0]).toMatchObject({ id: source.id, estado: 'cancelada', reemplazadaPorReservaId: replacement.id });
  expect(override).toBe(false);
  await waitFor(() => expect(close).toHaveBeenCalled());
});
it('requires a reason and retains all entered data and the same replacement ID on retry', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue(true);
  const { close } = openReplacement(save); advanceToReview();
  fireEvent.change(screen.getByLabelText('Motivo obligatorio'), { target: { value: ' ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Motivo obligatorio'), { target: { value: 'Motivo conservado' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' }));
  await waitFor(() => expect(screen.getByText(/Sin conexión/)).toBeTruthy());
  expect(close).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Motivo obligatorio') as HTMLTextAreaElement).value).toBe('Motivo conservado');
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[0][0].id).toBe(save.mock.calls[1][0].id);
});
it('only exposes replacement for an active recurring session with both permissions', () => {
  const replace = vi.fn();
  const p = { isOpen: true, onClose: vi.fn(), onEdit: vi.fn(), onReplace: replace, reservation: source, currentUser: user };
  const { rerender } = render(<ReservationDetailModal {...p} />);
  fireEvent.click(screen.getByText('Reemplazar solo este día')); expect(replace).toHaveBeenCalledWith(source);
  rerender(<ReservationDetailModal {...p} currentUser={{ ...user, role: 'Coordinador', canCreateReservations: false }} />);
  expect(screen.queryByText('Reemplazar solo este día')).toBeNull();
  rerender(<ReservationDetailModal {...p} reservation={{ ...source, estado: 'cancelada' }} />);
  expect(screen.queryByText('Reemplazar solo este día')).toBeNull();
});
it('shows the suspension reason, opens its replacement and disables reactivation while occupied', () => {
  const related = vi.fn();
  const original = { ...source, estado: 'cancelada', reemplazadaPorReservaId: 'new', motivoReemplazo: 'Motivo' };
  const replacement = { ...source, id: 'new', serieRecurrente: undefined, actividadRecurrente: 'No', reemplazaReservaId: source.id };
  render(<ReservationDetailModal isOpen reservation={original} onClose={vi.fn()} onEdit={vi.fn()} onUpdateReservation={vi.fn()} onViewRelated={related} currentUser={user} allReservations={[original, replacement]} />);
  expect(screen.getByText('Suspendida por reemplazo')).toBeTruthy();
  expect((screen.getByText('Reactivar').closest('button') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Ver reemplazo')); expect(related).toHaveBeenCalledWith('new');
});
