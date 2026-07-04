import Link from 'next/link';
import { db } from '@/lib/db/client';
import { batches, designs, listings, listingStats } from '@/lib/db/schema';
import { desc, sql, gte, eq, or, and } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { RecentBatches } from './recent-batches';
import { AiHealthCard } from './ai-health-card';
import { StatusBadge } from '@/components/status-badge';
import { rankListingPerformance } from '@/lib/insights/listing-rank';

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

  // "What's selling" — 7d of stats snapshots for live listings, ranked by
  // views gained (see lib/insights/listing-rank). Empty until the daily
  // stats cron has captured at least one snapshot.
  const snapshots = await db
    .select({
      listingId: listingStats.listingId,
      views: listingStats.views,
      favorers: listingStats.favorers,
      sales: listingStats.sales,
      capturedAt: listingStats.capturedAt,
      title: listings.title,
      etsyListingId: listings.etsyListingId,
      concept: designs.concept,
    })
    .from(listingStats)
    .innerJoin(listings, eq(listingStats.listingId, listings.id))
    .innerJoin(designs, eq(listings.designId, designs.id))
    .where(and(eq(listings.status, 'live'), gte(listingStats.capturedAt, since)));

  const listingMeta = new Map(
    snapshots.map((r) => [
      r.listingId,
      {
        title: r.title,
        etsyListingId: r.etsyListingId,
        headline: (r.concept as { headline?: string } | null)?.headline ?? null,
      },
    ]),
  );
  const topPerformers = rankListingPerformance(snapshots, { top: 5 }).map((p) => ({
    ...p,
    title: listingMeta.get(p.listingId)?.title ?? '(unknown)',
    etsyListingId: listingMeta.get(p.listingId)?.etsyListingId ?? null,
    headline: listingMeta.get(p.listingId)?.headline ?? null,
  }));

  const s = await db.query.settings.findFirst();
  const needsSetup = !s?.printifySetupAt;
  const needsEtsy = !s?.etsyAccessToken;
  const hasLiveListings = (weekStats?.live ?? 0) > 0;

  return (
    <div className="space-y-8">
      {needsSetup && (
        <Banner text="Set up Printify before publishing." href="/settings" cta="Open settings" />
      )}
      {!needsSetup && needsEtsy && hasLiveListings && (
        <Banner text="Connect Etsy to add extra photos to your listings." href="/settings" cta="Open settings" />
      )}

      <header className="anim-rise flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">The press is warm.</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Design → review → publish. Your tees, on Etsy, without the busywork.
          </p>
        </div>
        <Link
          href="/batches/new"
          className="press rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-92"
        >
          + New batch
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard className="anim-rise anim-rise-1" label="Generated · 7d" value={weekStats?.generated ?? 0} icon="✏️" />
        <StatCard className="anim-rise anim-rise-2" label="Approved · 7d" value={weekStats?.approved ?? 0} icon="✅" />
        <StatCard className="anim-rise anim-rise-3" label="Live on Etsy · 7d" value={weekStats?.live ?? 0} icon="🏪" accent />
        <StatCard
          className="anim-rise anim-rise-4"
          label="Today"
          value={`${todayStats?.count ?? 0} · $${((todayStats?.spent ?? 0) / 100).toFixed(2)}`}
          icon="📅"
        />
      </section>

      <section>
        <AiHealthCard />
      </section>

      {topPerformers.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">What&rsquo;s selling · 7d</h2>
          <Card className="card-lift overflow-hidden py-0">
            <CardContent className="p-0">
              <ol className="divide-y">
                {topPerformers.map((p, i) => (
                  <li key={p.listingId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-5 shrink-0 text-center font-display font-bold text-primary">{i + 1}</span>
                    {p.etsyListingId ? (
                      <a
                        href={`https://www.etsy.com/listing/${p.etsyListingId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1 truncate hover:underline"
                      >
                        {p.title}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{p.title}</span>
                    )}
                    {p.sales !== null && (
                      <span className="shrink-0 text-xs font-medium text-foreground">
                        🛒 {p.sales}
                        {(p.deltaSales ?? 0) > 0 && <span className="text-emerald-700"> +{p.deltaSales}</span>}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      👁 {p.views}
                      {p.deltaViews > 0 && <span className="text-emerald-700"> +{p.deltaViews}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ♥ {p.favorers}
                      {p.deltaFavorers > 0 && <span className="text-emerald-700"> +{p.deltaFavorers}</span>}
                    </span>
                    {p.headline && (
                      <Link
                        href={`/batches/new?mode=ai&prompt=${encodeURIComponent(`More designs in the same niche as the proven seller "${p.headline}" — same audience and vibe, fresh new slogans (do not repeat the original).`)}`}
                        className="press shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground hover:opacity-90"
                        title="Prefill the AI generator with this winner's niche"
                      >
                        ✨ More like this
                      </Link>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </section>
      )}

      {publishQueue.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">On the press</h2>
          <Card className="card-lift overflow-hidden py-0">
            <CardContent className="p-0">
              <ul className="divide-y">
                {publishQueue.map((q) => (
                  <li key={q.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="truncate">{q.title}</span>
                    <StatusBadge status={q.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-semibold">Recent batches</h2>
        <Card className="card-lift overflow-hidden py-0">
          <CardContent className="p-0">
            <ul className="divide-y">
              <RecentBatches rows={recent.map((b) => ({ id: b.id, prompt: b.prompt, status: b.status }))} />
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Banner({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm">
      <span>⚠ {text}</span>
      <Link href={href} className="press rounded-full bg-foreground px-3.5 py-1.5 text-xs font-medium text-background">
        {cta}
      </Link>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  className = '',
}: {
  label: string;
  value: string | number;
  icon: string;
  accent?: boolean;
  className?: string;
}) {
  return (
    <Card className={`card-lift relative overflow-hidden ${accent ? 'border-primary/40' : ''} ${className}`}>
      {accent && <div className="absolute inset-x-0 top-0 h-1 bg-primary" />}
      <CardContent className="flex items-start justify-between gap-2 pt-1">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 font-display text-3xl font-bold tracking-tight">{value}</div>
        </div>
        <span aria-hidden className="text-lg opacity-80">{icon}</span>
      </CardContent>
    </Card>
  );
}
