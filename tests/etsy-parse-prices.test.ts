import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePrices, detectBlock } from '@/lib/etsy/parse-prices';

const FIXTURE = readFileSync(
  join(__dirname, 'fixtures', 'etsy-search-sample.html'),
  'utf8',
);

describe('parsePrices', () => {
  it('extracts prices from currency-value spans and JSON-LD, merges, filters', () => {
    const r = parsePrices(FIXTURE);
    // Expected merged + filtered: 19.99, 24.50, 14.99 (from DOM) and 21.99 (from JSON-LD)
    // FILTERED OUT: 200.00 (>$120), 3.50 (<$5), strikethrough sale price
    // All in cents.
    expect(r).toContain(1999);
    expect(r).toContain(2199);
    expect(r).toContain(2450);
    expect(r).toContain(1499);
    expect(r).not.toContain(350);
    expect(r).not.toContain(20000);
  });

  it('returns empty array on garbage HTML', () => {
    expect(parsePrices('<html><body>no prices here</body></html>')).toEqual([]);
  });

  it('returns empty array on empty string', () => {
    expect(parsePrices('')).toEqual([]);
  });

  it('caps results at 30 prices', () => {
    const fakeHtml = '<html><body>' +
      Array.from({ length: 50 }, (_, i) =>
        `<span class="currency-value">${20 + (i % 5)}.00</span>`
      ).join('') + '</body></html>';
    const r = parsePrices(fakeHtml);
    expect(r.length).toBeLessThanOrEqual(30);
  });

  it('dedupes identical prices (same value parsed by both strategies)', () => {
    const html = `<html>
      <script type="application/ld+json">{"offers":{"price":"19.99"}}</script>
      <span class="currency-value">19.99</span>
    </html>`;
    const r = parsePrices(html);
    expect(r.filter((p) => p === 1999)).toHaveLength(1);
  });
});

describe('detectBlock', () => {
  it('returns true when HTML contains captcha keyword', () => {
    expect(detectBlock('Please complete the CAPTCHA to continue')).toBe(true);
  });

  it('returns true when HTML contains unusual traffic phrase', () => {
    expect(detectBlock("We've detected unusual traffic from your network")).toBe(true);
  });

  it('returns false on normal HTML', () => {
    expect(detectBlock('<html><body>normal page</body></html>')).toBe(false);
  });
});
