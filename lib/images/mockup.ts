import sharp from 'sharp';
import path from 'path';

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'tee-templates', 'bella-canvas-3001-white.png');

const PRINT_AREA = {
  left: 525,
  top: 360,
  width: 450,
  height: 540,
};

export async function composeMockup(designPng: Buffer): Promise<Buffer> {
  const resizedDesign = await sharp(designPng)
    .resize(PRINT_AREA.width, PRINT_AREA.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(TEMPLATE_PATH)
    .composite([{ input: resizedDesign, left: PRINT_AREA.left, top: PRINT_AREA.top }])
    .png()
    .toBuffer();
}
