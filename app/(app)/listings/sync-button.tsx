'use client';

import { useState } from 'react';

export function SyncButton() {
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/listings/sync', { method: 'POST' });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Sync failed');
        return;
      }
      const parts = [`Checked ${j.checked} live listing${j.checked === 1 ? '' : 's'}.`];
      if (j.externallyDeleted > 0) {
        parts.push(`${j.externallyDeleted} flipped to failed (removed from Printify).`);
      }
      if (j.errors > 0) {
        parts.push(`${j.errors} couldn't be checked (will retry).`);
      }
      if (j.externallyDeleted === 0 && j.errors === 0) {
        parts.push('All live listings are still on Printify.');
      }
      alert(parts.join(' '));
      if (j.externallyDeleted > 0) window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={sync}
      disabled={syncing}
      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      title="Check each live listing against Printify and mark any that have been deleted"
    >
      {syncing ? '↻ Syncing…' : '↻ Sync with Printify'}
    </button>
  );
}
