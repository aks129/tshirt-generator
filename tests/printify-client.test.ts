import { describe, it, expect, vi, beforeEach } from 'vitest';
import { printifyFetch } from '@/lib/printify/client';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_API_KEY', 'test-key');
  vi.stubEnv('PRINTIFY_SHOP_ID', '27519707');
});

describe('printifyFetch', () => {
  it('GET succeeds with auth header', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const r = await printifyFetch<{ ok: boolean }>('/shops.json');
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe('https://api.printify.com/v1/shops.json');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
      'User-Agent': expect.stringContaining('tshirt-generator'),
    });
  });

  it('POST sends JSON body', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 99 }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await printifyFetch('/products.json', { method: 'POST', body: { x: 1 } });
    const [, init] = fetchSpy.mock.calls[0];
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBe(JSON.stringify({ x: 1 }));
  });

  it('throws PrintifyError on 4xx with full body text', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('{"message":"variant_id required"}', { status: 422 }),
    );
    await expect(printifyFetch('/x')).rejects.toMatchObject({
      status: 422,
      body: '{"message":"variant_id required"}',
    });
  });

  it('retries once on 5xx', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const r = await printifyFetch<{ ok: boolean }>('/x');
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws when PRINTIFY_API_KEY missing', async () => {
    vi.stubEnv('PRINTIFY_API_KEY', '');
    await expect(printifyFetch('/x')).rejects.toThrow(/PRINTIFY_API_KEY/);
  });

  it('retries on 429 with Retry-After header and eventually succeeds', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'Retry-After': '2' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const promise = printifyFetch<{ ok: boolean }>('/x');
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries on 429 without Retry-After using exponential delays and eventually succeeds', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const promise = printifyFetch<{ ok: boolean }>('/x');
    await vi.runAllTimersAsync();
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('throws PrintifyError after exhausting 3 retries all returning 429', async () => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('rate limited', { status: 429 }),
    );
    const promise = printifyFetch('/x');
    await vi.runAllTimersAsync();
    await expect(promise).rejects.toMatchObject({ status: 429 });
    vi.useRealTimers();
  });
});
