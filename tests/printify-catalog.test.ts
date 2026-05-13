import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/printify/client', () => ({
  printifyFetch: vi.fn(),
}));

vi.mock('@/lib/db/client', () => ({
  db: {
    query: { printifyCatalogCache: { findFirst: vi.fn() } },
    insert: vi.fn(),
  },
}));

import { printifyFetch } from '@/lib/printify/client';
import { db } from '@/lib/db/client';
import { getCatalog, fetchBlueprintVariants } from '@/lib/printify/catalog';

describe('getCatalog', () => {
  it('returns cached blueprints + providers when cache fresh', async () => {
    vi.mocked(db.query.printifyCatalogCache.findFirst).mockResolvedValue({
      id: 1,
      blueprints: [{ id: 6, title: 'Bella+Canvas 3001' }],
      providers: [{ id: 99, title: 'Monster Digital' }],
      fetchedAt: new Date(),
    } as never);

    const r = await getCatalog();
    expect(r.blueprints[0].id).toBe(6);
    expect(printifyFetch).not.toHaveBeenCalled();
  });

  it('fetches from Printify when cache stale', async () => {
    const stale = new Date(Date.now() - 25 * 3600 * 1000);
    vi.mocked(db.query.printifyCatalogCache.findFirst).mockResolvedValue({
      id: 1, blueprints: [], providers: [], fetchedAt: stale,
    } as never);
    vi.mocked(printifyFetch)
      .mockResolvedValueOnce([{ id: 6, title: 'B+C 3001' }])
      .mockResolvedValueOnce([{ id: 99, title: 'Monster Digital' }]);
    vi.mocked(db.insert).mockReturnValue({
      values: () => ({
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    } as never);

    const r = await getCatalog();
    expect(r.blueprints).toHaveLength(1);
    expect(printifyFetch).toHaveBeenCalledTimes(2);
  });
});

describe('fetchBlueprintVariants', () => {
  it('GETs variants for a blueprint+provider pair', async () => {
    vi.mocked(printifyFetch).mockResolvedValueOnce({
      variants: [
        { id: 4011, title: 'White / S', options: { color: 'White', size: 'S' } },
        { id: 4012, title: 'White / M', options: { color: 'White', size: 'M' } },
      ],
    });
    const r = await fetchBlueprintVariants(6, 99);
    expect(r).toHaveLength(2);
    expect(r[0].color).toBe('White');
    expect(printifyFetch).toHaveBeenCalledWith('/catalog/blueprints/6/print_providers/99/variants.json');
  });
});
