/**
 * Phase 2: Interactions Coordinator Service
 *
 * Manages a queue of interactions fetch requests with:
 * - Concurrency limiting (max N concurrent fetches)
 * - FIFO queue with maximum size
 * - Cancellation support (for scroll-away)
 * - Priority management
 */

import { Subscription } from 'rxjs';

export interface InteractionsFetchRequest {
  noteId: string;
  fetcher: () => Subscription; // Returns a subscription that can be canceled
  priority?: number; // Higher = more important (default 0)
}

interface QueuedRequest extends InteractionsFetchRequest {
  queuedAt: number; // Timestamp for debugging
}

interface InFlightRequest {
  noteId: string;
  subscription: Subscription;
  startedAt: number;
}

class InteractionsCoordinatorService {
  private queue: QueuedRequest[] = [];
  private inFlight = new Map<string, InFlightRequest>();
  private maxConcurrent: number;
  private maxQueueSize: number;
  private debugMode = false;

  // Stats for debugging
  private stats = {
    totalRequests: 0,
    totalCompleted: 0,
    totalCanceled: 0,
    totalDropped: 0, // Dropped due to queue full
  };

  constructor(maxConcurrent: number = 3, maxQueueSize: number = 24) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * Configure the coordinator
   */
  public configure(maxConcurrent: number, maxQueueSize: number, debugMode: boolean = false): void {
    this.maxConcurrent = maxConcurrent;
    this.maxQueueSize = maxQueueSize;
    this.debugMode = debugMode;

    if (this.debugMode) {
      console.log(`[InteractionsCoordinator] Configured: maxConcurrent=${maxConcurrent}, maxQueue=${maxQueueSize}`);
    }

    // Process queue in case new slots opened up
    this.processQueue();
  }

  /**
   * Request interactions fetch for a note
   * Returns true if queued/started, false if dropped
   */
  public request(req: InteractionsFetchRequest): boolean {
    this.stats.totalRequests++;

    // Already in flight? Skip duplicate
    if (this.inFlight.has(req.noteId)) {
      if (this.debugMode) {
        console.log(`[InteractionsCoordinator] Skipping duplicate request for note ${req.noteId.slice(0, 8)}`);
      }
      return true; // Don't count as dropped
    }

    // Already queued? Skip duplicate
    if (this.queue.some((q) => q.noteId === req.noteId)) {
      if (this.debugMode) {
        console.log(`[InteractionsCoordinator] Skipping duplicate queued request for note ${req.noteId.slice(0, 8)}`);
      }
      return true;
    }

    // Queue full? Drop lowest priority item (or this one)
    if (this.queue.length >= this.maxQueueSize) {
      const newPriority = req.priority ?? 0;
      const lowestPriority = Math.min(...this.queue.map((q) => q.priority ?? 0));

      if (newPriority > lowestPriority) {
        // Drop lowest priority item to make room
        const lowestIndex = this.queue.findIndex((q) => (q.priority ?? 0) === lowestPriority);
        const dropped = this.queue.splice(lowestIndex, 1)[0];
        this.stats.totalDropped++;

        if (this.debugMode) {
          console.log(
            `[InteractionsCoordinator] Queue full, dropped note ${dropped.noteId.slice(0, 8)} (priority ${lowestPriority}) for note ${req.noteId.slice(0, 8)} (priority ${newPriority})`
          );
        }
      } else {
        // Drop this request
        this.stats.totalDropped++;
        if (this.debugMode) {
          console.log(
            `[InteractionsCoordinator] Queue full, dropping note ${req.noteId.slice(0, 8)} (priority ${newPriority})`
          );
        }
        return false;
      }
    }

    // Add to queue
    this.queue.push({
      ...req,
      queuedAt: Date.now(),
    });

    if (this.debugMode) {
      console.log(
        `[InteractionsCoordinator] Queued note ${req.noteId.slice(0, 8)} (queue: ${this.queue.length}, inFlight: ${this.inFlight.size})`
      );
    }

    // Try to process immediately
    this.processQueue();

    return true;
  }

  /**
   * Cancel queued interactions fetch for a note (e.g., scrolled away)
   * Does NOT cancel in-flight fetches - lets them complete to capture all interactions
   */
  public cancelQueued(noteId: string): void {
    // Remove from queue if present
    const queueIndex = this.queue.findIndex((q) => q.noteId === noteId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      this.stats.totalCanceled++;

      if (this.debugMode) {
        console.log(`[InteractionsCoordinator] Removed note ${noteId.slice(0, 8)} from queue (in-flight preserved)`);
      }
    }
  }

  /**
   * Cancel interactions fetch for a note (both queued and in-flight)
   * Use this for cleanup only, not for scroll-away
   */
  public cancel(noteId: string): void {
    // Cancel if in flight
    const inFlight = this.inFlight.get(noteId);
    if (inFlight) {
      inFlight.subscription.unsubscribe();
      this.inFlight.delete(noteId);
      this.stats.totalCanceled++;

      if (this.debugMode) {
        console.log(
          `[InteractionsCoordinator] Canceled in-flight request for note ${noteId.slice(0, 8)} (duration: ${Date.now() - inFlight.startedAt}ms)`
        );
      }

      // Process queue to fill the slot
      this.processQueue();
      return;
    }

    // Remove from queue if present (fallback)
    this.cancelQueued(noteId);
  }

  /**
   * Process the queue - start fetches up to maxConcurrent
   */
  private processQueue(): void {
    while (this.inFlight.size < this.maxConcurrent && this.queue.length > 0) {
      // Sort queue by priority (highest first), then FIFO
      this.queue.sort((a, b) => {
        const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
        if (priorityDiff !== 0) return priorityDiff;
        return a.queuedAt - b.queuedAt; // FIFO for same priority
      });

      // Take next item
      const req = this.queue.shift()!;
      const startTime = Date.now();

      // Start fetch
      const subscription = req.fetcher();

      // Track in flight
      this.inFlight.set(req.noteId, {
        noteId: req.noteId,
        subscription,
        startedAt: startTime,
      });

      if (this.debugMode) {
        const waitTime = startTime - req.queuedAt;
        console.log(
          `[InteractionsCoordinator] Started fetch for note ${req.noteId.slice(0, 8)} (waited ${waitTime}ms, inFlight: ${this.inFlight.size})`
        );
      }

      // Wrap subscription to clean up when complete
      subscription.add(() => {
        const duration = Date.now() - startTime;
        this.inFlight.delete(req.noteId);
        this.stats.totalCompleted++;

        if (this.debugMode) {
          console.log(
            `[InteractionsCoordinator] Completed fetch for note ${req.noteId.slice(0, 8)} (duration: ${duration}ms, inFlight: ${this.inFlight.size})`
          );
        }

        // Process next in queue
        this.processQueue();
      });
    }
  }

  /**
   * Clear all queued and in-flight requests
   */
  public clear(): void {
    // Cancel all in-flight
    this.inFlight.forEach((req) => {
      req.subscription.unsubscribe();
    });
    this.inFlight.clear();

    // Clear queue
    this.queue = [];

    if (this.debugMode) {
      console.log('[InteractionsCoordinator] Cleared all requests');
    }
  }

  /**
   * Get stats for debugging
   */
  public getStats(): {
    queueSize: number;
    inFlightCount: number;
    totalRequests: number;
    totalCompleted: number;
    totalCanceled: number;
    totalDropped: number;
  } {
    return {
      queueSize: this.queue.length,
      inFlightCount: this.inFlight.size,
      ...this.stats,
    };
  }

  /**
   * Reset stats
   */
  public resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalCompleted: 0,
      totalCanceled: 0,
      totalDropped: 0,
    };
  }
}

// Global singleton instance
let globalCoordinator: InteractionsCoordinatorService | null = null;

/**
 * Get or create the global interactions coordinator
 */
export function getInteractionsCoordinator(): InteractionsCoordinatorService {
  if (!globalCoordinator) {
    globalCoordinator = new InteractionsCoordinatorService();
  }
  return globalCoordinator;
}

/**
 * Configure the global interactions coordinator
 */
export function configureInteractionsCoordinator(
  maxConcurrent: number,
  maxQueueSize: number,
  debugMode: boolean = false
): void {
  getInteractionsCoordinator().configure(maxConcurrent, maxQueueSize, debugMode);
}

/**
 * Destroy the global coordinator (for cleanup/testing)
 */
export function destroyInteractionsCoordinator(): void {
  if (globalCoordinator) {
    globalCoordinator.clear();
    globalCoordinator = null;
  }
}
