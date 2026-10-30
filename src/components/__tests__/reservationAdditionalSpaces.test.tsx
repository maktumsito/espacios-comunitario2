// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReservationModal } from '../ReservationModal';
import type { Reservation, SpaceInfo } from '../../types';

vi.mock('../../utils/commitmentLetterPdf', async original => ({
  ...await original<typeof import('../../utils/commitmentLetterPdf')>(),
  isCommitmentLetterEligible: () => false,
  downloadCommitmentLetterPdf: vi.fn(),
}));

const spaces: SpaceInfo[] = ['SALA 2', 'SALA 3', 'TATAMI', 'GIMNASIO', 'SALA 6'].map(name => ({
  id: name, name, capacity: 70, category: 'Salas', iconName: 'Users', color: '#64748b', description: '',
}));
const user = { username: 'test', name: 'Test', role: 'Administrador' as const, initials: 'T', avatarColor: 'blue', canCreateReservations: true, canEditReservations: true };

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-08T15:00:00Z'));
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

function open(overrides: Partial<ComponentProps<typeof ReservationModal>> = {}) {
  const onSave = vi.fn().mockResolvedValue(true);
  render(<ReservationModal isOpen onClose={vi.fn()} onSave={onSave} allReservations={[]} availableSpaces={spaces}
    initialDate="2026-10-14" initialSpace="SALA 2" initialStartTime="10:00" initialEndTime="11:00"
    initialResponsable="Vecino de prueba" currentUser={user} {...overrides} />);
  return onSave;
}
function scheduleStep() {
  fireEvent.change(screen.getByLabelText(/Nombre de la Actividad/), { target: { value: 'Actividad con varios espacios' } });
  fireEvent.click(document.getElementById('wizard-step-tab-2')!);
}
function add(count: number) {
  for (let index = 0; index < count; index++) fireEvent.click(screen.getByRole('button', { name: 'Agregar otro espacio para esta actividad' }));
}

it('reviews and saves four independent spaces and hours on one date', async () => {
  const save = open(); scheduleStep(); add(3);
  fireEvent.click(document.getElementById('wizard-step-tab-5')!);
  expect(screen.getByText('4 Reservas para Registrar')).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' })); });
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][2]).toMatchObject([
    { espacio: 'SALA 2', horaInicio: '10:00', horaFin: '11:00' },
    { espacio: 'SALA 3', horaInicio: '11:00', horaFin: '11:30' },
    { espacio: 'TATAMI', horaInicio: '11:30', horaFin: '12:00' },
    { espacio: 'GIMNASIO', horaInicio: '12:00', horaFin: '12:30' },
  ]);
  expect(save.mock.calls[0][0]).toMatchObject({ totalEnSerie: 4, tipoRecurrencia: 'doble_espacio' });
});

it('removes an intermediate space without losing later space details and saves the draft', () => {
  open(); scheduleStep(); add(3);
  fireEvent.click(screen.getByRole('button', { name: 'Quitar espacio 3 para esta actividad' }));
  expect((screen.getByRole('combobox', { name: 'Espacio 3' }) as HTMLSelectElement).value).toBe('GIMNASIO');
  expect((screen.getByLabelText('Inicio del espacio 3') as HTMLInputElement).value).toBe('12:00');
  act(() => { window.dispatchEvent(new Event('beforeunload')); });
  expect(JSON.parse(localStorage.getItem('ccd_reservation_draft_create')!).additionalSpaces).toEqual([
    { espacio: 'GIMNASIO', horaInicio: '12:00', horaFin: '12:30' },
  ]);
});

it('blocks review for an invalid third-space schedule', () => {
  const save = open(); scheduleStep(); add(2);
  fireEvent.change(screen.getByLabelText('Término del espacio 3'), { target: { value: '10:00' } });
  fireEvent.click(document.getElementById('wizard-step-tab-5')!);
  expect(document.getElementById('wizard-step-tab-2')!.className).toContain('bg-blue-600');
  expect(save).not.toHaveBeenCalled();
});

it('detects a reservation conflict in the third space before review', () => {
  const occupied: Reservation = { id: 'occupied', fecha: '2026-10-14', espacio: 'TATAMI', horaInicio: '11:30', horaFin: '12:00', tipoActividad: 'Taller', descripcion: 'Ocupado', responsable: 'Otra persona', actividadRecurrente: 'No', estado: 'activa' };
  const save = open({ allReservations: [occupied] }); scheduleStep(); add(2);
  fireEvent.click(document.getElementById('wizard-step-tab-5')!);
  expect(document.getElementById('wizard-step-tab-2')!.className).toContain('bg-blue-600');
  expect(save).not.toHaveBeenCalled();
});

it('keeps daytime additional slots valid when the primary slot crosses midnight', async () => {
  const save = open({ initialStartTime: '18:00', initialEndTime: '19:00' }); scheduleStep();
  fireEvent.change(screen.getByLabelText('Hora de término de la reserva'), { target: { value: '01:00' } });
  fireEvent.click(screen.getByLabelText(/La actividad finaliza al día siguiente/));
  fireEvent.change(screen.getByPlaceholderText('Ingresa ccd2026'), { target: { value: 'ccd2026' } });
  add(2);
  fireEvent.click(document.getElementById('wizard-step-tab-5')!);
  expect(screen.getByText('3 Reservas para Registrar')).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' })); });
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0][2].map((slot: Reservation) => slot.terminaDiaSiguiente)).toEqual([true, false, false]);
});

it.each(['especificas', 'semanal'] as const)('loads all four spaces and adds a fifth while editing a %s series', async tipoRecurrencia => {
  const rows: Reservation[] = spaces.slice(0, 4).map((space, index) => ({
    id: `session-${index}`, fecha: '2026-10-14', espacio: space.name, horaInicio: `${10 + index}:00`, horaFin: `${11 + index}:00`,
    tipoActividad: 'TALLER CCD', descripcion: 'Taller con cuatro espacios', responsable: 'Vecino', actividadRecurrente: 'Sí', estado: 'activa',
    serieRecurrente: 'series', tipoRecurrencia, indiceEnSerie: index + 1, totalEnSerie: 4, diasSemana: 'mie',
  }));
  const save = open({ editingReservation: rows[0], allReservations: rows });
  const context = tipoRecurrencia === 'especificas' ? '14-10-2026' : 'Miércoles';
  fireEvent.click(screen.getByRole('button', { name: `Agregar otro espacio para ${context}` }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirmar y guardar reserva de espacio' })); });
  expect(save).toHaveBeenCalledOnce();
  const batch = save.mock.calls[0][4];
  expect(batch.updatedReservations).toHaveLength(5);
  for (const row of rows) expect(batch.updatedReservations.find((next: Reservation) => next.id === row.id)).toMatchObject({ espacio: row.espacio, horaInicio: row.horaInicio, horaFin: row.horaFin });
  expect(batch.updatedReservations[4]).toMatchObject({ espacio: 'SALA 6', horaInicio: '14:00', horaFin: '14:30' });
  expect(batch.deletedIds).toBeUndefined();
});
