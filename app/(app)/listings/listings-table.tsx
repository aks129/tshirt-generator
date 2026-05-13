'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { Concept } from '@/lib/schemas';

type Row = {
  id: string;
  title: string;
  status: 'publishing' | 'publishing_slow' | 'live' | 'failed';
  etsyListingId: string | null;
  printifyProductId: string | null;
  publishedAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
  designId: string;
  designMockupUrl: string | null;
  designHeadline: unknown;
};

const STATUSES = ['all', 'live', 'publishing', 'failed'] as const;
type Filter = (typeof STATUSES)[number];

export function ListingsTable({ rows }: { rows: Row[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const filtered = filter === 'all'
    ? rows
    : filter === 'publishing'
      ? rows.filter((r) => r.status === 'publishing' || r.status === 'publishing_slow')
      : rows.filter((r) => r.status === filter);

  async function retry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/listings/${id}/retry`, { method: 'POST' });
      const text = await res.text();
      if (!text) {
        alert('Retry is still running on the server. Refreshing to check current state.');
      } else {
        try {
          const j = JSON.parse(text);
          if (!res.ok && !j.ok) alert(j.error || 'Retry failed');
        } catch {
          alert(`Unexpected response from server (${res.status}). Refreshing.`);
        }
      }
      window.location.reload();
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <>
      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={
              'rounded-full border px-3 py-1 text-xs ' +
              (filter === s
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50')
            }
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full divide-y divide-zinc-200">
          <thead className="bg-zinc-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Design</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Title</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Links</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Created</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map((r) => {
              const concept = r.designHeadline as Concept | null;
              return (
                <tr key={r.id} className="hover:bg-zinc-50">
                  <td className="w-16 px-3 py-2">
                    {r.designMockupUrl && (
                      <div className="relative h-12 w-12 overflow-hidden rounded">
                        <Image src={r.designMockupUrl} alt="" fill className="object-cover" unoptimized />
                      </div>
                    )}
                  </td>
                  <td className="max-w-md px-3 py-2 text-sm">
                    <div className="font-medium truncate" title={r.title}>{r.title}</div>
                    {concept?.headline && (
                      <div className="text-xs text-zinc-500 truncate">"{concept.headline}"</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    <StatusBadge status={r.status} />
                    {r.failureReason && (
                      <div className="mt-1 text-xs text-red-600" title={r.failureReason}>
                        {r.failureReason.slice(0, 80)}…
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {r.etsyListingId && (
                      <a
                        href={`https://www.etsy.com/listing/${r.etsyListingId}`}
                        target="_blank"
                        rel="noopener"
                        className="text-blue-600 hover:underline"
                      >
                        Etsy ↗
                      </a>
                    )}
                    {r.etsyListingId && r.printifyProductId && ' · '}
                    {r.printifyProductId && (
                      <a
                        href={`https://printify.com/app/products/${r.printifyProductId}`}
                        target="_blank"
                        rel="noopener"
                        className="text-blue-600 hover:underline"
                      >
                        Printify ↗
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {r.status === 'failed' && (
                      <button
                        type="button"
                        disabled={retryingId === r.id}
                        onClick={() => retry(r.id)}
                        className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
                      >
                        {retryingId === r.id ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-sm text-zinc-500">
                  No listings yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: Row['status'] }) {
  const COLORS: Record<Row['status'], string> = {
    publishing: 'bg-indigo-100 text-indigo-800',
    publishing_slow: 'bg-amber-100 text-amber-800',
    live: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${COLORS[status]}`}>
      {status}
    </span>
  );
}
