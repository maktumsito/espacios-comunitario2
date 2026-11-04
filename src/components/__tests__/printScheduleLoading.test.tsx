// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrintScheduleModal } from '../PrintScheduleModal';
import { loadPdfLibraries } from '../../utils/loadPdfLibraries';
import { showPrintBlob } from '../../utils/printWindow';

vi.mock('../../utils/loadPdfLibraries', () => ({ loadPdfLibraries: vi.fn() }));
vi.mock('../../utils/printWindow', () => ({ showPrintBlob: vi.fn() }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('Print actions', () => {
  it('reserves the popup before awaiting libraries and falls back to complete HTML on failure', async () => {
    let fail!: (error: Error) => void;
    vi.mocked(loadPdfLibraries).mockReturnValue(new Promise((_resolve, reject) => { fail = reject; }));
    const popup = { closed: false, close: vi.fn(), addEventListener: vi.fn(), print: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PrintScheduleModal isOpen onClose={() => {}} reservations={[]} initialDate="2026-09-22" />);
    expect(loadPdfLibraries).not.toHaveBeenCalled();
    const print = screen.getAllByRole('button', { name: /^Imprimir$/i })[0];
    fireEvent.click(print);
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(showPrintBlob).not.toHaveBeenCalled();
    fail(new Error('offline'));
    await waitFor(() => expect(showPrintBlob).toHaveBeenCalled());
    expect(vi.mocked(showPrintBlob).mock.calls[0][1].type).toBe('text/html;charset=utf-8');
    expect(popup.close).not.toHaveBeenCalled();
  });

  it('uses native printing when popups are blocked without generating unused PDFs', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<PrintScheduleModal isOpen onClose={() => {}} reservations={[]} initialDate="2026-09-22" />);
    fireEvent.click(screen.getAllByRole('button', { name: /^Imprimir$/i })[0]);
    expect(print).toHaveBeenCalledOnce();
    expect(loadPdfLibraries).not.toHaveBeenCalled();
  });
});
