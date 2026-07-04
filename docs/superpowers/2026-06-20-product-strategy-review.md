# Product & Code Review — from personal tool to money-making app

**Date:** 2026-06-20
**Framing:** The goal shifted from "publish my own tees" to "an app people use to build/submit tees to sell online, that itself makes money." This review is honest about the gap.

## 1. The fork you're actually choosing between

There are two very different "make money" businesses hiding in one repo:

**A) Operator business — you run a POD shop with this tool as your unfair advantage.**
Revenue = your Etsy sales. You already have ~30 live listings. Zero new engineering to make more money — just more designs. Lowest risk, closest to cash, this month.

**B) SaaS product — you sell the tool to other POD sellers.**
Revenue = subscriptions/usage from users. This is a real startup: multi-tenancy, billing, support, marketing, and a crowded field of incumbents (Vela, Alura, PODturbo, Flying Upload, PrettyMerch, eRank…). Bigger ceiling, far riskier and slower.

**Recommendation: do A first, explicitly, then sell B off the proof.** The single highest-ROI move right now is to scale *your own* shop to a few hundred listings and instrument what sells — not to build SaaS plumbing for customers who haven't paid you yet. "I built a system that took my shop from 0 → $X/mo, here it is" is a far easier product to sell than a cold tool. The code is ready for A today; it is far from ready for B.

The rest of this doc treats A as the near-term money and B as the option you're de-risking.

## 2. Honest economics (this is the crux)

The current stack quietly assumes **one operator on free tiers**, and that assumption breaks the moment the app has real usage — even your own at volume:

- **AI rate limits are already the bottleneck.** We spent this session fighting Gemini free-tier 429s (they hung `checkSafety` and 504'd every publish). One operator already saturates the free tier. Many users, or you at 100s/day, will not fit. A managed-AI SaaS *must* meter and pass through cost.
- **Image generation costs real money.** Recraft V3 ≈ $0.04/image. At scale that's a COGS line. Any pricing must clear AI + image cost with margin, or you lose money per user.
- **Vercel Hobby can't run this as a product.** It won't execute Workflow-DevKit runs or reliable crons (why we moved to GitHub Actions — a personal-scale hack, not a per-user product mechanism). A product needs Vercel Pro+ (or another runtime) for workflows, crons, and compute.

Takeaway: for A, the free tiers are fine if you pace yourself. For B, **unit economics and cost control are a first-class feature, not an afterthought.**

## 3. What's genuinely strong (keep/lean on these)

- **The integrated pipeline is the actual asset**: slogan → design → AI listing copy → competitive price → reliable Printify→Etsy publish → mockup top-up → reconcile. Most competitors do *one* slice; end-to-end idea→live-listing is a real angle.
- **The reliability engineering is good**: `classifyStuckPublish`, the reconcile cron, orphan-prevention (`onProductCreated`), 429 backoff, silent-failure visibility. This was hard-won and is a moat *if* it holds at scale.
- **The codebase is clean for its size**: focused `lib/` modules, dependency-injected orchestrators, pure testable helpers, 141 tests, real conventions in CLAUDE.md. Not spaghetti — a good foundation.
- **"Master product = single source of truth"** is an elegant model for one shop.

## 4. What blocks the product (B), ranked

1. **Single-tenancy is baked deep.** 11 tables, none scoped to a user. `settings` is one row (`id=1`) holding *the* master product, *the* Etsy tokens, *the* caps. Printify key is one env var. Auth is one shared password. Becoming multi-user means: a `users` table, `userId` FK on every domain table + query, per-user Printify/Etsy connections (keys/tokens move out of env/singleton into per-user records), and real per-user data isolation. This is the largest single lift.
2. **No billing.** Nothing for Stripe/subscriptions/metering exists. Needs plans, checkout, entitlement checks, and usage counters wired into the caps system (which already exists per-operator — good starting point).
3. **AI cost control & per-user rate limiting** (see §2). Must gate generation by plan + budget, and likely offer paid image models.
4. **IP / trademark liability at scale.** Users *will* submit infringing designs (brands, celebrities, characters). Automating their publish under *your* Printify/Etsy API access is genuine exposure — DMCA, Etsy/Printify account bans, revoked API access. Today's `checkSafety` is advisory (and we just saw it can be bypassed/timed-out). A product needs: enforced safety gating, ToS + DMCA process, and probably human review for flagged items.
5. **Platform ToS risk.** Etsy actively polices mass-automation and duplicate/spam listings; Printify similarly. A tool that *encourages volume* lives in a gray zone. Build with per-user rate discipline and quality gates, not raw throughput.
6. **Onboarding doesn't exist.** The app assumes the operator manually connected Printify, connected Etsy, and picked a master. A new user needs a guided "connect → pick shirt → first publish" flow.

## 5. The retention feature you're missing (matters for both A and B)

**A sales-feedback loop.** Nightly pull Etsy stats (views/favorites/orders) per listing → rank designs → auto-act: re-price winners, draft "more like this," archive dead listings. This is idea #2 from the June-10 retrospective and it's the difference between a one-shot generator and a compounding money engine. For A it directly grows your revenue; for B it's the sticky feature sellers pay to keep (insight into *what makes money*, not just more output).

## 6. Sharpen the wedge (the market is crowded)

Broad "AI POD tool" loses to incumbents. Win by narrowing:
- **Niche down** to a vertical you've validated (you have live cat/dog data) — "the fastest way to spin up quote/niche tees that match proven sellers."
- **Trend-to-tee speed** — auto-generate from trending keywords/seasonal calendar faster than anyone. Speed-to-market is a genuine POD edge.
- **Reliability as the promise** — "publishes correctly with all colors/sizes/mockups, or it self-heals" — but only claim this once it's bulletproof at scale.

## 7. Suggested sequence

- **Phase 0 — this month, real money (Path A):** scale your own shop to 100–300 listings with the current tool; add the sales-feedback loop; double down on winners. Prove per-listing ROI. No multi-tenancy needed.
- **Phase 1 — validate B before building it:** landing page + waitlist; talk to 10 POD sellers; offer concierge (run it for them manually) to test willingness to pay. Don't build SaaS infra until someone commits money.
- **Phase 2 — if validated, build the product:** multi-tenancy (users + `userId` everywhere + per-user integrations), Stripe billing + entitlements, per-user AI metering & paid image models, Vercel Pro, IP guardrails + ToS/DMCA.
- **Phase 3 — moat:** analytics/insights product, trend-to-tee, curated niche packs, mockup/video for social.

## 8. Concrete near-term code improvements (independent of A/B)

- **Ship the sales-feedback loop** (highest business ROI; reuses the Etsy OAuth + events tables already present).
- **Make `checkSafety` enforceable and fast** — we bounded it to not hang, but a money product needs it reliable, not skippable; consider a cheaper/faster classifier or a cached ruleset for common infringements.
- **Split the publish endpoint** into clone/publish/poll sub-steps (each <60s) so it survives free-tier limits without the durable workflow — makes GitHub-Actions batch publishing robust and removes the 26s-single-call fragility.
- **Persist the workflow/publish `runId`** and guard double-triggers (flagged in the workflow review) — needed before any concurrent/multi-user use.
- **Add a thin `users`/ownership layer even for A** (a single row is fine) so the eventual multi-tenant migration isn't a rewrite — cheap insurance if B is remotely likely.

## Bottom line

The pipeline works and is well-built — that's the hard part and it's done. The nearest money is *you* using it to run a real shop (Path A), which needs no new architecture. Turning it into an app *others* pay for (Path B) is a genuine startup gated by multi-tenancy, billing, AI-cost economics, and IP/platform risk — worth pursuing only after you've proven the pipeline mints money for one shop (yours) and that other sellers will pay for that outcome.
