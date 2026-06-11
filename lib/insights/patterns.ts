// Curated "what tends to sell" patterns for funny / typography t-shirts on
// Etsy. These are observations from successful POD sellers and Etsy's own
// search-quality signals — not absolute rules. Use them as nudges, not laws.
//
// Each tip has:
//  - id (slug)
//  - title (the rule, short)
//  - body (1-2 sentence why)
//  - category (helps filter / organize)
//
// Pattern matchers below each return whether a given slogan or listing copy
// uses the pattern. Used by the publish modal to render ✓/✗ badges.

export type Tip = {
  id: string;
  title: string;
  body: string;
  category: 'typography' | 'copy' | 'niche' | 'photo' | 'etsy';
};

export const TIPS: Tip[] = [
  {
    id: 'bold-sans-typography',
    title: 'Bold sans-serif beats script.',
    body: 'Heavy sans like Archivo Black or Impact reads at thumbnail size. Script and serif disappear on mobile.',
    category: 'typography',
  },
  {
    id: 'short-punchy-lines',
    title: 'Short lines (3–5 words) read fastest.',
    body: 'Buyers skim search results in <2s. Slogans that fit in a single eye-fixation outperform long-form ideas.',
    category: 'copy',
  },
  {
    id: 'all-caps-period',
    title: 'ALL CAPS. WITH. PERIODS.',
    body: 'Declarative chunks separated by periods (e.g. "I CAME. I SAW. I MADE IT AWKWARD.") read as confident and quotable.',
    category: 'typography',
  },
  {
    id: 'i-verb-pattern',
    title: 'Lead with "I + verb".',
    body: 'First-person slogans ("I Run on Coffee", "I Came I Saw I Conquered") let buyers see themselves wearing it.',
    category: 'copy',
  },
  {
    id: 'oddly-specific',
    title: 'Oddly-specific niches outperform generic.',
    body: '"Anxious Cat Mom in My 30s" beats "Cat Lover Tee". The narrower the niche, the lower the competition and the higher the buyer affinity.',
    category: 'niche',
  },
  {
    id: 'self-deprecating-humor',
    title: 'Self-deprecating > aggressive humor.',
    body: 'Tees that gently roast the wearer ("Hot Mess Express") sell more than ones that punch out ("I Hate You").',
    category: 'copy',
  },
  {
    id: 'tag-13',
    title: 'Use all 13 Etsy tags. Always.',
    body: 'Etsy weights tags hard for search. Leaving any of the 13 slots empty is leaving impressions on the table.',
    category: 'etsy',
  },
  {
    id: 'tag-mix',
    title: 'Tag mix: 4 short, 7 medium, 2 long-tail.',
    body: '4–5 short high-volume tags + 6–7 niche 2–3 word tags + 1–2 long-tail 3–5 word phrases is the proven distribution.',
    category: 'etsy',
  },
  {
    id: 'title-frontload',
    title: 'Frontload the title with the slogan.',
    body: 'Etsy weights the first 60 chars more than the rest. Put the slogan first, then keywords (Funny T-Shirt, Gift, Cute).',
    category: 'etsy',
  },
  {
    id: 'gift-keywords',
    title: 'Include "gift" in title and tags.',
    body: 'Gift-giving searches are >30% of t-shirt buys. "Gift", "Funny Gift", "Birthday Gift" tap that pool.',
    category: 'etsy',
  },
  {
    id: 'unisex-keyword',
    title: 'Use "unisex" in tags.',
    body: 'Bella+Canvas 3001 and Gildan 5000 are unisex. The "unisex tee" tag opens you to both men\'s and women\'s search queries.',
    category: 'etsy',
  },
  {
    id: 'high-ctr-niches',
    title: 'High-CTR niches: mom/anxiety/cat/coffee/teacher.',
    body: 'These five evergreen niches drive the bulk of POD t-shirt sales. Pick one as your primary, layer humor on top.',
    category: 'niche',
  },
  {
    id: 'price-anchor',
    title: 'Price slightly under median.',
    body: 'Etsy buyers expect $18–$28 for cotton tees. Price ~$1 under the median for your search keyword.',
    category: 'etsy',
  },
  {
    id: 'photo-7',
    title: 'Etsy wants 7+ photos.',
    body: 'Listings with 7+ photos rank higher in search and convert better. Mix flat-lay, on-model, folded, and size chart.',
    category: 'photo',
  },
  {
    id: 'avoid-trademarks',
    title: 'Never use trademarked phrases or names.',
    body: 'Etsy removes listings without warning for trademark violations. Avoid brand names, celebrity names, copyrighted lyrics.',
    category: 'copy',
  },
  {
    id: 'plain-bg-design',
    title: 'Transparent backgrounds only.',
    body: 'Designs need transparent PNG backgrounds or they get printed as a square on the tee. Always confirm before publishing.',
    category: 'typography',
  },
  {
    id: 'no-tiny-detail',
    title: 'No detail smaller than 0.05 inches.',
    body: 'DTG printing can\'t hold detail finer than ~0.05". Thin script, hairlines, and tiny logos blur or drop out entirely.',
    category: 'typography',
  },
];

// Niches that consistently outperform on Etsy, in approximate volume order.
// Use these as suggestions when picking themes or seeding new batches.
export const HIGH_PERFORMING_NICHES = [
  { slug: 'anxiety-mental-health', label: 'Anxiety / mental health humor', why: 'Resonates across age groups, low brand-collision risk.' },
  { slug: 'mom-life', label: 'Mom life', why: 'Mother\'s Day, baby showers, year-round.' },
  { slug: 'cat-lover', label: 'Cat lover', why: 'Highly engaged buyer cohort, easy to differentiate by breed.' },
  { slug: 'dog-lover', label: 'Dog lover (breed-specific)', why: 'Breed-targeted ("Corgi Mom") converts higher than generic "Dog Mom".' },
  { slug: 'coffee', label: 'Coffee addict', why: 'High repeat-buyer rate, low seasonality.' },
  { slug: 'teacher', label: 'Teacher / school', why: 'Back-to-school spike Aug–Sep, end-of-year June.' },
  { slug: 'plant-lady', label: 'Plant lady', why: 'Houseplant boom; visual buyers, high CTR.' },
  { slug: 'sarcasm', label: 'Sarcasm / introvert humor', why: 'Strong cohort, often gifted.' },
  { slug: 'fitness-rude', label: 'Gym / fitness with snark', why: 'Pairs well with all-caps bold typography.' },
  { slug: 'dad-jokes', label: 'Dad jokes', why: 'Father\'s Day spike; year-round gifting.' },
];

// Pattern matchers — used by the publish modal to display ✓/✗ badges.
export type PatternCheck = {
  id: string;
  label: string;
  ok: boolean;
  hint?: string;
};

export function checkSloganPatterns(slogan: string): PatternCheck[] {
  const s = slogan.trim();
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  const hasPeriodChunks = (s.match(/\./g) ?? []).length >= 2;
  const isAllCaps = s === s.toUpperCase() && /[A-Z]/.test(s);
  const startsWithI = /^I\s/i.test(s);
  return [
    {
      id: 'short',
      label: 'Short (≤6 words)',
      ok: wordCount > 0 && wordCount <= 6,
      hint: wordCount > 6 ? `${wordCount} words — try shorter for thumbnail readability` : undefined,
    },
    {
      id: 'period-chunks',
      label: 'Period-separated chunks',
      ok: hasPeriodChunks,
      hint: !hasPeriodChunks ? 'Try "I came. I saw. I conquered." rhythm for impact' : undefined,
    },
    {
      id: 'all-caps',
      label: 'ALL CAPS',
      ok: isAllCaps,
      hint: !isAllCaps ? 'Caps reads bolder at thumbnail size' : undefined,
    },
    {
      id: 'first-person',
      label: 'First-person ("I…")',
      ok: startsWithI,
    },
  ];
}

export function checkTitlePatterns(title: string, tags: string[]): PatternCheck[] {
  const t = title.toLowerCase();
  const titleLen = title.length;
  return [
    {
      id: 'title-length',
      label: 'Title ≥ 60 chars',
      ok: titleLen >= 60,
      hint: titleLen < 60 ? `${titleLen}/140 — add high-intent keywords like "Funny T-Shirt Gift"` : undefined,
    },
    {
      id: 'tags-13',
      label: 'All 13 tags filled',
      ok: tags.length === 13,
      hint: tags.length !== 13 ? `${tags.length}/13 — Etsy weights every slot` : undefined,
    },
    {
      id: 'has-gift',
      label: 'Includes "gift" keyword',
      ok: t.includes('gift') || tags.some((g) => g.toLowerCase().includes('gift')),
    },
    {
      id: 'has-tshirt',
      label: 'Includes "t-shirt" / "tee"',
      ok: /t.?shirt|tee\b/i.test(title) || tags.some((g) => /t.?shirt|tee\b/i.test(g)),
    },
    {
      id: 'has-unisex',
      label: 'Includes "unisex"',
      ok: t.includes('unisex') || tags.some((g) => g.toLowerCase().includes('unisex')),
    },
  ];
}

export function pickRandomTips(count: number): Tip[] {
  const shuffled = [...TIPS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}
