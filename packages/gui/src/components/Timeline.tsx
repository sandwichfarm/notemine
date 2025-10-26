import { Component, createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import type { NostrEvent } from 'nostr-tools/core';
import { eventStore, timelineLoader, getActiveRelays } from '../lib/applesauce';
import { calculatePowScore } from '../lib/pow';
import { Note } from './Note';
import { Subscription } from 'rxjs';

interface TimelineProps {
  limit?: number;
  showScores?: boolean;
}

export const Timeline: Component<TimelineProps> = (props) => {
  const [notes, setNotes] = createSignal<NostrEvent[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  let subscription: Subscription | null = null;

  onMount(() => {
    try {
      const relays = getActiveRelays();
      console.log('[Timeline] Loading from relays:', relays);

      if (relays.length === 0) {
        setError('No relays connected');
        setLoading(false);
        return;
      }

      // Create timeline subscription for kind 1 notes
      const timeline$ = timelineLoader.loadTimeline(
        relays,
        [{ kinds: [1], limit: props.limit || 50 }],
        { eventStore }
      );

      // Subscribe to timeline updates
      subscription = timeline$.subscribe({
        next: (events) => {
          console.log('[Timeline] Received events:', events.length);

          // Calculate POW scores and sort by score
          const scoredNotes = events.map((event) => {
            const score = calculatePowScore(event);
            return { event, score: score.totalScore };
          });

          // Sort by score (highest first)
          scoredNotes.sort((a, b) => b.score - a.score);

          setNotes(scoredNotes.map((n) => n.event));
          setLoading(false);
        },
        error: (err) => {
          console.error('[Timeline] Error:', err);
          setError(String(err));
          setLoading(false);
        },
      });
    } catch (err) {
      console.error('[Timeline] Setup error:', err);
      setError(String(err));
      setLoading(false);
    }
  });

  onCleanup(() => {
    if (subscription) {
      subscription.unsubscribe();
    }
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
            {(note) => {
              const score = calculatePowScore(note);
              return (
                <Note
                  event={note}
                  score={score.totalScore}
                  showScore={props.showScores ?? true}
                />
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};
