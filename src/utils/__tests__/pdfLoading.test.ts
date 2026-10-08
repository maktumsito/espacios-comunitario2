import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('jspdf');
  vi.doUnmock('jspdf-autotable');
  vi.resetModules();
});

describe('PDF loading boundary', () => {
  it('does not load PDF libraries for eligibility or metadata and shares concurrent loads', async () => {
    const pdf = vi.fn(() => ({ jsPDF: class {} }));
    const table = vi.fn(() => ({ default: vi.fn() }));
    vi.doMock('jspdf', pdf);
    vi.doMock('jspdf-autotable', table);
    const letter = await import('../commitmentLetterPdf');
    const daily = await import('../dailySchedulePdf');
    letter.isCommitmentLetterEligible('PRÉSTAMO');
    daily.getDailySchedulePdfFilename('2026-09-22');
    expect(pdf).not.toHaveBeenCalled();
    expect(table).not.toHaveBeenCalled();
    const { loadPdfLibraries } = await import('../loadPdfLibraries');
    const first = loadPdfLibraries();
    expect(loadPdfLibraries()).toBe(first);
    await first;
    expect(pdf).toHaveBeenCalledTimes(1);
    expect(table).toHaveBeenCalledTimes(1);
  }, 45000);

  it('clears a rejected load so a subsequent action can retry', async () => {
    vi.doMock('jspdf', () => { throw new Error('offline'); });
    vi.doMock('jspdf-autotable', () => ({ default: vi.fn() }));
    const { loadPdfLibraries } = await import('../loadPdfLibraries');
    const failed = loadPdfLibraries();
    await expect(failed).rejects.toThrow();
    vi.doMock('jspdf', () => ({ jsPDF: class {} }));
    const retry = loadPdfLibraries();
    expect(retry).not.toBe(failed);
    await expect(retry).resolves.toHaveProperty('jsPDF');
  });

  it('generates complete multi-page schedules, base64 attachments and commitment letters', async () => {
    const { generateDailyPdfsForDates } = await import('../dailySchedulePdf');
    const { generateCommitmentLetterPdfDoc } = await import('../commitmentLetterPdf');
    const reservations = Array.from({ length: 80 }, (_, i) => ({
      id: `pdf-${i}`, fecha: '2026-09-22', horaInicio: '08:00', horaFin: '09:00',
      espacio: 'AUDITORIO', responsable: 'Persona', tipoActividad: 'PRÉSTAMO',
      descripcion: `PDF_ACTIVITY_${i}`, actividadRecurrente: 'No',
    }));
    const [item] = await generateDailyPdfsForDates(['2026-09-22'], reservations, { include3DaysImportant: false });
    expect(item.activitiesCount).toBe(80);
    expect(item.filename).toMatch(/\.pdf$/);
    expect(item.doc.getNumberOfPages()).toBeGreaterThan(1);
    const contents = Buffer.from(item.base64, 'base64').toString('latin1');
    expect(contents).toContain('%PDF-');
    expect(contents).toContain('Pdf_Activity_79');
    const letter = await generateCommitmentLetterPdfDoc(reservations[0]);
    expect(letter.output()).toContain('%PDF-');
    expect(letter.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
