'use client';

import { useEffect, useState } from 'react';
import type { Settings } from '@/lib/db/schema';

type Shop = { id: number; title: string; sales_channel: string };
type Blueprint = { id: number; title: string; brand: string; model: string };
type Provider = { id: number; title: string };
type Variant = {
  id: number;
  title: string;
  options: Record<string, string>;
  cost: number;
};

export function SettingsForm({ initial }: { initial: Settings | null }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState<string>(initial?.printifyShopId ?? '');
  const [blueprintId, setBlueprintId] = useState<number | ''>(initial?.defaultPrintifyBlueprintId ?? '');
  const [providerId, setProviderId] = useState<number | ''>(initial?.defaultPrintProviderId ?? '');
  const [variantIds, setVariantIds] = useState<number[]>(
    Array.isArray(initial?.defaultVariants) ? (initial?.defaultVariants as number[]) : [],
  );

  const [bpQuery, setBpQuery] = useState('bella canvas 3001');
  const [bpResults, setBpResults] = useState<Blueprint[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    fetch('/api/printify?action=shops')
      .then((r) => r.json())
      .then((j) => j.ok && setShops(j.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!blueprintId) return;
    setBusy('Loading print providers…');
    fetch(`/api/printify?action=providers&blueprintId=${blueprintId}`)
      .then((r) => r.json())
      .then((j) => j.ok && setProviders(j.data))
      .finally(() => setBusy(''));
  }, [blueprintId]);

  useEffect(() => {
    if (!blueprintId || !providerId) return;
    setBusy('Loading variants…');
    fetch(`/api/printify?action=variants&blueprintId=${blueprintId}&providerId=${providerId}`)
      .then((r) => r.json())
      .then((j) => j.ok && setVariants(j.data.variants))
      .finally(() => setBusy(''));
  }, [blueprintId, providerId]);

  async function searchBlueprints() {
    setBusy('Searching blueprints…');
    const r = await fetch(`/api/printify?action=blueprints&q=${encodeURIComponent(bpQuery)}`);
    const j = await r.json();
    if (j.ok) setBpResults(j.data);
    setBusy('');
  }

  function toggleVariant(id: number) {
    setVariantIds((vs) => (vs.includes(id) ? vs.filter((x) => x !== id) : [...vs, id]));
  }

  async function save() {
    if (!shopId || !blueprintId || !providerId || variantIds.length === 0) {
      alert('Pick a shop, blueprint, provider, and at least one variant.');
      return;
    }
    setBusy('Saving…');
    const r = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        printifyShopId: shopId,
        defaultPrintifyBlueprintId: Number(blueprintId),
        defaultPrintProviderId: Number(providerId),
        defaultVariants: variantIds,
      }),
    });
    const j = await r.json();
    setBusy('');
    if (j.ok) {
      setSavedMsg(`Saved at ${new Date().toLocaleTimeString()} — ${variantIds.length} variant(s)`);
      setTimeout(() => setSavedMsg(''), 4000);
    } else {
      alert(j.error || 'Save failed');
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-white p-4">
        <label className="block text-sm font-medium">Printify shop</label>
        <select
          className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
        >
          <option value="">— pick a shop —</option>
          {shops.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.title} ({s.sales_channel}) · {s.id}
            </option>
          ))}
        </select>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <label className="block text-sm font-medium">Blueprint (product type)</label>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-md border px-3 py-2 text-sm"
            placeholder='Search e.g. "bella canvas 3001"'
            value={bpQuery}
            onChange={(e) => setBpQuery(e.target.value)}
          />
          <button onClick={searchBlueprints} className="rounded-md bg-black px-3 py-2 text-sm text-white">
            Search
          </button>
        </div>
        {bpResults.length > 0 && (
          <ul className="mt-3 max-h-60 divide-y overflow-y-auto rounded border">
            {bpResults.map((b) => (
              <li
                key={b.id}
                onClick={() => {
                  setBlueprintId(b.id);
                  setProviderId('');
                  setVariantIds([]);
                  setProviders([]);
                  setVariants([]);
                }}
                className={
                  'cursor-pointer px-3 py-2 text-sm hover:bg-zinc-50 ' +
                  (blueprintId === b.id ? 'bg-blue-50 font-medium' : '')
                }
              >
                #{b.id} · {b.title}{' '}
                <span className="text-xs text-zinc-500">
                  {b.brand} {b.model}
                </span>
              </li>
            ))}
          </ul>
        )}
        {blueprintId && (
          <p className="mt-2 text-xs text-zinc-500">Selected blueprint: #{blueprintId}</p>
        )}
      </section>

      {providers.length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <label className="block text-sm font-medium">Print provider</label>
          <select
            className="mt-2 w-full rounded-md border px-3 py-2 text-sm"
            value={providerId}
            onChange={(e) => {
              setProviderId(Number(e.target.value));
              setVariantIds([]);
            }}
          >
            <option value="">— pick a provider —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.id} · {p.title}
              </option>
            ))}
          </select>
        </section>
      )}

      {variants.length > 0 && (
        <section className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium">
              Variants ({variantIds.length} of {variants.length} selected)
            </label>
            <div className="space-x-2 text-xs">
              <button
                onClick={() => setVariantIds(variants.map((v) => v.id))}
                className="text-blue-600 hover:underline"
              >
                Select all
              </button>
              <button onClick={() => setVariantIds([])} className="text-zinc-500 hover:underline">
                Clear
              </button>
            </div>
          </div>
          <div className="mt-2 grid max-h-80 grid-cols-1 gap-1 overflow-y-auto rounded border p-2 sm:grid-cols-2">
            {variants.map((v) => (
              <label key={v.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-zinc-50">
                <input
                  type="checkbox"
                  checked={variantIds.includes(v.id)}
                  onChange={() => toggleVariant(v.id)}
                />
                <span className="flex-1">{v.title}</span>
                <span className="text-zinc-400">${(v.cost / 100).toFixed(2)}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!!busy}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Save defaults
        </button>
        {busy && <span className="text-sm text-zinc-500">{busy}</span>}
        {savedMsg && <span className="text-sm text-green-700">{savedMsg}</span>}
      </div>
    </div>
  );
}
