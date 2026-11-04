// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getActiveWindowStartDate,
  isHistoricalMonthLoaded
} from '../reservationService';

describe('Firestore Quota Optimization & Active Window Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
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
});
