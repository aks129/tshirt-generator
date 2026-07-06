import { db } from '../db/client';
import { designs, batches } from '../db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import { getSettingsForUser } from '../settings/accessor';

const DAY_MS = 24 * 60 * 60 * 1000;

export type CapCheck = { ok: true } | { ok: false; reason: string };

// Caps are per-user (B-3.1): a user's daily generation count/budget is scoped
// to their own designs (via their batches) and their own settings row.
export async function canStartBatch(opts: { requestedCount: number; userId: string | null | undefined }): Promise<CapCheck> {
  if (!opts.userId) return { ok: false, reason: 'No user' };
  const s = await getSettingsForUser(opts.userId);
  if (s.killSwitchActive) return { ok: false, reason: 'Kill switch active' };

  const since = new Date(Date.now() - DAY_MS);
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      spent: sql<number>`coalesce(sum(${designs.generationCostCents}),0)::int`,
    })
    .from(designs)
    .innerJoin(batches, eq(designs.batchId, batches.id))
    .where(and(gte(designs.createdAt, since), eq(batches.userId, opts.userId)));
  const { count = 0, spent = 0 } = rows[0] ?? {};

  if (count + opts.requestedCount > s.dailyGenerationCap) {
    return { ok: false, reason: `Daily generation cap reached (${count}/${s.dailyGenerationCap})` };
  }
  if (spent >= s.dailyBudgetCents) {
    return { ok: false, reason: `Daily budget cap reached ($${(spent / 100).toFixed(2)})` };
  }
  return { ok: true };
}

export async function killSwitchActive(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const s = await getSettingsForUser(userId);
  return !!s.killSwitchActive;
}
