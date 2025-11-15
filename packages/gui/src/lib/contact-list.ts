/**
 * Helpers for working with Nostr contact list (kind 3) events.
 * These utilities are pure so they can be unit-tested outside of Solid context.
 */

export interface ContactListParts {
  /** Tags that are not `p` follows (e.g., relay hints or metadata) */
  nonFollowTags: string[][];
  /** Map of follow pubkeys to their preserved tag entries (including relay/petname) */
  followTagMap: Map<string, string[]>;
  /** Ordered list of follow pubkeys, preserving tag order */
  followOrder: string[];
}

/**
 * Deep-clone a list of tags to avoid accidental mutation.
 */
export function cloneTags(tags: string[][] = []): string[][] {
  return tags.map(tag => [...tag]);
}

/**
 * Split contact list tags into follow vs non-follow buckets.
 * Duplicated `p` tags keep the first occurrence to preserve order.
 */
export function extractContactListParts(tags: string[][] = []): ContactListParts {
  const nonFollowTags: string[][] = [];
  const followTagMap = new Map<string, string[]>();
  const followOrder: string[] = [];

  for (const tag of tags) {
    if (tag[0] === 'p' && tag[1]) {
      const pubkey = tag[1];
      if (!followTagMap.has(pubkey)) {
        const cloned = [...tag];
        followTagMap.set(pubkey, cloned);
        followOrder.push(pubkey);
      }
    } else {
      nonFollowTags.push([...tag]);
    }
  }

  return {
    nonFollowTags,
    followTagMap,
    followOrder,
  };
}

/**
 * Build a contact list's tags array given preserved non-follow tags,
 * follow ordering, and follow metadata.
 */
export function buildContactListTags(
  nonFollowTags: string[][],
  followOrder: Iterable<string>,
  followTagMap: Map<string, string[]>
): string[][] {
  const tags: string[][] = cloneTags(nonFollowTags);

  for (const pubkey of followOrder) {
    const stored = followTagMap.get(pubkey);
    if (stored) {
      tags.push([...stored]);
    } else {
      tags.push(['p', pubkey]);
    }
  }

  return tags;
}
