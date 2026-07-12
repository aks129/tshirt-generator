import { geminiText, MODEL_CREATIVE } from './gemini';

// Must exactly match the family names of the TTFs bundled in assets/fonts —
// Vercel has no system fonts, so anything else renders as NOTHING (resvg
// drops unresolvable <text> silently). Impact/Arial/etc. do not exist there.
const APPROVED_FONTS = [
  'Anton', 'Archivo Black', 'Bebas Neue', 'Oswald', 'Lora', 'Courier Prime',
];

export async function generateTypographySVG(opts: {
  headline: string;
  palette: string[];
  mood: string;
}): Promise<string> {
  const system = `You generate SVG t-shirt typography designs.

STRICT REQUIREMENTS:
- Output ONLY the raw <svg> ... </svg> element. No prose, no commentary, no code fences.
- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4500 5400">
- NO width/height attributes on the root (so it scales)
- NO background rect (must be transparent)
- DO NOT use @import, @font-face, or any external resources — they will fail to load
- Use font-family from this list ONLY: ${APPROVED_FONTS.join(', ')}
- Use the supplied palette (no off-palette colors)
- Compose the headline with bold visual hierarchy — split into multiple lines if more than 3 words, vary font weights/sizes
- TEXT CONTENT: ASCII only (A–Z, a–z, 0–9, and . , ! ? & ' " - : *). NEVER use emoji, star symbols (★☆), bullets (•), checkmarks, arrows, or any non-ASCII/decorative glyph — the fonts lack those and they render as broken boxes. For decoration use only drawn <rect>/<line> shapes, never glyph characters.
- STAY INSIDE THE CANVAS: keep ALL content within x=250..4250 and y=250..5150 (safe margins). Every <text> must use text-anchor="middle" centered near x=2250. Size each line so its full width fits the margins — for a long word, REDUCE font-size (a ~10-character word at font-size 700 already fills the width; scale down accordingly). Nothing may touch or cross the viewBox edge.
- All XML must be VALID — escape & as &amp;, < as &lt;, > as &gt; inside text content
- No raster <image> elements
- Single, self-contained <svg> root element`;

  const user = `Headline: "${opts.headline}"
Palette: ${opts.palette.join(', ')}
Mood: ${opts.mood}

Output the SVG only.`;

  const raw = await geminiText({ system, user, model: MODEL_CREATIVE, maxTokens: 4096 });
  return extractAndSanitizeSVG(raw);
}

export function extractAndSanitizeSVG(raw: string): string {
  const stripped = raw.replace(/```(?:svg|xml|html)?\s*/g, '').replace(/```/g, '').trim();
  const openIdx = stripped.indexOf('<svg');
  const closeIdx = stripped.lastIndexOf('</svg>');
  if (openIdx === -1 || closeIdx === -1 || closeIdx <= openIdx) {
    throw new Error('Gemini did not return a valid SVG');
  }
  let svg = stripped.slice(openIdx, closeIdx + '</svg>'.length);

  // Remove any @import / @font-face rules (we can't load remote fonts in rasterization,
  // and unescaped ampersands in font URLs cause XML parse errors)
  svg = svg.replace(/@import[^;]*;/g, '');
  svg = svg.replace(/@font-face\s*\{[^}]*\}/g, '');

  // Drop xlink namespace declarations on font URLs that may have raw &
  svg = svg.replace(/href\s*=\s*"https?:\/\/fonts\.googleapis[^"]*"/g, 'href=""');

  // Strip non-ASCII glyphs from <text> content — the bundled fonts have no
  // emoji/dingbat/star glyphs, so any such character rasterizes as a broken
  // "tofu" box. Keep printable ASCII (incl. escaped entities like &amp;) and
  // whitespace; drop everything else. Applies only to text between tags.
  svg = svg.replace(/>([^<]+)</g, (_m, text: string) =>
    `>${text.replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')}<`,
  );

  return svg;
}
