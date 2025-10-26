import type { NostrEvent } from 'nostr-tools/core';
import { getEventHash } from 'nostr-tools/pure';

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
 * Calculate POW score for a note including reactions
 * Score = root_pow + Σ(reaction_pow × reaction_type)
 * where + = +1, - = -1, others = +0.5
 */
export interface PowScore {
  rootPow: number;
  reactionsPow: number;
  totalScore: number;
  hasPow: boolean;
}

export function calculatePowScore(
  event: NostrEvent,
  reactions: NostrEvent[] = []
): PowScore {
  const rootPow = getPowDifficulty(event);
  const hasPow = hasValidPow(event, 1);

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

  const totalScore = rootPow + reactionsPow;

  return {
    rootPow,
    reactionsPow,
    totalScore,
    hasPow,
  };
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
