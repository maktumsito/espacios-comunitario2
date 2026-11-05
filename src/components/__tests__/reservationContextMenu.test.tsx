// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReservationContextMenu } from '../common/ReservationContextMenu';
import { QuickRequestCreatorModal } from '../QuickRequestCreatorModal';
import type { Reservation } from '../../types';
import type { AuthUser } from '../../services/authService';

vi.mock('../../services/requestAiService', () => ({
  analyzeReservationRequest: vi.fn().mockRejectedValue(new Error('IA sin configurar')),
}));

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

  it('renders calendar context menu actions when right-clicking anywhere on the calendar outside a reservation', () => {
    const onClose = vi.fn();
    const onCreateReservation = vi.fn();
    const onNavigateToDay = vi.fn();
    const onGoToday = vi.fn();
    const onOpenPrintModal = vi.fn();
    const onOpenGmailDispatch = vi.fn();
    const onOpenCommandPalette = vi.fn();
    const onToggleFilters = vi.fn();
    const onDeleteDay = vi.fn();

    render(
      <ReservationContextMenu
        reservation={null}
        calendarContext={{
          dateStr: '2026-10-15',
          spaceName: 'AUDITORIO',
          startTime: '11:00',
          endTime: '12:00',
          viewMode: 'calendar'
        }}
        x={200}
        y={220}
        currentUser={adminUser}
        isFilterBarOpen={false}
        onClose={onClose}
        onCreateReservation={onCreateReservation}
        onNavigateToDay={onNavigateToDay}
        onGoToday={onGoToday}
        onOpenPrintModal={onOpenPrintModal}
        onOpenGmailDispatch={onOpenGmailDispatch}
        onOpenCommandPalette={onOpenCommandPalette}
        onToggleFilters={onToggleFilters}
        onDeleteDay={onDeleteDay}
      />
    );

    expect(screen.getByRole('menu')).toBeTruthy();
    expect(screen.getByText('15-10-2026')).toBeTruthy();
    expect(screen.getByText('Nueva reserva en Auditorio (11:00)')).toBeTruthy();
    expect(screen.getByText('Ver vista diaria de esta fecha')).toBeTruthy();
    expect(screen.getByText('Ir al día de hoy')).toBeTruthy();
    expect(screen.getByText('Imprimir / PDF programación del día')).toBeTruthy();
    expect(screen.getByText('Enviar programación por Gmail')).toBeTruthy();
    expect(screen.getByText('Buscar en la agenda (Ctrl+K)')).toBeTruthy();
    expect(screen.getByText('Mostrar filtros de agenda')).toBeTruthy();
    expect(screen.getByText('Eliminar reservas del día')).toBeTruthy();

    fireEvent.click(screen.getByText('Nueva reserva en Auditorio (11:00)'));
    expect(onCreateReservation).toHaveBeenCalledWith({
      date: '2026-10-15',
      space: 'AUDITORIO',
      startTime: '11:00',
      endTime: '12:00'
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenQuickRequest from calendar context menu and renders QuickRequestCreatorModal as a fixed viewport overlay', async () => {
    const onClose = vi.fn();
    const onOpenQuickRequest = vi.fn();

    render(
      <ReservationContextMenu
        reservation={null}
        calendarContext={{
          dateStr: '2026-11-20',
          spaceName: 'AUDITORIO',
          startTime: '10:00',
          endTime: '11:30',
          viewMode: 'calendar'
        }}
        x={200}
        y={220}
        currentUser={adminUser}
        onClose={onClose}
        onOpenQuickRequest={onOpenQuickRequest}
      />
    );

    const quickBtn = screen.getByText('Crear desde texto de solicitud...');
    fireEvent.click(quickBtn);
    expect(onOpenQuickRequest).toHaveBeenCalledWith({
      date: '2026-11-20',
      space: 'AUDITORIO',
      startTime: '10:00',
      endTime: '11:30'
    });

    const onCreateDirectly = vi.fn();
    const onOpenInFullForm = vi.fn();
    const onModalClose = vi.fn();

    render(
      <QuickRequestCreatorModal
        isOpen={true}
        onClose={onModalClose}
        defaultDate="2026-11-20"
        defaultSpace="AUDITORIO"
        defaultStartTime="10:00"
        defaultEndTime="11:30"
        availableSpaces={[
          { id: 'sp-1', name: 'AUDITORIO', capacity: 80, color: '#2563eb', activo: true, category: 'Eventos', iconName: 'Building2', description: '' }
        ]}
        allReservations={[]}
        onCreateDirectly={onCreateDirectly}
        onOpenInFullForm={onOpenInFullForm}
      />
    );

    const dialog = screen.getByRole('dialog', {
      name: 'Crear reserva automática desde solicitud escrita'
    });
    expect(dialog.className).toContain('fixed');
    expect(dialog.className).toContain('inset-0');

    const textarea = screen.getByLabelText(/Escribe o pega la solicitud/i);
    fireEvent.change(textarea, {
      target: {
        value:
          'Juan Pérez (RUT 12.345.678-5, tel +56912345678, juan@lascondes.cl) solicita Auditorio para Reunión Vecinal el 20-11-2026 de 10:00 a 11:30 para 30 personas'
      }
    });

    fireEvent.click(screen.getByText('Crear Reserva Automáticamente'));
    expect(onCreateDirectly).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /Confirmar y crear con detector local/ }));
    expect(onCreateDirectly).toHaveBeenCalledTimes(1);
  });
});
