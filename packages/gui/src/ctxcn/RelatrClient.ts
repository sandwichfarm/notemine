import { Client } from "@modelcontextprotocol/sdk/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  NostrClientTransport,
  type NostrTransportOptions,
  PrivateKeySigner,
  ApplesauceRelayPool,
} from "@contextvm/sdk";

export interface CalculateTrustScoreInput {
  targetPubkey: string;
  /**
   * Weighting scheme: 'default' (balanced), 'conservative' (higher profile validation), 'progressive' (higher social distance), 'balanced'
   */
  weightingScheme?: "default" | "social" | "validation" | "strict";
}

export interface CalculateTrustScoreOutput {
  trustScore: {
    sourcePubkey: string;
    targetPubkey: string;
    score: number;
    components: {
      distanceWeight: number;
      validators: {
        [k: string]: number;
      };
      socialDistance: number;
      normalizedDistance: number;
    };
    computedAt: number;
  };
  computationTimeMs: number;
}

export type StatsInput = Record<string, unknown>;

export interface StatsOutput {
  timestamp: number;
  sourcePubkey: string;
  database: {
    metrics: {
      totalEntries: number;
    };
    metadata: {
      totalEntries: number;
    };
  };
  socialGraph: {
    stats: {
      users: number;
      follows: number;
    };
    rootPubkey: string;
  };
}

export interface SearchProfilesInput {
  query: string;
  /**
   * Maximum number of results to return (default: 20)
   */
  limit?: number;
  /**
   * Weighting scheme: 'default' (balanced), 'social' (higher social distance), 'validation' (higher profile validation), 'strict' (highest requirements)
   */
  weightingScheme?: "default" | "social" | "validation" | "strict";
  /**
   * Whether to extend the search to Nostr to fill remaining results. Defaults to false. If false, Nostr will only be queried when local DB returns zero results.
   */
  extendToNostr?: boolean;
}

export interface SearchProfilesOutput {
  results: {
    pubkey: string;
    trustScore: number;
    rank: number;
    exactMatch?: boolean;
  }[];
  totalFound: number;
  searchTimeMs: number;
}

export type Relatr = {
  CalculateTrustScore: (targetPubkey: string, weightingScheme?: string) => Promise<CalculateTrustScoreOutput>;
  Stats: (args: StatsInput) => Promise<StatsOutput>;
  SearchProfiles: (query: string, limit?: number, weightingScheme?: string, extendToNostr?: boolean) => Promise<SearchProfilesOutput>;
};

export class RelatrClient implements Relatr {
  static readonly SERVER_PUBKEY = "750682303c9f0ddad75941b49edc9d46e3ed306b9ee3335338a21a3e404c5fa3";
  private client: Client;
  private transport: Transport;

  constructor(
    options: Partial<NostrTransportOptions> & { privateKey?: string; relays?: string[] } = {}
  ) {
    this.client = new Client({
      name: "RelatrClient",
      version: "1.0.0",
    });

    const {
      privateKey,
      relays = ["ws://localhost:10547"],
      signer = new PrivateKeySigner(privateKey || ""),
      relayHandler = new ApplesauceRelayPool(relays),
 			serverPubkey,
      ...rest
    } = options;

    this.transport = new NostrClientTransport({
      serverPubkey: serverPubkey || RelatrClient.SERVER_PUBKEY,
      signer,
      relayHandler,
      isStateless: true,
      ...rest,
    });

    // Auto-connect in constructor
    this.client.connect(this.transport).catch((error) => {
      console.error(`Failed to connect to server: ${error}`);
    });
  }

  async disconnect(): Promise<void> {
    await this.transport.close();
  }

  private async call<T = unknown>(
    name: string,
    args: Record<string, unknown>
  ): Promise<T> {
    const result = await this.client.callTool({
      name,
      arguments: { ...args },
    });
    return result.structuredContent as T;
  }

    /**
   * Compute trust score for a Nostr pubkey using social graph analysis and profile validation. Only target pubkey is required - all other parameters are optional.
   * @param {string} targetPubkey The target pubkey parameter
   * @param {string} weightingScheme [optional] Weighting scheme: 'default' (balanced), 'conservative' (higher profile validation), 'progressive' (higher social distance), 'balanced'
   * @returns {Promise<CalculateTrustScoreOutput>} The result of the calculate_trust_score operation
   */
  async CalculateTrustScore(
    targetPubkey: string, weightingScheme?: string
  ): Promise<CalculateTrustScoreOutput> {
    return this.call("calculate_trust_score", { targetPubkey, weightingScheme });
  }

    /**
   * Get comprehensive statistics about the Relatr service including database stats, social graph stats, and the source public key
   * @returns {Promise<StatsOutput>} The result of the stats operation
   */
  async Stats(
    args: StatsInput
  ): Promise<StatsOutput> {
    return this.call("stats", args);
  }

    /**
   * Search for Nostr profiles by name/query and return results sorted by trust score. Queries metadata relays and calculates trust scores for each result.
   * @param {string} query The query parameter
   * @param {number} limit [optional] Maximum number of results to return (default: 20)
   * @param {string} weightingScheme [optional] Weighting scheme: 'default' (balanced), 'social' (higher social distance), 'validation' (higher profile validation), 'strict' (highest requirements)
   * @param {boolean} extendToNostr [optional] Whether to extend the search to Nostr to fill remaining results. Defaults to false. If false, Nostr will only be queried when local DB returns zero results.
   * @returns {Promise<SearchProfilesOutput>} The result of the search_profiles operation
   */
  async SearchProfiles(
    query: string, limit?: number, weightingScheme?: string, extendToNostr?: boolean
  ): Promise<SearchProfilesOutput> {
    return this.call("search_profiles", { query, limit, weightingScheme, extendToNostr });
  }
}

/**
 * Default singleton instance of RelatrClient is not exported here.
 * Use the useRelatr() hook instead, which creates a properly configured instance.
 *
 * @example
 * import { useRelatrSearch } from '../hooks/useRelatr';
 * const { searchProfiles } = useRelatrSearch();
 */
