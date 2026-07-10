// Groq is the fallback when Gemini is rate-limited, down, or unreachable.
// We hit it with the same system+user prompt shape and expect JSON-object
// output. Groq's API is OpenAI-compatible.

export const GROQ_MODEL = 'llama-3.3-70b-versatile';

export async function groqJSON<T>(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<{ raw: string; parsed: T }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? GROQ_MODEL,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: opts.maxTokens ?? 2048,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Groq ${resp.status}: ${body.slice(0, 300)}`);
  }

  const json = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = json.choices[0]?.message?.content ?? '';
  if (!raw) throw new Error('Groq returned empty content');
  const parsed = JSON.parse(raw) as T;
  return { raw, parsed };
}

/** Plain-text completion — the fallback shape for geminiText (SVG generation
 *  and other non-JSON prompts). */
export async function groqText(opts: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set');

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: opts.model ?? GROQ_MODEL,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      temperature: 0.7,
      max_tokens: opts.maxTokens ?? 4096,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Groq ${resp.status}: ${body.slice(0, 300)}`);
  }

  const json = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = json.choices[0]?.message?.content ?? '';
  if (!raw) throw new Error('Groq returned empty content');
  return raw;
}
