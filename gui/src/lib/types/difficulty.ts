// Based on NIPs (Nostr Implementation Possibilities)
export interface EventKindConfig {
  kind: number;
  name: string;
  description: string;
  difficultyModifier: number; // Offset from global difficulty
}

export interface DifficultySettings {
  globalDifficulty: number;
  kindModifiers: Record<number, number>;
}

// Standard Nostr event kinds from various NIPs
export const EVENT_KINDS: Record<number, EventKindConfig> = {
  0: {
    kind: 0,
    name: 'User Metadata',
    description: 'User profile information (NIP-01)',
    difficultyModifier: -11 // 32 - 11 = 21
  },
  1: {
    kind: 1,
    name: 'Short Text Note',
    description: 'Basic text note (NIP-01)',
    difficultyModifier: 0 // 32 + 0 = 32
  },
  3: {
    kind: 3,
    name: 'Follows',
    description: 'Contact list (NIP-02)',
    difficultyModifier: -20 // 32 - 20 = 12
  },
  4: {
    kind: 4,
    name: 'Encrypted DM',
    description: 'Encrypted direct message (NIP-04)',
    difficultyModifier: -6 // 32 - 6 = 26
  },
  7: {
    kind: 7,
    name: 'Reaction',
    description: 'Like/reaction to other events (NIP-25)',
    difficultyModifier: -11 // 32 - 11 = 21
  },
  30023: {
    kind: 30023,
    name: 'Long-form Article',
    description: 'Long-form content (NIP-23)',
    difficultyModifier: -11 // 32 - 11 = 21
  },
  10002: {
    kind: 10002,
    name: 'Relay List',
    description: 'Relay list metadata (NIP-65)',
    difficultyModifier: -7 // 32 - 7 = 25
  },
  9735: {
    kind: 9735,
    name: 'Zap',
    description: 'Lightning zap (NIP-57)',
    difficultyModifier: -11 // 32 - 11 = 21
  }
};

// Special event categories
export const MENTIONS_DIFFICULTY_MODIFIER = -16; // 32 - 16 = 16
export const REPLIES_DIFFICULTY_MODIFIER = -11;  // 32 - 11 = 21

export const DEFAULT_DIFFICULTY_SETTINGS: DifficultySettings = {
  globalDifficulty: 21,  // More reasonable default
  kindModifiers: {
    0: -5,     // User Metadata: 16
    1: 0,      // Short Text Note: 21
    3: -9,     // Follows: 12
    4: -5,     // Encrypted DM: 16
    7: -5,     // Reaction: 16
    30023: -5, // Long-form Article: 16
    10002: -5, // Relay List: 16
    9735: -5,  // Zap: 16
  }
};

export function calculateTargetDifficulty(
  eventKind: number, 
  settings: DifficultySettings,
  isMention: boolean = false,
  isReply: boolean = false
): number {
  let baseDifficulty = settings.globalDifficulty;
  
  // Apply special modifiers first
  if (isMention) {
    return baseDifficulty + MENTIONS_DIFFICULTY_MODIFIER;
  }
  
  if (isReply) {
    return baseDifficulty + REPLIES_DIFFICULTY_MODIFIER;
  }
  
  // Apply kind-specific modifier
  const modifier = settings.kindModifiers[eventKind] || 0;
  return baseDifficulty + modifier;
}

export function getDifficultyForEventKind(eventKind: number, settings: DifficultySettings): number {
  return calculateTargetDifficulty(eventKind, settings);
}