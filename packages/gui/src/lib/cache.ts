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
 * Events will be batched and written to the cache every 5 seconds
 */
export function setupCachePersistence(mainEventStore: any): void {
  if (!cacheDatabase) {
    console.warn('[Cache] Cache not initialized, skipping persistence setup');
    return;
  }

  debug('[Cache] Setting up cache persistence...');

  // Set up automatic persistence from main event store to cache
  persistUnsubscribe = persistEventsToCache(
    mainEventStore,
    async (events) => {
      if (!cacheDatabase) return;

      // Batch insert events into cache
      for (const event of events) {
        try {
          await cacheDatabase.add(event);
        } catch (error) {
          // Ignore duplicate errors
          if (!String(error).includes('UNIQUE constraint')) {
            console.error('[Cache] Error persisting event:', error);
          }
        }
      }
    },
    {
      batchTime: 5000, // Write every 5 seconds
      maxBatchSize: 100, // Max 100 events per batch
    }
  );

  debug('[Cache] Cache persistence enabled');
}

/**
 * Load cached events into the main EventStore
 * This populates the event store with previously cached events on startup
 */
export async function loadCachedEvents(mainEventStore: any, limit: number = 1000): Promise<number> {
  if (!cacheDatabase) {
    console.warn('[Cache] Cache not initialized, skipping load');
    return 0;
  }

  debug('[Cache] Loading cached events...');

  try {
    // Load kind 1 notes (most recent first)
    const cachedNotes = await cacheDatabase.getByFilters([
      { kinds: [1], limit },
    ]);

    // Load kind 30023 long-form content
    const cachedLongForm = await cacheDatabase.getByFilters([
      { kinds: [30023], limit: 100 },
    ]);

    // Load kind 0 metadata
    const cachedMetadata = await cacheDatabase.getByFilters([
      { kinds: [0], limit: 500 },
    ]);

    // Load kind 7 reactions
    const cachedReactions = await cacheDatabase.getByFilters([
      { kinds: [7], limit: 1000 },
    ]);

    const allEvents = [...cachedNotes, ...cachedLongForm, ...cachedMetadata, ...cachedReactions];

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

    debug(`[Cache] Loaded ${loadedCount} cached events`);
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
 */
export async function getCacheStats(): Promise<{
  notes: number;
  metadata: number;
  reactions: number;
  total: number;
}> {
  if (!cacheDatabase) {
    return { notes: 0, metadata: 0, reactions: 0, total: 0 };
  }

  try {
    const notes = await cacheDatabase.getByFilters([{ kinds: [1] }]);
    const metadata = await cacheDatabase.getByFilters([{ kinds: [0] }]);
    const reactions = await cacheDatabase.getByFilters([{ kinds: [7] }]);

    return {
      notes: notes.length,
      metadata: metadata.length,
      reactions: reactions.length,
      total: notes.length + metadata.length + reactions.length,
    };
  } catch (error) {
    console.error('[Cache] Error getting cache stats:', error);
    return { notes: 0, metadata: 0, reactions: 0, total: 0 };
  }
}

/**
 * Close the cache database connection
 */
export async function closeCache(): Promise<void> {
  if (persistUnsubscribe) {
    persistUnsubscribe();
    persistUnsubscribe = null;
  }

  if (cacheDatabase) {
    await cacheDatabase.close();
    cacheDatabase = null;
    cacheEventStore = null;
    debug('[Cache] Cache closed');
  }
}
