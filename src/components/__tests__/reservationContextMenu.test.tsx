// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReservationContextMenu } from '../common/ReservationContextMenu';
import type { Reservation } from '../../types';
import type { AuthUser } from '../../services/authService';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sampleReservation: Reservation = {
  id: 'res-101',
  fecha: '2026-10-12',
  horaInicio: '10:00',
  horaFin: '11:30',
  espacio: 'SALA 2',
  responsable: 'María González',
  telefonoContacto: '+56 9 1234 5678',
  emailContacto: 'maria@example.com',
  descripcion: 'Taller de Pintura',
  tipoActividad: 'Taller',
  actividadRecurrente: 'Sí',
  serieRecurrente: 'SER-1',
  estado: 'activa',
  realizada: 'No'
};

const adminUser: AuthUser = {
  username: 'admin',
  name: 'Administrador',
  role: 'Administrador',
  initials: 'AD',
  avatarColor: 'bg-blue-600',
  canCreateReservations: true,
  canEditReservations: true,
  canDeleteReservations: true
};

describe('ReservationContextMenu', () => {
  it('renders all primary actions and contact links for an authorized user and triggers callbacks', () => {
    const onClose = vi.fn();
    const onViewDetails = vi.fn();
    const onEdit = vi.fn();
    const onReplace = vi.fn();
    const onDuplicate = vi.fn();
    const onToggleRealizada = vi.fn();
    const onOpenRating = vi.fn();
    const onDelete = vi.fn();

    render(
      <ReservationContextMenu
        reservation={sampleReservation}
        x={150}
        y={180}
        currentUser={adminUser}
        onClose={onClose}
        onViewDetails={onViewDetails}
        onEdit={onEdit}
        onReplace={onReplace}
        onDuplicate={onDuplicate}
        onToggleRealizada={onToggleRealizada}
        onOpenRating={onOpenRating}
        onDelete={onDelete}
      />
    );

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByText('Taller De Pintura')).toBeTruthy();
    expect(screen.getByText('Ver detalles completos')).toBeTruthy();
    expect(screen.getByText('Editar reserva')).toBeTruthy();
    expect(screen.getByText('Reemplazar solo este día')).toBeTruthy();
    expect(screen.getByText('Duplicar reserva')).toBeTruthy();
    expect(screen.getByText('Marcar como realizada')).toBeTruthy();
    expect(screen.getByText('Calificar uso de espacio')).toBeTruthy();
    expect(screen.getByText('WhatsApp al responsable')).toBeTruthy();
    expect(screen.getByText('Eliminar reserva')).toBeTruthy();

    fireEvent.click(screen.getByText('Reemplazar solo este día'));
    expect(onReplace).toHaveBeenCalledWith(sampleReservation);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('adapts options for a user without delete permission and closes on Escape', () => {
    const onClose = vi.fn();
    const onRequestDelete = vi.fn();
    const readLimitedUser: AuthUser = {
      ...adminUser,
      role: 'Coordinador',
      canCreateReservations: false,
      canEditReservations: false,
      canDeleteReservations: false
    };

    render(
      <ReservationContextMenu
        reservation={sampleReservation}
        x={100}
        y={100}
        currentUser={readLimitedUser}
        onClose={onClose}
        onViewDetails={vi.fn()}
        onEdit={vi.fn()}
        onReplace={vi.fn()}
        onDuplicate={vi.fn()}
        onRequestDelete={onRequestDelete}
      />
    );

    expect(screen.queryByText('Editar reserva')).toBeNull();
    expect(screen.queryByText('Reemplazar solo este día')).toBeNull();
    expect(screen.queryByText('Duplicar reserva')).toBeNull();
    expect(screen.getByText('Solicitar eliminación')).toBeTruthy();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
