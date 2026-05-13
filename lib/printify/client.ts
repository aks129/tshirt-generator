const PRINTIFY_BASE = 'https://api.printify.com/v1';

export class PrintifyError extends Error {
  constructor(public status: number, public body: string, message: string) {
    super(message);
    this.name = 'PrintifyError';
  }
}

export function getShopId(): string {
  const id = process.env.PRINTIFY_SHOP_ID;
  if (!id) throw new Error('PRINTIFY_SHOP_ID not set');
  return id;
}

export async function printifyFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const key = process.env.PRINTIFY_API_KEY;
  if (!key) throw new Error('PRINTIFY_API_KEY not set');

  let url = `${PRINTIFY_BASE}${path}`;
  if (opts.query) {
    const qs = new URLSearchParams(opts.query).toString();
    url += url.includes('?') ? `&${qs}` : `?${qs}`;
  }

  const init: RequestInit = {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'User-Agent': 'tshirt-generator/0.1 (eugene.vestel@gmail.com)',
      'content-type': 'application/json;charset=utf-8',
    },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  let resp = await fetch(url, init);
  if (resp.status >= 500 && resp.status < 600) {
    resp = await fetch(url, init);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const excerpt = body.length > 0 ? ` — ${body.slice(0, 400)}` : '';
    throw new PrintifyError(resp.status, body, `Printify ${opts.method ?? 'GET'} ${path} failed: ${resp.status}${excerpt}`);
  }
  return (await resp.json()) as T;
}

export function shopPath(suffix: string): string {
  return `/shops/${getShopId()}${suffix}`;
}
