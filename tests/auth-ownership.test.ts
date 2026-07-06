import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  db: { query: { batches: { findFirst: vi.fn() }, designs: { findFirst: vi.fn() }, listings: { findFirst: vi.fn() } } },
}));
vi.mock('@/lib/auth/current-user', () => ({ getRequestUser: vi.fn() }));

import { db } from '@/lib/db/client';
import { getRequestUser } from '@/lib/auth/current-user';
import { requireOwnedBatch, requireOwnedDesign, requireOwnedListing } from '@/lib/auth/ownership';

const req = new Request('http://x');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRequestUser).mockResolvedValue({ id: 'me', email: 'me@x.com', role: 'member' });
});

describe('requireOwnedBatch', () => {
  it('returns the batch when owned', async () => {
    vi.mocked(db.query.batches.findFirst).mockResolvedValue({ id: 'b1', userId: 'me' } as never);
    expect(await requireOwnedBatch(req, 'b1')).toMatchObject({ id: 'b1' });
  });
  it('returns null when owned by someone else', async () => {
    vi.mocked(db.query.batches.findFirst).mockResolvedValue({ id: 'b1', userId: 'other' } as never);
    expect(await requireOwnedBatch(req, 'b1')).toBeNull();
  });
  it('returns null when no user or missing row', async () => {
    vi.mocked(getRequestUser).mockResolvedValueOnce(null);
    expect(await requireOwnedBatch(req, 'b1')).toBeNull();
    vi.mocked(db.query.batches.findFirst).mockResolvedValue(undefined as never);
    expect(await requireOwnedBatch(req, 'b1')).toBeNull();
  });
});

describe('requireOwnedDesign (ownership via batch)', () => {
  it('returns the design when its batch is owned', async () => {
    vi.mocked(db.query.designs.findFirst).mockResolvedValue({ id: 'd1', batchId: 'b1' } as never);
    vi.mocked(db.query.batches.findFirst).mockResolvedValue({ id: 'b1', userId: 'me' } as never);
    expect(await requireOwnedDesign(req, 'd1')).toMatchObject({ id: 'd1' });
  });
  it('returns null when the design’s batch is owned by someone else', async () => {
    vi.mocked(db.query.designs.findFirst).mockResolvedValue({ id: 'd1', batchId: 'b1' } as never);
    vi.mocked(db.query.batches.findFirst).mockResolvedValue({ id: 'b1', userId: 'other' } as never);
    expect(await requireOwnedDesign(req, 'd1')).toBeNull();
  });
  it('returns null when the design is missing', async () => {
    vi.mocked(db.query.designs.findFirst).mockResolvedValue(undefined as never);
    expect(await requireOwnedDesign(req, 'd1')).toBeNull();
  });
});

describe('requireOwnedListing', () => {
  it('returns the listing when owned, null otherwise', async () => {
    vi.mocked(db.query.listings.findFirst).mockResolvedValue({ id: 'l1', userId: 'me' } as never);
    expect(await requireOwnedListing(req, 'l1')).toMatchObject({ id: 'l1' });
    vi.mocked(db.query.listings.findFirst).mockResolvedValue({ id: 'l1', userId: 'other' } as never);
    expect(await requireOwnedListing(req, 'l1')).toBeNull();
  });
});
