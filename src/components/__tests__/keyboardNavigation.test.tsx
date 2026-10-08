// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobalCommandPalette } from '../GlobalCommandPalette';
import { FilterBar } from '../FilterBar';
import { BaseModal } from '../common/BaseModal';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { CalendarView } from '../CalendarView';

beforeEach(() => {
  vi.useFakeTimers();
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const filters = { search:'', espacio:'', tipoActividad:'', fechaDesde:'', fechaHasta:'', soloRecurrentes:false, soloImportantes:false, soloConTopamiento:false };
const paletteProps = () => ({ isOpen:true, onClose:vi.fn(), reservations:[], spaces:[], onSelectReservation:vi.fn(), onNavigateToView:vi.fn(), onNewReservation:vi.fn() });

describe('search keyboard regressions', () => {
  it('does not turn Enter on a calendar reservation into navigation to its day', () => {
    const navigate=vi.fn(), select=vi.fn();
    const date=new Date(2026,9,6);
    render(<CalendarView reservations={[{id:'keyboard-calendar',fecha:'2026-10-06',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',descripcion:'Taller de teclado',tipoActividad:'Taller',actividadRecurrente:'No'}]}
      selectedDate={date} onSelectReservation={select} onNavigateToDay={navigate} onNewReservationForDate={vi.fn()}/>);
    const booking=screen.getByRole('button',{name:/Actividad: Taller De Teclado/});
    const keyboard= new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
    act(()=>booking.dispatchEvent(keyboard));
    expect(keyboard.defaultPrevented).toBe(false);expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(booking);expect(select).toHaveBeenCalledTimes(1);
    const day=booking.closest('[role="button"]')!;
    fireEvent.keyDown(day,{key:'Enter'});expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('focuses the input, cycles Tab and Shift+Tab, then restores focus after closing', () => {
    const trigger=document.createElement('button');document.body.appendChild(trigger);trigger.focus();
    const {unmount}=render(<GlobalCommandPalette {...paletteProps()}/>);
    act(()=>vi.advanceTimersByTime(51));
    const input=screen.getByLabelText('Buscar reservas y comandos');
    expect(document.activeElement).toBe(input);
    const dialog=screen.getByRole('dialog');const buttons=dialog.querySelectorAll('button');
    buttons[buttons.length-1].focus();fireEvent.keyDown(document.activeElement!,{key:'Tab'});
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(buttons[buttons.length-1]);
    unmount();expect(document.activeElement).toBe(trigger);trigger.remove();
  });
  it('navigates by arrows and executes the selected command once with Enter', () => {
    const props=paletteProps(); render(<GlobalCommandPalette {...props}/>);
    const input=screen.getByLabelText('Buscar reservas y comandos');
    fireEvent.keyDown(input,{key:'ArrowDown'});fireEvent.keyDown(input,{key:'ArrowUp'});
    fireEvent.keyDown(input,{key:'Enter'});
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onNewReservation.mock.calls.length+props.onNavigateToView.mock.calls.length).toBe(1);
  });
  it('does not execute a command when Enter is confirming IME text', () => {
    const props=paletteProps();render(<GlobalCommandPalette {...props}/>);
    fireEvent.keyDown(screen.getByLabelText('Buscar reservas y comandos'),{key:'Enter',isComposing:true});
    expect(props.onClose).not.toHaveBeenCalled();
  });
  it('closes the quick search with Escape when focus has left its text field', () => {
    const props=paletteProps(); render(<GlobalCommandPalette {...props}/>);
    fireEvent.keyDown(window,{key:'Escape'});
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  it('preserves typed filter text when Escape hides the filter panel', () => {
    const close=vi.fn(), change=vi.fn();
    render(<FilterBar filters={filters} onFilterChange={change} onResetFilters={vi.fn()} onClose={close} totalAll={0} totalFiltered={0}/>);
    const input=document.getElementById('filter-search-input')!;
    fireEvent.change(input,{target:{value:'Taller nuevo'}});
    fireEvent.keyDown(input,{key:'Escape'});
    expect(close).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenLastCalledWith({...filters,search:'Taller nuevo'});
  });
  it('closes only the upper dialog with Escape', () => {
    const parent=vi.fn(), child=vi.fn();
    render(<BaseModal isOpen onClose={parent} title="Principal"><BaseModal isOpen onClose={child} layer="nested" title="Confirmación">Confirmar</BaseModal></BaseModal>);
    fireEvent.keyDown(window,{key:'Escape'});
    expect(child).toHaveBeenCalledTimes(1); expect(parent).not.toHaveBeenCalled();
  });
});

function Shortcuts({toggle,create}: {toggle:()=>void;create:()=>void}) {
  useKeyboardShortcuts({onToggleCommandPalette:toggle,onOpenNewReservation:create,isCommandPaletteOpen:false});
  return <input aria-label="Editar reserva"/>;
}
describe('global keyboard regressions', () => {
  it('opens with Ctrl+K, Cmd+K and slash; Alt+N creates from outside editors', () => {
    const toggle=vi.fn(),create=vi.fn();render(<Shortcuts toggle={toggle} create={create}/>);
    fireEvent.keyDown(window,{key:'k',ctrlKey:true});fireEvent.keyDown(window,{key:'K',metaKey:true});
    fireEvent.keyDown(window,{key:'/'});fireEvent.keyDown(window,{key:'n',altKey:true});
    expect(toggle).toHaveBeenCalledTimes(3);expect(create).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Editar reserva'),{key:'/'});expect(toggle).toHaveBeenCalledTimes(3);
  });
  it('does not create another reservation while typing', () => {
    const create=vi.fn(); render(<Shortcuts toggle={vi.fn()} create={create}/>);
    fireEvent.keyDown(screen.getByLabelText('Editar reserva'),{key:'n',altKey:true});
    expect(create).not.toHaveBeenCalled();
  });
  it('ignores repeat, composition and unrelated modifiers', () => {
    const toggle=vi.fn(); render(<Shortcuts toggle={toggle} create={vi.fn()}/>);
    fireEvent.keyDown(window,{key:'k',ctrlKey:true,repeat:true});
    fireEvent.keyDown(window,{key:'k',ctrlKey:true,isComposing:true});
    fireEvent.keyDown(window,{key:'k',ctrlKey:true,altKey:true});
    fireEvent.keyDown(window,{key:'/',ctrlKey:true});
    expect(toggle).not.toHaveBeenCalled();
  });
  it('does not open shortcuts behind another dialog', () => {
    const toggle=vi.fn(),create=vi.fn();
    render(<><Shortcuts toggle={toggle} create={create}/><BaseModal isOpen onClose={vi.fn()} title="Edición">Datos</BaseModal></>);
    fireEvent.keyDown(window,{key:'k',ctrlKey:true});fireEvent.keyDown(window,{key:'n',altKey:true});
    expect(toggle).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
  });
  it('blocks shortcuts behind legacy modal wrappers without ARIA roles', () => {
    const toggle=vi.fn();render(<><Shortcuts toggle={toggle} create={vi.fn()}/><div className="fixed inset-0">Formulario antiguo</div></>);
    fireEvent.keyDown(window,{key:'k',ctrlKey:true});expect(toggle).not.toHaveBeenCalled();
  });
});
