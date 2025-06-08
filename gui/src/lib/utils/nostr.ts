import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { UnsignedEvent } from '../types';

export function generateEventId(event: UnsignedEvent): string {
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags,
    event.content
  ]);
  
  const hash = sha256(new TextEncoder().encode(serialized));
  return bytesToHex(hash);
}

export function extractPowDifficulty(event: any): number {
  const nonceTag = event.tags?.find((tag: string[]) => tag[0] === 'nonce');
  if (!nonceTag || nonceTag.length < 3) return 0;
  
  const difficulty = parseInt(nonceTag[2]);
  return isNaN(difficulty) ? 0 : difficulty;
}

export function verifyPowDifficulty(event: any, minDifficulty: number = 0): boolean {
  // Extract claimed difficulty
  const claimedDifficulty = extractPowDifficulty(event);
  if (claimedDifficulty < minDifficulty) return false;
  
  // Calculate actual difficulty by counting leading zero bits in event ID
  const eventId = event.id;
  if (!eventId) return false;
  
  // Convert hex ID to binary and count leading zeros
  let leadingZeros = 0;
  for (let i = 0; i < eventId.length; i++) {
    const hexChar = eventId[i];
    const value = parseInt(hexChar, 16);
    
    if (value === 0) {
      leadingZeros += 4;
    } else if (value === 1) {
      leadingZeros += 3;
      break;
    } else if (value <= 3) {
      leadingZeros += 2;
      break;
    } else if (value <= 7) {
      leadingZeros += 1;
      break;
    } else {
      break;
    }
  }
  
  // Verify the actual difficulty matches or exceeds the claimed difficulty
  return leadingZeros >= claimedDifficulty;
}

export function calculateDecayScore(
  createdAt: number,
  decayRate: number,
  cumulativePow: number
): number {
  const ageInHours = (Date.now() / 1000 - createdAt) / 3600;
  const decayFactor = Math.exp(-decayRate * ageInHours);
  return cumulativePow * decayFactor;
}