// Garment-tag style status badge — one consistent language for design,
// batch, and listing statuses across the app.

const STYLES: Record<string, { dot: string; cls: string; label?: string; pulse?: boolean }> = {
  pending_review: { dot: 'bg-amber-500', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  generating: { dot: 'bg-sky-500', cls: 'bg-sky-50 text-sky-800 border-sky-200', pulse: true },
  ready: { dot: 'bg-sky-500', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  approved: { dot: 'bg-blue-500', cls: 'bg-blue-50 text-blue-800 border-blue-200' },
  publishing: { dot: 'bg-violet-500', cls: 'bg-violet-50 text-violet-800 border-violet-200', pulse: true },
  publishing_slow: {
    dot: 'bg-violet-500',
    cls: 'bg-violet-50 text-violet-800 border-violet-200',
    label: 'publishing…',
    pulse: true,
  },
  live: { dot: 'bg-emerald-500', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  failed: { dot: 'bg-red-500', cls: 'bg-red-50 text-red-800 border-red-200' },
  rejected: { dot: 'bg-zinc-400', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
  deleted: { dot: 'bg-zinc-400', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
};

const FALLBACK = { dot: 'bg-zinc-400', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' };

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? FALLBACK;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${'pulse' in s && s.pulse ? 'pulse-dot' : ''}`} />
      {('label' in s && s.label) || status.replace(/_/g, ' ')}
    </span>
  );
}
