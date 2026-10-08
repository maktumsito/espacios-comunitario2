// @vitest-environment jsdom
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReservationModal } from '../ReservationModal';

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
