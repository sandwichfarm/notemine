import { Component, For, createMemo, createSignal, Show, onCleanup } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty } from '../lib/pow';
import { useQueue } from '../providers/QueueProvider';
import { useUser } from '../providers/UserProvider';
import { usePreferences } from '../providers/PreferencesProvider';
import type { Emoji } from '../providers/EmojiProvider';

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
  customEmoji?: Emoji; // NIP-30 custom emoji data
}

export const ReactionBreakdown: Component<ReactionBreakdownProps> = (props) => {
  const { addToQueue } = useQueue();
  const { user } = useUser();
  const { preferences } = usePreferences();

  // Track which reaction group is being held and progress
  const [holdingGroup, setHoldingGroup] = createSignal<ReactionGroup | null>(null);
  const [holdProgress, setHoldProgress] = createSignal(0);

  let holdTimer: number | null = null;
  let progressInterval: number | null = null;

  const groupedReactions = createMemo(() => {
    const groups = new Map<string, ReactionGroup>();

    for (const reaction of props.reactions) {
      let emoji = reaction.content.trim();
      let customEmoji: Emoji | undefined;

      // Check for custom emoji tags (NIP-30)
      // Format: ['emoji', '<shortcode>', '<url>']
      if (emoji.startsWith(':') && emoji.endsWith(':')) {
        const shortcode = emoji.slice(1, -1);
        const emojiTag = reaction.tags?.find(
          (tag) => tag[0] === 'emoji' && tag[1] === shortcode && tag[2]
        );

        if (emojiTag && emojiTag[2]) {
          // Validate URL (only http/https)
          const url = emojiTag[2];
          if (url.startsWith('http://') || url.startsWith('https://')) {
            customEmoji = {
              shortcode,
              url,
              alt: emoji,
            };
          }
        }
      }

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
          customEmoji,
        });
      }
    }

    // Sort by total POW (descending)
    return Array.from(groups.values()).sort((a, b) => b.totalPow - a.totalPow);
  });

  const startHold = (group: ReactionGroup) => {
    // Can only add reactions if logged in and we have event details
    if (!user() || !props.eventId || !props.eventAuthor) return;

    setHoldingGroup(group);
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
      completeHold(group);
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
    setHoldingGroup(null);
    setHoldProgress(0);
  };

  const completeHold = (group: ReactionGroup) => {
    cancelHold();

    // Build tags array
    const tags: string[][] = [
      ['e', props.eventId!],
      ['p', props.eventAuthor!],
      ['client', 'notemine.io'],
    ];

    // Add emoji tag for NIP-30 custom emojis
    if (group.customEmoji) {
      tags.push(['emoji', group.customEmoji.shortcode, group.customEmoji.url]);
    }

    // Add reaction to mining queue
    addToQueue({
      type: 'reaction',
      content: group.emoji,
      pubkey: user()!.pubkey,
      difficulty: preferences().powDifficultyReaction,
      tags,
      kind: 7,
      metadata: {
        targetEventId: props.eventId!,
        targetAuthor: props.eventAuthor!,
        reactionContent: group.emoji,
      },
    });
  };

  // Cleanup timers on component unmount
  onCleanup(() => {
    cancelHold();
  });

  return (
    <div class="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap min-h-[28px] py-1 opacity-70 hover:opacity-100 no-scrollbar w-full">
      <For each={groupedReactions()}>
        {(group) => (
          <div
            class="cursor-pointer flex items-center px-2 py-1 rounded-lg bg-bg-secondary/30 dark:bg-bg-tertiary/30 bg-black/10 dark:bg-black/40 relative overflow-hidden transition-all shrink-0"
            classList={{
              'ring-2 ring-accent': holdingGroup()?.emoji === group.emoji,
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              startHold(group);
            }}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={(e) => {
              e.preventDefault();
              startHold(group);
            }}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
          >
            {/* Loading bar - fills from left to right */}
            <Show when={holdingGroup()?.emoji === group.emoji}>
              <div
                class="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-accent/60 to-accent/80 z-0"
                style={`width: ${holdProgress()}%`}
              />
            </Show>

            {/* Emoji - render as image if custom, otherwise as text */}
            <Show
              when={group.customEmoji}
              fallback={<span class="text-sm relative z-10">{group.emoji}</span>}
            >
              <img
                src={group.customEmoji!.url}
                alt={group.customEmoji!.alt || group.emoji}
                title={group.emoji}
                class="inline-block align-middle relative z-10"
                style={{
                  width: group.customEmoji!.w ? `${Math.min(group.customEmoji!.w, 20)}px` : '16px',
                  height: group.customEmoji!.h ? `${Math.min(group.customEmoji!.h, 20)}px` : '16px',
                  'max-width': '20px',
                  'max-height': '20px',
                }}
              />
            </Show>

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
