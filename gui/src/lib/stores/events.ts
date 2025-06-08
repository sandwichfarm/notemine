import { writable, derived } from 'svelte/store';
import type { NostrEvent } from '$lib/types';
import { eventService } from '$lib/services/events';

export interface EventsState {
  notes: NostrEvent[];
  replies: Map<string, NostrEvent[]>;
  loading: boolean;
  error: string | null;
}

const initialState: EventsState = {
  notes: [],
  replies: new Map(),
  loading: false,
  error: null
};

function createEventsStore() {
  const { subscribe, set, update } = writable<EventsState>(initialState);

  return {
    subscribe,
    addNote: (note: NostrEvent) => update(state => ({
      ...state,
      notes: [note, ...state.notes].sort((a, b) => b.created_at - a.created_at)
    })),
    addReply: (parentId: string, reply: NostrEvent) => update(state => {
      const replies = new Map(state.replies);
      const existing = replies.get(parentId) || [];
      replies.set(parentId, [...existing, reply]);
      return { ...state, replies };
    }),
    setNotes: (notes: NostrEvent[]) => update(state => ({
      ...state,
      notes: notes.sort((a, b) => b.created_at - a.created_at)
    })),
    setLoading: (loading: boolean) => update(state => ({ ...state, loading })),
    setError: (error: string | null) => update(state => ({ ...state, error })),
    clear: () => set(initialState)
  };
}

export const events = createEventsStore();