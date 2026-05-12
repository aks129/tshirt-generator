'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Niche } from '@/lib/db/schema';
import type { DesignStyle } from '@/lib/schemas';
import { NicheChips } from '@/components/NicheChips';

const STYLES: DesignStyle[] = ['typography', 'illustration', 'vintage'];

export function GenerateForm({ niches }: { niches: Niche[] }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [styles, setStyles] = useState<DesignStyle[]>(['typography', 'illustration', 'vintage']);
  const [count, setCount] = useState(5);
  const [nicheTag, setNicheTag] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleStyle(s: DesignStyle) {
    setStyles((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, styles, count, nicheTag }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || (typeof json.error === 'string' ? json.error : 'Failed'));
        return;
      }
      router.push(`/batches/${json.batchId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-6 sm:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm">Prompt</label>
          <textarea
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "pickleball dad jokes, retro feel"'
            className="h-32 w-full rounded-md border bg-white p-3"
            required minLength={3}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm">Styles</label>
          <div className="flex gap-3">
            {STYLES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm capitalize">
                <input type="checkbox" checked={styles.includes(s)} onChange={() => toggleStyle(s)} />
                {s}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm">Count: {count}</label>
          <input type="range" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy || styles.length === 0 || prompt.length < 3}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>
      <aside className="space-y-3">
        <h3 className="text-sm font-medium">Niche library</h3>
        <NicheChips niches={niches} onPick={(n) => {
          setPrompt(n.promptTemplate);
          setStyles(n.defaultStyles as DesignStyle[]);
          setNicheTag(n.slug);
        }} />
      </aside>
    </form>
  );
}
