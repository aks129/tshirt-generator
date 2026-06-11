import sharp from 'sharp';
import path from 'path';

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'tee-templates', 'bella-canvas-3001-white.png');

// Ratios of the template image where the chest print area sits. Bella+Canvas
// 3001 front photo: chest box is roughly 30% wide, 36% tall, centered
// horizontally, top at ~28% from the top. Computed dynamically from template
// metadata so we never overflow tiny placeholder templates.
const PRINT_RATIO = { w: 0.30, h: 0.36, cx: 0.50, top: 0.28 };

export async function composeMockup(designPng: Buffer): Promise<Buffer> {
  const meta = await sharp(TEMPLATE_PATH).metadata();
  const tw = meta.width ?? 1500;
  const th = meta.height ?? 1500;

  const areaW = Math.max(1, Math.round(tw * PRINT_RATIO.w));
  const areaH = Math.max(1, Math.round(th * PRINT_RATIO.h));
  const left = Math.max(0, Math.min(tw - areaW, Math.round(tw * PRINT_RATIO.cx - areaW / 2)));
  const top = Math.max(0, Math.min(th - areaH, Math.round(th * PRINT_RATIO.top)));

  const resizedDesign = await sharp(designPng)
    .resize(areaW, areaH, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(TEMPLATE_PATH)
    .composite([{ input: resizedDesign, left, top }])
    .png()
    .toBuffer();
}
