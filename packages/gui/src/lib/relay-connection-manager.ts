/**
 * Smart Relay Connection Manager
 *
 * Manages relay connections intelligently by:
 * 1. Maintaining baseline relays (DEFAULT, POW, PROFILE)
 * 2. Computing optimal relay coverage for timeline using selectOptimalRelays
 * 3. Cycling through relay batches when optimal set exceeds budget
 * 4. Tracking relay health with RelayLiveness
 */

import { createSignal } from 'solid-js';
import { RelayPool, RelayLiveness } from 'applesauce-relay';
import { selectOptimalRelays, groupPubkeysByRelay } from 'applesauce-core/helpers/relay-selection';
import type { ProfilePointer } from 'applesauce-core/helpers';
import localforage from 'localforage';
import { debug } from './debug';

// Configuration
export interface RelayConnectionManagerConfig {
  /** Maximum total relay connections */
  maxConnections: number;
  /** Maximum relays per user in optimal selection */
  maxRelaysPerUser: number;
  /** Enable debug logging */
  debugMode: boolean;
}

// Connection purpose tracking
interface ConnectionPurpose {
  id: string;
  relays: string[];
  type: 'baseline' | 'timeline' | 'metadata' | 'publish';
  createdAt: number;
}

// Relay connection state
interface RelayConnection {
  url: string;
  purposes: Set<string>; // Which purposes need this relay
  connectedAt: number;
  lastUsed: number;
}

// Stats for UI
export interface ConnectionStats {
  connected: number;
  totalCandidates: number;
  baselineRelays: number;
  optimalRelays: number;
  coverage: {
    totalUsers: number;
    coveredUsers: number;
    percentage: number;
  };
}

export class RelayConnectionManager {
  private relayPool: RelayPool;
  private liveness: RelayLiveness;
  private config: RelayConnectionManagerConfig;

  // State
  private purposes = new Map<string, ConnectionPurpose>();
  private connections = new Map<string, RelayConnection>();
  private baselineRelays = new Set<string>();

  // Reactive signals
  private statsSignal = createSignal<ConnectionStats>({
    connected: 0,
    totalCandidates: 0,
    baselineRelays: 0,
    optimalRelays: 0,
    coverage: { totalUsers: 0, coveredUsers: 0, percentage: 0 },
  });

  // Current optimal selection cache
  private currentAuthors: ProfilePointer[] = [];
  private currentOptimalRelays: string[] = [];

  constructor(relayPool: RelayPool, config: RelayConnectionManagerConfig) {
    this.relayPool = relayPool;
    this.config = config;

    // Initialize RelayLiveness
    this.liveness = new RelayLiveness({
      storage: localforage.createInstance({ name: 'relay-liveness' }),
      maxFailuresBeforeDead: 5,
      backoffBaseDelay: 30 * 1000, // 30 seconds
      backoffMaxDelay: 5 * 60 * 1000, // 5 minutes
    });

    // Load liveness data
    this.liveness.load().then(() => {
      this.log('RelayLiveness loaded');
    });

    // Connect liveness tracker to pool
    this.liveness.connectToPool(relayPool);
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<RelayConnectionManagerConfig>): void {
    this.config = { ...this.config, ...config };
    this.log('Configuration updated:', this.config);
    // Recompute connections with new limits
    this.recompute();
  }

  /**
   * Set baseline relays that should always be connected
   */
  setBaselineRelays(relays: string[]): void {
    this.log('Setting baseline relays:', relays);
    this.baselineRelays = new Set(relays);

    // Register baseline purpose
    this.registerPurpose('baseline', relays, 'baseline');
    this.recompute();
  }

  /**
   * Register a purpose that needs specific relays
   */
  registerPurpose(
    id: string,
    relays: string[],
    type: 'baseline' | 'timeline' | 'metadata' | 'publish' = 'timeline'
  ): void {
    // Filter out unhealthy relays
    const healthyRelays = this.liveness.filter(relays);

    this.purposes.set(id, {
      id,
      relays: healthyRelays,
      type,
      createdAt: Date.now(),
    });

    this.log(`Registered purpose "${id}" (${type}) with ${healthyRelays.length}/${relays.length} healthy relays`);
    this.recompute();
  }

  /**
   * Unregister a purpose (will disconnect relays if no longer needed)
   */
  unregisterPurpose(id: string): void {
    if (this.purposes.delete(id)) {
      this.log(`Unregistered purpose "${id}"`);
      this.recompute();
    }
  }

  /**
   * Update optimal relays for timeline based on visible authors
   */
  updateTimelineAuthors(authors: ProfilePointer[]): void {
    this.currentAuthors = authors;

    if (authors.length === 0) {
      this.log('No timeline authors, clearing optimal relays');
      this.currentOptimalRelays = [];
      this.unregisterPurpose('timeline-optimal');
      return;
    }

    // Filter unhealthy relays from authors
    const healthyAuthors = authors.map(author => ({
      ...author,
      relays: author.relays ? this.liveness.filter(author.relays) : [],
    }));

    // Calculate available budget (total - baseline)
    const baselineCount = Array.from(this.purposes.values())
      .filter(p => p.type === 'baseline')
      .reduce((acc, p) => acc + p.relays.length, 0);

    const availableBudget = Math.max(
      1,
      this.config.maxConnections - baselineCount
    );

    // Select optimal relays
    const selection = selectOptimalRelays(healthyAuthors, {
      maxConnections: availableBudget,
      maxRelaysPerUser: this.config.maxRelaysPerUser,
    });

    // Extract just the relay URLs
    const optimalRelays = Array.from(
      new Set(
        selection
          .flatMap(user => user.relays || [])
          .filter(Boolean)
      )
    );

    this.currentOptimalRelays = optimalRelays;

    // Calculate coverage stats
    const relayMap = groupPubkeysByRelay(selection);
    const coveredUsers = new Set(
      Object.values(relayMap).flat().map(p => p.pubkey)
    ).size;

    this.log(
      `Optimal selection: ${optimalRelays.length} relays covering ${coveredUsers}/${authors.length} users (${Math.round((coveredUsers / authors.length) * 100)}%)`
    );

    // Register optimal relays as timeline purpose
    this.registerPurpose('timeline-optimal', optimalRelays, 'timeline');

    // Update stats
    this.updateStats(authors.length, coveredUsers);
  }

  /**
   * Get currently connected relays
   */
  getConnectedRelays(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Get relays for a specific purpose
   */
  getRelaysForPurpose(purposeId: string): string[] {
    return this.purposes.get(purposeId)?.relays || [];
  }

  /**
   * Get connection statistics
   */
  getStats(): ConnectionStats {
    return this.statsSignal[0]();
  }

  /**
   * Force recomputation of connections
   */
  recompute(): void {
    // Collect all needed relays from all purposes
    const neededRelays = new Map<string, Set<string>>(); // relay -> Set<purposeId>

    for (const purpose of this.purposes.values()) {
      for (const relay of purpose.relays) {
        if (!neededRelays.has(relay)) {
          neededRelays.set(relay, new Set());
        }
        neededRelays.get(relay)!.add(purpose.id);
      }
    }

    // Determine which relays to connect/disconnect
    const shouldConnect = new Set<string>();
    const shouldDisconnect = new Set<string>();

    // Check if we need to apply budget limits
    if (neededRelays.size <= this.config.maxConnections) {
      // Under budget, connect to all needed relays
      for (const relay of neededRelays.keys()) {
        shouldConnect.add(relay);
      }
    } else {
      // Over budget, prioritize by:
      // 1. Baseline relays (always)
      // 2. Relays serving multiple purposes
      // 3. Relays with best health scores

      const relayPriorities = Array.from(neededRelays.entries()).map(([relay, purposes]) => {
        const isBaseline = this.baselineRelays.has(relay);
        const purposeCount = purposes.size;
        const healthState = this.liveness.getState(relay);
        const healthScore = healthState?.state === 'online' ? 2 : healthState?.state === 'offline' ? 1 : 0;

        return {
          relay,
          priority: (isBaseline ? 1000 : 0) + (purposeCount * 10) + healthScore,
          purposes,
        };
      });

      // Sort by priority and take top N
      relayPriorities.sort((a, b) => b.priority - a.priority);
      const topRelays = relayPriorities.slice(0, this.config.maxConnections);

      for (const { relay } of topRelays) {
        shouldConnect.add(relay);
      }

      this.log(
        `Budget exceeded: ${neededRelays.size} needed, ${this.config.maxConnections} allowed. ` +
        `Prioritizing top ${topRelays.length} relays.`
      );
    }

    // Determine what to disconnect
    for (const relay of this.connections.keys()) {
      if (!shouldConnect.has(relay)) {
        shouldDisconnect.add(relay);
      }
    }

    // Execute connections
    for (const relay of shouldConnect) {
      this.connect(relay, neededRelays.get(relay)!);
    }

    // Execute disconnections
    for (const relay of shouldDisconnect) {
      this.disconnect(relay);
    }

    // Update stats
    this.updateStats();
  }

  /**
   * Connect to a relay
   */
  private connect(relay: string, purposes: Set<string>): void {
    const existing = this.connections.get(relay);

    if (existing) {
      // Already connected, just update purposes
      for (const purposeId of purposes) {
        existing.purposes.add(purposeId);
      }
      existing.lastUsed = Date.now();
      return;
    }

    // New connection
    this.log(`Connecting to ${relay} (purposes: ${Array.from(purposes).join(', ')})`);

    // Add to pool (will create connection if not exists)
    this.relayPool.relay(relay);

    // Track connection
    this.connections.set(relay, {
      url: relay,
      purposes: new Set(purposes),
      connectedAt: Date.now(),
      lastUsed: Date.now(),
    });
  }

  /**
   * Disconnect from a relay
   */
  private disconnect(relay: string): void {
    const connection = this.connections.get(relay);
    if (!connection) return;

    this.log(`Disconnecting from ${relay}`);

    // Remove from pool
    this.relayPool.remove(relay, true);

    // Remove tracking
    this.connections.delete(relay);
  }

  /**
   * Update statistics
   */
  private updateStats(totalUsers?: number, coveredUsers?: number): void {
    const allRelays = new Set<string>();
    for (const purpose of this.purposes.values()) {
      for (const relay of purpose.relays) {
        allRelays.add(relay);
      }
    }

    const baselineCount = Array.from(this.purposes.values())
      .filter(p => p.type === 'baseline')
      .reduce((acc, p) => acc + new Set(p.relays).size, 0);

    const optimalCount = this.currentOptimalRelays.length;

    this.statsSignal[1]({
      connected: this.connections.size,
      totalCandidates: allRelays.size,
      baselineRelays: baselineCount,
      optimalRelays: optimalCount,
      coverage: {
        totalUsers: totalUsers ?? this.currentAuthors.length,
        coveredUsers: coveredUsers ?? 0,
        percentage: totalUsers && coveredUsers
          ? Math.round((coveredUsers / totalUsers) * 100)
          : 0,
      },
    });
  }

  /**
   * Debug logging
   */
  private log(...args: any[]): void {
    if (this.config.debugMode) {
      debug('[RelayConnectionManager]', ...args);
    }
  }

  /**
   * Get stats signal for reactive UI
   */
  get stats$() {
    return this.statsSignal[0];
  }

  /**
   * Get liveness tracker for UI
   */
  get liveness$() {
    return this.liveness;
  }
}
