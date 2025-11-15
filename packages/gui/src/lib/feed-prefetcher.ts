import { ReplaySubject, Subscription } from 'rxjs';
import type { FeedEvent, FeedParams } from '../types/FeedTypes';
import type { RelayMap } from '../services/AdaptiveFeedService';
import { loadWoTFeed } from '../services/AdaptiveFeedService';

interface FeedPrefetchHandle {
  subject: ReplaySubject<FeedEvent>;
  subscription: Subscription;
  authorsKey: string;
}

export interface FeedPrefetchTransfer {
  stream: ReplaySubject<FeedEvent>;
  upstream: Subscription;
}

let activePrefetch: FeedPrefetchHandle | null = null;

const sortKey = (authors: string[]) => authors.slice().sort().join(':');

export function startFeedPrefetch(
  authors: string[],
  relayMap: RelayMap,
  params: Partial<FeedParams>,
  debug: boolean = false
): void {
  if (!authors.length) return;
  cancelFeedPrefetch();
  const subject = new ReplaySubject<FeedEvent>(50);
  const subscription = loadWoTFeed(authors, relayMap, params, debug).subscribe({
    next: (event) => subject.next(event),
    error: (err) => subject.error(err),
    complete: () => subject.complete(),
  });
  activePrefetch = {
    subject,
    subscription,
    authorsKey: sortKey(authors),
  };
}

export function consumeFeedPrefetch(authors: string[]): FeedPrefetchTransfer | null {
  if (!activePrefetch) return null;
  if (sortKey(authors) !== activePrefetch.authorsKey) {
    cancelFeedPrefetch();
    return null;
  }

  const handle = activePrefetch;
  activePrefetch = null;
  return {
    stream: handle.subject,
    upstream: handle.subscription,
  };
}

export function cancelFeedPrefetch(): void {
  if (!activePrefetch) return;
  activePrefetch.subscription.unsubscribe();
  activePrefetch.subject.complete();
  activePrefetch = null;
}
