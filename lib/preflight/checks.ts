import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { fetchMasterProduct } from '@/lib/printify/master-product';
import { recommendPrice } from '@/lib/etsy/price-recommendation';
import { getSettingsForDesign } from '@/lib/settings/accessor';
import type { Concept } from '@/lib/schemas';

// Pre-publish QA. Hard checks block the publish button; soft checks are
// advisory. The goal: every published listing meets the Etsy-seller
// best-practices we've codified (color variety, full tag set, curated
// mockups, sensible price relative to market).

export type CheckSeverity = 'hard' | 'soft';

export type CheckResult = {
  id: string;
  severity: CheckSeverity;
  label: string;
  ok: boolean;
  detail?: string;
};

export type PreflightReport = {
  ok: boolean; // true when no hard checks are failing
  hardFailing: number;
  softFailing: number;
  checks: CheckResult[];
  recommendedPriceCents: number | null;
  marketMedianCents: number | null;
};

export async function runPreflight(designId: string): Promise<PreflightReport> {
  const checks: CheckResult[] = [];

  const design = await db.query.designs.findFirst({ where: eq(designs.id, designId) });
  const settings = await getSettingsForDesign(designId);

  // ---- Hard: design exists + image ----
  checks.push({
    id: 'design_image',
    severity: 'hard',
    label: 'Design has a rendered PNG',
    ok: !!design?.imageBlobUrl,
    detail: !design?.imageBlobUrl ? 'No image_blob_url; re-render in the bulk generator.' : undefined,
  });

  // ---- Hard: master Printify product ----
  const masterId = settings?.masterPrintifyProductId ?? null;
  checks.push({
    id: 'master_set',
    severity: 'hard',
    label: 'Master Printify product selected',
    ok: !!masterId,
    detail: !masterId ? 'Pick one in /settings (Master Printify product).' : undefined,
  });

  // Soft + hard: master integrity (only checkable if masterId is set)
  let recommendedCents: number | null = null;
  let marketMedianCents: number | null = null;
  let colorCount = 0;

  if (masterId) {
    try {
      const master = await fetchMasterProduct(masterId);

      // Hard: master must have at least one enabled variant
      checks.push({
        id: 'master_variants',
        severity: 'hard',
        label: 'Master has enabled variants',
        ok: master.variants.length > 0,
        detail: master.variants.length === 0 ? 'Enable at least one color/size variant in Printify.' : undefined,
      });

      // Pull distinct colors by inspecting variant id offsets isn't reliable —
      // instead infer color variety from variant count vs typical 6-size grid.
      // Treat ≥18 variants as ≥3 colors (3 colors × 6 sizes). It's a heuristic
      // until we round-trip variant.color names.
      colorCount = Math.max(1, Math.floor(master.variants.length / 6));
      checks.push({
        id: 'master_color_variety',
        severity: 'soft',
        label: 'At least 3 color options',
        ok: colorCount >= 3,
        detail: colorCount < 3
          ? `~${colorCount} color${colorCount === 1 ? '' : 's'} detected; Etsy buyers convert better on multi-color listings.`
          : undefined,
      });

      // Soft: master has multiple curated mockups (the print_areas count is
      // a proxy — single-placeholder products tend to be under-curated).
      const totalPlaceholders = master.printAreas.reduce(
        (sum, pa) => sum + pa.placeholders.filter((ph) => ph.images.length > 0).length,
        0,
      );
      checks.push({
        id: 'master_print_areas',
        severity: 'soft',
        label: 'Master has at least one active print area',
        ok: totalPlaceholders > 0,
        detail: totalPlaceholders === 0 ? 'Add front/back art in the master Printify product.' : undefined,
      });
    } catch (err) {
      checks.push({
        id: 'master_fetch',
        severity: 'hard',
        label: 'Master product is reachable',
        ok: false,
        detail: err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120),
      });
    }
  }

  // ---- Hard: Etsy OAuth connected (required for photo top-up after publish) ----
  const etsyConnected = !!settings?.etsyAccessToken;
  checks.push({
    id: 'etsy_oauth',
    severity: 'soft',
    label: 'Etsy OAuth connected',
    ok: etsyConnected,
    detail: !etsyConnected ? 'Connect in /settings to upload extra mockup photos after publish.' : undefined,
  });

  // ---- Soft: title/description/tags on the draft ----
  const draft = (design?.listingDraft ?? null) as
    | { title?: string; description?: string; tags?: string[] }
    | null;
  if (draft) {
    const titleLen = (draft.title ?? '').length;
    checks.push({
      id: 'title_length',
      severity: 'soft',
      label: 'Title ≥ 60 characters (Etsy SEO sweet spot)',
      ok: titleLen >= 60,
      detail: titleLen < 60 ? `${titleLen}/140 — add high-intent keywords.` : undefined,
    });
    const tagCount = draft.tags?.length ?? 0;
    checks.push({
      id: 'tags_full',
      severity: 'soft',
      label: 'All 13 Etsy tags filled',
      ok: tagCount === 13,
      detail: tagCount !== 13 ? `${tagCount}/13 — Etsy weights every slot.` : undefined,
    });
    const descLen = (draft.description ?? '').length;
    checks.push({
      id: 'description_length',
      severity: 'soft',
      label: 'Description ≥ 100 characters',
      ok: descLen >= 100,
      detail: descLen < 100 ? `${descLen} chars; add care + sizing notes.` : undefined,
    });
  }

  // ---- Soft: price recommendation available ----
  if (design && settings) {
    try {
      const rec = await recommendPrice({
        concept: {
          headline: (design.concept as Concept).headline,
          niche_keywords: (design.concept as Concept).niche_keywords ?? [],
        },
        settings: {
          priceOffsetCents: settings.priceOffsetCents,
          minPriceFloorCents: settings.minPriceFloorCents,
        },
      });
      if (rec.source !== 'unavailable') {
        recommendedCents = rec.recommendedCents;
        marketMedianCents = rec.statistics?.median ?? null;
      }
      checks.push({
        id: 'price_recommendation',
        severity: 'soft',
        label: 'Competitive price recommendation found',
        ok: rec.source !== 'unavailable',
        detail: rec.source === 'unavailable'
          ? "No Etsy comps for this niche; falls back to master's prices."
          : `Will publish at ~$${(rec.recommendedCents / 100).toFixed(2)} (market median $${((rec.statistics?.median ?? 0) / 100).toFixed(2)}).`,
      });
    } catch {
      checks.push({
        id: 'price_recommendation',
        severity: 'soft',
        label: 'Competitive price recommendation found',
        ok: false,
        detail: "Recommendation failed; falls back to master's prices.",
      });
    }
  }

  const hardFailing = checks.filter((c) => c.severity === 'hard' && !c.ok).length;
  const softFailing = checks.filter((c) => c.severity === 'soft' && !c.ok).length;
  return {
    ok: hardFailing === 0,
    hardFailing,
    softFailing,
    checks,
    recommendedPriceCents: recommendedCents,
    marketMedianCents,
  };
}
