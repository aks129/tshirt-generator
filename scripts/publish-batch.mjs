#!/usr/bin/env node
// Durable batch publisher for the GitHub Actions runner (free-tier alternative
// to the Vercel Workflow DevKit, which Hobby plans don't execute).
//
// Drives the same endpoints the publish modal uses — one design at a time,
// paced, continue-on-failure, stop-at-cap — but from a long-running CI job that
// isn't bound to a browser tab or Vercel's 60s function limit.
//
// Env:
//   APP_URL       https://your-app.vercel.app   (no trailing slash)
//   APP_PASSWORD  the app login password
//   BATCH_ID      the batch whose 'approved' designs to publish
//   PACE_MS       optional, default 5000 — gap between designs (Printify queue)
//
// Per-design outcomes:
//   200/202 -> published / queued
//   429     -> daily publish cap reached; stop launching more
//   504     -> the publish row was already created server-side (it flips the
//              design to 'publishing' before the slow step), so it's queued;
//              the reconcile job settles it to live/failed. Not a duplicate —
//              runPublish records the Printify product id immediately, so it
//              won't orphan-clone.
//   other   -> failed; continue with the rest.

const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const BATCH_ID = process.env.BATCH_ID || '';
const PACE_MS = Number(process.env.PACE_MS || 5000);

if (!APP_URL || !APP_PASSWORD || !BATCH_ID) {
  console.error('APP_URL, APP_PASSWORD and BATCH_ID are required');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cookie = '';

async function api(path, { method = 'GET', body, timeoutMs = 110_000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${APP_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

async function login() {
  const r = await api('/api/auth/login', { method: 'POST', body: { password: APP_PASSWORD }, timeoutMs: 30_000 });
  if (r.status !== 200 || !cookie) throw new Error(`login failed (${r.status})`);
}

async function approvedDesignIds() {
  const r = await api(`/api/batches/${BATCH_ID}`, { timeoutMs: 30_000 });
  if (r.status !== 200 || !r.json?.designs) throw new Error(`batch fetch failed (${r.status})`);
  return r.json.designs.filter((d) => d.status === 'approved').map((d) => d.id);
}

async function run() {
  await login();
  const ids = await approvedDesignIds();
  console.log(`batch ${BATCH_ID}: ${ids.length} approved design(s) to publish`);

  const summary = { published: 0, queued: 0, failed: 0, skipped: 0 };
  let stoppedAtCap = false;

  for (const id of ids) {
    const short = id.slice(0, 8);
    if (stoppedAtCap) { summary.skipped++; console.log(`- ${short} skipped (cap)`); continue; }

    const draft = await api(`/api/designs/${id}/draft-listing`, { method: 'POST', body: {}, timeoutMs: 60_000 });
    if (draft.status !== 200 || !draft.json?.draft) {
      summary.failed++; console.log(`- ${short} FAIL draft (${draft.status})`); continue;
    }
    const { title, tags, description } = draft.json.draft;

    const pub = await api('/api/listings', { method: 'POST', body: { design_id: id, title, tags, description } });
    if (pub.status === 429) { stoppedAtCap = true; summary.skipped++; console.log(`- ${short} cap reached — stopping`); continue; }
    if (pub.status === 504) { summary.queued++; console.log(`- ${short} queued (504 — settles via reconcile)`); await sleep(PACE_MS); continue; }
    if (pub.status !== 200 && pub.status !== 202) {
      summary.failed++; console.log(`- ${short} FAIL publish (${pub.status}) ${pub.json?.error ?? ''}`); await sleep(PACE_MS); continue;
    }

    const listingId = pub.json?.listingId;
    if (pub.json?.status === 'publishing_slow' || !listingId) {
      summary.queued++; console.log(`- ${short} queued`); await sleep(PACE_MS); continue;
    }

    // Live — top up photos (non-fatal; reconcile backfills).
    const photos = await api(`/api/listings/${listingId}/photos`, { method: 'POST', body: {}, timeoutMs: 110_000 });
    summary.published++;
    console.log(`- ${short} LIVE${photos.json?.ok ? '' : ' (photos pending)'}`);
    await sleep(PACE_MS);
  }

  console.log('SUMMARY', JSON.stringify(summary));
  if (summary.failed > 0) process.exitCode = 1;
}

run().catch((e) => { console.error(e); process.exit(1); });
