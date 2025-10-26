import type { MiningState } from '@notemine/wrapper';

export interface QueueItemMetadata {
  targetEventId?: string; // For replies/reactions
  targetAuthor?: string; // For replies/reactions
  reactionContent?: string; // For reactions (emoji/content)
}

export interface QueueItem {
  id: string;
  type: 'note' | 'reply' | 'reaction' | 'profile';
  content: string;
  pubkey: string;
  difficulty: number;
  tags?: string[][];
  kind: number;
  status: 'queued' | 'mining' | 'paused' | 'completed' | 'failed' | 'skipped';
  createdAt: number;
  completedAt?: number;
  miningState?: MiningState; // Saved state from wrapper
  error?: string;
  metadata?: QueueItemMetadata;
}

export interface QueueState {
  items: QueueItem[];
  activeItemId: string | null;
  isProcessing: boolean;
  autoProcess: boolean;
}
