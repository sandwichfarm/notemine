import { Accessor, createMemo, createSignal, onCleanup } from 'solid-js';
import {
  createNip66RelayFeed,
  filterOpenRelays,
  type Nip66RelayDescriptor,
  type Nip66RelayFeedOptions,
  type Nip66RelayFeed,
} from '../lib/nip66';

export interface UseNip66RelayFeedOptions extends Nip66RelayFeedOptions {
  autoStart?: boolean;
  openOnly?: boolean;
}

export interface Nip66RelayFeedHook {
  relays: Accessor<Nip66RelayDescriptor[]>;
  start: () => void;
  stop: () => void;
  isActive: Accessor<boolean>;
}

export const useNip66RelayFeed = (
  options: UseNip66RelayFeedOptions = {}
): Nip66RelayFeedHook => {
  const [relays, setRelays] = createSignal<Nip66RelayDescriptor[]>([]);
  let feed: Nip66RelayFeed | null = null;

  const applyFilters = (snapshot: Nip66RelayDescriptor[]): Nip66RelayDescriptor[] => {
    let next = snapshot;
    if (options.openOnly) {
      next = filterOpenRelays(next);
    }
    return next;
  };

  const handleSnapshot = (snapshot: Nip66RelayDescriptor[]) => {
    setRelays(applyFilters(snapshot));
  };

  const start = () => {
    if (feed) return;
    feed = createNip66RelayFeed({
      ...options,
      onRelay: (_, snapshot) => handleSnapshot(snapshot),
      onEose: (snapshot) => handleSnapshot(snapshot),
    });
    handleSnapshot(feed.snapshot());
  };

  const stop = () => {
    feed?.dispose();
    feed = null;
    setRelays([]);
  };

  onCleanup(() => {
    stop();
  });

  if (options.autoStart !== false) {
    start();
  }

  return {
    relays,
    start,
    stop,
    isActive: createMemo(() => feed !== null),
  };
};
