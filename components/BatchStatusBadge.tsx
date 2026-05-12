import { Badge } from '@/components/ui/badge';

const COLORS: Record<string, string> = {
  generating: 'bg-blue-100 text-blue-800',
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-zinc-100 text-zinc-700',
  publishing: 'bg-indigo-100 text-indigo-800',
  live: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  ready: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-zinc-100 text-zinc-700',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={COLORS[status] ?? 'bg-zinc-100 text-zinc-700'}>{status}</Badge>;
}
