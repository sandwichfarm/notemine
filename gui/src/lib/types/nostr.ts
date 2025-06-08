export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export interface UnsignedEvent {
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
}

export interface RelayInfo {
  url: string;
  read: boolean;
  write: boolean;
  pow?: boolean;
  minPow?: number;
  lastSeen?: number;
  metadata?: any;
}

export interface Filter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  '#e'?: string[];
  '#p'?: string[];
  '#nonce'?: string[];
  '#R'?: string[];
  since?: number;
  until?: number;
  limit?: number;
}

export interface MiningJob {
  id: string;
  event: UnsignedEvent;
  targetDifficulty: number;
  currentNonce: number;
  status: 'pending' | 'mining' | 'completed' | 'failed';
  createdAt: number;
  completedAt?: number;
  minedEvent?: NostrEvent;
}

export interface NoteWithDecay {
  event: NostrEvent;
  cumulativePow: number;
  decayScore: number;
  replies: NostrEvent[];
  mentions: NostrEvent[];
  zaps: NostrEvent[];
}