'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BUILT_IN_FONTS,
  SHIRT_PRESETS,
  SAMPLE_TEXT,
  preloadAllFonts,
  type BuiltInFont,
} from '@/lib/canvas/fonts';
import { renderRowToBlob, safeFileName, downloadBlob, type RenderSettings } from '@/lib/canvas/render';
import { makeZip } from '@/lib/canvas/zip';
import { upload } from '@vercel/blob/client';
import { THEMES, type Theme } from '@/lib/themes/library';

type Row = { id: number; text: string };

type Settings = RenderSettings & {
  fontName: string;
  fontSize: number;
  shirtColor: string;
};

const DEFAULT_FONT = BUILT_IN_FONTS[7]; // Archivo Black

export function BulkGenerator() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(() =>
    SAMPLE_TEXT.split('\n').map((t, i) => ({ id: i + 1, text: t })),
  );
  const [selectedId, setSelectedId] = useState(1);
  const [customFonts, setCustomFonts] = useState<BuiltInFont[]>([]);
  const allFonts = useMemo<BuiltInFont[]>(() => [...BUILT_IN_FONTS, ...customFonts], [customFonts]);

  const [settings, setSettings] = useState<Settings>({
    font: DEFAULT_FONT.family,
    fontName: DEFAULT_FONT.name,
    fontSize: 22,
    textColor: '#1a1a1a',
    shirtColor: '#ffffff',
    hAlign: 'center',
    vAlign: 'middle',
  });

  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState('');
  const [view, setView] = useState<'editor' | 'grid'>('editor');
  const [gridBg, setGridBg] = useState<'checker' | 'white' | 'black'>('checker');
  const [themesOpen, setThemesOpen] = useState(false);

  useEffect(() => {
    preloadAllFonts();
  }, []);

  const updateRow = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [...rs, { id: (rs[rs.length - 1]?.id || 0) + 1, text: '' }]);
  const removeRow = (id: number) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const duplicateRow = (id: number) => {
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === id);
      if (idx < 0) return rs;
      const newId = (rs[rs.length - 1]?.id || 0) + 1;
      const copy = { ...rs[idx], id: newId };
      return [...rs.slice(0, idx + 1), copy, ...rs.slice(idx + 1)];
    });
  };

  const pasteList = () => {
    const text = window.prompt('Paste your list — one slogan per line:', '');
    if (text == null) return;
    const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    setRows(lines.map((t, i) => ({ id: i + 1, text: t })));
    setSelectedId(1);
  };

  const replaceAll = (newText: string) => {
    const lines = newText.split('\n');
    setRows(lines.map((t, i) => ({ id: i + 1, text: t })));
  };

  const applyTheme = (theme: Theme, mode: 'replace' | 'append') => {
    if (mode === 'replace') {
      setRows(theme.slogans.map((t, i) => ({ id: i + 1, text: t })));
      setSelectedId(1);
    } else {
      setRows((rs) => {
        const base = (rs[rs.length - 1]?.id || 0);
        const next = [...rs, ...theme.slogans.map((t, i) => ({ id: base + i + 1, text: t }))];
        return next;
      });
    }
    setThemesOpen(false);
  };

  const pickTheme = (theme: Theme) => {
    const visibleCount = rows.filter((r) => (r.text || '').trim()).length;
    if (visibleCount === 0) {
      applyTheme(theme, 'replace');
      return;
    }
    const replace = confirm(
      `Replace your current ${visibleCount} row${visibleCount === 1 ? '' : 's'} with ${theme.slogans.length} "${theme.label}" slogans?\n\nOK = replace · Cancel = append`,
    );
    applyTheme(theme, replace ? 'replace' : 'append');
  };

  const handleFontUpload = useCallback(async (file: File) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const name = file.name.replace(/\.[^.]+$/, '');
    const family = `custom_${name.replace(/[^a-z0-9]+/gi, '_')}`;
    try {
      const ff = new FontFace(family, buf);
      await ff.load();
      document.fonts.add(ff);
      setCustomFonts((cf) => [
        ...cf,
        { name: name + ' (custom)', family: `'${family}', sans-serif`, url: '' },
      ]);
    } catch {
      alert("Couldn't load that font. Try a .ttf or .otf file.");
    }
  }, []);

  const renderSettings: RenderSettings = {
    font: settings.font,
    textColor: settings.textColor,
    hAlign: settings.hAlign,
    vAlign: settings.vAlign,
  };

  const exportOne = async (row: Row) => {
    setBusy(true);
    setBusyText(`Rendering "${(row.text || 'shirt').slice(0, 30)}"…`);
    const blob = await renderRowToBlob(row.text, renderSettings);
    downloadBlob(blob, safeFileName(row.text, `shirt_${row.id}`) + '.png');
    setBusy(false);
  };

  const exportAll = async () => {
    const visible = rows.filter((r) => (r.text || '').trim());
    if (!visible.length) return;
    setBusy(true);
    const entries: { name: string; blob: Blob }[] = [];
    for (let i = 0; i < visible.length; i++) {
      const r = visible[i];
      setBusyText(`Rendering ${i + 1} / ${visible.length}…`);
      const blob = await renderRowToBlob(r.text, renderSettings);
      const fname =
        String(i + 1).padStart(3, '0') + '_' + safeFileName(r.text, `shirt_${r.id}`) + '.png';
      entries.push({ name: fname, blob });
      await new Promise((r) => setTimeout(r, 0));
    }
    setBusyText('Building ZIP…');
    const zip = await makeZip(entries);
    downloadBlob(zip, `tshirt_designs_${visible.length}.zip`);
    setBusy(false);
  };

  const saveBatch = async () => {
    const visible = rows.filter((r) => (r.text || '').trim());
    if (!visible.length) return;
    setBusy(true);
    try {
      const batchKey = Date.now().toString(36);
      const uploaded: { text: string; blobUrl: string }[] = [];
      for (let i = 0; i < visible.length; i++) {
        const r = visible[i];
        setBusyText(`Rendering & uploading ${i + 1} / ${visible.length}…`);
        const blob = await renderRowToBlob(r.text, renderSettings);
        const filename = `designs/bulk/${batchKey}/${String(i + 1).padStart(3, '0')}_${safeFileName(r.text, `shirt_${r.id}`)}.png`;
        const result = await upload(filename, blob, {
          access: 'public',
          handleUploadUrl: '/api/bulk-batches/upload-token',
          contentType: 'image/png',
        });
        uploaded.push({ text: r.text, blobUrl: result.url });
        await new Promise((res) => setTimeout(res, 0));
      }
      setBusyText('Saving batch…');
      const res = await fetch('/api/bulk-batches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          meta: {
            fontName: settings.fontName,
            font: settings.font,
            textColor: settings.textColor,
            hAlign: settings.hAlign,
            vAlign: settings.vAlign,
            shirtColor: settings.shirtColor,
          },
          designs: uploaded,
        }),
      });
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        const txt = await res.text();
        throw new Error(`Server returned ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Save failed (${res.status})`);
      router.push(`/batches/${json.batchId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const selected = rows.find((r) => r.id === selectedId) || rows[0];
  const visibleCount = rows.filter((r) => (r.text || '').trim()).length;

  return (
    <div className="-mx-6 -my-8 flex min-h-[calc(100vh-58px)] flex-col bg-zinc-100 text-zinc-900">
      {/* HEADER */}
      <header className="flex items-center gap-2.5 border-b border-zinc-200 bg-white px-6 py-3.5">
        <div>
          <div className="text-xl font-bold">Bulk T-Shirt Generator</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            Paste a list. Style once. Download print-ready PNGs.
          </div>
        </div>
        <div className="flex-1" />
        <div className="mr-1.5 flex overflow-hidden rounded-md border border-zinc-300">
          <button
            onClick={() => setView('editor')}
            className={
              'px-3.5 py-1.5 text-sm font-medium ' +
              (view === 'editor' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-50')
            }
          >
            Editor
          </button>
          <button
            onClick={() => setView('grid')}
            className={
              'px-3.5 py-1.5 text-sm font-medium ' +
              (view === 'grid' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-50')
            }
          >
            Grid ({visibleCount})
          </button>
        </div>
        <div className="relative">
          <button type="button" className={btnGhost} onClick={() => setThemesOpen((o) => !o)}>🎨 Themes</button>
          {themesOpen && (
            <>
              <div className="fixed inset-0 z-[40]" onClick={() => setThemesOpen(false)} />
              <div className="absolute right-0 z-50 mt-1 w-72 rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
                {THEMES.map((t) => (
                  <button
                    type="button"
                    key={t.slug}
                    onClick={() => pickTheme(t)}
                    className="flex w-full items-start gap-2 rounded px-2.5 py-2 text-left hover:bg-zinc-50"
                  >
                    <span className="text-lg leading-none">{t.emoji}</span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-zinc-900">
                        {t.label} <span className="text-xs font-normal text-zinc-500">({t.slogans.length})</span>
                      </span>
                      <span className="block text-xs text-zinc-500">{t.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button className={btnGhost} onClick={pasteList}>📋 Paste list</button>
        <button className={btnGhost} onClick={() => replaceAll(SAMPLE_TEXT)}>↺ Sample</button>
        <button className={btnGhost} onClick={() => replaceAll('')}>✕ Clear</button>
        <button
          className={btnGhost}
          onClick={exportAll}
          disabled={busy || visibleCount === 0}
        >
          ⬇ Download ZIP ({visibleCount})
        </button>
        <button
          className={btnPrimary}
          onClick={saveBatch}
          disabled={busy || visibleCount === 0}
        >
          Save to review queue
        </button>
      </header>

      {view === 'grid' ? (
        <GridView
          rows={rows}
          settings={settings}
          gridBg={gridBg}
          setGridBg={setGridBg}
          onPick={(id) => {
            setSelectedId(id);
            setView('editor');
          }}
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr_320px] gap-3.5 p-3.5">
          {/* LEFT — global settings */}
          <aside className="overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4">
            <Section label="Font">
              <select
                aria-label="Font family"
                value={settings.fontName}
                onChange={(e) => {
                  const f = allFonts.find((x) => x.name === e.target.value);
                  if (f) setSettings({ ...settings, font: f.family, fontName: f.name });
                }}
                className="w-full rounded-md border border-zinc-300 bg-white px-2.5 py-2 text-sm"
              >
                {BUILT_IN_FONTS.map((f) => (
                  <option key={f.name} value={f.name} style={{ fontFamily: f.family }}>
                    {f.name}
                  </option>
                ))}
                {customFonts.length > 0 && <option disabled>──── custom ────</option>}
                {customFonts.map((f) => (
                  <option key={f.name} value={f.name} style={{ fontFamily: f.family }}>
                    {f.name}
                  </option>
                ))}
              </select>
              <label className="mt-1.5 inline-block cursor-pointer rounded-md border border-dashed border-zinc-400 bg-zinc-50 px-2.5 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100">
                ⬆ Upload .ttf / .otf
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2,font/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFontUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
              {customFonts.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {customFonts.map((f) => (
                    <div
                      key={f.name}
                      className="rounded border border-blue-600 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                      style={{ fontFamily: f.family }}
                    >
                      {f.name}
                    </div>
                  ))}
                </div>
              )}
            </Section>

            <Section label="Text size (preview)">
              <input
                type="range"
                min={10}
                max={48}
                value={settings.fontSize}
                onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })}
                className="w-full"
              />
              <div className={muted}>{settings.fontSize}px (export auto-fits)</div>
            </Section>

            <Section label="Text color">
              <ColorRow
                presets={['#1a1a1a', '#ffffff', '#e63946', '#f4a261', '#2a9d8f', '#264653', '#9b5de5', '#f72585']}
                value={settings.textColor}
                onChange={(v) => setSettings({ ...settings, textColor: v })}
              />
            </Section>

            <Section label="Shirt color (preview only)">
              <div className="flex flex-wrap items-center gap-1.5">
                {SHIRT_PRESETS.map((c) => (
                  <button
                    key={c.name}
                    title={c.name}
                    onClick={() => setSettings({ ...settings, shirtColor: c.value })}
                    className="h-7 w-7 cursor-pointer rounded-full"
                    style={{
                      background: c.value,
                      outline: settings.shirtColor === c.value ? '2px solid #2a6df4' : '1px solid #ccc',
                      outlineOffset: settings.shirtColor === c.value ? 1 : 0,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={settings.shirtColor}
                  onChange={(e) => setSettings({ ...settings, shirtColor: e.target.value })}
                  className="h-7 w-7 cursor-pointer rounded-md border border-zinc-300 bg-transparent p-0"
                  title="Custom shirt color"
                  aria-label="Custom shirt color"
                />
              </div>
              <div className={muted + ' mt-1'}>PNG export has no shirt — print-ready transparent bg.</div>
            </Section>

            <Section label="Horizontal alignment">
              <SegControl
                value={settings.hAlign}
                onChange={(v) => setSettings({ ...settings, hAlign: v as Settings['hAlign'] })}
                options={[
                  { value: 'left', label: '⇤ Left' },
                  { value: 'center', label: '↔ Center' },
                  { value: 'right', label: '⇥ Right' },
                ]}
              />
            </Section>

            <Section label="Vertical alignment">
              <SegControl
                value={settings.vAlign}
                onChange={(v) => setSettings({ ...settings, vAlign: v as Settings['vAlign'] })}
                options={[
                  { value: 'top', label: '⤒ Top' },
                  { value: 'middle', label: '⇕ Middle' },
                  { value: 'bottom', label: '⤓ Bottom' },
                ]}
              />
            </Section>

            <p className="border-t border-zinc-200 pt-3 text-[11px] leading-relaxed text-zinc-500">
              Settings apply to <strong>all</strong> shirts. Click a row to preview it with the current style.
            </p>
          </aside>

          {/* CENTER — list */}
          <section className="flex min-h-0 flex-col rounded-xl border border-zinc-200 bg-white">
            <div className="flex items-center gap-2.5 border-b border-zinc-200 px-4 py-3">
              <div className="text-sm font-bold">
                Shirts <span className={muted}>· {rows.length}</span>
              </div>
              <div className="flex-1" />
              <button className={btnTiny} onClick={addRow}>+ Add</button>
            </div>
            <div className="flex-1 overflow-y-auto p-2.5">
              {rows.map((r, i) => (
                <div
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={
                    'mb-1.5 flex items-center gap-2 rounded-lg border px-2.5 py-2 cursor-pointer ' +
                    (r.id === selectedId
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-zinc-200 bg-white hover:bg-zinc-50')
                  }
                >
                  <div className="min-w-[22px] text-right font-mono text-[11px] text-zinc-400">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <input
                    value={r.text}
                    onChange={(e) => updateRow(r.id, { text: e.target.value })}
                    placeholder="Slogan / name / text…"
                    className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    className={iconBtn}
                    title="Duplicate"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateRow(r.id);
                    }}
                  >
                    ⎘
                  </button>
                  <button
                    className={iconBtn}
                    title="Download PNG"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportOne(r);
                    }}
                  >
                    ⬇
                  </button>
                  <button
                    className={iconBtn}
                    title="Remove"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRow(r.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {rows.length === 0 && (
                <div className="p-8 text-center text-sm text-zinc-500">
                  No shirts yet. Click "Paste list" or "+ Add".
                </div>
              )}
            </div>
          </section>

          {/* RIGHT — preview */}
          <aside className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
            <div className="text-sm font-bold">Preview</div>
            {selected ? (
              <>
                <div className="flex justify-center rounded-lg bg-zinc-100 p-3.5">
                  <ShirtPreview color={settings.shirtColor}>
                    <DesignContent row={selected} settings={settings} />
                  </ShirtPreview>
                </div>
                <div className="text-sm leading-relaxed">
                  <div className="font-semibold">
                    {selected.text || <span className={muted}>(empty)</span>}
                  </div>
                  <div className={muted}>
                    {settings.fontName} · {settings.hAlign}/{settings.vAlign}
                  </div>
                </div>
                <button className={btnPrimary} onClick={() => exportOne(selected)} disabled={busy}>
                  ⬇ Download this PNG
                </button>
                <p className="rounded-md bg-zinc-100 p-2.5 text-[11px] leading-relaxed text-zinc-600">
                  <strong>Print-ready:</strong> 3000 × 3600 px transparent PNG (10″ × 12″ @ 300dpi).
                </p>
              </>
            ) : (
              <div className="p-8 text-center text-sm text-zinc-500">Select or add a row.</div>
            )}
          </aside>
        </div>
      )}

      {busy && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-3.5 rounded-xl bg-white px-6 py-5 text-sm font-medium shadow-2xl">
            <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-zinc-200 border-t-zinc-900" />
            <div>{busyText}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary =
  'rounded-md bg-zinc-900 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed';
const btnGhost =
  'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed';
const btnTiny =
  'rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50';
const iconBtn =
  'h-7 w-7 rounded-md border border-zinc-200 bg-white text-[13px] text-zinc-600 hover:bg-zinc-50';
const muted = 'text-xs text-zinc-500';

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-zinc-600">{label}</div>
      {children}
    </div>
  );
}

function SegControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={
            'flex-1 rounded-md border px-1.5 py-1.5 text-xs ' +
            (value === o.value
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50')
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorRow({
  presets,
  value,
  onChange,
}: {
  presets: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          title={c}
          className="h-6 w-6 rounded-md cursor-pointer"
          style={{ background: c, border: value === c ? '2px solid #2a6df4' : '1px solid #ccc' }}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded-md border border-zinc-300 bg-transparent p-0"
        aria-label="Custom color"
        title="Custom color"
      />
    </div>
  );
}

function ShirtPreview({
  color,
  children,
  w = 200,
  h = 220,
}: {
  color: string;
  children: React.ReactNode;
  w?: number;
  h?: number;
}) {
  const stroke = color === '#ffffff' || color === '#f0e6d2' ? '#888' : 'rgba(0,0,0,0.4)';
  const front =
    'M40 30 Q 60 18, 90 22 L 110 38 Q 130 44, 150 38 L 170 22 Q 200 18, 220 30 L 245 60 Q 250 70, 245 80 L 220 92 L 215 75 L 215 215 Q 215 225, 205 226 L 55 226 Q 45 225, 45 215 L 45 75 L 40 92 L 15 80 Q 10 70, 15 60 Z';
  return (
    <svg width={w} height={h} viewBox="0 0 260 250">
      <path d={front} fill={color} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M105 38 Q 130 56, 155 38" stroke={stroke} strokeWidth={1.4} fill="none" />
      <foreignObject x="68" y="62" width="124" height="130">
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            overflow: 'hidden',
          }}
        >
          {children}
        </div>
      </foreignObject>
    </svg>
  );
}

function DesignContent({ row, settings }: { row: Row; settings: Settings }) {
  const justify = { left: 'flex-start', center: 'center', right: 'flex-end' }[settings.hAlign];
  const align = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[settings.vAlign];
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: align,
        alignItems: justify,
        padding: 4,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontFamily: settings.font,
          color: settings.textColor,
          fontSize: settings.fontSize,
          lineHeight: 1.05,
          textAlign: settings.hAlign,
          textWrap: 'balance',
          fontWeight: 700,
          width: '100%',
        }}
      >
        {row.text || <span style={{ opacity: 0.3 }}>(empty)</span>}
      </div>
    </div>
  );
}

function GridView({
  rows,
  settings,
  gridBg,
  setGridBg,
  onPick,
}: {
  rows: Row[];
  settings: Settings;
  gridBg: 'checker' | 'white' | 'black';
  setGridBg: (b: 'checker' | 'white' | 'black') => void;
  onPick: (id: number) => void;
}) {
  const visible = rows.filter((r) => (r.text || '').trim());
  const bgs = {
    checker:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='10' height='10' fill='%23e8e8e8'/><rect x='10' y='10' width='10' height='10' fill='%23e8e8e8'/><rect width='20' height='20' fill='none'/></svg>\") #f5f5f5",
    white: '#ffffff',
    black: '#1a1a1a',
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-zinc-50">
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-6 py-2.5">
        <div className="text-[13px] text-zinc-600">
          {visible.length} design{visible.length === 1 ? '' : 's'} · transparent backgrounds
        </div>
        <div className="flex-1" />
        <span className="text-xs text-zinc-400">view bg:</span>
        {(['checker', 'white', 'black'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setGridBg(k)}
            className={
              'rounded-md border px-2.5 py-1 text-xs ' +
              (gridBg === k
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50')
            }
          >
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {visible.map((r, i) => {
            const textColor =
              gridBg === 'black' && settings.textColor === '#1a1a1a' ? '#ffffff' : settings.textColor;
            const justify = { left: 'flex-start', center: 'center', right: 'flex-end' }[settings.hAlign];
            const align = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[settings.vAlign];
            return (
              <div
                key={r.id}
                className="flex cursor-pointer flex-col gap-1.5"
                onClick={() => onPick(r.id)}
                title="Click to edit"
              >
                <div
                  className="aspect-[5/6] overflow-hidden rounded-lg border border-zinc-200"
                  style={{ background: bgs[gridBg] }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: align,
                      alignItems: justify,
                      padding: 16,
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: settings.font,
                        color: textColor,
                        fontSize: 'clamp(13px, 2.4vw, 22px)',
                        lineHeight: 1.05,
                        textAlign: settings.hAlign,
                        textWrap: 'balance',
                        fontWeight: 700,
                        width: '100%',
                      }}
                    >
                      {r.text}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-1">
                  <span className="font-mono text-[11px] text-zinc-400">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-xs text-zinc-700">
                    {r.text}
                  </span>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="p-8 text-center text-sm text-zinc-500">No shirts to show.</div>
          )}
        </div>
      </div>
    </div>
  );
}
