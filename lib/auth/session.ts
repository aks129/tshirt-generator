import { SignJWT, jwtVerify } from 'jose';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): Uint8Array {
  const s = process.env.AUTH_COOKIE_SECRET;
  if (!s || s.length < 32) {
    throw new Error('AUTH_COOKIE_SECRET must be set and at least 32 chars');
  }
  return new TextEncoder().encode(s);
}

export async function signSession(): Promise<string> {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = 'tshirt_session';
