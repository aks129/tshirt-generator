import { db } from '@/lib/db/client';
import { generationEvents } from '@/lib/db/schema';

export type AiProvider = 'gemini' | 'groq';

export type AiCallLog = {
  provider: AiProvider;
  model?: string;
  durationMs: number;
  ok: boolean;
  errorClass?: string;
  call: 'json' | 'text' | 'health';
};

// Logs an AI call to generation_events. Fire-and-forget pattern (await for
// correctness on Vercel; ~20ms Neon round-trip is fine relative to AI calls
// that take 800-3000ms).
export async function logAiCall(entry: AiCallLog): Promise<void> {
  try {
    await db.insert(generationEvents).values({
      eventType: entry.ok ? 'generated' : 'publish_failed',
      payload: {
        kind: 'ai_call',
        provider: entry.provider,
        model: entry.model,
        durationMs: entry.durationMs,
        ok: entry.ok,
        errorClass: entry.errorClass,
        call: entry.call,
      },
    });
  } catch {
    // Don't let logging failures bubble up — they'd mask real AI errors.
  }
}

export function classifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/429|RESOURCE_EXHAUSTED|quota|rate/i.test(msg)) return 'rate_limit';
  if (/5\d\d|UNAVAILABLE/.test(msg)) return 'server_error';
  if (/fetch failed|network|ECONNRESET|ETIMEDOUT|aborted|timeout/i.test(msg)) return 'network';
  if (/JSON|parse/i.test(msg)) return 'parse_error';
  if (/4\d\d|invalid/i.test(msg)) return 'client_error';
  return 'unknown';
}
