import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['image/png'],
        maximumSizeInBytes: 10 * 1024 * 1024, // 10 MB
        addRandomSuffix: false,
        allowOverwrite: true,
      }),
      onUploadCompleted: async () => {
        // no-op; commit happens via /api/bulk-batches
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
