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
  const designLayer = await resized.png().toBuffer();

  const blend: 'multiply' | 'screen' = color === 'white' ? 'multiply' : 'screen';

  return sharp(baseBuffer)
    .composite([
      {
        input: designLayer,
        top: printArea.y,
        left: printArea.x,
        blend,
      },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

export async function composeFromBlobUrl(opts: { base: MockupBase; designBlobUrl: string }): Promise<Buffer> {
  const resp = await fetch(opts.designBlobUrl);
  if (!resp.ok) throw new Error(`Design blob fetch failed ${resp.status}`);
  const designBuffer = Buffer.from(await resp.arrayBuffer());
  return composeMockup({ base: opts.base, designBuffer });
}
