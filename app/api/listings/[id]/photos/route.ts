import { NextResponse } from 'next/server';
import { processListingPhotos } from '@/lib/mockups/process-listing';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === 'true';

  const result = await processListingPhotos(id, { force });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.message },
      { status: result.status },
    );
  }
  return NextResponse.json({
    ok: true,
    uploadedCount: result.uploadedCount,
    failures: result.failures.length ? result.failures : undefined,
  });
}
