// Resolves the authenticated user. Middleware already gates access; this
// answers "WHO is it" for ownership stamping and (B-2) read scoping. Legacy v1
// sessions resolve to the founder. Two entry points share one resolver:
//   - getRequestUser(req)  — route handlers (Request cookie header)
//   - getCurrentUser()     — server components (next/headers cookies)

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE, verifySession } from './session';
import { ensureFounderUser, type AuthUser } from './users';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

async function resolveUser(token: string | undefined): Promise<AuthUser | null> {
  const info = await verifySession(token);
  if (!info) return null;
  if (info.legacy) return ensureFounderUser();
  if (!info.userId) return null;
  const row = await db.query.users.findFirst({ where: eq(users.id, info.userId) });
  return row ? { id: row.id, email: row.email, role: row.role } : null;
}

function cookieValue(req: Request, name: string): string | undefined {
  const header = req.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return undefined;
}

export async function getRequestUser(req: Request): Promise<AuthUser | null> {
  return resolveUser(cookieValue(req, SESSION_COOKIE));
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const store = await cookies();
  return resolveUser(store.get(SESSION_COOKIE)?.value);
}
