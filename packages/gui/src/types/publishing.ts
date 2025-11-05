import type { NostrEvent } from 'nostr-tools/core';

/**
 * Status of a publishing job through its lifecycle
 */
export type PublishJobStatus =
  | 'pending-sign'           // Waiting to be signed
  | 'signed-pending-publish' // Signed, waiting to publish to relays
  | 'published'              // Successfully published to at least one relay
  | 'failed'                 // Failed after retries (manual action needed)
  | 'cancelled';             // Manually cancelled by user

/**
 * Error details for a failed publishing attempt
 */
export interface PublishError {
  phase: 'sign' | 'publish';
  code: string;              // e.g., 'SIGNER_UNAVAILABLE', 'USER_REJECTED', 'RELAY_TIMEOUT'
  message: string;
  timestamp: number;
}

/**
 * Metadata about the source of this publish job
 */
export interface PublishJobMeta {
  sourceQueueItemId?: string;  // Reference to original mining queue item
  kind: number;                // Nostr event kind
  difficulty: number;          // PoW difficulty target
  type: 'note' | 'reply' | 'reaction' | 'profile' | 'report' | 'repost';
  relayDiscoveryWarning?: string;  // Warning if relay discovery encountered issues
}

/**
 * A publish job represents the signing and publishing of a mined event
 */
export interface PublishJob {
  id: string;
  status: PublishJobStatus;

  // Event data
  eventTemplate: NostrEvent;   // Unsigned event from mining (stable created_at, nonce tag)
  signedEvent?: NostrEvent;    // Once signed, reuse for all publish retries

  // Publishing configuration
  relays: string[];            // Target relays for publishing

  // Retry tracking
  attempts: {
    sign: number;              // Number of signing attempts
    publish: number;           // Number of publishing attempts
  };
  nextAttemptAt: number;       // Epoch ms - when next retry is eligible

  // Error state
  error?: PublishError;

  // Metadata
  meta: PublishJobMeta;

  // Timestamps
  createdAt: number;
  updatedAt: number;
}

/**
 * State shape for the publishing queue
 */
export interface PublishingState {
  items: PublishJob[];
  activeJobId: string | null;
  isProcessing: boolean;       // Whether processing is active
  autoPublish: boolean;        // Whether to auto-process jobs
}

/**
 * Input for creating a new publish job
 */
export interface CreatePublishJobInput {
  eventTemplate: NostrEvent;
  relays: string[];
  meta: PublishJobMeta;
}
