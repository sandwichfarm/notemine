import { Component } from 'solid-js';
import { Timeline } from '../components/Timeline';

const Feed: Component = () => {
  return (
    <div class="space-y-6">
      <div class="text-center">
        <h1 class="text-3xl font-bold mb-2">
          Feed <span class="text-[var(--accent)]">⛏️</span>
        </h1>
        <p class="text-text-secondary">
          Notes ranked by proof-of-work • highest score first
        </p>
      </div>

      <Timeline limit={100} showScores={true} />
    </div>
  );
};

export default Feed;
