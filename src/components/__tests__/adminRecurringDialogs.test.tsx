// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminRecurringView } from '../AdminRecurringView';
import type { Reservation } from '../../types';
vi.mock('../IndependentReservationGrouping', () => ({ IndependentReservationGrouping: () => null }));
afterEach(cleanup);
const rows: Reservation[] = ['2099-10-06', '2099-10-13'].map((fecha, index) => ({
  id: `session-${index}`, fecha, horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 2',
  responsable: 'Vecino', tipoActividad: 'Taller', descripcion: 'Taller semanal', actividadRecurrente: 'Sí', serieRecurrente: 'series', estado: 'activa',
}));
it('uses a managed confirmation and only deletes a series after confirmation', async () => {
  const remove = vi.fn().mockResolvedValue(undefined);
  render(<AdminRecurringView reservations={rows} spaces={[]} activityTypes={[]} onDeleteReservation={remove} />);
  fireEvent.click(screen.getByTitle('Eliminar todas las sesiones de la serie'));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTitle('Eliminar todas las sesiones de la serie'));
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar serie' }));
  await waitFor(() => expect(remove).toHaveBeenCalledWith('session-0', 'series'));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
});
