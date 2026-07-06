import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logEvent } from '@/lib/events';
import { requireOwnedDesign } from '@/lib/auth/ownership';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireOwnedDesign(req, id))) return NextResponse.json({ ok: false }, { status: 404 });
  const [row] = await db.update(designs)
    .set({ status: 'approved' })
    .where(eq(designs.id, id))
    .returning();
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });
  await logEvent({ type: 'approved', designId: id, batchId: row.batchId });
  return NextResponse.json({ ok: true, design: row });
}
