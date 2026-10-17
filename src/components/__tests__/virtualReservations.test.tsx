// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VirtualCardGrid } from '../common/VirtualCardGrid';
import { MobileAgendaView } from '../MobileAgendaView';
import { DailyUsageView } from '../DailyUsageView';
import { intersectsViewport } from '../../hooks/useTimelineViewport';
import type { Reservation } from '../../types';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.dataset.index !== undefined ? 100 : 240;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(390);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ height: 40, width: 390, top: 0, left: 0, right: 390, bottom: 40, x: 0, y: 0, toJSON() {} });
  Element.prototype.scrollTo = function (options?: ScrollToOptions | number, y?: number) {
    this.scrollTop = typeof options === 'number' ? y ?? 0 : options?.top ?? 0;
  };
  vi.stubGlobal('innerWidth', 390);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const reservation = (id: string, hour: number): Reservation => ({
  id, fecha: '2026-09-22', espacio: 'AUDITORIO', horaInicio: `${hour}:00`, horaFin: `${hour + 1}:00`,
  responsable: 'Prueba', tipoActividad: 'PRÉSTAMO', descripcion: id, actividadRecurrente: 'No',
});

describe('Reservation virtualization', () => {
  it('keeps long and minimum-height cards that intersect the viewport', () => {
    expect(intersectsViewport(0, 600, 400, 500)).toBe(true);
    expect(intersectsViewport(390, 34, 400, 500)).toBe(true);
    expect(intersectsViewport(0, 34, 400, 500)).toBe(false);
    expect(intersectsViewport(500, 34, 400, 500)).toBe(false);
  });

  it('bounds monthly cards and reaches unmounted cards with Tab and Shift+Tab', () => {
    const items = Array.from({ length: 2100 }, (_, i) => ({ id: String(i) }));
    const { container } = render(<VirtualCardGrid items={items} renderItem={item => <button>{item.id}</button>} />);
    expect(container.querySelectorAll('button').length).toBeLessThan(20);
    act(() => screen.getByRole('button', { name: '0' }).focus());
    for (let i = 0; i < 30; i++) fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement?.textContent).toBe('30');
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.textContent).toBe('29');
    expect(container.querySelectorAll('button').length).toBeLessThan(20);
    act(() => { window.innerWidth = 1200; window.dispatchEvent(new Event('resize')); });
    expect(container.querySelectorAll('[data-index]')[0].getAttribute('style')).toContain('repeat(4');
  });

  it('keeps all concurrent visible bookings, culls offscreen bookings and preserves focused bookings', () => {
    const near = Array.from({ length: 30 }, (_, i) => reservation(`near-${i}`, 8));
    const far = Array.from({ length: 100 }, (_, i) => reservation(`far-${i}`, 20));
    const otherDates = Array.from({ length: 2000 }, (_, i) => ({ ...reservation(`other-${i}`, 20), fecha: '2026-10-20' }));
    const { container, rerender } = render(<DailyUsageView reservations={near} conflictReservationIds={new Set()}
      initialDate={new Date(2026, 8, 22)} onSelectReservation={() => {}} onNewReservationWithSlot={() => {}} onUpdateReservation={() => true} />);
    const scroll = container.querySelector('.overflow-x-auto')!;
    fireEvent.scroll(scroll, { target: { scrollTop: 0 } });
    expect(container.querySelectorAll('[data-reservation-id]').length).toBe(30);
    rerender(<DailyUsageView reservations={[...near, ...far, ...otherDates]} conflictReservationIds={new Set()}
      initialDate={new Date(2026, 8, 22)} onSelectReservation={() => {}} onNewReservationWithSlot={() => {}} onUpdateReservation={() => true} />);
    fireEvent.scroll(scroll, { target: { scrollTop: 0 } });
    expect(container.querySelectorAll('[data-reservation-id]').length).toBe(30);
    const dragged = container.querySelector('[data-reservation-id="near-1"]')!;
    fireEvent.dragStart(dragged, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } });
    act(() => (container.querySelector('[data-reservation-id="near-0"]') as HTMLElement).focus());
    fireEvent.scroll(scroll, { target: { scrollTop: 800 } });
    expect(container.querySelector('[data-reservation-id="near-0"]')).not.toBeNull();
    expect(container.querySelector('[data-reservation-id="near-1"]')).not.toBeNull();
    expect(container.querySelector('[data-reservation-id="far-0"]')).not.toBeNull();
    fireEvent.dragEnd(dragged);
    expect(container.querySelector('[data-reservation-id="near-1"]')).toBeNull();
  });

  it('keeps an overnight booking visible on its second day and updates on date changes', () => {
    const overnight = { ...reservation('overnight', 23), fecha: '2026-09-21', horaFin: '02:00', terminaDiaSiguiente: true };
    const props = { reservations: [overnight], conflictReservationIds: new Set<string>(), onSelectReservation: vi.fn(), onNewReservationWithSlot: vi.fn() };
    const { container, rerender } = render(<DailyUsageView {...props} selectedDate={new Date(2026, 8, 22)} />);
    fireEvent.scroll(container.querySelector('.overflow-x-auto')!, { target: { scrollTop: 0 } });
    expect(container.querySelector('[data-reservation-id="overnight"]')).not.toBeNull();
    rerender(<DailyUsageView {...props} selectedDate={new Date(2026, 8, 23)} />);
    expect(container.querySelector('[data-reservation-id="overnight"]')).toBeNull();
  });
});

it('keeps controls inside a virtual card reachable before moving to another card',()=> {
  const items=Array.from({length:100},(_,i)=>({id:`actions-${i}`}));
  render(<VirtualCardGrid items={items} fixedColumns={1} renderItem={item=><><button>{item.id} first</button><button>{item.id} last</button></>} />);
  const first=screen.getByRole('button',{name:'actions-0 first'});
  act(()=>first.focus());fireEvent.keyDown(first,{key:'Tab'});
  expect(document.activeElement).toBe(first); // Browser performs the normal internal Tab; it is not intercepted.
  const last=screen.getByRole('button',{name:'actions-0 last'});act(()=>last.focus());fireEvent.keyDown(last,{key:'Tab'});
  expect(document.activeElement?.textContent).toBe('actions-1 first');
  fireEvent.keyDown(document.activeElement!,{key:'Tab',shiftKey:true});
  expect(document.activeElement?.textContent).toBe('actions-0 last');
});

it('virtualizes dense mobile days and reveals offscreen reservations on scroll',()=> {
  HTMLElement.prototype.scrollIntoView=vi.fn();
  const rows=Array.from({length:500},(_,i)=>reservation(`mobile-${i}`,10));
  const {container}=render(<MobileAgendaView reservations={rows} spaces={[]} selectedDate={new Date(2026,8,22)} onDateChange={()=>{}} onSelectReservation={()=>{}} onEditReservation={()=>{}} />);
  expect(container.querySelectorAll('article').length).toBeLessThan(20);
  const scroller=container.querySelector('.overflow-y-auto.pr-1')!;
  fireEvent.scroll(scroller,{target:{scrollTop:49000}});
  expect(container.querySelectorAll('article').length).toBeLessThan(20);
  expect(container.querySelectorAll('article').length).toBeGreaterThan(0);
  expect(container.querySelector('[data-agenda-reservation-id="mobile-0"]')).toBeNull();
});
