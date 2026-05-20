import { NextResponse } from 'next/server';
import { eq, and, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { designs, listings, settings } from '@/lib/db/schema';
import { listingCopySchema } from '@/lib/etsy/validators';
import { checkSafety } from '@/lib/ai/content-safety';
import { runPublish } from '@/lib/publish/publish-design';
import { logEvent } from '@/lib/events';
import type { Concept } from '@/lib/schemas';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

const bodySchema = listingCopySchema.extend({
  design_id: z.string().uuid(),
  override_safety: z.boolean().optional(),
});

export async function POST(req: Request) {
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid body', issues: parsed.error.format() },
      { status: 400 },
    );
  }
  const { design_id, title, tags, description, override_safety } = parsed.data;

  const s = await db.query.settings.findFirst();
  if (!s) return NextResponse.json({ ok: false, error: 'Settings missing' }, { status: 500 });
  if (s.killSwitchActive) {
    return NextResponse.json({ ok: false, error: 'Kill switch active' }, { status: 503 });
  }
  if (!s.masterPrintifyProductId) {
    return NextResponse.json(
      { ok: false, error: 'No master Printify product selected. Pick one in /settings.' },
      { status: 400 },
    );
  }

  const since = new Date(Date.now() - DAY_MS);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .where(gte(listings.createdAt, since));
  if (count >= s.dailyPublishCap) {
    return NextResponse.json(
      { ok: false, error: `Daily publish cap reached (${count}/${s.dailyPublishCap})` },
      { status: 429 },
    );
  }

  const design = await db.query.designs.findFirst({ where: eq(designs.id, design_id) });
  if (!design) return NextResponse.json({ ok: false, error: 'Design not found' }, { status: 404 });
  if (!design.imageBlobUrl) {
    return NextResponse.json({ ok: false, error: 'Design has no image' }, { status: 400 });
  }

  const existing = await db.query.listings.findFirst({
    where: and(
      eq(listings.designId, design_id),
      sql`status in ('publishing','publishing_slow','live')`,
    ),
  });
  if (existing) {
    return NextResponse.json(
      { ok: false, error: 'Design already published or publishing' },
      { status: 409 },
    );
  }

  if (!override_safety) {
    const safety = await checkSafety({
      headline: (design.concept as Concept).headline,
      illustrationPrompt: 'n/a',
      title,
      description,
      tags,
    });
    if (safety.flags.length > 0) {
      return NextResponse.json(
        { ok: false, error: 'Content blocked', flags: safety.flags },
        { status: 422 },
      );
    }
  }

  const [listingRow] = await db
    .insert(listings)
    .values({
      designId: design_id,
      title,
      description,
      tags,
      status: 'publishing',
      editedByUser: true,
    })
    .returning();

  await db.update(designs).set({ status: 'publishing' }).where(eq(designs.id, design_id));

  try {
    const result = await runPublish({
      designImageUrl: design.imageBlobUrl,
      fileName: `design_${design_id}.png`,
      masterProductId: s.masterPrintifyProductId,
      title,
      description,
      tags,
    });

    if (result.status === 'live') {
      await db
        .update(listings)
        .set({
          printifyProductId: result.printifyProductId,
          etsyListingId: result.etsyListingId,
          status: 'live',
          publishedAt: new Date(),
        })
        .where(eq(listings.id, listingRow.id));
      await db.update(designs).set({ status: 'live' }).where(eq(designs.id, design_id));
      await logEvent({
        type: 'published',
        designId: design_id,
        batchId: design.batchId,
        payload: { etsyListingId: result.etsyListingId, etsyUrl: result.etsyUrl },
      });
      return NextResponse.json({
        ok: true,
        listingId: listingRow.id,
        status: 'live',
        etsyListingId: result.etsyListingId,
        etsyUrl: result.etsyUrl,
      });
    } else {
      await db
        .update(listings)
        .set({
          printifyProductId: result.printifyProductId,
          status: 'publishing_slow',
        })
        .where(eq(listings.id, listingRow.id));
      return NextResponse.json(
        {
          ok: true,
          listingId: listingRow.id,
          status: 'publishing_slow',
        },
        { status: 202 },
      );
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db
      .update(listings)
      .set({ status: 'failed', failureReason: reason.slice(0, 500) })
      .where(eq(listings.id, listingRow.id));
    await db.update(designs).set({ status: 'failed' }).where(eq(designs.id, design_id));
    await logEvent({
      type: 'publish_failed',
      designId: design_id,
      batchId: design.batchId,
      payload: { reason: reason.slice(0, 500) },
    });
    return NextResponse.json(
      { ok: false, error: reason, listingId: listingRow.id },
      { status: 502 },
    );
  }
}
