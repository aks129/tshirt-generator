'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ProviderStat = {
  provider: string;
  total: number;
  ok: number;
  failed: number;
  successRate: number;
  p50Ms: number;
  p95Ms: number;
  avgMs: number;
  errorClasses: Record<string, number>;
};

type Insights = {
  ok: boolean;
  total: number;
  successRate: number;
  providers: ProviderStat[];
};

export function AiHealthCard() {
  const [data, setData] = useState<Insights | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ gemini: { ok: boolean; latencyMs: number }; groq: { ok: boolean; latencyMs: number } } | null>(null);

  useEffect(() => {
    fetch('/api/insights/ai')
      .then((r) => r.json())
      .then((j) => { if (j.ok) setData(j); })
      .catch(() => {});
  }, []);

  async function ping() {
    setPinging(true);
    setPingResult(null);
    try {
      const r = await fetch('/api/health/ai');
      const j = await r.json();
      setPingResult({ gemini: j.gemini, groq: j.groq });
    } catch {
      /* ignore */
    } finally {
      setPinging(false);
    }
  }

  if (!data) return null;
  if (data.total === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">AI health (24h)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">No AI calls in the last 24h.</p>
          <button
            type="button"
            onClick={ping}
            disabled={pinging}
            className="mt-2 rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50"
          >
            {pinging ? 'Pinging…' : 'Ping providers now'}
          </button>
          {pingResult && (
            <div className="mt-2 space-y-0.5 text-xs">
              <div>Gemini: {pingResult.gemini.ok ? `✓ ${pingResult.gemini.latencyMs}ms` : '✕ down'}</div>
              <div>Groq: {pingResult.groq.ok ? `✓ ${pingResult.groq.latencyMs}ms` : '✕ down'}</div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium">AI health (24h)</CardTitle>
        <button
          type="button"
          onClick={ping}
          disabled={pinging}
          className="rounded border border-zinc-300 px-2 py-0.5 text-[10px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
        >
          {pinging ? '…' : 'Ping'}
        </button>
      </CardHeader>
      <CardContent>
        <div className="mb-2 text-2xl font-semibold">
          {data.total} <span className="text-sm font-normal text-zinc-500">calls</span>
        </div>
        <div className="space-y-1 text-xs">
          {data.providers.map((p) => (
            <div key={p.provider} className="flex items-center gap-2">
              <span className={p.provider === 'gemini' ? 'font-medium text-blue-700' : 'font-medium text-emerald-700'}>
                {p.provider}
              </span>
              <span className="text-zinc-500">
                {p.total} · {(p.successRate * 100).toFixed(0)}% ok · p50 {p.p50Ms}ms · p95 {p.p95Ms}ms
              </span>
            </div>
          ))}
          {data.providers.some((p) => p.failed > 0) && (
            <div className="mt-1 text-amber-700">
              ⚠ {data.providers.reduce((s, p) => s + p.failed, 0)} failure(s)
              {' '}
              {Object.entries(
                data.providers.reduce((acc, p) => {
                  for (const [k, v] of Object.entries(p.errorClasses)) {
                    acc[k] = (acc[k] ?? 0) + v;
                  }
                  return acc;
                }, {} as Record<string, number>),
              )
                .map(([k, v]) => `${k}:${v}`)
                .join(', ')}
            </div>
          )}
        </div>
        {pingResult && (
          <div className="mt-3 border-t border-zinc-100 pt-2 text-xs">
            <div className="text-zinc-500">Live ping:</div>
            <div>Gemini: {pingResult.gemini.ok ? `✓ ${pingResult.gemini.latencyMs}ms` : '✕ down'}</div>
            <div>Groq: {pingResult.groq.ok ? `✓ ${pingResult.groq.latencyMs}ms` : '✕ down'}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
