// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ImportExportModal } from '../ImportExportModal';
import { SPACES_LIST } from '../../data/spacesData';
const { readSheet } = vi.hoisted(() => ({ readSheet: vi.fn() }));
vi.mock('read-excel-file/browser', () => ({ readSheet }));
vi.mock('../../services/backupService', () => ({
  getBackupScheduleConfig: () => ({ enabled: false, intervalDays: 15, lastBackupTimestamp: null }),
  getDatabaseBackupsList: async () => [], calculateNextBackupDate: () => '', getDaysUntilNextBackup: () => 15,
  getBackupIdentitySignature: () => '', saveBackupScheduleConfig: vi.fn(), createDatabaseBackup: vi.fn(),
  downloadBackupFile: vi.fn(), restoreDatabaseFromBackup: vi.fn(), deleteDatabaseBackup: vi.fn(),
}));
afterEach(cleanup);
it.each(['csv', 'xlsx'])('routes a workshop %s uploaded through the general import button to the workshop review', async extension => {
  const onImport = vi.fn();
  const table = [['NOMBRE TALLER', 'HORARIO 1', 'HORARIO 2', 'PROFESOR'], ['Taller de prueba', 'JUE 18:00-19:00', '', 'Profesora']];
  readSheet.mockResolvedValue(table);
  render(<ImportExportModal isOpen onClose={vi.fn()} reservations={[]} spaces={SPACES_LIST} onImportReservations={onImport} onSyncAllToFirebase={vi.fn()}
    currentUser={{ username: 'test', name: 'Test', role: 'Administrador', initials: 'T', avatarColor: 'blue' }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Excel, Planilla y CSV' }));
  const file = new File([table.map(row => row.join(';')).join('\r\n')], `talleres.${extension}`);
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(table.map(row => row.join(';')).join('\r\n')).buffer });
  const generalInput = screen.getByText('Seleccionar archivo Excel o CSV').closest('label')!.querySelector('input')!;
  fireEvent.change(generalInput, { target: { files: [file] } });
  await screen.findByText('Fila 2: Taller de prueba');
  expect(screen.getByText(`Archivo cargado: talleres.${extension}`)).toBeTruthy();
  expect(onImport).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Editar todas las opciones (fila 2)' })).toBeTruthy();
});
