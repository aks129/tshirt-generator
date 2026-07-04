'use client';

import { useState } from 'react';
import type { Niche } from '@/lib/db/schema';
import { BulkGenerator } from './bulk-generator';
import { AIGenerator } from './ai-generator';

type Mode = 'paste' | 'ai';

export function GeneratorTabs({
  niches,
  initialMode,
  initialPrompt,
}: {
  niches: Niche[];
  initialMode?: Mode;
  initialPrompt?: string;
}) {
  const [mode, setMode] = useState<Mode>(initialMode ?? 'paste');

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border bg-secondary p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={
            'press rounded-full px-4 py-1.5 transition-colors ' +
            (mode === 'paste'
              ? 'bg-card font-medium text-foreground shadow-sm ring-1 ring-foreground/10'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          ✂️ Paste list
        </button>
        <button
          type="button"
          onClick={() => setMode('ai')}
          className={
            'press rounded-full px-4 py-1.5 transition-colors ' +
            (mode === 'ai'
              ? 'bg-card font-medium text-foreground shadow-sm ring-1 ring-foreground/10'
              : 'text-muted-foreground hover:text-foreground')
          }
        >
          ✨ Generate with AI
        </button>
      </div>

      {mode === 'paste' ? <BulkGenerator /> : <AIGenerator niches={niches} initialPrompt={initialPrompt} />}
    </div>
  );
}
