import { Component, For, createMemo, createSignal, Show, onCleanup } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty } from '../lib/pow';
import { useQueue } from '../providers/QueueProvider';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';

interface ReactionBreakdownProps {
  reactions: NostrEvent[];
  eventId?: string;
  eventAuthor?: string;
}

interface ReactionGroup {
  emoji: string;
  count: number;
  totalPow: number;
  reactions: NostrEvent[];
}

export const ReactionBreakdown: Component<ReactionBreakdownProps> = (props) => {
  const { addToQueue } = useQueue();
  const { user } = useUser();
  const { preferences } = usePreferences();

  // Track which emoji is being held and progress
  const [holdingEmoji, setHoldingEmoji] = createSignal<string | null>(null);
  const [holdProgress, setHoldProgress] = createSignal(0);

  let holdTimer: number | null = null;
  let progressInterval: number | null = null;

  const groupedReactions = createMemo(() => {
    const groups = new Map<string, ReactionGroup>();

    for (const reaction of props.reactions) {
      let emoji = reaction.content.trim();

      // Normalize + to upvote arrow
      if (emoji === '+') {
        emoji = '⬆️';
      }
      // Normalize - to downvote arrow
      else if (emoji === '-') {
        emoji = '⬇️';
      }
      // Default to heart if empty or invalid
      else if (!emoji) {
        emoji = '❤️';
      }

      const pow = getPowDifficulty(reaction);

      if (groups.has(emoji)) {
        const group = groups.get(emoji)!;
        group.count++;
        group.totalPow += pow;
        group.reactions.push(reaction);
      } else {
        groups.set(emoji, {
          emoji,
          count: 1,
          totalPow: pow,
          reactions: [reaction],
        });
      }
    }

    // Sort by total POW (descending)
    return Array.from(groups.values()).sort((a, b) => b.totalPow - a.totalPow);
  });

  const startHold = (emoji: string) => {
    // Can only add reactions if logged in and we have event details
    if (!user() || !props.eventId || !props.eventAuthor) return;

    setHoldingEmoji(emoji);
    setHoldProgress(0);

    const startTime = Date.now();
    const holdDuration = 1000; // 1 second

    // Update progress every 16ms (~60fps)
    progressInterval = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / holdDuration) * 100, 100);
      setHoldProgress(progress);
    }, 16);

    // Complete after 1 second
    holdTimer = window.setTimeout(() => {
      completeHold(emoji);
    }, holdDuration);
  };

  const cancelHold = () => {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    if (progressInterval !== null) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    setHoldingEmoji(null);
    setHoldProgress(0);
  };

  const completeHold = (emoji: string) => {
    cancelHold();

    // Add reaction to mining queue
    addToQueue({
      type: 'reaction',
      content: emoji,
      pubkey: user()!.pubkey,
      difficulty: preferences().powDifficultyReaction,
      tags: [
        ['e', props.eventId!],
        ['p', props.eventAuthor!],
        ['client', 'notemine.io'],
      ],
      kind: 7,
      metadata: {
        targetEventId: props.eventId!,
        targetAuthor: props.eventAuthor!,
        reactionContent: emoji,
      },
    });
  };

  // Cleanup timers on component unmount
  onCleanup(() => {
    cancelHold();
  });

  return (
    <div class="flex flex-wrap gap-2 opacity-70 hover:opacity-100">
      <For each={groupedReactions()}>
        {(group) => (
          <div
            class="cursor-pointer flex items-center px-2 pt-1 rounded-lg bg-bg-secondary/30 dark:bg-bg-tertiary/30 bg-black/10 dark:bg-black/40 relative overflow-hidden transition-all"
            classList={{
              'ring-2 ring-accent': holdingEmoji() === group.emoji,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              startHold(group.emoji);
            }}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={(e) => {
              e.preventDefault();
              startHold(group.emoji);
            }}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
          >
            {/* Loading bar - fills from left to right */}
            <Show when={holdingEmoji() === group.emoji}>
              <div
                class="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-accent/60 to-accent/80 z-0"
                style={`width: ${holdProgress()}%`}
              />
            </Show>

            {/* Emoji */}
            <span class="text-sm relative z-10">{group.emoji}</span>

            {/* Count */}
            <span class="text-text-primary text-xs font-medium ml-1 relative z-10">
              {group.count}
            </span>

            {/* POW */}
            {/* <div class="flex items-center gap-1 text-xs">
              <span class="text-accent">💎</span>
              <span class="text-text-secondary font-mono">
                {group.totalPow}
              </span>
            </div> */}

          </div>
        )}
      </For>
    </div>
  );
};
