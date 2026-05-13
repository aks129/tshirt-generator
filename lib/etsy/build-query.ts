import { createHash } from 'node:crypto';

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'do',
  'don', 'for', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'no',
  'not', 'of', 'on', 'or', 'so', 'that', 'the', 'this', 'to',
  'too', 'until', 'up', 'us', 'was', 'we', 'were', 'when',
  'with', 'you', 'your', 'yours',
]);

const SUFFIX = 't shirt';
const MAX_TOKENS = 6;
const MIN_LEN = 3;

export type ConceptLike = {
  headline: string;
  niche_keywords: string[];
};

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= MIN_LEN && !STOPWORDS.has(w));
}

export function buildQuery(c: ConceptLike): string {
  const cleaned = (c.niche_keywords || [])
    .map((k) => k.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim())
    .filter((k) => k.length > 0);

  let seed: string[];
  if (cleaned.length >= 3) {
    seed = cleaned.slice(0, 3);
  } else {
    seed = tokenize(c.headline || '').slice(0, 3);
  }

  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const t of [...seed, SUFFIX]) {
    if (!seen.has(t)) {
      tokens.push(t);
      seen.add(t);
    }
    if (tokens.length >= MAX_TOKENS) break;
  }
  return tokens.join(' ');
}

export function queryHash(q: string): string {
  const sorted = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
  return createHash('sha256').update(sorted).digest('hex');
}
