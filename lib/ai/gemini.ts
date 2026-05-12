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
export const MODEL_CREATIVE = 'gemini-2.5-pro';

export async function geminiJSON<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<{ raw: string; parsed: T }> {
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
}

export async function geminiText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
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
}
