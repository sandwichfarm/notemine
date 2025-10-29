import { Component, Show, For } from 'solid-js';
import { useMining } from '../providers/MiningProvider';

interface MiningStatsButtonProps {
  onToggle: () => void;
  isActive: boolean;
}

export const MiningStatsButton: Component<MiningStatsButtonProps> = (props) => {
  // Access global mining state
  const { miningState } = useMining();
  const state = miningState;

  return (
    <button
      onClick={props.onToggle}
      class="btn text-xs px-3 py-2 flex items-center gap-2"
      title="Toggle mining stats"
    >
      <span
        class="inline-block"
        classList={{
          'animate-[swing_0.6s_ease-in-out_infinite]': state().mining,
        }}
        style={{
          'transform-origin': 'center bottom',
        }}
      >
        ⛏️
      </span>
      <Show when={state().mining}>
        <span class="font-mono text-accent">
          {state().hashRate.toFixed(2)} KH/s
        </span>
      </Show>
    </button>
  );
};

export const MiningPanel: Component = () => {
  const { miningState } = useMining();
  const state = miningState;

  return (
    <div class="px-6 py-4  bg-black/90">
      <div class="max-w-6xl mx-auto">
        <Show
          when={state().mining}
          fallback={
            <div class="text-sm text-text-secondary text-center py-2 opacity-60">
              No active mining
            </div>
          }
        >
          <div class="space-y-4">
            {/* Stats Header */}
            <div class="flex items-center justify-between pb-3">
              <div>
                <div class="text-xs text-text-secondary mb-1 opacity-60">Total Hash Rate</div>
                <div class="text-2xl font-bold text-accent">
                  {state().hashRate.toFixed(2)} <span class="text-sm">KH/s</span>
                  <span class="text-xs text-text-tertiary ml-2">
                    ({(state().hashRate / 1000).toFixed(2)} MH/s)
                  </span>
                </div>
              </div>

              {/* Phase 9: Highest Diff derived from current workers only */}
              <Show when={Object.keys(state().workersBestPow).length > 0}>
                <div class="text-right">
                  <div class="text-xs text-text-secondary mb-1 opacity-60">Highest Diff</div>
                  <div class="text-lg font-mono text-accent">
                    {(() => {
                      // Derive max from current workers (not from legacy state)
                      const workerPows = Object.values(state().workersBestPow);
                      const maxPow = workerPows.reduce((max, worker) =>
                        worker.bestPow > max ? worker.bestPow : max,
                        0
                      );
                      return maxPow;
                    })()}
                  </div>
                </div>
              </Show>
            </div>

            {/* Per-Worker Stats - Full Width */}
            <Show when={Object.keys(state().workersBestPow).length > 0}>
              <div>
                <div class="text-xs text-text-secondary mb-3 opacity-60">
                  Worker Overview ({Object.keys(state().workersBestPow).length} miners)
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  <For each={Object.entries(state().workersBestPow).sort(([a], [b]) => Number(a) - Number(b))}>
                    {([workerId, worker]) => {
                      const id = Number(workerId);
                      return (
                        <div class="text-xs font-mono text-text-primary bg-bg-primary/50 dark:bg-bg-secondary/50 p-2 rounded">
                          <span class="text-text-secondary">Miner #{id}:</span>{' '}
                          <span class="text-accent">{((state().workersHashRates[id] || 0) / 1000).toFixed(2)} KH/s</span>
                          <div class="text-[10px] text-text-tertiary mt-1">
                            PoW: {worker.bestPow || 0} | Current: {state().workersCurrentNonces[id] || 'N/A'}
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};
