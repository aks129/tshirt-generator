import { printifyFetch } from './client';

export type PrintifyImageUpload = {
  id: string;
  file_name: string;
  width: number;
  height: number;
  size: number;
  mime_type: string;
  preview_url: string;
  upload_time: string;
};

export async function uploadImageByUrl(opts: {
  fileName: string;
  url: string;
}): Promise<{ imageId: string; previewUrl: string; width: number; height: number }> {
  const r = await printifyFetch<PrintifyImageUpload>('/uploads/images.json', {
    method: 'POST',
    body: { file_name: opts.fileName, url: opts.url },
  });
  return { imageId: r.id, previewUrl: r.preview_url, width: r.width, height: r.height };
}
