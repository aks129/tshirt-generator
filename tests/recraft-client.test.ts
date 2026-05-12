import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImage } from '@/lib/recraft/client';

beforeEach(() => {
  vi.stubEnv('RECRAFT_API_KEY', 'test-key');
});

describe('Recraft client', () => {
  it('posts to the Recraft API and returns the image URL', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ url: 'https://recraft.example/img.png' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    const url = await generateImage({
      prompt: 'a vintage running illustration on white tee',
      style: 'digital_illustration',
      substyle: 'pixel_art',
      idempotencyKey: 'batch-1:design-1',
    });

    expect(url).toBe('https://recraft.example/img.png');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toContain('recraft');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });

  it('retries once on 5xx', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://recraft.example/x.png' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }));

    const url = await generateImage({ prompt: 'x', style: 'digital_illustration' });
    expect(url).toBe('https://recraft.example/x.png');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws fast on 4xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('bad', { status: 400 }));
    await expect(generateImage({ prompt: 'x', style: 'digital_illustration' }))
      .rejects.toThrow(/400/);
  });
});
