import { NextResponse } from 'next/server';
import { runPreflight } from '@/lib/preflight/checks';
import { requireOwnedDesign } from '@/lib/auth/ownership';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requireOwnedDesign(req, id))) return NextResponse.json({ ok: false }, { status: 404 });
  try {
    const report = await runPreflight(id);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
