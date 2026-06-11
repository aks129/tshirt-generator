import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPrintifyMockups } from '@/lib/mockups/printify-mockups';

beforeEach(() => {
  vi.stubEnv('PRINTIFY_API_KEY', 'test-key');
  vi.stubEnv('PRINTIFY_SHOP_ID', '27519707');
});

function mockProduct(images: Array<{ src: string; position?: string; is_default?: boolean; is_selected_for_publishing?: boolean }>) {
  vi.spyOn(global, 'fetch').mockResolvedValueOnce(
    new Response(JSON.stringify({ images }), { status: 200, headers: { 'content-type': 'application/json' } }),
  );
}

describe('fetchPrintifyMockups', () => {
  it('keeps non-default front images (Comfort Colors 1717: one front mockup per color, no camera labels)', async () => {
    mockProduct([
      { src: 'https://img.printify.com/a?color=black', position: 'front', is_default: true },
      { src: 'https://img.printify.com/b?color=berry', position: 'front' },
      { src: 'https://img.printify.com/c?color=bay', position: 'front' },
      { src: 'https://img.printify.com/d?color=ivory', position: 'front' },
    ]);
    const r = await fetchPrintifyMockups('prod1');
    // Default (already auto-published by Printify) is skipped; the per-color
    // fronts are exactly what Etsy buyers want to see.
    expect(r.map((m) => m.src)).toEqual([
      'https://img.printify.com/b?color=berry',
      'https://img.printify.com/c?color=bay',
      'https://img.printify.com/d?color=ivory',
    ]);
  });

  it('skips the default image and orders by preferred camera labels (Gildan-style library)', async () => {
    mockProduct([
      { src: 'https://i/front?camera_label=front', position: 'front', is_default: true },
      { src: 'https://i/p2?camera_label=person-2', position: 'other' },
      { src: 'https://i/p1?camera_label=person-1', position: 'other' },
      { src: 'https://i/folded?camera_label=folded', position: 'other' },
    ]);
    const r = await fetchPrintifyMockups('prod2');
    expect(r.map((m) => m.cameraLabel)).toEqual(['person-1', 'person-2', 'folded']);
  });

  it('falls back to natural order when an explicit selection matches nothing (labels from a different blueprint)', async () => {
    mockProduct([
      { src: 'https://i/a?color=black', position: 'front', is_default: true },
      { src: 'https://i/b?color=berry', position: 'front' },
      { src: 'https://i/c?color=bay', position: 'front' },
    ]);
    const r = await fetchPrintifyMockups('prod3', { preferredLabels: ['person-1', 'person-2'] });
    // Operator's saved labels were chosen for another blueprint; uploading the
    // available color mockups beats uploading nothing.
    expect(r.map((m) => m.src)).toEqual(['https://i/b?color=berry', 'https://i/c?color=bay']);
  });

  it('respects an explicit selection when it matches (no backfill beyond the chosen labels)', async () => {
    mockProduct([
      { src: 'https://i/front?camera_label=front', position: 'front', is_default: true },
      { src: 'https://i/p1?camera_label=person-1', position: 'other' },
      { src: 'https://i/p2?camera_label=person-2', position: 'other' },
      { src: 'https://i/folded?camera_label=folded', position: 'other' },
    ]);
    const r = await fetchPrintifyMockups('prod4', { preferredLabels: ['person-2'] });
    expect(r.map((m) => m.cameraLabel)).toEqual(['person-2']);
  });

  it('caps at 9 mockups', async () => {
    mockProduct(
      Array.from({ length: 15 }, (_, i) => ({
        src: `https://i/c${i}?color=c${i}`,
        position: 'front',
        is_default: i === 0,
      })),
    );
    const r = await fetchPrintifyMockups('prod5');
    expect(r).toHaveLength(9);
  });
});
