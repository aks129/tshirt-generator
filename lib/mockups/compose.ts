import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MockupBase } from '@/public/mockup-bases/manifest';

export type ComposeInput = {
  base: MockupBase;
  /** If omitted, read from base.file in public/. */
  baseBuffer?: Buffer;
  /** Design PNG with transparent background. */
  designBuffer: Buffer;
};

// Anything in this set gets a white-text variant of the design (inverted RGB,
// alpha preserved) composited with default 'over' blend. Everything else is
// treated as a light shirt and gets the original black design via 'multiply'.
const DARK_SHIRT_COLORS = new Set(['black', 'navy', 'charcoal']);

export async function composeMockup(input: ComposeInput): Promise<Buffer> {
  const baseBuffer = input.baseBuffer
    ?? (await readFile(join(process.cwd(), 'public', input.base.file.replace(/^\//, ''))));

  const { printArea, rotation, color } = input.base;

  let resized = sharp(input.designBuffer).resize(printArea.w, printArea.h, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (rotation) {
    resized = resized.rotate(rotation, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }

  const isDarkShirt = DARK_SHIRT_COLORS.has(color);
  // On dark shirts, invert RGB so black text becomes white text (preserving
  // alpha for transparent regions). Then a normal over-composite paints white
  // text on the dark shirt. On light/heather shirts, keep the original black
  // design and use multiply so the black text shows clean.
  const designLayer = isDarkShirt
    ? await resized.negate({ alpha: false }).png().toBuffer()
    : await resized.png().toBuffer();

  const composite: sharp.OverlayOptions = {
    input: designLayer,
    top: printArea.y,
    left: printArea.x,
  };
  if (!isDarkShirt) composite.blend = 'multiply';

  return sharp(baseBuffer)
    .composite([composite])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

export async function composeFromBlobUrl(opts: { base: MockupBase; designBlobUrl: string }): Promise<Buffer> {
  const resp = await fetch(opts.designBlobUrl);
  if (!resp.ok) throw new Error(`Design blob fetch failed ${resp.status}`);
  const designBuffer = Buffer.from(await resp.arrayBuffer());
  return composeMockup({ base: opts.base, designBuffer });
}
