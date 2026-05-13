import Link from 'next/link';
import { db } from '@/lib/db/client';
import { batches, designs, listings } from '@/lib/db/schema';
import { desc, sql, gte, eq, or } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DAY_MS = 24 * 60 * 60 * 1000;

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const today = new Date(Date.now() - DAY_MS);

  const [weekStats] = await db.select({
    generated: sql<number>`count(*)::int`,
    approved: sql<number>`count(*) filter (where status in ('approved','publishing','live'))::int`,
    live: sql<number>`count(*) filter (where status='live')::int`,
  }).from(designs).where(gte(designs.createdAt, since));

  const [todayStats] = await db.select({
    count: sql<number>`count(*)::int`,
    spent: sql<number>`coalesce(sum(generation_cost_cents),0)::int`,
  }).from(designs).where(gte(designs.createdAt, today));

  const recent = await db.query.batches.findMany({
    orderBy: [desc(batches.createdAt)],
    limit: 6,
  });

  const publishQueue = await db
    .select({ id: listings.id, title: listings.title, status: listings.status, createdAt: listings.createdAt })
    .from(listings)
    .where(or(eq(listings.status, 'publishing'), eq(listings.status, 'publishing_slow')))
    .orderBy(desc(listings.createdAt))
    .limit(6);

  const s = await db.query.settings.findFirst();
  const needsSetup = !s?.printifySetupAt;

  return (
    <div className="space-y-8">
      {needsSetup && (
        <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
          <span>⚠ Set up Printify before publishing.</span>
          <Link href="/settings" className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white">Open settings</Link>
        </div>
      )}

      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/batches/new" className="rounded-md bg-black px-4 py-2 text-sm text-white">
          Start new batch
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Generated (7d)" value={weekStats?.generated ?? 0} />
        <StatCard label="Approved (7d)" value={weekStats?.approved ?? 0} />
        <StatCard label="Live listings (7d)" value={weekStats?.live ?? 0} />
        <StatCard label="Today" value={`${todayStats?.count ?? 0} / $${((todayStats?.spent ?? 0) / 100).toFixed(2)}`} />
      </section>

      {publishQueue.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium">Publish queue</h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y">
                {publishQueue.map((q) => (
                  <li key={q.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="truncate">{q.title}</span>
                    <span className="text-xs text-zinc-500">{q.status}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-medium">Recent batches</h2>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {recent.map((b) => (
                <li key={b.id}>
                  <Link href={`/batches/${b.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50">
                    <span className="truncate">{b.prompt}</span>
                    <span className="text-xs text-zinc-500">{b.status}</span>
                  </Link>
                </li>
              ))}
              {recent.length === 0 && <li className="px-4 py-6 text-sm text-zinc-500">No batches yet.</li>}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-xs font-normal text-zinc-500">{label}</CardTitle></CardHeader>
      <CardContent><div className="text-2xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}
