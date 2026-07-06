import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { customMockups } from '@/lib/db/schema';
import { requireOwnedDesign } from '@/lib/auth/ownership';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireOwnedDesign(req, id))) return NextResponse.json({ ok: false }, { status: 404 });
  const rows = await db
    .select()
    .from(customMockups)
    .where(eq(customMockups.designId, id))
    .orderBy(desc(customMockups.createdAt));
  return NextResponse.json({ ok: true, mockups: rows });
}
