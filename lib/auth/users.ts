// B-1 identity: first-party email+password users on top of the existing jose
// session plumbing. The founder is lazily provisioned so the legacy
// APP_PASSWORD login (and every script that uses it) keeps working untouched.

import bcrypt from 'bcryptjs';
import { eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users, batches, listings, settings } from '@/lib/db/schema';

const BCRYPT_COST = 10;

export type AuthUser = { id: string; email: string; role: string };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type RegisterResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: 'email_taken' };

export async function registerUser(input: { email: string; password: string; displayName?: string }): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return { ok: false, error: 'email_taken' };

  const [row] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(input.password), displayName: input.displayName })
    .returning();
  return { ok: true, user: { id: row.id, email: row.email, role: row.role } };
}

export async function authenticateUser(email: string, password: string): Promise<AuthUser | null> {
  const row = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) });
  if (!row) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  return ok ? { id: row.id, email: row.email, role: row.role } : null;
}

/** Idempotently provisions the founder user (from FOUNDER_EMAIL, password =
 *  APP_PASSWORD so email-login also works for them) and claims every pre-B1
 *  row that has no owner yet. Called from the legacy login path and from
 *  legacy-session resolution. */
export async function ensureFounderUser(): Promise<AuthUser> {
  const existing = await db.query.users.findFirst({ where: eq(users.role, 'founder') });
  if (existing) return { id: existing.id, email: existing.email, role: existing.role };

  const email = (process.env.FOUNDER_EMAIL ?? 'founder@example.com').trim().toLowerCase();
  const password = process.env.APP_PASSWORD ?? crypto.randomUUID();
  const [row] = await db
    .insert(users)
    .values({ email, passwordHash: await hashPassword(password), role: 'founder', displayName: 'Founder' })
    .returning();

  // Claim ownership of everything created before identity existed.
  await db.update(batches).set({ userId: row.id }).where(isNull(batches.userId));
  await db.update(listings).set({ userId: row.id }).where(isNull(listings.userId));
  await db.update(settings).set({ userId: row.id }).where(isNull(settings.userId));

  return { id: row.id, email: row.email, role: row.role };
}
