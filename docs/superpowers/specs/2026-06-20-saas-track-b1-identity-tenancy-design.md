# Design: SaaS Track — Phase B-1: Identity & Tenancy Substrate

**Date:** 2026-06-20
**Status:** Approved (user: "start work on the B level real infrastructure")

## The B roadmap (context)

From the 2026-06-20 product review, Path B (sell the tool) is gated on, in order:

- **B-1 Identity & tenancy substrate** ← this spec
- **B-2 Query scoping + per-user integrations** (every read/write scoped to the session user; Printify key + Etsy tokens move fully per-user; per-user master product)
- **B-3 Billing & metering** (Stripe subscriptions, plan entitlements wired into the existing caps system, AI usage metering)
- **B-4 Onboarding & safety** (guided connect→master→first-publish flow; enforced content-safety gating + ToS/DMCA)

Each phase ships without breaking the running single-operator app. B-1 lays the
substrate: real users, real login, and ownership columns — while the app keeps
behaving exactly as today for the founder.

## B-1 Goal

1. A `users` table and real per-user auth (email + password) replacing the
   single shared `APP_PASSWORD` — with a compatibility path so the current
   operator/login/GitHub-Actions flows keep working.
2. Ownership (`user_id`) columns on the tenant-root tables, backfilled to the
   founder, so B-2's query scoping is a mechanical change.

## Decisions (made, not deferred)

- **Auth: email + password, first-party.** `bcryptjs` hashing (pure JS — no
  native deps, works on Vercel Node runtime), sessions stay on the existing
  `jose` cookie (payload gains `sub: userId`, `email`). No Auth.js/Clerk yet —
  the session plumbing already exists and works; vendor auth is a B-4+ option.
- **Private-beta registration.** `POST /api/auth/register` requires a
  `SIGNUP_CODE` (env) to match — open signup is a launch decision, not an
  infra one. No email verification in B-1 (needs an email provider — B-4).
- **Founder compatibility.** The legacy `APP_PASSWORD` login keeps working and
  transparently maps to the founder user (auto-provisioned on first use from
  `FOUNDER_EMAIL` env, fallback `founder@example.com`). Existing sessions stay
  valid (verifier treats legacy payloads as the founder). GitHub Actions
  scripts (login-with-password) therefore keep working unchanged.
- **Tenancy columns: nullable + backfilled, enforced in code.** `user_id` uuid
  FK added to `batches`, `listings`, and `settings`; backfilled to the founder
  in the same migration; left nullable so the migration is non-destructive and
  reversible. NOT NULL tightening happens in B-2 after all writes set it.
  `designs` inherit tenancy through `batch_id` (no direct column — avoids
  double-bookkeeping; B-2 scopes design queries via joins).
- **`settings` becomes per-user by row, not by table.** Keep the table; drop
  the "id=1 singleton" *convention* in favor of `getSettingsForUser(userId)`
  which falls back to the legacy row (id-1-style first row) when the user has
  none — founder keeps their existing config with zero data movement.

## Schema

```ts
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('member'), // 'founder' | 'member'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
// + user_id uuid REFERENCES users(id) on batches, listings, settings (nullable)
```

Migration also: `INSERT` nothing (founder is provisioned at runtime — schema
only). Backfill runs as a follow-up statement once the founder exists — via
`ensureFounderUser()` which, on creating the founder, claims all orphaned
(`user_id IS NULL`) rows.

## Auth flows

- `POST /api/auth/register` `{email, password, signupCode}` → validates code,
  hashes (bcrypt, cost 10), creates user, sets session. 409 on duplicate email.
- `POST /api/auth/login` `{email?, password}` —
  - email present → per-user credential check.
  - email absent + password === `APP_PASSWORD` → legacy founder path:
    `ensureFounderUser()` then session as founder. (Backwards compatible with
    every existing caller, including scripts/publish-batch.mjs.)
- Session JWT payload: `{ sub: userId, email, v: 2 }`. `verifySession` returns
  `{ userId, email }`; legacy v1 payloads (no sub) resolve to the founder user
  (lazy-provisioned) instead of being invalidated.
- `requireUser()` server helper: reads cookie → verified `{userId}` or null;
  route handlers use it in B-2 for scoping. In B-1 it exists + is tested but
  only wired where writes create ownership (new batches/listings stamp
  `user_id`).
- Login page gains an email field (optional — blank email = legacy mode) and a
  registration link/page. Print Shop styling.

## What B-1 explicitly does NOT do (B-2+)

- No read-query scoping (all users would still *see* founder data — acceptable
  because registration is signup-code-gated to just the founder for now).
- No per-user Printify key / Etsy tokens / master product (still env + settings
  fallback row).
- No billing, no plans, no metering.
- No email verification / password reset (needs email provider).

## Error handling

- Register: zod-validated body; generic 401 on bad signup code (don't leak
  whether the code exists); 409 duplicate email.
- Login: uniform 401 for bad email/password (no user enumeration).
- `ensureFounderUser` is idempotent (unique email; on-conflict returns row).

## Testing

- Unit: password hash/verify roundtrip; session create/verify with userId;
  legacy-payload → founder resolution; register/login route logic at module
  boundary (mock db) — duplicate email, bad code, legacy path.
- Existing suite must stay green (proves single-operator behavior unchanged).
- Manual: legacy login still works in prod after deploy; new register+login
  works; new batch rows carry `user_id`.

## Success criteria

- A new user can register (with the signup code) and log in with their own
  credentials; the founder's existing login and all automation keep working
  untouched.
- `users` exists; `batches`/`listings`/`settings` rows have `user_id`
  backfilled to the founder; new writes stamp ownership.
- Zero behavior change for the running shop. All tests green.
