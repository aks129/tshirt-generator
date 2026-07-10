import { GoogleGenAI } from '@google/genai';
import { groqJSON, groqText, GROQ_MODEL } from './groq';
import { logAiCall, classifyError, type AiProvider } from './log';

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
      const waitMs = retryMatch ? Math.ceil(Number(retryMatch[1]) * 1000) + 500 : (i + 1) * 4000;
      // Cap the backoff well under Vercel's 60s function budget — a long
      // free-tier 429 wait must not hang a request to the timeout. If the
      // suggested wait exceeds the cap, give up (fall through to Groq / throw).
      const waitCapped = Math.min(waitMs, 8_000);
      if (waitMs > waitCapped && i < attempts - 1) throw err;
      await sleep(waitCapped);
    }
  }
  throw lastErr;
}

function isTransientGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|5\d\d|RESOURCE_EXHAUSTED|quota|rate|UNAVAILABLE|fetch failed|network|timeout|aborted|ECONNRESET|ETIMEDOUT)\b/i.test(msg);
}

export async function geminiJSON<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<{ raw: string; parsed: T; provider: AiProvider }> {
  const geminiStart = Date.now();
  const geminiModel = opts.model ?? MODEL;
  try {
    const out = await withRetry(async () => {
      const ai = getGemini();
      const resp = await ai.models.generateContent({
        model: geminiModel,
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
    await logAiCall({
      provider: 'gemini', model: geminiModel,
      durationMs: Date.now() - geminiStart, ok: true, call: 'json',
    });
    return { ...out, provider: 'gemini' };
  } catch (err) {
    const geminiDuration = Date.now() - geminiStart;
    const errorClass = classifyError(err);
    await logAiCall({
      provider: 'gemini', model: geminiModel,
      durationMs: geminiDuration, ok: false, errorClass, call: 'json',
    });

    // Fall back to Groq for transient Gemini failures only. Schema /
    // 4xx errors bubble up as-is.
    if (process.env.GROQ_API_KEY && isTransientGeminiError(err)) {
      const groqStart = Date.now();
      try {
        const out = await groqJSON<T>({
          system: opts.system,
          user: opts.user,
          maxTokens: opts.maxTokens,
        });
        await logAiCall({
          provider: 'groq', model: GROQ_MODEL,
          durationMs: Date.now() - groqStart, ok: true, call: 'json',
        });
        return { ...out, provider: 'groq' };
      } catch (groqErr) {
        await logAiCall({
          provider: 'groq', model: GROQ_MODEL,
          durationMs: Date.now() - groqStart, ok: false,
          errorClass: classifyError(groqErr), call: 'json',
        });
        /* fallthrough — rethrow original Gemini error */
      }
    }
    throw err;
  }
}

export async function geminiText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  const geminiStart = Date.now();
  const geminiModel = opts.model ?? MODEL;
  try {
    const out = await withRetry(async () => {
      const ai = getGemini();
      const resp = await ai.models.generateContent({
        model: geminiModel,
        contents: opts.user,
        config: {
          systemInstruction: opts.system,
          maxOutputTokens: opts.maxTokens ?? 4096,
        },
      });
      return resp.text ?? '';
    });
    await logAiCall({
      provider: 'gemini', model: geminiModel,
      durationMs: Date.now() - geminiStart, ok: true, call: 'text',
    });
    return out;
  } catch (err) {
    await logAiCall({
      provider: 'gemini', model: geminiModel,
      durationMs: Date.now() - geminiStart, ok: false,
      errorClass: classifyError(err), call: 'text',
    });

    // Same transient-only Groq fallback as geminiJSON — a free-tier 429 on
    // Gemini must not kill SVG/typography generation.
    if (process.env.GROQ_API_KEY && isTransientGeminiError(err)) {
      const groqStart = Date.now();
      try {
        const out = await groqText({
          system: opts.system,
          user: opts.user,
          maxTokens: opts.maxTokens,
        });
        await logAiCall({
          provider: 'groq', model: GROQ_MODEL,
          durationMs: Date.now() - groqStart, ok: true, call: 'text',
        });
        return out;
      } catch (groqErr) {
        await logAiCall({
          provider: 'groq', model: GROQ_MODEL,
          durationMs: Date.now() - groqStart, ok: false,
          errorClass: classifyError(groqErr), call: 'text',
        });
        /* fallthrough — rethrow original Gemini error */
      }
    }
    throw err;
  }
}
