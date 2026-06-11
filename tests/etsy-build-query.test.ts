import { describe, it, expect } from 'vitest';
import { buildQuery, queryHash } from '@/lib/etsy/build-query';

describe('buildQuery', () => {
  it('uses first 3 niche_keywords + " t shirt" when keywords present', () => {
    const r = buildQuery({
      headline: 'Coffee You Later!',
      niche_keywords: ['coffee', 'funny tee', 'sarcasm', 'caffeine', 'mom'],
    });
    expect(r).toBe('coffee funny tee sarcasm t shirt');
  });

  it('falls back to slogan words when niche_keywords too short', () => {
    const r = buildQuery({
      headline: 'I Came I Saw I Made It Awkward',
      niche_keywords: [],
    });
    // stopwords: i, it. Kept: came, saw, made, awkward → first 3
    expect(r).toBe('came saw made t shirt');
  });

  it('falls back to slogan words when niche_keywords has <3 entries', () => {
    const r = buildQuery({
      headline: 'Powered By Coffee And Chaos',
      niche_keywords: ['mom'],
    });
    expect(r).toBe('powered coffee chaos t shirt');
  });

  it('lowercases and drops punctuation from slogan tokens', () => {
    const r = buildQuery({
      headline: "Don't Talk To Me — Until Coffee!",
      niche_keywords: [],
    });
    // drop: don, to, me, until (stopwords or <3 len with apostrophe stripped); keep: talk, coffee
    expect(r).toContain('coffee');
    expect(r).toContain('talk');
    expect(r).toContain('t shirt');
  });

  it('dedupes tokens', () => {
    const r = buildQuery({
      headline: 'Coffee Coffee Coffee',
      niche_keywords: ['coffee', 'coffee', 'coffee'],
    });
    expect(r.split(/\s+/).filter((w) => w === 'coffee')).toHaveLength(1);
  });

  it('caps at 6 tokens total', () => {
    const r = buildQuery({
      headline: 'A',
      niche_keywords: ['one', 'two', 'three', 'four', 'five', 'six', 'seven'],
    });
    expect(r.split(/\s+/).length).toBeLessThanOrEqual(6);
  });
});

describe('queryHash', () => {
  it('is the same for the same tokens regardless of original order', () => {
    expect(queryHash('coffee funny tee')).toBe(queryHash('tee funny coffee'));
  });

  it('is hex sha256 (64 chars)', () => {
    const h = queryHash('coffee funny tee');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('differs for different tokens', () => {
    expect(queryHash('coffee tee')).not.toBe(queryHash('coffee shirt'));
  });
});
