'use client';

import type { Niche } from '@/lib/db/schema';

export function NicheChips({ niches, onPick }: { niches: Niche[]; onPick: (n: Niche) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {niches.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onPick(n)}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs hover:bg-zinc-100"
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}
