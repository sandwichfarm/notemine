import { createContext, useContext, ParentComponent, createSignal, createEffect } from 'solid-js';
import type { Accessor } from 'solid-js';
import type { Subscription } from 'rxjs';
import type { NostrEvent } from 'nostr-tools/core';
import { useUser } from './UserProvider';
import { usePublishing } from './PublishingProvider';
import {
  eventStore,
  getUserFollows,
  getUserOutboxRelays,
  getPublishRelays,
} from '../lib/applesauce';
import { buildContactListTags, extractContactListParts } from '../lib/contact-list';
import { debug } from '../lib/debug';

interface ContactListState {
  content: string;
  nonFollowTags: string[][];
}

interface FollowsContextType {
  follows: Accessor<string[]>;
  isFollowing: (pubkey?: string) => boolean;
  follow: (pubkey: string) => Promise<void>;
  unfollow: (pubkey: string) => Promise<void>;
  toggleFollow: (pubkey: string, nextState?: boolean) => Promise<void>;
  isUpdating: (pubkey: string) => boolean;
  loading: Accessor<boolean>;
  error: Accessor<string | null>;
  canFollow: Accessor<boolean>;
}

const FollowsContext = createContext<FollowsContextType>();

export const FollowsProvider: ParentComponent = (props) => {
  const { user } = useUser();
  const publishing = usePublishing();

  const [followsSet, setFollowsSet] = createSignal<Set<string>>(new Set());
  const [contactListState, setContactListState] = createSignal<ContactListState | null>(null);
  const [followTagMap, setFollowTagMap] = createSignal<Map<string, string[]>>(new Map());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [updatingTargets, setUpdatingTargets] = createSignal<Set<string>>(new Set());

  let subscription: Subscription | null = null;

  const resetState = () => {
    setFollowsSet(new Set());
    setFollowTagMap(new Map());
    setContactListState(null);
    setError(null);
    setUpdatingTargets(new Set());
  };

  const cleanupSubscription = () => {
    subscription?.unsubscribe();
    subscription = null;
  };

  const applyContactListEvent = (event: NostrEvent) => {
    const { nonFollowTags, followTagMap: nextMap, followOrder } = extractContactListParts(event.tags || []);
    setContactListState({
      content: event.content || '',
      nonFollowTags,
    });
    setFollowTagMap(nextMap);
    setFollowsSet(new Set(followOrder));
  };

  createEffect(() => {
    const currentUser = user();
    cleanupSubscription();
    resetState();

    if (!currentUser) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const pubkey = currentUser.pubkey;
    let disposed = false;

    const existing = eventStore.getReplaceable(3, pubkey);
    if (existing) {
      applyContactListEvent(existing as NostrEvent);
      setLoading(false);
    }

    subscription = eventStore.replaceable(3, pubkey).subscribe({
      next: (event) => {
        if (disposed) return;
        if (event) {
          applyContactListEvent(event as NostrEvent);
          setLoading(false);
        }
      },
      complete: () => {
        if (!disposed) setLoading(false);
      },
    });

    getUserFollows(pubkey)
      .then((follows) => {
        if (disposed || contactListState()) return;
        const map = new Map<string, string[]>();
        follows.forEach((pk) => map.set(pk, ['p', pk]));
        setFollowTagMap(map);
        setFollowsSet(new Set(follows));
        setContactListState({
          content: '',
          nonFollowTags: [],
        });
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });

    return () => {
      disposed = true;
      cleanupSubscription();
    };
  });

  const setUpdating = (pubkey: string, next: boolean) => {
    setUpdatingTargets((prev) => {
      const nextSet = new Set(prev);
      if (next) {
        nextSet.add(pubkey);
      } else {
        nextSet.delete(pubkey);
      }
      return nextSet;
    });
  };

  const publishContactList = async (
    pubkey: string,
    tags: string[][],
    content: string
  ) => {
    const eventTemplate = {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content,
      pubkey,
    } as unknown as NostrEvent;

    const userRelays = await getUserOutboxRelays(pubkey).catch(() => []);
    const relays = getPublishRelays(userRelays);

    publishing.addPublishJob({
      eventTemplate,
      relays,
      meta: {
        kind: 3,
        difficulty: 0,
        type: 'contacts',
      },
    });
  };

  const toggleFollowInternal = async (targetPubkey: string, desiredState?: boolean) => {
    const currentUser = user();
    if (!currentUser) {
      setError('You must be signed in to manage follows');
      return;
    }
    if (!targetPubkey || currentUser.pubkey === targetPubkey) {
      return;
    }

    const currentSet = new Set(followsSet());
    const nextState = typeof desiredState === 'boolean' ? desiredState : !currentSet.has(targetPubkey);

    if (nextState && currentSet.has(targetPubkey)) {
      return;
    }
    if (!nextState && !currentSet.has(targetPubkey)) {
      return;
    }

    const prevSet = new Set(currentSet);
    const prevMap = new Map(followTagMap());
    const prevContactState = contactListState()
      ? {
          content: contactListState()!.content,
          nonFollowTags: contactListState()!.nonFollowTags.map(tag => [...tag]),
        }
      : null;

    const baseContent = contactListState()?.content || '';
    const baseNonFollowTags = contactListState()?.nonFollowTags || [];

    const nextMap = new Map(prevMap);
    if (nextState) {
      currentSet.add(targetPubkey);
      if (!nextMap.has(targetPubkey)) {
        nextMap.set(targetPubkey, ['p', targetPubkey]);
      }
    } else {
      currentSet.delete(targetPubkey);
      nextMap.delete(targetPubkey);
    }

    const nextTags = buildContactListTags(baseNonFollowTags, currentSet, nextMap);

    // Optimistic update
    setFollowTagMap(nextMap);
    setFollowsSet(new Set(currentSet));
    setContactListState({
      content: baseContent,
      nonFollowTags: baseNonFollowTags.map(tag => [...tag]),
    });

    setUpdating(targetPubkey, true);
    setError(null);

    try {
      await publishContactList(currentUser.pubkey, nextTags, baseContent);
      debug('[Follows] Updated contact list for', currentUser.pubkey.slice(0, 8));
    } catch (err: any) {
      // Revert optimistic update
      setFollowTagMap(prevMap);
      setFollowsSet(prevSet);
      if (prevContactState) {
        setContactListState(prevContactState);
      } else {
        setContactListState(null);
      }
      const message = err?.message || 'Failed to update follows';
      setError(message);
      throw err;
    } finally {
      setUpdating(targetPubkey, false);
    }
  };

  const follows = () => Array.from(followsSet());
  const isFollowing = (pubkey?: string) => {
    if (!pubkey) return false;
    return followsSet().has(pubkey);
  };

  const value: FollowsContextType = {
    follows,
    isFollowing,
    follow: (pubkey: string) => toggleFollowInternal(pubkey, true),
    unfollow: (pubkey: string) => toggleFollowInternal(pubkey, false),
    toggleFollow: (pubkey: string, nextState?: boolean) => toggleFollowInternal(pubkey, nextState),
    isUpdating: (pubkey: string) => updatingTargets().has(pubkey),
    loading,
    error,
    canFollow: () => !!user(),
  };

  return (
    <FollowsContext.Provider value={value}>
      {props.children}
    </FollowsContext.Provider>
  );
};

export function useFollows(): FollowsContextType {
  const context = useContext(FollowsContext);
  if (!context) {
    throw new Error('useFollows must be used within FollowsProvider');
  }
  return context;
}
