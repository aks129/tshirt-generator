'use client';

import { useEffect, useState } from 'react';

type SavedMockup = {
  id: string;
  designId: string;
  sceneName: string;
  blobUrl: string;
  uploadedToEtsyAt: string | null;
  etsyImageId: string | null;
  etsyListingId: string | null;
  createdAt: string;
};

export function MockupGallery({
  designId,
  listingId,
  etsyListingId,
  onClose,
}: {
  designId: string;
  listingId: string;
  etsyListingId: string | null;
  onClose: () => void;
}) {
  const [mockups, setMockups] = useState<SavedMockup[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');

  useEffect(() => {
    fetch(`/api/designs/${designId}/custom-mockups`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setMockups(j.mockups);
      });
  }, [designId]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function generateMore(saveOnly: boolean) {
    if (!confirm(`Generate 3 more custom AI mockups${saveOnly ? ' (save only)' : ''}? Uses ~$0.12 in Recraft credits.`)) return;
    setBusy(true);
    setBusyText('Generating 3 mockups… 20-40 seconds.');
    try {
      const qs = saveOnly ? '?save_only=true' : '';
      const res = await fetch(`/api/listings/${listingId}/custom-mockups${qs}`, { method: 'POST' });
      const j = await res.json();
      if (!j.ok && !j.savedCount) {
        alert(j.error || 'Generation failed');
      } else {
        const msg = saveOnly
          ? `Saved ${j.savedCount} new mockups.`
          : `Saved ${j.savedCount}. Uploaded ${j.uploadedCount ?? 0} to Etsy.`;
        alert(msg + (j.failures ? '\n\n' + j.failures.join('\n') : ''));
      }
      // Reload list
      const r = await fetch(`/api/designs/${designId}/custom-mockups`);
      const jj = await r.json();
      if (jj.ok) setMockups(jj.mockups);
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  async function uploadSelected() {
    if (selected.size === 0) return;
    if (!etsyListingId) {
      alert('This listing isn\'t live on Etsy yet — can\'t upload mockups.');
      return;
    }
    setBusy(true);
    setBusyText(`Uploading ${selected.size} mockup${selected.size === 1 ? '' : 's'} to Etsy…`);
    try {
      const res = await fetch(`/api/listings/${listingId}/upload-saved-mockups`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mockupIds: Array.from(selected) }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error || 'Upload failed');
      } else {
        alert(`Uploaded ${j.uploadedCount}/${j.total} to Etsy.${j.failures ? '\n\n' + j.failures.join('\n') : ''}`);
      }
      // Reload list to show updated uploadedAt
      const r = await fetch(`/api/designs/${designId}/custom-mockups`);
      const jj = await r.json();
      if (jj.ok) setMockups(jj.mockups);
      setSelected(new Set());
    } finally {
      setBusy(false);
      setBusyText('');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold">Custom mockup gallery</h2>
            <p className="text-xs text-zinc-500">
              {mockups === null ? 'Loading…' : `${mockups.length} saved`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => generateMore(true)}
              disabled={busy}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50"
              title="Generate 3 more and save them, but don't upload to Etsy"
            >
              ✨ Generate (save only)
            </button>
            <button
              type="button"
              onClick={() => generateMore(false)}
              disabled={busy}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-xs text-white hover:bg-violet-700 disabled:opacity-50"
              title="Generate 3 more and upload them to Etsy at the next available ranks"
            >
              ✨ Generate + upload
            </button>
          </div>
        </div>

        <div className="px-6 py-4">
          {mockups === null && <div className="py-8 text-center text-sm text-zinc-500">Loading…</div>}
          {mockups !== null && mockups.length === 0 && (
            <div className="py-8 text-center text-sm text-zinc-500">
              No saved mockups yet. Click "Generate (save only)" or "Generate + upload" to make some.
            </div>
          )}
          {mockups && mockups.length > 0 && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {mockups.map((m) => {
                const isSelected = selected.has(m.id);
                const isUploaded = !!m.uploadedToEtsyAt;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className={
                      'group relative overflow-hidden rounded-lg border-2 text-left ' +
                      (isSelected
                        ? 'border-violet-500 ring-2 ring-violet-200'
                        : 'border-zinc-200 hover:border-zinc-400')
                    }
                  >
                    <img src={m.blobUrl} alt={m.sceneName} className="aspect-square w-full object-cover" />
                    <div className="absolute right-1.5 top-1.5">
                      {isUploaded && (
                        <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          ✓ on Etsy
                        </span>
                      )}
                    </div>
                    <div className="absolute left-1.5 top-1.5">
                      {isSelected && (
                        <span className="rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          selected
                        </span>
                      )}
                    </div>
                    <div className="border-t border-zinc-100 bg-white px-2 py-1.5 text-xs">
                      <div className="font-medium">{m.sceneName}</div>
                      <div className="text-[10px] text-zinc-500">
                        {new Date(m.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4">
          <div className="text-xs text-zinc-500">
            {selected.size > 0 && `${selected.size} selected`}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50">
              Close
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || busy || !etsyListingId}
              onClick={uploadSelected}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              title={!etsyListingId ? 'Listing not yet on Etsy' : `Upload ${selected.size} mockup(s) to Etsy`}
            >
              ↑ Upload {selected.size > 0 ? selected.size : ''} to Etsy
            </button>
          </div>
        </div>

        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 shadow-lg">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
              <span className="text-sm">{busyText}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
