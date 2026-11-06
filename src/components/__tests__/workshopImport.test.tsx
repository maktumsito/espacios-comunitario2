// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkshopImport } from '../WorkshopImport';
import { SPACES_LIST } from '../../data/spacesData';
import { buildWorkshopImport, parseWorkshopRows } from '../../utils/workshopImport';
import type { Reservation, SpaceBlock } from '../../types';

const { readSheet } = vi.hoisted(() => ({ readSheet: vi.fn() }));
vi.mock('read-excel-file/browser', () => ({ readSheet }));
const data = [['NOMBRE TALLER', 'HORARIO 1', 'HORARIO 2', 'PROFESOR'], ['Danza', 'LUN 10:00-11:00', 'MIE 11:00-12:00', 'María Pérez']];
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('excludes a removed workshop and its conflicts from the confirmed import', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  const rows = parseWorkshopRows([...data, ['Tejido', 'LUN 10:00-11:00', '', 'Otra profesora']]);
  render(<WorkshopImport spaces={SPACES_LIST} spaceBlocks={[]} reservations={[]} onImportReservations={save} source={{ rows, name: 'talleres.xlsx' }} />);
  fireEvent.change(screen.getByLabelText('Espacio para Danza (fila 2)'), { target: { value: 'SALA 2' } });
  fireEvent.change(screen.getByLabelText('Espacio para Tejido (fila 3)'), { target: { value: 'SALA 2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar importación' }));
  await screen.findByText(/Hay .* topamientos/);
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar taller Danza de la importación (fila 2)' }));
  expect(screen.queryByText('Fila 2: Danza')).toBeNull();
  expect(screen.queryByLabelText('Resumen de importación')).toBeNull();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar importación' }));
  await screen.findByLabelText('Resumen de importación');
  expect(screen.queryByText(/Hay .* topamientos/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Guardar \d+ sesiones recurrentes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].every((row: Reservation) => row.descripcion === 'Tejido')).toBe(true);
});

it('allows removing the last workshop and undoing without losing its room or category', async () => {
  const save = await open();
  await review();
  fireEvent.change(screen.getByLabelText('Categoría de actividad para Danza (fila 2)'), { target: { value: 'TALLER JJV' } });
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar taller Danza de la importación (fila 2)' }));
  expect(screen.getByText(/No quedan talleres para importar/)).toBeTruthy();
  expect(screen.queryByLabelText('Resumen de importación')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Revisar importación' })).toBeNull();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer última eliminación' }));
  expect((screen.getByLabelText('Espacio para Danza (fila 2)') as HTMLSelectElement).value).toBe('SALA 2');
  expect((screen.getByLabelText('Categoría de actividad para Danza (fila 2)') as HTMLSelectElement).value).toBe('TALLER JJV');
  expect(screen.queryByRole('button', { name: 'Deshacer última eliminación' })).toBeNull();
  expect(screen.queryByLabelText('Resumen de importación')).toBeNull();
});

async function open(existing: Reservation[] = [], blocks: SpaceBlock[] = [], save = vi.fn().mockResolvedValue(undefined)) {
  readSheet.mockResolvedValue(data);
  render(<WorkshopImport spaces={SPACES_LIST} spaceBlocks={blocks} reservations={existing} onImportReservations={save} currentUser={{ username: 'test', name: 'Test', role: 'Administrador', initials: 'T', avatarColor: 'blue' }} />);
  fireEvent.change(screen.getByLabelText('Excel de talleres'), { target: { files: [new File(['test'], 'talleres.xlsx')] } });
  await screen.findByText('Fila 2: Danza');
  return save;
}
async function review() {
  fireEvent.change(screen.getByRole('combobox', { name: 'Espacio para Danza (fila 2)' }), { target: { value: 'SALA 2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar importación' }));
  await screen.findByLabelText('Resumen de importación');
}

it('assigns the selected room and activity category to every imported session', async () => {
  const save = await open();
  expect((screen.getByRole('button', { name: 'Revisar importación' }) as HTMLButtonElement).disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Categoría de actividad para Danza (fila 2)'), { target: { value: 'TALLER JJV' } });
  await review();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Guardar \d+ sesiones recurrentes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0][0]).toMatchObject({ espacio: 'SALA 2', responsable: 'María Pérez', tipoActividad: 'TALLER JJV', tipoPrestamo: 'TALLER JJV', actividadRecurrente: 'Sí' });
  expect(save.mock.calls[0][0].every((row: Reservation) => row.espacio === 'SALA 2' && row.tipoActividad === 'TALLER JJV')).toBe(true);
  await screen.findByText(/Se guardaron .* sesiones de talleres/);
});

it('blocks saving when an existing reservation overlaps', async () => {
  const [reservation] = (await buildWorkshopImport(parseWorkshopRows(data), { 2: 'SALA 2' }, SPACES_LIST, [])).reservations;
  const save = await open([{ ...reservation, id: 'existing', descripcion: 'Otra actividad' }]);
  await review();
  expect(screen.getByText(/Hay .* topamientos/)).toBeTruthy();
  expect((screen.getByRole('button', { name: /Guardar \d+ sesiones/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

it('blocks saving during maintenance and clears a stale preview when the room changes', async () => {
  await open([], [{ id: 'block', espacio: 'SALA 2', fechaInicio: '2027-03-01', fechaFin: '2027-03-01', todoElDia: true, motivo: 'Obras', descripcion: '', activo: true, createdAt: '' }]);
  await review();
  expect(screen.getByText(/BLOQUEADO por mantención/)).toBeTruthy();
  expect((screen.getByRole('button', { name: /Guardar \d+ sesiones/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole('combobox', { name: 'Espacio para Danza (fila 2)' }), { target: { value: 'TATAMI' } });
  expect(screen.queryByLabelText('Resumen de importación')).toBeNull();
});

it('reports malformed files without enabling import', async () => {
  readSheet.mockResolvedValue([data[0], ['Danza', 'XYZ', '', 'Profesora']]);
  render(<WorkshopImport spaces={SPACES_LIST} spaceBlocks={[]} reservations={[]} onImportReservations={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Excel de talleres'), { target: { files: [new File(['test'], 'talleres.xlsx')] } });
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Fila 2'));
  expect(screen.queryByRole('combobox')).toBeNull();
});

it('opens the full reservation editor and keeps edits in the import draft until final confirmation', async () => {
  const save = await open();
  fireEvent.change(screen.getByRole('combobox', { name: 'Espacio para Danza (fila 2)' }), { target: { value: 'SALA 2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Editar todas las opciones (fila 2)' }));
  await screen.findByText('Editar taller antes de importar', {}, { timeout: 15000 });
  fireEvent.change(screen.getByLabelText(/Nombre de la Actividad/), { target: { value: 'Danza personalizada' } });
  fireEvent.change(document.getElementById('input-reserva-email')!, { target: { value: 'profesor@example.com' } });
  fireEvent.change(document.getElementById('input-reserva-participantes')!, { target: { value: '7' } });
  fireEvent.change(document.getElementById('input-reserva-comentarios')!, { target: { value: 'Preparar la sala' } });
  fireEvent.click(screen.getByRole('button', { name: 'Configurar montaje de sala' }));
  fireEvent.change(screen.getByLabelText('Instrucciones de montaje'), { target: { value: 'Siete sillas en círculo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar cambios a la importación' }));
  await screen.findByText('Fila 2: Danza personalizada');
  fireEvent.change(screen.getByLabelText('Categoría de actividad para Danza (fila 2)'), { target: { value: 'TALLER JJV' } });
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar importación' }));
  await screen.findByLabelText('Resumen de importación');
  fireEvent.click(screen.getByRole('button', { name: /Guardar \d+ sesiones recurrentes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].every((row: Reservation) => row.descripcion === 'Danza personalizada' && row.tipoActividad === 'TALLER JJV' && row.tipoPrestamo === 'TALLER JJV')).toBe(true);
  expect(save.mock.calls[0][0].every((row: Reservation) => row.emailContacto === 'profesor@example.com' && row.cantidadParticipantes === 7 && row.comentarios === 'Preparar la sala' && row.montaje?.instrucciones === 'Siete sillas en círculo')).toBe(true);
}, 30000);


it('invalidates the preview and requires a category before reviewing again', async () => {
  const save = await open();
  await review();
  fireEvent.change(screen.getByLabelText('Categoría de actividad para Danza (fila 2)'), { target: { value: '' } });
  expect(screen.queryByLabelText('Resumen de importación')).toBeNull();
  expect((screen.getByRole('button', { name: 'Revisar importación' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Categoría de actividad para Danza (fila 2)'), { target: { value: 'TALLER MUNICIPAL' } });
  fireEvent.click(screen.getByRole('button', { name: 'Revisar importación' }));
  await screen.findByLabelText('Resumen de importación');
  fireEvent.click(screen.getByRole('button', { name: /Guardar \d+ sesiones recurrentes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].every((row: Reservation) => row.tipoActividad === 'TALLER MUNICIPAL')).toBe(true);
});


it('uses the configured category catalog for imported workshops', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(<WorkshopImport spaces={SPACES_LIST} spaceBlocks={[]} reservations={[]} onImportReservations={save}
    source={{ rows: parseWorkshopRows(data), name: 'talleres.xlsx' }}
    activityTypes={[{ id: 'custom', name: 'TALLER VECINAL', category: 'Vecinal', color: '#9333ea' }]} />);
  const category = screen.getByLabelText('Categoría de actividad para Danza (fila 2)') as HTMLSelectElement;
  expect(category.value).toBe('TALLER VECINAL');
  expect(screen.queryByRole('option', { name: 'TALLER CCD' })).toBeNull();
  await review();
  fireEvent.click(screen.getByRole('button', { name: /Guardar \d+ sesiones recurrentes/ }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0].every((row: Reservation) => row.tipoActividad === 'TALLER VECINAL')).toBe(true);
});
