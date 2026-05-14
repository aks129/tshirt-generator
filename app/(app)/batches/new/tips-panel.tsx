'use client';

import { useEffect, useState } from 'react';
import { TIPS, type Tip } from '@/lib/insights/patterns';

export function TipsPanel() {
  const [tips, setTips] = useState<Tip[]>([]);

  useEffect(() => {
    // Pick 3 random tips on mount; new set each page load.
    const shuffled = [...TIPS].sort(() => Math.random() - 0.5);
    setTips(shuffled.slice(0, 3));
  }, []);

  function reshuffle() {
    const shuffled = [...TIPS].sort(() => Math.random() - 0.5);
    setTips(shuffled.slice(0, 3));
  }

  if (tips.length === 0) return null;

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">
          💡 What sells
        </div>
        <button
          type="button"
          onClick={reshuffle}
          className="text-[10px] text-amber-700 hover:text-amber-900"
        >
          ↻ shuffle
        </button>
      </div>
      <div className="space-y-2">
        {tips.map((t) => (
          <div key={t.id} className="text-[11px] leading-snug">
            <div className="font-semibold text-amber-900">{t.title}</div>
            <div className="text-amber-800">{t.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
