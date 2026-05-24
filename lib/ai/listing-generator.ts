import { z } from 'zod';
import { geminiJSON, MODEL } from './gemini';

const listingSchema = z.object({
  title: z.string().min(8).max(140),
  description: z.string().min(40).max(1200),
  tags: z.array(z.string().min(2).max(20)).min(8).max(13),
  suggested_price_cents: z.number().int().min(500).max(9999),
  price_rationale: z.string().max(280),
});

export type GeneratedListing = z.infer<typeof listingSchema>;

export async function generateListing(opts: {
  headline: string;
  niche: string | null;
  mood: string;
  style: string;
  baseCostCents: number;
}): Promise<GeneratedListing> {
  const system = `You write Etsy t-shirt listings. Output STRICT JSON only.

Schema:
{
  "title": string (60-140 chars, front-load primary keyword, no ALL CAPS, no emoji),
  "description": string (3-6 short paragraphs, mention fit/material/care, include 2-3 relevant keyword phrases naturally — no keyword stuffing),
  "tags": string[] (exactly 13 tags, each ≤20 chars, lowercase, multi-word phrases like "funny dad shirt", no duplicates, no single-letter, no special chars),
  "suggested_price_cents": integer (price in CENTS — typical Etsy graphic tee retail $18-$28, pick based on niche premium and base cost; never below base_cost + 800),
  "price_rationale": string (one sentence on margin and positioning)
}

PRICING RULES:
- Minimum margin: base cost + $8.00
- Common niches (funny/dad/teacher/coffee): $19.99-$22.99
- Premium niches (wedding/anniversary/memorial/profession-specific): $24.99-$27.99
- Always end in .99 or .95
- Round to nearest 100 cents`;

  const user = JSON.stringify({
    headline: opts.headline,
    niche: opts.niche,
    mood: opts.mood,
    style: opts.style,
    base_cost_cents: opts.baseCostCents,
  });

  const { parsed } = await geminiJSON<unknown>({ system, user, model: MODEL, maxTokens: 1024 });
  return listingSchema.parse(parsed);
}
