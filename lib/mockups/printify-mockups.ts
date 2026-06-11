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

// Default priority order when the operator hasn't configured a custom selection.
// Mix of human models, lifestyle, and the size chart (which Etsy buyers ask
// for constantly).
const DEFAULT_PREFERRED_LABELS = [
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

async function fetchProduct(productId: string): Promise<{
  images: Array<{ src: string; position?: string; is_default?: boolean; is_selected_for_publishing?: boolean }>;
}> {
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
  return (await resp.json()) as {
    images: Array<{ src: string; position?: string; is_default?: boolean; is_selected_for_publishing?: boolean }>;
  };
}

/** Returns just the camera_labels (deduplicated, original order) for a product.
 *  Used by the settings UI to show what's available to pick. */
export async function fetchAllPrintifyImageLabels(productId: string): Promise<string[]> {
  const j = await fetchProduct(productId);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const img of j.images ?? []) {
    const label = extractCameraLabel(img.src);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/** Returns up to 9 mockups to upload, ordered by `preferredLabels` (if given)
 *  or the default priority list. Skips the `is_default` image since Printify
 *  already publishes that one to Etsy as the listing's primary photo.
 *
 *  Not all blueprints render camera-labelled libraries: Gildan 5000 gives 1
 *  front + person/lifestyle shots, while Comfort Colors 1717 renders one
 *  front-position image per color with no labels at all. Filtering by
 *  position='front' (the old heuristic) returned zero mockups for the latter. */
export async function fetchPrintifyMockups(
  productId: string,
  opts: { preferredLabels?: string[] } = {},
): Promise<PrintifyMockup[]> {
  const j = await fetchProduct(productId);

  const all: PrintifyMockup[] = (j.images ?? [])
    .filter((i) => i.is_selected_for_publishing !== false && i.is_default !== true)
    .map((i) => ({
      src: i.src,
      cameraLabel: extractCameraLabel(i.src),
      position: i.position ?? 'other',
    }));

  const preferred = opts.preferredLabels && opts.preferredLabels.length > 0
    ? opts.preferredLabels
    : DEFAULT_PREFERRED_LABELS;

  // Sort by preferred order. Labels are NOT unique per image: CC1717 renders
  // every per-color front with camera_label=front, so group label → images[]
  // instead of deduping, and keep unlabelled images in natural order after.
  const byLabel = new Map<string, PrintifyMockup[]>();
  const unlabelled: PrintifyMockup[] = [];
  for (const m of all) {
    if (m.cameraLabel) {
      const list = byLabel.get(m.cameraLabel) ?? [];
      list.push(m);
      byLabel.set(m.cameraLabel, list);
    } else {
      unlabelled.push(m);
    }
  }

  const ordered: PrintifyMockup[] = [];
  for (const label of preferred) {
    const list = byLabel.get(label);
    if (list) {
      ordered.push(...list);
      byLabel.delete(label);
    }
  }
  if (opts.preferredLabels && opts.preferredLabels.length > 0 && ordered.length > 0) {
    // explicit selection matched — don't backfill with anything not chosen
  } else {
    // No selection, or the saved labels belong to a different blueprint's
    // library (zero matches): upload the available mockups in natural order
    // rather than nothing.
    for (const list of byLabel.values()) ordered.push(...list);
    ordered.push(...unlabelled);
  }

  return ordered.slice(0, MAX_EXTRA_PHOTOS);
}

export async function downloadMockup(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Mockup download failed ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}
