# Plan 4 — Mockup Photos via Etsy OAuth — Design Spec

**Date:** 2026-05-13
**Status:** Approved, ready for implementation planning
**Owner:** Eugene Vestel
**Builds on:** Plan 1 (foundation + bulk generator) + Plan 2 (Printify+Etsy publish) + Plan 3 (competitive pricing + Etsy Open API). Live at `https://tshirt-generator-one.vercel.app`. 2 listings live, 4 publishing/queued.

## 1. Purpose & Goals

Add 5-6 extra mockup photos per listing automatically after each publish, removing Etsy's "low search visibility" warning and giving listings a professional multi-angle presentation. Bypass Printify's mockup-selection limitation (no API access) by generating composites server-side and uploading directly to Etsy via OAuth.

**Success criterion:** Every newly published Etsy listing has **7 photos** total (1 Printify auto + 6 server-composited) within ~30s of going live, with no operator intervention beyond a one-time Etsy shop connect.

**Explicit non-goals:**
- Per-design custom mockup selection (operator picks bases for this design) — all listings get same 6 bases for v1
- Niche-specific mockup styles
- Animated / video mockups
- A/B testing different mockup sets
- "On-model wearing this exact design" lifestyle photos (img2img with text rendering is unreliable)
- Multi-user / wife's separate shop (deferred to future phase)

## 2. Hard realities acknowledged in the design

- **Printify's public API does not expose mockup selection.** Confirmed in Plan-3-era testing — manual configuration of one product (14 mockups visible on Printify side) had zero effect on subsequent API-created products. The mockup library is dashboard-only.
- **Etsy listings cap at 10 photos.** Printify adds 1; we add 6; leaves 3 of headroom for manual additions or future features.
- **Etsy upload is per-image multipart POST.** No batch endpoint. Sequential uploads at ~2s each.
- **Etsy OAuth requires shop-scoped consent.** Our existing app keystring (Plan 3) only authorizes public reads; this plan adds the `listings_w` scope via OAuth 2.0 PKCE flow.

## 3. Prerequisites (already in place)

- Plan 3 done: Etsy Open API app approved, `ETSY_API_KEY` + `ETSY_SHARED_SECRET` in env
- `RECRAFT_API_KEY` scaffolded in `.env.example` and committed (needed for one-time base-photo generation)
- Existing publish flow (`/api/listings`) and reconcile cron (`/api/cron/reconcile`)
- `sharp` already installed for the bulk-generator pipeline
- Vercel Blob for image hosting (already used for design PNGs)

## 4. Architecture

```
ONE-TIME SETUP (operator does this once)
  1. Run scripts/generate-base-photos.ts:
       Recraft V3 generates 6 blank tee photos
       (~$0.24 total, 2048×2048 PNG each)
       Saves to public/mockup-bases/{1..6}.png
  2. Manually calibrate printArea rectangle for each
       (~5 min per photo, recorded in lib/mockups/manifest.ts)
  3. Operator clicks "Connect Etsy shop" in /settings
       OAuth 2.0 PKCE flow → stores tokens

PER-LISTING (after publish completes)
  Publish modal sees status='live' or 'queued'
     ↓
  Modal POSTs /api/listings/[listing_id]/photos
     ↓
  Server (NEW endpoint):
    1. Validate: etsy_access_token exists, listing.etsy_listing_id non-null
    2. Refresh OAuth access token if within 60s of expiry
    3. For each of 6 base photos (parallel composite):
         sharp(base).composite([design overlaid at printArea])
         Result: JPEG buffer, ~300-500KB
    4. For each composite (sequential upload, 200ms gap):
         POST /v3/application/shops/{shop_id}/listings/{listing_id}/images
         multipart: image bytes + rank + alt_text
    5. Update listings:
         photos_uploaded_at = NOW()
         photos_count = N (1-6, partial success allowed)
         photos_failure_reason = "..." if any failures
     ↓
  Modal shows "✓ Listed with 7 photos on Etsy"
     ↓
  Total typical time: ~15-18s

BACKFILL (daily cron + on-demand)
  /api/cron/reconcile gets a new pass:
    SELECT listings WHERE status='live'
      AND etsy_listing_id IS NOT NULL
      AND photos_uploaded_at IS NULL
      AND created_at > NOW() - INTERVAL '7 days'
    For each: run the same composite + upload pipeline
  /listings page row gets "↑ Add photos" button for the same path
  Useful for: modal closed before upload, OAuth expired mid-upload, network blips
```

**Three key architectural decisions:**

1. **Photos uploaded in a separate request from publish.** Publish (`/api/listings`) stays at its tight 60s budget. Photos run in their own ~30s function. Decoupled = no 504 risk on a slow Etsy upload leg.
2. **Backfill is first-class.** Same endpoint serves both the modal-triggered flow and the cron/manual retry flow. No code duplication.
3. **Etsy OAuth scoped tight: `listings_w` only.** No buyer data, no shop OAuth beyond what's strictly needed to write to listings.

## 5. Etsy OAuth Flow

### App registration

Existing Etsy API key (from Plan 3) works for both public reads and OAuth. Add redirect URIs to the Etsy app config (one-time, in Etsy developer dashboard):

- Production: `https://tshirt-generator-one.vercel.app/api/etsy/oauth/callback`
- Local dev: `http://localhost:3000/api/etsy/oauth/callback`

### Flow

```
1. /settings page: new "Etsy connection" section.
   - If not connected: [Connect Etsy shop →] button
   - If connected: shows shop name + expiry + [Disconnect]
2. Click Connect → POST /api/etsy/oauth/start
   - Generates state (32 random bytes, base64url) + code_verifier (64 random chars)
   - Stores both in signed httpOnly cookie OAUTH_PKCE (TTL 5 min)
   - Returns: redirect URL to Etsy authorize endpoint:
     https://www.etsy.com/oauth/connect
       ?response_type=code
       &client_id=<ETSY_API_KEY>
       &redirect_uri=<configured URI>
       &scope=listings_w
       &state=<state>
       &code_challenge=<sha256(verifier), base64url>
       &code_challenge_method=S256
3. Browser redirects to Etsy → operator authorizes →
   Etsy redirects back: /api/etsy/oauth/callback?code=...&state=...
4. /api/etsy/oauth/callback:
   - Verifies state cookie matches query param (CSRF check)
   - POSTs to https://api.etsy.com/v3/public/oauth/token:
     grant_type=authorization_code
     client_id=<ETSY_API_KEY>
     redirect_uri=<configured URI>
     code=<code from query>
     code_verifier=<from cookie>
   - Etsy returns: { access_token, refresh_token, token_type, expires_in: 3600 }
   - Access token has format "<user_id>.<random>" — parse user_id from prefix
   - GET /v3/application/users/{user_id}/shops to get shop info
   - Picks the FIRST shop (operator has one Etsy shop: DagsThreads)
   - Updates settings:
       etsy_user_id, etsy_shop_id_oauth (BIGINT, distinct from Plan 3's text version),
       etsy_access_token, etsy_refresh_token, etsy_token_expires_at
   - Clears OAUTH_PKCE cookie
   - Redirects to /settings?etsy=connected
```

### Token refresh

`lib/etsy/oauth-client.ts` exports `getEtsyAccessToken()`:

```
1. Load settings.etsy_*
2. If access token missing → throw EtsyAuthNotConnected
3. If expires_at > NOW() + 60s → return current access_token
4. Else: POST oauth/token with grant_type=refresh_token, refresh_token, client_id
   - 200: parse new access_token, refresh_token (Etsy rotates both), expires_in
     Update settings with new values + new expires_at
     Return new access_token
   - 401/400 invalid_grant: clear all 5 token columns, throw EtsyAuthExpired
   - 5xx: throw retryable error (caller's retry-once will handle)
```

Called at the top of every Etsy write call. Single source of truth for "is the operator's Etsy connection live."

### Disconnect

`POST /api/etsy/oauth/disconnect` clears all 5 token columns in one DB update. Etsy doesn't have a revoke endpoint; we just stop using the tokens. UI flips back to "Connect Etsy shop" state.

### Token storage

Tokens stored as plaintext in the DB. Reasoning:
- Neon already encrypts at rest
- Vercel functions don't have a stable place to keep an app-side master key without burning it into env vars (which leak via team access)
- The token grants only `listings_w` scope; worst-case compromise can edit but not delete listings or read buyer data
- App-layer encryption can be added later via a `crypto_key` env var and AES-GCM if compliance requires

## 6. Base Photo Library (one-time setup)

### 6 base photos, generated via Recraft V3

`scripts/generate-base-photos.ts`:

```
Reads RECRAFT_API_KEY from .env.local.
For each prompt:
  if public/mockup-bases/{id}.png exists → skip (idempotent)
  Recraft V3 generate, style=realistic_image, size=2048x2048
  Download PNG, save to public/mockup-bases/{id}.png
Total: 6 calls × ~$0.04 = ~$0.24
```

**The 6 prompts** (committed in `scripts/generate-base-photos.ts` for reproducibility):

| id | Color   | Style          | Prompt summary                                              |
|----|---------|----------------|-------------------------------------------------------------|
| 1  | white   | flat-lay       | White tee laid flat on beige linen, top-down, soft light    |
| 2  | black   | flat-lay       | Black tee laid flat on light oak wood, top-down, soft light |
| 3  | white   | on-model       | Young adult, white tee + jeans, coffee shop bokeh           |
| 4  | black   | on-model       | Young adult, black tee, urban brick wall, golden hour       |
| 5  | white   | hanger         | White tee on wooden hanger, off-white wall                  |
| 6  | heather | folded         | Heather grey tee loosely folded, soft natural background    |

All prompts end with: "no design, no graphic, no print, blank tee, product photography, high resolution"

### Calibration

Each generated photo needs a "where the design overlays" rectangle. After generation:
1. Operator opens each PNG in an image editor (or our app — could add a calibration UI later)
2. Eyeballs the print area: x, y of top-left + width + height (in pixels on the 2048×2048 base)
3. Records in `lib/mockups/manifest.ts` (or `public/mockup-bases/manifest.ts`)
4. ~5 min per photo = 30 min total one-time

Manifest shape:

```ts
export type MockupBase = {
  id: number;
  file: string;          // /mockup-bases/{id}.png
  color: 'white' | 'black' | 'heather';
  style: 'flat-lay' | 'on-model' | 'hanger' | 'folded';
  printArea: { x: number; y: number; w: number; h: number };
  rotation?: number;     // degrees, default 0 — non-zero for tees rotated in the photo
  altText: string;       // for Etsy SEO, includes color + style
};
```

Coords are static. If a base photo is regenerated or replaced, calibration must be re-done. Manifest file header comments this rule prominently.

## 7. Composite Pipeline

### `lib/mockups/compose.ts`

```ts
export async function composeMockup(
  designBlobUrl: string,
  base: MockupBase,
): Promise<Buffer> {
  // 1. Fetch design PNG (3000×3600, transparent bg)
  const designResp = await fetch(designBlobUrl);
  const designBuffer = Buffer.from(await designResp.arrayBuffer());

  // 2. Resize to fit base's print area, preserving aspect ratio
  const resizedDesign = await sharp(designBuffer)
    .resize(base.printArea.w, base.printArea.h, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .rotate(base.rotation ?? 0, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // 3. Pick blend mode based on base tee color
  const blend = base.color === 'white' ? 'multiply' : 'screen';
  // multiply: design's white pixels become invisible over tee (perfect for dark designs on white tees)
  // screen: design's dark pixels become invisible over tee (perfect for light designs on dark tees)

  // 4. Composite design onto base photo
  const baseFile = path.join(process.cwd(), 'public', base.file);
  const composite = await sharp(baseFile)
    .composite([
      {
        input: resizedDesign,
        top: base.printArea.y,
        left: base.printArea.x,
        blend,
      },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  return composite;
}
```

**Why `multiply` (light tee) and `screen` (dark tee):**
- Our designs are typography PNGs with transparent backgrounds and the design as dark text on transparency
- On a white tee: `multiply` makes the transparent (or white) pixels become invisible against the white tee, only the text shows
- On a dark tee: design text is dark, which `multiply` would erase against the dark tee. `screen` inverts this — dark pixels become invisible, light pixels show. This works correctly when the design has light/white text, but the operator must ensure designs published to dark tees have light text. Documented as an operator responsibility.

**Memory:** ~50MB peak per composite. 6 in parallel = ~300MB. Well under Vercel's 1024MB default.

**Output size:** ~300-500KB per JPEG. 6 × 500KB = 3MB total transfer per listing. Etsy's image upload accepts up to 10MB per image.

### `lib/mockups/upload-to-etsy.ts`

```ts
export async function uploadEtsyListingImage(opts: {
  accessToken: string;
  shopId: number;        // BIGINT from OAuth
  listingId: string;
  imageBuffer: Buffer;
  filename: string;
  rank: number;          // 1..10
  altText: string;
}): Promise<{ listingImageId: number; url: string }> {
  const apiKey = process.env.ETSY_API_KEY!;
  const sharedSecret = process.env.ETSY_SHARED_SECRET!;

  const form = new FormData();
  form.append('image', new Blob([opts.imageBuffer], { type: 'image/jpeg' }), opts.filename);
  form.append('rank', String(opts.rank));
  form.append('alt_text', opts.altText);
  form.append('overwrite', 'false');

  const url = `https://openapi.etsy.com/v3/application/shops/${opts.shopId}/listings/${opts.listingId}/images`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'x-api-key': `${apiKey}:${sharedSecret}`,
      // Do NOT set content-type; FormData adds boundary automatically
    },
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new EtsyUploadError(resp.status, body);
  }
  const json = await resp.json();
  return { listingImageId: json.listing_image_id, url: json.url_fullxfull };
}
```

**Important:** the `x-api-key` header still requires `keystring:shared_secret` format even for OAuth-authenticated requests (verified during Plan 3). Both headers required.

## 8. Endpoint Spec

### `POST /api/listings/[id]/photos`

```
Auth: session cookie (existing middleware)
Body: none
Query: ?force=true bypasses photos_uploaded_at idempotency check

Steps:
1. Load listing by id
   404 if not found
   400 if listing.etsy_listing_id is null ("Listing not yet on Etsy")
   400 if listing.status != 'live' ("Listing not live")
   409 if listing.photos_uploaded_at is set and !force
2. Load design (for imageBlobUrl)
   400 if design.imageBlobUrl is null
3. Load settings (for OAuth tokens + shop_id)
   400 if etsy_access_token is null ("Etsy not connected")
4. Get fresh OAuth token (auto-refresh):
   401 if refresh fails (token revoked, etc.)
5. For each of MOCKUP_BASES (parallel composites, sequential uploads):
   composite = await composeMockup(design.imageBlobUrl, base);
   try {
     await uploadEtsyListingImage({ ..., rank: base.id, ... });
     uploadedCount++;
   } catch (err) {
     if 401 → refresh token once, retry once
     if 429 → wait 5s, retry once
     if 5xx → wait 2s, retry once
     else → record reason, continue
   }
6. Update listings:
   photos_uploaded_at = NOW()
   photos_count = uploadedCount
   photos_failure_reason = (if any failures) "uploaded N/6: ..."
7. Log generation_event {type: 'generated', kind: 'mockups_uploaded', payload: { count: N, failures: [...] }}
8. Return 200 { ok: true, uploadedCount, failures: string[] | undefined }

Function maxDuration: 60 (default). Typical runtime ~15-18s.
```

### `POST /api/etsy/oauth/start`

```
Generates state + code_verifier + code_challenge.
Stores state + verifier in signed httpOnly cookie (5 min TTL).
Returns { redirectUrl } pointing at Etsy authorize.
Client navigates there.
```

### `GET /api/etsy/oauth/callback`

```
Validates state cookie matches query param.
Exchanges code for access_token + refresh_token at Etsy token endpoint.
Parses user_id from access_token prefix.
Fetches shop_id via Etsy users/{user_id}/shops.
Persists tokens to settings.
Redirects to /settings?etsy=connected (or ?etsy=error&reason=... on failure).
```

### `POST /api/etsy/oauth/disconnect`

```
Auth: session cookie.
Clears all 5 etsy_* token columns in one DB update.
Returns 200 { ok: true }.
```

## 9. Data Model

Migration `0004_etsy_oauth_and_photos.sql`:

```sql
-- OAuth credentials (5 columns on settings, all null initially)
ALTER TABLE settings ADD COLUMN etsy_user_id BIGINT;
ALTER TABLE settings ADD COLUMN etsy_shop_id_oauth BIGINT;
ALTER TABLE settings ADD COLUMN etsy_access_token TEXT;
ALTER TABLE settings ADD COLUMN etsy_refresh_token TEXT;
ALTER TABLE settings ADD COLUMN etsy_token_expires_at TIMESTAMPTZ;

-- Per-listing upload status
ALTER TABLE listings ADD COLUMN photos_uploaded_at TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN photos_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE listings ADD COLUMN photos_failure_reason TEXT;

-- Partial index makes the cron's "pending photos" query cheap as table grows
CREATE INDEX idx_listings_pending_photos
  ON listings(status, photos_uploaded_at, created_at)
  WHERE status = 'live' AND photos_uploaded_at IS NULL;
```

`etsy_shop_id_oauth` is intentionally distinct from the existing `etsy_shop_id` (TEXT — used by Plan 3 Etsy Open API for public reads). The OAuth shop_id is the BIGINT Etsy uses internally; reads use the public string identifier. Keeping them separate avoids ambiguity.

## 10. UI Surface

### `/settings` — modified

New "Etsy connection" section above the existing Caps section:

**Disconnected state:**
```
┌─ Etsy connection ─────────────────────────────────────┐
│ Not connected. Connect Etsy to upload extra mockup    │
│ photos to your listings automatically.                │
│ [Connect Etsy shop →]                                 │
└───────────────────────────────────────────────────────┘
```

**Connected state:**
```
┌─ Etsy connection ─────────────────────────────────────┐
│ Connected as DagsThreads (shop_id 65981312)           │
│ Token expires in 47 min (auto-refreshed)              │
│ [Disconnect]                                          │
└───────────────────────────────────────────────────────┘
```

### Dashboard — modified

If `settings.etsy_access_token IS NULL` AND at least one listing has `status='live'`:

```
┌────────────────────────────────────────────────────────┐
│ ⚠ Connect Etsy to add extra photos to your listings.  │
│ Existing live listings will be backfilled automatically. │
│ [Open settings]                                        │
└────────────────────────────────────────────────────────┘
```

Banner is dismissable but reappears on every dashboard load until connected.

### `/listings` page — modified

Each row gets a photo column showing:
- `✓ N photos` (green) if `photos_uploaded_at` is set
- `↑ Add photos` button if listing is `live` + `photos_uploaded_at IS NULL` + Etsy connected
- `· no photos` (grey, no action) if listing is `publishing` / `publishing_slow` / `failed`
- `⚠ N/6 photos · retry` (amber) if `photos_failure_reason` is set

Clicking `↑ Add photos` POSTs `/api/listings/[id]/photos`. Same endpoint as the modal trigger. Page refreshes to show updated state.

### Publish modal — modified

New status `uploading_photos`. Sequence after publish:

```
publishing → live → uploading_photos → live_with_photos

Modal UI for uploading_photos:
  Spinner with "Uploading 6 mockup photos to Etsy…"
  Caption: "About 15 seconds. Safe to close — backfill cron picks up if interrupted."

If status was 'queued' (not yet on Etsy):
  Skip photo upload step.
  Caption: "Photos will be uploaded once Etsy receives the listing (within ~6 hours via cron)."
```

If photo upload fails entirely: modal shows `photos_pending` state with retry button + link to `/listings`.

## 11. Cron Reconciliation

Existing `/api/cron/reconcile` route gets a new pass at the bottom:

```
// After reconciling stuck publishing → live transitions:

const pendingPhotos = await db.select()
  .from(listings)
  .where(and(
    eq(listings.status, 'live'),
    isNotNull(listings.etsyListingId),
    isNull(listings.photosUploadedAt),
    gt(listings.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),  // don't backfill > 7 days old
  ));

for (const l of pendingPhotos) {
  if (!settings.etsy_access_token) break;  // not connected, skip
  try {
    // Call the same composite + upload pipeline used by the route
    await processListingPhotos(l.id);
  } catch (err) {
    // Don't fail the whole cron run if one listing fails
    await logEvent({ type: 'publish_failed', designId: l.designId, payload: { kind: 'mockup_upload', reason: err.message } });
  }
}
```

Limits:
- Only listings <7 days old (avoid endless backfill on stale data)
- Sequential processing (one listing at a time to respect Etsy rate limits)
- Caught errors don't abort the cron run

## 12. Safety, Caching, Failure Handling

### Hard safety constraints

| Constraint | Enforcement |
|---|---|
| No double-upload | `photos_uploaded_at IS NULL` check; 409 if already set; `?force=true` only used for explicit re-runs |
| No upload before Etsy listing exists | `listing.etsy_listing_id IS NOT NULL` check; 400 if not |
| No upload without Etsy connection | `settings.etsy_access_token IS NOT NULL` check; 400 if not |
| Hard 6-photo cap (Etsy max 10 minus Printify's 1 minus 3 headroom) | Iteration over `MOCKUP_BASES`, which has 6 entries |
| OAuth state CSRF | State cookie must match callback query param |
| Tokens never leaked in API responses | `JSON.stringify` of listing/settings never includes `etsy_*_token` columns |
| Tokens never logged | Sensitive fields explicitly redacted in event payloads |

### Per-upload failure handling

- 5xx → retry once with 2s backoff
- 429 → retry once with 5s backoff
- 401 → force token refresh, retry once
- 4xx (other) → fail-fast, record reason, continue with other uploads

### Per-listing aggregate

- 6/6 succeed: photos_uploaded_at set, photos_count=6, photos_failure_reason=NULL
- 1-5 succeed: photos_uploaded_at set, photos_count=N, photos_failure_reason="uploaded N/6: failures: [...]"
- 0/6 succeed: photos_uploaded_at stays NULL, photos_failure_reason set, cron retries tomorrow

Partial success is explicitly allowed — better to have 4 photos than 0.

### Observability

- Every Etsy API call logs to `generation_events` with type='generated' or 'publish_failed' and payload.kind in {'mockup_upload', 'etsy_oauth_callback', 'etsy_oauth_refresh'}
- `/listings` page photo column gives at-a-glance signal
- Vercel function logs remain primary debug surface for OAuth flows

### Cost & rate-limit budget

- **One-time:** ~$0.24 (6 Recraft images, generated once)
- **Per listing:** $0 (composites are local sharp, no per-listing API cost)
- **Etsy API quota:** 6 uploads × 20 listings/day = 120 calls/day. <3% of the 5,000 QPD free-tier quota.
- **Storage:** 6 base PNGs × ~2MB = ~12MB committed to git; well under GitHub's 100MB file size cap

## 13. Testing Strategy

### Unit tests (Vitest, mocked)

- **OAuth PKCE generation:** state is 32+ random bytes, code_verifier is 64+ chars, code_challenge is sha256(verifier) base64url
- **Token refresh:** returns current token if fresh; refreshes if within 60s of expiry; clears tokens + throws on 401 from Etsy
- **composeMockup:** returns JPEG buffer of expected dimensions; uses `multiply` blend for white base, `screen` for dark; resize preserves aspect ratio with `fit:contain`
- **uploadEtsyListingImage:** builds correct multipart body, includes Bearer + x-api-key headers, parses listing_image_id from response, throws EtsyUploadError on non-2xx

### Integration tests

- None against live Etsy in CI (don't burn quota or rate-limit-flag the account)
- Mocked-fetch fixtures for happy path, 401 token refresh, 429 retry, 4xx failure

### Manual smoke (one-time after deploy)

1. `/settings` → Connect Etsy → OAuth flow → confirm shop name appears
2. Generate small test batch → approve+publish through modal
3. After publish succeeds, modal should show "Uploading photos…" then "Listed with 7 photos"
4. Open Etsy listing in browser → confirm 7 photos in the grid (1 Printify + 6 ours)
5. Disconnect Etsy → confirm banner appears on dashboard
6. Reconnect → confirm token re-issue + connected state shown

## 14. Configuration & Environment

No new env vars beyond what's already in place.

Tunables in code (constants, not env-driven):
- `MOCKUP_BASES` count and printArea coords (lib/mockups/manifest.ts)
- `MAX_PHOTOS_TO_UPLOAD = 6` (hard cap)
- Token refresh buffer (60 seconds before expiry)
- Retry counts and backoff intervals

Etsy app config (one-time, in Etsy developer dashboard):
- Add production redirect URI: `https://tshirt-generator-one.vercel.app/api/etsy/oauth/callback`
- Add local-dev redirect URI: `http://localhost:3000/api/etsy/oauth/callback`

## 15. Success Criteria

- Operator connects Etsy shop via `/settings` in <1 minute (one-time)
- Every newly published listing reaches 7 photos within ~30s of going live, with no manual intervention
- Existing live listings without photos get backfilled by the next cron run (within 24h)
- Etsy "low search visibility — add more photos" warning disappears from every listing
- Token refresh is transparent; operator doesn't see "reconnect" prompts unless they explicitly disconnect or revoke from Etsy's side
- Failure modes degrade gracefully: partial photo sets > zero, cron retries the rest

## 16. Open Questions / Decisions Deferred to Implementation

1. **Calibration UI vs hardcoded coords.** v1 hardcodes printArea per base photo in `manifest.ts`. A future calibration page (visual drag-to-position) is a natural follow-up but adds complexity now.
2. **Per-design / per-niche mockup selection.** All listings get the same 6 bases for v1. If sales data shows certain mockup styles convert better, add per-niche selection later.
3. **App-layer token encryption.** Tokens stored plaintext in DB; Neon at-rest encryption is the only protection. Add AES-GCM via a `crypto_key` env var if compliance requires.
4. **Animated mockups / videos.** Etsy supports 1 video per listing. Out of scope for v1.
5. **Live composite preview in publish modal.** Operator can't see what the 6 mockups will look like before publishing. Adds UI complexity; defer until needed.
6. **Re-generation of base photos.** If the operator wants to refresh the photo library (e.g., new season's aesthetic), the script is re-runnable but they must re-calibrate. A small "regenerate" affordance in `/settings` could trigger this, but it's not in v1.
