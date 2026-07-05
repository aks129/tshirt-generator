import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  db: {
    query: { users: { findFirst: vi.fn() } },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(async () => []) })),
        returning: vi.fn(async () => [{ id: 'u_new', email: 'new@x.com', role: 'member' }]),
      })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  },
}));

import { db } from '@/lib/db/client';
import { hashPassword, verifyPassword, registerUser, authenticateUser, ensureFounderUser } from '@/lib/auth/users';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_PASSWORD', 'legacy-pass');
  vi.stubEnv('FOUNDER_EMAIL', 'founder@test.dev');
});

describe('password hashing', () => {
  it('roundtrips and rejects wrong passwords', async () => {
    const hash = await hashPassword('s3cret!');
    expect(hash).not.toContain('s3cret!');
    expect(await verifyPassword('s3cret!', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('registerUser', () => {
  it('rejects duplicate emails with a typed result', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({ id: 'u1', email: 'new@x.com' } as never);
    const r = await registerUser({ email: 'new@x.com', password: 'pw123456' });
    expect(r).toEqual({ ok: false, error: 'email_taken' });
  });

  it('creates the user (normalized email) and returns it', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    const r = await registerUser({ email: '  New@X.com ', password: 'pw123456' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.id).toBe('u_new');
  });
});

describe('authenticateUser', () => {
  it('returns the user on a correct password', async () => {
    const hash = await hashPassword('right-pw');
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({ id: 'u1', email: 'a@x.com', passwordHash: hash } as never);
    const u = await authenticateUser('a@x.com', 'right-pw');
    expect(u?.id).toBe('u1');
  });

  it('returns null on wrong password or unknown email', async () => {
    const hash = await hashPassword('right-pw');
    vi.mocked(db.query.users.findFirst)
      .mockResolvedValueOnce({ id: 'u1', email: 'a@x.com', passwordHash: hash } as never)
      .mockResolvedValueOnce(undefined as never);
    expect(await authenticateUser('a@x.com', 'nope')).toBeNull();
    expect(await authenticateUser('ghost@x.com', 'right-pw')).toBeNull();
  });
});

describe('ensureFounderUser', () => {
  it('returns the existing founder without writing', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce({ id: 'f1', role: 'founder' } as never);
    const u = await ensureFounderUser();
    expect(u.id).toBe('f1');
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates the founder from FOUNDER_EMAIL and claims orphaned rows', async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined as never);
    vi.mocked(db.insert).mockReturnValueOnce({
      values: vi.fn(() => ({ returning: vi.fn(async () => [{ id: 'f_new', email: 'founder@test.dev', role: 'founder' }]) })),
    } as never);
    const u = await ensureFounderUser();
    expect(u.id).toBe('f_new');
    // claims ownership of pre-B1 rows (batches, listings, settings)
    expect(vi.mocked(db.update).mock.calls.length).toBe(3);
  });
});
