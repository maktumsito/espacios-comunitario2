// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MaintenanceDashboardView } from '../MaintenanceDashboardView';
afterEach(() => {cleanup();vi.useRealTimers();});
it('keeps completed maintenance as history and never deletes it when showing or hiding history', () => {
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-25T01:30:00Z'));
  const remove=vi.fn();
  const blocks=[{id:'old',espacio:'SALA 2',fechaInicio:'2026-10-20',fechaFin:'2026-10-23',motivo:'Pintura',descripcion:'Pintura concluida',activo:true},
    {id:'today',espacio:'SALA 3',fechaInicio:'2026-10-24',fechaFin:'2026-10-24',motivo:'Reparación',descripcion:'Trabajo del día',activo:true}] as any;
  render(<MaintenanceDashboardView blocks={blocks} onSaveBlock={vi.fn()} onDeleteBlock={remove} />);
  expect(screen.queryByText('Pintura concluida')).toBeNull();
  expect(screen.getByText('Trabajo del día')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox',{name:/Mostrar historial/}));
  expect(screen.getByText('Pintura concluida')).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Depurar/})).toBeNull();
  expect(remove).not.toHaveBeenCalled();
});

it('keeps creation and editing available when replacing the purge with a history filter', () => {
  const block = {id:'next',espacio:'SALA 2',fechaInicio:'2099-10-20',fechaFin:'2099-10-23',motivo:'Pintura',descripcion:'Trabajo programado',activo:true} as any;
  render(<MaintenanceDashboardView blocks={[block]} onSaveBlock={vi.fn()} onDeleteBlock={vi.fn()} />);
  fireEvent.click(screen.getByRole('button',{name:'Nuevo Bloqueo'}));
  expect(screen.getByRole('heading',{name:'Nuevo Bloqueo / Mantención'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  fireEvent.click(screen.getByTitle('Editar bloqueo'));
  expect(screen.getByRole('heading',{name:'Editar Bloqueo de Espacio'})).toBeTruthy();
  expect(screen.getByDisplayValue('Trabajo programado')).toBeTruthy();
});
