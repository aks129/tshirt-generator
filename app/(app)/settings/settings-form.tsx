'use client';

import { useEffect, useState } from 'react';
import type { Settings } from '@/lib/db/schema';

type Blueprint = { id: number; title: string; brand?: string; model?: string };
type Provider = { id: number; title: string };
type Variant = { id: number; title: string; color: string; size: string };

const DEFAULT_BLUEPRINT_ID = 6;

export function SettingsForm({ initialSettings }: { initialSettings: Settings | null }) {
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [blueprintId, setBlueprintId] = useState(initialSettings?.defaultPrintifyBlueprintId ?? DEFAULT_BLUEPRINT_ID);
  const [providerId, setProviderId] = useState(initialSettings?.defaultPrintProviderId ?? 0);
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<number>>(
    new Set((initialSettings?.defaultVariants as { variantIds?: number[] } | null)?.variantIds ?? []),
  );
  const [dailyGenerationCap, setDailyGenerationCap] = useState(initialSettings?.dailyGenerationCap ?? 50);
  const [dailyPublishCap, setDailyPublishCap] = useState(initialSettings?.dailyPublishCap ?? 15);
  const [dailyBudgetCents, setDailyBudgetCents] = useState(initialSettings?.dailyBudgetCents ?? 500);
  const [killSwitch, setKillSwitch] = useState(initialSettings?.killSwitchActive ?? false);
  const [priceOffsetCents, setPriceOffsetCents] = useState(initialSettings?.priceOffsetCents ?? 100);
  const [minPriceFloorCents, setMinPriceFloorCents] = useState(initialSettings?.minPriceFloorCents ?? 1499);
  const [etsyShopName, setEtsyShopName] = useState<string | null>(
    initialSettings?.etsyShopIdOauth ? `shop_id ${initialSettings.etsyShopIdOauth}` : null,
  );
  const [etsyExpiresAt, setEtsyExpiresAt] = useState<Date | null>(
    initialSettings?.etsyTokenExpiresAt ? new Date(initialSettings.etsyTokenExpiresAt) : null,
  );
  const [etsyConnecting, setEtsyConnecting] = useState(false);
  const [etsyDisconnecting, setEtsyDisconnecting] = useState(false);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    (initialSettings?.mockupSelection as { labels?: string[] } | null)?.labels ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch('/api/printify/catalog')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) {
          setBlueprints(j.blueprints);
          setProviders(j.providers);
        }
      });
    fetch('/api/mockups/available')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.labels)) setAvailableLabels(j.labels);
      });
  }, []);

  useEffect(() => {
    if (!providerId) return;
    fetch(`/api/printify/catalog?blueprintId=${blueprintId}&providerId=${providerId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setVariants(j.variants);
      });
  }, [blueprintId, providerId]);

  const colors = Array.from(new Set(variants.map((v) => v.color))).filter(Boolean);
  const sizes = Array.from(new Set(variants.map((v) => v.size))).filter(Boolean);

  function toggleVariant(id: number) {
    const next = new Set(selectedVariantIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedVariantIds(next);
  }

  function addMockupLabel(label: string) {
    if (selectedLabels.includes(label)) return;
    if (selectedLabels.length >= 9) return;
    setSelectedLabels([...selectedLabels, label]);
  }

  function removeMockupLabel(label: string) {
    setSelectedLabels(selectedLabels.filter((l) => l !== label));
  }

  function moveMockupLabel(label: string, direction: -1 | 1) {
    const i = selectedLabels.indexOf(label);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= selectedLabels.length) return;
    const next = [...selectedLabels];
    [next[i], next[j]] = [next[j], next[i]];
    setSelectedLabels(next);
  }

  async function connectEtsy() {
    setEtsyConnecting(true);
    try {
      const res = await fetch('/api/etsy/oauth/start', { method: 'POST' });
      const j = await res.json();
      if (j.ok && j.redirectUrl) {
        window.location.href = j.redirectUrl;
      } else {
        alert(j.error || 'Failed to start Etsy connection');
        setEtsyConnecting(false);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
      setEtsyConnecting(false);
    }
  }

  async function disconnectEtsy() {
    if (!confirm('Disconnect Etsy? Photo uploads will stop working until you reconnect.')) return;
    setEtsyDisconnecting(true);
    try {
      await fetch('/api/etsy/oauth/disconnect', { method: 'POST' });
      setEtsyShopName(null);
      setEtsyExpiresAt(null);
    } finally {
      setEtsyDisconnecting(false);
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          defaultPrintifyBlueprintId: blueprintId,
          defaultPrintProviderId: providerId,
          defaultVariants: { variantIds: Array.from(selectedVariantIds) },
          dailyGenerationCap,
          dailyPublishCap,
          dailyBudgetCents,
          killSwitchActive: killSwitch,
          priceOffsetCents,
          minPriceFloorCents,
          mockupSelection: selectedLabels.length > 0 ? { labels: selectedLabels } : null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setError(j.error || 'Save failed');
        return;
      }
      setSuccess('Saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-bold">Etsy connection</h2>
        {etsyShopName ? (
          <div className="space-y-2 text-sm">
            <div>Connected as <strong>{etsyShopName}</strong></div>
            {etsyExpiresAt && (
              <div className="text-xs text-zinc-500">
                Token expires {etsyExpiresAt.toLocaleString()} (auto-refreshed)
              </div>
            )}
            <button
              type="button"
              onClick={disconnectEtsy}
              disabled={etsyDisconnecting}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              {etsyDisconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600">
              Not connected. Connect Etsy to upload extra mockup photos to your listings automatically.
            </p>
            <button
              type="button"
              onClick={connectEtsy}
              disabled={etsyConnecting}
              className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {etsyConnecting ? 'Redirecting…' : 'Connect Etsy shop →'}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-bold">Printify</h2>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600" htmlFor="blueprint-select">Blueprint</label>
            <select
              id="blueprint-select"
              className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm"
              value={blueprintId}
              onChange={(e) => setBlueprintId(Number(e.target.value))}
            >
              {blueprints.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600" htmlFor="provider-select">Print provider</label>
            <select
              id="provider-select"
              className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm"
              value={providerId}
              onChange={(e) => setProviderId(Number(e.target.value))}
            >
              <option value={0}>Select a provider…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          {variants.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600">
                Variants ({selectedVariantIds.size} selected)
              </label>
              <div className="overflow-x-auto rounded-md border border-zinc-200">
                <table className="text-xs">
                  <thead>
                    <tr>
                      <th className="bg-zinc-50 px-2 py-1 text-left" />
                      {sizes.map((sz) => (
                        <th key={sz} className="bg-zinc-50 px-2 py-1 text-center">{sz}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {colors.map((c) => (
                      <tr key={c}>
                        <td className="px-2 py-1 font-medium">{c}</td>
                        {sizes.map((sz) => {
                          const v = variants.find((x) => x.color === c && x.size === sz);
                          if (!v) return <td key={sz} />;
                          return (
                            <td key={sz} className="px-2 py-1 text-center">
                              <input
                                type="checkbox"
                                checked={selectedVariantIds.has(v.id)}
                                onChange={() => toggleVariant(v.id)}
                                aria-label={`${c} ${sz}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-base font-bold">Mockup photos</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Pick up to 9 Printify mockups to auto-upload to Etsy after publish. Order = upload order. If left empty, a sensible default is used.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-600">
              Available ({availableLabels.length})
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-2">
              {availableLabels.length === 0 && (
                <p className="text-xs text-zinc-400">Loading…</p>
              )}
              {availableLabels.map((label) => {
                const picked = selectedLabels.includes(label);
                const full = selectedLabels.length >= 9;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => addMockupLabel(label)}
                    disabled={picked || full}
                    className={
                      'flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs ' +
                      (picked
                        ? 'cursor-not-allowed bg-zinc-200 text-zinc-400'
                        : full
                          ? 'cursor-not-allowed text-zinc-400'
                          : 'bg-white text-zinc-800 hover:bg-zinc-100')
                    }
                  >
                    <span>{label}</span>
                    <span className="text-[10px] text-zinc-400">{picked ? '✓ added' : full ? 'full' : '+ add'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-600">
              Selected ({selectedLabels.length}/9)
            </div>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-zinc-200 bg-zinc-50 p-2">
              {selectedLabels.length === 0 && (
                <p className="text-xs text-zinc-400">None selected — defaults will be used.</p>
              )}
              {selectedLabels.map((label, i) => (
                <div key={label} className="flex items-center gap-1 rounded bg-white px-2 py-1 text-xs">
                  <span className="w-4 text-right text-zinc-400">{i + 1}.</span>
                  <span className="flex-1">{label}</span>
                  <button
                    type="button"
                    onClick={() => moveMockupLabel(label, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="rounded px-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                  >↑</button>
                  <button
                    type="button"
                    onClick={() => moveMockupLabel(label, 1)}
                    disabled={i === selectedLabels.length - 1}
                    aria-label="Move down"
                    className="rounded px-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30"
                  >↓</button>
                  <button
                    type="button"
                    onClick={() => removeMockupLabel(label)}
                    aria-label="Remove"
                    className="rounded px-1 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-bold">Caps</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <NumberField label="Generation/day" value={dailyGenerationCap} onChange={setDailyGenerationCap} />
          <NumberField label="Publish/day" value={dailyPublishCap} onChange={setDailyPublishCap} />
          <NumberField label="Budget/day (¢)" value={dailyBudgetCents} onChange={setDailyBudgetCents} />
          <NumberField label="Price offset (¢)" value={priceOffsetCents} onChange={setPriceOffsetCents} />
          <NumberField label="Min price floor (¢)" value={minPriceFloorCents} onChange={setMinPriceFloorCents} />
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-bold">Kill switch</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={killSwitch} onChange={(e) => setKillSwitch(e.target.checked)} />
          Pause all publishing
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !providerId || selectedVariantIds.size === 0}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
        {success && <span className="text-sm text-emerald-600">{success}</span>}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600">{label}</label>
      <input
        type="number"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}
