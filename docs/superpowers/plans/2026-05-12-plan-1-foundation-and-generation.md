# T-Shirt Generator — Plan 1: Foundation + Generation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation and AI generation pipeline so the operator can submit a prompt, get N generated t-shirt designs, and review them in-browser — without yet integrating Printify or Etsy. Plan 2 will add publishing on top of this.

**Architecture:** Next.js 16 App Router on Vercel, single-user password gate, Neon Postgres via Drizzle ORM, Vercel Blob for image storage, Vercel Workflow for the durable generation pipeline. Image generation is hybrid: Claude produces SVG for typography designs (rasterized to PNG server-side), Recraft V3 produces PNGs for illustration and vintage styles.

**Tech Stack:** Next.js 16, TypeScript, Tailwind CSS, shadcn/ui, Drizzle ORM + Neon Postgres, Vercel Blob, Vercel Workflow (`@vercel/workflow`), Anthropic SDK, Recraft V3 API, `@resvg/resvg-js`, `sharp`, Zod, Vitest, pglite (for tests).

**Reference spec:** [`docs/superpowers/specs/2026-05-12-tshirt-generator-design.md`](../specs/2026-05-12-tshirt-generator-design.md)

**Scope of this plan (Plan 1):**
- Scaffold, deps, lint, TS
- Auth (password gate + session cookie)
- DB schema + migrations + seed data
- AI primitives: brief expander, content safety filter, SVG generator
- Recraft V3 client + image generation
- Image pipeline: rasterize, mockup, blob upload, background-removal fallback
- Caps: daily generation cap, daily budget cap, kill switch
- Generate batch workflow (Vercel Workflow)
- API routes: start batch, get batch, approve/reject/regenerate design
- UI: login, dashboard, generate page, review queue
- Local smoke test

**Out of scope for Plan 1 (covered in Plan 2):**
- Listing copy generation, Etsy field validators
- Printify integration (client, upload, product, publish)
- Publish workflow + reconciliation cron
- Listings page, Settings page UI
- Production deployment

---

## File Structure (Plan 1)

```
/
├── app/
│   ├── (app)/
│   │   ├── layout.tsx                       # Auth-gated shell
│   │   ├── page.tsx                         # Dashboard
│   │   └── batches/
│   │       ├── new/page.tsx                 # Generate UI
│   │       └── [id]/page.tsx                # Review queue
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   └── logout/route.ts
│   │   ├── batches/
│   │   │   ├── route.ts                     # POST = create batch
│   │   │   └── [id]/route.ts                # GET batch w/ designs
│   │   └── designs/[id]/
│   │       ├── approve/route.ts             # stub for Plan 1 (just flips status)
│   │       ├── reject/route.ts
│   │       └── regenerate/route.ts
│   ├── workflows/
│   │   └── generate-batch.ts                # Vercel Workflow
│   ├── layout.tsx
│   └── globals.css
├── middleware.ts                            # Auth gate
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── seed.ts
│   ├── auth/
│   │   └── session.ts
│   ├── ai/
│   │   ├── claude.ts
│   │   ├── brief-expander.ts
│   │   ├── content-safety.ts
│   │   └── svg-generator.ts
│   ├── images/
│   │   ├── rasterize.ts
│   │   ├── mockup.ts
│   │   └── bg-remove.ts
│   ├── recraft/
│   │   └── client.ts
│   ├── blob/
│   │   └── upload.ts
│   ├── caps/
│   │   └── enforcement.ts
│   ├── schemas.ts
│   └── events.ts                            # generation_events writer
├── components/
│   ├── ui/                                  # shadcn primitives
│   ├── DesignCard.tsx
│   ├── BatchStatusBadge.tsx
│   └── NicheChips.tsx
├── public/
│   └── tee-templates/
│       └── bella-canvas-3001-white.png
├── tests/
│   ├── setup.ts
│   ├── brief-expander.test.ts
│   ├── content-safety.test.ts
│   ├── svg-generator.test.ts
│   ├── rasterize.test.ts
│   ├── mockup.test.ts
│   ├── recraft-client.test.ts
│   ├── caps-enforcement.test.ts
│   └── auth-session.test.ts
├── drizzle.config.ts
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
├── .env.example
└── .env.local                               # gitignored
```

---

## Task 1: Scaffold Next.js 16 + TypeScript + Tailwind

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx` (placeholder), `app/globals.css`, `.gitignore`, `.env.example`, `.prettierrc`, `eslint.config.mjs`

- [ ] **Step 1: Initialize Next.js**

Run from project root:

```bash
pnpm dlx create-next-app@latest . \
  --typescript --tailwind --eslint --app \
  --src-dir false --turbopack --import-alias "@/*" \
  --use-pnpm --skip-install --yes
```

Expected: scaffolds Next.js 16 files. Some files may need merging since the repo already has `.git` and `.gitattributes`. Manually accept the new files.

- [ ] **Step 2: Install dependencies**

```bash
pnpm install
pnpm add drizzle-orm pg @neondatabase/serverless zod @anthropic-ai/sdk \
  @vercel/blob @vercel/workflow @resvg/resvg-js sharp \
  jose cookie clsx tailwind-merge class-variance-authority \
  lucide-react @radix-ui/react-slot
pnpm add -D drizzle-kit @types/pg @types/cookie vitest @vitest/ui \
  @electric-sql/pglite tsx prettier prettier-plugin-tailwindcss
```

- [ ] **Step 3: Create `.env.example`**

Create `/Users/eugenevestel/Documents/GitHub/tshirt generator/.env.example`:

```
# Neon Postgres (set after Task 3 provisions DB)
DATABASE_URL=postgres://...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Recraft V3 (direct API at recraftapi.com; alternatively use REPLICATE_API_TOKEN if going through Replicate)
RECRAFT_API_KEY=...

# Vercel Blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Auth
APP_PASSWORD=change-me-locally
AUTH_COOKIE_SECRET=$(openssl rand -hex 32)

# Optional: Printify (Plan 2 will use these — fine to leave empty for now)
PRINTIFY_API_TOKEN=
PRINTIFY_SHOP_ID=
```

Copy to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in `ANTHROPIC_API_KEY`, `RECRAFT_API_KEY`, `APP_PASSWORD`, and a generated `AUTH_COOKIE_SECRET`. Leave `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` blank until Task 3 / deployment.

- [ ] **Step 4: Verify scaffold builds**

Run:

```bash
pnpm dev
```

Expected: Next.js dev server starts at http://localhost:3000 showing the default Next.js home page. Kill the dev server with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "scaffold: initialize Next.js 16 with TypeScript and Tailwind"
```

---

## Task 2: Configure Vitest + pglite for tests

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 2: Create `tests/setup.ts`**

```ts
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();
});
```

- [ ] **Step 3: Add test script to `package.json`**

Edit `package.json` `"scripts"`:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx lib/db/seed.ts"
  }
}
```

- [ ] **Step 4: Verify**

Run:

```bash
pnpm test
```

Expected: `No test files found` (zero tests yet, but no config errors).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts tests/setup.ts package.json
git commit -m "build: configure Vitest"
```

---

## Task 3: Set up Drizzle + Neon database schema

**Files:**
- Create: `drizzle.config.ts`, `lib/db/schema.ts`, `lib/db/client.ts`
- Run: drizzle-kit generate + migrate

- [ ] **Step 1: Create Neon database**

This step requires the operator to run interactively:

```bash
# Option A: via Vercel Marketplace (recommended later for prod, but skip for local dev)
# Option B: use Neon directly — sign up at neon.tech, create a free project, copy the connection string into DATABASE_URL in .env.local
```

For local development without internet dependence, an alternative is to run Postgres in Docker:

```bash
docker run --name tshirt-pg -e POSTGRES_PASSWORD=local -p 5432:5432 -d postgres:16
# Then set DATABASE_URL=postgres://postgres:local@localhost:5432/postgres in .env.local
```

- [ ] **Step 2: Create `drizzle.config.ts`**

```ts
import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

- [ ] **Step 3: Create `lib/db/schema.ts`**

```ts
import {
  pgTable, uuid, text, integer, jsonb, boolean, timestamp, pgEnum,
} from 'drizzle-orm/pg-core';

export const batchStatusEnum = pgEnum('batch_status', [
  'generating', 'ready', 'completed', 'failed',
]);

export const designStatusEnum = pgEnum('design_status', [
  'generating', 'pending_review', 'approved', 'rejected',
  'publishing', 'live', 'failed',
]);

export const listingStatusEnum = pgEnum('listing_status', [
  'publishing', 'publishing_slow', 'live', 'failed',
]);

export const designStyleEnum = pgEnum('design_style', [
  'typography', 'illustration', 'vintage',
]);

export const batches = pgTable('batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  prompt: text('prompt').notNull(),
  nicheTag: text('niche_tag'),
  styles: text('styles').array().notNull(),
  requestedCount: integer('requested_count').notNull(),
  status: batchStatusEnum('status').notNull().default('generating'),
  workflowRunId: text('workflow_run_id'),
});

export const designs = pgTable('designs', {
  id: uuid('id').primaryKey().defaultRandom(),
  batchId: uuid('batch_id').references(() => batches.id).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  style: designStyleEnum('style').notNull(),
  concept: jsonb('concept').notNull(),
  imageBlobUrl: text('image_blob_url'),
  mockupBlobUrl: text('mockup_blob_url'),
  status: designStatusEnum('status').notNull().default('generating'),
  modelUsed: text('model_used'),
  generationCostCents: integer('generation_cost_cents').notNull().default(0),
  safetyFlags: text('safety_flags').array().notNull().default([]),
  failureReason: text('failure_reason'),
});

export const listings = pgTable('listings', {
  id: uuid('id').primaryKey().defaultRandom(),
  designId: uuid('design_id').references(() => designs.id).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  tags: text('tags').array().notNull(),
  printifyProductId: text('printify_product_id'),
  etsyListingId: text('etsy_listing_id'),
  status: listingStatusEnum('status').notNull().default('publishing'),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  failureReason: text('failure_reason'),
  safetyBlocked: boolean('safety_blocked').notNull().default(false),
});

export const nicheLibrary = pgTable('niche_library', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  promptTemplate: text('prompt_template').notNull(),
  defaultStyles: text('default_styles').array().notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const settings = pgTable('settings', {
  id: integer('id').primaryKey().default(1),
  dailyGenerationCap: integer('daily_generation_cap').notNull().default(50),
  dailyPublishCap: integer('daily_publish_cap').notNull().default(15),
  dailyBudgetCents: integer('daily_budget_cents').notNull().default(500),
  defaultPrintifyBlueprintId: integer('default_printify_blueprint_id'),
  defaultPrintProviderId: integer('default_print_provider_id'),
  defaultVariants: jsonb('default_variants'),
  etsyShopId: text('etsy_shop_id'),
  killSwitchActive: boolean('kill_switch_active').notNull().default(false),
});

export const generationEvents = pgTable('generation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  designId: uuid('design_id').references(() => designs.id),
  batchId: uuid('batch_id').references(() => batches.id),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
export type Design = typeof designs.$inferSelect;
export type NewDesign = typeof designs.$inferInsert;
export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type Niche = typeof nicheLibrary.$inferSelect;
export type Settings = typeof settings.$inferSelect;
```

- [ ] **Step 4: Create `lib/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
```

- [ ] **Step 5: Generate and run migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: a `lib/db/migrations/0000_*.sql` file is created and applied. Verify by running:

```bash
psql $DATABASE_URL -c "\dt"
```

Expected: lists tables `batches`, `designs`, `listings`, `niche_library`, `settings`, `generation_events`.

- [ ] **Step 6: Commit**

```bash
git add drizzle.config.ts lib/db/ package.json
git commit -m "db: add Drizzle schema and initial migration"
```

---

## Task 4: Seed settings and niche library

**Files:**
- Create: `lib/db/seed.ts`

- [ ] **Step 1: Write `lib/db/seed.ts`**

```ts
import 'dotenv/config';
import { db } from './client';
import { settings, nicheLibrary } from './schema';
import { sql } from 'drizzle-orm';

const NICHES = [
  { slug: 'pickleball-humor', label: 'Pickleball humor', defaultStyles: ['typography', 'vintage'],
    promptTemplate: 'Funny pickleball-related quotes and dad-joke style designs for pickleball players' },
  { slug: 'dog-mom', label: 'Dog mom / dog lover', defaultStyles: ['illustration', 'typography'],
    promptTemplate: 'Heartfelt and humorous designs for dog moms, with stylized dog illustrations and quotes' },
  { slug: 'teacher-life', label: 'Teacher life', defaultStyles: ['typography', 'vintage'],
    promptTemplate: 'Relatable quotes about teaching life, classroom humor, and subject-specific puns' },
  { slug: 'nurse-life', label: 'Nurse life', defaultStyles: ['typography', 'illustration'],
    promptTemplate: 'Designs celebrating nurses with humor, RN puns, and stethoscope/medical motifs' },
  { slug: 'coffee-addict', label: 'Coffee addict', defaultStyles: ['typography', 'vintage'],
    promptTemplate: 'Bold, retro-styled coffee-themed quotes and illustrations for caffeine enthusiasts' },
  { slug: 'plant-mom', label: 'Plant parent', defaultStyles: ['illustration'],
    promptTemplate: 'Botanical illustrations and quotes celebrating houseplant collectors' },
  { slug: 'gym-bro', label: 'Gym / weightlifting', defaultStyles: ['vintage', 'typography'],
    promptTemplate: 'Retro-fitness inspired designs with motivational quotes and weightlifting motifs' },
  { slug: 'cat-lover', label: 'Cat lover', defaultStyles: ['illustration', 'typography'],
    promptTemplate: 'Cute and witty cat-themed designs with illustrations and quotes' },
  { slug: 'retro-camping', label: 'Camping / outdoors', defaultStyles: ['vintage', 'illustration'],
    promptTemplate: 'Vintage national-park-style camping and outdoor adventure designs' },
  { slug: 'dad-jokes', label: 'Dad jokes', defaultStyles: ['typography'],
    promptTemplate: 'Classic dad-joke style puns, big bold typography on a t-shirt' },
  { slug: 'book-lover', label: 'Book / reading lover', defaultStyles: ['vintage', 'illustration'],
    promptTemplate: 'Bookish designs celebrating readers, libraries, and reading culture' },
  { slug: 'gardening', label: 'Gardening', defaultStyles: ['illustration', 'vintage'],
    promptTemplate: 'Gardening-themed illustrations and quotes for plant cultivators' },
  { slug: 'fishing', label: 'Fishing', defaultStyles: ['vintage', 'typography'],
    promptTemplate: 'Retro fishing-themed designs with fish illustrations and angler humor' },
  { slug: 'mom-life', label: 'Mom life', defaultStyles: ['typography'],
    promptTemplate: 'Humorous and relatable mom-life quotes, coffee-and-chaos energy' },
  { slug: 'autumn-vibes', label: 'Autumn / fall', defaultStyles: ['vintage', 'illustration'],
    promptTemplate: 'Cozy autumn-themed retro designs: pumpkins, sweater weather, hot drinks' },
];

async function seed() {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  for (const n of NICHES) {
    await db.insert(nicheLibrary).values(n).onConflictDoNothing({ target: nicheLibrary.slug });
  }
  console.log(`Seeded ${NICHES.length} niches and settings row.`);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run seed**

```bash
pnpm db:seed
```

Expected: `Seeded 15 niches and settings row.`

- [ ] **Step 3: Verify**

```bash
psql $DATABASE_URL -c "SELECT slug, label FROM niche_library;"
psql $DATABASE_URL -c "SELECT id, daily_generation_cap FROM settings;"
```

Expected: 15 niche rows + 1 settings row with defaults.

- [ ] **Step 4: Commit**

```bash
git add lib/db/seed.ts
git commit -m "db: seed niche library and default settings"
```

---

## Task 5: Auth — session cookie helper

**Files:**
- Create: `lib/auth/session.ts`, `tests/auth-session.test.ts`

- [ ] **Step 1: Write failing test `tests/auth-session.test.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('AUTH_COOKIE_SECRET', 'a'.repeat(64));

import { signSession, verifySession } from '@/lib/auth/session';

describe('session', () => {
  it('signs and verifies a session token', async () => {
    const token = await signSession();
    expect(token).toBeTypeOf('string');
    expect(token.length).toBeGreaterThan(20);
    const ok = await verifySession(token);
    expect(ok).toBe(true);
  });

  it('rejects a tampered token', async () => {
    const token = await signSession();
    const tampered = token.slice(0, -2) + 'xx';
    const ok = await verifySession(tampered);
    expect(ok).toBe(false);
  });

  it('rejects an empty token', async () => {
    const ok = await verifySession('');
    expect(ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test (should fail with module not found)**

```bash
pnpm test tests/auth-session.test.ts
```

Expected: FAIL `Cannot find module '@/lib/auth/session'`.

- [ ] **Step 3: Implement `lib/auth/session.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): Uint8Array {
  const s = process.env.AUTH_COOKIE_SECRET;
  if (!s || s.length < 32) {
    throw new Error('AUTH_COOKIE_SECRET must be set and at least 32 chars');
  }
  return new TextEncoder().encode(s);
}

export async function signSession(): Promise<string> {
  return new SignJWT({ ok: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secret());
    return true;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE = 'tshirt_session';
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm test tests/auth-session.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/auth/session.ts tests/auth-session.test.ts
git commit -m "auth: add session signing/verification with jose"
```

---

## Task 6: Auth — login route + middleware gate

**Files:**
- Create: `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `middleware.ts`, `app/(auth)/login/page.tsx`

- [ ] **Step 1: Write `app/api/auth/login/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { signSession, SESSION_COOKIE } from '@/lib/auth/session';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== 'string' || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const token = await signSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
```

- [ ] **Step 2: Write `app/api/auth/logout/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
```

- [ ] **Step 3: Write `middleware.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/auth/session';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout', '/_next', '/favicon.ico'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = await verifySession(token);
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 4: Write `app/(auth)/login/page.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      setError('Invalid password');
      return;
    }
    router.push('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-8 shadow">
        <h1 className="text-xl font-semibold">Sign in</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border px-3 py-2"
          autoFocus
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded-md bg-black px-3 py-2 text-white">
          Continue
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 5: Smoke test**

```bash
pnpm dev
```

Navigate to http://localhost:3000 — should redirect to `/login`. Enter the password from `.env.local`. Should redirect to `/` (which still shows the default Next.js page for now).

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/ app/\(auth\)/ middleware.ts
git commit -m "auth: add password gate, login route, and middleware"
```

---

## Task 7: Zod schemas for AI responses

**Files:**
- Create: `lib/schemas.ts`

- [ ] **Step 1: Write `lib/schemas.ts`**

```ts
import { z } from 'zod';

export const designStyleSchema = z.enum(['typography', 'illustration', 'vintage']);
export type DesignStyle = z.infer<typeof designStyleSchema>;

export const conceptSchema = z.object({
  style: designStyleSchema,
  headline: z.string().min(1).max(80),
  illustration_prompt: z.string().min(1).max(800),
  palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).min(2).max(6),
  mood: z.string().min(1).max(80),
  niche_keywords: z.array(z.string().min(1).max(40)).min(1).max(10),
});
export type Concept = z.infer<typeof conceptSchema>;

export const conceptBatchSchema = z.object({
  concepts: z.array(conceptSchema).min(1).max(20),
});

export const safetyFlagSchema = z.enum([
  'trademark',
  'celebrity_name',
  'copyrighted_character',
  'slur',
  'sexual_content',
  'violent_imagery',
  'medical_claim',
]);
export type SafetyFlag = z.infer<typeof safetyFlagSchema>;

export const safetyResultSchema = z.object({
  flags: z.array(safetyFlagSchema),
  rationale: z.string().max(500).optional(),
});
export type SafetyResult = z.infer<typeof safetyResultSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add lib/schemas.ts
git commit -m "schemas: add Zod schemas for AI responses"
```

---

## Task 8: Anthropic client wrapper

**Files:**
- Create: `lib/ai/claude.ts`

- [ ] **Step 1: Write `lib/ai/claude.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getClaude(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export const MODEL = 'claude-sonnet-4-6';

export async function claudeJSON<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ raw: string; parsed: T }> {
  const c = getClaude();
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const jsonText = extractJSON(text);
  const parsed = JSON.parse(jsonText) as T;
  return { raw: text, parsed };
}

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fenceMatch) return fenceMatch[1];
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  return text;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/ai/claude.ts
git commit -m "ai: add Claude client wrapper with JSON extraction"
```

---

## Task 9: Brief expander with TDD

**Files:**
- Create: `lib/ai/brief-expander.ts`, `tests/brief-expander.test.ts`

- [ ] **Step 1: Write failing test `tests/brief-expander.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  claudeJSON: vi.fn(),
  MODEL: 'claude-sonnet-4-6',
}));

import { claudeJSON } from '@/lib/ai/claude';
import { expandBrief } from '@/lib/ai/brief-expander';

describe('expandBrief', () => {
  it('returns N concepts matching requested styles', async () => {
    vi.mocked(claudeJSON).mockResolvedValue({
      raw: '...',
      parsed: {
        concepts: [
          { style: 'typography', headline: 'Born to Run', illustration_prompt: 'n/a',
            palette: ['#111111', '#eeeeee'], mood: 'bold', niche_keywords: ['running'] },
          { style: 'illustration', headline: 'Morning Miles', illustration_prompt: 'A runner at sunrise',
            palette: ['#ff9900', '#222222', '#ffffff'], mood: 'energetic', niche_keywords: ['running', 'sunrise'] },
        ],
      },
    });

    const out = await expandBrief({
      prompt: 'running motivation',
      styles: ['typography', 'illustration'],
      count: 2,
    });

    expect(out).toHaveLength(2);
    expect(out[0].style).toBe('typography');
    expect(out[1].style).toBe('illustration');
  });

  it('throws on schema mismatch', async () => {
    vi.mocked(claudeJSON).mockResolvedValue({
      raw: '...',
      parsed: { concepts: [{ style: 'unknown', headline: '', illustration_prompt: '', palette: [], mood: '', niche_keywords: [] }] },
    });
    await expect(expandBrief({ prompt: 'x', styles: ['typography'], count: 1 }))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test (should fail with module not found)**

```bash
pnpm test tests/brief-expander.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/ai/brief-expander.ts`**

```ts
import { claudeJSON } from './claude';
import { conceptBatchSchema, type Concept, type DesignStyle } from '../schemas';

export async function expandBrief(opts: {
  prompt: string;
  styles: DesignStyle[];
  count: number;
}): Promise<Concept[]> {
  const { prompt, styles, count } = opts;

  const system = `You are a senior t-shirt designer creating concepts for print-on-demand designs sold on Etsy.

Your job: given a high-level brief, propose ${count} distinct design CONCEPTS. Each concept is JSON.

Required JSON output format (strict — no extra fields):
{
  "concepts": [
    {
      "style": "typography" | "illustration" | "vintage",
      "headline": "the main text on the shirt (1-6 words, punchy)",
      "illustration_prompt": "a vivid prompt for an image-generation model describing the visual; for typography-only designs put 'n/a'",
      "palette": ["#RRGGBB", "#RRGGBB", ...] (2-6 hex colors that complement on a white tee),
      "mood": "1-3 word descriptor (e.g. 'playful retro', 'bold minimal')",
      "niche_keywords": ["2-6 SEO-relevant keywords"]
    }
  ]
}

Rules:
- Distribute concepts roughly evenly across the requested styles: ${styles.join(', ')}.
- Headlines must be ORIGINAL — no trademarked phrases, song lyrics, movie quotes, brand names, or celebrity names.
- Avoid niche-specific copyrighted characters (no Disney, no sports team names, no anime IPs).
- Concepts should be COMMERCIALLY VIABLE on Etsy: relatable, gift-worthy, niche-targeted, not too edgy.
- Typography concepts: lean into wordplay and bold short statements.
- Illustration concepts: clean vector-style subjects suitable for a t-shirt front print.
- Vintage concepts: distressed/retro feel, evoking 70s-80s aesthetics.
- Vary the concepts — don't repeat motifs.`;

  const user = `Brief: ${prompt}
Styles allowed: ${styles.join(', ')}
Count: ${count}

Return JSON only.`;

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { parsed } = await claudeJSON<{ concepts: unknown[] }>({
        system: attempt === 0 ? system : `${system}\n\nPREVIOUS ATTEMPT FAILED VALIDATION: ${String(lastError)}\nReturn ONLY valid JSON matching the schema.`,
        user,
      });
      const validated = conceptBatchSchema.parse(parsed);
      const filtered = validated.concepts.filter((c) => styles.includes(c.style));
      if (filtered.length === 0) throw new Error('No concepts matched requested styles');
      return filtered.slice(0, count);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`expandBrief failed after retry: ${String(lastError)}`);
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
pnpm test tests/brief-expander.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/brief-expander.ts tests/brief-expander.test.ts
git commit -m "ai: add brief expander with retry-on-validation-failure"
```

---

## Task 10: Content safety filter with TDD

**Files:**
- Create: `lib/ai/content-safety.ts`, `tests/content-safety.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/content-safety.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  claudeJSON: vi.fn(),
  MODEL: 'claude-sonnet-4-6',
}));

import { claudeJSON } from '@/lib/ai/claude';
import { checkSafety } from '@/lib/ai/content-safety';

describe('checkSafety', () => {
  it('returns empty flags for clean content', async () => {
    vi.mocked(claudeJSON).mockResolvedValue({ raw: '', parsed: { flags: [] } });
    const r = await checkSafety({ headline: 'Coffee First', illustrationPrompt: 'a mug of steaming coffee' });
    expect(r.flags).toEqual([]);
  });

  it('flags trademark content', async () => {
    vi.mocked(claudeJSON).mockResolvedValue({
      raw: '', parsed: { flags: ['trademark'], rationale: 'mentions Nike' },
    });
    const r = await checkSafety({ headline: 'Just Do It', illustrationPrompt: 'a swoosh' });
    expect(r.flags).toContain('trademark');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
pnpm test tests/content-safety.test.ts
```

- [ ] **Step 3: Implement `lib/ai/content-safety.ts`**

```ts
import { claudeJSON } from './claude';
import { safetyResultSchema, type SafetyResult } from '../schemas';

export async function checkSafety(input: {
  headline: string;
  illustrationPrompt: string;
  title?: string;
  description?: string;
  tags?: string[];
}): Promise<SafetyResult> {
  const system = `You are a content-safety reviewer for an automated t-shirt POD pipeline that publishes to Etsy.

Review the content and return JSON ONLY in this exact format:
{
  "flags": ["trademark" | "celebrity_name" | "copyrighted_character" | "slur" | "sexual_content" | "violent_imagery" | "medical_claim"],
  "rationale": "brief explanation if any flags, otherwise empty"
}

Flag definitions:
- trademark: any brand name, logo, slogan, registered trademark (e.g., Nike, Coca-Cola, Just Do It)
- celebrity_name: any real person's name living or recent (politicians, athletes, actors, musicians)
- copyrighted_character: any IP character (Disney, Marvel, Pokemon, Star Wars, anime characters)
- slur: offensive language about race, gender, religion, sexuality, disability
- sexual_content: sexually suggestive imagery or wording
- violent_imagery: graphic violence, weapons aimed at people
- medical_claim: claims to cure/treat conditions

Return EMPTY flags array if content is clearly safe. Do NOT flag generic terms (e.g., "yoga", "coffee", "dog mom").`;

  const user = JSON.stringify({
    headline: input.headline,
    illustration_prompt: input.illustrationPrompt,
    title: input.title,
    description: input.description,
    tags: input.tags,
  });

  const { parsed } = await claudeJSON<unknown>({ system, user });
  return safetyResultSchema.parse(parsed);
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
pnpm test tests/content-safety.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/ai/content-safety.ts tests/content-safety.test.ts
git commit -m "ai: add content safety filter"
```

---

## Task 11: SVG generator for typography designs

**Files:**
- Create: `lib/ai/svg-generator.ts`, `tests/svg-generator.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/svg-generator.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/ai/claude', () => ({
  getClaude: vi.fn(),
  MODEL: 'claude-sonnet-4-6',
}));

import { getClaude } from '@/lib/ai/claude';
import { generateTypographySVG } from '@/lib/ai/svg-generator';

describe('generateTypographySVG', () => {
  it('returns SVG with viewBox 4500x5400 and the headline embedded', async () => {
    const fakeSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4500 5400"><text x="2250" y="2700" text-anchor="middle" font-size="500" fill="#111">DAD JOKES ONLY</text></svg>`;
    vi.mocked(getClaude).mockReturnValue({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '```svg\n' + fakeSVG + '\n```' }] }) },
    } as any);

    const svg = await generateTypographySVG({
      headline: 'Dad Jokes Only',
      palette: ['#111111', '#ffffff'],
      mood: 'bold retro',
    });
    expect(svg).toContain('viewBox="0 0 4500 5400"');
    expect(svg).toContain('DAD JOKES ONLY');
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm test tests/svg-generator.test.ts
```

- [ ] **Step 3: Implement `lib/ai/svg-generator.ts`**

```ts
import { getClaude, MODEL } from './claude';

const APPROVED_FONTS = [
  'Bebas Neue', 'Anton', 'Oswald', 'Archivo Black',
  'Playfair Display', 'Abril Fatface', 'Bungee', 'Permanent Marker',
];

export async function generateTypographySVG(opts: {
  headline: string;
  palette: string[];
  mood: string;
}): Promise<string> {
  const system = `You generate SVG t-shirt typography designs. The design must:
- Use viewBox="0 0 4500 5400" with no width/height attributes (so it scales)
- Have a transparent background (no <rect> filling the canvas)
- Use ONE of these Google Fonts loaded inline via @import in a <style> block: ${APPROVED_FONTS.join(', ')}
- Use the supplied palette (no off-palette colors)
- Compose the headline with bold visual hierarchy — split into multiple lines if more than 3 words, vary font weights/sizes, optional decorative dingbats (lines, asterisks) that fit the mood
- Be a SINGLE <svg> root element
- Have no raster (<image>) elements
- Be valid, self-contained, ready to rasterize

Output ONLY the SVG inside a code fence:
\`\`\`svg
<svg ...>...</svg>
\`\`\`

No commentary.`;

  const user = `Headline: "${opts.headline}"
Palette: ${opts.palette.join(', ')}
Mood: ${opts.mood}

Generate the SVG.`;

  const c = getClaude();
  const resp = await c.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = resp.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
  const match = text.match(/```(?:svg|xml)?\s*([\s\S]+?)\s*```/);
  const svg = (match ? match[1] : text).trim();
  if (!svg.startsWith('<svg')) {
    throw new Error('Claude did not return a valid SVG');
  }
  return svg;
}
```

- [ ] **Step 4: Run (PASS)**

```bash
pnpm test tests/svg-generator.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/ai/svg-generator.ts tests/svg-generator.test.ts
git commit -m "ai: add SVG generator for typography designs"
```

---

## Task 12: SVG → PNG rasterization

**Files:**
- Create: `lib/images/rasterize.ts`, `tests/rasterize.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/rasterize.test.ts
import { describe, it, expect } from 'vitest';
import { rasterizeSVG } from '@/lib/images/rasterize';

describe('rasterizeSVG', () => {
  it('produces a PNG buffer of the requested dimensions', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4500 5400"><circle cx="2250" cy="2700" r="1000" fill="#ff0000"/></svg>`;
    const png = await rasterizeSVG(svg, { width: 4500, height: 5400 });
    expect(png).toBeInstanceOf(Buffer);
    // PNG signature
    expect(png.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm test tests/rasterize.test.ts
```

- [ ] **Step 3: Implement `lib/images/rasterize.ts`**

```ts
import { Resvg } from '@resvg/resvg-js';

export async function rasterizeSVG(
  svg: string,
  opts: { width: number; height: number } = { width: 4500, height: 5400 },
): Promise<Buffer> {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: opts.width },
    background: 'rgba(0,0,0,0)',
    font: { loadSystemFonts: true },
  });
  return resvg.render().asPng();
}
```

- [ ] **Step 4: Run (PASS)**

```bash
pnpm test tests/rasterize.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/images/rasterize.ts tests/rasterize.test.ts
git commit -m "images: add SVG to PNG rasterization via resvg"
```

---

## Task 13: Recraft V3 client

**Files:**
- Create: `lib/recraft/client.ts`, `tests/recraft-client.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/recraft-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImage } from '@/lib/recraft/client';

beforeEach(() => {
  vi.stubEnv('RECRAFT_API_KEY', 'test-key');
});

describe('Recraft client', () => {
  it('posts to the Recraft API and returns the image URL', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ url: 'https://recraft.example/img.png' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    const url = await generateImage({
      prompt: 'a vintage running illustration on white tee',
      style: 'digital_illustration',
      substyle: 'pixel_art',
      idempotencyKey: 'batch-1:design-1',
    });

    expect(url).toBe('https://recraft.example/img.png');
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toContain('recraft');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });

  it('retries once on 5xx', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ url: 'https://recraft.example/x.png' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } }));

    const url = await generateImage({ prompt: 'x', style: 'digital_illustration' });
    expect(url).toBe('https://recraft.example/x.png');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('throws fast on 4xx', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('bad', { status: 400 }));
    await expect(generateImage({ prompt: 'x', style: 'digital_illustration' }))
      .rejects.toThrow(/400/);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm test tests/recraft-client.test.ts
```

- [ ] **Step 3: Implement `lib/recraft/client.ts`**

```ts
export type RecraftStyle = 'digital_illustration' | 'realistic_image' | 'vector_illustration';

export async function generateImage(opts: {
  prompt: string;
  style: RecraftStyle;
  substyle?: string;
  idempotencyKey?: string;
}): Promise<string> {
  const apiKey = process.env.RECRAFT_API_KEY;
  if (!apiKey) throw new Error('RECRAFT_API_KEY not set');

  const body = {
    prompt: opts.prompt,
    style: opts.style,
    substyle: opts.substyle,
    size: '2048x2048',
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
```

- [ ] **Step 4: Run (PASS)**

```bash
pnpm test tests/recraft-client.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/recraft/client.ts tests/recraft-client.test.ts
git commit -m "recraft: add Recraft V3 client with retry-once on 5xx"
```

---

## Task 14: Background removal fallback

**Files:**
- Create: `lib/images/bg-remove.ts`

- [ ] **Step 1: Implement `lib/images/bg-remove.ts`**

For v1 we use `sharp`'s `removeAlpha` + threshold approach for off-white background detection — pragmatic, no external API needed. Designs that come back with a true non-transparent background can be flagged in the review queue for manual regenerate.

```ts
import sharp from 'sharp';

export async function detectHasBackground(pngBuffer: Buffer): Promise<boolean> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let totalAlpha = 0;
  const channels = info.channels;
  for (let i = 3; i < data.length; i += channels) {
    totalAlpha += data[i];
  }
  const avgAlpha = totalAlpha / (data.length / channels);
  return avgAlpha > 250;
}

export async function attemptWhiteBgRemoval(pngBuffer: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  const ch = info.channels;
  for (let i = 0; i < out.length; i += ch) {
    const r = out[i], g = out[i + 1], b = out[i + 2];
    if (r > 240 && g > 240 && b > 240) {
      out[i + 3] = 0;
    }
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: ch as 4 } })
    .png()
    .toBuffer();
}
```

Note: This is a heuristic. Designs with white elements as part of the art will lose them. The Review UI shows the result; if it looks bad, operator regenerates.

- [ ] **Step 2: Commit**

```bash
git add lib/images/bg-remove.ts
git commit -m "images: add white-background removal fallback"
```

---

## Task 15: Blob storage helper

**Files:**
- Create: `lib/blob/upload.ts`

- [ ] **Step 1: Implement `lib/blob/upload.ts`**

```ts
import { put } from '@vercel/blob';

export async function uploadPng(opts: {
  buffer: Buffer;
  key: string;
}): Promise<string> {
  const blob = await put(opts.key, opts.buffer, {
    access: 'public',
    contentType: 'image/png',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return blob.url;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/blob/upload.ts
git commit -m "blob: add PNG upload helper"
```

---

## Task 16: Mockup compositor

**Files:**
- Create: `lib/images/mockup.ts`, `public/tee-templates/bella-canvas-3001-white.png`, `tests/mockup.test.ts`

- [ ] **Step 1: Save tee template**

Download a clean front-view white Bella+Canvas 3001 tee photo (free for commercial mockup use — try unsplash or one of the free mockup sites; placeholder is fine for now) and save as:

```
public/tee-templates/bella-canvas-3001-white.png
```

Target size: 1500×1500 px. If a real mockup is unavailable, generate a placeholder via:

```bash
mkdir -p public/tee-templates
node -e "require('sharp')({create:{width:1500,height:1500,channels:4,background:{r:255,g:255,b:255,alpha:1}}}).png().toFile('public/tee-templates/bella-canvas-3001-white.png')"
```

(Replace with a real tee photo before launch — placeholder is good for testing.)

- [ ] **Step 2: Write failing test**

```ts
// tests/mockup.test.ts
import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composeMockup } from '@/lib/images/mockup';

describe('composeMockup', () => {
  it('overlays design onto the tee template', async () => {
    const design = await sharp({ create: { width: 4500, height: 5400, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const out = await composeMockup(design);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(1500);
    expect(meta.height).toBe(1500);
  });
});
```

- [ ] **Step 3: Run (FAIL)**

```bash
pnpm test tests/mockup.test.ts
```

- [ ] **Step 4: Implement `lib/images/mockup.ts`**

```ts
import sharp from 'sharp';
import path from 'path';

const TEMPLATE_PATH = path.join(process.cwd(), 'public', 'tee-templates', 'bella-canvas-3001-white.png');

const PRINT_AREA = {
  left: 525,
  top: 360,
  width: 450,
  height: 540,
};

export async function composeMockup(designPng: Buffer): Promise<Buffer> {
  const resizedDesign = await sharp(designPng)
    .resize(PRINT_AREA.width, PRINT_AREA.height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp(TEMPLATE_PATH)
    .composite([{ input: resizedDesign, left: PRINT_AREA.left, top: PRINT_AREA.top }])
    .png()
    .toBuffer();
}
```

- [ ] **Step 5: Run (PASS)**

```bash
pnpm test tests/mockup.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add lib/images/mockup.ts public/tee-templates/ tests/mockup.test.ts
git commit -m "images: add mockup compositor for review-queue previews"
```

---

## Task 17: Generation events logger

**Files:**
- Create: `lib/events.ts`

- [ ] **Step 1: Implement `lib/events.ts`**

```ts
import { db } from './db/client';
import { generationEvents } from './db/schema';

export type EventType =
  | 'generated' | 'approved' | 'rejected' | 'regenerated'
  | 'published' | 'publish_failed' | 'sale_recorded';

export async function logEvent(opts: {
  type: EventType;
  designId?: string;
  batchId?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(generationEvents).values({
    eventType: opts.type,
    designId: opts.designId,
    batchId: opts.batchId,
    payload: opts.payload ?? {},
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/events.ts
git commit -m "events: add generation event logger"
```

---

## Task 18: Caps enforcement with TDD

**Files:**
- Create: `lib/caps/enforcement.ts`, `tests/caps-enforcement.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// tests/caps-enforcement.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(),
    query: { settings: { findFirst: vi.fn() } },
  },
}));

import { db } from '@/lib/db/client';
import { canStartBatch } from '@/lib/caps/enforcement';

describe('canStartBatch', () => {
  it('allows when under all caps and kill switch off', async () => {
    vi.mocked(db.query.settings.findFirst).mockResolvedValue({
      id: 1, dailyGenerationCap: 50, dailyPublishCap: 15,
      dailyBudgetCents: 500, killSwitchActive: false,
      defaultPrintifyBlueprintId: null, defaultPrintProviderId: null,
      defaultVariants: null, etsyShopId: null,
    } as any);
    vi.mocked(db.select).mockReturnValue({
      from: () => ({ where: () => ({ then: (r: any) => r([{ count: 10, spent: 200 }]) }) }),
    } as any);

    const r = await canStartBatch({ requestedCount: 20 });
    expect(r.ok).toBe(true);
  });

  it('blocks when kill switch on', async () => {
    vi.mocked(db.query.settings.findFirst).mockResolvedValue({
      id: 1, dailyGenerationCap: 50, dailyPublishCap: 15,
      dailyBudgetCents: 500, killSwitchActive: true,
      defaultPrintifyBlueprintId: null, defaultPrintProviderId: null,
      defaultVariants: null, etsyShopId: null,
    } as any);

    const r = await canStartBatch({ requestedCount: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/kill switch/i);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm test tests/caps-enforcement.test.ts
```

- [ ] **Step 3: Implement `lib/caps/enforcement.ts`**

```ts
import { db } from '../db/client';
import { designs } from '../db/schema';
import { gte, sql, and } from 'drizzle-orm';

const DAY_MS = 24 * 60 * 60 * 1000;

export type CapCheck = { ok: true } | { ok: false; reason: string };

export async function canStartBatch(opts: { requestedCount: number }): Promise<CapCheck> {
  const s = await db.query.settings.findFirst();
  if (!s) return { ok: false, reason: 'Settings not seeded' };
  if (s.killSwitchActive) return { ok: false, reason: 'Kill switch active' };

  const since = new Date(Date.now() - DAY_MS);
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      spent: sql<number>`coalesce(sum(generation_cost_cents),0)::int`,
    })
    .from(designs)
    .where(gte(designs.createdAt, since));
  const { count = 0, spent = 0 } = rows[0] ?? {};

  if (count + opts.requestedCount > s.dailyGenerationCap) {
    return { ok: false, reason: `Daily generation cap reached (${count}/${s.dailyGenerationCap})` };
  }
  if (spent >= s.dailyBudgetCents) {
    return { ok: false, reason: `Daily budget cap reached ($${(spent / 100).toFixed(2)})` };
  }
  return { ok: true };
}

export async function killSwitchActive(): Promise<boolean> {
  const s = await db.query.settings.findFirst();
  return !!s?.killSwitchActive;
}
```

- [ ] **Step 4: Run (PASS)**

```bash
pnpm test tests/caps-enforcement.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/caps/enforcement.ts tests/caps-enforcement.test.ts
git commit -m "caps: add daily generation and budget cap enforcement"
```

---

## Task 19: Generate-batch workflow (Vercel Workflow)

**Files:**
- Create: `app/workflows/generate-batch.ts`

- [ ] **Step 1: Implement `app/workflows/generate-batch.ts`**

```ts
import { defineWorkflow, step } from '@vercel/workflow';
import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { expandBrief } from '@/lib/ai/brief-expander';
import { checkSafety } from '@/lib/ai/content-safety';
import { generateTypographySVG } from '@/lib/ai/svg-generator';
import { rasterizeSVG } from '@/lib/images/rasterize';
import { generateImage } from '@/lib/recraft/client';
import { detectHasBackground, attemptWhiteBgRemoval } from '@/lib/images/bg-remove';
import { uploadPng } from '@/lib/blob/upload';
import { composeMockup } from '@/lib/images/mockup';
import { logEvent } from '@/lib/events';
import { canStartBatch, killSwitchActive } from '@/lib/caps/enforcement';
import type { Concept } from '@/lib/schemas';

const RECRAFT_COST_CENTS = 4;
const CLAUDE_SVG_COST_CENTS = 1;

export const generateBatch = defineWorkflow({
  name: 'generateBatch',
  async run(input: { batchId: string }) {
    const { batchId } = input;

    const batch = await step('load-batch', async () => {
      const row = await db.query.batches.findFirst({ where: eq(batches.id, batchId) });
      if (!row) throw new Error(`Batch ${batchId} not found`);
      return row;
    });

    const caps = await step('check-caps', async () => {
      const r = await canStartBatch({ requestedCount: batch.requestedCount });
      return r;
    });
    if (!caps.ok) {
      await db.update(batches).set({ status: 'failed' }).where(eq(batches.id, batchId));
      await logEvent({ type: 'rejected', batchId, payload: { reason: caps.reason } });
      return { ok: false, reason: caps.reason };
    }

    const concepts = await step('expand-brief', async () => {
      return expandBrief({
        prompt: batch.prompt,
        styles: batch.styles as Concept['style'][],
        count: batch.requestedCount,
      });
    });

    const designRows = await step('insert-design-rows', async () => {
      const rows = await db.insert(designs).values(
        concepts.map((c) => ({
          batchId,
          style: c.style,
          concept: c,
          status: 'generating' as const,
        })),
      ).returning();
      return rows;
    });

    const concurrency = 5;
    for (let i = 0; i < designRows.length; i += concurrency) {
      const slice = designRows.slice(i, i + concurrency);
      await Promise.all(slice.map((d) => generateOneDesign(d.id, d.concept as Concept, batchId)));
    }

    await step('mark-batch-ready', async () => {
      await db.update(batches).set({ status: 'ready' }).where(eq(batches.id, batchId));
    });

    return { ok: true, count: designRows.length };
  },
});

async function generateOneDesign(designId: string, concept: Concept, batchId: string) {
  try {
    if (await killSwitchActive()) {
      await db.update(designs).set({ status: 'failed', failureReason: 'Kill switch active' })
        .where(eq(designs.id, designId));
      return;
    }

    const safety = await step(`safety-${designId}`, async () =>
      checkSafety({ headline: concept.headline, illustrationPrompt: concept.illustration_prompt }));

    let pngBuffer: Buffer;
    let modelUsed: string;
    let costCents: number;

    if (concept.style === 'typography') {
      const svg = await step(`svg-${designId}`, async () =>
        generateTypographySVG({
          headline: concept.headline, palette: concept.palette, mood: concept.mood,
        }));
      pngBuffer = await step(`rasterize-${designId}`, async () => rasterizeSVG(svg));
      modelUsed = 'claude-svg';
      costCents = CLAUDE_SVG_COST_CENTS;
    } else {
      const recraftStyle = concept.style === 'vintage' ? 'digital_illustration' : 'digital_illustration';
      const styledPrompt = concept.style === 'vintage'
        ? `${concept.illustration_prompt}. Vintage 70s-80s retro aesthetic, distressed texture, faux-screenprint, palette: ${concept.palette.join(', ')}. Transparent background.`
        : `${concept.illustration_prompt}. Clean vector illustration, palette: ${concept.palette.join(', ')}. Transparent background.`;

      const url = await step(`recraft-${designId}`, async () => generateImage({
        prompt: styledPrompt, style: recraftStyle, idempotencyKey: `${batchId}:${designId}`,
      }));
      pngBuffer = await step(`download-${designId}`, async () => {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Recraft image download failed ${resp.status}`);
        return Buffer.from(await resp.arrayBuffer());
      });
      modelUsed = 'recraft-v3';
      costCents = RECRAFT_COST_CENTS;
    }

    const cleanedPng = await step(`bg-${designId}`, async () => {
      const hasBg = await detectHasBackground(pngBuffer);
      return hasBg ? attemptWhiteBgRemoval(pngBuffer) : pngBuffer;
    });

    const imageUrl = await step(`upload-image-${designId}`, async () =>
      uploadPng({ buffer: cleanedPng, key: `designs/${designId}.png` }));

    const mockup = await step(`mockup-${designId}`, async () => composeMockup(cleanedPng));
    const mockupUrl = await step(`upload-mockup-${designId}`, async () =>
      uploadPng({ buffer: mockup, key: `mockups/${designId}.png` }));

    await db.update(designs).set({
      imageBlobUrl: imageUrl,
      mockupBlobUrl: mockupUrl,
      status: 'pending_review',
      modelUsed,
      generationCostCents: costCents,
      safetyFlags: safety.flags,
    }).where(eq(designs.id, designId));

    await logEvent({
      type: 'generated', designId, batchId,
      payload: { modelUsed, costCents, safetyFlags: safety.flags },
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await db.update(designs)
      .set({ status: 'failed', failureReason: reason })
      .where(eq(designs.id, designId));
    await logEvent({ type: 'rejected', designId, batchId, payload: { reason } });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/workflows/
git commit -m "workflow: add generate-batch durable workflow"
```

---

## Task 20: POST /api/batches

**Files:**
- Create: `app/api/batches/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { batches } from '@/lib/db/schema';
import { canStartBatch } from '@/lib/caps/enforcement';
import { designStyleSchema } from '@/lib/schemas';
import { triggerWorkflow } from '@vercel/workflow';
import { generateBatch } from '@/app/workflows/generate-batch';
import { eq } from 'drizzle-orm';

const bodySchema = z.object({
  prompt: z.string().min(3).max(500),
  styles: z.array(designStyleSchema).min(1),
  count: z.number().int().min(1).max(20),
  nicheTag: z.string().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.format() }, { status: 400 });
  }

  const caps = await canStartBatch({ requestedCount: parsed.data.count });
  if (!caps.ok) {
    return NextResponse.json({ ok: false, error: caps.reason }, { status: 429 });
  }

  const [row] = await db.insert(batches).values({
    prompt: parsed.data.prompt,
    styles: parsed.data.styles,
    requestedCount: parsed.data.count,
    nicheTag: parsed.data.nicheTag,
    status: 'generating',
  }).returning();

  const run = await triggerWorkflow(generateBatch, { batchId: row.id });
  await db.update(batches).set({ workflowRunId: run.id }).where(eq(batches.id, row.id));

  return NextResponse.json({ ok: true, batchId: row.id });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/batches/route.ts
git commit -m "api: POST /api/batches starts a generation batch"
```

---

## Task 21: GET /api/batches/[id]

**Files:**
- Create: `app/api/batches/[id]/route.ts`

- [ ] **Step 1: Implement**

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) return NextResponse.json({ ok: false }, { status: 404 });
  const designRows = await db.query.designs.findMany({ where: eq(designs.batchId, id) });
  return NextResponse.json({ ok: true, batch, designs: designRows });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/batches/\[id\]/
git commit -m "api: GET /api/batches/[id] returns batch with designs"
```

---

## Task 22: Design approve/reject/regenerate routes

**Files:**
- Create: `app/api/designs/[id]/approve/route.ts`, `app/api/designs/[id]/reject/route.ts`, `app/api/designs/[id]/regenerate/route.ts`

- [ ] **Step 1: Approve route**

`app/api/designs/[id]/approve/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logEvent } from '@/lib/events';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.update(designs)
    .set({ status: 'approved' })
    .where(eq(designs.id, id))
    .returning();
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });
  await logEvent({ type: 'approved', designId: id, batchId: row.batchId });
  return NextResponse.json({ ok: true, design: row });
}
```

- [ ] **Step 2: Reject route**

`app/api/designs/[id]/reject/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logEvent } from '@/lib/events';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db.update(designs)
    .set({ status: 'rejected' })
    .where(eq(designs.id, id))
    .returning();
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });
  await logEvent({ type: 'rejected', designId: id, batchId: row.batchId });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Regenerate route**

`app/api/designs/[id]/regenerate/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { designs, batches } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { logEvent } from '@/lib/events';
import { triggerWorkflow } from '@vercel/workflow';
import { generateBatch } from '@/app/workflows/generate-batch';
import type { Concept } from '@/lib/schemas';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const original = await db.query.designs.findFirst({ where: eq(designs.id, id) });
  if (!original) return NextResponse.json({ ok: false }, { status: 404 });

  await db.update(designs).set({ status: 'rejected' }).where(eq(designs.id, id));

  const [newBatch] = await db.insert(batches).values({
    prompt: `(regenerate) ${(original.concept as Concept).headline}`,
    styles: [original.style],
    requestedCount: 1,
    status: 'generating',
  }).returning();

  const run = await triggerWorkflow(generateBatch, { batchId: newBatch.id });
  await db.update(batches).set({ workflowRunId: run.id }).where(eq(batches.id, newBatch.id));

  await logEvent({
    type: 'regenerated', designId: id, batchId: original.batchId,
    payload: { newBatchId: newBatch.id },
  });

  return NextResponse.json({ ok: true, newBatchId: newBatch.id });
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/designs/
git commit -m "api: design approve/reject/regenerate routes"
```

---

## Task 23: Install shadcn primitives

**Files:**
- Create: `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/textarea.tsx`, `components/ui/badge.tsx`, `components/ui/card.tsx`, `lib/utils.ts`

- [ ] **Step 1: Init shadcn**

```bash
pnpm dlx shadcn@latest init -d
```

Accept defaults. This creates `components.json`, `lib/utils.ts`, and `components/ui/`.

- [ ] **Step 2: Add needed components**

```bash
pnpm dlx shadcn@latest add button input textarea badge card
```

- [ ] **Step 3: Commit**

```bash
git add components/ components.json lib/utils.ts app/globals.css
git commit -m "ui: install shadcn primitives"
```

---

## Task 24: App shell (authenticated layout + nav)

**Files:**
- Create: `app/(app)/layout.tsx`

- [ ] **Step 1: Implement**

```tsx
import Link from 'next/link';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-base font-semibold">Tee Generator</Link>
          <div className="flex gap-4 text-sm">
            <Link href="/" className="text-zinc-700 hover:text-zinc-900">Dashboard</Link>
            <Link href="/batches/new" className="text-zinc-700 hover:text-zinc-900">Generate</Link>
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="text-zinc-500 hover:text-zinc-900">Sign out</button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/\(app\)/layout.tsx
git commit -m "ui: add authenticated app shell"
```

---

## Task 25: Dashboard page

**Files:**
- Create: `app/(app)/page.tsx`, replace existing `app/page.tsx` with redirect-or-noop

- [ ] **Step 1: Remove default `app/page.tsx`**

Delete the file (will live under route group):

```bash
rm app/page.tsx
```

- [ ] **Step 2: Write `app/(app)/page.tsx`**

```tsx
import Link from 'next/link';
import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { desc, sql, gte } from 'drizzle-orm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DAY_MS = 24 * 60 * 60 * 1000;

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const today = new Date(Date.now() - DAY_MS);

  const [weekStats] = await db.select({
    generated: sql<number>`count(*)::int`,
    approved: sql<number>`count(*) filter (where status in ('approved','publishing','live'))::int`,
    live: sql<number>`count(*) filter (where status='live')::int`,
  }).from(designs).where(gte(designs.createdAt, since));

  const [todayStats] = await db.select({
    count: sql<number>`count(*)::int`,
    spent: sql<number>`coalesce(sum(generation_cost_cents),0)::int`,
  }).from(designs).where(gte(designs.createdAt, today));

  const recent = await db.query.batches.findMany({
    orderBy: [desc(batches.createdAt)],
    limit: 8,
  });

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/batches/new" className="rounded-md bg-black px-4 py-2 text-sm text-white">
          Start new batch
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Generated (7d)" value={weekStats?.generated ?? 0} />
        <StatCard label="Approved (7d)" value={weekStats?.approved ?? 0} />
        <StatCard label="Live listings" value={weekStats?.live ?? 0} />
        <StatCard label="Today" value={`${todayStats?.count ?? 0} / $${((todayStats?.spent ?? 0) / 100).toFixed(2)}`} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Recent batches</h2>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {recent.map((b) => (
                <li key={b.id}>
                  <Link href={`/batches/${b.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50">
                    <span className="truncate">{b.prompt}</span>
                    <span className="text-xs text-zinc-500">{b.status}</span>
                  </Link>
                </li>
              ))}
              {recent.length === 0 && <li className="px-4 py-6 text-sm text-zinc-500">No batches yet.</li>}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-xs font-normal text-zinc-500">{label}</CardTitle></CardHeader>
      <CardContent><div className="text-2xl font-semibold">{value}</div></CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/\(app\)/page.tsx
git commit -m "ui: dashboard page with stats and recent batches"
```

---

## Task 26: Generate page

**Files:**
- Create: `app/(app)/batches/new/page.tsx`, `components/NicheChips.tsx`

- [ ] **Step 1: Niche chips component**

`components/NicheChips.tsx`:

```tsx
'use client';

import type { Niche } from '@/lib/db/schema';

export function NicheChips({ niches, onPick }: { niches: Niche[]; onPick: (n: Niche) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {niches.map((n) => (
        <button
          key={n.id}
          type="button"
          onClick={() => onPick(n)}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs hover:bg-zinc-100"
        >
          {n.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Generate page (server component with client form child)**

`app/(app)/batches/new/page.tsx`:

```tsx
import { db } from '@/lib/db/client';
import { nicheLibrary } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { GenerateForm } from './form';

export const dynamic = 'force-dynamic';

export default async function GeneratePage() {
  const niches = await db.query.nicheLibrary.findMany({ where: eq(nicheLibrary.isActive, true) });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Generate a batch</h1>
      <GenerateForm niches={niches} />
    </div>
  );
}
```

- [ ] **Step 3: Client form**

`app/(app)/batches/new/form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Niche } from '@/lib/db/schema';
import type { DesignStyle } from '@/lib/schemas';
import { NicheChips } from '@/components/NicheChips';

const STYLES: DesignStyle[] = ['typography', 'illustration', 'vintage'];

export function GenerateForm({ niches }: { niches: Niche[] }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [styles, setStyles] = useState<DesignStyle[]>(['typography', 'illustration', 'vintage']);
  const [count, setCount] = useState(5);
  const [nicheTag, setNicheTag] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleStyle(s: DesignStyle) {
    setStyles((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, styles, count, nicheTag }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error?.message || (typeof json.error === 'string' ? json.error : 'Failed'));
        return;
      }
      router.push(`/batches/${json.batchId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-6 sm:grid-cols-[2fr_1fr]">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm">Prompt</label>
          <textarea
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder='e.g. "pickleball dad jokes, retro feel"'
            className="h-32 w-full rounded-md border bg-white p-3"
            required minLength={3}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm">Styles</label>
          <div className="flex gap-3">
            {STYLES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm capitalize">
                <input type="checkbox" checked={styles.includes(s)} onChange={() => toggleStyle(s)} />
                {s}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm">Count: {count}</label>
          <input type="range" min={1} max={20} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy || styles.length === 0 || prompt.length < 3}
          className="rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? 'Generating…' : 'Generate'}
        </button>
      </div>
      <aside className="space-y-3">
        <h3 className="text-sm font-medium">Niche library</h3>
        <NicheChips niches={niches} onPick={(n) => {
          setPrompt(n.promptTemplate);
          setStyles(n.defaultStyles as DesignStyle[]);
          setNicheTag(n.slug);
        }} />
      </aside>
    </form>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/batches/new/ components/NicheChips.tsx
git commit -m "ui: generate batch page with prompt, styles, count, niche picker"
```

---

## Task 27: Review queue page

**Files:**
- Create: `app/(app)/batches/[id]/page.tsx`, `app/(app)/batches/[id]/review-grid.tsx`, `components/DesignCard.tsx`, `components/BatchStatusBadge.tsx`

- [ ] **Step 1: Status badge**

`components/BatchStatusBadge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge';

const COLORS: Record<string, string> = {
  generating: 'bg-blue-100 text-blue-800',
  pending_review: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-zinc-100 text-zinc-700',
  publishing: 'bg-indigo-100 text-indigo-800',
  live: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  ready: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-zinc-100 text-zinc-700',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={COLORS[status] ?? 'bg-zinc-100 text-zinc-700'}>{status}</Badge>;
}
```

- [ ] **Step 2: Design card**

`components/DesignCard.tsx`:

```tsx
'use client';

import Image from 'next/image';
import { useState } from 'react';
import { StatusBadge } from '@/components/BatchStatusBadge';
import type { Design } from '@/lib/db/schema';
import type { Concept } from '@/lib/schemas';

export function DesignCard({ design, onAction }: {
  design: Design;
  onAction: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const concept = design.concept as Concept;

  async function act(verb: 'approve' | 'reject' | 'regenerate') {
    setBusy(true);
    try {
      await fetch(`/api/designs/${design.id}/${verb}`, { method: 'POST' });
      onAction();
    } finally { setBusy(false); }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
      <div className="relative aspect-square bg-zinc-100">
        {design.mockupBlobUrl ? (
          <Image src={design.mockupBlobUrl} alt={concept.headline} fill className="object-cover" unoptimized />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-zinc-400">
            {design.status === 'generating' ? 'Generating…' : design.failureReason || 'No preview'}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">{concept.headline}</span>
          <StatusBadge status={design.status} />
        </div>
        <div className="text-xs text-zinc-500">{design.style} · {concept.mood}</div>
        {design.safetyFlags.length > 0 && (
          <div className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
            ⚠ {design.safetyFlags.join(', ')}
          </div>
        )}
        {design.status === 'pending_review' && (
          <div className="flex gap-2 pt-1">
            <button disabled={busy} onClick={() => act('approve')} className="flex-1 rounded bg-black px-2 py-1 text-xs text-white">Approve</button>
            <button disabled={busy} onClick={() => act('reject')} className="flex-1 rounded border px-2 py-1 text-xs">Reject</button>
            <button disabled={busy} onClick={() => act('regenerate')} className="rounded border px-2 py-1 text-xs">↻</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Review grid (client)**

`app/(app)/batches/[id]/review-grid.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { DesignCard } from '@/components/DesignCard';
import type { Batch, Design } from '@/lib/db/schema';

export function ReviewGrid({ initialBatch, initialDesigns }: { initialBatch: Batch; initialDesigns: Design[] }) {
  const [designs, setDesigns] = useState(initialDesigns);
  const [batch, setBatch] = useState(initialBatch);

  async function refresh() {
    const res = await fetch(`/api/batches/${initialBatch.id}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.ok) { setBatch(json.batch); setDesigns(json.designs); }
  }

  useEffect(() => {
    if (batch.status === 'generating') {
      const t = setInterval(refresh, 3000);
      return () => clearInterval(t);
    }
  }, [batch.status]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Status: {batch.status}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {designs.map((d) => (
          <DesignCard key={d.id} design={d} onAction={refresh} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Server page**

`app/(app)/batches/[id]/page.tsx`:

```tsx
import { db } from '@/lib/db/client';
import { batches, designs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { ReviewGrid } from './review-grid';

export const dynamic = 'force-dynamic';

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const batch = await db.query.batches.findFirst({ where: eq(batches.id, id) });
  if (!batch) notFound();
  const designRows = await db.query.designs.findMany({ where: eq(designs.batchId, id) });
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Review batch</h1>
        <p className="text-sm text-zinc-500">{batch.prompt}</p>
      </header>
      <ReviewGrid initialBatch={batch} initialDesigns={designRows} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/batches/\[id\]/ components/DesignCard.tsx components/BatchStatusBadge.tsx
git commit -m "ui: review queue with poll-while-generating and approve/reject/regenerate"
```

---

## Task 28: End-to-end local smoke test

- [ ] **Step 1: Run dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Smoke test checklist**

Navigate to http://localhost:3000:

- [ ] Redirects to `/login`
- [ ] Logging in with `APP_PASSWORD` redirects to `/`
- [ ] Dashboard shows empty stats and "No batches yet"
- [ ] Click "Start new batch", click a niche chip, see prompt populate, click "Generate"
- [ ] Redirects to `/batches/[id]`, shows designs with status `generating`, polls every 3s
- [ ] Within a few minutes, designs flip to `pending_review` with mockup images visible
- [ ] Approve, reject, regenerate buttons all return 200 and update the UI
- [ ] Regenerate creates a new batch (visible on dashboard)
- [ ] Signing out returns to `/login`

If any step fails, check:
- `pnpm test` — all unit tests still green?
- Vercel Workflow logs (Workflow runs locally with `pnpm dev`)
- DB rows: `psql $DATABASE_URL -c "SELECT id, status, failure_reason FROM designs ORDER BY created_at DESC LIMIT 10;"`
- `generation_events`: `psql $DATABASE_URL -c "SELECT event_type, payload FROM generation_events ORDER BY created_at DESC LIMIT 20;"`

- [ ] **Step 3: Tag Plan 1 completion**

```bash
git tag plan-1-complete
git log --oneline plan-1-complete | head -30
```

---

## Plan 1 Done — What's Next

At this point you can generate designs and review them in-browser. **Approved designs sit in the DB with `status=approved` but don't publish anywhere yet** — that's Plan 2.

**Plan 2 will add:**
- Listing copy generation (title, description, 13 tags)
- Etsy field validators
- Printify API client + image upload + product creation + publish
- Publish-design workflow with daily-publish-cap pause/resume
- Reconciliation cron job
- Listings page
- Settings page
- Production deployment to Vercel

Run the smoke-test review of Plan 1 first, validate the SVG and Recraft outputs look good (this is the most likely place for surprises), iterate on prompts if needed, then ask for Plan 2.
