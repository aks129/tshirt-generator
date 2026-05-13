import { geminiJSON } from './gemini';
import { conceptBatchSchema, type Concept, type DesignStyle } from '../schemas';

export async function expandBrief(opts: {
  prompt: string;
  styles: DesignStyle[];
  count: number;
}): Promise<Concept[]> {
  const { prompt, styles, count } = opts;

  const system = `You are a senior t-shirt designer creating concepts for print-on-demand designs sold on Etsy.

Your job: given a high-level brief, propose ${count} distinct design CONCEPTS. Each concept is JSON.

Required JSON output format (strict — no extra fields):
{
  "concepts": [
    {
      "style": "typography" | "illustration" | "vintage",
      "headline": "the main text on the shirt (1-6 words, punchy)",
      "illustration_prompt": "a vivid prompt for an image-generation model describing the visual; for typography-only designs put 'n/a'",
      "palette": ["#RRGGBB", "#RRGGBB", ...] (2-6 hex colors that complement on a white tee),
      "mood": "1-3 word descriptor (e.g. 'playful retro', 'bold minimal')",
      "niche_keywords": ["2-6 SEO-relevant keywords"]
    }
  ]
}

Rules:
- Distribute concepts roughly evenly across the requested styles: ${styles.join(', ')}.
- Headlines must be ORIGINAL — no trademarked phrases, song lyrics, movie quotes, brand names, or celebrity names.
- Avoid niche-specific copyrighted characters (no Disney, no sports team names, no anime IPs).
- Concepts should be COMMERCIALLY VIABLE on Etsy: relatable, gift-worthy, niche-targeted, not too edgy.
- Typography concepts: lean into wordplay and bold short statements.
- Illustration concepts: clean vector-style subjects suitable for a t-shirt front print.
- Vintage concepts: distressed/retro feel, evoking 70s-80s aesthetics.
- Vary the concepts — don't repeat motifs.`;

  const user = `Brief: ${prompt}
Styles allowed: ${styles.join(', ')}
Count: ${count}

Return JSON only.`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { parsed } = await geminiJSON<{ concepts: unknown[] }>({
        system: attempt === 0 ? system : `${system}\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${String(lastError)}\nReturn ONLY valid JSON matching the schema.`,
        user,
      });
      const validated = conceptBatchSchema.parse(parsed);
      const filtered = validated.concepts.filter((c) => styles.includes(c.style));
      if (filtered.length === 0) throw new Error('No concepts matched requested styles');
      return filtered.slice(0, count);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`expandBrief failed after retry: ${String(lastError)}`);
}
