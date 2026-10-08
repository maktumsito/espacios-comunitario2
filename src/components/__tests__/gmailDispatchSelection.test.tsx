// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GmailDispatchModal } from '../GmailDispatchModal';
import { generateDailyPdfsForDates } from '../../utils/dailySchedulePdf';
import { sendActivitiesViaGmail } from '../../services/gmailDispatchService';
import type { Reservation } from '../../types';

vi.mock('../../services/gmailDispatchService', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/gmailDispatchService')>(),
  getGmailAccessToken: () => 'test-token',
  isGmailConnected: () => true,
  getCurrentGoogleUser: () => null,
  subscribeGmailAuthState: () => () => {},
  loadGmailDispatchConfig: vi.fn().mockResolvedValue({ defaultRecipients: ['recipient@example.com'], selectedActivityTypes: ['ALL'] }),
  sendActivitiesViaGmail: vi.fn().mockResolvedValue({ success: true, messageId: 'test-id' })
}));
vi.mock('../../services/auditLogService', () => ({ recordAuditEntry: vi.fn() }));
vi.mock('../../utils/dailySchedulePdf', () => ({
  getDailySchedulePdfFilename: (date: string) => `day-${date}.pdf`,
  generateDailyPdfsForDates: vi.fn(async (dates: string[]) => dates.map(date => ({ filename: `day-${date}.pdf`, base64: date })))
}));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const booking = (id: string, fecha = '2026-10-01'): Reservation => ({
  id, fecha, horaInicio: '09:00', horaFin: '10:00', espacio: 'SALA 2', responsable: 'Ana',
  tipoActividad: 'Taller', descripcion: id, actividadRecurrente: 'No'
});

describe('Gmail explicit activity selection', () => {
  it('limits a recurring multi-month configuration to selected days of the current week', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T15:00:00Z'));
    const reservations = [booking('THURSDAY'), booking('FRIDAY', '2026-10-02'), booking('FUTURE', '2026-10-08')];
    const view = render(<GmailDispatchModal isOpen onClose={() => {}} reservations={reservations} initialDate="2026-10-01" initialFilterMode="todas" />);
    await waitFor(() => expect(screen.getByText('1 de 1 seleccionadas')).toBeTruthy());
    fireEvent.click(view.baseElement.querySelector('#modal-btn-mode-weekday-duration')!);
    fireEvent.click(screen.getByText('Semana en Curso'));
    await waitFor(() => expect(view.baseElement.querySelector('#activity-item-FRIDAY')).toBeTruthy());
    expect(view.baseElement.querySelector('#activity-item-FUTURE')).toBeNull();
    fireEvent.click(view.baseElement.querySelector('#btn-select-all-activities')!);
    fireEvent.click(view.baseElement.querySelector('#btn-trigger-gmail-send')!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Enviar' }));
    await waitFor(() => expect(sendActivitiesViaGmail).toHaveBeenCalledOnce());
    expect(vi.mocked(generateDailyPdfsForDates).mock.calls[0][0]).toEqual(['2026-10-01', '2026-10-02']);
    expect(vi.mocked(sendActivitiesViaGmail).mock.calls[0][0].attachments).toHaveLength(2);
  });

  it('preserves deselection on live refresh and sends matching email content and daily PDFs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T15:00:00Z'));
    const reservations = [booking('SELECTED'), booking('UNCHECKED'), booking('NEXT_WEEK', '2026-10-08')];
    const props = { isOpen: true, onClose: () => {}, reservations, initialDate: '2026-10-01', initialFilterMode: 'todas' as const };
    const view = render(<GmailDispatchModal {...props} />);
    await waitFor(() => expect(screen.getByText('2 de 2 seleccionadas')).toBeTruthy());
    fireEvent.click(view.baseElement.querySelector('#activity-item-UNCHECKED')!);
    view.rerender(<GmailDispatchModal {...props} reservations={[...reservations, booking('NEW_UNSELECTED')]} />);
    await waitFor(() => expect(screen.getByText('1 de 3 seleccionadas')).toBeTruthy());
    fireEvent.click(view.baseElement.querySelector('#btn-trigger-gmail-send')!);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y Enviar' }));
    await waitFor(() => expect(sendActivitiesViaGmail).toHaveBeenCalledOnce());
    const [dates, selected] = vi.mocked(generateDailyPdfsForDates).mock.calls[0];
    expect(dates).toEqual(['2026-10-01']);
    expect(selected.map(r => r.id)).toEqual(['SELECTED']);
    const email = vi.mocked(sendActivitiesViaGmail).mock.calls[0][0];
    expect(email.textBody).toContain('Selected');
    expect(email.textBody).not.toContain('Unchecked');
    expect(email.textBody).not.toContain('New_Unselected');
    expect(email.textBody).not.toContain('Next_Week');
    expect(email.attachments).toHaveLength(1);
    view.rerender(<GmailDispatchModal {...props} isOpen={false} />);
    view.rerender(<GmailDispatchModal {...props} />);
    await waitFor(() => expect(screen.getByText('2 de 2 seleccionadas')).toBeTruthy());
  });
});
