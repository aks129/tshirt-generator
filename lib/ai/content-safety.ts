import { claudeJSON } from './claude';
import { safetyResultSchema, type SafetyResult } from '../schemas';

export async function checkSafety(input: {
  headline: string;
  illustrationPrompt: string;
  title?: string;
  description?: string;
  tags?: string[];
}): Promise<SafetyResult> {
  const system = `You are a content-safety reviewer for an automated t-shirt POD pipeline that publishes to Etsy.

Review the content and return JSON ONLY in this exact format:
{
  "flags": ["trademark" | "celebrity_name" | "copyrighted_character" | "slur" | "sexual_content" | "violent_imagery" | "medical_claim"],
  "rationale": "brief explanation if any flags, otherwise empty"
}

Flag definitions:
- trademark: any brand name, logo, slogan, registered trademark (e.g., Nike, Coca-Cola, Just Do It)
- celebrity_name: any real person's name living or recent (politicians, athletes, actors, musicians)
- copyrighted_character: any IP character (Disney, Marvel, Pokemon, Star Wars, anime characters)
- slur: offensive language about race, gender, religion, sexuality, disability
- sexual_content: sexually suggestive imagery or wording
- violent_imagery: graphic violence, weapons aimed at people
- medical_claim: claims to cure/treat conditions

Return EMPTY flags array if content is clearly safe. Do NOT flag generic terms (e.g., "yoga", "coffee", "dog mom").`;

  const user = JSON.stringify({
    headline: input.headline,
    illustration_prompt: input.illustrationPrompt,
    title: input.title,
    description: input.description,
    tags: input.tags,
  });

  const { parsed } = await claudeJSON<unknown>({ system, user });
  return safetyResultSchema.parse(parsed);
}
