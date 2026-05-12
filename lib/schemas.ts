import { z } from 'zod';

export const designStyleSchema = z.enum(['typography', 'illustration', 'vintage']);
export type DesignStyle = z.infer<typeof designStyleSchema>;

export const conceptSchema = z.object({
  style: designStyleSchema,
  headline: z.string().min(1).max(80),
  illustration_prompt: z.string().min(1).max(800),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(6),
  mood: z.string().min(1).max(80),
  niche_keywords: z.array(z.string().min(1).max(40)).min(1).max(10),
});
export type Concept = z.infer<typeof conceptSchema>;

export const conceptBatchSchema = z.object({
  concepts: z.array(conceptSchema).min(1).max(20),
});

export const safetyFlagSchema = z.enum([
  'trademark',
  'celebrity_name',
  'copyrighted_character',
  'slur',
  'sexual_content',
  'violent_imagery',
  'medical_claim',
]);
export type SafetyFlag = z.infer<typeof safetyFlagSchema>;

export const safetyResultSchema = z.object({
  flags: z.array(safetyFlagSchema),
  rationale: z.string().max(500).optional(),
});
export type SafetyResult = z.infer<typeof safetyResultSchema>;
