// @vitest-environment jsdom
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useRatingsState } from '../useRatingsState';
import { useAdminConfig } from '../useAdminConfig';

const mocks = vi.hoisted(() => ({ ratings: vi.fn(), equipment: vi.fn(), users: vi.fn(), config: vi.fn(),
  stopRatings: vi.fn(), stopEquipment: vi.fn(), email: vi.fn() }));
vi.mock('../../services/ratingService', async original => ({ ...await original<any>(),
  subscribeToRatings: mocks.ratings, checkAutomaticMondayEmail: mocks.email,
}));
vi.mock('../../services/equipmentService', async original => ({ ...await original<any>(), subscribeToEquipment: mocks.equipment }));
vi.mock('../../services/authService', async original => ({ ...await original<any>(), subscribeToUsers: mocks.users }));
vi.mock('../../services/adminConfigService', async original => ({ ...await original<any>(), subscribeToAdminConfig: mocks.config }));
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  mocks.ratings.mockReturnValue(mocks.stopRatings); mocks.equipment.mockReturnValue(mocks.stopEquipment);
  mocks.users.mockReturnValue(vi.fn()); mocks.config.mockReturnValue(vi.fn());
});
afterEach(cleanup);

it('loads ratings only when requested and leaves automatic email checks disabled for readers', () => {
  const rows = [{ id: 'a' }] as any;
  const { rerender } = renderHook(({ enabled }) => useRatingsState(rows, { enabled, automaticEmailEnabled: false }),
    { initialProps: { enabled: false } });
  expect(mocks.ratings).not.toHaveBeenCalled(); expect(mocks.email).not.toHaveBeenCalled();
  rerender({ enabled: true }); expect(mocks.ratings).toHaveBeenCalledOnce(); expect(mocks.email).not.toHaveBeenCalled();
  rerender({ enabled: false }); expect(mocks.stopRatings).toHaveBeenCalledOnce();
});

it('defers equipment while keeping permission and calendar configuration listeners active', () => {
  const toast = vi.fn();
  const { rerender, unmount } = renderHook(({ equipmentEnabled }) => useAdminConfig(null, toast, { equipmentEnabled }),
    { initialProps: { equipmentEnabled: false } });
  expect(mocks.equipment).not.toHaveBeenCalled(); expect(mocks.users).toHaveBeenCalledOnce(); expect(mocks.config).toHaveBeenCalledOnce();
  rerender({ equipmentEnabled: true }); expect(mocks.equipment).toHaveBeenCalledOnce();
  rerender({ equipmentEnabled: false }); expect(mocks.stopEquipment).toHaveBeenCalledOnce();
  unmount();
});
