import { expect, it } from 'vitest';
import { generateRecurrenceDates, getChileLocalDateString } from '../../src/utils/dateUtils';
it('DATE-01 preserves civil recurrence dates around both Santiago DST transitions', () => {
  expect(generateRecurrenceDates('2026-03-29','2026-04-12',[0])).toEqual(['2026-03-29','2026-04-05','2026-04-12']);
  expect(generateRecurrenceDates('2026-08-30','2026-09-13',[0])).toEqual(['2026-08-30','2026-09-06','2026-09-13']);
  expect(getChileLocalDateString(new Date('2026-04-05T03:30:00Z'))).toBe('2026-04-04');
  expect(getChileLocalDateString(new Date('2026-09-06T04:30:00Z'))).toBe('2026-09-06');
});
