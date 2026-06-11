export type RecraftStyle = 'digital_illustration' | 'realistic_image' | 'vector_illustration';

export async function generateImage(opts: {
  prompt: string;
  style: RecraftStyle;
  substyle?: string;
  idempotencyKey?: string;
  size?: string;
}): Promise<string> {
  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) throw new Error('RECRAFT_API_KEY not set');

  const body = {
    prompt: opts.prompt,
    style: opts.style,
    substyle: opts.substyle,
    size: opts.size ?? '2048x2048',
    response_format: 'url',
    n: 1,
  };

  const doRequest = async () => fetch('https://external.api.recraft.ai/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

  let resp = await doRequest();
  if (resp.status >= 500 && resp.status < 600) {
    resp = await doRequest();
  }
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Recraft request failed ${resp.status}: ${errText.slice(0, 200)}`);
  }
  const json = await resp.json() as { data: Array<{ url: string }> };
  const url = json.data?.[0]?.url;
  if (!url) throw new Error('Recraft returned no image URL');
  return url;
}
