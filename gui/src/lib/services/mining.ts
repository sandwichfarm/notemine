import type { UnsignedEvent, NostrEvent } from '../types';
import { generateEventId } from '../utils/nostr';

// Simple mining without database dependencies
export async function mineEvent(
  event: UnsignedEvent,
  targetDifficulty: number,
  startNonce: number = 0
): Promise<NostrEvent> {
  let nonce = startNonce;
  
  while (true) {
    // Add nonce tag to event
    const eventWithNonce = {
      ...event,
      tags: [...event.tags, ['nonce', nonce.toString(), targetDifficulty.toString()]]
    };

    // Generate event ID
    const id = generateEventId(eventWithNonce);
    
    // Check if it meets difficulty
    if (checkDifficulty(id, targetDifficulty)) {
      // Return properly formatted event (would need signing in real implementation)
      return {
        ...eventWithNonce,
        id,
        sig: 'mock_signature' // TODO: Implement real signing
      } as NostrEvent;
    }

    nonce++;
  }
}

function checkDifficulty(id: string, targetDifficulty: number): boolean {
  const leadingZeros = id.match(/^0*/)?.[0].length || 0;
  return leadingZeros >= targetDifficulty / 4;
}