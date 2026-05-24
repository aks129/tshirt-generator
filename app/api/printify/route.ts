import { NextResponse } from 'next/server';
import { listShops, listBlueprints, listPrintProviders, listVariants } from '@/lib/printify/client';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  try {
    if (action === 'shops') {
      return NextResponse.json({ ok: true, data: await listShops() });
    }
    if (action === 'blueprints') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const all = await listBlueprints();
      const filtered = q
        ? all.filter((b) => `${b.title} ${b.brand} ${b.model}`.toLowerCase().includes(q))
        : all;
      return NextResponse.json({ ok: true, data: filtered.slice(0, 50) });
    }
    if (action === 'providers') {
      const bpId = Number(url.searchParams.get('blueprintId'));
      if (!bpId) return NextResponse.json({ ok: false, error: 'blueprintId required' }, { status: 400 });
      return NextResponse.json({ ok: true, data: await listPrintProviders(bpId) });
    }
    if (action === 'variants') {
      const bpId = Number(url.searchParams.get('blueprintId'));
      const ppId = Number(url.searchParams.get('providerId'));
      if (!bpId || !ppId) {
        return NextResponse.json({ ok: false, error: 'blueprintId and providerId required' }, { status: 400 });
      }
      return NextResponse.json({ ok: true, data: await listVariants(bpId, ppId) });
    }
    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
