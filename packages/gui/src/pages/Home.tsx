import { Component } from 'solid-js';
import { A } from '@solidjs/router';
import { NoteComposer } from '../components/NoteComposer';

const Home: Component = () => {
  return (
    <div class="space-y-8">
      <section class="text-center py-12">
        <h1 class="text-4xl font-bold mb-4">
          notemine<span class="text-[var(--accent)]">⛏️</span>
        </h1>
        <p class="text-xl text-[var(--text-secondary)] mb-8">
          a proof-of-work first nostr client
        </p>
        <div class="flex gap-4 justify-center">
          <A href="/feed" class="btn-primary">
            view feed
          </A>
        </div>
      </section>

      {/* Note Composer */}
      <section>
        <NoteComposer />
      </section>

      <section class="grid md:grid-cols-3 gap-6 mt-12">
        <div class="card">
          <h3 class="font-bold mb-2">⛏️ POW First</h3>
          <p class="text-sm text-[var(--text-secondary)]">
            Every note, reaction, and profile edit requires proof-of-work. Quality over quantity.
          </p>
        </div>

        <div class="card">
          <h3 class="font-bold mb-2">🔒 Anonymous by Default</h3>
          <p class="text-sm text-[var(--text-secondary)]">
            Start posting immediately with ephemeral keys. Login optional.
          </p>
        </div>

        <div class="card">
          <h3 class="font-bold mb-2">📊 POW Scoring</h3>
          <p class="text-sm text-[var(--text-secondary)]">
            Notes ranked by combined POW of content + reactions. Best content rises.
          </p>
        </div>
      </section>

      <section class="card mt-8">
        <h2 class="font-bold text-lg mb-4">How it works</h2>
        <ol class="space-y-3 text-sm text-[var(--text-secondary)] list-decimal list-inside">
          <li>Write your note (140 chars max)</li>
          <li>Set difficulty (higher = more exclusive)</li>
          <li>Mine with WASM workers (rust-powered)</li>
          <li>Publish to POW relay network</li>
          <li>Get scored by POW + engagement</li>
        </ol>
      </section>
    </div>
  );
};

export default Home;
