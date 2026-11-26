// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AnalyticsView } from '../AnalyticsView';
import { SPACES_LIST } from '../../data/spacesData';
import type { Reservation } from '../../types';

vi.mock('../D3AnalyticsCharts', () => ({
  D3SpaceBarChart: () => null,
  D3ActivityDonutChart: () => null,
  D3HourlyOccupancyChart: () => null,
}));

it('attributes shared bookings and distinguishes catalog names that differ only by accents', () => {
  const names = ['SALÓN NORTE', 'SALON NORTE', 'BÓVEDA', 'SALA 2'];
  const spaces = names.map((name, index) => ({ ...SPACES_LIST[0], name, id: String(index) }));
  const reservations: Reservation[] = ['Salón Norte / sala2', 'Boveda'].map((espacio, i) => ({
    id: String(i), fecha: '2026-11-19', horaInicio: '10:00', horaFin: '11:00',
    descripcion: 'Taller', responsable: 'Docente', tipoActividad: 'Taller',
    espacio, cantidadParticipantes: 4, actividadRecurrente: 'No', estado: 'activa',
  }));
  render(<AnalyticsView reservations={reservations} spaces={spaces} />);
  fireEvent.click(screen.getByRole('button', { name: 'Lista / Barras Simples' }));
  const listCard = screen.getByRole('heading', { name: 'Uso y Demanda por Espacio' }).closest('.rounded-2xl') as HTMLElement;
  for (const room of names) {
    const row = within(listCard).getByText(room, { exact: true }).parentElement?.parentElement;
    expect(row?.textContent).toContain(room === 'SALON NORTE' ? '0 reservas (0.0%) · 0 personas' : '1 reservas (50.0%) · 4 personas');
  }
});
