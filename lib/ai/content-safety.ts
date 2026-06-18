import { geminiJSON } from './gemini';
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
- trademark: a recognizable REGISTERED brand — its name, logo, or that company's specific registered slogan (e.g., Nike, Coca-Cola, Nike's "Just Do It", McDonald's "I'm Lovin' It"). Only flag when you can name the specific brand or company the phrase belongs to. A generic, descriptive, or original t-shirt saying is NOT a trademark, even though every tee phrase is technically a "slogan".
- celebrity_name: any real person's name living or recent (politicians, athletes, actors, musicians)
- copyrighted_character: any IP character (Disney, Marvel, Pokemon, Star Wars, anime characters)
- slur: offensive language about race, gender, religion, sexuality, disability
- sexual_content: sexually suggestive imagery or wording
- violent_imagery: graphic violence, weapons aimed at people
- medical_claim: claims to cure/treat conditions

Return EMPTY flags array if content is clearly safe. The default for an ordinary, original catchphrase is NO flags. Do NOT flag generic terms or original sayings — e.g. "yoga", "coffee", "dog mom", "Talk Dogs To Me", "Adopted Not Bought", "My Dog Picked This Shirt", "Crazy Cat Lady in Training". When unsure whether a phrase belongs to a specific named brand, do NOT flag it.`;

  const user = JSON.stringify({
    headline: input.headline,
    illustration_prompt: input.illustrationPrompt,
    title: input.title,
    description: input.description,
    tags: input.tags,
  });

  const { parsed } = await geminiJSON<unknown>({ system, user });
  return safetyResultSchema.parse(parsed);
}
