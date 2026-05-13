import { put } from '@vercel/blob';

export async function uploadPng(opts: {
  buffer: Buffer;
  key: string;
}): Promise<string> {
  const blob = await put(opts.key, opts.buffer, {
    access: 'public',
    contentType: 'image/png',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}
