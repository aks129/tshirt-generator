'use client';

import { useEffect, useState } from 'react';
import type { Settings } from '@/lib/db/schema';

type SellerProduct = {
  id: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  variantCount: number;
  visible: boolean;
  thumbnailUrl: string | null;
};

type MasterPreview = {
  productId: string;
  title: string;
  blueprintId: number;
  printProviderId: number;
  variants: Array<{ id: number; price: number; isEnabled: boolean }>;
  thumbnailUrl: string | null;
};

export function SettingsForm({ initialSettings }: { initialSettings: Settings | null }) {
  const [sellerProducts, setSellerProducts] = useState<SellerProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [masterId, setMasterId] = useState<string | null>(initialSettings?.masterPrintifyProductId ?? null);
  const [masterPreview, setMasterPreview] = useState<MasterPreview | null>(null);
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
    setLoadingProducts(true);
    fetch('/api/printify/my-products')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setSellerProducts(j.products);
      })
      .finally(() => setLoadingProducts(false));
    fetch('/api/mockups/available')
      .then((r) => r.json())
      .then((j) => {
        if (j.ok && Array.isArray(j.labels)) setAvailableLabels(j.labels);
      });
  }, []);

  // Fetch full spec preview whenever master selection changes — gives the
  // operator a price range + variant count to verify before publishing.
  useEffect(() => {
    if (!masterId) {
      setMasterPreview(null);
      return;
    }
    fetch(`/api/printify/my-products?id=${masterId}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setMasterPreview(j.master);
      })
      .catch(() => {});
  }, [masterId]);

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
          masterPrintifyProductId: masterId,
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
        <h2 className="mb-1 text-base font-bold">Master Printify product</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Every published design clones this product&apos;s blueprint, colors, sizes, per-variant prices, and print-area placement.
          Set it up once in your Printify dashboard (with curated mockups), then pick it here.
        </p>

        {loadingProducts && (
          <p className="rounded bg-zinc-50 px-3 py-2 text-xs text-zinc-500">Loading your Printify products…</p>
        )}

        {!loadingProducts && sellerProducts.length === 0 && (
          <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            No Printify products found. Create one in the{' '}
            <a href="https://printify.com/app/products" target="_blank" rel="noopener" className="underline">
              Printify dashboard
            </a>{' '}
            with your target colors, sizes, prices, and mockup selection — then refresh this page.
          </p>
        )}

        {sellerProducts.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-600" htmlFor="master-select">
              Master template
            </label>
            <select
              id="master-select"
              value={masterId ?? ''}
              onChange={(e) => setMasterId(e.target.value || null)}
              className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm"
            >
              <option value="">— Select a master product —</option>
              {sellerProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.variantCount} variants)
                </option>
              ))}
            </select>

            {masterPreview && (
              <div className="mt-3 flex gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                {masterPreview.thumbnailUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={masterPreview.thumbnailUrl} alt="" className="h-20 w-20 rounded object-contain" />
                )}
                <div className="flex-1 text-xs">
                  <div className="font-semibold text-zinc-900">{masterPreview.title}</div>
                  <div className="mt-0.5 text-zinc-500">
                    Blueprint {masterPreview.blueprintId} · Provider {masterPreview.printProviderId}
                  </div>
                  <div className="mt-0.5 text-zinc-500">
                    {masterPreview.variants.length} enabled variant{masterPreview.variants.length === 1 ? '' : 's'}
                    {' · '}
                    Price range: $
                    {(Math.min(...masterPreview.variants.map((v) => v.price)) / 100).toFixed(2)}
                    {' – $'}
                    {(Math.max(...masterPreview.variants.map((v) => v.price)) / 100).toFixed(2)}
                  </div>
                  <p className="mt-1.5 text-[11px] text-emerald-700">
                    ✓ Every publish clones this product&apos;s exact config.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
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
          disabled={saving || !masterId}
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
