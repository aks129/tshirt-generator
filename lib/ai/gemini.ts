import { GoogleGenAI } from '@google/genai';

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY (or GOOGLE_API_KEY) not set');
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

export const MODEL = 'gemini-2.5-flash';
// gemini-2.5-pro is NOT available on the free tier (limit: 0). Free tier
// supports gemini-2.5-flash and gemini-2.0-flash only.
export const MODEL_CREATIVE = 'gemini-2.5-flash';

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const is429 = /429|RESOURCE_EXHAUSTED|quota|rate/i.test(msg);
      if (!is429 || i === attempts - 1) throw err;
      const retryMatch = msg.match(/retry in ([0-9.]+)s/i);
      const waitMs = retryMatch ? Math.ceil(Number(retryMatch[1]) * 1000) + 500 : (i + 1) * 8000;
      await sleep(Math.min(waitMs, 60_000));
    }
  }
  throw lastErr;
}

export async function geminiJSON<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<{ raw: string; parsed: T }> {
  return withRetry(async () => {
    const ai = getGemini();
    const resp = await ai.models.generateContent({
      model: opts.model ?? MODEL,
      contents: opts.user,
      config: {
        systemInstruction: opts.system,
        responseMimeType: 'application/json',
        maxOutputTokens: opts.maxTokens ?? 4096,
      },
    });
    const text = resp.text ?? '';
    const parsed = JSON.parse(text) as T;
    return { raw: text, parsed };
  });
}

export async function geminiText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  return withRetry(async () => {
    const ai = getGemini();
    const resp = await ai.models.generateContent({
      model: opts.model ?? MODEL,
      contents: opts.user,
      config: {
        systemInstruction: opts.system,
        maxOutputTokens: opts.maxTokens ?? 4096,
      },
    });
    return resp.text ?? '';
  });
}
