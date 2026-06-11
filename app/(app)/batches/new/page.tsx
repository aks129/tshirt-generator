import { db } from '@/lib/db/client';
import { nicheLibrary } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { GeneratorTabs } from './generator-tabs';

export const dynamic = 'force-dynamic';

export default async function GeneratePage() {
  const niches = await db.query.nicheLibrary.findMany({ where: eq(nicheLibrary.isActive, true) });
  return <GeneratorTabs niches={niches} />;
}
