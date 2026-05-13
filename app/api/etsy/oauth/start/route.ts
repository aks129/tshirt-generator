import { NextResponse } from 'next/server';
import { generatePkce } from '@/lib/etsy/oauth-client';

export const runtime = 'nodejs';

const PKCE_COOKIE = 'etsy_pkce';
const COOKIE_TTL = 5 * 60;

function getRedirectUri(req: Request): string {
  const url = new URL(req.url);
  return `${url.origin}/api/etsy/oauth/callback`;
}

export async function POST(req: Request) {
  const apiKey = process.env.ETSY_API_KEY;
  if (!apiKey) return NextResponse.json({ ok: false, error: 'ETSY_API_KEY not set' }, { status: 500 });

  const { state, codeVerifier, codeChallenge } = generatePkce();
  const redirectUri = getRedirectUri(req);

  const authorize =
    `https://www.etsy.com/oauth/connect?response_type=code` +
    `&client_id=${encodeURIComponent(apiKey)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=listings_w` +
    `&state=${encodeURIComponent(state)}` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&code_challenge_method=S256`;

  const res = NextResponse.json({ ok: true, redirectUrl: authorize });
  res.cookies.set(PKCE_COOKIE, JSON.stringify({ state, codeVerifier }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_TTL,
  });
  return res;
}
