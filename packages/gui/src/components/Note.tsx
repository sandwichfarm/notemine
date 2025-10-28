import { Component, Show, createSignal, For, onMount, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import { A } from '@solidjs/router';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty, hasValidPow, formatPowDifficulty } from '../lib/pow';
import { nip19 } from 'nostr-tools';
import { ReactionPicker } from './ReactionPicker';
import { ReplyComposer } from './ReplyComposer';
import { useNoteStats } from '../hooks/useNoteStats';
import { ProfileName } from './ProfileName';
import { ParsedContent } from './ParsedContent';
import { usePreferences } from '../providers/PreferencesProvider';
import { useTooltip } from '../providers/TooltipProvider';

interface NoteProps {
  event: NostrEvent;
  score?: number;
  showScore?: boolean;
  onVisible?: (eventId: string) => void; // Callback when note becomes visible
}

export const Note: Component<NoteProps> = (props) => {
  const [showReactionPicker, setShowReactionPicker] = createSignal(false);
  const [showReplyComposer, setShowReplyComposer] = createSignal(false);
  const [showScoreTooltip, setShowScoreTooltip] = createSignal(false);
  const { preferences } = usePreferences();
  const { activeTooltip, setActiveTooltip, setTooltipContent, closeAllPanels } = useTooltip();

  // Ref for intersection observer
  let noteRef: HTMLDivElement | undefined;

  const powDifficulty = () => getPowDifficulty(props.event);
  const hasPow = () => hasValidPow(props.event, 1);
  const formattedPow = () => formatPowDifficulty(powDifficulty());
  const stats = useNoteStats(props.event);
  const contentClass = () =>
    [
      'text-text-primary break-words font-sans text-base leading-relaxed mb-4',
      !hasPow() ? 'opacity-70' : null,
    ]
      .filter(Boolean)
      .join(' ');

  // Unique ID for this note's tooltip
  const tooltipId = `note-${props.event.id}`;

  // Removed shortPubkey - now using ProfileName component

  const scoreBreakdown = () => {
    const s = stats();
    const prefs = preferences();

    // Build the calculation breakdown
    const lines = [
      'Score Breakdown:',
      '',
      `Root POW: ${s.rootPow}`,
      '',
    ];

    // Reactions with POW
    if (s.reactionsPowCount > 0 || s.reactionsPowTotal !== 0) {
      lines.push(`Reactions with POW (${s.reactionsPowCount}): ${s.reactionsPowTotal.toFixed(1)} × ${(prefs.reactionPowWeight * 100).toFixed(0)}% = ${s.weightedReactionsPow.toFixed(1)}`);
    }

    // Reactions without POW
    if (s.nonPowReactionsCount > 0) {
      lines.push(`Reactions without POW (${s.nonPowReactionsCount}): ${s.nonPowReactionsTotal.toFixed(1)} × ${(prefs.nonPowReactionWeight * 100).toFixed(0)}% = ${s.weightedNonPowReactions.toFixed(1)}`);
    }

    // Replies with POW
    if (s.repliesPowCount > 0 || s.repliesPowTotal !== 0) {
      lines.push(`Replies with POW (${s.repliesPowCount}): ${s.repliesPowTotal.toFixed(1)} × ${(prefs.replyPowWeight * 100).toFixed(0)}% = ${s.weightedRepliesPow.toFixed(1)}`);
    }

    // Replies without POW
    if (s.nonPowRepliesCount > 0) {
      lines.push(`Replies without POW (${s.nonPowRepliesCount}): ${s.nonPowRepliesTotal.toFixed(1)} × ${(prefs.nonPowReplyWeight * 100).toFixed(0)}% = ${s.weightedNonPowReplies.toFixed(1)}`);
    }

    // Profile POW
    if (s.profilePow > 0) {
      lines.push(`Profile POW: ${s.profilePow} × ${(prefs.profilePowWeight * 100).toFixed(0)}% = ${s.weightedProfilePow.toFixed(1)}`);
    }

    lines.push('');

    // Total calculation
    const parts = [s.rootPow.toString()];
    if (s.weightedReactionsPow !== 0) parts.push(s.weightedReactionsPow.toFixed(1));
    if (s.weightedNonPowReactions !== 0) parts.push(s.weightedNonPowReactions.toFixed(1));
    if (s.weightedRepliesPow !== 0) parts.push(s.weightedRepliesPow.toFixed(1));
    if (s.weightedNonPowReplies !== 0) parts.push(s.weightedNonPowReplies.toFixed(1));
    if (s.weightedProfilePow !== 0) parts.push(s.weightedProfilePow.toFixed(1));

    lines.push(`Total = ${parts.join(' + ')}`);
    lines.push(`Total = ${s.totalScore.toFixed(1)}`);

    return lines.join('\n');
  };

  const toggleTooltip = () => {
    if (activeTooltip() === tooltipId) {
      setActiveTooltip(null);
    } else {
      // Close any open panels first
      closeAllPanels?.();
      setTooltipContent(scoreBreakdown());
      setActiveTooltip(tooltipId);
    }
  };

  const timestamp = () => {
    const date = new Date(props.event.created_at * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  // Extract topic tags (#t tags)
  const topics = () => {
    return props.event.tags
      .filter(tag => tag[0] === 't' && tag[1])
      .map(tag => tag[1]);
  };

  const noteLink = () => {
    const nevent = nip19.neventEncode({
      id: props.event.id,
      author: props.event.pubkey,
    });
    return `/e/${nevent}`;
  };

  // Set up intersection observer for lazy loading
  onMount(() => {
    if (noteRef && props.onVisible) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              props.onVisible?.(props.event.id);
              observer.disconnect(); // Only trigger once
            }
          });
        },
        {
          rootMargin: '200px', // Start loading 200px before entering viewport
        }
      );

      observer.observe(noteRef);

      onCleanup(() => observer.disconnect());
    }
  });

  return (
    <div
      ref={noteRef}
      class="p-5 mb-4 rounded-lg dark:bg-white/5 transition-all"
      classList={{
        'border-l-accent bg-bg-primary dark:bg-bg-secondary': hasPow(),
        'border-l-gray-500/30 bg-bg-secondary/50 dark:bg-bg-tertiary/50 opacity-60': !hasPow(),
      }}
    >
      {/* Header - Low contrast msetadata */}
      <div class="flex items-start justify-between mb-2 opacity-60">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <ProfileName pubkey={props.event.pubkey} asLink={true} />
          <div class="text-xs text-text-tertiary">{timestamp()}</div>
        </div>

        <div class="flex items-center gap-2">
          {/* POW Badge */}
          <Show when={hasPow()} fallback={<span class="text-xs text-text-tertiary">no pow</span>}>
            <span
              class="text-xs font-mono text-accent/70 cursor-pointer hover:text-accent transition-colors"
              onClick={toggleTooltip}
            >
              {formattedPow()}
            </span>
          </Show>

          {/* Score (if provided) */}
          <Show when={props.showScore && props.score !== undefined}>
            <div class="relative">
              <span
                class="text-xs font-mono text-text-tertiary cursor-pointer hover:text-text-secondary transition-colors"
                onClick={() => setShowScoreTooltip(!showScoreTooltip())}
              >
                {props.score?.toFixed(1)}
              </span>

              {/* Local tooltip positioned near score */}
              <Show when={showScoreTooltip()}>
                <div
                  class="absolute top-6 right-0 z-[100] bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg p-3 shadow-xl min-w-[300px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <pre class="text-xs font-mono text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                    {scoreBreakdown()}
                  </pre>
                </div>
              </Show>
            </div>
          </Show>
        </div>
      </div>

      {/* Content - HIGH CONTRAST, the focus */}
      <ParsedContent
        content={props.event.content}
        class={contentClass()}
      />

      {/* Topics - Display #t tags */}
      <Show when={topics().length > 0}>
        <div class="flex flex-wrap gap-2 mb-3">
          <For each={topics()}>
            {(topic) => (
              <span class="text-xs px-2 py-1 rounded-md bg-accent/10 text-accent/80 hover:bg-accent/20 transition-colors">
                #{topic}
              </span>
            )}
          </For>
        </div>
      </Show>

      {/* Interaction Stats - Subtle, low contrast */}
      <Show when={!stats().loading && (stats().reactionCount > 0 || stats().replyCount > 0)}>
        <div class="mb-3 text-xs opacity-50 font-mono">
          <span class="text-text-tertiary">
            <Show when={stats().positiveReactionsPow > 0}>
              ↑{stats().positiveReactionsPow}
              {' '}
            </Show>
            <Show when={stats().negativeReactionsPow > 0}>
              ↓{stats().negativeReactionsPow}
              {' '}
            </Show>
            💬{stats().replyCount}{' '}
            <span
              class="text-text-tertiary/60 cursor-help"
              title="Work: Total raw POW from replies before weighting is applied"
            >
              [W:{stats().repliesPowTotal}]
            </span>
            {' | '}
            <span
              class="text-text-secondary cursor-help"
              title="Contributed Work: Total raw POW from reactions and replies combined"
            >
              CW: {stats().contributedWork}
            </span>
            {' '}
            <span
              class="text-text-secondary cursor-help"
              title="Weighted Work: POW after applying reaction and reply weight multipliers from preferences"
            >
              WW: {stats().weightedContributedWork.toFixed(0)}
            </span>
          </span>
        </div>
      </Show>

      {/* Footer - Low contrast actions */}
      <div class="flex gap-4 text-xs opacity-50 hover:opacity-70 transition-opacity">
        <A
          href={noteLink()}
          class="text-text-tertiary hover:text-accent transition-colors"
        >
          view
        </A>
        <button
          onClick={() => setShowReplyComposer(true)}
          class="text-text-tertiary hover:text-accent transition-colors"
        >
          reply
        </button>
        <button
          onClick={() => setShowReactionPicker(true)}
          class="text-text-tertiary hover:text-accent transition-colors"
        >
          react
        </button>
        <button
          onClick={() => {
            const noteId = nip19.noteEncode(props.event.id);
            navigator.clipboard.writeText(`https://notemine.io/n/${noteId}`);
          }}
          class="text-text-tertiary hover:text-accent transition-colors"
        >
          share
        </button>
      </div>

      {/* Reaction Picker Modal - Rendered at document root */}
      <Portal>
        <Show when={showReactionPicker()}>
          <ReactionPicker
            eventId={props.event.id}
            eventAuthor={props.event.pubkey}
            onClose={() => setShowReactionPicker(false)}
          />
        </Show>
      </Portal>

      {/* Reply Composer Modal - Rendered at document root */}
      <Portal>
        <Show when={showReplyComposer()}>
          <ReplyComposer
            parentEvent={props.event}
            onClose={() => setShowReplyComposer(false)}
          />
        </Show>
      </Portal>
    </div>
  );
};
