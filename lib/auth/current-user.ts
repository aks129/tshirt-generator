// Resolves the authenticated user for a request. Middleware already gates
// access; this answers "WHO is it" for ownership stamping and (B-2) query
// scoping. Legacy v1 sessions resolve to the founder.

import { SESSION_COOKIE, verifySession } from './session';
import { ensureFounderUser, type AuthUser } from './users';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

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
  const info = await verifySession(cookieValue(req, SESSION_COOKIE));
  if (!info) return null;
  if (info.legacy) return ensureFounderUser();
  if (!info.userId) return null;
  const row = await db.query.users.findFirst({ where: eq(users.id, info.userId) });
  return row ? { id: row.id, email: row.email, role: row.role } : null;
}
