import { Component } from 'solid-js';
import { NoteComposer } from '../components/NoteComposer';
import { FeedBody } from './Feed';

const Home: Component = () => {
  return (
    <div class="space-y-6">
      {/* Note Composer */}
      <section>
        <NoteComposer />
      </section>

      {/* Embedded Feed below the composer */}
      <section>
        <FeedBody showHeader={false} />
      </section>
    </div>
  );
};

export default Home;
