import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { EtsyAuthNotConnected, EtsyAuthExpired } from './errors';
import { getSettingsForUser } from '@/lib/settings/accessor';

const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';
const REFRESH_BUFFER_MS = 60_000;

export type PkcePayload = {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
};

export function generatePkce(): PkcePayload {
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(64).toString('base64url').slice(0, 64);
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { state, codeVerifier, codeChallenge };
}

export type TokenExchangeResult = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  userId: number;
};

function parseUserId(accessToken: string): number {
  const prefix = accessToken.split('.')[0];
  const n = Number(prefix);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Etsy access token has unexpected format');
  }
  return n;
}

export async function exchangeCode(opts: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenExchangeResult> {
  const apiKey = process.env.ETSY_API_KEY;
  if (!apiKey) throw new Error('ETSY_API_KEY not set');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: apiKey,
    redirect_uri: opts.redirectUri,
    code: opts.code,
    code_verifier: opts.codeVerifier,
  });
  const resp = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Etsy token exchange failed ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    userId: parseUserId(json.access_token),
  };
}

async function refreshAccessToken(refreshToken: string): Promise<TokenExchangeResult> {
  const apiKey = process.env.ETSY_API_KEY;
  if (!apiKey) throw new Error('ETSY_API_KEY not set');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: apiKey,
    refresh_token: refreshToken,
  });
  const resp = await fetch(ETSY_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (resp.status === 400 || resp.status === 401) {
    throw new EtsyAuthExpired();
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Etsy refresh failed ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    userId: parseUserId(json.access_token),
  };
}

/** Returns a valid Etsy access token for the given user, refreshing (and
 *  persisting the new tokens on that user's settings row) when near expiry.
 *  B-3.1: scoped by user_id, not the singleton. */
export async function getEtsyAccessToken(userId: string): Promise<string> {
  const s = await getSettingsForUser(userId);
  if (!s.etsyAccessToken || !s.etsyRefreshToken || !s.etsyTokenExpiresAt) {
    throw new EtsyAuthNotConnected();
  }
  const expiresMs = s.etsyTokenExpiresAt.getTime();
  if (expiresMs > Date.now() + REFRESH_BUFFER_MS) {
    return s.etsyAccessToken;
  }
  let refreshed: TokenExchangeResult;
  try {
    refreshed = await refreshAccessToken(s.etsyRefreshToken);
  } catch (err) {
    if (err instanceof EtsyAuthExpired) {
      await db
        .update(settings)
        .set({ etsyAccessToken: null, etsyRefreshToken: null, etsyTokenExpiresAt: null })
        .where(eq(settings.userId, userId));
    }
    throw err;
  }
  await db
    .update(settings)
    .set({
      etsyAccessToken: refreshed.accessToken,
      etsyRefreshToken: refreshed.refreshToken,
      etsyTokenExpiresAt: refreshed.expiresAt,
    })
    .where(eq(settings.userId, userId));
  return refreshed.accessToken;
}

export async function fetchEtsyUserShop(opts: { accessToken: string; userId: number }): Promise<{ shopId: number; shopName: string } | null> {
  const apiKey = process.env.ETSY_API_KEY;
  const sharedSecret = process.env.ETSY_SHARED_SECRET;
  if (!apiKey || !sharedSecret) throw new Error('ETSY_API_KEY/SHARED_SECRET not set');
  const resp = await fetch(`https://openapi.etsy.com/v3/application/users/${opts.userId}/shops`, {
    headers: {
      'x-api-key': `${apiKey}:${sharedSecret}`,
      Authorization: `Bearer ${opts.accessToken}`,
    },
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { shop_id?: number; shop_name?: string; results?: Array<{ shop_id: number; shop_name: string }> };
  const shop = json.results?.[0] ?? (json.shop_id ? { shop_id: json.shop_id, shop_name: json.shop_name ?? '' } : null);
  if (!shop) return null;
  return { shopId: shop.shop_id, shopName: shop.shop_name };
}
