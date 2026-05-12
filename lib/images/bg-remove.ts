import sharp from 'sharp';

export async function detectHasBackground(pngBuffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let totalAlpha = 0;
  const channels = info.channels;
  for (let i = 3; i < data.length; i += channels) {
    totalAlpha += data[i];
  }
  const avgAlpha = totalAlpha / (data.length / channels);
  return avgAlpha > 250;
}

export async function attemptWhiteBgRemoval(pngBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  const ch = info.channels;
  for (let i = 0; i < out.length; i += ch) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    if (r > 240 && g > 240 && b > 240) {
      out[i + 3] = 0;
    }
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: ch as 4 } })
    .png()
    .toBuffer();
}
