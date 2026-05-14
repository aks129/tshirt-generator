import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { generationEvents } from '@/lib/db/schema';
import { and, gte, sql } from 'drizzle-orm';

export const runtime = 'nodejs';

type AiCallPayload = {
  kind?: string;
  provider?: string;
  durationMs?: number;
  ok?: boolean;
  errorClass?: string;
};

export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Pull every ai_call event from the last 24h. Volume is low (a few hundred
  // at most), so we aggregate in-process for simplicity.
  const rows = await db
    .select({ payload: generationEvents.payload })
    .from(generationEvents)
    .where(
      and(
        gte(generationEvents.createdAt, since),
        sql`(payload->>'kind') = 'ai_call'`,
      ),
    );

  type Bucket = {
    total: number;
    ok: number;
    failed: number;
    latenciesMs: number[];
    errorClasses: Record<string, number>;
  };
  const byProvider: Record<string, Bucket> = {};

  function ensure(p: string): Bucket {
    if (!byProvider[p]) {
      byProvider[p] = { total: 0, ok: 0, failed: 0, latenciesMs: [], errorClasses: {} };
    }
    return byProvider[p];
  }

  for (const r of rows) {
    const p = r.payload as AiCallPayload;
    const provider = p.provider ?? 'unknown';
    const b = ensure(provider);
    b.total++;
    if (p.ok) b.ok++;
    else {
      b.failed++;
      const ec = p.errorClass ?? 'unknown';
      b.errorClasses[ec] = (b.errorClasses[ec] ?? 0) + 1;
    }
    if (typeof p.durationMs === 'number') b.latenciesMs.push(p.durationMs);
  }

  function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
    return sorted[idx];
  }

  const providers = Object.entries(byProvider).map(([provider, b]) => {
    const sorted = [...b.latenciesMs].sort((a, c) => a - c);
    return {
      provider,
      total: b.total,
      ok: b.ok,
      failed: b.failed,
      successRate: b.total > 0 ? b.ok / b.total : 0,
      p50Ms: percentile(sorted, 0.5),
      p95Ms: percentile(sorted, 0.95),
      avgMs: sorted.length > 0 ? Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length) : 0,
      errorClasses: b.errorClasses,
    };
  });

  const total = providers.reduce((s, p) => s + p.total, 0);
  const totalOk = providers.reduce((s, p) => s + p.ok, 0);

  return NextResponse.json({
    ok: true,
    sinceIso: since.toISOString(),
    total,
    successRate: total > 0 ? totalOk / total : 1,
    providers,
  });
}
