import { parsePrices, detectBlock } from './parse-prices';

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
];

const RATE_LIMIT_MS = 5000;
const TIMEOUT_MS = 8000;

let lastRequestAt = 0;
let queue: Promise<void> = Promise.resolve();

function pickUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function rateLimit(): Promise<void> {
  const previous = queue;
  let release: () => void = () => undefined;
  queue = new Promise((r) => (release = r));
  await previous;
  const now = Date.now();
  const wait = Math.max(0, RATE_LIMIT_MS - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  release();
}

export type ScrapeResult = {
  prices: number[];
  status: 'ok' | 'captcha' | 'empty' | 'error';
};

export async function scrapeEtsySearch(query: string): Promise<ScrapeResult> {
  await rateLimit();
  const url = `https://www.etsy.com/search?q=${encodeURIComponent(query)}&category=clothing&ref=auto-1`;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': pickUA(),
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
      signal: ac.signal,
    });
    if (resp.status === 403 || resp.status === 429) {
      return { prices: [], status: 'captcha' };
    }
    if (!resp.ok) {
      return { prices: [], status: 'error' };
    }
    const html = await resp.text();
    if (detectBlock(html)) return { prices: [], status: 'captcha' };
    const prices = parsePrices(html);
    if (prices.length === 0) return { prices: [], status: 'empty' };
    return { prices, status: 'ok' };
  } catch {
    return { prices: [], status: 'error' };
  } finally {
    clearTimeout(t);
  }
}
