// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuickRequestCreatorModal } from '../QuickRequestCreatorModal';
import { SPACES_LIST } from '../../data/spacesData';
import { analyzeReservationRequest } from '../../services/requestAiService';
import type { RequestAiExtraction } from '../../utils/requestAiSchema';

vi.mock('../../services/requestAiService', () => ({ analyzeReservationRequest: vi.fn() }));
beforeEach(() => { vi.mocked(analyzeReservationRequest).mockReset().mockRejectedValue(new Error('La IA no está configurada.')); });

const extraction: RequestAiExtraction = {
  descripcion: 'Taller de yoga', tipoActividad: null, tipoPrestamo: null, espacio: 'AUDITORIO',
  fecha: '2026-11-20', horaInicio: '18:00', horaFin: '20:00', cantidadParticipantes: 30,
  bookingMode: 'single', selectedDays: null, recurrenceStartDate: null, recurrenceEndDate: null,
  equipamientoSolicitado: null, montaje: null,
};

afterEach(cleanup);

function setup() {
  const create = vi.fn().mockResolvedValue(true);
  render(<QuickRequestCreatorModal isOpen onClose={vi.fn()} defaultDate="2026-11-20"
    availableSpaces={SPACES_LIST} allReservations={[]} onCreateDirectly={create} onOpenInFullForm={vi.fn()} />);
  return {
    create,
    type: (text: string) => fireEvent.change(screen.getByLabelText(/Escribe o pega la solicitud/i), { target: { value: text } }),
    save: async () => {
      if (screen.queryByRole('button', { name: /^Crear (?:Reserva|Serie) Automáticamente/ })) {
        fireEvent.click(screen.getByRole('button', { name: /^Crear (?:Reserva|Serie) Automáticamente/ }));
        if (!screen.queryByRole('alert')) await screen.findByRole('button', { name: /Confirmar y crear/ });
      }
      const confirm = screen.queryByRole('button', { name: /Confirmar y crear/ });
      if (confirm) fireEvent.click(confirm);
    },
  };
}

describe('crear reservas desde texto', () => {
  it('reconoce un espacio abreviado y muestra sus opciones sin capacidades', () => {
    const { type } = setup();
    type('juan vallejo, aud, taller de yoga el 20/11/2026 de 18 a 20 para 20 personas');
    expect((screen.getByLabelText('Espacio Asignado') as HTMLSelectElement).value).toBe('AUDITORIO');
    expect(screen.getAllByRole('option').every(option => !/Cap\.|capacidad/i.test(option.textContent || ''))).toBe(true);
  });

  it('muestra el nombre escrito en minúsculas sin exigir una etiqueta', () => {
    const { type } = setup();
    type('juan vallejo');
    expect((screen.getByLabelText('Nombre Solicitante / Responsable') as HTMLInputElement).value).toBe('juan vallejo');
  });

  it('no crea reservas vacías aunque existan valores predeterminados', async () => {
    const { save, create } = setup();
    await save();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Escribe o pega');
  });

  it('pide corregir una fecha imposible y acepta la corrección manual', async () => {
    const { type, save, create } = setup();
    type('Soy María Soto, necesito Auditorio el 31/11/2026 de 18 a 20 para 30 personas');
    expect(screen.getByRole('status').textContent).toContain('no es válida');
    await save();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Fecha$/), { target: { value: '2026-11-20' } });
    await save();
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toMatchObject({ fecha: '2026-11-20', horaInicio: '18:00', horaFin: '20:00' });
  });

  it('mantiene el bloqueo por feriado al recomputar la vista previa', async () => {
    const { type, save, create } = setup();
    type('Soy María Soto, necesito Auditorio el 25/12/2026 de 18 a 20');
    expect(screen.getByText(/Atención: Feriado/)).toBeTruthy();
    await save();
    expect(create).not.toHaveBeenCalled();
  });

  it('recalcula el aforo después de un ajuste manual', async () => {
    const { type, save, create } = setup();
    type('Soy María Soto, necesito Sala 2 el 20/11/2026 de 18 a 20 para 30 personas');
    await save();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Participantes/), { target: { value: '15' } });
    await save();
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
  });

  it('regenera la serie al ajustar la fecha de inicio', async () => {
    const { type, create, save } = setup();
    type('Soy María Soto, necesito Auditorio cada lunes desde 09/11/2026 hasta 30/11/2026 de 18 a 20');
    fireEvent.change(screen.getByLabelText('Inicio de Serie'), { target: { value: '2026-11-23' } });
    await save();
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0].fechaInicioRecurrencia).toBe('2026-11-23');
    expect(create.mock.calls[0][2]).toEqual(['2026-11-23', '2026-11-30']);
  });

  it('analiza primero, conserva ajustes y exige confirmar antes de guardar', async () => {
    vi.mocked(analyzeReservationRequest).mockResolvedValue(extraction);
    const { type, create } = setup();
    type('Soy María Soto, necesito auditorio para yoga el 20/11/2026 de 18 a 20 para 30 personas');
    fireEvent.change(screen.getByLabelText(/Participantes/), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear Reserva Automáticamente' }));
    const confirm = await screen.findByRole('button', { name: 'Confirmar y crear reserva' });
    expect(create).not.toHaveBeenCalled();
    expect((screen.getByLabelText(/Participantes/) as HTMLInputElement).value).toBe('22');
    fireEvent.click(confirm);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toMatchObject({ cantidadParticipantes: 22, responsable: 'María Soto' });
    expect(analyzeReservationRequest).toHaveBeenCalledOnce();
  });

  it('bloquea un aforo inválido devuelto por IA y permite corregirlo', async () => {
    vi.mocked(analyzeReservationRequest).mockResolvedValue({ ...extraction, espacio: 'SALA 2', cantidadParticipantes: 500 });
    const { type, create } = setup();
    type('Necesito un espacio para yoga');
    fireEvent.click(screen.getByRole('button', { name: 'Crear Reserva Automáticamente' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar y crear reserva' }));
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Participantes/), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y crear reserva' }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
  });

  it('descarta análisis tardíos al editar el texto y evita doble consulta', async () => {
    let resolve!: (result: RequestAiExtraction) => void;
    vi.mocked(analyzeReservationRequest).mockImplementation(() => new Promise(done => { resolve = done; }));
    const { type, create } = setup();
    type('Necesito auditorio para yoga');
    const start = screen.getByRole('button', { name: 'Crear Reserva Automáticamente' });
    fireEvent.click(start);
    fireEvent.click(start);
    expect(analyzeReservationRequest).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: 'Analizando solicitud…' }) as HTMLButtonElement).disabled).toBe(true);
    const signal = vi.mocked(analyzeReservationRequest).mock.calls[0][3];
    type('Nueva solicitud de baile');
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(extraction));
    expect(screen.queryByRole('button', { name: /Confirmar y crear/ })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('cancela al cerrar e ignora una respuesta tardía', async () => {
    let resolve!: (result: RequestAiExtraction) => void;
    vi.mocked(analyzeReservationRequest).mockImplementation(() => new Promise(done => { resolve = done; }));
    const { type, create } = setup();
    type('Necesito sala para yoga');
    fireEvent.click(screen.getByRole('button', { name: 'Crear Reserva Automáticamente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(vi.mocked(analyzeReservationRequest).mock.calls[0][3].aborted).toBe(true);
    await act(async () => resolve(extraction));
    expect(screen.queryByRole('button', { name: /Confirmar y crear/ })).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
