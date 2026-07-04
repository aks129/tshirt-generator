import { db } from '@/lib/db/client';
import { nicheLibrary } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { GeneratorTabs } from './generator-tabs';

export const dynamic = 'force-dynamic';

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; prompt?: string }>;
}) {
  // ?mode=ai&prompt=… — used by the dashboard's "More like this" links to
  // prefill the AI generator with a proven winner's niche.
  const { mode, prompt } = await searchParams;
  const niches = await db.query.nicheLibrary.findMany({ where: eq(nicheLibrary.isActive, true) });
  return (
    <GeneratorTabs
      niches={niches}
      initialMode={mode === 'ai' ? 'ai' : undefined}
      initialPrompt={typeof prompt === 'string' && prompt.length > 0 ? prompt.slice(0, 500) : undefined}
    />
  );
}
