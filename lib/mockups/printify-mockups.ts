// Pulls Printify's pre-rendered mockup library for a product. Printify renders
// ~19 mockups per Gildan 5000 product (front, alt angles, hangers, 8 on-model
// "person-N" shots, duos, lifestyle, folded, size-chart) but its Etsy sales
// channel publishes only 1. We fetch them all and let the orchestrator upload
// a curated subset to Etsy directly via OAuth.

export type PrintifyMockup = {
  src: string;
  cameraLabel: string;
  position: string;
};

// Priority order for which mockups to upload when we're capped at 9 extras.
// Mix of human models, lifestyle, and the size chart (which Etsy buyers ask
// for constantly). Anything in this list comes first; anything not listed but
// present on the product comes after, in Printify's natural order.
const PREFERRED_LABELS = [
  'person-1',
  'person-2',
  'person-3',
  'person-4',
  'person-7-front',
  'person-8-front',
  'duo-2',
  'folded',
  'size-chart',
];

const MAX_EXTRA_PHOTOS = 9;

function extractCameraLabel(src: string): string {
  const m = src.match(/[?&]camera_label=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export async function fetchPrintifyMockups(productId: string): Promise<PrintifyMockup[]> {
  const shopId = process.env.PRINTIFY_SHOP_ID;
  const apiKey = process.env.PRINTIFY_API_KEY;
  if (!shopId || !apiKey) throw new Error('PRINTIFY_SHOP_ID / PRINTIFY_API_KEY not set');

  const resp = await fetch(
    `https://api.printify.com/v1/shops/${shopId}/products/${productId}.json`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Printify GET product failed ${resp.status}: ${text.slice(0, 200)}`);
  }
  const j = (await resp.json()) as {
    images?: Array<{ src: string; position?: string; is_selected_for_publishing?: boolean }>;
  };

  const all: PrintifyMockup[] = (j.images ?? [])
    .filter((i) => i.is_selected_for_publishing !== false)
    .map((i) => ({
      src: i.src,
      cameraLabel: extractCameraLabel(i.src),
      position: i.position ?? 'other',
    }));

  // Skip the 'front' position — Printify auto-publishes that one to Etsy
  // already, so uploading it would create a duplicate.
  const eligible = all.filter((m) => m.position !== 'front');

  // Sort by PREFERRED_LABELS order; unlisted labels keep their natural order
  // after all preferred ones.
  const byLabel = new Map<string, PrintifyMockup>();
  for (const m of eligible) byLabel.set(m.cameraLabel, m);

  const ordered: PrintifyMockup[] = [];
  for (const label of PREFERRED_LABELS) {
    const m = byLabel.get(label);
    if (m) {
      ordered.push(m);
      byLabel.delete(label);
    }
  }
  for (const m of byLabel.values()) ordered.push(m);

  return ordered.slice(0, MAX_EXTRA_PHOTOS);
}

export async function downloadMockup(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Mockup download failed ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}
