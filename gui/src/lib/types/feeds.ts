import type { NostrEvent } from './nostr';

export interface FeedFilter {
  id: string;
  name: string;
  enabled: boolean;
  
  // NIP-01 Filter fields
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  '#e'?: string[];
  '#p'?: string[];
  '#t'?: string[];
  since?: number;
  until?: number;
  limit?: number;
  
  // Custom fields for more specific filtering
  search?: string;
  minPow?: number;
  maxAge?: number; // Hours
  followsOnly?: boolean;
}

export interface FeedSortOption {
  id: string;
  name: string;
  field: keyof NostrEvent | 'pow' | 'age';
  direction: 'asc' | 'desc';
}

export interface FeedConfig {
  id: string;
  name: string;
  filters: FeedFilter[];
  sortBy: string; // ID of sort option
  autoRefresh: boolean;
  refreshInterval: number; // Minutes
  maxEvents: number;
  showPowValues: boolean;
  showRelativeTime: boolean;
  compactMode: boolean;
  relays?: string[]; // Optional relay URLs specific to this feed
}

export const DEFAULT_SORT_OPTIONS: FeedSortOption[] = [
  { id: 'newest', name: 'Newest First', field: 'created_at', direction: 'desc' },
  { id: 'oldest', name: 'Oldest First', field: 'created_at', direction: 'asc' },
  { id: 'highest_pow', name: 'Highest PoW', field: 'pow', direction: 'desc' },
  { id: 'lowest_pow', name: 'Lowest PoW', field: 'pow', direction: 'asc' },
  { id: 'author_asc', name: 'Author A-Z', field: 'pubkey', direction: 'asc' },
  { id: 'author_desc', name: 'Author Z-A', field: 'pubkey', direction: 'desc' }
];

export const DEFAULT_FEED_FILTERS: FeedFilter[] = [
  {
    id: 'text_notes',
    name: 'Text Notes',
    enabled: true,
    kinds: [1],
    limit: 100
  },
  {
    id: 'reactions',
    name: 'Reactions',
    enabled: false,
    kinds: [7],
    limit: 50
  },
  {
    id: 'reposts',
    name: 'Reposts',
    enabled: false,
    kinds: [6],
    limit: 50
  },
  {
    id: 'profiles',
    name: 'Profiles',
    enabled: false,
    kinds: [0],
    limit: 20
  },
  {
    id: 'contacts',
    name: 'Contact Lists',
    enabled: false,
    kinds: [3],
    limit: 20
  },
  {
    id: 'zaps',
    name: 'Zaps',
    enabled: false,
    kinds: [9735],
    limit: 100
  },
  {
    id: 'recent_only',
    name: 'Recent (24h)',
    enabled: true,
    maxAge: 24
  },
  {
    id: 'high_pow_only',
    name: 'High PoW (20+)',
    enabled: false,
    minPow: 20
  }
];

export const DEFAULT_FEED_CONFIG: FeedConfig = {
  id: 'default',
  name: 'Default Feed',
  filters: DEFAULT_FEED_FILTERS,
  sortBy: 'newest',
  autoRefresh: true,
  refreshInterval: 5,
  maxEvents: 200,
  showPowValues: true,
  showRelativeTime: true,
  compactMode: false,
  relays: ['wss://relay.damus.io', 'wss://relay.nostr.band'] // Start with popular relays
};

// Helper functions
export function buildNip01Filter(filters: FeedFilter[]): any[] {
  const activeFilters = filters.filter(f => f.enabled);
  
  if (activeFilters.length === 0) {
    // Default to text notes if no filters
    return [{ kinds: [1], limit: 100 }];
  }
  
  // Combine all active filters into NIP-01 filter objects
  const combinedFilter: any = {};
  
  // Collect all unique values for each filter field
  const kinds = new Set<number>();
  const authors = new Set<string>();
  const ids = new Set<string>();
  const eTags = new Set<string>();
  const pTags = new Set<string>();
  const tTags = new Set<string>();
  
  let minSince: number | undefined;
  let maxUntil: number | undefined;
  let maxLimit = 0;
  
  activeFilters.forEach(filter => {
    if (filter.kinds) filter.kinds.forEach(k => kinds.add(k));
    if (filter.authors) filter.authors.forEach(a => authors.add(a));
    if (filter.ids) filter.ids.forEach(i => ids.add(i));
    if (filter['#e']) filter['#e'].forEach(e => eTags.add(e));
    if (filter['#p']) filter['#p'].forEach(p => pTags.add(p));
    if (filter['#t']) filter['#t'].forEach(t => tTags.add(t));
    
    if (filter.since && (!minSince || filter.since > minSince)) {
      minSince = filter.since;
    }
    if (filter.until && (!maxUntil || filter.until < maxUntil)) {
      maxUntil = filter.until;
    }
    if (filter.limit && filter.limit > maxLimit) {
      maxLimit = filter.limit;
    }
    
    // Handle time-based filters
    if (filter.maxAge) {
      const cutoff = Math.floor(Date.now() / 1000) - (filter.maxAge * 3600);
      if (!minSince || cutoff > minSince) {
        minSince = cutoff;
      }
    }
  });
  
  // Build the filter object
  if (kinds.size > 0) combinedFilter.kinds = Array.from(kinds);
  if (authors.size > 0) combinedFilter.authors = Array.from(authors);
  if (ids.size > 0) combinedFilter.ids = Array.from(ids);
  if (eTags.size > 0) combinedFilter['#e'] = Array.from(eTags);
  if (pTags.size > 0) combinedFilter['#p'] = Array.from(pTags);
  if (tTags.size > 0) combinedFilter['#t'] = Array.from(tTags);
  
  if (minSince) combinedFilter.since = minSince;
  if (maxUntil) combinedFilter.until = maxUntil;
  if (maxLimit > 0) combinedFilter.limit = maxLimit;
  
  return [combinedFilter];
}

export function sortEvents(events: NostrEvent[], sortOption: FeedSortOption): NostrEvent[] {
  return [...events].sort((a, b) => {
    let aVal: any;
    let bVal: any;
    
    switch (sortOption.field) {
      case 'pow':
        aVal = (a as any).pow || 0;
        bVal = (b as any).pow || 0;
        break;
      case 'age':
        aVal = Date.now() / 1000 - a.created_at;
        bVal = Date.now() / 1000 - b.created_at;
        break;
      default:
        aVal = a[sortOption.field];
        bVal = b[sortOption.field];
    }
    
    if (sortOption.direction === 'desc') {
      return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
    } else {
      return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    }
  });
}

export function filterEvents(events: NostrEvent[], filters: FeedFilter[]): NostrEvent[] {
  const activeFilters = filters.filter(f => f.enabled);
  
  return events.filter(event => {
    return activeFilters.every(filter => {
      // Check PoW minimum
      if (filter.minPow !== undefined) {
        const eventPow = (event as any).pow || 0;
        if (eventPow < filter.minPow) return false;
      }
      
      // Check age
      if (filter.maxAge !== undefined) {
        const eventAge = (Date.now() / 1000 - event.created_at) / 3600;
        if (eventAge > filter.maxAge) return false;
      }
      
      // Check search term
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        if (!event.content.toLowerCase().includes(searchLower)) return false;
      }
      
      return true;
    });
  });
}