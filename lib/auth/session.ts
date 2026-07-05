import { SignJWT, jwtVerify } from 'jose';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): Uint8Array {
  const s = process.env.AUTH_COOKIE_SECRET;
  if (!s || s.length < 32) {
    throw new Error('AUTH_COOKIE_SECRET must be set and at least 32 chars');
  }
  return new TextEncoder().encode(s);
}

/** v2 sessions carry the user identity. v1 sessions ({ok:true}, minted before
 *  B-1) stay valid until they expire and are treated as the founder by
 *  callers that need a user (see lib/auth/current-user.ts). */
export type SessionInfo = {
  userId?: string;
  email?: string;
  legacy: boolean;
};

export async function signSession(user: { userId: string; email: string }): Promise<string> {
  return new SignJWT({ v: 2, email: user.email })
    .setSubject(user.userId)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionInfo | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.sub) {
      return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : undefined, legacy: false };
    }
    // Pre-B1 cookie: authenticated but anonymous — the founder, by definition.
    return { legacy: true };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'tshirt_session';
