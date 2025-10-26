import { Component } from 'solid-js';
import { NoteComposer } from '../components/NoteComposer';
import { Timeline } from '../components/Timeline';

const Home: Component = () => {
  return (
    <div class="space-y-6">
      {/* Note Composer */}
      <section>
        <NoteComposer />
      </section>

      {/* Timeline */}
      <section>
        <Timeline limit={50} showScores={true} />
      </section>
    </div>
  );
};

export default Home;
