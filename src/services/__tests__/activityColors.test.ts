// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import type { ActivityTypeItem } from '../../types';

const sdk = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock('../../firebase/gateway', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  setDoc: sdk.write, collection: vi.fn(), writeBatch: vi.fn(), query: vi.fn(), where: vi.fn(), documentId: vi.fn(),
}));
import { DEFAULT_ACTIVITY_ITEMS, getStoredActivityTypes, saveActivityTypeItem } from '../adminConfigService';

const key = 'espacios_comunitarios_activities_v2';
const custom: ActivityTypeItem = { id: 'CUSTOM', name: 'CONVENIO', category: 'General', color: '#0284c7' };
beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); sdk.write.mockResolvedValue(undefined); });

it('automatically assigns and saves an unused color without changing existing type colors', async () => {
  const result = await saveActivityTypeItem(custom);
  expect(result.slice(0, -1)).toEqual(DEFAULT_ACTIVITY_ITEMS);
  const added = result.at(-1)!;
  expect(added.color).not.toBe(custom.color);
  expect(new Set(result.map(item => item.color)).size).toBe(result.length);
  expect(sdk.write.mock.calls[0][1].data).toEqual(result);
  expect(getStoredActivityTypes()).toEqual(result);
});

it('keeps the color when editing a type and repairs a conflicting selection', async () => {
  const original = DEFAULT_ACTIVITY_ITEMS[0];
  const same = await saveActivityTypeItem({ ...original, description: 'Actualizada' });
  expect(same[0].color).toBe(original.color);
  const changed = await saveActivityTypeItem({ ...same[0], color: same[1].color });
  expect(changed[1].color).toBe(same[1].color);
  expect(new Set(changed.map(item => item.color)).size).toBe(changed.length);
});

it('repairs cached legacy duplicates and never stores an unconfirmed remote change', async () => {
  localStorage.setItem(key, JSON.stringify([...DEFAULT_ACTIVITY_ITEMS, custom]));
  const repaired = getStoredActivityTypes();
  expect(new Set(repaired.map(item => item.color)).size).toBe(repaired.length);
  const before = localStorage.getItem(key);
  sdk.write.mockRejectedValueOnce(new Error('write denied'));
  await expect(saveActivityTypeItem({ ...custom, id: 'OTHER', name: 'OTRO CONVENIO' })).rejects.toThrow('write denied');
  expect(localStorage.getItem(key)).toBe(before);
});
