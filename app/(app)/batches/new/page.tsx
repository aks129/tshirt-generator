import { db } from '@/lib/db/client';
import { nicheLibrary } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { GenerateForm } from './form';

export const dynamic = 'force-dynamic';

export default async function GeneratePage() {
  const niches = await db.query.nicheLibrary.findMany({ where: eq(nicheLibrary.isActive, true) });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Generate a batch</h1>
      <GenerateForm niches={niches} />
    </div>
  );
}
