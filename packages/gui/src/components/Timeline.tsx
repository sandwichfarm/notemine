import { Component, createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { createTimelineStream, getActiveRelays, relayPool } from '../lib/applesauce';
import { calculatePowScore, getPowDifficulty } from '../lib/pow';
import { Note } from './Note';
import { Subscription } from 'rxjs';
import { debug } from '../lib/debug';

interface TimelineProps {
  limit?: number;
  showScores?: boolean;
}

interface ScoredNote {
  event: NostrEvent;
  score: number;
}

export const Timeline: Component<TimelineProps> = (props) => {
  const [notes, setNotes] = createSignal<ScoredNote[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let subscription: Subscription | null = null;

  onMount(() => {
    const eventCache = new Map<string, NostrEvent>();
    const reactionsCache = new Map<string, NostrEvent[]>();
    const repliesCache = new Map<string, NostrEvent[]>();
    const maxEvents = props.limit ?? 50;

    try {
      const relays = getActiveRelays();
      debug('[Timeline] Loading from relays:', relays);

      if (relays.length === 0) {
        setError('No relays connected');
        setLoading(false);
        return;
      }

      // Create timeline subscription for kind 1 notes
      const timeline$ = createTimelineStream(relays, [{ kinds: [1], limit: maxEvents }], {
        limit: maxEvents,
      });

      // Subscribe to timeline updates
      subscription = timeline$.subscribe({
        next: (event: NostrEvent) => {
          eventCache.set(event.id, event);

          // Initialize reaction and reply arrays for this event
          if (!reactionsCache.has(event.id)) {
            reactionsCache.set(event.id, []);
          }
          if (!repliesCache.has(event.id)) {
            repliesCache.set(event.id, []);
          }

          // Fetch reactions for this event
          const reactionsObs = relayPool.req(relays, { kinds: [7], '#e': [event.id], limit: 100 });
          reactionsObs.subscribe({
            next: (response) => {
              if (response !== 'EOSE' && response.kind === 7) {
                const reaction = response as NostrEvent;
                const existing = reactionsCache.get(event.id) || [];
                if (!existing.find(r => r.id === reaction.id)) {
                  existing.push(reaction);
                  reactionsCache.set(event.id, existing);
                  recalculateScores();
                }
              }
            },
          });

          // Fetch replies for this event
          const repliesObs = relayPool.req(relays, { kinds: [1], '#e': [event.id], limit: 50 });
          repliesObs.subscribe({
            next: (response) => {
              if (response !== 'EOSE' && response.kind === 1) {
                const reply = response as NostrEvent;
                const existing = repliesCache.get(event.id) || [];
                if (!existing.find(r => r.id === reply.id)) {
                  existing.push(reply);
                  repliesCache.set(event.id, existing);
                  recalculateScores();
                }
              }
            },
          });

          recalculateScores();
        },
        error: (err: unknown) => {
          console.error('[Timeline] Error:', err);
          setError(String(err));
          setLoading(false);
        },
        complete: () => {
          setLoading(false);
        },
      });

      function recalculateScores() {
        const scoredNotes = Array.from(eventCache.values()).map((evt) => {
          const reactions = reactionsCache.get(evt.id) || [];
          const replies = repliesCache.get(evt.id) || [];

          // Calculate score with reactions
          const score = calculatePowScore(evt, reactions);

          // Add reply POW to total score
          const repliesPow = replies.reduce((sum, r) => sum + getPowDifficulty(r), 0);
          const totalScore = score.totalScore + repliesPow;

          return { event: evt, score: totalScore };
        });

        scoredNotes.sort((a, b) => b.score - a.score);

        const topNotes = scoredNotes.slice(0, maxEvents);
        const topNoteIds = new Set(topNotes.map(n => n.event.id));

        // Only keep top notes and their cached data
        for (const [id] of eventCache) {
          if (!topNoteIds.has(id)) {
            eventCache.delete(id);
            reactionsCache.delete(id);
            repliesCache.delete(id);
          }
        }

        setNotes(topNotes);
        setLoading(false);
      }
    } catch (err) {
      console.error('[Timeline] Setup error:', err);
      setError(String(err));
      setLoading(false);
    }
  });

  onCleanup(() => {
    subscription?.unsubscribe();
  });

  return (
    <div class="w-full max-w-2xl mx-auto space-y-4">
      {/* Loading state */}
      <Show when={loading()}>
        <div class="card p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-accent border-t-transparent"></div>
          <p class="mt-4 text-text-secondary">Loading notes from POW relays...</p>
        </div>
      </Show>

      {/* Error state */}
      <Show when={error()}>
        <div class="card p-4 bg-red-100 dark:bg-red-900/20 border-red-500">
          <p class="text-red-700 dark:text-red-400">Error: {error()}</p>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!loading() && !error() && notes().length === 0}>
        <div class="card p-8 text-center">
          <p class="text-xl mb-2">⛏️</p>
          <p class="text-text-secondary">No notes found</p>
          <p class="text-sm text-text-tertiary mt-2">
            Be the first to post with proof-of-work!
          </p>
        </div>
      </Show>

      {/* Notes list */}
      <Show when={!loading() && notes().length > 0}>
        <div class="space-y-3">
          <div class="text-sm text-text-secondary mb-2">
            {notes().length} notes • sorted by POW score
          </div>
          <For each={notes()}>
            {(scoredNote) => (
              <Note
                event={scoredNote.event}
                score={scoredNote.score}
                showScore={props.showScores ?? true}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
