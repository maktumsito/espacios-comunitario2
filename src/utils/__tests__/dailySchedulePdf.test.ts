import { describe, expect, it } from 'vitest';
import type { Reservation } from '../../types';
import { generateDailyPdfsForDates, generateDailySchedulePdf } from '../dailySchedulePdf';

const booking = (id: string, fecha = '2026-10-01'): Reservation => ({
  id, fecha, horaInicio: '09:00', horaFin: '10:00', espacio: 'SALA 2', responsable: 'Ana Pérez',
  tipoActividad: 'Taller', descripcion: id, actividadRecurrente: 'No', importante: 'Sí'
});

describe('Daily landscape PDF attachments', () => {
  it('uses title case for visible booking fields while preserving the source record', async () => {
    const raw = Object.freeze({ ...booking('raw_ID'), descripcion: 'TALLER de DANZA', tipoActividad: 'TALLER CCD', responsable: 'mARIA pEREZ' });
    const doc = await generateDailySchedulePdf({ dateStr: raw.fecha, reservations: [raw] });
    const output = doc.output();
    expect(output).toContain('Taller De Danza');
    expect(output).toContain('Taller Ccd');
    expect(output).toContain('Maria Perez');
    expect(output).toContain('Sala 2');
    expect(raw).toMatchObject({ id: 'raw_ID', espacio: 'SALA 2', descripcion: 'TALLER de DANZA', responsable: 'mARIA pEREZ' });
  });

  it('generates one independent folio landscape PDF per unique day without leaking important activities', async () => {
    const items = await generateDailyPdfsForDates(['2026-10-02', '2026-10-01', '2026-10-01'], [
      booking('ONLY_THURSDAY'), booking('ONLY_FRIDAY', '2026-10-02'),
      { ...booking('CANCELLED'), estado: 'Cancelada' }
    ], { include3DaysImportant: true });
    expect(items.map(item => item.date)).toEqual(['2026-10-01', '2026-10-02']);
    for (const item of items) {
      expect(item.activitiesCount).toBe(1);
      expect(item.doc.internal.pageSize.getWidth()).toBeCloseTo(330.2, 1);
      expect(item.doc.internal.pageSize.getHeight()).toBeCloseTo(215.9, 1);
      expect(item.doc.getNumberOfPages()).toBe(1);
      const pdf = item.doc.output();
      expect(pdf).toContain(item.date === '2026-10-01' ? 'Only_Thursday' : 'Only_Friday');
      expect(pdf).not.toContain(item.date === '2026-10-01' ? 'Only_Friday' : 'Only_Thursday');
      expect(pdf).not.toContain('Cancelled');
    }
  });

  it('uses the available height for sparse schedules and keeps dense schedules readable', async () => {
    const sparse = await generateDailySchedulePdf({ dateStr: '2026-10-01', reservations: [booking('sparse')] });
    const table = (sparse as typeof sparse & { lastAutoTable: { finalY: number } }).lastAutoTable;
    expect(table.finalY).toBeGreaterThan(195);
    expect(table.finalY).toBeLessThan(202);
    const dense = await generateDailySchedulePdf({ dateStr: '2026-10-01', reservations: Array.from({ length: 45 }, (_, i) => ({
      ...booking(`ROW_${i}`), descripcion: `ROW_${i} ` + 'Detalle de actividad y equipamiento. '.repeat(8)
    })) });
    expect(dense.getNumberOfPages()).toBeGreaterThan(1);
    expect(dense.output()).toContain('Row_44');
  });
});
