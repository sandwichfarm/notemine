import type { NostrEvent } from './nostr';

export interface Nip01Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  search?: string; // Extension for client-side text search
  [key: `#${string}`]: string[] | undefined;
}

export interface FilterPreset {
  id: string;
  name: string;
  description?: string;
  filters: Nip01Filter[];
  createdAt: number;
  updatedAt: number;
  isDefault?: boolean;
}

export interface FilterState {
  activeFilters: Nip01Filter[];
  presets: FilterPreset[];
}

export const DEFAULT_PRESETS: FilterPreset[] = [
  {
    id: 'all-pow-notes',
    name: 'All PoW Notes',
    description: 'All text notes with proof-of-work',
    filters: [{
      kinds: [1],
      '#nonce': ['*'],
      limit: 100
    }],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'recent-24h',
    name: 'Last 24 Hours',
    description: 'All notes from the last 24 hours',
    filters: [{
      kinds: [1],
      since: Math.floor(Date.now() / 1000) - 86400,
      limit: 200
    }],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'text-and-replies',
    name: 'Notes & Replies',
    description: 'Text notes and comment threads',
    filters: [{
      kinds: [1, 1111],
      limit: 150
    }],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  {
    id: 'reactions',
    name: 'Reactions & Zaps',
    description: 'All reactions, likes, and zaps',
    filters: [{
      kinds: [7, 9735],
      limit: 50
    }],
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
];

export function createEmptyFilter(): Nip01Filter {
  return {
    kinds: [1]
  };
}

export function validateFilter(filter: Nip01Filter): string[] {
  const errors: string[] = [];

  if (filter.ids) {
    filter.ids.forEach((id, i) => {
      if (!/^[a-f0-9]{64}$/.test(id)) {
        errors.push(`Invalid event ID at position ${i}: must be 64 lowercase hex characters`);
      }
    });
  }

  if (filter.authors) {
    filter.authors.forEach((author, i) => {
      if (!/^[a-f0-9]{64}$/.test(author)) {
        errors.push(`Invalid author pubkey at position ${i}: must be 64 lowercase hex characters`);
      }
    });
  }

  if (filter.since && filter.until && filter.since > filter.until) {
    errors.push('Since timestamp cannot be greater than until timestamp');
  }

  return errors;
}

export function matchesFilter(event: NostrEvent, filter: Nip01Filter): boolean {
  if (filter.ids && !filter.ids.includes(event.id)) {
    return false;
  }

  if (filter.authors && !filter.authors.includes(event.pubkey)) {
    return false;
  }

  if (filter.kinds && !filter.kinds.includes(event.kind)) {
    return false;
  }

  if (filter.since && event.created_at < filter.since) {
    return false;
  }

  if (filter.until && event.created_at > filter.until) {
    return false;
  }

  // Client-side search extension
  if (filter.search && !event.content.toLowerCase().includes(filter.search.toLowerCase())) {
    return false;
  }

  // Check tag filters
  for (const [key, values] of Object.entries(filter)) {
    if (key.startsWith('#') && values && Array.isArray(values)) {
      const tagName = key.slice(1);
      const eventTagValues = event.tags
        .filter(tag => tag[0] === tagName)
        .map(tag => tag[1])
        .filter(Boolean);

      if (values.includes('*')) {
        // Wildcard means "has this tag"
        if (eventTagValues.length === 0) return false;
      } else {
        // Must have at least one matching value
        const hasMatch = values.some(v => eventTagValues.includes(v));
        if (!hasMatch) return false;
      }
    }
  }

  return true;
}

export function matchesAnyFilter(event: NostrEvent, filters: Nip01Filter[]): boolean {
  return filters.some(filter => matchesFilter(event, filter));
}