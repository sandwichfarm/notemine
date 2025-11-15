import { describe, it, expect } from 'vitest';
import { buildContactListTags, extractContactListParts } from './contact-list';

describe('contact-list helpers', () => {
  it('extracts follow and non-follow tags preserving order', () => {
    const tags = [
      ['relay', 'wss://one'],
      ['p', 'alice', 'wss://relay'],
      ['p', 'bob'],
      ['relay', 'wss://two'],
      ['p', 'alice', 'wss://relay2'],
    ];

    const parts = extractContactListParts(tags);

    expect(parts.nonFollowTags).toEqual([
      ['relay', 'wss://one'],
      ['relay', 'wss://two'],
    ]);
    expect(Array.from(parts.followTagMap.entries())).toEqual([
      ['alice', ['p', 'alice', 'wss://relay']],
      ['bob', ['p', 'bob']],
    ]);
    expect(parts.followOrder).toEqual(['alice', 'bob']);
  });

  it('builds tags with preserved metadata and fallback entries', () => {
    const nonFollowTags = [['relay', 'wss://one']];
    const followOrder = ['alice', 'bob', 'carol'];
    const followTagMap = new Map<string, string[]>([
      ['alice', ['p', 'alice', 'wss://relay']],
      ['bob', ['p', 'bob']],
    ]);

    const tags = buildContactListTags(nonFollowTags, followOrder, followTagMap);

    expect(tags).toEqual([
      ['relay', 'wss://one'],
      ['p', 'alice', 'wss://relay'],
      ['p', 'bob'],
      ['p', 'carol'],
    ]);
  });
});
