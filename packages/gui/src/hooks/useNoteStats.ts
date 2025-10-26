import { createSignal, onMount, onCleanup } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { relayPool, getActiveRelays } from '../lib/applesauce';
import { getPowDifficulty, calculatePowScore } from '../lib/pow';
import { Subscription } from 'rxjs';

export interface NoteStats {
  reactionCount: number;
  replyCount: number;
  reactionsPowTotal: number;
  repliesPowTotal: number;
  totalScore: number;
  loading: boolean;
}

/**
 * Hook to fetch and calculate aggregate stats for a note
 * - Reaction count and cumulative POW
 * - Reply count and cumulative POW
 * - Overall score
 */
export function useNoteStats(event: NostrEvent) {
  const [stats, setStats] = createSignal<NoteStats>({
    reactionCount: 0,
    replyCount: 0,
    reactionsPowTotal: 0,
    repliesPowTotal: 0,
    totalScore: getPowDifficulty(event),
    loading: true,
  });

  let reactionsSubscription: Subscription | null = null;
  let repliesSubscription: Subscription | null = null;

  onMount(() => {
    const reactions: NostrEvent[] = [];
    const replies: NostrEvent[] = [];

    // Fetch reactions for this event
    const relays = getActiveRelays();
    const reactionsObs = relayPool.req(relays, { kinds: [7], '#e': [event.id], limit: 100 });

    reactionsSubscription = reactionsObs.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === 7) {
          reactions.push(response as NostrEvent);
          updateStats();
        }
      },
      error: (err) => {
        console.error('[useNoteStats] Reactions error:', err);
      },
    });

    // Fetch replies (kind 1 events that reference this note)
    const repliesObs = relayPool.req(relays, { kinds: [1], '#e': [event.id], limit: 100 });

    repliesSubscription = repliesObs.subscribe({
      next: (response) => {
        if (response !== 'EOSE' && response.kind === 1) {
          replies.push(response as NostrEvent);
          updateStats();
        }
      },
      error: (err) => {
        console.error('[useNoteStats] Replies error:', err);
      },
    });

    function updateStats() {
      // Calculate reaction POW
      const reactionsPowTotal = reactions.reduce((sum, r) => {
        return sum + getPowDifficulty(r);
      }, 0);

      // Calculate reply POW
      const repliesPowTotal = replies.reduce((sum, r) => {
        return sum + getPowDifficulty(r);
      }, 0);

      // Calculate total score using the scoring formula
      const score = calculatePowScore(event, reactions);

      setStats({
        reactionCount: reactions.length,
        replyCount: replies.length,
        reactionsPowTotal,
        repliesPowTotal,
        totalScore: score.totalScore + repliesPowTotal,
        loading: false,
      });
    }

    // Initial stats after a short delay to allow data to load
    setTimeout(() => {
      if (reactions.length === 0 && replies.length === 0) {
        setStats({
          reactionCount: 0,
          replyCount: 0,
          reactionsPowTotal: 0,
          repliesPowTotal: 0,
          totalScore: getPowDifficulty(event),
          loading: false,
        });
      }
    }, 2000);
  });

  onCleanup(() => {
    reactionsSubscription?.unsubscribe();
    repliesSubscription?.unsubscribe();
  });

  return stats;
}
