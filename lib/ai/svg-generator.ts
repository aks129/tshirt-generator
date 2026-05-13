import { geminiText, MODEL_CREATIVE } from './gemini';

const APPROVED_FONTS = [
  'Impact', 'Arial Black', 'Helvetica', 'Georgia',
  'Times New Roman', 'Courier New', 'Verdana',
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
- Compose the headline with bold visual hierarchy — split into multiple lines if more than 3 words, vary font weights/sizes, optional decorative lines or stars/asterisks
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

  return svg;
}
