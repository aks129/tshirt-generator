import { describe, it, expect } from 'vitest';
import { listingCopySchema, validateListingCopy } from '@/lib/etsy/validators';

describe('listingCopySchema', () => {
  it('accepts valid listing copy', () => {
    const valid = {
      title: 'Coffee You Later Funny T-Shirt Gift',
      tags: ['coffee', 'funny tee', 'gift', 't shirt', 'caffeine', 'work shirt', 'pun shirt',
             'office gift', 'morning person', 'coffee lover', 'sarcasm tee', 'cute shirt', 'mom gift'],
      description: 'A comfortable unisex tee printed on Bella+Canvas 3001.',
    };
    expect(() => listingCopySchema.parse(valid)).not.toThrow();
  });

  it('rejects title >140 chars', () => {
    const bad = { title: 'x'.repeat(141), tags: Array(13).fill('a'), description: 'a'.repeat(20) };
    expect(() => listingCopySchema.parse(bad)).toThrow();
  });

  it('rejects title with banned chars', () => {
    const bad = { title: 'Hello <world>', tags: Array(13).fill('a'), description: 'a'.repeat(20) };
    expect(() => listingCopySchema.parse(bad)).toThrow();
  });

  it('rejects tags array of length != 13', () => {
    const bad = { title: 'Valid Title', tags: ['a', 'b'], description: 'a'.repeat(20) };
    expect(() => listingCopySchema.parse(bad)).toThrow();
  });

  it('rejects tag >20 chars', () => {
    const tags = [...Array(12).fill('a'), 'x'.repeat(21)];
    const bad = { title: 'Valid Title', tags, description: 'a'.repeat(20) };
    expect(() => listingCopySchema.parse(bad)).toThrow();
  });

  it('rejects tag with punctuation', () => {
    const tags = [...Array(12).fill('a'), 'tag!with!punc'];
    const bad = { title: 'Valid Title', tags, description: 'a'.repeat(20) };
    expect(() => listingCopySchema.parse(bad)).toThrow();
  });

  it('rejects description <20 chars', () => {
    const bad = { title: 'Valid', tags: Array(13).fill('a'), description: 'too short' };
    expect(() => listingCopySchema.parse(bad)).toThrow();
  });

  it('validateListingCopy returns success object', () => {
    const r = validateListingCopy({
      title: 'Valid Title For Etsy Listing',
      tags: Array(13).fill('tag'),
      description: 'A long enough description to pass validation.',
    });
    expect(r.ok).toBe(true);
  });

  it('validateListingCopy returns error list', () => {
    const r = validateListingCopy({ title: 'x', tags: [], description: 'short' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThan(0);
  });
});
