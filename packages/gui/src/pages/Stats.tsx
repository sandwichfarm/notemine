import { Component } from 'solid-js';
// import { CacheStats } from '../components/CacheStats';

const Stats: Component = () => {
  return (
    <div class="space-y-6">
      <div class="text-center">
        <h1 class="text-3xl font-bold mb-2">
          Network Stats <span class="text-[var(--accent)]">📊</span>
        </h1>
        <p class="text-text-secondary">
          Mining statistics and performance metrics
        </p>
      </div>

      {/* <CacheStats /> */}
    </div>
  );
};

export default Stats;
