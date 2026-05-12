import { db } from '../db/client';
import { designs } from '../db/schema';
import { gte, sql } from 'drizzle-orm';

const DAY_MS = 24 * 60 * 60 * 1000;

export type CapCheck = { ok: true } | { ok: false; reason: string };

export async function canStartBatch(opts: { requestedCount: number }): Promise<CapCheck> {
  const s = await db.query.settings.findFirst();
  if (!s) return { ok: false, reason: 'Settings not seeded' };
  if (s.killSwitchActive) return { ok: false, reason: 'Kill switch active' };

  const since = new Date(Date.now() - DAY_MS);
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      spent: sql<number>`coalesce(sum(generation_cost_cents),0)::int`,
    })
    .from(designs)
    .where(gte(designs.createdAt, since));
  const { count = 0, spent = 0 } = rows[0] ?? {};

  if (count + opts.requestedCount > s.dailyGenerationCap) {
    return { ok: false, reason: `Daily generation cap reached (${count}/${s.dailyGenerationCap})` };
  }
  if (spent >= s.dailyBudgetCents) {
    return { ok: false, reason: `Daily budget cap reached ($${(spent / 100).toFixed(2)})` };
  }
  return { ok: true };
}

export async function killSwitchActive(): Promise<boolean> {
  const s = await db.query.settings.findFirst();
  return !!s?.killSwitchActive;
}
