// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuickCheckInModal } from '../QuickCheckInModal';
import { Reservation } from '../../types';
import { AuthUser } from '../../services/authService';

const mockUser: AuthUser = {
  username: 'auxiliar1',
  name: 'Juan Pérez (Auxiliar)',
  role: 'Auxiliar',
  initials: 'JP',
  avatarColor: 'bg-amber-600',
  canCreateReservations: true,
  canEditReservations: true,
  canDeleteReservations: false
};

const mockReservation: Reservation = {
  id: 'RES_TEST_CHECKIN',
  espacio: 'Sala de Clases 1',
  tipoActividad: 'Taller de Pintura',
  descripcion: 'Taller de Pintura para jóvenes',
  actividadRecurrente: 'No',
  fecha: '2026-11-06',
  horaInicio: '10:00',
  horaFin: '12:00',
  responsable: 'María González',
  cantidadParticipantes: 15,
  realizada: 'Pendiente',
  estado: 'activa'
};

describe('QuickCheckInModal', () => {
  it('renders check-in options and saves attendance with user audit', async () => {
    const handleSave = vi.fn().mockResolvedValue(true);
    const handleClose = vi.fn();

    render(
      <QuickCheckInModal
        isOpen={true}
        onClose={handleClose}
        reservation={mockReservation}
        currentUser={mockUser}
        onSaveCheckIn={handleSave}
      />
    );

    expect(screen.getByText(/Registro Rápido de Asistencia \/ Ejecución/i)).toBeTruthy();
    expect(screen.getByText(/Taller de Pintura/i)).toBeTruthy();
    expect(screen.getByText(/Sala de Clases 1/i)).toBeTruthy();

    // Select "Realizada"
    const realizadaBtn = screen.getByRole('button', { name: /Realizada/i });
    fireEvent.click(realizadaBtn);

    // Click quick adjustment +5
    const plusFiveBtn = screen.getByRole('button', { name: /\+5/ });
    fireEvent.click(plusFiveBtn);

    // Click an observation chip
    const chipBtn = screen.getByRole('button', { name: /\+ Espacio entregado limpio y ordenado/i });
    fireEvent.click(chipBtn);

    // Save
    const saveBtn = screen.getByRole('button', { name: /Guardar Asistencia/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledTimes(1);
    });

    const savedReservation = handleSave.mock.calls[0][0] as Reservation;
    expect(savedReservation.realizada).toBe('Sí');
    expect(savedReservation.cantidadParticipantes).toBe(20);
    expect(savedReservation.checkInRegistro).toBeDefined();
    expect(savedReservation.checkInRegistro?.registradoPor).toBe('Juan Pérez (Auxiliar)');
    expect(savedReservation.checkInRegistro?.estado).toBe('Sí');
    expect(savedReservation.checkInRegistro?.participantesReales).toBe(20);
    expect(savedReservation.checkInRegistro?.notas).toContain('Espacio entregado limpio y ordenado');
    expect(handleClose).toHaveBeenCalled();
  });

  it('allows recording a No-show (No Asistió)', async () => {
    const handleSave = vi.fn().mockResolvedValue(true);
    const handleClose = vi.fn();

    render(
      <QuickCheckInModal
        isOpen={true}
        onClose={handleClose}
        reservation={mockReservation}
        currentUser={mockUser}
        onSaveCheckIn={handleSave}
      />
    );

    // Select "No Asistió"
    const noShowBtn = screen.getByRole('button', { name: /No Asistió/i });
    fireEvent.click(noShowBtn);

    // Save
    const saveBtn = screen.getByRole('button', { name: /Guardar Asistencia/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledTimes(1);
    });

    const savedReservation = handleSave.mock.calls[0][0] as Reservation;
    expect(savedReservation.realizada).toBe('No');
    expect(savedReservation.cantidadParticipantes).toBe(0);
    expect(savedReservation.checkInRegistro?.estado).toBe('No');
  });
});
