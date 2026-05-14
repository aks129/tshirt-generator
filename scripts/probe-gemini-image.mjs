import { GoogleGenAI } from '@google/genai';
import { writeFileSync } from 'node:fs';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = 'gemini-2.5-flash-image';

console.log(`Probing ${MODEL}...`);
const r = await ai.models.generateContent({
  model: MODEL,
  contents: [{
    role: 'user',
    parts: [{ text: 'A plain white unisex t-shirt on a young woman, mid-shot, urban background, natural light, no design on the shirt, product photography' }],
  }],
});

const parts = r.candidates?.[0]?.content?.parts ?? [];
console.log(`Got ${parts.length} parts`);
for (const [i, p] of parts.entries()) {
  if (p.text) console.log(`  part ${i}: text:`, p.text.slice(0, 150));
  else if (p.inlineData) {
    const buf = Buffer.from(p.inlineData.data, 'base64');
    const ext = p.inlineData.mimeType?.split('/')[1] ?? 'bin';
    const path = `/tmp/probe-output.${ext}`;
    writeFileSync(path, buf);
    console.log(`  part ${i}: ${p.inlineData.mimeType}, ${buf.length} bytes → ${path}`);
  }
}
