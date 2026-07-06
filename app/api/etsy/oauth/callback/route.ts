import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { exchangeCode, fetchEtsyUserShop } from '@/lib/etsy/oauth-client';
import { getRequestUser } from '@/lib/auth/current-user';
import { getSettingsForUser } from '@/lib/settings/accessor';

export const runtime = 'nodejs';

const PKCE_COOKIE = 'etsy_pkce';

function getRedirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/etsy/oauth/callback`;
}

function settingsRedirect(req: Request, params: Record<string, string>): NextResponse {
  const url = new URL(req.url);
  const dest = new URL('/settings', url.origin);
  for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
  const res = NextResponse.redirect(dest);
  res.cookies.delete(PKCE_COOKIE);
  return res;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) return settingsRedirect(req, { etsy: 'error', reason: error });
  if (!code || !state) return settingsRedirect(req, { etsy: 'error', reason: 'missing_code_or_state' });

  // The Etsy connection binds to the logged-in user's settings row (B-3.1).
  const user = await getRequestUser(req);
  if (!user) return settingsRedirect(req, { etsy: 'error', reason: 'not_logged_in' });

  const cookieValue = req.headers
    .get('cookie')
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${PKCE_COOKIE}=`))
    ?.slice(PKCE_COOKIE.length + 1);
  if (!cookieValue) return settingsRedirect(req, { etsy: 'error', reason: 'pkce_cookie_missing' });
  let pkce: { state: string; codeVerifier: string };
  try {
    pkce = JSON.parse(decodeURIComponent(cookieValue));
  } catch {
    return settingsRedirect(req, { etsy: 'error', reason: 'pkce_cookie_invalid' });
  }
  if (pkce.state !== state) return settingsRedirect(req, { etsy: 'error', reason: 'state_mismatch' });

  let tokens;
  try {
    tokens = await exchangeCode({
      code,
      codeVerifier: pkce.codeVerifier,
      redirectUri: getRedirectUri(req),
    });
  } catch {
    return settingsRedirect(req, { etsy: 'error', reason: 'token_exchange_failed' });
  }

  let shop = null;
  try {
    shop = await fetchEtsyUserShop({ accessToken: tokens.accessToken, userId: tokens.userId });
  } catch {
    /* tolerate missing shop info — operator may have no shop yet */
  }

  await getSettingsForUser(user.id); // ensure the row exists
  await db
    .update(settings)
    .set({
      etsyUserId: tokens.userId,
      etsyShopIdOauth: shop?.shopId ?? null,
      etsyAccessToken: tokens.accessToken,
      etsyRefreshToken: tokens.refreshToken,
      etsyTokenExpiresAt: tokens.expiresAt,
    })
    .where(eq(settings.userId, user.id));

  return settingsRedirect(req, { etsy: 'connected' });
}
