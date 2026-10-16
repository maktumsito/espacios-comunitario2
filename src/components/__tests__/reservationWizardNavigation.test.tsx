// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReservationModal } from '../ReservationModal';
import type { Reservation } from '../../types';

vi.mock('../../utils/commitmentLetterPdf', async original => ({
  ...await original<typeof import('../../utils/commitmentLetterPdf')>(),
  isCommitmentLetterEligible: () => false,
  downloadCommitmentLetterPdf: vi.fn(),
}));

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('changing the main reservation space', () => {
  const source: Reservation = {
    id: 'space-change', fecha: '2026-10-14', horaInicio: '10:00', horaFin: '11:00',
    espacio: 'SALA 2', responsable: 'Vecino de prueba', descripcion: 'Taller comunitario',
    tipoActividad: 'TALLER CCD', actividadRecurrente: 'No', estado: 'activa', version: 3,
  };

  it.each(['single', 'specific', 'pattern'] as const)('saves the selected main space in %s mode', async mode => {
    const onSave = vi.fn().mockResolvedValue(true);
    const editing: Reservation = mode === 'single' ? source : {
      ...source, actividadRecurrente: 'Sí', serieRecurrente: 'space-series',
      tipoRecurrencia: mode === 'specific' ? 'especificas' : 'semanal',
      diasSemana: 'mie', fechaInicioRecurrencia: source.fecha, fechaFinRecurrencia: '2026-10-21',
    };
    const later = { ...editing, id: 'later-space-change', fecha: '2026-10-21', horaInicio: '12:00', horaFin: '13:00' };
    openForm({ editingReservation: editing, allReservations: mode === 'single' ? [editing] : [editing, later], onSave });
    fireEvent.change(screen.getByRole('combobox', { name: 'Espacio Requerido' }), { target: { value: 'SALA 3' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' })); });
    expect(onSave).toHaveBeenCalledOnce();
    const batch = onSave.mock.calls[0][4];
    expect(batch.updatedReservations).toHaveLength(mode === 'single' ? 1 : 2);
    expect(batch.updatedReservations.every((row: Reservation) => row.espacio === 'SALA 3')).toBe(true);
    expect(batch.updatedReservations[0]).toMatchObject({ id: source.id, version: source.version, horaInicio: '10:00' });
    if (mode !== 'single') expect(batch.updatedReservations[1]).toMatchObject({ id: later.id, horaInicio: '12:00', horaFin: '13:00' });
  });

  it('keeps the second room and its schedule when changing the primary room', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const editing: Reservation = { ...source, actividadRecurrente: 'Sí', serieRecurrente: 'space-series', tipoRecurrencia: 'especificas' };
    const second = { ...editing, id: 'second-room', espacio: 'TATAMI', horaInicio: '14:00', horaFin: '15:00' };
    const later = { ...editing, id: 'later-room', fecha: '2026-10-21' };
    openForm({ editingReservation: editing, allReservations: [editing, second, later], onSave });
    fireEvent.change(screen.getByRole('combobox', { name: 'Espacio Requerido' }), { target: { value: 'SALA 3' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' })); });
    expect(onSave).toHaveBeenCalledOnce();
    const batch = onSave.mock.calls[0][4];
    expect(batch.updatedReservations).toHaveLength(3);
    expect(batch.updatedReservations.find((row: Reservation) => row.id === second.id)).toMatchObject({ espacio: 'TATAMI', horaInicio: '14:00', horaFin: '15:00' });
    expect(batch.updatedReservations.filter((row: Reservation) => row.id !== second.id).every((row: Reservation) => row.espacio === 'SALA 3')).toBe(true);
    expect(batch.addedIds).toEqual([]);
    expect(batch.deletedIds).toBeUndefined();
  });

  it('checks conflicts in the new primary room before confirming the change', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const editing: Reservation = { ...source, actividadRecurrente: 'Sí', serieRecurrente: 'space-series', tipoRecurrencia: 'especificas' };
    const later = { ...editing, id: 'later-room', fecha: '2026-10-21', horaInicio: '12:00', horaFin: '13:00' };
    const occupied = { ...source, id: 'occupied-room', espacio: 'SALA 3', responsable: 'Otro vecino' };
    openForm({ editingReservation: editing, allReservations: [editing, later, occupied], onSave });
    fireEvent.change(screen.getByRole('combobox', { name: 'Espacio Requerido' }), { target: { value: 'SALA 3' } });
    const button = screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' }) as HTMLButtonElement;
    await act(async () => { fireEvent.click(button); });
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Alerta de Topamiento Detectado' })).toBeTruthy();
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function openForm(overrides: Partial<ComponentProps<typeof ReservationModal>> = {}) {
  return render(<ReservationModal
    isOpen onClose={vi.fn()} onSave={vi.fn()} allReservations={[]}
    initialDate="2026-10-14" initialSpace="SALA 2"
    initialStartTime="10:00" initialEndTime="11:00" initialResponsable="Vecino de prueba"
    currentUser={{ username: 'test', name: 'Test', role: 'Administrador', initials: 'T', avatarColor: 'blue', canCreateReservations: true, canEditReservations: true }}
    {...overrides}
  />);
}

function selectStep(step: number) {
  fireEvent.click(document.getElementById(`wizard-step-tab-${step}`)!);
}

function fillActivity() {
  fireEvent.change(screen.getByLabelText(/Nombre de la Actividad/), { target: { value: 'Taller comunitario' } });
}

function expectStep(step: number) {
  expect(document.getElementById(`wizard-step-tab-${step}`)!.className).toContain('bg-blue-600');
}

describe('reservation wizard navigation', () => {
  it.each([2, 3, 4, 5])('requires an activity before selecting step %i and preserves the current step', step => {
    openForm({ initialEndTime: '09:00', initialResponsable: '' });
    selectStep(step);
    expectStep(1);
    expect(screen.getByText(/Por favor ingresa el nombre de la actividad/)).toBeTruthy();
    expect(screen.queryByText(/Por favor ingresa el nombre de la persona/)).toBeNull();
    expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
  });

  it.each([3, 4, 5])('requires a valid schedule before selecting step %i', step => {
    openForm({ initialEndTime: '09:00', initialResponsable: '' });
    fillActivity();
    selectStep(step);
    expectStep(1);
    expect(screen.getByText(/La hora de término .* debe ser posterior/)).toBeTruthy();
    expect(screen.queryByText(/Por favor ingresa el nombre de la actividad/)).toBeNull();
    expect(screen.queryByText(/Por favor ingresa el nombre de la persona/)).toBeNull();
    expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    selectStep(2);
    expectStep(2);
  });

  it.each([4, 5])('requires an applicant before selecting step %i', step => {
    openForm({ initialResponsable: '' });
    fillActivity();
    selectStep(step);
    expectStep(1);
    expect(screen.getByText(/Por favor ingresa el nombre de la persona u organización/)).toBeTruthy();
    expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    selectStep(3);
    expectStep(3);
  });

  it.each([2, 3, 4, 5])('opens step %i directly with valid prerequisites and scrolls once', step => {
    openForm();
    fillActivity();
    selectStep(step);
    expectStep(step);
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, behavior: 'smooth' });
    if (step === 5) expect((screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('returns freely to activity and preserves the draft while switching form modes', () => {
    openForm();
    fillActivity();
    selectStep(5);
    selectStep(1);
    expectStep(1);
    expect((screen.getByLabelText(/Nombre de la Actividad/) as HTMLInputElement).value).toBe('Taller comunitario');
    fireEvent.click(document.getElementById('toggle-wizard-mode-btn')!);
    expect((screen.getByLabelText(/Responsable \/ Solicitante/) as HTMLInputElement).value).toBe('Vecino de prueba');
    fireEvent.click(document.getElementById('toggle-wizard-mode-btn')!);
    expectStep(1);
    selectStep(5);
    expectStep(5);
  });

  it('blocks review when an entered contact is invalid', () => {
    openForm({ initialEmail: 'correo-invalido' });
    fillActivity();
    selectStep(5);
    expectStep(1);
    expect(screen.getByText(/Correo electrónico inválido/)).toBeTruthy();
    expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
  });
});
