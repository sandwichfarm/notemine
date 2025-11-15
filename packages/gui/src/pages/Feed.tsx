import { Show, createMemo } from 'solid-js';
import type { RouteSectionProps } from '@solidjs/router';
import { A } from '@solidjs/router';
import { NoteComposer } from '../components/NoteComposer';
import { WoTTimeline } from '../components/WoTTimeline';
import { useUser } from '../providers/UserProvider';
import { useTimelineContext } from '../providers/TimelineProvider';
import { useTimelineGate } from '../hooks/useTimelineGate';

export interface FeedBodyProps {
  showHeader?: boolean;
}

export const FeedBody = (_props: FeedBodyProps = {}) => {
  const { user } = useUser();
  const { context } = useTimelineContext();
  useTimelineGate();

  const activePubkey = createMemo(() => context()?.pubkey || user()?.pubkey);

  return (
    <div class="space-y-8">
      <NoteComposer />

      <Show
        when={activePubkey()}
        fallback={
          <div class="card text-center space-y-3">
            <p class="text-text-secondary">
              Choose a Web-of-Trust seed on the landing screen to load the timeline.
            </p>
            <A href="/landing" class="btn inline-flex items-center justify-center">
              Go to landing
            </A>
          </div>
        }
      >
        <WoTTimeline userPubkey={activePubkey()!} limit={100} showScores />
      </Show>
    </div>
  );
};

const Feed = (_: RouteSectionProps<unknown>) => {
  return <FeedBody showHeader={false} />;
};

export default Feed;
