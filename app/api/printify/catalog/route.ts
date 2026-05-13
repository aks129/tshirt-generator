import { NextResponse } from 'next/server';
import { getCatalog, fetchBlueprintVariants } from '@/lib/printify/catalog';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const blueprintId = url.searchParams.get('blueprintId');
  const providerId = url.searchParams.get('providerId');

  if (blueprintId && providerId) {
    try {
      const variants = await fetchBlueprintVariants(Number(blueprintId), Number(providerId));
      return NextResponse.json({ ok: true, variants });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
  }

  try {
    const catalog = await getCatalog();
    return NextResponse.json({ ok: true, ...catalog });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
