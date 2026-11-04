import { describe, expect, it } from 'vitest';
import { parseReservationRequestText } from '../requestTextParser';
import type { ActivityTypeItem, EquipmentItem, LoanType, Reservation, SpaceInfo } from '../../types';

const mockSpaces: SpaceInfo[] = [
  {
    id: 'sp-1',
    name: 'Sala Multiuso 1',
    capacity: 20,
    category: 'Salas de Clases',
    iconName: 'Building2',
    color: '#2563eb',
    description: 'Sala pequeña',
    activo: true,
  },
  {
    id: 'sp-2',
    name: 'Salón Auditorio',
    capacity: 80,
    category: 'Eventos',
    iconName: 'Theater',
    color: '#9333ea',
    description: 'Auditorio principal',
    activo: true,
  },
  {
    id: 'sp-3',
    name: 'Sala Espejos',
    capacity: 35,
    category: 'Deportes',
    iconName: 'Sparkles',
    color: '#16a34a',
    description: 'Danza y expresión',
    activo: true,
  },
];

const mockActivities: ActivityTypeItem[] = [
  { id: 'act-1', name: 'TALLER CCD', category: 'Talleres', color: '#2563eb' },
  { id: 'act-2', name: 'REUNIÓN', category: 'Reuniones', color: '#16a34a' },
  { id: 'act-3', name: 'CHARLA / SEMINARIO', category: 'Eventos', color: '#9333ea' },
];

const mockLoans: LoanType[] = [
  { id: 'ln-1', name: 'TALLER FORMATIVO CCD' },
  { id: 'ln-2', name: 'PRÉSTAMO EXTERNO' },
];

const mockEquipment: EquipmentItem[] = [
  { id: 'eq-1', name: 'Proyector Multimedia', category: 'Audiovisual', totalQuantity: 3 },
  { id: 'eq-2', name: 'Micrófono Inalámbrico', category: 'Audio', totalQuantity: 4 },
  { id: 'eq-3', name: 'Sillas Apilables', category: 'Mobiliario', totalQuantity: 100 },
  { id: 'eq-4', name: 'Mesas Plegables', category: 'Mobiliario', totalQuantity: 20 },
];

describe('parseReservationRequestText', () => {
  it('extrae datos completos de solicitante, fecha, horario, sala, aforo, equipamiento y montaje desde texto estructurado', () => {
    const raw = `
Solicitante: María Alejandra Soto Rivas
RUT: 12.345.678-5
Teléfono: +56 9 8765 4321
Correo: maria.soto@lascondes.cl
Dirección: Av. Apoquindo 4500, Las Condes
Actividad: Taller de Acuarela Adulto Mayor
Espacio: Sala Multiuso 1
Fecha: 15/05/2026
Horario: 10:00 a 12:00 hrs
Participantes: 18 personas
Equipos: 1 proyector, 18 sillas y 4 mesas
Montaje en U para taller práctico
    `.trim();

    const parsed = parseReservationRequestText(raw, {
      availableSpaces: mockSpaces,
      availableActivityTypes: mockActivities,
      availableLoanTypes: mockLoans,
      availableEquipment: mockEquipment,
      allReservations: [],
      spaceBlocks: [],
      defaultDate: '2026-05-01',
    });

    expect(parsed.responsable).toBe('María Alejandra Soto Rivas');
    expect(parsed.rut).toBe('12.345.678-5');
    expect(parsed.telefonoContacto).toBe('+56 9 8765 4321');
    expect(parsed.emailContacto).toBe('maria.soto@lascondes.cl');
    expect(parsed.domicilio).toContain('Av. Apoquindo 4500');
    expect(parsed.descripcion).toBe('Taller de Acuarela Adulto Mayor');
    expect(parsed.espacio).toBe('Sala Multiuso 1');
    expect(parsed.fecha).toBe('2026-05-15');
    expect(parsed.horaInicio).toBe('10:00');
    expect(parsed.horaFin).toBe('12:00');
    expect(parsed.cantidadParticipantes).toBe(18);
    expect(parsed.montaje?.tipo).toBe('u');
    expect(parsed.equipamientoSolicitado).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ equipmentName: 'Proyector Multimedia', quantity: 1 }),
        expect.objectContaining({ equipmentName: 'Sillas Apilables', quantity: 18 }),
        expect.objectContaining({ equipmentName: 'Mesas Plegables', quantity: 4 }),
      ])
    );
  });

  it('enriquece automáticamente RUT, teléfono, correo y domicilio desde el historial de solicitantes', () => {
    const existingReservations: Reservation[] = [
      {
        id: 'RSV_HIST_1',
        fecha: '2026-04-10',
        horaInicio: '09:00',
        horaFin: '11:00',
        espacio: 'Salón Auditorio',
        responsable: 'Roberto Gómez Bolaños',
        rut: '9.876.543-3',
        telefonoContacto: '+56 9 9123 4567',
        emailContacto: 'rgomez@vecinos.cl',
        domicilio: 'Calle Colón 8100, Las Condes',
        tipoActividad: 'REUNIÓN',
        tipoPrestamo: 'PRÉSTAMO EXTERNO',
        descripcion: 'Reunión Comité de Seguridad',
        actividadRecurrente: 'No',
        cantidadParticipantes: 40,
        realizada: 'Sí',
      },
    ];

    const raw = `
Hola, solicita Roberto Gómez Bolaños para Reunión de Seguridad Vecinal el 20/05/2026 de 18:30 a 20:00 en Salón Auditorio para 45 personas.
    `.trim();

    const parsed = parseReservationRequestText(raw, {
      availableSpaces: mockSpaces,
      availableActivityTypes: mockActivities,
      availableLoanTypes: mockLoans,
      availableEquipment: mockEquipment,
      allReservations: existingReservations,
      spaceBlocks: [],
      defaultDate: '2026-05-01',
    });

    expect(parsed.matchedFromHistory).toBe(true);
    expect(parsed.responsable).toBe('Roberto Gómez Bolaños');
    expect(parsed.rut).toBe('9.876.543-3');
    expect(parsed.telefonoContacto).toBe('+56 9 9123 4567');
    expect(parsed.emailContacto).toBe('rgomez@vecinos.cl');
    expect(parsed.domicilio).toBe('Calle Colón 8100, Las Condes');
    expect(parsed.fecha).toBe('2026-05-20');
    expect(parsed.horaInicio).toBe('18:30');
    expect(parsed.horaFin).toBe('20:00');
    expect(parsed.espacio).toBe('Salón Auditorio');
    expect(parsed.cantidadParticipantes).toBe(45);
  });

  it('detecta solicitudes recurrentes semanales y genera las fechas de la serie', () => {
    const raw = `
Solicitante: Carolina Muñoz
Teléfono: +56911223344
Correo: cmunoz@gmail.com
Actividad: Clases de Yoga y Pilates
Espacio: Sala Espejos
Todos los martes y jueves desde 05/05/2026 hasta 28/05/2026 de 09:30 a 11:00 hrs para 22 personas.
    `.trim();

    const parsed = parseReservationRequestText(raw, {
      availableSpaces: mockSpaces,
      availableActivityTypes: mockActivities,
      availableLoanTypes: mockLoans,
      availableEquipment: mockEquipment,
      allReservations: [],
      spaceBlocks: [],
      defaultDate: '2026-05-01',
    });

    expect(parsed.bookingMode).toBe('pattern');
    expect(parsed.selectedDays).toEqual([2, 4]);
    expect(parsed.diasSemana).toBe('martes,jueves');
    expect(parsed.recurrenceStartDate).toBe('2026-05-05');
    expect(parsed.recurrenceEndDate).toBe('2026-05-28');
    // 8 sesiones martes/jueves entre 05/05 y 28/05 menos el feriado 21/05 (Glorias Navales) = 7 fechas hábiles
    expect(parsed.generatedSeriesDates.length).toBe(7);
    expect(parsed.generatedSeriesDates).not.toContain('2026-05-21');
    expect(parsed.generatedSeriesDates[0]).toBe('2026-05-05');
    expect(parsed.generatedSeriesDates[parsed.generatedSeriesDates.length - 1]).toBe('2026-05-28');
  });

  it('auto-asigna un espacio libre con capacidad suficiente cuando no se especifica sala', () => {
    const existingReservations: Reservation[] = [
      {
        id: 'RSV_BUSY_1',
        fecha: '2026-05-22',
        horaInicio: '15:00',
        horaFin: '17:00',
        espacio: 'Sala Espejos',
        responsable: 'Otro Usuario',
        telefonoContacto: '+56900000000',
        emailContacto: 'otro@test.cl',
        tipoActividad: 'TALLER CCD',
        tipoPrestamo: 'TALLER FORMATIVO CCD',
        descripcion: 'Ocupado',
        actividadRecurrente: 'No',
        cantidadParticipantes: 25,
        realizada: 'No',
      },
    ];

    const raw = `
Solicitante: Pedro Pascal
Correo: pedro@cultura.cl
Actividad: Charla de Patrimonio Cultural
Fecha: 22/05/2026 de 15:00 a 17:00
Asistentes: 30 personas
    `.trim();

    const parsed = parseReservationRequestText(raw, {
      availableSpaces: mockSpaces,
      availableActivityTypes: mockActivities,
      availableLoanTypes: mockLoans,
      availableEquipment: mockEquipment,
      allReservations: existingReservations,
      spaceBlocks: [],
      defaultDate: '2026-05-01',
    });

    // Sala Multiuso 1 tiene capacidad 20 (<30), Sala Espejos (35) está ocupada a las 15:00-17:00, por lo que elige Salón Auditorio (80)
    expect(parsed.espacio).toBe('Salón Auditorio');
    expect(parsed.spaceWasAutoSelected).toBe(true);
    expect(parsed.hasConflict).toBe(false);
  });
});
