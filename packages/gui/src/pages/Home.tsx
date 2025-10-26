import { Component } from 'solid-js';
import { NoteComposer } from '../components/NoteComposer';
import { InfiniteTimeline } from '../components/InfiniteTimeline';

const Home: Component = () => {
  return (
    <div class="space-y-6">
      {/* Note Composer */}
      <section>
        <NoteComposer />
      </section>

      {/* Timeline with Infinite Scroll */}
      <section>
        <InfiniteTimeline limit={20} showScores={true} />
      </section>
    </div>
  );
};

export default Home;
