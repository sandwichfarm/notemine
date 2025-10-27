import { Component, Show, For } from 'solid-js';
import { useMining } from '../providers/MiningProvider';

interface MiningStatsButtonProps {
  onToggle: () => void;
  isActive: boolean;
}

export const MiningStatsButton: Component<MiningStatsButtonProps> = (props) => {
  // Access global mining state
  const { globalMiningState } = useMining();
  const state = globalMiningState;

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
  const { globalMiningState } = useMining();
  const state = globalMiningState;

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

              {/* Overall Best POW */}
              <Show when={state().overallBestPow !== null}>
                <div class="text-right">
                  <div class="text-xs text-text-secondary mb-1 opacity-60">Best POW Found</div>
                  <div class="text-lg font-mono text-accent">
                    {state().overallBestPow}
                  </div>
                </div>
              </Show>
            </div>

            {/* Per-Worker Stats - Full Width */}
            <Show when={state().workersBestPow.length > 0}>
              <div>
                <div class="text-xs text-text-secondary mb-3 opacity-60">
                  Worker Overview ({state().workersBestPow.length} miners)
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  <For each={state().workersBestPow}>
                    {(worker, index) => (
                      <div class="text-xs font-mono text-text-primary bg-bg-primary/50 dark:bg-bg-secondary/50 p-2 rounded">
                        <span class="text-text-secondary">Miner #{index()}:</span>{' '}
                        <span class="text-accent">{((state().workersHashRates[index()] || 0) / 1000).toFixed(2)} KH/s</span>
                        <div class="text-[10px] text-text-tertiary mt-1">
                          PoW: {worker.bestPow || 0} | Nonce: {worker.nonce || 'N/A'}
                        </div>
                      </div>
                    )}
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
