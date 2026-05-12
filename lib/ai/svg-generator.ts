import { getClaude, MODEL } from './claude';

const APPROVED_FONTS = [
  'Bebas Neue', 'Anton', 'Oswald', 'Archivo Black',
  'Playfair Display', 'Abril Fatface', 'Bungee', 'Permanent Marker',
];

export async function generateTypographySVG(opts: {
  headline: string;
  palette: string[];
  mood: string;
}): Promise<string> {
  const system = `You generate SVG t-shirt typography designs. The design must:
- Use viewBox="0 0 4500 5400" with no width/height attributes (so it scales)
- Have a transparent background (no <rect> filling the canvas)
- Use ONE of these Google Fonts loaded inline via @import in a <style> block: ${APPROVED_FONTS.join(', ')}
- Use the supplied palette (no off-palette colors)
- Compose the headline with bold visual hierarchy — split into multiple lines if more than 3 words, vary font weights/sizes, optional decorative dingbats (lines, asterisks) that fit the mood
- Be a SINGLE <svg> root element
- Have no raster (<image>) elements
- Be valid, self-contained, ready to rasterize

Output ONLY the SVG inside a code fence:
\`\`\`svg
<svg ...>...</svg>
\`\`\`

No commentary.`;

  const user = `Headline: "${opts.headline}"
Palette: ${opts.palette.join(', ')}
Mood: ${opts.mood}

Generate the SVG.`;

  const c = getClaude();
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
  const match = text.match(/```(?:svg|xml)?\s*([\s\S]+?)\s*```/);
  const svg = (match ? match[1] : text).trim();
  if (!svg.startsWith('<svg')) {
    throw new Error('Claude did not return a valid SVG');
  }
  return svg;
}
