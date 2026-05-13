// Bulk T-Shirt Generator — Wireframes
// 4 sketchy low-fi directions, b&w + one accent color

const { useState, useEffect, useRef } = React;

// ---------- shared sketchy primitives ----------

const ink = "#1a1a1a";
const paper = "#fafaf6";
const accent = "var(--accent, #ff5a36)";
const muted = "#8a8680";
const grid = "#e8e4dc";

const sketchFont = `'Caveat', 'Comic Sans MS', cursive`;
const handFont = `'Architects Daughter', 'Caveat', cursive`;
const labelFont = `'Kalam', 'Caveat', cursive`;

// rough rectangle (slight wobble via SVG filter)
function Rough({ children, style = {}, as = "div", ...rest }) {
  const Tag = as;
  return (
    <Tag
      style={{
        border: `1.5px solid ${ink}`,
        borderRadius: 6,
        background: paper,
        filter: "url(#rough)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function DashedBox({ children, style = {}, ...rest }) {
  return (
    <div
      style={{
        border: `1.5px dashed ${ink}`,
        borderRadius: 6,
        background: "transparent",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

function HandLabel({ children, size = 16, style = {}, color = ink, weight = 400 }) {
  return (
    <span style={{ fontFamily: labelFont, fontSize: size, color, fontWeight: weight, lineHeight: 1.1, ...style }}>
      {children}
    </span>
  );
}

function Squiggle({ width = 80, color = ink, strokeWidth = 1.5 }) {
  return (
    <svg width={width} height={8} viewBox={`0 0 ${width} 8`} style={{ display: "block" }}>
      <path
        d={`M0 4 Q ${width / 8} 0, ${width / 4} 4 T ${width / 2} 4 T ${(width * 3) / 4} 4 T ${width} 4`}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ScribbleArrow({ direction = "right", length = 40, color = ink }) {
  const rotations = { right: 0, down: 90, left: 180, up: 270 };
  return (
    <svg
      width={length}
      height={20}
      viewBox={`0 0 ${length} 20`}
      style={{ transform: `rotate(${rotations[direction]}deg)` }}
    >
      <path
        d={`M2 10 Q ${length / 3} 6, ${length - 6} 10`}
        stroke={color}
        strokeWidth={1.5}
        fill="none"
        strokeLinecap="round"
      />
      <path d={`M${length - 10} 5 L ${length - 4} 10 L ${length - 10} 15`} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Sketchy t-shirt SVG (front, back, sleeve, model)
function ShirtSvg({ view = "front", color = "#fff", design, designStyle = {}, w = 220, h = 240, accentStroke = false }) {
  const stroke = accentStroke ? accent : ink;
  const sw = 1.6;
  // wobbly path for hand-drawn feel
  const front = "M40 30 Q 60 18, 90 22 L 110 38 Q 130 44, 150 38 L 170 22 Q 200 18, 220 30 L 245 60 Q 250 70, 245 80 L 220 92 L 215 75 L 215 215 Q 215 225, 205 226 L 55 226 Q 45 225, 45 215 L 45 75 L 40 92 L 15 80 Q 10 70, 15 60 Z";
  const back = "M40 30 Q 60 18, 90 22 L 105 36 Q 130 30, 155 36 L 170 22 Q 200 18, 220 30 L 245 60 Q 250 70, 245 80 L 220 92 L 215 75 L 215 215 Q 215 225, 205 226 L 55 226 Q 45 225, 45 215 L 45 75 L 40 92 L 15 80 Q 10 70, 15 60 Z";
  const sleeve = "M30 40 Q 70 25, 130 30 L 160 60 Q 165 80, 155 100 L 60 110 Q 30 100, 25 80 Z";

  if (view === "model") {
    return (
      <svg width={w} height={h} viewBox="0 0 260 280" style={{ filter: "url(#rough)" }}>
        {/* head */}
        <circle cx="130" cy="32" r="20" fill="#f0e6d6" stroke={ink} strokeWidth={sw} />
        <path d="M115 24 Q 120 14, 130 14 Q 142 14, 145 26" stroke={ink} strokeWidth={sw} fill="none" />
        {/* neck */}
        <path d="M120 50 L 122 64 L 138 64 L 140 50" stroke={ink} strokeWidth={sw} fill="#f0e6d6" />
        {/* shirt */}
        <path d={front.replace("M40 30", "M40 60").replaceAll("226", "256").replaceAll("215", "245")} fill={color} stroke={ink} strokeWidth={sw} />
        {/* design slot */}
        <foreignObject x="80" y="100" width="100" height="100">
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", ...designStyle }}>
            {design}
          </div>
        </foreignObject>
      </svg>
    );
  }

  const path = view === "back" ? back : view === "sleeve" ? sleeve : front;

  return (
    <svg width={w} height={h} viewBox="0 0 260 250" style={{ filter: "url(#rough)" }}>
      <path d={path} fill={color} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      {view === "front" && <path d="M105 38 Q 130 56, 155 38" stroke={stroke} strokeWidth={sw} fill="none" />}
      {view === "back" && <line x1="100" y1="38" x2="160" y2="38" stroke={stroke} strokeWidth={sw} />}
      {view === "sleeve" && <text x="80" y="85" fontFamily={labelFont} fontSize={14} fill={muted}>sleeve</text>}
      {/* design area */}
      {view !== "sleeve" && (
        <foreignObject x="75" y="65" width="110" height="120">
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", ...designStyle }}>
            {design}
          </div>
        </foreignObject>
      )}
    </svg>
  );
}

// shared SVG defs (rough filter)
function SvgDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <filter id="rough" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" />
        </filter>
        <pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill={muted} />
        </pattern>
      </defs>
    </svg>
  );
}

// ============================================================
// WF1 — STUDIO (single editor + batch queue rail)
// ============================================================
function WF1Studio() {
  return (
    <div style={{ padding: 20, fontFamily: labelFont, color: ink, background: paper, minHeight: "100%" }}>
      <Header title="Direction 1 · Studio" subtitle="Familiar editor — left tools, big canvas, right properties. Batch queue rail at the bottom for many shirts at once." />

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 240px", gap: 12, height: 560 }}>
        {/* LEFT — tools + design elements */}
        <Rough style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <HandLabel size={18} weight={700}>Add to shirt</HandLabel>
          <Squiggle width={80} />
          {[
            ["T", "Text block"],
            ["▢", "Image / logo"],
            ["★", "Shape / icon"],
            ["#", "Auto number"],
            ["▦", "QR code"],
          ].map(([g, l]) => (
            <DashedBox key={l} style={{ padding: "8px 10px", display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: sketchFont, fontSize: 22 }}>{g}</span>
              <HandLabel>{l}</HandLabel>
            </DashedBox>
          ))}
          <div style={{ marginTop: "auto" }}>
            <HandLabel size={14} color={muted}>upload</HandLabel>
            <DashedBox style={{ padding: 10, marginTop: 4, textAlign: "center" }}>
              <HandLabel size={13}>+ drop image / .ttf</HandLabel>
            </DashedBox>
          </div>
        </Rough>

        {/* CENTER — canvas */}
        <Rough style={{ padding: 16, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["Front", "Back", "L sleeve", "R sleeve", "Model"].map((v, i) => (
                <span
                  key={v}
                  style={{
                    fontFamily: labelFont,
                    fontSize: 13,
                    padding: "3px 10px",
                    border: `1.5px solid ${ink}`,
                    borderRadius: 12,
                    background: i === 0 ? accent : "transparent",
                    color: i === 0 ? "#fff" : ink,
                  }}
                >
                  {v}
                </span>
              ))}
            </div>
            <HandLabel size={13} color={muted}>Shirt #03 of 24</HandLabel>
          </div>

          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: `url(#dots)`, position: "relative" }}>
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              <rect width="100%" height="100%" fill="url(#dots)" opacity="0.4" />
            </svg>
            <div style={{ position: "relative" }}>
              <ShirtSvg
                view="front"
                color="#fff"
                w={280}
                h={300}
                design={
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: sketchFont, fontSize: 28, fontWeight: 700, color: ink, lineHeight: 1 }}>SARAH</div>
                    <div style={{ fontFamily: labelFont, fontSize: 13, color: muted, marginTop: 4 }}>est. 2026</div>
                  </div>
                }
              />
              {/* selection handles */}
              <DashedBox style={{ position: "absolute", left: 86, top: 102, width: 110, height: 70, pointerEvents: "none" }}>
                <div style={{ position: "absolute", top: -16, left: 0, fontFamily: labelFont, fontSize: 11, color: accent }}>text · selected</div>
                {["tl", "tr", "bl", "br"].map((p) => (
                  <div
                    key={p}
                    style={{
                      position: "absolute",
                      width: 8,
                      height: 8,
                      background: paper,
                      border: `1.5px solid ${accent}`,
                      ...(p === "tl" && { top: -4, left: -4 }),
                      ...(p === "tr" && { top: -4, right: -4 }),
                      ...(p === "bl" && { bottom: -4, left: -4 }),
                      ...(p === "br" && { bottom: -4, right: -4 }),
                    }}
                  />
                ))}
              </DashedBox>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
            <HandLabel size={12} color={muted}>print area · 12" × 16"</HandLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <HandLabel size={13}>↶ undo</HandLabel>
              <HandLabel size={13}>↷ redo</HandLabel>
              <HandLabel size={13}>⌕ 100%</HandLabel>
            </div>
          </div>
        </Rough>

        {/* RIGHT — properties */}
        <Rough style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, overflow: "hidden" }}>
          <HandLabel size={18} weight={700}>Text properties</HandLabel>
          <Squiggle width={80} />

          <div>
            <HandLabel size={12} color={muted}>FONT</HandLabel>
            <DashedBox style={{ padding: "6px 10px", marginTop: 3, display: "flex", justifyContent: "space-between" }}>
              <HandLabel>Caveat ▾</HandLabel><HandLabel color={muted}>↑ upload</HandLabel>
            </DashedBox>
          </div>

          <div>
            <HandLabel size={12} color={muted}>SIZE / WEIGHT</HandLabel>
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              <DashedBox style={{ flex: 1, padding: "4px 8px", textAlign: "center" }}><HandLabel>32</HandLabel></DashedBox>
              <DashedBox style={{ flex: 1, padding: "4px 8px", textAlign: "center" }}><HandLabel>Bold</HandLabel></DashedBox>
            </div>
          </div>

          <div>
            <HandLabel size={12} color={muted}>FILL</HandLabel>
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              {["#1a1a1a", "#fff", accent, "#2b6", "#26a"].map((c, i) => (
                <div key={i} style={{ width: 22, height: 22, background: c, border: `1.5px solid ${ink}`, borderRadius: 4 }} />
              ))}
              <DashedBox style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <HandLabel size={11}>+</HandLabel>
              </DashedBox>
            </div>
          </div>

          <div>
            <HandLabel size={12} color={muted}>HORIZONTAL</HandLabel>
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              {["⇤", "↔", "⇥"].map((g, i) => (
                <DashedBox key={i} style={{ flex: 1, padding: "4px 8px", textAlign: "center", background: i === 1 ? accent : "transparent", color: i === 1 ? "#fff" : ink }}>
                  <HandLabel>{g}</HandLabel>
                </DashedBox>
              ))}
            </div>
          </div>

          <div>
            <HandLabel size={12} color={muted}>VERTICAL</HandLabel>
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              {["⤒", "⇕", "⤓"].map((g, i) => (
                <DashedBox key={i} style={{ flex: 1, padding: "4px 8px", textAlign: "center" }}>
                  <HandLabel>{g}</HandLabel>
                </DashedBox>
              ))}
            </div>
          </div>

          <div>
            <HandLabel size={12} color={muted}>SHIRT COLOR</HandLabel>
            <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
              {["#fff", "#1a1a1a", "#9c9", "#ccd", "#d9b", "#dc6"].map((c, i) => (
                <div key={i} style={{ width: 22, height: 22, background: c, border: `1.5px solid ${ink}`, borderRadius: 11 }} />
              ))}
            </div>
          </div>
        </Rough>
      </div>

      {/* BATCH QUEUE RAIL */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
          <HandLabel size={18} weight={700}>Batch queue</HandLabel>
          <HandLabel size={13} color={muted}>24 shirts · drag to reorder · click to edit</HandLabel>
          <div style={{ flex: 1 }} />
          <DashedBox style={{ padding: "4px 10px" }}><HandLabel size={13}>+ paste CSV of names</HandLabel></DashedBox>
          <Rough style={{ padding: "6px 14px", background: accent, borderColor: ink }}>
            <HandLabel size={14} color="#fff" weight={700}>↓ Download all PNGs (zip)</HandLabel>
          </Rough>
        </div>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "8px 4px", borderTop: `1.5px solid ${ink}`, borderBottom: `1.5px solid ${ink}` }}>
          {["SARAH", "JAMES", "MARIA", "OMAR", "PRIYA", "LIAM", "AVA", "NOAH", "ZOE", "EZRA", "MIA", "+12"].map((n, i) => (
            <DashedBox key={i} style={{ minWidth: 80, padding: 6, textAlign: "center", background: i === 2 ? "#fff5f0" : "transparent", borderColor: i === 2 ? accent : ink, borderStyle: i === 2 ? "solid" : "dashed" }}>
              <ShirtSvg view="front" color="#fff" w={64} h={70} design={<div style={{ fontFamily: sketchFont, fontSize: 9, fontWeight: 700 }}>{n.startsWith("+") ? "" : n}</div>} />
              <HandLabel size={11}>{i + 1}. {n}</HandLabel>
            </DashedBox>
          ))}
        </div>
      </div>

      <Annotations
        notes={[
          { x: "5%", y: "8%", text: "elements you can add — text, image, shapes, numbers, QR" },
          { x: "62%", y: "20%", text: "all 4 views as tabs ↑" },
          { x: "78%", y: "62%", text: "vertical + horizontal alignment", arrow: "left" },
          { x: "10%", y: "92%", text: "queue → CSV import or manual list", arrow: "down" },
        ]}
      />
    </div>
  );
}

// ============================================================
// WF2 — SPREADSHEET (data-first, row-per-shirt)
// ============================================================
function WF2Spreadsheet() {
  const rows = [
    ["01", "SARAH", "Caveat", "Black", "White", "C", "M", "★"],
    ["02", "JAMES", "Caveat", "Black", "White", "C", "M", ""],
    ["03", "MARIA", "Bebas", "Red", "Heather", "L", "T", "★"],
    ["04", "OMAR", "Bebas", "Red", "Heather", "L", "T", ""],
    ["05", "PRIYA", "Mono", "White", "Black", "C", "B", "✎"],
    ["06", "LIAM #007", "Mono", "White", "Black", "C", "B", ""],
    ["07", "AVA", "Caveat", "Navy", "White", "R", "M", ""],
    ["08", "NOAH", "Caveat", "Navy", "White", "R", "M", ""],
  ];
  return (
    <div style={{ padding: 20, fontFamily: labelFont, color: ink, background: paper, minHeight: "100%" }}>
      <Header title="Direction 2 · Spreadsheet" subtitle="Each row = one shirt. Live preview floats on the right. Best for name lists, rosters, numbered series." />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, height: 560 }}>
        {/* LEFT — table */}
        <Rough style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 14px", borderBottom: `1.5px solid ${ink}`, display: "flex", gap: 10, alignItems: "center" }}>
            <HandLabel size={16} weight={700}>roster.csv</HandLabel>
            <HandLabel size={12} color={muted}>· 8 of 240 rows</HandLabel>
            <div style={{ flex: 1 }} />
            <DashedBox style={{ padding: "3px 8px" }}><HandLabel size={12}>+ row</HandLabel></DashedBox>
            <DashedBox style={{ padding: "3px 8px" }}><HandLabel size={12}>↑ import CSV</HandLabel></DashedBox>
            <DashedBox style={{ padding: "3px 8px" }}><HandLabel size={12}>#auto-number</HandLabel></DashedBox>
          </div>

          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: labelFont, fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f0ece4", borderBottom: `1.5px solid ${ink}` }}>
                  {["#", "Text", "Font ▾", "Color ▾", "Shirt ▾", "H-Align", "V-Align", "Img"].map((h) => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, borderRight: `1px dashed ${muted}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: `1px dashed ${muted}`, background: i === 4 ? "#fff5f0" : "transparent" }}>
                    {r.map((c, j) => (
                      <td
                        key={j}
                        style={{
                          padding: "8px 10px",
                          borderRight: `1px dashed ${muted}`,
                          fontFamily: j === 1 ? sketchFont : labelFont,
                          fontWeight: j === 1 ? 700 : 400,
                          color: c === "★" ? accent : ink,
                        }}
                      >
                        {c || <span style={{ color: muted }}>·</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ padding: "10px 14px", borderTop: `1.5px solid ${ink}`, display: "flex", gap: 10, alignItems: "center" }}>
            <HandLabel size={12} color={muted}>Bulk apply →</HandLabel>
            <DashedBox style={{ padding: "3px 8px" }}><HandLabel size={12}>set font</HandLabel></DashedBox>
            <DashedBox style={{ padding: "3px 8px" }}><HandLabel size={12}>set color</HandLabel></DashedBox>
            <DashedBox style={{ padding: "3px 8px" }}><HandLabel size={12}>set alignment</HandLabel></DashedBox>
            <div style={{ flex: 1 }} />
            <Rough style={{ padding: "5px 12px", background: accent }}>
              <HandLabel size={13} color="#fff" weight={700}>↓ Export 240 PNGs</HandLabel>
            </Rough>
          </div>
        </Rough>

        {/* RIGHT — live preview pinned to selected row */}
        <Rough style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <HandLabel size={14} weight={700}>preview · row 05 (PRIYA)</HandLabel>
          <Squiggle width={60} />
          <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
            <ShirtSvg
              view="front"
              color="#1a1a1a"
              w={200}
              h={220}
              accentStroke={false}
              design={
                <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: "#fff", textAlign: "center" }}>
                  PRIYA<div style={{ fontSize: 10, color: muted, marginTop: 2 }}>—</div>
                </div>
              }
            />
          </div>
          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            {["F", "B", "L", "R", "M"].map((v, i) => (
              <DashedBox key={v} style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", background: i === 0 ? accent : "transparent" }}>
                <HandLabel size={11} color={i === 0 ? "#fff" : ink}>{v}</HandLabel>
              </DashedBox>
            ))}
          </div>
          <div style={{ borderTop: `1px dashed ${muted}`, paddingTop: 8 }}>
            <HandLabel size={12} color={muted}>FONT LIBRARY</HandLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
              {[["Caveat", "Aa Bb 123"], ["Bebas Neue", "AA BB 123"], ["JetBrains Mono", "Aa Bb 123"], ["+ MyFont.ttf", "uploaded ✓"]].map(([n, s], i) => (
                <DashedBox key={i} style={{ padding: "4px 8px", display: "flex", justifyContent: "space-between", borderColor: i === 3 ? accent : ink }}>
                  <HandLabel size={12}>{n}</HandLabel>
                  <HandLabel size={12} color={muted} style={{ fontFamily: i === 0 ? sketchFont : i === 1 ? "Impact" : i === 2 ? "monospace" : labelFont }}>{s}</HandLabel>
                </DashedBox>
              ))}
            </div>
            <DashedBox style={{ padding: "6px 8px", marginTop: 4, textAlign: "center", borderColor: muted }}>
              <HandLabel size={12} color={muted}>+ drop .ttf / .otf to add</HandLabel>
            </DashedBox>
          </div>
        </Rough>
      </div>

      <Annotations
        notes={[
          { x: "8%", y: "10%", text: "edit any cell inline · sort · filter · multi-select" },
          { x: "68%", y: "8%", text: "preview follows your cursor →", arrow: "left" },
          { x: "20%", y: "92%", text: "select rows + bulk-apply font / color / alignment", arrow: "up" },
        ]}
      />
    </div>
  );
}

// ============================================================
// WF3 — VARIANT MATRIX (one design × N colors × M fonts)
// ============================================================
function WF3Matrix() {
  const fonts = ["Caveat", "Bebas", "Mono", "Serif"];
  const colors = ["#fff", "#1a1a1a", "#a93", "#369", "#9c6"];
  return (
    <div style={{ padding: 20, fontFamily: labelFont, color: ink, background: paper, minHeight: "100%" }}>
      <Header title="Direction 3 · Variant Matrix" subtitle="One design, render every combination of color × font × size in a single grid. Tick the ones you want, export." />

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, height: 620 }}>
        {/* LEFT — base design + axes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Rough style={{ padding: 12 }}>
            <HandLabel size={14} weight={700}>BASE DESIGN</HandLabel>
            <Squiggle width={60} />
            <DashedBox style={{ marginTop: 8, padding: 12, minHeight: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontFamily: sketchFont, fontSize: 28, fontWeight: 700 }}>HELLO</div>
            </DashedBox>
            <div style={{ marginTop: 8, display: "flex", gap: 4 }}>
              <DashedBox style={{ flex: 1, padding: "3px 8px", textAlign: "center" }}><HandLabel size={11}>+text</HandLabel></DashedBox>
              <DashedBox style={{ flex: 1, padding: "3px 8px", textAlign: "center" }}><HandLabel size={11}>+img</HandLabel></DashedBox>
            </div>
          </Rough>

          <Rough style={{ padding: 12 }}>
            <HandLabel size={14} weight={700}>X axis · FONT</HandLabel>
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
              {fonts.map((f, i) => (
                <DashedBox key={f} style={{ padding: "4px 8px", display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ width: 12, height: 12, border: `1.5px solid ${ink}`, background: i < 4 ? accent : "transparent", display: "inline-block" }} />
                  <HandLabel size={12}>{f}</HandLabel>
                </DashedBox>
              ))}
              <DashedBox style={{ padding: "4px 8px", borderColor: muted }}>
                <HandLabel size={12} color={muted}>+ upload .ttf</HandLabel>
              </DashedBox>
            </div>
          </Rough>

          <Rough style={{ padding: 12 }}>
            <HandLabel size={14} weight={700}>Y axis · SHIRT COLOR</HandLabel>
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {colors.map((c, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <div style={{ width: 28, height: 28, background: c, border: `1.5px solid ${ink}`, borderRadius: 14 }} />
                  <span style={{ position: "absolute", top: -4, right: -4, width: 14, height: 14, background: accent, color: "#fff", fontSize: 10, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: labelFont }}>✓</span>
                </div>
              ))}
            </div>
          </Rough>

          <Rough style={{ padding: 12 }}>
            <HandLabel size={14} weight={700}>alignment</HandLabel>
            <div style={{ marginTop: 6 }}>
              <HandLabel size={11} color={muted}>HORIZONTAL</HandLabel>
              <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                {["⇤", "↔", "⇥"].map((g, i) => (
                  <DashedBox key={i} style={{ flex: 1, padding: "3px", textAlign: "center", background: i === 1 ? accent : "transparent", color: i === 1 ? "#fff" : ink }}>
                    <HandLabel size={12}>{g}</HandLabel>
                  </DashedBox>
                ))}
              </div>
              <HandLabel size={11} color={muted} style={{ marginTop: 6, display: "block" }}>VERTICAL</HandLabel>
              <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
                {["⤒", "⇕", "⤓"].map((g, i) => (
                  <DashedBox key={i} style={{ flex: 1, padding: "3px", textAlign: "center" }}>
                    <HandLabel size={12}>{g}</HandLabel>
                  </DashedBox>
                ))}
              </div>
            </div>
          </Rough>
        </div>

        {/* RIGHT — matrix */}
        <Rough style={{ padding: 12, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <HandLabel size={16} weight={700}>20 variants · 17 selected</HandLabel>
            <div style={{ display: "flex", gap: 6 }}>
              <DashedBox style={{ padding: "3px 8px" }}><HandLabel size={12}>front</HandLabel></DashedBox>
              <DashedBox style={{ padding: "3px 8px" }}><HandLabel size={12}>+back</HandLabel></DashedBox>
              <Rough style={{ padding: "3px 12px", background: accent }}>
                <HandLabel size={12} color="#fff" weight={700}>↓ 17 PNGs</HandLabel>
              </Rough>
            </div>
          </div>

          <div style={{ flex: 1, display: "grid", gridTemplateColumns: `40px repeat(${fonts.length}, 1fr)`, gridTemplateRows: `28px repeat(${colors.length}, 1fr)`, gap: 4 }}>
            <div />
            {fonts.map((f) => (
              <div key={f} style={{ textAlign: "center", borderBottom: `1.5px solid ${ink}`, paddingBottom: 4 }}>
                <HandLabel size={12} weight={700}>{f}</HandLabel>
              </div>
            ))}
            {colors.map((c, ri) => (
              <React.Fragment key={ri}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 18, height: 18, background: c, border: `1.5px solid ${ink}`, borderRadius: 9 }} />
                </div>
                {fonts.map((f, ci) => {
                  const skip = (ri === 1 && ci === 3) || (ri === 4 && ci === 2) || (ri === 3 && ci === 0);
                  const ff = f === "Caveat" ? sketchFont : f === "Bebas" ? "Impact, sans-serif" : f === "Mono" ? "monospace" : "Georgia, serif";
                  return (
                    <DashedBox
                      key={ci}
                      style={{
                        padding: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: skip ? "#f0ece4" : "transparent",
                        borderColor: skip ? muted : ink,
                        position: "relative",
                      }}
                    >
                      {skip ? (
                        <HandLabel size={10} color={muted}>skip</HandLabel>
                      ) : (
                        <>
                          <ShirtSvg
                            view="front"
                            color={c}
                            w={88}
                            h={96}
                            design={
                              <div style={{ fontFamily: ff, fontSize: 14, fontWeight: 700, color: c === "#fff" || c === "#9c6" ? ink : "#fff" }}>HELLO</div>
                            }
                          />
                          <span style={{ position: "absolute", top: 3, right: 3, width: 14, height: 14, background: accent, color: "#fff", fontSize: 10, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: labelFont }}>✓</span>
                        </>
                      )}
                    </DashedBox>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </Rough>
      </div>

      <Annotations
        notes={[
          { x: "5%", y: "16%", text: "lock the design once, vary axes" },
          { x: "70%", y: "10%", text: "click any cell to toggle / customize", arrow: "left" },
          { x: "8%", y: "78%", text: "alignment applies to every variant", arrow: "right" },
        ]}
      />
    </div>
  );
}

// ============================================================
// WF4 — MODE SWITCHER (unified, segmented control up top)
// ============================================================
function WF4ModeSwitcher() {
  const [mode, setMode] = useState("List");
  const modes = ["Single", "List", "Variants", "Series"];

  return (
    <div style={{ padding: 20, fontFamily: labelFont, color: ink, background: paper, minHeight: "100%" }}>
      <Header title="Direction 4 · Mode switcher" subtitle="One unified workspace. A big segmented control switches the canvas between Single / List / Variants / Series — all four 'bulk modes' under one roof." />

      {/* segmented control */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
        <Rough style={{ padding: 4, display: "flex", gap: 4 }}>
          {modes.map((m) => (
            <div
              key={m}
              onClick={() => setMode(m)}
              style={{
                padding: "8px 22px",
                background: mode === m ? accent : "transparent",
                color: mode === m ? "#fff" : ink,
                borderRadius: 4,
                cursor: "pointer",
                fontFamily: labelFont,
                fontSize: 15,
                fontWeight: 700,
                position: "relative",
              }}
            >
              {m}
              {mode === m && (
                <div style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontSize: 11, color: muted, fontWeight: 400, whiteSpace: "nowrap" }}>
                  {m === "Single" ? "one design" : m === "List" ? "csv → many" : m === "Variants" ? "design × axes" : "auto-numbered"}
                </div>
              )}
            </div>
          ))}
        </Rough>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, height: 540 }}>
        {/* shared LEFT panel */}
        <Rough style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <HandLabel size={16} weight={700}>Design</HandLabel>
          <Squiggle width={60} />

          <DashedBox style={{ padding: 8 }}>
            <HandLabel size={11} color={muted}>TEXT</HandLabel>
            <div style={{ fontFamily: sketchFont, fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              {mode === "Series" ? "TEAM #{n}" : mode === "List" ? "{name}" : "HELLO"}
            </div>
          </DashedBox>

          <div>
            <HandLabel size={11} color={muted}>FONT</HandLabel>
            <DashedBox style={{ padding: "5px 8px", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
              <HandLabel size={13}>Caveat ▾</HandLabel><HandLabel size={11} color={accent}>↑</HandLabel>
            </DashedBox>
            <HandLabel size={10} color={muted} style={{ marginTop: 3, display: "block" }}>+ MyBrand.otf · uploaded</HandLabel>
          </div>

          <div>
            <HandLabel size={11} color={muted}>TEXT COLOR</HandLabel>
            <div style={{ display: "flex", gap: 3, marginTop: 3 }}>
              {["#1a1a1a", "#fff", accent, "#36a", "#3a6"].map((c, i) => (
                <div key={i} style={{ width: 20, height: 20, background: c, border: `1.5px solid ${ink}`, borderRadius: 4, outline: i === 0 ? `2px solid ${accent}` : "none", outlineOffset: 1 }} />
              ))}
            </div>
          </div>

          <div>
            <HandLabel size={11} color={muted}>SHIRT COLOR</HandLabel>
            <div style={{ display: "flex", gap: 3, marginTop: 3, flexWrap: "wrap" }}>
              {["#fff", "#1a1a1a", "#9b8", "#dcb", "#eed", "#a86"].map((c, i) => (
                <div key={i} style={{ width: 20, height: 20, background: c, border: `1.5px solid ${ink}`, borderRadius: 10 }} />
              ))}
            </div>
          </div>

          <div>
            <HandLabel size={11} color={muted}>ALIGN · H</HandLabel>
            <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
              {["⇤", "↔", "⇥"].map((g, i) => (
                <DashedBox key={i} style={{ flex: 1, padding: "3px", textAlign: "center", background: i === 1 ? accent : "transparent", color: i === 1 ? "#fff" : ink }}>
                  <HandLabel size={12}>{g}</HandLabel>
                </DashedBox>
              ))}
            </div>
          </div>
          <div>
            <HandLabel size={11} color={muted}>ALIGN · V</HandLabel>
            <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
              {["⤒", "⇕", "⤓"].map((g, i) => (
                <DashedBox key={i} style={{ flex: 1, padding: "3px", textAlign: "center" }}>
                  <HandLabel size={12}>{g}</HandLabel>
                </DashedBox>
              ))}
            </div>
          </div>

          <div style={{ marginTop: "auto" }}>
            <Rough style={{ padding: "8px 12px", background: accent, textAlign: "center" }}>
              <HandLabel size={13} color="#fff" weight={700}>↓ Export PNG{mode !== "Single" ? " (zip)" : ""}</HandLabel>
            </Rough>
            <HandLabel size={10} color={muted} style={{ marginTop: 4, display: "block", textAlign: "center" }}>print-ready · transparent bg</HandLabel>
          </div>
        </Rough>

        {/* RIGHT — adapts to mode */}
        <Rough style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>
          {mode === "Single" && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              {["front", "back", "sleeve", "model"].map((v) => (
                <div key={v} style={{ textAlign: "center" }}>
                  <ShirtSvg
                    view={v}
                    color="#fff"
                    w={140}
                    h={150}
                    design={<div style={{ fontFamily: sketchFont, fontSize: 18, fontWeight: 700 }}>HELLO</div>}
                  />
                  <HandLabel size={11} color={muted}>{v}</HandLabel>
                </div>
              ))}
            </div>
          )}

          {mode === "List" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                <DashedBox style={{ flex: 1, padding: 8 }}>
                  <HandLabel size={11} color={muted}>NAMES (one per line · or paste CSV)</HandLabel>
                  <pre style={{ fontFamily: "monospace", fontSize: 12, marginTop: 4, color: ink, lineHeight: 1.4 }}>
{`Sarah
James
Maria
Omar
Priya
…12 more`}
                  </pre>
                </DashedBox>
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6 }}>
                  <ScribbleArrow length={40} />
                  <HandLabel size={11} color={muted}>renders →</HandLabel>
                </div>
                <div style={{ flex: 2, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, alignContent: "start" }}>
                  {["Sarah", "James", "Maria", "Omar", "Priya", "Liam", "Ava", "+10"].map((n, i) => (
                    <DashedBox key={i} style={{ padding: 4, textAlign: "center" }}>
                      <ShirtSvg view="front" color="#fff" w={56} h={62} design={<div style={{ fontFamily: sketchFont, fontSize: 8, fontWeight: 700 }}>{n.startsWith("+") ? "" : n}</div>} />
                      <HandLabel size={10}>{n}</HandLabel>
                    </DashedBox>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: `1px dashed ${muted}`, paddingTop: 8 }}>
                <HandLabel size={11} color={muted}>preview a row →</HandLabel>
                <div style={{ display: "flex", gap: 10, marginTop: 6, justifyContent: "center" }}>
                  {["front", "back", "sleeve", "model"].map((v) => (
                    <ShirtSvg key={v} view={v} color="#fff" w={80} h={88} design={<div style={{ fontFamily: sketchFont, fontSize: 11, fontWeight: 700 }}>SARAH</div>} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === "Variants" && (
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 12 }}>
                <HandLabel size={12} color={muted}>axes:</HandLabel>
                <DashedBox style={{ padding: "2px 8px" }}><HandLabel size={11}>color × 5</HandLabel></DashedBox>
                <DashedBox style={{ padding: "2px 8px" }}><HandLabel size={11}>font × 3</HandLabel></DashedBox>
                <DashedBox style={{ padding: "2px 8px", borderColor: muted }}><HandLabel size={11} color={muted}>+ axis</HandLabel></DashedBox>
                <div style={{ flex: 1 }} />
                <HandLabel size={11} color={muted}>= 15 variants</HandLabel>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
                {Array.from({ length: 15 }).map((_, i) => {
                  const colors = ["#fff", "#1a1a1a", "#a93", "#369", "#9c6"];
                  const fonts = [sketchFont, "Impact", "monospace"];
                  const c = colors[i % 5];
                  const f = fonts[Math.floor(i / 5)];
                  return (
                    <DashedBox key={i} style={{ padding: 4, position: "relative" }}>
                      <ShirtSvg view="front" color={c} w={80} h={86} design={<div style={{ fontFamily: f, fontSize: 11, fontWeight: 700, color: c === "#fff" || c === "#9c6" ? ink : "#fff" }}>HELLO</div>} />
                      <span style={{ position: "absolute", top: 3, right: 3, width: 12, height: 12, background: accent, color: "#fff", fontSize: 9, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                    </DashedBox>
                  );
                })}
              </div>
            </div>
          )}

          {mode === "Series" && (
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                <HandLabel size={12} color={muted}>pattern:</HandLabel>
                <DashedBox style={{ padding: "4px 10px" }}><HandLabel size={13} style={{ fontFamily: "monospace" }}>TEAM #&#123;n&#125;</HandLabel></DashedBox>
                <HandLabel size={12} color={muted}>from</HandLabel>
                <DashedBox style={{ padding: "4px 10px", width: 50, textAlign: "center" }}><HandLabel size={13}>001</HandLabel></DashedBox>
                <HandLabel size={12} color={muted}>to</HandLabel>
                <DashedBox style={{ padding: "4px 10px", width: 50, textAlign: "center" }}><HandLabel size={13}>050</HandLabel></DashedBox>
                <HandLabel size={12} color={muted}>· step 1 · pad 3</HandLabel>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
                {Array.from({ length: 24 }).map((_, i) => (
                  <DashedBox key={i} style={{ padding: 3 }}>
                    <ShirtSvg view="front" color="#1a1a1a" w={50} h={54} design={<div style={{ fontFamily: "Impact", fontSize: 9, fontWeight: 700, color: "#fff" }}>#{String(i + 1).padStart(3, "0")}</div>} />
                  </DashedBox>
                ))}
                <DashedBox style={{ padding: 3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <HandLabel size={11} color={muted}>+26</HandLabel>
                </DashedBox>
              </div>
            </div>
          )}
        </Rough>
      </div>

      <Annotations
        notes={[
          { x: "30%", y: "11%", text: "the BIG idea — one app, four bulk modes" },
          { x: "5%", y: "44%", text: "design controls are shared across all modes", arrow: "right" },
          { x: "70%", y: "94%", text: "canvas reshapes per mode →" },
        ]}
      />
    </div>
  );
}

// ============================================================
// SHARED CHROME
// ============================================================

function Header({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 14, paddingBottom: 10, borderBottom: `1.5px dashed ${ink}` }}>
      <div style={{ fontFamily: sketchFont, fontSize: 28, fontWeight: 700, color: ink }}>{title}</div>
      <div style={{ fontFamily: labelFont, fontSize: 13, color: muted, marginTop: 2, maxWidth: 800 }}>{subtitle}</div>
    </div>
  );
}

function Annotations({ notes }) {
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {notes.map((n, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: n.x,
            top: n.y,
            fontFamily: sketchFont,
            fontSize: 13,
            color: accent,
            background: paper,
            padding: "2px 6px",
            border: `1px dashed ${accent}`,
            borderRadius: 3,
            maxWidth: 200,
            transform: "rotate(-1.5deg)",
          }}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// APP — tabs
// ============================================================
function App() {
  const [tab, setTab] = useState(0);
  const tabs = [
    { name: "1 · Studio", comp: WF1Studio, tag: "classic editor + queue" },
    { name: "2 · Spreadsheet", comp: WF2Spreadsheet, tag: "row-per-shirt" },
    { name: "3 · Matrix", comp: WF3Matrix, tag: "design × axes grid" },
    { name: "4 · Mode switcher", comp: WF4ModeSwitcher, tag: "unified, multi-mode" },
  ];

  const [tweaks, setTweak] = useTweaks({
    accent: "#ff5a36",
    showAnnotations: true,
    paperTexture: true,
    roughness: 1.2,
  });

  // apply tweaks
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", tweaks.accent);
  }, [tweaks.accent]);

  useEffect(() => {
    const flt = document.querySelector("#rough feDisplacementMap");
    if (flt) flt.setAttribute("scale", String(tweaks.roughness));
  }, [tweaks.roughness]);

  const Active = tabs[tab].comp;

  return (
    <div style={{ minHeight: "100vh", background: tweaks.paperTexture ? `${paper} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' /></filter><rect width='200' height='200' filter='url(%23n)' opacity='0.04'/></svg>")` : paper, color: ink }}>
      <SvgDefs />

      {/* page header */}
      <div style={{ padding: "18px 24px 8px", display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <div style={{ fontFamily: sketchFont, fontSize: 36, fontWeight: 700 }}>Bulk T-shirt Generator</div>
        <div style={{ fontFamily: labelFont, fontSize: 14, color: muted }}>wireframe exploration · 4 directions · low-fi</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: labelFont, fontSize: 12, color: muted }}>requirements →</div>
        {["fonts ✓", "colors ✓", "h+v align ✓", "PNG export ✓", "custom font upload ✓"].map((r) => (
          <DashedBox key={r} style={{ padding: "2px 8px", borderColor: accent }}>
            <span style={{ fontFamily: labelFont, fontSize: 11, color: accent }}>{r}</span>
          </DashedBox>
        ))}
      </div>

      {/* tabs */}
      <div style={{ padding: "0 24px", display: "flex", gap: 0, borderBottom: `1.5px solid ${ink}` }}>
        {tabs.map((t, i) => (
          <div
            key={t.name}
            onClick={() => setTab(i)}
            style={{
              padding: "10px 22px",
              cursor: "pointer",
              borderTop: `1.5px solid ${tab === i ? ink : "transparent"}`,
              borderLeft: `1.5px solid ${tab === i ? ink : "transparent"}`,
              borderRight: `1.5px solid ${tab === i ? ink : "transparent"}`,
              background: tab === i ? paper : "transparent",
              borderRadius: "6px 6px 0 0",
              marginBottom: -1.5,
              fontFamily: labelFont,
              fontWeight: tab === i ? 700 : 400,
              color: tab === i ? ink : muted,
              position: "relative",
              top: 1,
            }}
          >
            <div style={{ fontSize: 14 }}>{t.name}</div>
            <div style={{ fontSize: 11, color: muted, fontWeight: 400, marginTop: 1 }}>{t.tag}</div>
          </div>
        ))}
      </div>

      {/* active wireframe */}
      <div style={{ position: "relative" }} data-screen-label={`0${tab + 1} ${tabs[tab].name}`}>
        <Active />
        {!tweaks.showAnnotations && (
          <style>{`[data-screen-label] [style*="dashed ${accent.replace("var(--accent, ", "").replace(")", "")}"] { display: none !important; }`}</style>
        )}
      </div>

      {/* tweaks */}
      <TweaksPanel title="Tweaks">
        <TweakSection title="Look">
          <TweakColor label="Accent color" value={tweaks.accent} onChange={(v) => setTweak("accent", v)} />
          <TweakSlider label="Roughness" value={tweaks.roughness} min={0} max={3} step={0.1} onChange={(v) => setTweak("roughness", v)} />
          <TweakToggle label="Paper texture" value={tweaks.paperTexture} onChange={(v) => setTweak("paperTexture", v)} />
          <TweakToggle label="Show margin notes" value={tweaks.showAnnotations} onChange={(v) => setTweak("showAnnotations", v)} />
        </TweakSection>
        <TweakSection title="Direction">
          <TweakRadio
            label="Wireframe"
            value={String(tab)}
            options={tabs.map((t, i) => ({ value: String(i), label: t.name }))}
            onChange={(v) => setTab(Number(v))}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
