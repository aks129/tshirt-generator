// Bulk T-Shirt Generator — Working Spreadsheet edition
// Paste list → many shirts → PNG / ZIP export

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ---------- defaults / fonts ----------
const BUILT_IN_FONTS = [
  { name: "Caveat", family: "'Caveat', cursive", url: "https://fonts.googleapis.com/css2?family=Caveat:wght@400;700&display=swap" },
  { name: "Bebas Neue", family: "'Bebas Neue', sans-serif", url: "https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" },
  { name: "Anton", family: "'Anton', sans-serif", url: "https://fonts.googleapis.com/css2?family=Anton&display=swap" },
  { name: "Bungee", family: "'Bungee', cursive", url: "https://fonts.googleapis.com/css2?family=Bungee&display=swap" },
  { name: "Permanent Marker", family: "'Permanent Marker', cursive", url: "https://fonts.googleapis.com/css2?family=Permanent+Marker&display=swap" },
  { name: "Playfair Display", family: "'Playfair Display', serif", url: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&display=swap" },
  { name: "JetBrains Mono", family: "'JetBrains Mono', monospace", url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&display=swap" },
  { name: "Archivo Black", family: "'Archivo Black', sans-serif", url: "https://fonts.googleapis.com/css2?family=Archivo+Black&display=swap" },
  { name: "Special Elite", family: "'Special Elite', cursive", url: "https://fonts.googleapis.com/css2?family=Special+Elite&display=swap" },
  { name: "Rubik Mono One", family: "'Rubik Mono One', sans-serif", url: "https://fonts.googleapis.com/css2?family=Rubik+Mono+One&display=swap" },
];

const SHIRT_PRESETS = [
  { name: "White", value: "#ffffff" },
  { name: "Black", value: "#1a1a1a" },
  { name: "Heather Gray", value: "#b8b8b8" },
  { name: "Navy", value: "#1f2a44" },
  { name: "Forest", value: "#2d4a36" },
  { name: "Maroon", value: "#5c1a2b" },
  { name: "Mustard", value: "#d4a544" },
  { name: "Dusty Pink", value: "#d9a3a3" },
  { name: "Cream", value: "#f0e6d2" },
  { name: "Light Brown", value: "#b88862" },
];

const SAMPLE_TEXT = `Running on Coffee and Dog Kisses.
I came. I saw. I made it awkward.
Running late is my cardio.
I put the "pro" in procrastinate.
Doing my best (it's not much).
Chaos Coordinator
Unsupervised and thriving
Feral
Gen X and Feral
Slightly Unhinged.
I run on coffee and chaos.
Some days I amaze myself. Other days I lose my phone while holding it.
Surviving, not thriving.
Powered by coffee and tiny humans.
Sorry I'm late, I saw a dog.
Calm but internally screaming.
No F's left.
I'm not lazy, I'm on energy-saving mode.
Low battery, send snacks.
Coffee Beach Repeat`;

// ---------- helpers ----------

function loadGoogleFont(url) {
  if (document.querySelector(`link[href="${url}"]`)) return;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = url;
  document.head.appendChild(l);
}

// load all built-in fonts up front
BUILT_IN_FONTS.forEach((f) => loadGoogleFont(f.url));

// design dimensions — print-ready PNG
const PRINT_W = 3000; // 10" @ 300dpi
const PRINT_H = 3600; // 12" @ 300dpi

// ---------- shirt SVG (for preview only — print uses its own canvas) ----------

function ShirtPreview({ color, children, w = 200, h = 220, view = "front" }) {
  const stroke = color === "#ffffff" || color === "#f0e6d2" ? "#888" : "rgba(0,0,0,0.4)";
  const front = "M40 30 Q 60 18, 90 22 L 110 38 Q 130 44, 150 38 L 170 22 Q 200 18, 220 30 L 245 60 Q 250 70, 245 80 L 220 92 L 215 75 L 215 215 Q 215 225, 205 226 L 55 226 Q 45 225, 45 215 L 45 75 L 40 92 L 15 80 Q 10 70, 15 60 Z";
  return (
    <svg width={w} height={h} viewBox="0 0 260 250">
      <path d={front} fill={color} stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
      <path d="M105 38 Q 130 56, 155 38" stroke={stroke} strokeWidth={1.4} fill="none" />
      <foreignObject x="68" y="62" width="124" height="130">
        <div style={{ width: "100%", height: "100%", display: "flex", overflow: "hidden" }}>
          {children}
        </div>
      </foreignObject>
    </svg>
  );
}

// renders the design (text) inside its bounding box according to alignment
function DesignContent({ row, settings }) {
  const justify = { left: "flex-start", center: "center", right: "flex-end" }[row.hAlign || settings.hAlign];
  const align = { top: "flex-start", middle: "center", bottom: "flex-end" }[row.vAlign || settings.vAlign];
  const fontFamily = row.font || settings.font;
  const textColor = row.textColor || settings.textColor;
  const fontSize = row.fontSize || settings.fontSize;
  const textAlign = row.hAlign || settings.hAlign;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: align,
        alignItems: justify,
        padding: 4,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontFamily,
          color: textColor,
          fontSize,
          lineHeight: 1.05,
          textAlign,
          textWrap: "balance",
          fontWeight: 700,
          width: "100%",
        }}
      >
        {row.text || <span style={{ opacity: 0.3 }}>(empty)</span>}
      </div>
    </div>
  );
}

// ---------- tiny zip writer (store-only, no compression) ----------
// produces a valid ZIP with stored entries. enough for PNG bundling.
async function makeZip(entries /* [{name, blob}] */) {
  const enc = new TextEncoder();
  const fileRecs = [];
  const centralRecs = [];
  let offset = 0;

  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xffffffff;
    for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const buf = new Uint8Array(await e.blob.arrayBuffer());
    const crc = crc32(buf);
    const size = buf.length;
    // local file header
    const lf = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(lf.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true); // version
    dv.setUint16(6, 0, true);  // flags
    dv.setUint16(8, 0, true);  // method = store
    dv.setUint16(10, 0, true); // mod time
    dv.setUint16(12, 0, true); // mod date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);
    dv.setUint32(22, size, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    lf.set(nameBytes, 30);
    fileRecs.push(lf, buf);

    // central dir entry
    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true);
    cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    centralRecs.push(cd);

    offset += lf.length + buf.length;
  }

  let cdSize = 0;
  centralRecs.forEach((c) => (cdSize += c.length));
  const cdOffset = offset;

  // EOCD
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);

  return new Blob([...fileRecs, ...centralRecs, eocd], { type: "application/zip" });
}

// ---------- canvas renderer (print-ready PNG, transparent bg) ----------

function wrapTextLines(ctx, text, maxWidth) {
  const lines = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const trial = cur ? cur + " " + w : w;
      if (ctx.measureText(trial).width <= maxWidth || !cur) {
        cur = trial;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    lines.push(cur);
  }
  return lines;
}

async function renderRowToBlob(row, settings) {
  // wait a tick for fonts to be loadable
  const text = (row.text || "").trim();
  if (!text) {
    const canvas = document.createElement("canvas");
    canvas.width = PRINT_W; canvas.height = PRINT_H;
    return new Promise((res) => canvas.toBlob(res, "image/png"));
  }
  const fontFamily = row.font || settings.font;
  const textColor = row.textColor || settings.textColor;
  const hAlign = row.hAlign || settings.hAlign;
  const vAlign = row.vAlign || settings.vAlign;

  // Try to ensure font is loaded
  try {
    await document.fonts.load(`bold 200px ${fontFamily}`, text);
  } catch {}

  const canvas = document.createElement("canvas");
  canvas.width = PRINT_W;
  canvas.height = PRINT_H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, PRINT_W, PRINT_H);

  // pick font size that fits — start big, shrink to fit width × height
  const padding = 100;
  const maxW = PRINT_W - padding * 2;
  const maxH = PRINT_H - padding * 2;
  let fontSize = 600;
  let lines = [];
  while (fontSize > 40) {
    ctx.font = `bold ${fontSize}px ${fontFamily}`;
    lines = wrapTextLines(ctx, text, maxW);
    const lineH = fontSize * 1.1;
    const totalH = lineH * lines.length;
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (totalH <= maxH && widest <= maxW) break;
    fontSize = Math.floor(fontSize * 0.92);
  }

  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = textColor;
  ctx.textBaseline = "top";

  const lineH = fontSize * 1.1;
  const totalH = lineH * lines.length;

  let yStart;
  if (vAlign === "top") yStart = padding;
  else if (vAlign === "bottom") yStart = PRINT_H - padding - totalH;
  else yStart = (PRINT_H - totalH) / 2;

  ctx.textAlign = hAlign === "left" ? "left" : hAlign === "right" ? "right" : "center";
  const x = hAlign === "left" ? padding : hAlign === "right" ? PRINT_W - padding : PRINT_W / 2;

  lines.forEach((ln, i) => {
    ctx.fillText(ln, x, yStart + i * lineH);
  });

  return new Promise((res) => canvas.toBlob(res, "image/png"));
}

function safeFileName(s, fallback = "shirt") {
  return (s || fallback).slice(0, 60).replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || fallback;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================
// APP
// ============================================================

function App() {
  const [rows, setRows] = useState(() =>
    SAMPLE_TEXT.split("\n").map((t, i) => ({ id: i + 1, text: t }))
  );
  const [selectedId, setSelectedId] = useState(1);
  const [customFonts, setCustomFonts] = useState([]); // {name, family}
  const allFonts = useMemo(() => [...BUILT_IN_FONTS, ...customFonts], [customFonts]);

  const [settings, setSettings] = useState({
    font: BUILT_IN_FONTS[7].family, // Archivo Black
    fontName: BUILT_IN_FONTS[7].name,
    fontSize: 22,
    textColor: "#1a1a1a",
    shirtColor: "#ffffff",
    hAlign: "center",
    vAlign: "middle",
  });

  const [busy, setBusy] = useState(false);
  const [busyText, setBusyText] = useState("");
  const [view, setView] = useState("editor"); // 'editor' | 'grid'
  const [gridBg, setGridBg] = useState("checker"); // 'checker' | 'white' | 'black'

  // ---- row ops ----
  const updateRow = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [...rs, { id: (rs[rs.length - 1]?.id || 0) + 1, text: "" }]);
  const removeRow = (id) =>
    setRows((rs) => rs.filter((r) => r.id !== id));
  const duplicateRow = (id) => {
    setRows((rs) => {
      const idx = rs.findIndex((r) => r.id === id);
      if (idx < 0) return rs;
      const newId = (rs[rs.length - 1]?.id || 0) + 1;
      const copy = { ...rs[idx], id: newId };
      return [...rs.slice(0, idx + 1), copy, ...rs.slice(idx + 1)];
    });
  };

  const pasteList = () => {
    const text = window.prompt("Paste your list — one slogan per line:", "");
    if (text == null) return;
    const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    setRows(lines.map((t, i) => ({ id: i + 1, text: t })));
    setSelectedId(1);
  };

  const replaceAll = (newText) => {
    const lines = newText.split("\n");
    setRows(lines.map((t, i) => ({ id: i + 1, text: t })));
  };

  // ---- font upload ----
  const handleFontUpload = useCallback(async (file) => {
    if (!file) return;
    const buf = await file.arrayBuffer();
    const name = file.name.replace(/\.[^.]+$/, "");
    const family = `custom_${name.replace(/[^a-z0-9]+/gi, "_")}`;
    try {
      const ff = new FontFace(family, buf);
      await ff.load();
      document.fonts.add(ff);
      setCustomFonts((cf) => [...cf, { name: name + " (custom)", family: `'${family}', sans-serif` }]);
    } catch (err) {
      alert("Couldn't load that font. Try a .ttf or .otf file.");
    }
  }, []);

  // ---- export ----
  const exportOne = async (row) => {
    setBusy(true);
    setBusyText(`Rendering "${(row.text || "shirt").slice(0, 30)}"…`);
    const blob = await renderRowToBlob(row, settings);
    downloadBlob(blob, safeFileName(row.text, `shirt_${row.id}`) + ".png");
    setBusy(false);
  };
  const exportAll = async () => {
    if (!rows.length) return;
    setBusy(true);
    const entries = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      setBusyText(`Rendering ${i + 1} / ${rows.length}…`);
      const blob = await renderRowToBlob(r, settings);
      const fname = String(i + 1).padStart(3, "0") + "_" + safeFileName(r.text, `shirt_${r.id}`) + ".png";
      entries.push({ name: fname, blob });
      // yield to UI
      await new Promise((r) => setTimeout(r, 0));
    }
    setBusyText("Building ZIP…");
    const zip = await makeZip(entries);
    downloadBlob(zip, `tshirt_designs_${rows.length}.zip`);
    setBusy(false);
  };

  const selected = rows.find((r) => r.id === selectedId) || rows[0];

  return (
    <div style={st.app}>
      {/* HEADER */}
      <div style={st.header}>
        <div>
          <div style={st.title}>Bulk T-Shirt Generator</div>
          <div style={st.subtitle}>Paste a list. Style once. Download print-ready PNGs.</div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={st.viewToggle}>
          <button
            style={{ ...st.viewToggleBtn, background: view === "editor" ? "#1a1a1a" : "#fff", color: view === "editor" ? "#fff" : "#333" }}
            onClick={() => setView("editor")}
          >Editor</button>
          <button
            style={{ ...st.viewToggleBtn, background: view === "grid" ? "#1a1a1a" : "#fff", color: view === "grid" ? "#fff" : "#333" }}
            onClick={() => setView("grid")}
          >Grid ({rows.filter(r => (r.text || "").trim()).length})</button>
        </div>
        <button style={st.btnGhost} onClick={pasteList}>📋 Paste list</button>
        <button style={st.btnGhost} onClick={() => replaceAll(SAMPLE_TEXT)}>↺ Sample</button>
        <button style={st.btnGhost} onClick={() => replaceAll("")}>✕ Clear</button>
        <button style={st.btnPrimary} onClick={exportAll} disabled={busy || rows.length === 0}>
          ⬇ Download all PNGs ({rows.filter((r) => (r.text || "").trim()).length})
        </button>
      </div>

      {view === "grid" ? (
        <GridView rows={rows} settings={settings} gridBg={gridBg} setGridBg={setGridBg} onPick={(id) => { setSelectedId(id); setView("editor"); }} />
      ) : (
      <div style={st.body}>
        {/* LEFT — global settings */}
        <div style={st.panel}>
          <Section label="Font">
            <select
              value={settings.fontName}
              onChange={(e) => {
                const f = allFonts.find((x) => x.name === e.target.value);
                if (f) setSettings({ ...settings, font: f.family, fontName: f.name });
              }}
              style={st.select}
            >
              {BUILT_IN_FONTS.map((f) => (
                <option key={f.name} value={f.name} style={{ fontFamily: f.family }}>{f.name}</option>
              ))}
              {customFonts.length > 0 && <option disabled>──── custom ────</option>}
              {customFonts.map((f) => (
                <option key={f.name} value={f.name} style={{ fontFamily: f.family }}>{f.name}</option>
              ))}
            </select>
            <label style={st.uploadBtn}>
              ⬆ Upload .ttf / .otf
              <input
                type="file"
                accept=".ttf,.otf,.woff,.woff2,font/*"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFontUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
            {customFonts.length > 0 && (
              <div style={st.customFontList}>
                {customFonts.map((f) => (
                  <div key={f.name} style={{ ...st.customFontChip, fontFamily: f.family }}>
                    {f.name}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section label="Text size (preview)">
            <input
              type="range" min={10} max={48} value={settings.fontSize}
              onChange={(e) => setSettings({ ...settings, fontSize: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
            <div style={st.muted}>{settings.fontSize}px (export auto-fits)</div>
          </Section>

          <Section label="Text color">
            <ColorRow
              presets={["#1a1a1a", "#ffffff", "#e63946", "#f4a261", "#2a9d8f", "#264653", "#9b5de5", "#f72585"]}
              value={settings.textColor}
              onChange={(v) => setSettings({ ...settings, textColor: v })}
            />
          </Section>

          <Section label="Shirt color (preview only)">
            <div style={st.shirtSwatchGrid}>
              {SHIRT_PRESETS.map((c) => (
                <button
                  key={c.name}
                  title={c.name}
                  onClick={() => setSettings({ ...settings, shirtColor: c.value })}
                  style={{
                    ...st.shirtSwatch,
                    background: c.value,
                    outline: settings.shirtColor === c.value ? "2px solid #2a6df4" : "1px solid #ccc",
                    outlineOffset: settings.shirtColor === c.value ? 1 : 0,
                  }}
                />
              ))}
              <input
                type="color"
                value={settings.shirtColor}
                onChange={(e) => setSettings({ ...settings, shirtColor: e.target.value })}
                style={st.colorInput}
                title="Custom shirt color"
              />
            </div>
            <div style={st.muted}>PNG export has no shirt — print-ready transparent bg.</div>
          </Section>

          <Section label="Horizontal alignment">
            <SegControl
              value={settings.hAlign}
              onChange={(v) => setSettings({ ...settings, hAlign: v })}
              options={[
                { value: "left", label: "⇤ Left" },
                { value: "center", label: "↔ Center" },
                { value: "right", label: "⇥ Right" },
              ]}
            />
          </Section>

          <Section label="Vertical alignment">
            <SegControl
              value={settings.vAlign}
              onChange={(v) => setSettings({ ...settings, vAlign: v })}
              options={[
                { value: "top", label: "⤒ Top" },
                { value: "middle", label: "⇕ Middle" },
                { value: "bottom", label: "⤓ Bottom" },
              ]}
            />
          </Section>

          <div style={st.fineprint}>
            Settings apply to <strong>all</strong> shirts. Per-row overrides are coming — for now, click a row to preview it with the current style.
          </div>
        </div>

        {/* CENTER — list */}
        <div style={st.listPanel}>
          <div style={st.listHeader}>
            <div style={st.listTitle}>Shirts <span style={st.muted}>· {rows.length}</span></div>
            <div style={{ flex: 1 }} />
            <button style={st.btnTiny} onClick={addRow}>+ Add</button>
          </div>
          <div style={st.list}>
            {rows.map((r, i) => (
              <div
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                style={{
                  ...st.listRow,
                  borderColor: r.id === selectedId ? "#2a6df4" : "#e5e5e5",
                  background: r.id === selectedId ? "#f3f7ff" : "#fff",
                }}
              >
                <div style={st.rowIdx}>{String(i + 1).padStart(2, "0")}</div>
                <input
                  value={r.text}
                  onChange={(e) => updateRow(r.id, { text: e.target.value })}
                  placeholder="Slogan / name / text…"
                  style={st.rowInput}
                  onClick={(e) => e.stopPropagation()}
                />
                <button style={st.iconBtn} title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateRow(r.id); }}>⎘</button>
                <button style={st.iconBtn} title="Download PNG" onClick={(e) => { e.stopPropagation(); exportOne(r); }}>⬇</button>
                <button style={st.iconBtn} title="Remove" onClick={(e) => { e.stopPropagation(); removeRow(r.id); }}>✕</button>
              </div>
            ))}
            {rows.length === 0 && (
              <div style={st.empty}>No shirts yet. Click "Paste list" or "+ Add".</div>
            )}
          </div>
        </div>

        {/* RIGHT — preview */}
        <div style={st.previewPanel}>
          <div style={st.previewTitle}>Preview</div>
          {selected ? (
            <>
              <div style={st.previewWrap}>
                <ShirtPreview color={settings.shirtColor}>
                  <DesignContent row={selected} settings={settings} />
                </ShirtPreview>
              </div>
              <div style={st.previewMeta}>
                <div style={{ fontWeight: 600 }}>{selected.text || <span style={st.muted}>(empty)</span>}</div>
                <div style={st.muted}>
                  {settings.fontName} · {settings.hAlign}/{settings.vAlign}
                </div>
              </div>
              <div style={st.previewActions}>
                <button style={st.btnPrimary} onClick={() => exportOne(selected)} disabled={busy}>
                  ⬇ Download this PNG
                </button>
              </div>
              <div style={st.previewNote}>
                <strong>Print-ready:</strong> 3000 × 3600 px transparent PNG (10″ × 12″ @ 300dpi). Just the design — no shirt.
              </div>
            </>
          ) : (
            <div style={st.empty}>Select or add a row.</div>
          )}
        </div>
      </div>

      )}

      {busy && (
        <div style={st.busyOverlay}>
          <div style={st.busyCard}>
            <div className="spin" style={st.spinner} />
            <div>{busyText}</div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        button { font-family: inherit; }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </div>
  );
}

// ---------- Grid view ----------
function GridView({ rows, settings, gridBg, setGridBg, onPick }) {
  const visible = rows.filter((r) => (r.text || "").trim());
  const bgs = {
    checker: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20'><rect width='10' height='10' fill='%23e8e8e8'/><rect x='10' y='10' width='10' height='10' fill='%23e8e8e8'/><rect width='20' height='20' fill='none'/></svg>\") #f5f5f5",
    white: "#ffffff",
    black: "#1a1a1a",
  };
  return (
    <div style={st.gridWrap}>
      <div style={st.gridToolbar}>
        <div style={{ fontSize: 13, color: "#555" }}>
          {visible.length} design{visible.length === 1 ? "" : "s"} · transparent backgrounds
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#888" }}>view bg:</span>
        {[
          ["checker", "Checker"],
          ["white", "White"],
          ["black", "Black"],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setGridBg(k)}
            style={{
              ...st.btnTiny,
              background: gridBg === k ? "#1a1a1a" : "#fff",
              color: gridBg === k ? "#fff" : "#333",
              borderColor: gridBg === k ? "#1a1a1a" : "#ddd",
            }}
          >
            {l}
          </button>
        ))}
      </div>
      <div style={st.gridScroll}>
        <div style={st.grid}>
          {visible.map((r, i) => {
            const fontFamily = r.font || settings.font;
            const textColor = gridBg === "black" && (r.textColor || settings.textColor) === "#1a1a1a" ? "#ffffff" : (r.textColor || settings.textColor);
            const hAlign = r.hAlign || settings.hAlign;
            const vAlign = r.vAlign || settings.vAlign;
            const justify = { left: "flex-start", center: "center", right: "flex-end" }[hAlign];
            const align = { top: "flex-start", middle: "center", bottom: "flex-end" }[vAlign];
            return (
              <div key={r.id} style={st.gridCell} onClick={() => onPick(r.id)} title="Click to edit">
                <div style={{ ...st.gridArt, background: bgs[gridBg] }}>
                  <div style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: align,
                    alignItems: justify,
                    padding: 16,
                    boxSizing: "border-box",
                  }}>
                    <div style={{
                      fontFamily,
                      color: textColor,
                      fontSize: "clamp(13px, 2.4vw, 22px)",
                      lineHeight: 1.05,
                      textAlign: hAlign,
                      textWrap: "balance",
                      fontWeight: 700,
                      width: "100%",
                    }}>{r.text}</div>
                  </div>
                </div>
                <div style={st.gridCellLabel}>
                  <span style={{ fontFamily: "monospace", color: "#888", fontSize: 11 }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontSize: 12, color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.text}
                  </span>
                </div>
              </div>
            );
          })}
          {visible.length === 0 && <div style={st.empty}>No shirts to show.</div>}
        </div>
      </div>
    </div>
  );
}

// ---------- small components ----------
function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={st.sectionLabel}>{label}</div>
      {children}
    </div>
  );
}

function SegControl({ value, onChange, options }) {
  return (
    <div style={st.seg}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            ...st.segBtn,
            background: value === o.value ? "#1a1a1a" : "#fff",
            color: value === o.value ? "#fff" : "#333",
            borderColor: value === o.value ? "#1a1a1a" : "#ddd",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ColorRow({ presets, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {presets.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          style={{
            width: 26, height: 26, borderRadius: 6,
            background: c, cursor: "pointer",
            border: value === c ? "2px solid #2a6df4" : "1px solid #ccc",
          }}
        />
      ))}
      <input
        type="color" value={value}
        onChange={(e) => onChange(e.target.value)}
        style={st.colorInput}
      />
    </div>
  );
}

// ---------- styles ----------
const st = {
  app: {
    minHeight: "100vh",
    background: "#f5f6f8",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    color: "#1a1a1a",
    display: "flex", flexDirection: "column",
  },
  header: {
    display: "flex", alignItems: "center", gap: 10,
    padding: "14px 22px",
    background: "#fff",
    borderBottom: "1px solid #e5e5e5",
  },
  title: { fontSize: 20, fontWeight: 700 },
  subtitle: { fontSize: 12, color: "#666", marginTop: 2 },

  body: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "300px 1fr 320px",
    gap: 14,
    padding: 14,
    minHeight: 0,
  },

  panel: {
    background: "#fff", borderRadius: 10, padding: 18,
    border: "1px solid #e5e5e5",
    overflowY: "auto",
  },

  sectionLabel: {
    fontSize: 11, fontWeight: 700, color: "#555",
    textTransform: "uppercase", letterSpacing: "0.06em",
    marginBottom: 6,
  },

  select: {
    width: "100%", padding: "8px 10px",
    border: "1px solid #ddd", borderRadius: 6,
    background: "#fff", fontSize: 14,
  },
  uploadBtn: {
    display: "inline-block", marginTop: 6,
    padding: "6px 10px",
    border: "1px dashed #999", borderRadius: 6,
    fontSize: 12, color: "#444",
    cursor: "pointer", background: "#fafafa",
  },
  customFontList: { marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" },
  customFontChip: {
    padding: "3px 8px", border: "1px solid #2a6df4",
    borderRadius: 4, fontSize: 12, color: "#2a6df4",
    background: "#f3f7ff",
  },

  shirtSwatchGrid: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  shirtSwatch: {
    width: 28, height: 28, borderRadius: 14, cursor: "pointer", padding: 0,
  },
  colorInput: {
    width: 28, height: 28, padding: 0, border: "1px solid #ccc",
    borderRadius: 6, cursor: "pointer", background: "transparent",
  },

  seg: { display: "flex", gap: 4 },
  segBtn: {
    flex: 1, padding: "7px 6px", fontSize: 12,
    border: "1px solid #ddd", borderRadius: 6,
    cursor: "pointer",
  },

  fineprint: {
    fontSize: 11, color: "#888", lineHeight: 1.4,
    paddingTop: 12, borderTop: "1px solid #eee",
  },

  // list
  listPanel: {
    background: "#fff", borderRadius: 10,
    border: "1px solid #e5e5e5",
    display: "flex", flexDirection: "column", minHeight: 0,
  },
  listHeader: {
    padding: "12px 16px", borderBottom: "1px solid #eee",
    display: "flex", alignItems: "center", gap: 10,
  },
  listTitle: { fontSize: 14, fontWeight: 700 },
  list: { flex: 1, overflowY: "auto", padding: 10 },
  listRow: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "8px 10px", marginBottom: 6,
    border: "1px solid #e5e5e5", borderRadius: 8,
    cursor: "pointer",
  },
  rowIdx: {
    fontSize: 11, fontFamily: "monospace", color: "#888",
    minWidth: 22, textAlign: "right",
  },
  rowInput: {
    flex: 1, padding: "6px 8px",
    border: "1px solid #e5e5e5", borderRadius: 6,
    fontSize: 14, background: "#fff",
  },
  iconBtn: {
    width: 28, height: 28, borderRadius: 6,
    border: "1px solid #e5e5e5", background: "#fff",
    cursor: "pointer", color: "#555", fontSize: 13,
  },

  empty: {
    padding: 30, textAlign: "center", color: "#888", fontSize: 13,
  },

  // preview
  previewPanel: {
    background: "#fff", borderRadius: 10, padding: 18,
    border: "1px solid #e5e5e5",
    display: "flex", flexDirection: "column", gap: 12,
  },
  previewTitle: { fontSize: 14, fontWeight: 700 },
  previewWrap: {
    background: "#f5f6f8", borderRadius: 8,
    padding: 14, display: "flex", justifyContent: "center",
  },
  previewMeta: { fontSize: 13, lineHeight: 1.4 },
  muted: { color: "#888", fontSize: 12 },
  previewActions: { display: "flex", gap: 6 },
  previewNote: {
    fontSize: 11, color: "#666", lineHeight: 1.5,
    padding: 10, background: "#f5f6f8", borderRadius: 6,
  },

  // buttons
  btnPrimary: {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    background: "#1a1a1a", color: "#fff",
    border: "none", borderRadius: 6, cursor: "pointer",
  },
  btnGhost: {
    padding: "7px 12px", fontSize: 13,
    background: "#fff", color: "#333",
    border: "1px solid #ddd", borderRadius: 6, cursor: "pointer",
  },
  btnTiny: {
    padding: "5px 10px", fontSize: 12,
    background: "#fff", color: "#333",
    border: "1px solid #ddd", borderRadius: 6, cursor: "pointer",
  },

  busyOverlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 999,
  },

  // view toggle
  viewToggle: {
    display: "flex", gap: 0, marginRight: 6,
    border: "1px solid #ddd", borderRadius: 6, overflow: "hidden",
  },
  viewToggleBtn: {
    padding: "7px 14px", fontSize: 13, fontWeight: 500,
    border: "none", cursor: "pointer", background: "#fff",
  },

  // grid view
  gridWrap: {
    flex: 1, display: "flex", flexDirection: "column",
    background: "#fafafa", minHeight: 0,
  },
  gridToolbar: {
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 22px",
    background: "#fff", borderBottom: "1px solid #e5e5e5",
  },
  gridScroll: { flex: 1, overflowY: "auto", padding: 20 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 16,
  },
  gridCell: {
    display: "flex", flexDirection: "column", gap: 6,
    cursor: "pointer",
  },
  gridArt: {
    aspectRatio: "5 / 6",
    borderRadius: 8,
    border: "1px solid #e5e5e5",
    overflow: "hidden",
    transition: "transform 120ms",
  },
  gridCellLabel: {
    display: "flex", gap: 8, alignItems: "center",
    padding: "0 4px",
  },
  busyCard: {
    background: "#fff", padding: 24, borderRadius: 10,
    display: "flex", alignItems: "center", gap: 14,
    fontSize: 14, fontWeight: 500,
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  spinner: {
    width: 22, height: 22, borderRadius: "50%",
    border: "3px solid #eee", borderTopColor: "#1a1a1a",
  },
};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
