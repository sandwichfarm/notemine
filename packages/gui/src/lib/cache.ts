/**
 * Local cache using Turso WASM SQLite
 * Provides persistent storage for Nostr events in the browser
 */

import { Database } from '@tursodatabase/database-wasm';
import { TursoWasmEventDatabase } from 'applesauce-sqlite/turso-wasm';
import { AsyncEventStore } from 'applesauce-core/event-store';
import { persistEventsToCache } from 'applesauce-core/helpers';
import { debug } from '../lib/debug';

let cacheDatabase: TursoWasmEventDatabase | null = null;
let cacheEventStore: AsyncEventStore | null = null;
let persistUnsubscribe: (() => void) | null = null;
let flushEventsFunction: (() => Promise<void>) | null = null;

/**
 * Retention configuration for cache compaction
 * Phase 2: Tiered retention with budgets per kind
 */
export interface RetentionConfig {
  /** Maximum total events across all kinds */
  maxTotalEvents: number;
  /** User pubkey for P0 pinning (user's own 0/3/10002) */
  userPubkey?: string;
  /** Follows pubkeys for P0 pinning (their 10002 relay lists) */
  followsPubkeys?: string[];
  /** Per-kind retention rules */
  kinds: {
    [kind: number]: {
      /** Maximum number of events to keep for this kind */
      maxCount?: number;
      /** Time-to-live in days (delete older than this) */
      ttlDays?: number;
      /** Maximum events per author for this kind */
      perAuthorMax?: number;
      /** Pubkeys to pin (never delete) for this kind */
      pinAuthors?: string[];
    };
  };
}

/** Default retention configuration - Phase 2 budgets */
const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  maxTotalEvents: 100_000, // Global limit
  kinds: {
    // P0 pinned: User's own replaceables (no limits, handled separately)
    0: { perAuthorMax: 1, ttlDays: 90 }, // Metadata: latest per author, 90d safety
    3: { perAuthorMax: 1, ttlDays: 90 }, // Contacts: latest per author, 90d safety
    10002: { perAuthorMax: 1, ttlDays: 90 }, // Relay lists: latest per author, 90d safety

    // P1 hot content: Recent notes and long-form (+ follows' profiles)
    1: { maxCount: 50_000, ttlDays: 14, perAuthorMax: 1000 }, // Notes: 50k or 14 days
    30023: { maxCount: 1_000, ttlDays: 60, perAuthorMax: 100 }, // Long-form: 1k or 60 days
    // Follows' kind 0 protected in P1 tier (handled in compaction)

    // P2 supporting: Reactions and reposts
    7: { ttlDays: 30 }, // Reactions: 30 days if linked to kept root, else 7 days
    6: { ttlDays: 30 }, // Reposts: 30 days if linked to kept root, else 14 days
  },
};

let retentionConfig: RetentionConfig = { ...DEFAULT_RETENTION_CONFIG };
let compactionTimer: any = null;

/**
 * Cache metrics for diagnostics
 * Phase 4: Performance and health monitoring
 */
export interface CacheMetrics {
  // Ingestion metrics
  pendingQueueDepth: number;
  totalEventsWritten: number;
  lastFlushDurationMs: number;
  lastFlushTimestamp: number;
  flushErrorCount: number;
  cacheHits: number;    // events added to EventStore from cache
  cacheMisses: number;  // events added to EventStore from network/user (not from cache)

  // Compaction metrics
  compactionRuns: number;
  lastCompactionDurationMs: number;
  lastCompactionTimestamp: number;
  totalEventsDeleted: number;
  lastCompactionStats: {
    eventsBefore: number;
    eventsAfter: number;
    pinnedCount: number;
    cascadeDeleted: number;
  } | null;

  // Error tracking
  quotaErrorCount: number;
  lastQuotaError: number | null;
  persistenceDisabled: boolean;

  // Health indicators
  maxQueueDepthSeen: number;
  avgFlushDurationMs: number;
}

const cacheMetrics: CacheMetrics = {
  pendingQueueDepth: 0,
  totalEventsWritten: 0,
  lastFlushDurationMs: 0,
  lastFlushTimestamp: 0,
  flushErrorCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  compactionRuns: 0,
  lastCompactionDurationMs: 0,
  lastCompactionTimestamp: 0,
  totalEventsDeleted: 0,
  lastCompactionStats: null,
  quotaErrorCount: 0,
  lastQuotaError: null,
  persistenceDisabled: false,
  maxQueueDepthSeen: 0,
  avgFlushDurationMs: 0,
};

let flushDurations: number[] = []; // Rolling window for avg calculation
const MAX_FLUSH_HISTORY = 10;
// Guard to avoid nested transactions between batch flush and add-hook writes
let isBatchFlushInProgress = false;
// Disable direct writes from add-hook in production to avoid nested transactions.
// Batch persistence via persistEventsToCache is sufficient and safer.
const ENABLE_ADD_HOOK_PERSIST = false;

// De-duplication for recent event IDs to avoid double-writes (persist helper + add hook)
const RECENT_ID_MAX = 10000;
const recentIdQueue: string[] = [];
const recentIdSet = new Set<string>();

function rememberEventId(id: string) {
  if (recentIdSet.has(id)) return;
  recentIdSet.add(id);
  recentIdQueue.push(id);
  if (recentIdQueue.length > RECENT_ID_MAX) {
    const old = recentIdQueue.shift();
    if (old) recentIdSet.delete(old);
  }
}

function isRecentId(id: string): boolean {
  return recentIdSet.has(id);
}

function isDuplicateConstraint(error: unknown): boolean {
  const s = String(error || '').toLowerCase();
  // Match various sqlite/turso duplicate/constraint phrasings
  return (
    s.includes('unique constraint') ||
    s.includes('constraint failed') ||
    s.includes('sqlite_constraint') ||
    s.includes('already exists') ||
    s.includes('duplicate')
  );
}

// Phase 4: Multi-tab coordination
let leaderElectionChannel: BroadcastChannel | null = null;
let isCompactionLeader = false;
let leaderHeartbeatInterval: any = null;
const LEADER_HEARTBEAT_MS = 5000;
const LEADER_TIMEOUT_MS = 10000;

/**
 * Initialize the local cache database
 * Uses IndexedDB via Turso WASM for browser-based SQLite storage
 */
export async function initializeCache(): Promise<AsyncEventStore> {
  debug('[Cache] Initializing local cache...');

  try {
    // Create database instance with IndexedDB backend
    const db = new Database(':notemine-cache:');

    // Connect to the database
    debug('[Cache] Connecting to database...');
    await db.connect();

    // Initialize the event database
    debug('[Cache] Creating TursoWasmEventDatabase...');
    cacheDatabase = await TursoWasmEventDatabase.fromDatabase(db);

    // Create AsyncEventStore with the database
    cacheEventStore = new AsyncEventStore(cacheDatabase);

    debug('[Cache] Local cache initialized successfully');

    return cacheEventStore;
  } catch (error) {
    console.error('[Cache] Failed to initialize cache:', error);
    throw error;
  }
}

/**
 * Set up automatic persistence from the main EventStore to the cache
 *
 * Phase 1 improvements:
 * - Uses persistEventsToCache helper (known-working API)
 * - Tuned batching: 1000ms interval (down from 5000ms), maxBatchSize 1000 (up from 100)
 * - Enhanced with metrics tracking and quota error handling
 *
 * Fix: Reverted from insert$ to persistEventsToCache for API safety
 */
export function setupCachePersistence(mainEventStore: any): void {
  if (!cacheDatabase) {
    console.warn('[Cache] Cache not initialized, skipping persistence setup');
    return;
  }

  debug('[Cache] Setting up cache persistence...');

  // Metrics-enhanced flush handler
  async function metricsFlushHandler(events: any[]) {
    if (!cacheDatabase || cacheMetrics.persistenceDisabled) {
      return;
    }

    const startTime = Date.now();
    let totalWritten = 0;
    let quotaErrorDetected = false;

    // Prevent nested transactions from concurrent add-hook writes
    isBatchFlushInProgress = true;

    // Phase 4: Update queue depth estimate
    cacheMetrics.pendingQueueDepth = events.length;
    if (events.length > cacheMetrics.maxQueueDepthSeen) {
      cacheMetrics.maxQueueDepthSeen = events.length;
    }

    try {
      // Insert batch into cache with de-duplication and quota error detection
      for (const event of events) {
        try {
          if (event?.id && isRecentId(event.id)) {
            continue; // already handled recently
          }
          await cacheDatabase.add(event);
          totalWritten++;
          if (event?.id) rememberEventId(event.id);
        } catch (error) {
          if (isDuplicateConstraint(error)) {
            if (event?.id) rememberEventId(event.id);
            continue; // ignore duplicates
          }
          const errorStr = String(error);

          // Phase 4: Detect quota errors
          if (errorStr.includes('quota') || errorStr.includes('QuotaExceededError') || errorStr.includes('storage')) {
            quotaErrorDetected = true;
            cacheMetrics.quotaErrorCount++;
            cacheMetrics.lastQuotaError = Date.now();
            console.error('[Cache] Storage quota exceeded - disabling persistence temporarily');
            debug('[Cache] Quota error details:', error);
            break;
          }

          // Fallback: if event exists in DB, treat as duplicate
          if (event?.id) {
            try {
              const existing = await cacheDatabase.getByFilters([{ ids: [event.id] }]);
              if (existing && existing.length > 0) {
                rememberEventId(event.id);
                continue;
              }
            } catch (e) {
              // Ignore lookup failure; will count as error below
            }
          }

          cacheMetrics.flushErrorCount++;
          console.error('[Cache] Error persisting event:', error);
        }
      }

      // Phase 4: Handle quota errors
      if (quotaErrorDetected) {
        cacheMetrics.persistenceDisabled = true;
        console.warn('[Cache] Persistence disabled due to quota error - triggering compaction');

        // Trigger compaction to free space
        setTimeout(() => {
          compactCache().then(() => {
            // Re-enable persistence after compaction
            cacheMetrics.persistenceDisabled = false;
            debug('[Cache] Persistence re-enabled after compaction');
          });
        }, 1000);
      }

      const duration = Date.now() - startTime;

      // Phase 4: Update metrics
      cacheMetrics.totalEventsWritten += totalWritten;
      cacheMetrics.lastFlushDurationMs = duration;
      cacheMetrics.lastFlushTimestamp = Date.now();
      cacheMetrics.pendingQueueDepth = 0; // Flushed

      // Track rolling average of flush durations
      flushDurations.push(duration);
      if (flushDurations.length > MAX_FLUSH_HISTORY) {
        flushDurations.shift();
      }
      cacheMetrics.avgFlushDurationMs =
        flushDurations.reduce((sum, d) => sum + d, 0) / flushDurations.length;

      if (totalWritten > 0) {
        debug(`[Cache] Flush complete: ${totalWritten}/${events.length} events written in ${duration}ms (avg: ${cacheMetrics.avgFlushDurationMs.toFixed(1)}ms)`);
      }
    } catch (error) {
      cacheMetrics.flushErrorCount++;
      console.error('[Cache] Error during flush:', error);
    } finally {
      // Release the guard even if errors occurred
      isBatchFlushInProgress = false;
    }
  }

  // Store flush handler reference for forceCacheFlush (Phase 3)
  let pendingFlush: any[] = [];
  flushEventsFunction = async () => {
    if (pendingFlush.length > 0) {
      await metricsFlushHandler(pendingFlush);
      pendingFlush = [];
    }
  };

  // Use persistEventsToCache with our metrics-enhanced handler
  persistUnsubscribe = persistEventsToCache(
    mainEventStore,
    async (events) => {
      // Queue events for force flush capability
      pendingFlush = events;
      await metricsFlushHandler(events);
    },
    {
      batchTime: 1000, // 1000ms interval (Phase 1 tuning)
      maxBatchSize: 1000, // 1000 events per batch (Phase 1 tuning)
    }
  );

  debug('[Cache] Cache persistence enabled with persistEventsToCache helper');

  // Safety net: also monkey-patch eventStore.add to ensure we catch everything
  if (typeof mainEventStore.add === 'function') {
    const originalAdd = mainEventStore.add.bind(mainEventStore);
    mainEventStore.add = (event: any, fromCache?: boolean) => {
      // Track cache hit/miss
      if (fromCache === true) {
        cacheMetrics.cacheHits += 1;
      } else {
        cacheMetrics.cacheMisses += 1;
      }

      const result = originalAdd(event, fromCache);
      // Avoid nested transactions: prefer batch persistence only
      if (
        ENABLE_ADD_HOOK_PERSIST &&
        !fromCache &&
        cacheDatabase &&
        !cacheMetrics.persistenceDisabled &&
        !isBatchFlushInProgress
      ) {
        // Skip if recently seen (already persisted via batch path)
        if (event?.id && isRecentId(event.id)) {
          return result;
        }
        // Fire-and-forget; metrics reflect successful writes only
        cacheDatabase
          .add(event)
          .then(() => {
            cacheMetrics.totalEventsWritten += 1;
            cacheMetrics.lastFlushDurationMs = 0;
            cacheMetrics.lastFlushTimestamp = Date.now();
            if (event?.id) rememberEventId(event.id);
          })
          .catch(async (error: any) => {
            if (isDuplicateConstraint(error)) return; // ignore duplicates
            const errorStr = String(error);
            if (errorStr.includes('quota') || errorStr.includes('QuotaExceededError') || errorStr.includes('storage')) {
              cacheMetrics.persistenceDisabled = true;
              cacheMetrics.quotaErrorCount++;
              cacheMetrics.lastQuotaError = Date.now();
              console.error('[Cache] Storage quota exceeded (add) - disabling temporarily');
              setTimeout(() => {
                compactCache().then(() => (cacheMetrics.persistenceDisabled = false));
              }, 1000);
              return;
            }
            // Fallback: check if event exists and suppress error if so
            if (event?.id && cacheDatabase) {
              try {
                const existing = await cacheDatabase.getByFilters([{ ids: [event.id] }]);
                if (existing && existing.length > 0) {
                  rememberEventId(event.id);
                  return;
                }
              } catch (e) {
                // ignore
              }
            }
            cacheMetrics.flushErrorCount++;
            console.error('[Cache] Error persisting event (add hook):', error);
          });
      }
      return result;
    };
  }
}

/**
 * Load cached events into the main EventStore
 * This populates the event store with previously cached events on startup
 *
 * Phase 1 expansion: Loads more kinds with higher limits for comprehensive warm start
 */
export async function loadCachedEvents(mainEventStore: any): Promise<number> {
  if (!cacheDatabase) {
    console.warn('[Cache] Cache not initialized, skipping load');
    return 0;
  }

  debug('[Cache] Loading cached events...');

  try {
    // Load kind 1 notes (expanded from 1000 to 2000)
    const cachedNotes = await cacheDatabase.getByFilters([
      { kinds: [1], limit: 2000 },
    ]);

    // Load kind 30023 long-form content (expanded from 100 to 200)
    const cachedLongForm = await cacheDatabase.getByFilters([
      { kinds: [30023], limit: 200 },
    ]);

    // Load kind 0 metadata (expanded from 500 to 2000)
    const cachedMetadata = await cacheDatabase.getByFilters([
      { kinds: [0], limit: 2000 },
    ]);

    // Load kind 3 contacts/follows (NEW - Phase 1)
    const cachedContacts = await cacheDatabase.getByFilters([
      { kinds: [3], limit: 1000 },
    ]);

    // Load kind 6 reposts (NEW - Phase 1)
    const cachedReposts = await cacheDatabase.getByFilters([
      { kinds: [6], limit: 500 },
    ]);

    // Load kind 7 reactions (expanded from 1000 to 2000)
    const cachedReactions = await cacheDatabase.getByFilters([
      { kinds: [7], limit: 2000 },
    ]);

    // Load kind 10002 relay lists (NEW - Phase 1)
    const cachedRelayLists = await cacheDatabase.getByFilters([
      { kinds: [10002], limit: 2000 },
    ]);

    const allEvents = [
      ...cachedNotes,
      ...cachedLongForm,
      ...cachedMetadata,
      ...cachedContacts,
      ...cachedReposts,
      ...cachedReactions,
      ...cachedRelayLists,
    ];

    // Add each event to the main event store with cache marker
    let loadedCount = 0;
    for (const event of allEvents) {
      try {
        // Mark event as from cache
        mainEventStore.add(event, true);
        loadedCount++;
      } catch (error) {
        // Ignore errors (likely duplicates)
      }
    }

    debug(`[Cache] Loaded ${loadedCount} cached events (1:${cachedNotes.length}, 0:${cachedMetadata.length}, 3:${cachedContacts.length}, 6:${cachedReposts.length}, 7:${cachedReactions.length}, 10002:${cachedRelayLists.length}, 30023:${cachedLongForm.length})`);
    return loadedCount;
  } catch (error) {
    console.error('[Cache] Error loading cached events:', error);
    return 0;
  }
}

/**
 * Clear all cached data
 */
export async function clearCache(): Promise<void> {
  if (!cacheDatabase) {
    console.warn('[Cache] Cache not initialized');
    return;
  }

  debug('[Cache] Clearing cache...');

  try {
    await cacheDatabase.removeByFilters([{}]);
    debug('[Cache] Cache cleared');
  } catch (error) {
    console.error('[Cache] Error clearing cache:', error);
    throw error;
  }
}

/**
 * Get cache statistics
 *
 * Phase 1 expansion: Counts all cached kinds (1, 0, 3, 6, 7, 10002, 30023)
 */
export async function getCacheStats(): Promise<{
  notes: number;          // kind 1
  metadata: number;       // kind 0
  contacts: number;       // kind 3
  reposts: number;        // kind 6
  reactions: number;      // kind 7
  relayLists: number;     // kind 10002
  longForm: number;       // kind 30023
  total: number;
}> {
  if (!cacheDatabase) {
    return {
      notes: 0,
      metadata: 0,
      contacts: 0,
      reposts: 0,
      reactions: 0,
      relayLists: 0,
      longForm: 0,
      total: 0,
    };
  }

  try {
    const notes = await cacheDatabase.getByFilters([{ kinds: [1] }]);
    const metadata = await cacheDatabase.getByFilters([{ kinds: [0] }]);
    const contacts = await cacheDatabase.getByFilters([{ kinds: [3] }]);
    const reposts = await cacheDatabase.getByFilters([{ kinds: [6] }]);
    const reactions = await cacheDatabase.getByFilters([{ kinds: [7] }]);
    const relayLists = await cacheDatabase.getByFilters([{ kinds: [10002] }]);
    const longForm = await cacheDatabase.getByFilters([{ kinds: [30023] }]);

    const total =
      notes.length +
      metadata.length +
      contacts.length +
      reposts.length +
      reactions.length +
      relayLists.length +
      longForm.length;

    return {
      notes: notes.length,
      metadata: metadata.length,
      contacts: contacts.length,
      reposts: reposts.length,
      reactions: reactions.length,
      relayLists: relayLists.length,
      longForm: longForm.length,
      total,
    };
  } catch (error) {
    console.error('[Cache] Error getting cache stats:', error);
    return {
      notes: 0,
      metadata: 0,
      contacts: 0,
      reposts: 0,
      reactions: 0,
      relayLists: 0,
      longForm: 0,
      total: 0,
    };
  }
}

/**
 * Close the cache database connection
 * Phase 4: Also stops leader election
 */
export async function closeCache(): Promise<void> {
  if (persistUnsubscribe) {
    persistUnsubscribe();
    persistUnsubscribe = null;
  }

  if (compactionTimer) {
    clearInterval(compactionTimer);
    compactionTimer = null;
  }

  // Phase 4: Stop leader election
  stopLeaderElection();

  if (cacheDatabase) {
    await cacheDatabase.close();
    cacheDatabase = null;
    cacheEventStore = null;
    debug('[Cache] Cache closed');
  }
}

/**
 * Compact the cache according to retention policy
 * Phase 2: Priority-based retention with cascade deletion
 */
async function compactCache(): Promise<void> {
  if (!cacheDatabase) {
    debug('[Cache] Compaction skipped - cache not initialized');
    return;
  }

  const startTime = Date.now();
  debug('[Cache] Starting compaction...');

  try {
    const stats = {
      totalBefore: 0,
      totalAfter: 0,
      deletedByKind: {} as Record<number, number>,
      pinnedCount: 0,
      cascadeDeleted: 0,
    };

    // Get initial total count
    const allEventsBefore = await cacheDatabase.getByFilters([{}]);
    stats.totalBefore = allEventsBefore.length;

    // Step 1: Pin P0 events (user's replaceables + follows' relay lists)
    const pinnedIds = new Set<string>();

    if (retentionConfig.userPubkey) {
      // Pin user's latest kind 0, 3, 10002
      for (const kind of [0, 3, 10002]) {
        const userEvents = await cacheDatabase.getByFilters([
          { kinds: [kind], authors: [retentionConfig.userPubkey], limit: 1 },
        ]);
        userEvents.forEach((e) => pinnedIds.add(e.id));
      }
    }

    if (retentionConfig.followsPubkeys && retentionConfig.followsPubkeys.length > 0) {
      // Pin follows' latest kind 10002 (relay lists)
      const followsRelayLists = await cacheDatabase.getByFilters([
        { kinds: [10002], authors: retentionConfig.followsPubkeys },
      ]);
      // Keep only latest per author
      const latestByAuthor = new Map<string, any>();
      followsRelayLists.forEach((e) => {
        const existing = latestByAuthor.get(e.pubkey);
        if (!existing || e.created_at > existing.created_at) {
          latestByAuthor.set(e.pubkey, e);
        }
      });
      latestByAuthor.forEach((e) => pinnedIds.add(e.id));
    }

    stats.pinnedCount = pinnedIds.size;
    debug(`[Cache] Pinned ${stats.pinnedCount} P0 events`);

    // Step 2: Build P1 protection set (follows' kind 0 profiles)
    const p1Ids = new Set<string>();
    if (retentionConfig.followsPubkeys && retentionConfig.followsPubkeys.length > 0) {
      const followsProfiles = await cacheDatabase.getByFilters([
        { kinds: [0], authors: retentionConfig.followsPubkeys },
      ]);
      const latestProfileByAuthor = new Map<string, any>();
      followsProfiles.forEach((e) => {
        const existing = latestProfileByAuthor.get(e.pubkey);
        if (!existing || e.created_at > existing.created_at) {
          latestProfileByAuthor.set(e.pubkey, e);
        }
      });
      latestProfileByAuthor.forEach((e) => p1Ids.add(e.id));
      debug(`[Cache] P1 protected: ${p1Ids.size} follows' profiles`);
    }

    // Step 3: Enforce per-kind budgets
    const keptRootIds = new Set<string>(); // Track kept kind 1/30023 for cascade logic

    for (const [kindStr, rules] of Object.entries(retentionConfig.kinds)) {
      const kind = parseInt(kindStr);
      const kindEvents = await cacheDatabase.getByFilters([{ kinds: [kind] }]);

      if (kindEvents.length === 0) continue;

      let toDelete: any[] = [];

      // Apply TTL filter
      if (rules.ttlDays) {
        const cutoffTime = Math.floor(Date.now() / 1000) - rules.ttlDays * 86400;
        toDelete = kindEvents.filter(
          (e) => e.created_at < cutoffTime && !pinnedIds.has(e.id) && !p1Ids.has(e.id)
        );
      }

      // Apply maxCount filter (delete oldest beyond limit)
      if (rules.maxCount && kindEvents.length > rules.maxCount) {
        const unpinnedEvents = kindEvents.filter((e) => !pinnedIds.has(e.id) && !p1Ids.has(e.id));
        const sorted = unpinnedEvents.sort((a, b) => a.created_at - b.created_at);
        const excess = sorted.slice(0, unpinnedEvents.length - rules.maxCount);
        toDelete.push(...excess);
      }

      // Apply perAuthorMax filter (keep latest N per author)
      if (rules.perAuthorMax) {
        const byAuthor = new Map<string, any[]>();
        kindEvents.forEach((e) => {
          if (!byAuthor.has(e.pubkey)) byAuthor.set(e.pubkey, []);
          byAuthor.get(e.pubkey)!.push(e);
        });

        byAuthor.forEach((events) => {
          if (events.length > rules.perAuthorMax!) {
            const sorted = events.sort((a, b) => b.created_at - a.created_at);
            const toRemove = sorted
              .slice(rules.perAuthorMax!)
              .filter((e) => !pinnedIds.has(e.id) && !p1Ids.has(e.id));
            toDelete.push(...toRemove);
          }
        });
      }

      // Remove duplicates from toDelete
      const uniqueToDelete = Array.from(new Map(toDelete.map((e) => [e.id, e])).values());

      // Track kept root events (kind 1, 30023) for cascade logic
      if (kind === 1 || kind === 30023) {
        const deletedIds = new Set(uniqueToDelete.map((e) => e.id));
        kindEvents.forEach((e) => {
          if (!deletedIds.has(e.id)) {
            keptRootIds.add(e.id);
          }
        });
      }

      // Delete events
      if (uniqueToDelete.length > 0) {
        for (const event of uniqueToDelete) {
          try {
            await cacheDatabase.removeByFilters([{ ids: [event.id] }]);
          } catch (error) {
            console.error('[Cache] Error deleting event:', error);
          }
        }
        stats.deletedByKind[kind] = uniqueToDelete.length;
        debug(`[Cache] Deleted ${uniqueToDelete.length} events of kind ${kind}`);
      }
    }

    // Step 4: Cascade delete reactions/reposts/replies for deleted roots
    const reactions = await cacheDatabase.getByFilters([{ kinds: [7] }]); // Reactions
    const reposts = await cacheDatabase.getByFilters([{ kinds: [6] }]); // Reposts
    const allNotes = await cacheDatabase.getByFilters([{ kinds: [1] }]); // All notes (for reply detection)

    const orphanedReactions = reactions.filter((r) => {
      const eTags = r.tags.filter((t: string[]) => t[0] === 'e');
      return eTags.some((t: string[]) => !keptRootIds.has(t[1]));
    });

    const orphanedReposts = reposts.filter((r) => {
      const eTags = r.tags.filter((t: string[]) => t[0] === 'e');
      return eTags.some((t: string[]) => !keptRootIds.has(t[1]));
    });

    // FIX: Cascade delete replies (kind 1) when their root is deleted
    const orphanedReplies = allNotes.filter((note) => {
      // Check if this is a reply (has e-tag)
      const eTags = note.tags.filter((t: string[]) => t[0] === 'e');
      if (eTags.length === 0) return false; // Not a reply

      // Check if any referenced root is deleted
      return eTags.some((t: string[]) => !keptRootIds.has(t[1]));
    });

    for (const event of [...orphanedReactions, ...orphanedReposts, ...orphanedReplies]) {
      try {
        await cacheDatabase.removeByFilters([{ ids: [event.id] }]);
        stats.cascadeDeleted++;
      } catch (error) {
        console.error('[Cache] Error cascade deleting event:', error);
      }
    }

    if (stats.cascadeDeleted > 0) {
      debug(`[Cache] Cascade deleted ${stats.cascadeDeleted} orphaned reactions/reposts/replies`);
    }

    // Step 5: Enforce global maxTotalEvents with tiered eviction (P3→P2→P1, never P0)
    const allEventsAfter = await cacheDatabase.getByFilters([{}]);
    stats.totalAfter = allEventsAfter.length;

    if (stats.totalAfter > retentionConfig.maxTotalEvents) {
      const excess = stats.totalAfter - retentionConfig.maxTotalEvents;
      debug(`[Cache] Over global limit by ${excess}, evicting with tier priority (P3→P2→P1)`);

      // Build P2 set (reactions/reposts linked to kept roots)
      const p2Ids = new Set<string>();
      [...reactions, ...reposts].forEach((e) => {
        const eTags = e.tags.filter((t: string[]) => t[0] === 'e');
        const linkedToKeptRoot = eTags.some((t: string[]) => keptRootIds.has(t[1]));
        if (linkedToKeptRoot && !orphanedReactions.includes(e) && !orphanedReposts.includes(e)) {
          p2Ids.add(e.id);
        }
      });

      // Categorize all events by tier
      const eventsP3: any[] = []; // Everything not P0/P1/P2
      const eventsP2: any[] = []; // Reactions/reposts linked to roots
      const eventsP1: any[] = []; // Follows' profiles + recent 1/30023

      allEventsAfter.forEach((e) => {
        if (pinnedIds.has(e.id)) return; // Skip P0
        if (p1Ids.has(e.id) || (e.kind === 1 && keptRootIds.has(e.id)) || (e.kind === 30023 && keptRootIds.has(e.id))) {
          eventsP1.push(e);
        } else if (p2Ids.has(e.id)) {
          eventsP2.push(e);
        } else {
          eventsP3.push(e);
        }
      });

      let remaining = excess;
      const toRemove: any[] = [];

      // Evict P3 first (oldest first)
      if (remaining > 0 && eventsP3.length > 0) {
        const sortedP3 = eventsP3.sort((a, b) => a.created_at - b.created_at);
        const p3ToRemove = Math.min(remaining, sortedP3.length);
        toRemove.push(...sortedP3.slice(0, p3ToRemove));
        remaining -= p3ToRemove;
        debug(`[Cache] Evicting ${p3ToRemove} from P3 (other)`);
      }

      // Evict P2 if needed (oldest first)
      if (remaining > 0 && eventsP2.length > 0) {
        const sortedP2 = eventsP2.sort((a, b) => a.created_at - b.created_at);
        const p2ToRemove = Math.min(remaining, sortedP2.length);
        toRemove.push(...sortedP2.slice(0, p2ToRemove));
        remaining -= p2ToRemove;
        debug(`[Cache] Evicting ${p2ToRemove} from P2 (supporting)`);
      }

      // Evict P1 only as last resort (oldest first)
      if (remaining > 0 && eventsP1.length > 0) {
        const sortedP1 = eventsP1.sort((a, b) => a.created_at - b.created_at);
        const p1ToRemove = Math.min(remaining, sortedP1.length);
        toRemove.push(...sortedP1.slice(0, p1ToRemove));
        remaining -= p1ToRemove;
        console.warn(`[Cache] Had to evict ${p1ToRemove} from P1 (hot content) - consider increasing maxTotalEvents`);
      }

      // Delete selected events
      for (const event of toRemove) {
        try {
          await cacheDatabase.removeByFilters([{ ids: [event.id] }]);
        } catch (error) {
          console.error('[Cache] Error deleting event:', error);
        }
      }

      stats.totalAfter -= toRemove.length;
      debug(`[Cache] Removed ${toRemove.length} events via tiered eviction to meet global limit`);
    }

    const duration = Date.now() - startTime;

    // Phase 4: Update compaction metrics
    cacheMetrics.compactionRuns++;
    cacheMetrics.lastCompactionDurationMs = duration;
    cacheMetrics.lastCompactionTimestamp = Date.now();
    cacheMetrics.totalEventsDeleted += stats.totalBefore - stats.totalAfter;
    cacheMetrics.lastCompactionStats = {
      eventsBefore: stats.totalBefore,
      eventsAfter: stats.totalAfter,
      pinnedCount: stats.pinnedCount,
      cascadeDeleted: stats.cascadeDeleted,
    };

    debug(
      `[Cache] Compaction complete in ${duration}ms: ${stats.totalBefore} → ${stats.totalAfter} events (pinned: ${stats.pinnedCount}, cascade: ${stats.cascadeDeleted})`
    );
  } catch (error) {
    console.error('[Cache] Compaction error:', error);
  }
}

/**
 * Manually trigger cache compaction
 * Phase 2: Debug/tools function
 */
export async function pruneCacheNow(reason?: string): Promise<void> {
  debug(`[Cache] Manual compaction triggered${reason ? `: ${reason}` : ''}`);
  await compactCache();
}

/**
 * Force immediate flush of pending cache writes
 * Phase 3: Testing/debugging helper
 */
export async function forceCacheFlush(): Promise<void> {
  if (!flushEventsFunction) {
    debug('[Cache] Force flush skipped - persistence not active');
    return;
  }

  debug('[Cache] Force flush triggered');
  await flushEventsFunction();
}

/**
 * Get cache metrics for diagnostics
 * Phase 4: Observability
 */
export function getCacheMetrics(): CacheMetrics {
  return { ...cacheMetrics };
}

/**
 * Reset cache metrics counters (for diagnostics/testing)
 */
export function resetCacheMetrics(): void {
  cacheMetrics.pendingQueueDepth = 0;
  cacheMetrics.totalEventsWritten = 0;
  cacheMetrics.lastFlushDurationMs = 0;
  cacheMetrics.lastFlushTimestamp = 0;
  cacheMetrics.flushErrorCount = 0;
  cacheMetrics.cacheHits = 0;
  cacheMetrics.cacheMisses = 0;
  cacheMetrics.compactionRuns = 0;
  cacheMetrics.lastCompactionDurationMs = 0;
  cacheMetrics.lastCompactionTimestamp = 0;
  cacheMetrics.totalEventsDeleted = 0;
  cacheMetrics.lastCompactionStats = null;
  cacheMetrics.quotaErrorCount = 0;
  cacheMetrics.lastQuotaError = null;
  cacheMetrics.maxQueueDepthSeen = 0;
  cacheMetrics.avgFlushDurationMs = 0;
  // Clear rolling history
  flushDurations = [];
  // Clear de-duplication window so subsequent writes are not skipped
  recentIdQueue.splice(0, recentIdQueue.length);
  recentIdSet.clear();
  debug('[Cache] Metrics reset');
}

/**
 * Cache health status
 * Phase 5: Production monitoring
 */
export interface CacheHealthStatus {
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'disabled';
  issues: string[];
  warnings: string[];
  info: {
    coiEnabled: boolean;
    cacheInitialized: boolean;
    persistenceActive: boolean;
    isLeader: boolean;
    uptime: number;
  };
}

/**
 * Get cache health status
 * Phase 5: Production health check
 */
export function getCacheHealth(): CacheHealthStatus {
  const issues: string[] = [];
  const warnings: string[] = [];

  // Check COI
  if (!window.crossOriginIsolated) {
    issues.push('Cross-Origin Isolation not enabled - cache disabled');
    return {
      healthy: false,
      status: 'disabled',
      issues,
      warnings,
      info: {
        coiEnabled: false,
        cacheInitialized: false,
        persistenceActive: false,
        isLeader: false,
        uptime: 0,
      },
    };
  }

  // Check if cache is initialized
  if (!cacheDatabase) {
    issues.push('Cache database not initialized');
    return {
      healthy: false,
      status: 'unhealthy',
      issues,
      warnings,
      info: {
        coiEnabled: true,
        cacheInitialized: false,
        persistenceActive: false,
        isLeader: false,
        uptime: 0,
      },
    };
  }

  // Check persistence status
  if (cacheMetrics.persistenceDisabled) {
    issues.push('Persistence disabled due to quota errors');
  }

  // Check for recent quota errors
  if (cacheMetrics.quotaErrorCount > 0) {
    const timeSinceLastError = cacheMetrics.lastQuotaError
      ? Date.now() - cacheMetrics.lastQuotaError
      : Infinity;

    if (timeSinceLastError < 60_000) { // < 1 minute
      issues.push(`Recent quota error (${Math.floor(timeSinceLastError / 1000)}s ago)`);
    } else if (cacheMetrics.quotaErrorCount > 5) {
      warnings.push(`${cacheMetrics.quotaErrorCount} quota errors total`);
    }
  }

  // Check flush error rate
  const errorRate = cacheMetrics.totalEventsWritten > 0
    ? cacheMetrics.flushErrorCount / cacheMetrics.totalEventsWritten
    : 0;

  if (errorRate > 0.1) {
    issues.push(`High flush error rate: ${(errorRate * 100).toFixed(1)}%`);
  } else if (errorRate > 0.01) {
    warnings.push(`Elevated flush error rate: ${(errorRate * 100).toFixed(2)}%`);
  }

  // Check queue backpressure
  if (cacheMetrics.maxQueueDepthSeen > 5000) {
    warnings.push(`Large queue depth seen: ${cacheMetrics.maxQueueDepthSeen} events`);
  }

  if (cacheMetrics.pendingQueueDepth > 2000) {
    warnings.push(`Current queue depth high: ${cacheMetrics.pendingQueueDepth} events`);
  }

  // Check compaction health
  if (cacheMetrics.compactionRuns === 0 && cacheMetrics.totalEventsWritten > 10000) {
    warnings.push('No compaction runs yet despite significant writes');
  }

  // Check average flush performance
  if (cacheMetrics.avgFlushDurationMs > 1000) {
    warnings.push(`Slow flush performance: ${cacheMetrics.avgFlushDurationMs.toFixed(0)}ms avg`);
  }

  // Determine overall status
  let status: CacheHealthStatus['status'] = 'healthy';
  if (issues.length > 0) {
    status = cacheMetrics.persistenceDisabled ? 'degraded' : 'unhealthy';
  } else if (warnings.length > 0) {
    status = 'degraded';
  }

  const uptime = cacheMetrics.lastFlushTimestamp > 0
    ? Date.now() - (cacheMetrics.lastFlushTimestamp - cacheMetrics.lastFlushDurationMs)
    : 0;

  return {
    healthy: issues.length === 0,
    status,
    issues,
    warnings,
    info: {
      coiEnabled: true,
      cacheInitialized: true,
      persistenceActive: !cacheMetrics.persistenceDisabled,
      isLeader: isCompactionLeader,
      uptime,
    },
  };
}

/**
 * Initialize leader election for multi-tab compaction coordination
 * Phase 4: Ensures only one tab runs compaction at a time
 */
function initializeLeaderElection(): void {
  if (typeof BroadcastChannel === 'undefined') {
    // BroadcastChannel not supported - single tab or old browser
    isCompactionLeader = true;
    debug('[Cache] BroadcastChannel not available - assuming single tab mode');
    return;
  }

  leaderElectionChannel = new BroadcastChannel('cache-compaction-leader');
  let lastLeaderHeartbeat = Date.now();

  // Listen for messages from other tabs
  leaderElectionChannel.onmessage = (event) => {
    if (event.data.type === 'leader-heartbeat') {
      lastLeaderHeartbeat = Date.now();
      if (isCompactionLeader && event.data.tabId !== getTabId()) {
        // Another tab is claiming leadership - step down
        isCompactionLeader = false;
        debug('[Cache] Stepping down as compaction leader');
      }
    } else if (event.data.type === 'leader-query') {
      // Respond if we're the leader
      if (isCompactionLeader) {
        leaderElectionChannel?.postMessage({
          type: 'leader-heartbeat',
          tabId: getTabId(),
        });
      }
    }
  };

  // Query for existing leader
  leaderElectionChannel.postMessage({ type: 'leader-query' });

  // Wait briefly, then claim leadership if no one responds
  setTimeout(() => {
    if (Date.now() - lastLeaderHeartbeat > LEADER_TIMEOUT_MS) {
      isCompactionLeader = true;
      debug('[Cache] Elected as compaction leader');
    }
  }, 500);

  // Send heartbeats if we're the leader
  leaderHeartbeatInterval = setInterval(() => {
    if (isCompactionLeader) {
      leaderElectionChannel?.postMessage({
        type: 'leader-heartbeat',
        tabId: getTabId(),
      });
    } else {
      // Check if leader has timed out
      if (Date.now() - lastLeaderHeartbeat > LEADER_TIMEOUT_MS) {
        isCompactionLeader = true;
        debug('[Cache] Leader timeout - claiming leadership');
      }
    }
  }, LEADER_HEARTBEAT_MS);
}

/**
 * Get a unique tab identifier
 */
function getTabId(): string {
  if (!sessionStorage.getItem('cache-tab-id')) {
    sessionStorage.setItem('cache-tab-id', `tab-${Date.now()}-${Math.random()}`);
  }
  return sessionStorage.getItem('cache-tab-id')!;
}

/**
 * Stop leader election
 */
function stopLeaderElection(): void {
  if (leaderHeartbeatInterval) {
    clearInterval(leaderHeartbeatInterval);
    leaderHeartbeatInterval = null;
  }

  if (leaderElectionChannel) {
    leaderElectionChannel.close();
    leaderElectionChannel = null;
  }

  isCompactionLeader = false;
}

/**
 * Start automatic compaction scheduler
 * Phase 2: Runs compaction at regular intervals
 * Phase 4: With leader election for multi-tab coordination
 */
export function startCompactionScheduler(intervalMinutes: number = 15): void {
  if (compactionTimer) {
    clearInterval(compactionTimer);
  }

  // Phase 4: Initialize leader election for multi-tab coordination
  initializeLeaderElection();

  // Run first compaction after 1 minute (only if leader)
  setTimeout(() => {
    if (isCompactionLeader) {
      compactCache();
    }
  }, 60_000);

  // Then run at regular intervals (only if leader)
  compactionTimer = setInterval(() => {
    if (isCompactionLeader) {
      compactCache();
    } else {
      debug('[Cache] Skipping compaction - not leader tab');
    }
  }, intervalMinutes * 60_000);

  debug(`[Cache] Compaction scheduler started (interval: ${intervalMinutes} min, tab: ${getTabId()})`);
}

/**
 * Configure cache retention policy
 * Phase 2: Set budgets and pinning rules
 */
export function configureCacheRetention(config: Partial<RetentionConfig>): void {
  retentionConfig = {
    ...DEFAULT_RETENTION_CONFIG,
    ...config,
    kinds: {
      ...DEFAULT_RETENTION_CONFIG.kinds,
      ...(config.kinds || {}),
    },
  };

  debug('[Cache] Retention config updated:', retentionConfig);
}
