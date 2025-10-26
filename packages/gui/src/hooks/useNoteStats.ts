import { createSignal, onMount, onCleanup } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { relayPool, getActiveRelays } from '../lib/applesauce';
import { getPowDifficulty, calculatePowScore, getPubkeyPowDifficulty } from '../lib/pow';
import { Subscription } from 'rxjs';
import { usePreferences } from '../providers/PreferencesProvider';
import { debug } from '../lib/debug';

export interface NoteStats {
  reactionCount: number;
  replyCount: number;
  reactionsPowTotal: number;
  positiveReactionsPow: number;
  negativeReactionsPow: number;
  repliesPowTotal: number;
  totalScore: number;
  contributedWork: number; // Raw total POW
  weightedContributedWork: number; // After applying weights

  // Breakdown for tooltip (POW interactions)
  rootPow: number;
  weightedReactionsPow: number;
  weightedRepliesPow: number;
  profilePow: number;
  weightedProfilePow: number;

  // Non-POW interaction breakdown
  reactionsPowCount: number;
  repliesPowCount: number;
  nonPowReactionsCount: number;
  nonPowRepliesCount: number;
  nonPowReactionsTotal: number;
  nonPowRepliesTotal: number;
  weightedNonPowReactions: number;
  weightedNonPowReplies: number;

  loading: boolean;
}

/**
 * Hook to fetch and calculate aggregate stats for a note
 * - Reaction count and cumulative POW
 * - Reply count and cumulative POW
 * - Overall score
 */
export function useNoteStats(event: NostrEvent) {
  const { preferences } = usePreferences();

  const [stats, setStats] = createSignal<NoteStats>({
    reactionCount: 0,
    replyCount: 0,
    reactionsPowTotal: 0,
    positiveReactionsPow: 0,
    negativeReactionsPow: 0,
    repliesPowTotal: 0,
    totalScore: getPowDifficulty(event),
    contributedWork: 0,
    weightedContributedWork: 0,
    rootPow: getPowDifficulty(event),
    weightedReactionsPow: 0,
    weightedRepliesPow: 0,
    profilePow: getPubkeyPowDifficulty(event.pubkey),
    weightedProfilePow: 0,
    reactionsPowCount: 0,
    repliesPowCount: 0,
    nonPowReactionsCount: 0,
    nonPowRepliesCount: 0,
    nonPowReactionsTotal: 0,
    nonPowRepliesTotal: 0,
    weightedNonPowReactions: 0,
    weightedNonPowReplies: 0,
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
          const reaction = response as NostrEvent;
          // Ensure this is a kind 7 reaction event
          if (reaction.kind === 7 && !reactions.find(r => r.id === reaction.id)) {
            reactions.push(reaction);
            debug(`[useNoteStats] Reaction added for ${event.id.slice(0, 8)}: ${reaction.content}`);
            updateStats();
          }
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
          const reply = response as NostrEvent;
          // Ensure this is a kind 1 reply event (not a kind 7 reaction)
          if (reply.kind === 1 && !replies.find(r => r.id === reply.id)) {
            replies.push(reply);
            debug(`[useNoteStats] Reply added for ${event.id.slice(0, 8)}`);
            updateStats();
          }
        }
      },
      error: (err) => {
        console.error('[useNoteStats] Replies error:', err);
      },
    });

    function updateStats() {
      // Calculate reaction POW - separate positive and negative
      let positiveReactionsPow = 0;
      let negativeReactionsPow = 0;

      for (const reaction of reactions) {
        const reactionPowValue = getPowDifficulty(reaction);
        const content = reaction.content.trim();

        if (content === '-' || content === '👎') {
          negativeReactionsPow += reactionPowValue;
        } else {
          // All other reactions are positive (including +, ❤️, 👍, and custom)
          positiveReactionsPow += reactionPowValue;
        }
      }

      const reactionsPowTotal = positiveReactionsPow + negativeReactionsPow;

      // Calculate reply POW
      const repliesPowTotal = replies.reduce((sum, r) => {
        return sum + getPowDifficulty(r);
      }, 0);

      // Calculate total score using the scoring formula with current preferences
      const prefs = preferences();
      const score = calculatePowScore(event, reactions, replies, {
        reactionPowWeight: prefs.reactionPowWeight,
        replyPowWeight: prefs.replyPowWeight,
        profilePowWeight: prefs.profilePowWeight,
        nonPowReactionWeight: prefs.nonPowReactionWeight,
        nonPowReplyWeight: prefs.nonPowReplyWeight,
        powInteractionThreshold: prefs.powInteractionThreshold,
      });

      // Contributed work is raw sum of reactions + replies
      const contributedWork = reactionsPowTotal + repliesPowTotal;

      // Weighted contributed work is what actually affects the score
      const weightedContributedWork = score.weightedReactionsPow + score.weightedRepliesPow;

      debug(`[useNoteStats] Stats for ${event.id.slice(0, 8)}: reactions=${reactions.length}, replies=${replies.length}`);

      setStats({
        reactionCount: reactions.length,
        replyCount: replies.length,
        reactionsPowTotal,
        positiveReactionsPow,
        negativeReactionsPow,
        repliesPowTotal,
        totalScore: score.totalScore,
        contributedWork,
        weightedContributedWork,
        rootPow: score.rootPow,
        weightedReactionsPow: score.weightedReactionsPow,
        weightedRepliesPow: score.weightedRepliesPow,
        profilePow: score.profilePow,
        weightedProfilePow: score.weightedProfilePow,
        reactionsPowCount: score.reactionsPowCount,
        repliesPowCount: score.repliesPowCount,
        nonPowReactionsCount: score.nonPowReactionsCount,
        nonPowRepliesCount: score.nonPowRepliesCount,
        nonPowReactionsTotal: score.nonPowReactionsTotal,
        nonPowRepliesTotal: score.nonPowRepliesTotal,
        weightedNonPowReactions: score.weightedNonPowReactions,
        weightedNonPowReplies: score.weightedNonPowReplies,
        loading: false,
      });
    }

    // Initial stats after a short delay to allow data to load
    setTimeout(() => {
      if (reactions.length === 0 && replies.length === 0) {
        const rootPow = getPowDifficulty(event);
        const profilePow = getPubkeyPowDifficulty(event.pubkey);
        const prefs = preferences();

        setStats({
          reactionCount: 0,
          replyCount: 0,
          reactionsPowTotal: 0,
          positiveReactionsPow: 0,
          negativeReactionsPow: 0,
          repliesPowTotal: 0,
          totalScore: rootPow + (profilePow * prefs.profilePowWeight),
          contributedWork: 0,
          weightedContributedWork: 0,
          reactionsPowCount: 0,
          repliesPowCount: 0,
          nonPowReactionsCount: 0,
          nonPowRepliesCount: 0,
          nonPowReactionsTotal: 0,
          nonPowRepliesTotal: 0,
          weightedNonPowReactions: 0,
          weightedNonPowReplies: 0,
          rootPow,
          weightedReactionsPow: 0,
          weightedRepliesPow: 0,
          profilePow,
          weightedProfilePow: profilePow * prefs.profilePowWeight,
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
