import { db } from '@/lib/db/client';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { SettingsForm } from './settings-form';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Printify defaults</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Pick the shop, blueprint, print provider, and variants every new listing should use.
          You can find IDs in the Printify catalog UI, or use the search button below.
        </p>
      </header>
      <SettingsForm initial={row ?? null} />
    </div>
  );
}
