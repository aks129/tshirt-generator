import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { MODEL } from '@/lib/ai/gemini';
import { GROQ_MODEL } from '@/lib/ai/groq';

export const runtime = 'nodejs';
export const maxDuration = 30;

type ProviderHealth = {
  ok: boolean;
  latencyMs: number;
  model: string;
  error?: string;
};

async function pingGemini(): Promise<ProviderHealth> {
  const start = Date.now();
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) return { ok: false, latencyMs: 0, model: MODEL, error: 'GEMINI_API_KEY not set' };
  try {
    const ai = new GoogleGenAI({ apiKey: key });
    const resp = await ai.models.generateContent({
      model: MODEL,
      contents: 'Reply with the single word: OK',
      config: { maxOutputTokens: 8 },
    });
    return {
      ok: (resp.text ?? '').toLowerCase().includes('ok'),
      latencyMs: Date.now() - start,
      model: MODEL,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      model: MODEL,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}

async function pingGroq(): Promise<ProviderHealth> {
  const start = Date.now();
  const key = process.env.GROQ_API_KEY;
  if (!key) return { ok: false, latencyMs: 0, model: GROQ_MODEL, error: 'GROQ_API_KEY not set' };
  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
        max_tokens: 8,
      }),
    });
    if (!resp.ok) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        model: GROQ_MODEL,
        error: `${resp.status} ${(await resp.text()).slice(0, 200)}`,
      };
    }
    const j = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = j.choices?.[0]?.message?.content ?? '';
    return {
      ok: text.toLowerCase().includes('ok'),
      latencyMs: Date.now() - start,
      model: GROQ_MODEL,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      model: GROQ_MODEL,
      error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    };
  }
}

export async function GET() {
  const [gemini, groq] = await Promise.all([pingGemini(), pingGroq()]);
  return NextResponse.json({
    ok: gemini.ok || groq.ok,
    gemini,
    groq,
    checkedAt: new Date().toISOString(),
  });
}
