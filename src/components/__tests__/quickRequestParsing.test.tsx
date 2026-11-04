// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuickRequestCreatorModal } from '../QuickRequestCreatorModal';
import { SPACES_LIST } from '../../data/spacesData';

afterEach(cleanup);

function setup() {
  const create = vi.fn().mockResolvedValue(true);
  render(<QuickRequestCreatorModal isOpen onClose={vi.fn()} defaultDate="2026-11-20"
    availableSpaces={SPACES_LIST} allReservations={[]} onCreateDirectly={create} onOpenInFullForm={vi.fn()} />);
  return {
    create,
    type: (text: string) => fireEvent.change(screen.getByLabelText(/Escribe o pega la solicitud/i), { target: { value: text } }),
    save: () => fireEvent.click(screen.getByRole('button', { name: 'Crear Reserva Automáticamente' })),
  };
}

describe('crear reservas desde texto', () => {
  it('no crea reservas vacías aunque existan valores predeterminados', () => {
    const { save, create } = setup();
    save();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Escribe o pega');
  });

  it('pide corregir una fecha imposible y acepta la corrección manual', async () => {
    const { type, save, create } = setup();
    type('Soy María Soto, necesito Auditorio el 31/11/2026 de 18 a 20 para 30 personas');
    expect(screen.getByRole('status').textContent).toContain('no es válida');
    save();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Fecha$/), { target: { value: '2026-11-20' } });
    save();
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0]).toMatchObject({ fecha: '2026-11-20', horaInicio: '18:00', horaFin: '20:00' });
  });

  it('mantiene el bloqueo por feriado al recomputar la vista previa', () => {
    const { type, save, create } = setup();
    type('Soy María Soto, necesito Auditorio el 25/12/2026 de 18 a 20');
    expect(screen.getByText(/Atención: Feriado/)).toBeTruthy();
    save();
    expect(create).not.toHaveBeenCalled();
  });

  it('recalcula el aforo después de un ajuste manual', async () => {
    const { type, save, create } = setup();
    type('Soy María Soto, necesito Sala 2 el 20/11/2026 de 18 a 20 para 30 personas');
    save();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Participantes/), { target: { value: '15' } });
    save();
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
  });

  it('regenera la serie al ajustar la fecha de inicio', async () => {
    const { type, create } = setup();
    type('Soy María Soto, necesito Auditorio cada lunes desde 09/11/2026 hasta 30/11/2026 de 18 a 20');
    fireEvent.change(screen.getByLabelText('Inicio de Serie'), { target: { value: '2026-11-23' } });
    fireEvent.click(screen.getByRole('button', { name: /Crear Serie Automáticamente/ }));
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0][0].fechaInicioRecurrencia).toBe('2026-11-23');
    expect(create.mock.calls[0][2]).toEqual(['2026-11-23', '2026-11-30']);
  });
});
