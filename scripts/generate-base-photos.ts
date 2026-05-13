// One-time setup: generates 6 blank-tee base photos via Recraft V3.
// Run: pnpm tsx --env-file=.env.local scripts/generate-base-photos.ts
// Idempotent — skips files that already exist.

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateImage } from '@/lib/recraft/client';

const OUT_DIR = join(process.cwd(), 'public', 'mockup-bases');

const PROMPTS = [
  {
    id: 1,
    prompt:
      'A plain white unisex t-shirt laid flat on a soft beige linen background, centered, top-down view, soft natural light, no design, no graphic, no print, blank tee, product photography, high resolution',
  },
  {
    id: 2,
    prompt:
      'A plain black unisex t-shirt laid flat on a light oak wood surface, centered, top-down view, soft natural light, no design, no graphic, no print, blank tee, product photography, high resolution',
  },
  {
    id: 3,
    prompt:
      'A young adult wearing a plain white t-shirt and light jeans, mid-shot front view, casual coffee shop interior softly blurred, natural window light, no graphic on shirt, no print, blank tee, product photography, high resolution',
  },
  {
    id: 4,
    prompt:
      'A young adult wearing a plain black t-shirt, mid-shot front view, urban brick wall background softly blurred, golden hour light, no graphic on shirt, no print, blank tee, product photography, high resolution',
  },
  {
    id: 5,
    prompt:
      'A plain white t-shirt on a wooden hanger against a plain off-white wall, centered, front view, soft natural light, no design, no graphic, no print, blank tee, product photography, high resolution',
  },
  {
    id: 6,
    prompt:
      'A plain heather grey unisex t-shirt loosely folded in a stack, top-down view, soft natural background, no design, no graphic, no print, blank tee, product photography, high resolution',
  },
];

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  for (const p of PROMPTS) {
    const outPath = join(OUT_DIR, `${p.id}.png`);
    if (existsSync(outPath)) {
      console.log(`[skip] ${p.id}.png exists`);
      continue;
    }
    console.log(`[gen]  ${p.id}.png`);
    const url = await generateImage({
      prompt: p.prompt,
      style: 'realistic_image',
      idempotencyKey: `mockup-base-${p.id}`,
      size: '1024x1024',
    });
    const resp = await fetch(url);
    if (!resp.ok) {
      console.error(`  failed to download: ${resp.status}`);
      continue;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    writeFileSync(outPath, buf);
    console.log(`  wrote ${buf.length} bytes`);
  }
  console.log('Done. Now calibrate printArea coords in public/mockup-bases/manifest.ts');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
