/**
 * Feed types and configurations
 */

export type FeedType = 'curated' | 'web' | 'follow-packs' | 'global';

export interface FeedConfig {
  id: string;
  type: FeedType;
  name: string;
  description: string;
  icon?: string;
  enabled: boolean;
  filters?: any; // Will be NostrFilter
  followPacks?: string[]; // Event IDs of follow packs (kind 39089)
  requiresAuth?: boolean;
  warningLevel?: number; // For global feed
}

export interface FollowPack {
  id: string;
  pubkey: string;
  title: string;
  description?: string;
  image?: string;
  relays?: string[];
  pubkeys: string[];
  created_at: number;
}

// Default follow packs for curated feed
export const DEFAULT_FOLLOW_PACKS = [
  'c1c83b9b97c9d4709bdef4ae0b3374c80f62192d8eefcd07d21c693ebf05e8fa', // Nostr Streamers
  // Add more default packs here when provided
];

export interface GlobalFeedWarning {
  message: string;
  buttonText: string;
  style: 'cypherpunk' | 'glitch' | 'matrix' | 'terminal' | 'warning' | 'chaos';
  visual?: 'static' | 'glitch' | 'matrix' | 'scan' | 'corrupt';
}

// Global feed warning messages with different personalities
export const GLOBAL_FEED_WARNINGS: GlobalFeedWarning[] = [
  {
    message: "⚠️ DANGER: Unfiltered reality ahead. Your mind is the only firewall.",
    buttonText: "I accept the risk",
    style: 'cypherpunk',
    visual: 'static'
  },
  {
    message: "ERROR 0x41: SANITY_CHECK_FAILED. Proceed to global feed anyway?",
    buttonText: "sudo override --force",
    style: 'terminal',
    visual: 'glitch'
  },
  {
    message: "You're about to see EVERYTHING. No algorithms. No filters. No mercy.",
    buttonText: "Show me the truth",
    style: 'matrix',
    visual: 'matrix'
  },
  {
    message: "🧠 COGNITIVE HAZARD DETECTED. Global feed may contain weapons-grade shitposts.",
    buttonText: "My body is ready",
    style: 'warning',
    visual: 'scan'
  },
  {
    message: "Beyond this point: Raw, uncut, weapons-grade nostr. Hope you brought your hazmat suit.",
    buttonText: "YOLO",
    style: 'chaos',
    visual: 'corrupt'
  },
  {
    message: "\"He who fights with monsters might take care lest he thereby become a monster.\" - Nietzsche",
    buttonText: "Gaze into the abyss",
    style: 'cypherpunk',
    visual: 'static'
  },
  {
    message: "Global feed access requested. Deploying mental blast shields in 3... 2... 1...",
    buttonText: "ENGAGE",
    style: 'terminal',
    visual: 'scan'
  },
  {
    message: "⚡ HIGH VOLTAGE CONTENT ⚡ May cause spontaneous enlightenment or brain melting.",
    buttonText: "Flip the switch",
    style: 'warning',
    visual: 'glitch'
  },
  {
    message: "Welcome to the thunderdome. Two feeds enter, one brain leaves.",
    buttonText: "Enter the dome",
    style: 'chaos',
    visual: 'corrupt'
  },
  {
    message: "INIT: GLOBAL_FEED\nWARN: No content moderation detected\nWARN: Chaos levels critical\nCONTINUE? [Y/N]",
    buttonText: "Y",
    style: 'terminal',
    visual: 'matrix'
  }
];