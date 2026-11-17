// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminInventory } from '../AdminInventory';
import { dataRequest } from '../../firebase/gateway';

vi.mock('../../firebase/gateway', () => ({ dataRequest: vi.fn() }));
afterEach(cleanup);

it('asks for confirmation and hides the selected place only after the server confirms', async () => {
  const request = vi.mocked(dataRequest);
  const storage = { id: 'storage', name: 'Bodega', generation: '' };
  request.mockImplementation(async path => {
    if (path.endsWith('/lugares')) return { locations: [storage] };
    if (path.endsWith('/articulos')) return { items: [{ id: 'chair', name: 'Sillas', quantity: 4 }] };
    throw new Error('Intenta nuevamente');
  });
  render(<AdminInventory />);
  await screen.findByRole('rowheader', { name: 'Sillas' });
  const removeButton = screen.getByRole('button', { name: 'Eliminar lugar' });
  fireEvent.click(removeButton);
  let dialog = screen.getByRole('alertdialog', { name: '¿Eliminar Bodega?' });
  expect(within(dialog).getByText(/Hay 1 artículo/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(request).not.toHaveBeenCalledWith('/api/inventario/eliminar-lugar', expect.anything());

  fireEvent.click(removeButton);
  dialog = screen.getByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar lugar' }));
  expect((await within(dialog).findByRole('alert')).textContent).toBe('Intenta nuevamente');
  expect(screen.getByRole('rowheader', { name: 'Sillas' })).toBeTruthy();

  request.mockResolvedValueOnce({ success: true });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar lugar' }));
  await screen.findByText('Lugar eliminado del inventario. Bodega quedó archivado.');
  expect(request).toHaveBeenLastCalledWith('/api/inventario/eliminar-lugar', { locationId: storage.id, generation: '' });
  expect(screen.queryByRole('rowheader', { name: 'Sillas' })).toBeNull();
});
