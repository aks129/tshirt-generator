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
        allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
        maximumSizeInBytes: 15 * 1024 * 1024, // 15 MB — leaves room for high-res blueprint photos
        addRandomSuffix: true,
        allowOverwrite: false,
      }),
      onUploadCompleted: async () => {
        /* no-op — commit happens via POST /api/shirt-templates */
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
