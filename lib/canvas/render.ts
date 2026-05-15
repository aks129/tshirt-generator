export const PRINT_W = 3000; // 10" @ 300dpi
export const PRINT_H = 3600; // 12" @ 300dpi

export type RenderSettings = {
  font: string;
  textColor: string;
  hAlign: 'left' | 'center' | 'right';
  vAlign: 'top' | 'middle' | 'bottom';
  /** Slider value 10-48 from the bulk generator. The renderer multiplies
   *  this by SIZE_SCALE to get a target print-pixel size, then scales down
   *  only if the text wouldn't fit. Optional for back-compat; defaults to
   *  auto-fit-from-large behavior when omitted. */
  fontSize?: number;
};

// Slider value × this = target print-pixel size. Derived from the
// preview design area (124px wide) vs the print usable width (2800px),
// which gives ~22.6×. Rounded up to 24 for a cleaner small-text floor.
const SIZE_SCALE = 24;

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/);
    let cur = '';
    for (const w of words) {
      const trial = cur ? cur + ' ' + w : w;
      if (ctx.measureText(trial).width <= maxWidth || !cur) {
        cur = trial;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    lines.push(cur);
  }
  return lines;
}

export async function renderRowToBlob(text: string, settings: RenderSettings): Promise<Blob> {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    const canvas = document.createElement('canvas');
    canvas.width = PRINT_W;
    canvas.height = PRINT_H;
    return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  }

  try {
    await document.fonts.load(`bold 200px ${settings.font}`, trimmed);
  } catch {}

  const canvas = document.createElement('canvas');
  canvas.width = PRINT_W;
  canvas.height = PRINT_H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, PRINT_W, PRINT_H);

  const padding = 100;
  const maxW = PRINT_W - padding * 2;
  const maxH = PRINT_H - padding * 2;

  // Start from the user-chosen size (if supplied) and only scale DOWN if
  // the text won't fit at that size. Without a fontSize, fall back to the
  // old behavior: start huge, scale down to fit.
  let fontSize = settings.fontSize != null
    ? Math.max(40, settings.fontSize * SIZE_SCALE)
    : 600;
  let lines: string[] = [];
  while (fontSize > 40) {
    ctx.font = `bold ${fontSize}px ${settings.font}`;
    lines = wrapTextLines(ctx, trimmed, maxW);
    const lineH = fontSize * 1.1;
    const totalH = lineH * lines.length;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (totalH <= maxH && widest <= maxW) break;
    fontSize = Math.floor(fontSize * 0.92);
  }

  ctx.font = `bold ${fontSize}px ${settings.font}`;
  ctx.fillStyle = settings.textColor;
  ctx.textBaseline = 'top';

  const lineH = fontSize * 1.1;
  const totalH = lineH * lines.length;

  let yStart: number;
  if (settings.vAlign === 'top') yStart = padding;
  else if (settings.vAlign === 'bottom') yStart = PRINT_H - padding - totalH;
  else yStart = (PRINT_H - totalH) / 2;

  ctx.textAlign = settings.hAlign === 'left' ? 'left' : settings.hAlign === 'right' ? 'right' : 'center';
  const x = settings.hAlign === 'left' ? padding : settings.hAlign === 'right' ? PRINT_W - padding : PRINT_W / 2;

  lines.forEach((ln, i) => {
    ctx.fillText(ln, x, yStart + i * lineH);
  });

  return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
}

export function safeFileName(s: string, fallback = 'shirt'): string {
  return (s || fallback).slice(0, 60).replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || fallback;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
