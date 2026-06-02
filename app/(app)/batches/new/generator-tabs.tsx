'use client';

import { useState } from 'react';
import type { Niche } from '@/lib/db/schema';
import { BulkGenerator } from './bulk-generator';
import { AIGenerator } from './ai-generator';

type Mode = 'paste' | 'ai';

export function GeneratorTabs({ niches }: { niches: Niche[] }) {
  const [mode, setMode] = useState<Mode>('paste');

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={
            'rounded-md px-3 py-1.5 ' +
            (mode === 'paste' ? 'bg-white font-medium shadow-sm' : 'text-zinc-500 hover:text-zinc-800')
          }
        >
          Paste list
        </button>
        <button
          type="button"
          onClick={() => setMode('ai')}
          className={
            'rounded-md px-3 py-1.5 ' +
            (mode === 'ai' ? 'bg-white font-medium shadow-sm' : 'text-zinc-500 hover:text-zinc-800')
          }
        >
          Generate with AI
        </button>
      </div>

      {mode === 'paste' ? <BulkGenerator /> : <AIGenerator niches={niches} />}
    </div>
  );
}
