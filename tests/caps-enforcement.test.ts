import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(),
    query: { settings: { findFirst: vi.fn() } },
  },
}));

// B-3.1: caps read the caller's settings row via the accessor.
vi.mock('@/lib/settings/accessor', () => ({
  getSettingsForUser: vi.fn(),
}));

import { getSettingsForUser } from '@/lib/settings/accessor';
import { db } from '@/lib/db/client';
import { canStartBatch } from '@/lib/caps/enforcement';

const USER = 'user-1';

// The usage query is db.select().from(designs).innerJoin(batches).where() → [{count,spent}]
function mockUsage(count: number, spent: number) {
  vi.mocked(db.select).mockReturnValue({
    from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([{ count, spent }]) }) }),
  } as never);
}

describe('canStartBatch', () => {
  it('rejects when there is no user', async () => {
    const r = await canStartBatch({ requestedCount: 1, userId: null });
    expect(r.ok).toBe(false);
  });

  it('allows when under all caps and kill switch off', async () => {
    vi.mocked(getSettingsForUser).mockResolvedValue({
      id: 1, userId: USER, dailyGenerationCap: 50, dailyPublishCap: 15,
      dailyBudgetCents: 500, killSwitchActive: false,
    } as never);
    mockUsage(10, 200);

    const r = await canStartBatch({ requestedCount: 20, userId: USER });
    expect(r.ok).toBe(true);
  });

  it('blocks when kill switch on', async () => {
    vi.mocked(getSettingsForUser).mockResolvedValue({
      id: 1, userId: USER, dailyGenerationCap: 50, dailyPublishCap: 15,
      dailyBudgetCents: 500, killSwitchActive: true,
    } as never);

    const r = await canStartBatch({ requestedCount: 1, userId: USER });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/kill switch/i);
  });

  it('blocks when the daily generation cap would be exceeded', async () => {
    vi.mocked(getSettingsForUser).mockResolvedValue({
      id: 1, userId: USER, dailyGenerationCap: 50, dailyPublishCap: 15,
      dailyBudgetCents: 500, killSwitchActive: false,
    } as never);
    mockUsage(45, 100);

    const r = await canStartBatch({ requestedCount: 20, userId: USER });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/generation cap/i);
  });
});
