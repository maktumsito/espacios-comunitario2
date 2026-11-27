// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CommitmentLetterCard } from '../CommitmentLetterCard';
const fetchById = vi.hoisted(() => vi.fn());
vi.mock('../../services/reservationService', () => ({ fetchReservationById: fetchById }));
vi.mock('../DocumentViewerModal', () => ({ DocumentViewerModal: ({ attachment }: any) => <div data-testid="document">{attachment.dataUrl}</div> }));
vi.mock('../../utils/commitmentLetterPdf', () => ({ downloadCommitmentLetterPdf: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
const letter = { name: 'carta.pdf', type: 'application/pdf', size: 600, dataUrl: '', uploadedAt: '2026-11-01' };
it('fetches the full letter when opening a lightweight reservation and reuses it for a download', async () => {
  fetchById.mockResolvedValue({ cartaCompromisoAdjunta: { ...letter, dataUrl: 'data:application/pdf;base64,YWJj' } });
  render(<CommitmentLetterCard reservation={{ id: 'one', cartaCompromisoAdjunta: letter }} />);
  expect(fetchById).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Consultar Carta' }));
  expect((await screen.findByTestId('document')).textContent).toBe('data:application/pdf;base64,YWJj');
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', { name: 'Descargar archivo' }));
  await waitFor(() => expect(click).toHaveBeenCalledOnce());
  expect(fetchById).toHaveBeenCalledExactlyOnceWith('one');
});
it('keeps the viewer closed and displays a recoverable error when the remote file changed', async () => {
  fetchById.mockResolvedValue({ cartaCompromisoAdjunta: { ...letter, uploadedAt: '2026-11-02', dataUrl: 'data:application/pdf;base64,YWJj' } });
  render(<CommitmentLetterCard reservation={{ id: 'one', cartaCompromisoAdjunta: letter }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Consultar Carta' }));
  await waitFor(() => expect(screen.getByText(/La carta cambió/)).toBeTruthy());
  expect(screen.queryByTestId('document')).toBeNull();
  expect((screen.getByRole('button', { name: 'Consultar Carta' }) as HTMLButtonElement).disabled).toBe(false);
});
