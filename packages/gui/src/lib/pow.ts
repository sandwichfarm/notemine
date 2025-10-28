import type { NostrEvent } from 'nostr-tools/core';

/**
 * Extract POW difficulty from a nostr event (NIP-13)
 * Counts the number of leading zero bits in the event ID
 */
export function getPowDifficulty(event: NostrEvent): number {
  const hash = event.id;
  let count = 0;

  for (let i = 0; i < hash.length; i++) {
    const nibble = parseInt(hash[i], 16);
    if (nibble === 0) {
      count += 4;
      continue;
    }

    // Count leading zeros in the nibble
    count += Math.clz32(nibble) - 28; // clz32 returns leading zeros in 32-bit, we want 4-bit
    break;
  }

  return count;
}

/**
 * Check if an event has a valid POW commitment (nonce tag)
 */
export function hasValidPow(event: NostrEvent, minDifficulty: number = 0): boolean {
  // Check for nonce tag
  const nonceTag = event.tags.find((t) => t[0] === 'nonce');
  if (!nonceTag) return false;

  // Verify the difficulty
  const difficulty = getPowDifficulty(event);
  return difficulty >= minDifficulty;
}

/**
 * Get the POW target difficulty from nonce tag
 */
export function getTargetDifficulty(event: NostrEvent): number | null {
  const nonceTag = event.tags.find((t) => t[0] === 'nonce');
  if (!nonceTag || !nonceTag[2]) return null;
  return parseInt(nonceTag[2], 10);
}

/**
 * Calculate POW score for a note including reactions, replies, and author profile POW
 * Applies non-linear weighting based on user preferences
 */
export interface PowScore {
  rootPow: number;
  reactionsPow: number;
  repliesPow: number;
  profilePow: number;
  totalScore: number;
  hasPow: boolean;
  isDelegated: boolean; // True if note has no native PoW but has PoW interactions
}

export interface PowScoreWeights {
  reactionPowWeight?: number;
  replyPowWeight?: number;
  profilePowWeight?: number;
}

export function calculatePowScore(
  event: NostrEvent,
  reactions: NostrEvent[] = [],
  replies: NostrEvent[] = [],
  weights: PowScoreWeights = {}
): PowScore {
  const rootPow = getPowDifficulty(event);
  const hasPow = hasValidPow(event, 1);

  // Get weights with defaults
  const reactionWeight = weights.reactionPowWeight ?? 0.5;
  const replyWeight = weights.replyPowWeight ?? 0.7;
  const profileWeight = weights.profilePowWeight ?? 0.3;

  // Calculate profile POW (leading zeros in pubkey)
  const profilePow = getPubkeyPowDifficulty(event.pubkey);

  // Calculate reactions POW with non-linear weighting
  let reactionsPow = 0;
  for (const reaction of reactions) {
    const reactionPowValue = getPowDifficulty(reaction);
    const content = reaction.content.trim();

    if (content === '+' || content === '👍' || content === '❤️') {
      reactionsPow += reactionPowValue * 1.0;
    } else if (content === '-' || content === '👎') {
      reactionsPow += reactionPowValue * -1.0;
    } else {
      reactionsPow += reactionPowValue * 0.5;
    }
  }

  // Calculate replies POW
  let repliesPow = 0;
  for (const reply of replies) {
    repliesPow += getPowDifficulty(reply);
  }

  // Apply non-linear weights
  const weightedReactionsPow = reactionsPow * reactionWeight;
  const weightedRepliesPow = repliesPow * replyWeight;
  const weightedProfilePow = profilePow * profileWeight;

  const totalScore = rootPow + weightedReactionsPow + weightedRepliesPow + weightedProfilePow;

  // Determine if this is delegated PoW (no native PoW but has PoW interactions)
  const hasDelegatedPow = !hasPow && (weightedReactionsPow > 0 || weightedRepliesPow > 0);

  return {
    rootPow,
    reactionsPow: weightedReactionsPow,
    repliesPow: weightedRepliesPow,
    profilePow: weightedProfilePow,
    totalScore,
    hasPow,
    isDelegated: hasDelegatedPow,
  };
}

/**
 * Calculate POW difficulty of a pubkey (count leading zeros)
 */
export function getPubkeyPowDifficulty(pubkey: string): number {
  let count = 0;
  for (const char of pubkey) {
    if (char === '0') count++;
    else break;
  }
  return count;
}

/**
 * Format POW difficulty for display
 */
export function formatPowDifficulty(difficulty: number): string {
  if (difficulty === 0) return 'none';
  if (difficulty < 16) return `⛏️ ${difficulty}`;
  if (difficulty < 20) return `⛏️⛏️ ${difficulty}`;
  if (difficulty < 24) return `⛏️⛏️⛏️ ${difficulty}`;
  return `⛏️⛏️⛏️⛏️ ${difficulty}`;
}
