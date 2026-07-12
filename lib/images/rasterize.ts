import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

// Vercel serverless has NO system fonts — resvg silently renders <text> as
// nothing there. Every font an SVG may reference must be bundled in
// assets/fonts (OFL-licensed) and listed in lib/ai/svg-generator.ts's
// APPROVED_FONTS. next.config traces the directory into the function
// bundle (outputFileTracingIncludes).
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');

export async function rasterizeSVG(
  svg: string,
  opts: { width: number; height: number } = { width: 4500, height: 5400 },
): Promise<Buffer> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: opts.width },
    background: 'rgba(0,0,0,0)',
    font: {
      loadSystemFonts: true, // harmless locally, no-op on Vercel
      fontDirs: [FONT_DIR],
      defaultFontFamily: 'Anton',
    },
  });
  return resvg.render().asPng();
}
