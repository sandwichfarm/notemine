import { createSignal } from 'solid-js';
import { RelatrClient, type SearchProfilesOutput } from '../ctxcn/RelatrClient';

let relatrClient: RelatrClient | null = null;

// Initialize Relatr client (singleton)
function getRelatrClient(): RelatrClient {
  if (!relatrClient) {
    relatrClient = new RelatrClient({
      relays: ['wss://relay.contextvm.org'],
    });
  }
  return relatrClient;
}

export interface ProfileSearchResult {
  pubkey: string;
  trustScore: number;
  rank: number;
  exactMatch?: boolean;
  metadata?: {
    name?: string;
    display_name?: string;
    picture?: string;
    nip05?: string;
  };
}

/**
 * Hook to search for Nostr profiles using Relatr
 */
export function useRelatrSearch() {
  const [searching, setSearching] = createSignal(false);
  const [results, setResults] = createSignal<ProfileSearchResult[]>([]);
  const [error, setError] = createSignal<string | null>(null);

  const searchProfiles = async (query: string, limit = 10): Promise<ProfileSearchResult[]> => {
    if (!query || query.trim().length === 0) {
      setResults([]);
      return [];
    }

    setSearching(true);
    setError(null);

    try {
      const client = getRelatrClient();
      const response = await client.SearchProfiles(query, limit, 'default', true);

      const searchResults = response.results.map(result => ({
        pubkey: result.pubkey,
        trustScore: result.trustScore,
        rank: result.rank,
        exactMatch: result.exactMatch,
      }));

      setResults(searchResults);
      return searchResults;
    } catch (err) {
      const errorMessage = String(err);
      console.error('[Relatr] Search error:', err);
      setError(errorMessage);
      setResults([]);
      return [];
    } finally {
      setSearching(false);
    }
  };

  return {
    searchProfiles,
    searching,
    results,
    error,
  };
}
