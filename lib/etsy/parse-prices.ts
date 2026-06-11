import * as cheerio from 'cheerio';

const MIN_CENTS = 500;     // < $5 = likely sticker / digital
const MAX_CENTS = 12000;   // > $120 = likely bundle / outlier
const MAX_RESULTS = 30;

const BLOCK_PATTERNS = [
  /captcha/i,
  /unusual traffic/i,
  /access denied/i,
  /verify you are human/i,
];

export function detectBlock(html: string): boolean {
  return BLOCK_PATTERNS.some((p) => p.test(html));
}

function parseDom(html: string): number[] {
  const $ = cheerio.load(html);
  const prices: number[] = [];
  $('.currency-value').each((_, el) => {
    const node = $(el);
    // Skip elements marked as sale strikethrough
    if (node.attr('data-sale') === 'strikethrough') return;
    const txt = node.text().trim();
    const dollars = parseFloat(txt);
    if (Number.isFinite(dollars) && dollars > 0) {
      prices.push(Math.round(dollars * 100));
    }
  });
  return prices;
}

function parseJsonLd(html: string): number[] {
  const prices: number[] = [];
  const regex = /"price"\s*:\s*"?([\d.]+)"?/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    const dollars = parseFloat(m[1]);
    if (Number.isFinite(dollars) && dollars > 0) {
      prices.push(Math.round(dollars * 100));
    }
  }
  return prices;
}

export function parsePrices(html: string): number[] {
  if (!html) return [];
  const merged = [...parseDom(html), ...parseJsonLd(html)];
  // Dedupe + filter to sane band, cap at MAX_RESULTS
  const seen = new Set<number>();
  const filtered: number[] = [];
  for (const cents of merged) {
    if (seen.has(cents)) continue;
    if (cents < MIN_CENTS || cents > MAX_CENTS) continue;
    seen.add(cents);
    filtered.push(cents);
    if (filtered.length >= MAX_RESULTS) break;
  }
  return filtered;
}
