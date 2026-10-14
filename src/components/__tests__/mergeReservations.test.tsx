// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MergeReservationsModal } from '../MergeReservationsModal';
import type { Reservation } from '../../types';

const base: Reservation = { id: 'base', fecha: '2026-10-14', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2', responsable: 'Vecino', tipoActividad: 'Base', descripcion: '', actividadRecurrente: 'No', estado: 'activa' };
const early = { ...base, id: 'early', tipoActividad: 'Temprana', horaInicio: '09:00', horaFin: '10:00', cantidadParticipantes: 20 };
const late = { ...base, id: 'late', tipoActividad: 'Tardía', horaInicio: '11:00', horaFin: '13:00', espacio: 'SALA 3', cantidadParticipantes: 40 };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
afterEach(cleanup);

it('selects multiple companions, previews the full result and submits every selected ID once', async () => {
  const onConfirmMerge = vi.fn().mockResolvedValue(true), onClose = vi.fn();
  render(<MergeReservationsModal isOpen onClose={onClose} targetReservation={base} allReservations={[base, early, late]} onConfirmMerge={onConfirmMerge} />);
  expect((screen.getByRole('button', { name: 'Confirmar y Juntar Reservas' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Temprana/ }));
  fireEvent.click(screen.getByRole('button', { name: /Tardía/ }));
  expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2);
  expect(screen.getByText('09:00 – 13:00')).toBeTruthy();
  expect(screen.getByText('Hasta 40 personas')).toBeTruthy();
  expect(screen.getByText(/las 3 reservas se combinarán/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Juntar 3 Reservas' }));
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  expect(onConfirmMerge).toHaveBeenCalledExactlyOnceWith('base', ['early', 'late']);
});

it('keeps selections while searching and allows deselection before confirming', async () => {
  const onConfirmMerge = vi.fn().mockResolvedValue(false);
  const extras = Array.from({ length: 4 }, (_, i) => ({ ...base, id: `extra-${i}`, tipoActividad: `Extra ${i}` }));
  render(<MergeReservationsModal isOpen onClose={vi.fn()} targetReservation={base} allReservations={[base, early, late, ...extras]} onConfirmMerge={onConfirmMerge} />);
  fireEvent.click(screen.getByRole('button', { name: /Temprana/ }));
  const search = screen.getByPlaceholderText('Filtrar por actividad, solicitante o espacio...');
  fireEvent.change(search, { target: { value: 'tardia' } });
  fireEvent.click(screen.getByRole('button', { name: /Tardía/ }));
  expect(screen.getByText(/2 reservas adicionales seleccionadas/)).toBeTruthy();
  fireEvent.change(search, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: /Temprana/ }));
  expect(screen.getByText('10:00 – 13:00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Juntar 2 Reservas' }));
  await waitFor(() => expect(onConfirmMerge).toHaveBeenCalledExactlyOnceWith('base', ['late']));
});

it('prevents repeat submits and closing while confirmation is pending, retaining selections on failure', async () => {
  let finish!: (ok: boolean) => void;
  const onConfirmMerge = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; })), onClose = vi.fn();
  render(<MergeReservationsModal isOpen onClose={onClose} targetReservation={base} allReservations={[base, early, late]} onConfirmMerge={onConfirmMerge} />);
  fireEvent.click(screen.getByRole('button', { name: /Temprana/ }));
  fireEvent.click(screen.getByRole('button', { name: /Tardía/ }));
  const confirm = screen.getByRole('button', { name: 'Confirmar y Juntar 3 Reservas' });
  fireEvent.click(confirm); fireEvent.click(confirm);
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar ventana' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onConfirmMerge).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => { finish(false); });
  expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(2);
  expect((screen.getByRole('button', { name: 'Confirmar y Juntar 3 Reservas' }) as HTMLButtonElement).disabled).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
});
