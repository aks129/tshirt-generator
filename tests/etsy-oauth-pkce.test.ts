import { describe, it, expect } from 'vitest';
import { generatePkce } from '@/lib/etsy/oauth-client';

describe('generatePkce', () => {
  it('returns state (base64url, >=32 chars) and code_verifier (43-128 chars)', () => {
    const r = generatePkce();
    expect(r.state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(r.state.length).toBeGreaterThanOrEqual(32);
    expect(r.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(r.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(r.codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it('returns code_challenge as base64url(sha256(verifier))', async () => {
    const { codeVerifier, codeChallenge } = generatePkce();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
    const expected = Buffer.from(buf).toString('base64url');
    expect(codeChallenge).toBe(expected);
  });

  it('generates different values on each call', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });
});
