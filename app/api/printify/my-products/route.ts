import { NextResponse } from 'next/server';
import { listSellerProducts } from '@/lib/printify/list-products';
import { fetchMasterProduct } from '@/lib/printify/master-product';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (id) {
    try {
      const master = await fetchMasterProduct(id);
      return NextResponse.json({ ok: true, master });
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 502 },
      );
    }
  }

  try {
    const products = await listSellerProducts();
    return NextResponse.json({ ok: true, products });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
