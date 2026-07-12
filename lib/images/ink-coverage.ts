import sharp from 'sharp';

/** Fraction of pixels with meaningful alpha (>16/255). A rendered design is
 *  well above 0.2%; a font-resolution failure or empty SVG is ~0. */
export async function inkCoverage(pngBuffer: Buffer): Promise<number> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let inked = 0;
  const total = data.length / ch;
  for (let i = 3; i < data.length; i += ch) {
    if (data[i] > 16) inked++;
  }
  return inked / total;
}

export const MIN_INK_COVERAGE = 0.002;

/** Throws when a design rendered (near-)blank — e.g. resvg dropped <text>
 *  because a font could not be resolved. Failing loudly beats publishing a
 *  blank shirt. */
export async function assertNotBlank(pngBuffer: Buffer, context: string): Promise<void> {
  const coverage = await inkCoverage(pngBuffer);
  if (coverage < MIN_INK_COVERAGE) {
    throw new Error(
      `Design rendered blank (ink coverage ${(coverage * 100).toFixed(3)}% < ${MIN_INK_COVERAGE * 100}%) — ${context}`,
    );
  }
}
