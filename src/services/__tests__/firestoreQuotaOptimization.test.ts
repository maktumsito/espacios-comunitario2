// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OBSOLETE_MINUTE_CONFLICT_IDS,
  isObsoleteConflictId,
  hasMinuteConflictMigrationRun,
  executeMinuteConflictCleanupMigration,
  MINUTE_CONFLICT_MIGRATION_KEY
} from '../migrations/cleanMinuteConflictsMigration';
import {
  getActiveWindowStartDate,
  isHistoricalMonthLoaded,
  cleanConflictingMinuteReservations,
  KNOWN_PURGED_MINUTE_CONFLICT_BASE_IDS,
  isPurgedMinuteConflictId
} from '../reservationService';
import { Reservation } from '../../types';

describe('Firestore Quota Optimization & Conflict Purge Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Migration & Obsolete Conflict ID Detection', () => {
    it('accurately identifies obsolete conflict IDs by exact match and prefix', () => {
      expect(isObsoleteConflictId('RSV_C16DD34DB5B7')).toBe(true);
      expect(isObsoleteConflictId('RSV_RSVC16DD34')).toBe(true);
      expect(isObsoleteConflictId('RSV_99CE0543F176_occurrence_1')).toBe(true);
      expect(isObsoleteConflictId('RSV_LEGITIMATE_2026_09')).toBe(false);
      expect(isObsoleteConflictId('RSV_01D6BBDFD27EC11A')).toBe(false);
      expect(isObsoleteConflictId('')).toBe(false);
    });

    it('contains all 22 known legacy conflict markers in migration module only', () => {
      expect(OBSOLETE_MINUTE_CONFLICT_IDS.length).toBe(22);
      // Ensure client reservation service exports neutralized static array
      expect(KNOWN_PURGED_MINUTE_CONFLICT_BASE_IDS.length).toBe(0);
      expect(isPurgedMinuteConflictId('RSV_C16DD34DB5B7')).toBe(false);
    });

    it('executes cleanup migration, purges local cache, and sets migration flag', async () => {
      expect(hasMinuteConflictMigrationRun()).toBe(false);

      // Seed localStorage with mixed reservations (valid + obsolete)
      const mixedData: Partial<Reservation>[] = [
        { id: 'RSV_VALID_01', fecha: '2026-09-22', horaInicio: '10:00', horaFin: '11:00', espacio: 'SALA 1' },
        { id: 'RSV_C16DD34DB5B7', fecha: '2026-09-22', horaInicio: '10:05', horaFin: '11:05', espacio: 'SALA 1' },
        { id: 'RSV_VALID_02', fecha: '2026-09-23', horaInicio: '14:00', horaFin: '15:00', espacio: 'GIMNASIO' }
      ];
      localStorage.setItem('reservas_comunitarias_cache_v6', JSON.stringify(mixedData));

      const result = await executeMinuteConflictCleanupMigration();
      expect(result.success).toBe(true);
      expect(result.deletedFromLocal).toBe(1);
      expect(hasMinuteConflictMigrationRun()).toBe(true);

      // Verify localStorage was purged
      const afterRaw = localStorage.getItem('reservas_comunitarias_cache_v6');
      const afterParsed: Reservation[] = JSON.parse(afterRaw || '[]');
      expect(afterParsed.length).toBe(2);
      expect(afterParsed.some((r) => r.id === 'RSV_C16DD34DB5B7')).toBe(false);
      expect(afterParsed.some((r) => r.id === 'RSV_VALID_01')).toBe(true);

      // Second run without force is skipped (idempotent)
      const secondResult = await executeMinuteConflictCleanupMigration();
      expect(secondResult.alreadyRun).toBe(true);
      expect(secondResult.deletedFromLocal).toBe(0);
    });
  });

  describe('Active Date Window & Partitioning Rules', () => {
    it('computes active window date strictly N days in the past in YYYY-MM-DD format', () => {
      const activeStart = getActiveWindowStartDate(90);
      expect(activeStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const d = new Date();
      d.setDate(d.getDate() - 90);
      const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      expect(activeStart).toBe(expected);
    });

    it('identifies whether historical month is loaded', () => {
      expect(isHistoricalMonthLoaded('2024-05')).toBe(false);
      expect(isHistoricalMonthLoaded('2024-05-15')).toBe(false);
    });
  });

  describe('Dynamic Minute Conflict Resolution (Without Static Array)', () => {
    it('detects minute-offset collisions dynamically and deletes the non-closed-hour reservation', async () => {
      const candidates: Reservation[] = [
        {
          id: 'RES_CLOSED_HOUR',
          fecha: '2026-10-15',
          horaInicio: '10:00',
          horaFin: '11:00',
          espacio: 'SALA 2',
          responsable: 'Monitor Regular',
          tipoActividad: 'TALLER',
          descripcion: 'Taller regular',
          actividadRecurrente: 'No',
          estado: 'activa'
        },
        {
          id: 'RES_MINUTE_OFFSET',
          fecha: '2026-10-15',
          horaInicio: '10:05',
          horaFin: '11:05',
          espacio: 'SALA 2',
          responsable: 'Monitor Duplicado',
          tipoActividad: 'TALLER',
          descripcion: 'Taller duplicado',
          actividadRecurrente: 'No',
          estado: 'activa'
        }
      ];

      const res = await cleanConflictingMinuteReservations(candidates);
      expect(res.deletedCount).toBe(1);
      expect(res.deletedReservations[0].id).toBe('RES_MINUTE_OFFSET');
      expect(res.remainingReservations.length).toBe(1);
      expect(res.remainingReservations[0].id).toBe('RES_CLOSED_HOUR');
    });

    it('preserves non-conflicting reservations on separate spaces or non-overlapping hours', async () => {
      const candidates: Reservation[] = [
        {
          id: 'RES_01',
          fecha: '2026-10-15',
          horaInicio: '10:00',
          horaFin: '11:00',
          espacio: 'SALA 1',
          responsable: 'A',
          tipoActividad: 'TALLER',
          descripcion: 'Taller sala 1',
          actividadRecurrente: 'No',
          estado: 'activa'
        },
        {
          id: 'RES_02',
          fecha: '2026-10-15',
          horaInicio: '10:00',
          horaFin: '11:00',
          espacio: 'SALA 2',
          responsable: 'B',
          tipoActividad: 'TALLER',
          descripcion: 'Taller sala 2',
          actividadRecurrente: 'No',
          estado: 'activa'
        }
      ];

      const res = await cleanConflictingMinuteReservations(candidates);
      expect(res.deletedCount).toBe(0);
      expect(res.remainingReservations.length).toBe(2);
    });
  });
});
