import { Component, Show, createSignal, For, onMount, onCleanup, createEffect, createMemo } from 'solid-js';
import { Portal } from 'solid-js/web';
import { A } from '@solidjs/router';
import type { NostrEvent } from 'nostr-tools/core';
import { getPowDifficulty, hasValidPow, formatPowDifficulty, calculatePowScore } from '../lib/pow';
import { nip19 } from 'nostr-tools';
import { ReactionPicker } from './ReactionPicker';
import { ReplyComposer } from './ReplyComposer';
import { ReportModal } from './ReportModal';
import { RepostConfirmDialog } from './RepostConfirmDialog';
import { ProfileName } from './ProfileName';
import { ParsedContent } from './ParsedContent';
import { ReactionBreakdown } from './ReactionBreakdown';
import { usePreferences } from '../providers/PreferencesProvider';
import { useTooltip } from '../providers/TooltipProvider';
import type { PreparedNote } from '../types/FeedTypes';
import { getVisibilityObserver } from '../services/VisibilityObserver';
import { getInteractionsCoordinator } from '../services/InteractionsCoordinator';

interface NoteProps {
  event: NostrEvent;
  score?: number;
  showScore?: boolean;
  reactions?: NostrEvent[];
  replies?: NostrEvent[];
  onVisible?: (eventId: string) => void; // Callback when note becomes visible
  preparedNote?: PreparedNote; // Reserved heights for stable rendering (Phase 2)
  interactionTick?: number; // Forces reactive updates on interaction arrivals
  isHydrated?: boolean;
}

// Global signal to track which note's tooltip is open (must be reactive)
import { createSignal as createGlobalSignal } from 'solid-js';
const [globalOpenTooltipId, setGlobalOpenTooltipId] = createGlobalSignal<string | null>(null);

export const Note: Component<NoteProps> = (props) => {
  const [showReactionPicker, setShowReactionPicker] = createSignal(false);
  const [showReplyComposer, setShowReplyComposer] = createSignal(false);
  const [showReportModal, setShowReportModal] = createSignal(false);
  const [showRepostDialog, setShowRepostDialog] = createSignal(false);
  const [showScoreTooltip, setShowScoreTooltip] = createSignal(false);
  const { preferences } = usePreferences();
  const { activeTooltip, setActiveTooltip, setTooltipContent, closeAllPanels } = useTooltip();

  // Ref for intersection observer
  let noteRef: HTMLDivElement | undefined;
  let scoreSpanRef: HTMLSpanElement | undefined;

  const powDifficulty = () => getPowDifficulty(props.event);
  const hasPow = () => hasValidPow(props.event, 1);
  const formattedPow = () => formatPowDifficulty(powDifficulty());

  // Calculate stats directly from props (single source of truth with Timeline)
  const reactionsList = createMemo(() => {
    // Depend on interactionTick so updates stream in immediately
    void (props.interactionTick ?? 0);
    return props.reactions || [];
  });

  const repliesList = createMemo(() => {
    void (props.interactionTick ?? 0);
    return props.replies || [];
  });

  const stats = createMemo(() => {
    const prefs = preferences();
    return calculatePowScore(
      props.event,
      reactionsList(),
      repliesList(),
      {
        reactionPowWeight: prefs.reactionPowWeight,
        replyPowWeight: prefs.replyPowWeight,
        profilePowWeight: prefs.profilePowWeight,
        nonPowReactionWeight: prefs.nonPowReactionWeight,
        nonPowReplyWeight: prefs.nonPowReplyWeight,
        powInteractionThreshold: prefs.powInteractionThreshold,
      }
    );
  });

  const interactionSummaryReady = createMemo(() => {
    const delegated = stats().reactionsPowTotal + stats().repliesPowTotal;
    return reactionsList().length > 0 || repliesList().length > 0 || delegated > 0;
  });

  const hasReactionPills = createMemo(() => reactionsList().length > 0);

  const contentClass = () =>
    [
      'leading-relaxed text-xl',
      !hasPow() ? 'opacity-70' : null,
    ]
      .filter(Boolean)
      .join(' ');

  const hydrated = () => props.isHydrated ?? true;

  // Unique ID for this note's tooltip
  const tooltipId = `tooltip-${props.event.id}`;

  // Watch for global tooltip changes and close this one if another opens
  createEffect(() => {
    if (globalOpenTooltipId() !== tooltipId && showScoreTooltip()) {
      setShowScoreTooltip(false);
    }
  });

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

  // Phase 2: Set up global visibility observer for lazy loading with dwell time
  onMount(() => {
    const { preferences } = usePreferences();

    if (noteRef && props.onVisible) {
      const visibilityObserver = getVisibilityObserver();
      const coordinator = getInteractionsCoordinator();
      let cancelTimer: number | null = null;

      const registerWithObserver = () => {
        // Ensure prior registration is cleared before re-registering
        visibilityObserver.unregister(noteRef!);
        visibilityObserver.register({
          element: noteRef!,
          onVisible: () => {
            // Clear any pending cancel and trigger fetch (coordinator dedupes internally)
            if (cancelTimer !== null) {
              clearTimeout(cancelTimer);
              cancelTimer = null;
            }
            props.onVisible?.(props.event.id);
          },
          onLeave: () => {
            // Do not cancel queued interactions on leave; allow queue to proceed
            // This prevents starvation where only the first N (maxConcurrent) notes ever load
            if (cancelTimer !== null) {
              clearTimeout(cancelTimer);
              cancelTimer = null;
            }
          },
        });
      };

      // Initial registration
      registerWithObserver();

      // Re-register if this DOM node is reused for a different event (due to re-sorting)
      createEffect(() => {
        const id = props.event.id;
        // Re-register to force a fresh visibility evaluation for the new event id
        registerWithObserver();
      });

      onCleanup(() => {
        visibilityObserver.unregister(noteRef!);
        // Do not cancel in-flight fetches on cleanup; allow them to complete
        if (cancelTimer !== null) {
          clearTimeout(cancelTimer);
          cancelTimer = null;
        }
      });
    }

    // Phase 2: ResizeObserver to assert heights don't shrink (stable rendering)
    // Only enabled when feedDebugMode is on
    if (noteRef && props.preparedNote && preferences().feedDebugMode) {
      let maxHeight = 0;
      const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const currentHeight = entry.contentRect.height;

          // Initialize max height on first observation
          if (maxHeight === 0) {
            maxHeight = currentHeight;
            return;
          }

          // Check if height decreased (potential layout shift)
          if (currentHeight < maxHeight) {
            const shrinkage = maxHeight - currentHeight;
            console.warn(
              `[Note ${props.event.id.slice(0, 8)}] Height decreased by ${shrinkage.toFixed(1)}px (${maxHeight.toFixed(1)}px -> ${currentHeight.toFixed(1)}px). This may cause layout shifts.`
            );
            // Update max to allow for intentional height changes (like collapsed content)
            // but we've logged the warning
          } else if (currentHeight > maxHeight) {
            // Height increased - this is acceptable (content expanding)
            maxHeight = currentHeight;
          }
        }
      });

      resizeObserver.observe(noteRef);

      onCleanup(() => resizeObserver.disconnect());
    }
  });

  return (
    <div
      ref={noteRef}
      data-note-id={props.event.id}
      data-interaction-tick={props.interactionTick ?? 0}
      class="!mb-10 note"
      classList={{
        'border-l-accent bg-bg-primary dark:bg-bg-secondary': hasPow(),
        'border-l-gray-500/30 bg-bg-secondary dark:bg-bg-tertiary': !hasPow(),
      }}
    >
      {/* Header - Low contrast metadata */}
      <div class="flex items-start justify-between mb-2">
        <div class="flex items-center gap-2 min-w-0 flex-1 opacity-60">
          <ProfileName pubkey={props.event.pubkey} asLink={true} showAvatar={true} />
          <div class="text-xs text-text-tertiary">{timestamp()}</div>
        </div>

        <div class="flex items-center gap-2">
          {/* POW Badge */}
          <Show when={hasPow()} fallback={<span class="text-xs text-text-tertiary opacity-60">no pow</span>}>
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
                ref={scoreSpanRef}
                class="text-xs font-mono text-text-tertiary cursor-pointer hover:text-text-secondary transition-colors opacity-60"
                onClick={() => {
                  const currentlyOpen = showScoreTooltip();

                  // Toggle this tooltip
                  if (currentlyOpen) {
                    setShowScoreTooltip(false);
                    setGlobalOpenTooltipId(null);
                  } else {
                    setShowScoreTooltip(true);
                    setGlobalOpenTooltipId(tooltipId);
                  }
                }}
              >
                {props.score?.toFixed(1)}
              </span>

              {/* Tooltip positioned relative to score - stays pinned */}
              <Show when={showScoreTooltip()}>
                <div
                  class="
                    absolute 
                    top-6 
                    right-0 
                    z-[9998] 
                    opacity-100
                    tooltip
                    min-w-[300px] 
                    max-w-[400px]"
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

      <div class="my-6">
      {/* Content - HIGH CONTRAST, the focus */}
      <ParsedContent
        content={props.event.content}
        event={props.event}
        class={contentClass()}
        reservedHeights={props.preparedNote?.reservedHeights}
      />
      </div>

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

      

      <div class="mb-3 text-xs font-mono text-black/60 dark:text-white/60 min-h-[24px] flex items-center">
        <Show when={interactionSummaryReady()}>
          <div>
            <Show when={stats().reactionsPowTotal + stats().repliesPowTotal > 0}>
              <span
                class="text-text-secondary cursor-help"
                title="Contributed Work: Total raw POW from reactions and replies combined"
              >
                💎 <strong class="text-white">{(stats().reactionsPowTotal + stats().repliesPowTotal).toFixed(1)} work delegated</strong> via{' '}
              </span>
            </Show>
            <Show when={repliesList().length > 0}>
              {repliesList().length} replies
            </Show>
            <Show when={repliesList().length > 0 && reactionsList().length > 0}>
              {' & '}
            </Show>
            <Show when={reactionsList().length > 0}>
              {reactionsList().length} reactions
            </Show>
          </div>
        </Show>
        <Show when={!interactionSummaryReady() && !hydrated()}>
          <div class="h-4 w-32" />
        </Show>
      </div>



      {/* Reactions Bar - Visual breakdown of reactions */}
      <div class="mb-3 min-h-[32px]">
        <Show when={hasReactionPills()}>
          <ReactionBreakdown
            reactions={reactionsList()}
            eventId={props.event.id}
            eventAuthor={props.event.pubkey}
          />
        </Show>
        <Show when={!hasReactionPills() && !hydrated()}>
          <div class="h-7" />
        </Show>
      </div>

      
      
      {/* Interaction Stats - Subtle, low contrast */}
      {/* <Show when={(props.reactions?.length || 0) > 0 || (props.replies?.length || 0) > 0}>
        <div class="mb-3 text-xs font-mono">
          <Show when={stats().reactionsPowTotal + stats().repliesPowTotal > 0}>

          </Show>
          <span class="text-text-tertiary">
            
            <Show when={stats().repliesPowTotal > 0}>
              <span
                class="text-text-tertiary/60 cursor-help"
                title="Work: Total raw POW from replies before weighting is applied"
              >
                [W:{stats().repliesPowTotal.toFixed(1)}]
              </span>
              {' | '}
            </Show>
            
          </span>
        </div>
      </Show> */}

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
          onClick={() => setShowRepostDialog(true)}
          class="text-text-tertiary hover:text-green-500 transition-colors"
        >
          repost
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
        <button
          onClick={() => setShowReportModal(true)}
          class="text-text-tertiary hover:text-red-500 transition-colors"
        >
          report
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

      {/* Report Modal - Rendered at document root */}
      <Portal>
        <Show when={showReportModal()}>
          <ReportModal
            isOpen={showReportModal()}
            onClose={() => setShowReportModal(false)}
            eventId={props.event.id}
            authorPubkey={props.event.pubkey}
            targetKind={1}
          />
        </Show>
      </Portal>

      {/* Repost Dialog - Rendered at document root */}
      <Portal>
        <Show when={showRepostDialog()}>
          <RepostConfirmDialog
            isOpen={showRepostDialog()}
            onClose={() => setShowRepostDialog(false)}
            originalEvent={props.event}
          />
        </Show>
      </Portal>
    </div>
  );
};
