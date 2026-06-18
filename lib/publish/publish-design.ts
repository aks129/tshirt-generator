import { uploadImageByUrl } from '@/lib/printify/upload-image';
import { createProductFromMaster } from '@/lib/printify/create-product';
import { publishProduct } from '@/lib/printify/publish-product';
import { getProduct } from '@/lib/printify/get-product';
import { fetchMasterProduct, type MasterProductSpec } from '@/lib/printify/master-product';

export type PublishResult =
  | { status: 'live'; printifyProductId: string; etsyListingId: string; etsyUrl: string }
  | { status: 'publishing_slow'; printifyProductId: string };

export async function runPublish(input: {
  designImageUrl: string;
  fileName: string;
  /** Printify product ID of the seller's master template. Required — we no
   *  longer support raw blueprint/variants from settings; the master is the
   *  single source of truth for what shirt + colors + sizes + prices to use. */
  masterProductId: string;
  /** Optional pre-fetched master spec — saves a Printify GET in the caller. */
  master?: MasterProductSpec;
  title: string;
  description: string;
  tags: string[];
  /** AI-recommended best price for this design, in cents. When supplied,
   *  the master's variant prices are shifted so the cheapest variant lands
   *  on this number (size upcharges preserved). Falls back to master's
   *  prices when null. */
  basePriceCents?: number | null;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
  preCreatedProductId?: string;
  /** Invoked with the Printify product id the instant it is created, BEFORE
   *  publish/poll. Lets the caller persist it immediately so a retry (after a
   *  crash/timeout during publish or poll) reuses the product via
   *  preCreatedProductId instead of cloning a duplicate (orphan). */
  onProductCreated?: (productId: string) => Promise<void>;
}): Promise<PublishResult> {
  // Default poll budget is tight on purpose: Vercel function maxDuration is
  // 60s. Safety + upload + create + publish already costs ~15-25s. 30s of
  // polling on top routinely tripped FUNCTION_INVOCATION_TIMEOUT. Fast
  // publishes return external_handle in 2-3s, so 5s catches the common case;
  // slow ones flip to publishing_slow and are picked up by client polling
  // (publish-modal.tsx) + the daily reconcile cron.
  const pollInterval = input.pollIntervalMs ?? 2000;
  const pollTimeout = input.pollTimeoutMs ?? 5000;

  let productId = input.preCreatedProductId;

  if (!productId) {
    const master = input.master ?? (await fetchMasterProduct(input.masterProductId));

    const upload = await uploadImageByUrl({ fileName: input.fileName, url: input.designImageUrl });

    const created = await createProductFromMaster({
      master,
      imageId: upload.imageId,
      title: input.title,
      description: input.description,
      tags: input.tags,
      basePriceCents: input.basePriceCents ?? null,
    });
    productId = created.productId;
    // Persist the id NOW (before publish/poll) so an uncaught failure in the
    // steps below leaves a recoverable record — a retry reuses this product
    // instead of cloning an orphan.
    if (input.onProductCreated) await input.onProductCreated(productId);
  }

  await publishProduct(productId);

  const start = Date.now();
  while (Date.now() - start < pollTimeout) {
    const status = await getProduct(productId);
    if (status.etsyListingId && status.etsyUrl) {
      return {
        status: 'live',
        printifyProductId: productId,
        etsyListingId: status.etsyListingId,
        etsyUrl: status.etsyUrl,
      };
    }
    await new Promise((r) => setTimeout(r, pollInterval));
  }

  return { status: 'publishing_slow', printifyProductId: productId };
}
