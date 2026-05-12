import { Resvg } from '@resvg/resvg-js';

export async function rasterizeSVG(
  svg: string,
  opts: { width: number; height: number } = { width: 4500, height: 5400 },
): Promise<Buffer> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: opts.width },
    background: 'rgba(0,0,0,0)',
    font: { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}
