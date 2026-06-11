import { writeFileSync } from 'node:fs';

const key = process.env.RECRAFT_API_KEY;
const prompts = [
  {
    name: 'flat-lay',
    prompt: `A plain white unisex cotton t-shirt laid flat on a soft beige linen background, top-down view, soft natural light. The shirt has the text "I CAME. I SAW. I MADE IT AWKWARD." printed in bold black sans-serif typography (Archivo Black or Impact style), centered on the chest in 4 lines. Realistic product photography, clean composition, accurate text rendering, no extra text or watermarks.`,
  },
];

for (const p of prompts) {
  console.log(`Generating "${p.name}"…`);
  const t0 = Date.now();
  const resp = await fetch('https://external.api.recraft.ai/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      prompt: p.prompt,
      style: 'realistic_image',
      size: '1024x1024',
      response_format: 'url',
      n: 1,
    }),
  });
  if (!resp.ok) {
    console.error('  ERROR:', resp.status, await resp.text());
    continue;
  }
  const j = await resp.json();
  const url = j.data?.[0]?.url;
  if (!url) { console.error('  no URL'); continue; }
  const imgResp = await fetch(url);
  const buf = Buffer.from(await imgResp.arrayBuffer());
  const path = `/tmp/recraft-probe-${p.name}.png`;
  writeFileSync(path, buf);
  console.log(`  ${Date.now() - t0}ms, ${buf.length} bytes → ${path}`);
}
