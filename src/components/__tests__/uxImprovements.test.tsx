// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReservationStep1Activity } from '../ReservationStep1Activity';
import { ReservationConflictBanner } from '../ReservationConflictBanner';
import { ReservationDetailModal } from '../ReservationDetailModal';
import { Navbar } from '../Navbar';
import { CalendarView } from '../CalendarView';
import { ReservationVisualsProvider } from '../../contexts/ReservationVisualsContext';
import type { AuthUser } from '../../services/authService';
import type { Reservation, SpaceInfo } from '../../types';

afterEach(cleanup);

const baseSpace: SpaceInfo = {
  id: 'sala-3',
  name: 'SALA 3',
  category: 'Salas',
  capacity: 25,
  color: '#2563eb',
  iconName: 'Building2',
  description: 'Sala multiuso',
  activo: true,
};

const sampleReservation: Reservation = {
  id: 'RSV_UX_1',
  fecha: '2027-05-12',
  horaInicio: '15:00',
  horaFin: '17:00',
  espacio: 'SALA 3',
  responsable: 'María González',
  telefonoContacto: '+56 9 5555 1234',
  emailContacto: 'maria@ejemplo.cl',
  rut: '12.345.678-9',
  domicilio: 'Av. Apoquindo 1234',
  tipoActividad: 'TALLER MUNICIPAL',
  actividadRecurrente: 'No',
  unidadMunicipal: 'Dirección de Deportes',
  descripcion: 'Taller de Yoga Vecinal',
  estado: 'activa',
};

describe('UX, privacy, and role improvements', () => {
  it('shows optional municipal unit field with example for TALLER MUNICIPAL', () => {
    const setFormData = vi.fn();
    render(
      <ReservationVisualsProvider activityTypes={[]} reservations={[sampleReservation]}>
        <ReservationStep1Activity
          isWizardMode
          formData={{ tipoActividad: 'TALLER MUNICIPAL', descripcion: 'Taller Municipal de Teatro' }}
          setFormData={setFormData}
          descriptionValidation={{ isValid: true }}
          effectiveActivityNames={['TALLER MUNICIPAL', 'CUMPLEAÑOS']}
        />
      </ReservationVisualsProvider>
    );

    expect(screen.getByLabelText(/¿A qué dirección o departamento pertenece\?/i)).toBeTruthy();
    expect(screen.getByText(/Opcional\. Indica la unidad municipal/i)).toBeTruthy();
  });

  it('hides conflict override checkbox for non-manager staff and explains actionable alternatives', () => {
    render(
      <ReservationConflictBanner
        conflicts={[sampleReservation]}
        candidateConflictDates={['2027-05-12']}
        formData={{ fecha: '2027-05-12', horaInicio: '15:00', horaFin: '17:00', espacio: 'SALA 3' }}
        mainDuration={120}
        allReservations={[sampleReservation]}
        availableSpaces={[baseSpace]}
        allowConflictOverride={false}
        canOverrideConflicts={false}
        setAllowConflictOverride={vi.fn()}
        onOpenConflictDialog={vi.fn()}
        onShiftImmediatelyAfter={vi.fn()}
        onApplyRecommendation={vi.fn()}
        onFindNextAvailableSlot={vi.fn()}
      />
    );

    expect(screen.getByText(/está ocupada de 15:00 a 17:00/i)).toBeTruthy();
    expect(screen.queryByText(/Permitir guardar a pesar del conflicto/i)).toBeNull();
  });

  it('hides RUT, email and address for Auxiliar in ReservationDetailModal while keeping operational phone and municipal unit', () => {
    const auxiliarUser: AuthUser = {
      username: 'auxiliar1',
      name: 'Carlos Auxiliar',
      role: 'Auxiliar',
      initials: 'CA',
      avatarColor: '#2563eb',
    };

    render(
      <ReservationVisualsProvider activityTypes={[]} reservations={[sampleReservation]}>
        <ReservationDetailModal
          reservation={sampleReservation}
          isOpen
          onClose={vi.fn()}
          onEdit={vi.fn()}
          currentUser={auxiliarUser}
        />
      </ReservationVisualsProvider>
    );

    expect(screen.getByText('+56 9 5555 1234')).toBeTruthy();
    expect(screen.getByText(/Dirección de Deportes/)).toBeTruthy();
    expect(screen.queryByText(/12\.345\.678-9/)).toBeNull();
    expect(screen.queryByText(/maria@ejemplo\.cl/)).toBeNull();
    expect(screen.queryByText(/Av\. Apoquindo 1234/)).toBeNull();
  });

  it('hides reservation creation controls in Navbar and CalendarView when user lacks permission', () => {
    const { container } = render(
      <Navbar
        currentView="calendar"
        onViewChange={vi.fn()}
        onOpenImportExport={vi.fn()}
        totalReservas={1}
        conflictsCount={0}
      />
    );
    expect(container.querySelector('#btn-new-reservation')).toBeNull();
    expect(container.querySelector('#btn-mobile-new-reservation')).toBeNull();

    render(
      <ReservationVisualsProvider activityTypes={[]} reservations={[sampleReservation]}>
        <CalendarView
          reservations={[sampleReservation]}
          spaces={[baseSpace]}
          selectedDate={new Date('2027-05-12T12:00:00')}
          onSelectReservation={vi.fn()}
          onNewReservationForDate={vi.fn()}
          canCreateReservations={false}
        />
      </ReservationVisualsProvider>
    );

    expect(document.querySelector('#btn-cal-add-for-day')).toBeNull();
    const agendaCard = screen.getByRole('button', { name: /Ver detalles de reserva: Taller De Yoga Vecinal/i });
    expect(agendaCard.getAttribute('title')).not.toContain('Teléfono');
    expect(screen.getAllByText(/Sala 3/i).length).toBeGreaterThan(0);
  });
});
