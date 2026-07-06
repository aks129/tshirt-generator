import { describe, it, expect, vi, beforeEach } from 'vitest';

const settingsFindFirst = vi.fn();
const usersFindFirst = vi.fn();
const batchesFindFirst = vi.fn();
const designsFindFirst = vi.fn();
const listingsFindFirst = vi.fn();
const dbSelect = vi.fn();
const dbInsert = vi.fn();

vi.mock('@/lib/db/client', () => ({
  db: {
    query: {
      settings: { findFirst: (...a: unknown[]) => settingsFindFirst(...a) },
      users: { findFirst: (...a: unknown[]) => usersFindFirst(...a) },
      batches: { findFirst: (...a: unknown[]) => batchesFindFirst(...a) },
      designs: { findFirst: (...a: unknown[]) => designsFindFirst(...a) },
      listings: { findFirst: (...a: unknown[]) => listingsFindFirst(...a) },
    },
    select: (...a: unknown[]) => dbSelect(...a),
    insert: (...a: unknown[]) => dbInsert(...a),
  },
}));

import {
  getSettingsForUser,
  getFounderSettings,
  getSettingsForBatch,
  getSettingsForDesign,
  getSettingsForListing,
} from '@/lib/settings/accessor';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getSettingsForUser', () => {
  it('returns the existing row without inserting', async () => {
    settingsFindFirst.mockResolvedValueOnce({ id: 1, userId: 'u1' });
    const s = await getSettingsForUser('u1');
    expect(s).toEqual({ id: 1, userId: 'u1' });
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it('creates a defaults row (id = max+1) on first access, then returns it', async () => {
    settingsFindFirst
      .mockResolvedValueOnce(undefined) // no existing row
      .mockResolvedValueOnce({ id: 8, userId: 'u2' }); // after insert
    dbSelect.mockReturnValue({ from: () => Promise.resolve([{ maxId: 7 }]) });
    const values = vi.fn(() => ({ onConflictDoNothing: () => Promise.resolve() }));
    dbInsert.mockReturnValue({ values });

    const s = await getSettingsForUser('u2');
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ id: 8, userId: 'u2' }));
    expect(s).toEqual({ id: 8, userId: 'u2' });
  });
});

describe('getFounderSettings', () => {
  it('returns the founder-owned row', async () => {
    usersFindFirst.mockResolvedValueOnce({ id: 'founder-1', role: 'founder' });
    settingsFindFirst.mockResolvedValueOnce({ id: 1, userId: 'founder-1' });
    const s = await getFounderSettings();
    expect(s).toEqual({ id: 1, userId: 'founder-1' });
  });

  it('falls back to any row when no founder exists (pre-B1 DB)', async () => {
    usersFindFirst.mockResolvedValueOnce(undefined);
    settingsFindFirst.mockResolvedValueOnce({ id: 1, userId: null });
    const s = await getFounderSettings();
    expect(s).toEqual({ id: 1, userId: null });
  });
});

describe('entity resolvers', () => {
  it('getSettingsForBatch returns null for an unowned batch', async () => {
    batchesFindFirst.mockResolvedValueOnce({ id: 'b1', userId: null });
    expect(await getSettingsForBatch('b1')).toBeNull();
  });

  it('getSettingsForBatch resolves via owner', async () => {
    batchesFindFirst.mockResolvedValueOnce({ id: 'b1', userId: 'u1' });
    settingsFindFirst.mockResolvedValueOnce({ id: 1, userId: 'u1' });
    expect(await getSettingsForBatch('b1')).toEqual({ id: 1, userId: 'u1' });
  });

  it('getSettingsForDesign chains design → batch → owner', async () => {
    designsFindFirst.mockResolvedValueOnce({ id: 'd1', batchId: 'b1' });
    batchesFindFirst.mockResolvedValueOnce({ id: 'b1', userId: 'u1' });
    settingsFindFirst.mockResolvedValueOnce({ id: 1, userId: 'u1' });
    expect(await getSettingsForDesign('d1')).toEqual({ id: 1, userId: 'u1' });
  });

  it('getSettingsForDesign returns null for a missing design', async () => {
    designsFindFirst.mockResolvedValueOnce(undefined);
    expect(await getSettingsForDesign('nope')).toBeNull();
  });

  it('getSettingsForListing resolves via listing owner', async () => {
    listingsFindFirst.mockResolvedValueOnce({ id: 'l1', userId: 'u1' });
    settingsFindFirst.mockResolvedValueOnce({ id: 1, userId: 'u1' });
    expect(await getSettingsForListing('l1')).toEqual({ id: 1, userId: 'u1' });
  });

  it('getSettingsForListing returns null for an unowned listing', async () => {
    listingsFindFirst.mockResolvedValueOnce({ id: 'l1', userId: null });
    expect(await getSettingsForListing('l1')).toBeNull();
  });
});
