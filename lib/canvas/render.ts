export const PRINT_W = 3000; // 10" @ 300dpi
export const PRINT_H = 3600; // 12" @ 300dpi

export type ImagePosition = 'above' | 'below' | 'behind';

export type StockImageLayer = {
  url: string;
  position: ImagePosition;
};

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
  /** Optional stock illustration composited per `position`:
   *   - 'above': image fills top 40% of print area, text fits below
   *   - 'below': image fills bottom 40%, text above
   *   - 'behind': image fills 80% of canvas centered, text overlaid */
  image?: StockImageLayer;
};

// Slider value × this = target print-pixel size. Derived from the
// preview design area (124px wide) vs the print usable width (2800px),
// which gives ~22.6×. Rounded up to 24 for a cleaner small-text floor.
const SIZE_SCALE = 24;
const PADDING = 100;

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

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}

/** Returns the {x, y, w, h} region the image should occupy on the print canvas. */
function imageRegion(position: ImagePosition): { x: number; y: number; w: number; h: number } {
  if (position === 'above') {
    return { x: PADDING, y: PADDING, w: PRINT_W - PADDING * 2, h: Math.floor((PRINT_H - PADDING * 2) * 0.4) };
  }
  if (position === 'below') {
    const h = Math.floor((PRINT_H - PADDING * 2) * 0.4);
    return { x: PADDING, y: PRINT_H - PADDING - h, w: PRINT_W - PADDING * 2, h };
  }
  // behind
  const w = Math.floor((PRINT_W - PADDING * 2) * 0.8);
  const h = Math.floor((PRINT_H - PADDING * 2) * 0.8);
  return { x: (PRINT_W - w) / 2, y: (PRINT_H - h) / 2, w, h };
}

/** Returns the rectangle the text should fit within, given the image layer. */
function textRegion(position: ImagePosition | undefined): { x: number; y: number; w: number; h: number } {
  const maxW = PRINT_W - PADDING * 2;
  const maxH = PRINT_H - PADDING * 2;
  if (!position) return { x: PADDING, y: PADDING, w: maxW, h: maxH };

  if (position === 'above') {
    const imgH = Math.floor(maxH * 0.4);
    const gap = 80;
    const y = PADDING + imgH + gap;
    return { x: PADDING, y, w: maxW, h: PRINT_H - PADDING - y };
  }
  if (position === 'below') {
    const imgH = Math.floor(maxH * 0.4);
    const gap = 80;
    return { x: PADDING, y: PADDING, w: maxW, h: maxH - imgH - gap };
  }
  // behind: text occupies the whole canvas, overlaid on the image
  return { x: PADDING, y: PADDING, w: maxW, h: maxH };
}

export async function renderRowToBlob(text: string, settings: RenderSettings): Promise<Blob> {
  const trimmed = (text || '').trim();
  const canvas = document.createElement('canvas');
  canvas.width = PRINT_W;
  canvas.height = PRINT_H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, PRINT_W, PRINT_H);

  // Draw the image layer first (if present). For 'behind', it goes under text;
  // for 'above'/'below', it just sits in its slot.
  if (settings.image) {
    try {
      const img = await loadImage(settings.image.url);
      const r = imageRegion(settings.image.position);
      // Fit by 'contain' to preserve aspect ratio inside the slot.
      const ratio = Math.min(r.w / img.width, r.h / img.height);
      const drawW = img.width * ratio;
      const drawH = img.height * ratio;
      const drawX = r.x + (r.w - drawW) / 2;
      const drawY = r.y + (r.h - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } catch {
      // Skip image silently; text still renders. Operator can re-pick.
    }
  }

  if (!trimmed) {
    return new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  }

  try {
    await document.fonts.load(`bold 200px ${settings.font}`, trimmed);
  } catch {}

  const region = textRegion(settings.image?.position);
  const maxW = region.w;
  const maxH = region.h;

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
  if (settings.vAlign === 'top') yStart = region.y;
  else if (settings.vAlign === 'bottom') yStart = region.y + region.h - totalH;
  else yStart = region.y + (region.h - totalH) / 2;

  ctx.textAlign = settings.hAlign === 'left' ? 'left' : settings.hAlign === 'right' ? 'right' : 'center';
  const x = settings.hAlign === 'left' ? region.x : settings.hAlign === 'right' ? region.x + region.w : region.x + region.w / 2;

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
