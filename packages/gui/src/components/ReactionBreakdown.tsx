import { Component, For, createMemo } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty } from '../lib/pow';

interface ReactionBreakdownProps {
  reactions: NostrEvent[];
}

interface ReactionGroup {
  emoji: string;
  count: number;
  totalPow: number;
  reactions: NostrEvent[];
}

export const ReactionBreakdown: Component<ReactionBreakdownProps> = (props) => {
  const groupedReactions = createMemo(() => {
    const groups = new Map<string, ReactionGroup>();

    for (const reaction of props.reactions) {
      let emoji = reaction.content.trim();

      // Normalize + to upvote arrow
      if (emoji === '+' || emoji === '👍') {
        emoji = '⬆️';
      }
      // Normalize - to downvote arrow
      else if (emoji === '-' || emoji === '👎') {
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

  return (
    <div class="flex flex-wrap gap-2 opacity-70 hover:opacity-100">
      <For each={groupedReactions()}>
        {(group) => (
          <div class="cursor-pointer flex items-center px-2 pt-1 rounded-lg bg-bg-secondary/30 dark:bg-bg-tertiary/30 bg-black/10 dark:bg-black/40">

            {/* Emoji */}
            <span class="text-sm">{group.emoji}</span>

            {/* Count */}
            <span class="text-text-primary text-xs font-medium ml-1">
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
