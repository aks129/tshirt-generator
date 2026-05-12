import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(),
    query: { settings: { findFirst: vi.fn() } },
  },
}));

import { db } from '@/lib/db/client';
import { canStartBatch } from '@/lib/caps/enforcement';

describe('canStartBatch', () => {
  it('allows when under all caps and kill switch off', async () => {
    vi.mocked(db.query.settings.findFirst).mockResolvedValue({
      id: 1, dailyGenerationCap: 50, dailyPublishCap: 15,
      dailyBudgetCents: 500, killSwitchActive: false,
      defaultPrintifyBlueprintId: null, defaultPrintProviderId: null,
      defaultVariants: null, etsyShopId: null,
    } as any);
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: () => ({ then: (r: any) => r([{ count: 10, spent: 200 }]) }) }),
    } as any);

    const r = await canStartBatch({ requestedCount: 20 });
    expect(r.ok).toBe(true);
  });

  it('blocks when kill switch on', async () => {
    vi.mocked(db.query.settings.findFirst).mockResolvedValue({
      id: 1, dailyGenerationCap: 50, dailyPublishCap: 15,
      dailyBudgetCents: 500, killSwitchActive: true,
      defaultPrintifyBlueprintId: null, defaultPrintProviderId: null,
      defaultVariants: null, etsyShopId: null,
    } as any);

    const r = await canStartBatch({ requestedCount: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/kill switch/i);
  });
});
