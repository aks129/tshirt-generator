import { z } from 'zod';

const TAG_PATTERN = /^[a-z0-9 ]+$/;
const TITLE_BANNED = /[<>{}\[\]|™®©]/;

export const listingCopySchema = z.object({
  title: z.string().min(5).max(140).refine((s) => !TITLE_BANNED.test(s), {
    message: 'Title contains banned characters',
  }),
  tags: z
    .array(
      z
        .string()
        .min(1)
        .max(20)
        .refine((t) => TAG_PATTERN.test(t), { message: 'Tag must be lowercase letters/numbers/spaces only' }),
    )
    .length(13),
  description: z.string().min(20).max(13000),
});

export type ListingCopy = z.infer<typeof listingCopySchema>;

export type ValidationResult =
  | { ok: true; data: ListingCopy }
  | { ok: false; errors: string[] };

export function validateListingCopy(input: unknown): ValidationResult {
  const parsed = listingCopySchema.safeParse(input);
  if (parsed.success) return { ok: true, data: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
  };
}
