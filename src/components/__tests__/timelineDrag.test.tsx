// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DailyUsageView } from '../DailyUsageView';
import { SPACES_LIST } from '../../data/spacesData';
import type { Reservation, SpaceBlock } from '../../types';

const date = '2026-10-18';
const source: Reservation = { id: 'drag-source', fecha: date, espacio: 'AUDITORIO', horaInicio: '08:00', horaFin: '08:20',
  responsable: 'Prueba', tipoActividad: 'Taller', descripcion: 'Prueba de arrastre', actividadRecurrente: 'No' };
const spaces = SPACES_LIST.filter(s => ['AUDITORIO', 'SALA 2', 'SALA 3'].includes(s.name));
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(1000);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 900, left: 0, right: 1000, width: 1000, height: 800, x: 0, y: 100, toJSON() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function drag(element: Element, type: string, clientY: number, transfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  fireEvent(element, event);
  return transfer;
}
function setup(update = vi.fn().mockResolvedValue(true), extras: { allReservations?: Reservation[]; spaceBlocks?: SpaceBlock[] } = {}) {
  const rendered = render(<DailyUsageView reservations={[source]} spaces={spaces} conflictReservationIds={new Set()}
    initialDate={new Date(2026, 9, 18)} onSelectReservation={vi.fn()} onNewReservationWithSlot={vi.fn()} onUpdateReservation={update} {...extras} />);
  const card = rendered.container.querySelector('[data-reservation-id="drag-source"]')!;
  const column = (space: string) => rendered.container.querySelector(`[data-drop-space="${space}"]`)!;
  return { ...rendered, card, column, update };
}
// Grab ten minutes into the card and keep that offset at the destination.
const y = (minutes: number) => 100 + (minutes + 10) * 56 / 60;

it('uses the actual drop coordinates and column, preserving the original short duration', async () => {
  const { card, column, update } = setup();
  const transfer = drag(card, 'dragstart', y(0));
  drag(column('SALA 2'), 'dragover', y(60), transfer);
  drag(column('SALA 3'), 'drop', y(120), transfer);
  await waitFor(() => expect(update).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ espacio: 'SALA 3', horaInicio: '10:00', horaFin: '10:20' })));
});

it('keeps the preview during transitions into children and skips no-op moves', () => {
  const { card, column, update, container } = setup();
  const transfer = drag(card, 'dragstart', y(0));
  drag(column('AUDITORIO'), 'dragover', y(0), transfer);
  fireEvent(column('AUDITORIO'), new MouseEvent('dragleave', { bubbles: true, relatedTarget: card }));
  expect(container.textContent).toContain('Soltar para reasignar');
  drag(column('AUDITORIO'), 'drop', y(0), transfer);
  expect(update).not.toHaveBeenCalled();
});

it('warns about reservations hidden by filters, including overnight conflicts', () => {
  const hidden = { ...source, id: 'hidden', fecha: '2026-10-17', horaInicio: '23:00', horaFin: '09:00', terminaDiaSiguiente: true, espacio: 'SALA 2', descripcion: 'Reserva oculta' };
  const { card, column, container } = setup(undefined, { allReservations: [source, hidden] });
  const transfer = drag(card, 'dragstart', y(0));
  drag(column('SALA 2'), 'dragover', y(0), transfer);
  expect(container.textContent).toContain('Topamiento con Reserva oculta');
});

it('blocks maintenance both in the body and in the column header', () => {
  const block = { id: 'maintenance', espacio: 'SALA 2', fechaInicio: date, fechaFin: date, activo: true, todoElDia: true, motivo: 'Reparación' } as SpaceBlock;
  const { card, column, update, container } = setup(undefined, { spaceBlocks: [block] });
  let transfer = drag(card, 'dragstart', y(0));
  drag(column('SALA 2'), 'drop', y(60), transfer);
  expect(update).not.toHaveBeenCalled();
  transfer = drag(card, 'dragstart', y(0));
  const header = [...container.querySelectorAll('[draggable]')].find(e => e.textContent?.includes('SALA 2') && !e.hasAttribute('data-reservation-id'))!;
  drag(header, 'drop', y(0), transfer);
  expect(update).not.toHaveBeenCalled();
});

it('handles rejected saves and allows a subsequent attempt', async () => {
  const update = vi.fn().mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValue(true);
  const { card, column } = setup(update);
  let transfer = drag(card, 'dragstart', y(0));
  drag(column('SALA 2'), 'drop', y(60), transfer);
  expect(await screen.findByText('No se pudo mover la actividad')).toBeTruthy();
  expect(screen.getByText('Sin conexión')).toBeTruthy();
  transfer = drag(card, 'dragstart', y(0));
  drag(column('SALA 2'), 'drop', y(60), transfer);
  await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
});

it('prevents concurrent moves until persistence finishes and cancels previews with Escape', async () => {
  let resolve!: (value: boolean) => void;
  const { card, column, update, container } = setup(vi.fn(() => new Promise<boolean>(r => { resolve = r; })));
  const transfer = drag(card, 'dragstart', y(0));
  drag(column('SALA 2'), 'dragover', y(60), transfer);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(container.textContent).not.toContain('Soltar para reasignar');
  drag(card, 'dragstart', y(0), transfer);
  drag(column('SALA 2'), 'drop', y(60), transfer);
  drag(card, 'dragstart', y(0), transfer);
  drag(column('SALA 3'), 'drop', y(120), transfer);
  expect(update).toHaveBeenCalledOnce();
  expect(card.getAttribute('draggable')).toBe('false');
  await act(async () => resolve(true));
  expect(card.getAttribute('draggable')).toBe('true');
});
