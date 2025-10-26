import { Component, Show, createSignal } from 'solid-js';
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
}

export const Note: Component<NoteProps> = (props) => {
  const [showReactionPicker, setShowReactionPicker] = createSignal(false);
  const [showReplyComposer, setShowReplyComposer] = createSignal(false);
  const { preferences } = usePreferences();
  const { activeTooltip, setActiveTooltip, setTooltipContent, closeAllPanels } = useTooltip();

  const powDifficulty = () => getPowDifficulty(props.event);
  const hasPow = () => hasValidPow(props.event, 1);
  const formattedPow = () => formatPowDifficulty(powDifficulty());
  const stats = useNoteStats(props.event);

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
      `Reactions POW: ${s.reactionsPowTotal} × ${(prefs.reactionPowWeight * 100).toFixed(0)}% = ${s.weightedReactionsPow.toFixed(1)}`,
      `Replies POW: ${s.repliesPowTotal} × ${(prefs.replyPowWeight * 100).toFixed(0)}% = ${s.weightedRepliesPow.toFixed(1)}`,
      `Profile POW: ${s.profilePow} × ${(prefs.profilePowWeight * 100).toFixed(0)}% = ${s.weightedProfilePow.toFixed(1)}`,
      '',
      `Total = ${s.rootPow} + ${s.weightedReactionsPow.toFixed(1)} + ${s.weightedRepliesPow.toFixed(1)} + ${s.weightedProfilePow.toFixed(1)}`,
      `Total = ${s.totalScore.toFixed(1)}`
    ];

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

  const noteLink = () => {
    const nevent = nip19.neventEncode({
      id: props.event.id,
      author: props.event.pubkey,
    });
    return `/e/${nevent}`;
  };

  return (
    <div
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
            <span
              class="text-xs font-mono text-text-tertiary"
              title={`Total Score: ${props.score?.toFixed(1)}`}
            >
              {props.score?.toFixed(1)}
            </span>
          </Show>
        </div>
      </div>

      {/* Content - HIGH CONTRAST, the focus */}
      <ParsedContent
        content={props.event.content}
        class="text-text-primary break-words font-sans text-base leading-relaxed mb-4"
        classList={{
          'opacity-70': !hasPow(),
        }}
      />

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

      {/* Reaction Picker Modal */}
      <Show when={showReactionPicker()}>
        <ReactionPicker
          eventId={props.event.id}
          eventAuthor={props.event.pubkey}
          onClose={() => setShowReactionPicker(false)}
        />
      </Show>

      {/* Reply Composer Modal */}
      <Show when={showReplyComposer()}>
        <ReplyComposer
          parentEvent={props.event}
          onClose={() => setShowReplyComposer(false)}
        />
      </Show>
    </div>
  );
};
