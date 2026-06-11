'use client';

import { useEffect, useState } from 'react';

export type StockImage = {
  id: string;
  prompt: string;
  style: string;
  blobUrl: string;
  tags: string[];
  createdAt: string;
};

export function StockLibrary({
  selectedUrl,
  onPick,
  onClose,
}: {
  selectedUrl: string | null;
  onPick: (image: StockImage | null) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<StockImage[] | null>(null);
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<'digital_illustration' | 'realistic_image' | 'vector_illustration'>('digital_illustration');
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      const r = await fetch('/api/stock-images');
      const j = await r.json();
      if (j.ok) setImages(j.images);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => { load(); }, []);

  async function generate() {
    if (!prompt.trim() || prompt.length < 3) {
      alert('Prompt needs at least 3 characters.');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/stock-images', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, style }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Generation failed');
        return;
      }
      setPrompt('');
      await load();
    } finally {
      setGenerating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Delete this image from the library? (It stays in Vercel Blob, just removed from this list.)')) return;
    try {
      const res = await fetch(`/api/stock-images/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Delete failed');
        return;
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">🎨 Stock library</h2>
            <p className="text-xs text-zinc-500">
              {images === null ? 'Loading…' : `${images.length} saved`} · generated illustrations for shirt designs
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs">
            Close
          </button>
        </div>

        <div className="space-y-2 border-b border-zinc-200 bg-zinc-50 px-6 py-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-600">Generate new (~$0.04)</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder='e.g. "cute cartoon black cat with sunglasses, simple flat illustration"'
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
              disabled={generating}
            />
            <select
              value={style}
              onChange={(e) => setStyle(e.target.value as typeof style)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm"
              disabled={generating}
            >
              <option value="digital_illustration">Illustration</option>
              <option value="vector_illustration">Vector</option>
              <option value="realistic_image">Realistic</option>
            </select>
            <button
              type="button"
              onClick={generate}
              disabled={generating || prompt.length < 3}
              className="rounded-md bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {generating ? 'Generating…' : '✨ Generate'}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">
            Auto-adds &quot;transparent background, t-shirt design ready&quot; to your prompt.
          </p>
        </div>

        {selectedUrl && (
          <div className="border-b border-zinc-200 bg-violet-50 px-6 py-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-violet-900">An image is currently picked.</span>
              <button
                type="button"
                onClick={() => onPick(null)}
                className="rounded border border-violet-300 bg-white px-2 py-1 text-[11px] text-violet-700 hover:bg-violet-100"
              >
                Clear selection (no image)
              </button>
            </div>
          </div>
        )}

        <div className="px-6 py-4">
          {images === null && <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>}
          {images !== null && images.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-500">
              No images yet. Generate your first one above.
            </div>
          )}
          {images && images.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {images.map((img) => {
                const isSelected = img.blobUrl === selectedUrl;
                return (
                  <div
                    key={img.id}
                    className={
                      'relative overflow-hidden rounded-lg border-2 ' +
                      (isSelected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-zinc-200 hover:border-zinc-400')
                    }
                  >
                    <button
                      type="button"
                      onClick={() => onPick(img)}
                      className="block w-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.blobUrl}
                        alt={img.prompt}
                        className="aspect-square w-full bg-zinc-100 object-contain"
                      />
                      <div className="border-t border-zinc-100 bg-white px-2 py-1.5 text-left text-[11px]">
                        <div className="line-clamp-2 text-zinc-700">{img.prompt}</div>
                        <div className="mt-0.5 text-[10px] text-zinc-400">
                          {img.style} · {new Date(img.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </button>
                    {isSelected && (
                      <span className="absolute left-1.5 top-1.5 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        picked
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); remove(img.id); }}
                      className="absolute right-1.5 top-1.5 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-red-50 hover:text-red-600"
                      title="Delete from library"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
