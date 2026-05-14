import sharp from 'sharp';
import { generateImage } from '@/lib/recraft/client';

// Three hero scenes generated per listing. Each gets a unique Recraft base
// (different from Printify's stock photos = visual differentiation in search)
// + the design PNG composited via sharp (= pixel-perfect text rendering, no
// AI text artifacts).

export type Scene = {
  name: string;
  prompt: string;
  // printArea is calibrated to 1024×1024 outputs. Conservative boxes within
  // the typical shirt chest area for each scene.
  printArea: { x: number; y: number; w: number; h: number };
  // 'light' shirts get black-text design via multiply; 'dark' get RGB-inverted
  // design via over-composite.
  shirtTone: 'light' | 'dark';
  altText: string;
};

export const SCENES: Scene[] = [
  {
    name: 'flat-lay-white',
    prompt:
      'A plain white unisex cotton t-shirt laid flat on a soft beige linen background, centered top-down view, soft natural daylight, slight wrinkle texture, no design or graphic on the shirt, clean product photography, photorealistic, no text, no watermark.',
    printArea: { x: 400, y: 460, w: 280, h: 280 },
    shirtTone: 'light',
    altText: 'White t-shirt flat lay on linen',
  },
  {
    name: 'on-model-woman-white',
    prompt:
      'A confident young woman in her late twenties wearing a plain white cotton t-shirt and high-waisted blue jeans, standing in a bright urban setting, mid-shot front view facing camera, natural soft daylight, casual lifestyle photography, photorealistic, no design or graphic on the shirt, no text, no watermark.',
    printArea: { x: 420, y: 380, w: 200, h: 240 },
    shirtTone: 'light',
    altText: 'Woman wearing white t-shirt, urban setting',
  },
  {
    name: 'on-model-man-white',
    prompt:
      'A young man in his late twenties wearing a plain white cotton t-shirt, mid-shot front view facing camera, modern minimalist studio background, soft directional light, calm friendly expression, photorealistic lifestyle portrait, no design or graphic on the shirt, no text, no watermark.',
    printArea: { x: 380, y: 380, w: 220, h: 250 },
    shirtTone: 'light',
    altText: 'Man wearing white t-shirt, studio',
  },
];

async function compose(opts: {
  baseBuffer: Buffer;
  designBuffer: Buffer;
  scene: Scene;
}): Promise<Buffer> {
  const { printArea, shirtTone } = opts.scene;

  let resized = sharp(opts.designBuffer).resize(printArea.w, printArea.h, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });

  const designLayer = shirtTone === 'dark'
    ? await resized.negate({ alpha: false }).png().toBuffer()
    : await resized.png().toBuffer();

  const composite: sharp.OverlayOptions = {
    input: designLayer,
    top: printArea.y,
    left: printArea.x,
  };
  if (shirtTone === 'light') composite.blend = 'multiply';

  return sharp(opts.baseBuffer)
    .composite([composite])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

export async function generateCustomMockupSet(opts: {
  designBlobUrl: string;
  designId: string;
}): Promise<Array<{ scene: Scene; buffer: Buffer }>> {
  const designResp = await fetch(opts.designBlobUrl);
  if (!designResp.ok) throw new Error(`Design blob fetch failed ${designResp.status}`);
  const designBuffer = Buffer.from(await designResp.arrayBuffer());

  // Generate all 3 bases in parallel via Recraft, then composite locally.
  const baseResults = await Promise.all(
    SCENES.map(async (scene) => {
      const url = await generateImage({
        prompt: scene.prompt,
        style: 'realistic_image',
        size: '1024x1024',
        idempotencyKey: `custom-${opts.designId}-${scene.name}`,
      });
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Recraft base download failed ${resp.status}`);
      return { scene, baseBuffer: Buffer.from(await resp.arrayBuffer()) };
    }),
  );

  return Promise.all(
    baseResults.map(async ({ scene, baseBuffer }) => ({
      scene,
      buffer: await compose({ baseBuffer, designBuffer, scene }),
    })),
  );
}
