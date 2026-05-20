'use client';

import { useEffect, useState } from 'react';
import { upload } from '@vercel/blob/client';

type Blueprint = { id: number; title: string; brand?: string; model?: string };
type Provider = { id: number; title: string };
type Variant = { id: number; title: string; color: string; size: string };

type Template = {
  id: string;
  label: string;
  blueprintId: number;
  providerId: number | null;
  variantIds: number[];
  colorName: string | null;
  colorHex: string | null;
  blankImageUrl: string;
  printArea: { x: number; y: number; w: number; h: number };
  isDefault: boolean;
  source: string;
  createdAt: string;
};

export function ShirtTemplatesPanel() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [adding, setAdding] = useState(false);

  // Form state for adding
  const [label, setLabel] = useState('');
  const [blueprintId, setBlueprintId] = useState<number | null>(null);
  const [providerId, setProviderId] = useState<number | null>(null);
  const [colorName, setColorName] = useState('');
  const [colorHex, setColorHex] = useState('#ffffff');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadTemplates() {
    const r = await fetch('/api/shirt-templates');
    const j = await r.json();
    if (j.ok) setTemplates(j.templates);
  }
  async function loadCatalog() {
    const r = await fetch('/api/printify/catalog');
    const j = await r.json();
    if (j.ok) {
      setBlueprints(j.blueprints);
      setProviders(j.providers);
    }
  }
  useEffect(() => { loadTemplates(); loadCatalog(); }, []);

  useEffect(() => {
    if (!blueprintId || !providerId) {
      setVariants([]);
      return;
    }
    fetch(`/api/printify/catalog?blueprintId=${blueprintId}&providerId=${providerId}`)
      .then((r) => r.json())
      .then((j) => { if (j.ok) setVariants(j.variants); });
  }, [blueprintId, providerId]);

  async function importFromPrintify() {
    if (!blueprintId) {
      alert('Pick a blueprint first.');
      return;
    }
    if (!confirm(`Import the ${blueprints.find((b) => b.id === blueprintId)?.title} catalog images as templates?`)) return;
    setBusy(true);
    try {
      const r = await fetch('/api/shirt-templates/import-printify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ blueprintId, providerId: providerId ?? undefined }),
      });
      const j = await r.json();
      if (!j.ok) {
        alert(j.error || 'Import failed');
        return;
      }
      alert(`Imported ${j.imported} template(s).`);
      await loadTemplates();
    } finally {
      setBusy(false);
    }
  }

  async function uploadTemplate() {
    if (!file || !label || !blueprintId) {
      alert('Need a label, blueprint, and uploaded image.');
      return;
    }
    setBusy(true);
    try {
      const filename = `shirt-templates/${Date.now()}_${file.name.replace(/[^a-z0-9.]+/gi, '_')}`;
      const blob = await upload(filename, file, {
        access: 'public',
        handleUploadUrl: '/api/shirt-templates/upload-token',
        contentType: file.type,
      });
      const r = await fetch('/api/shirt-templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label,
          blueprintId,
          providerId: providerId ?? undefined,
          colorName: colorName || undefined,
          colorHex,
          blankImageUrl: blob.url,
          source: 'upload',
        }),
      });
      const j = await r.json();
      if (!j.ok) {
        alert(j.error || 'Save failed');
        return;
      }
      // Reset form
      setLabel('');
      setColorName('');
      setFile(null);
      setAdding(false);
      await loadTemplates();
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(id: string) {
    await fetch(`/api/shirt-templates/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isDefault: true }),
    });
    await loadTemplates();
  }

  async function remove(id: string) {
    if (!confirm('Delete this template? Designs already saved with it are unaffected.')) return;
    await fetch(`/api/shirt-templates/${id}`, { method: 'DELETE' });
    await loadTemplates();
  }

  const selectedBlueprint = blueprints.find((b) => b.id === blueprintId);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">Shirt templates</h2>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50"
        >
          {adding ? 'Cancel' : '+ Add template'}
        </button>
      </div>

      <p className="mb-3 text-xs text-zinc-500">
        Real shirt photos used as preview backdrops in the bulk generator. Set one as default
        and it loads automatically when designing.
      </p>

      {adding && (
        <div className="mb-4 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. "Comfort Colors 1717 — Light Pink"'
              className="w-full rounded-md border border-zinc-300 px-2.5 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600" htmlFor="tpl-blueprint">Blueprint</label>
              <select
                id="tpl-blueprint"
                value={blueprintId ?? ''}
                onChange={(e) => setBlueprintId(Number(e.target.value) || null)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="">Select blueprint…</option>
                {blueprints.map((b) => (
                  <option key={b.id} value={b.id}>{b.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600" htmlFor="tpl-provider">Provider</label>
              <select
                id="tpl-provider"
                value={providerId ?? ''}
                onChange={(e) => setProviderId(Number(e.target.value) || null)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="">Select provider…</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600" htmlFor="tpl-color-name">Color name</label>
              <select
                id="tpl-color-name"
                value={colorName}
                onChange={(e) => setColorName(e.target.value)}
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm"
              >
                <option value="">— optional —</option>
                {Array.from(new Set(variants.map((v) => v.color))).filter(Boolean).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600" htmlFor="tpl-color-hex">Color hex</label>
              <input
                id="tpl-color-hex"
                type="color"
                value={colorHex}
                onChange={(e) => setColorHex(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border border-zinc-300"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600">Blank shirt photo</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              PNG, JPG, or WebP. Max 15MB. Right-click → save from the Printify dashboard works well.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              disabled={busy || !file || !label || !blueprintId}
              onClick={uploadTemplate}
              className="rounded-md bg-black px-3 py-1.5 text-xs text-white disabled:opacity-50"
            >
              {busy ? 'Uploading…' : 'Save template'}
            </button>
            <span className="text-xs text-zinc-400">or</span>
            <button
              type="button"
              disabled={busy || !blueprintId}
              onClick={importFromPrintify}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50"
              title="Pull catalog images for the selected blueprint from Printify"
            >
              {busy ? '…' : `Import ${selectedBlueprint?.title || 'blueprint'} catalog images`}
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 && !adding && (
        <p className="rounded bg-zinc-50 px-3 py-4 text-sm text-zinc-500">
          No templates yet. Add one to preview your designs on real shirt photos.
        </p>
      )}

      {templates.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {templates.map((t) => (
            <div key={t.id} className={'overflow-hidden rounded-lg border-2 ' + (t.isDefault ? 'border-violet-500 ring-2 ring-violet-200' : 'border-zinc-200')}>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.blankImageUrl} alt={t.label} className="aspect-square w-full bg-zinc-100 object-contain" />
                {t.isDefault && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    default
                  </span>
                )}
              </div>
              <div className="border-t border-zinc-100 bg-white px-2 py-2">
                <div className="line-clamp-2 text-xs font-medium">{t.label}</div>
                <div className="text-[10px] text-zinc-500">
                  bp {t.blueprintId}
                  {t.providerId ? ` · pp ${t.providerId}` : ''}
                  {t.colorName ? ` · ${t.colorName}` : ''}
                </div>
                <div className="mt-1.5 flex gap-1">
                  {!t.isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefault(t.id)}
                      className="flex-1 rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] hover:bg-zinc-50"
                    >
                      Set default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-red-50 hover:text-red-600"
                    title="Delete template"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
