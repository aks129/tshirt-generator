# Retrospective, Learnings & Revenue Roadmap

**Date:** 2026-06-10 · **Span reviewed:** 2026-05-12 → today (135 commits, 6 specs, 6 plans, PR #3 open)

## 1. What was built (4 weeks)

| Phase | Dates | Shipped |
|-------|-------|---------|
| Foundation + Generation | May 12 | Auth, Drizzle/Neon schema, batches/review queue, AI concept expansion (Gemini), canvas bulk generator |
| Publishing | May 12–13 | Printify clone-from-master pipeline, publish modal w/ AI listing copy, listings page, reconcile cron |
| Competitive pricing | May 13 | Etsy search scraper (cheerio + JSON-LD), price stats → recommendation, settings floor/offset, modal integration |
| Mockup photos | May 13–18 | Etsy OAuth (PKCE), photo top-up (9 extra mockups per listing), Recraft+sharp custom mockups, AI-unique scenes |
| Hardening + ops | May 18–June 4 | Groq fallback, AI health/insights, theme packs, caps, settings restore, Vercel Workflow AI generation, batch "Publish all" |
| Publish reliability | June 4–8 | Root-caused silent Etsy publish failure; SCP forwarding; `classifyStuckPublish` + cron failure visibility; 429 backoff. **PR #3.** |

## 2. The three reported issues are ONE root cause (plus one unverified follow-on)

> 1. *Default sizes/colors/mockups don't transfer to Etsy*
> 2. *New products stuck unpublished in Printify with no visible errors*
> 3. *On Etsy: only 1 color, wrong sizes/mockups*

**Diagnosis (evidence-backed):**
- The configured master is a **Printify Studio personalization product** (`sales_channel_properties.personalisation`, `strategy: "pstudio"`). Clones of it enter a state Printify cannot publish to Etsy: `publish.json` returns 2xx, the product unlocks, `external` stays null, and the only error is a generic "Unexpected error" in the Printify dashboard. → That **is** issue #2, verbatim.
- Issues #1/#3 are downstream: any Etsy listing that did appear came from a partial/broken publish of these clones (or manual action), so variants/mockups are incomplete. The code is *not* the culprit here: `publishProduct` already requests `{title, description, images, variants, tags: true}` and `createProductFromMaster` clones **all** enabled variants with per-variant prices.
- Residual risk if a plain master still shows 1 color: Printify's **store-level Etsy publish settings** ("what to publish" toggles) can override per-publish flags — check those in the Printify dashboard, not the code.

**Status: fix is code-complete (PR #3) but UNVERIFIED end-to-end.** The one thing no code can do: create the clean plain master (operator step, ~15 min).

## 3. Learnings

### Technical
1. **Printify managed publish fails silently by design.** API gives 2xx + unlock + null `external`; real errors live only in the dashboard. Any POD automation MUST treat "accepted" ≠ "published" and verify `external` itself.
2. **Personalization (pstudio) products are clone-poison.** Master must be a plain product, published to Etsy once manually to prove its category/shipping config.
3. **"Master product as single source of truth" was the right architecture** — one Printify-side edit point for colors/sizes/prices/mockups, zero per-variant code.
4. **Platform limits shaped everything:** Vercel 60s → 5s poll + `publishing_slow` + cron reconcile; Printify 1-mockup auto-publish → Etsy OAuth photo top-up; rate caps (200 publishes/30min, Etsy QPS/QPD) → 429 backoff.
5. **Free-tier AI stack works:** Gemini primary + Groq silent fallback = ~0 LLM cost; Recraft V3 is the only paid generation.
6. **Vitest fake-timer rejection ordering** (attach `.rejects` handler *before* `runAllTimersAsync`) — bit us once, CI-breaking; now a pattern.
7. **CodeQL on React attributes** false-positives (`js/xss-through-dom` on `<img src>`); dismiss-with-reasoning beats sanitizer-chasing.

### Process
8. **Dogfooding found what tests never could.** 111 green tests while the core business flow was broken — the blocker was a *data/config* state (pstudio master) invisible to mocked tests. Lesson: per milestone, one real E2E publish > more unit tests.
9. Spec → plan → subagent-per-task with two-stage review produced consistently clean diffs and caught a CI-breaking bug pre-merge.
10. **No staging environment** (prod Neon DB only, prod Printify/Etsy) makes every test a production event. Acceptable at this scale, but the smoke-test-first discipline is mandatory.
11. Feature work was lost twice to refactors → reconcile audits recovered it. Push more often; PR earlier.

### Business
12. Zero revenue to date is **one operator step away** from being testable — nothing else blocks listing #1.
13. Etsy is a search market: title/tags/price + mockup quality decide sales, and we already auto-generate all four. The differentiator vs manual sellers is *iteration speed*, which is exactly what got built.

## 4. Critical path to first income (do in this order)

1. **[Operator, 15 min] Create plain master in Printify** — standard blueprint (e.g. Comfort Colors 1717 / Bella+Canvas 3001), pick colors/sizes/prices/mockups, NO personalization → set Etsy category+shipping → **publish it to Etsy once manually** → select in `/settings`. Also verify store-level Etsy publish settings sync variations/images.
2. **[Smoke] Publish ONE design** via the modal → on Etsy verify: all colors, all sizes, per-variant prices, 10 mockups. This single test verifies issues #1+#2+#3 and the SCP code (§2 of PR #3).
3. **Merge PR #3** once smoke passes.
4. **"Publish all"** the remaining cat-lover tees (5 → 20). Caps in `/settings` must allow it.
5. Confirm next 06:00 UTC reconcile run reports clean (no stuck rows).

## 5. Innovative ideas (ranked by impact ÷ effort)

### Now (reliability → trust the pipeline)
- **A. Post-publish variant audit (high impact, ~1 day).** After a listing flips `live`, call Etsy `getListing`/`getListingInventory` with the OAuth token we already hold and **diff actual Etsy variations against the master's variants**. Mismatch → flag on `/listings` ("23/30 variants live"). This converts issue #3 from a manual-eyeball problem into an automated check, forever.
- **B. Preflight "master health" check (hours).** Extend `lib/preflight` to verify the master is non-pstudio, exists, and has ≥1 print area — block publish with a clear message instead of failing downstream. (The 404-master case already burned a session.)

### Next (scale 20 → 100/day)
- **C. Durable `publishBatch` Vercel Workflow.** Client-loop publishing caps out ~20 (tab must stay open). Port the already-pure `publishApprovedDesigns` orchestrator to a `'use workflow'` with per-design steps — survives closes, retries steps, scales to 100. The dep-injected design was built for exactly this port.
- **D. Sales feedback loop (the actual money idea).** Nightly cron pulls Etsy stats (views/favorites/orders) per listing into a `listing_stats` table → dashboard ranks designs → auto-action: re-run competitive pricing on winners, draft "more like this" briefs into the AI generator, archive losers after N days of zero views. Turns the generator from open-loop into a compounding optimizer.
- **E. Trend-reactive drops.** Feed Google Trends / Etsy search suggest into the niche library weekly; pre-scheduled seasonal calendar (Mother's Day, grad, Halloween) batches drafted 6 weeks ahead — POD sellers win on lead time.

### Later (new channels — the TikTok goal)
- **F. TikTok Shop via Printify.** Printify supports TikTok Shop as a sales channel. The clone-from-master pattern extends: same master, second shop ID, `sales_channel: tiktok`. Most of `lib/printify` is reusable; the publish/reconcile pattern (and its new failure-visibility machinery) ports directly. Prereq: TikTok Shop seller account + Printify connection. Do this only after Etsy publishes 20 cleanly — same silent-failure lessons will apply.
- **G. Auto video mockups for TikTok.** Image→short-video (slow zoom/pan over mockups + caption hook) per listing; TikTok listings with video massively outperform stills. Recraft scenes already exist as inputs.
- **H. Vision-QA gate.** Before publish, a multimodal check of the rendered design: text legible? contrast vs shirt color ok? spelling correct? Catches the embarrassing 1% at 100/day scale.

### Explicitly not now (YAGNI)
- Printify webhooks (polling suffices ≤100/day), direct-Etsy publishing (breaks auto-fulfillment), eRank paid API, buyer personalization (ironically — pstudio is what broke us), multi-shop/multi-tenant.

## 6. One-line summary

The factory is built and the failure modes are now visible; revenue is gated on a 15-minute Printify dashboard task, one smoke test, and then pressing the "Publish all" button we already shipped.
