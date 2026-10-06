// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RecurringMoveScopeModal } from '../RecurringMoveScopeModal';
import type { Reservation } from '../../types';
const original:Reservation={id:'source',fecha:'2026-10-13',horaInicio:'10:00',horaFin:'11:00',espacio:'SALA 2',responsable:'Vecino',descripcion:'Taller semanal',tipoActividad:'Taller',actividadRecurrente:'Sí',serieRecurrente:'series'};
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-06T15:00:00Z'));});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('asks for the scope and does not save until the user confirms',async()=>{
  const save=vi.fn().mockResolvedValue(true),cancel=vi.fn();
  render(<RecurringMoveScopeModal original={original} target={{...original,espacio:'SALA 3'}} onCancel={cancel} onConfirm={save}/>);
  expect(screen.getAllByRole('radio')).toHaveLength(3);
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('radio',{name:/Desde esta en adelante/}));
  fireEvent.click(screen.getByText('Confirmar movimiento'));
  await waitFor(()=>expect(save).toHaveBeenCalledWith('future'));
});
it('cancels without saving and keeps the scope available if validation fails',async()=>{
  const save=vi.fn().mockResolvedValue(false),cancel=vi.fn();
  render(<RecurringMoveScopeModal original={original} target={{...original,espacio:'SALA 3'}} onCancel={cancel} onConfirm={save}/>);
  fireEvent.click(screen.getByRole('radio',{name:/Toda la serie/}));
  fireEvent.click(screen.getByText('Confirmar movimiento'));
  await waitFor(()=>expect(screen.getByRole('alert')).toBeTruthy());
  expect(save).toHaveBeenCalledWith('series');
  fireEvent.click(screen.getByText('Cancelar'));expect(cancel).toHaveBeenCalledOnce();
});
it('prevents double submission while awaiting confirmation',async()=>{
  let finish:(result:boolean)=>void=()=>{};
  const save=vi.fn().mockImplementation(()=>new Promise<boolean>(resolve=>finish=resolve));
  render(<RecurringMoveScopeModal original={original} target={{...original,espacio:'SALA 3'}} onCancel={vi.fn()} onConfirm={save}/>);
  fireEvent.click(screen.getByText('Confirmar movimiento'));
  fireEvent.click(screen.getByText('Guardando…'));
  expect(save).toHaveBeenCalledOnce();
  await act(async()=>finish(true));
});
