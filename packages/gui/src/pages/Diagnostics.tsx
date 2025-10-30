import { Component, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { getCacheHealth, getCacheMetrics } from '../lib/cache';
import { getActiveRelays, getPowRelays } from '../lib/applesauce';
import { RelayStats } from '../components/RelayStats';

type CheckStatus = 'idle' | 'ok' | 'fail';

const Diagnostics: Component = () => {
  // COI status
  const [coi, setCoi] = createSignal<boolean>(false);

  // Cache state
  const [health, setHealth] = createSignal(getCacheHealth());
  const [metrics, setMetrics] = createSignal(getCacheMetrics());

  // Relays
  const [activeRelays, setActiveRelays] = createSignal<string[]>([]);
  const [powRelays, setPowRelays] = createSignal<string[]>([]);

  // CSP checks (on-demand)
  const [blobWorkerCheck, setBlobWorkerCheck] = createSignal<CheckStatus>('idle');
  const [dataFetchCheck, setDataFetchCheck] = createSignal<CheckStatus>('idle');
  const [lastError, setLastError] = createSignal<string | null>(null);
  const [copyState, setCopyState] = createSignal<'idle' | 'copied' | 'error'>('idle');

  let intervalId: number | undefined;

  onMount(() => {
    setCoi(!!window.crossOriginIsolated);
    // Prime relay data
    setActiveRelays(getActiveRelays());
    setPowRelays(getPowRelays());

    // Poll cache health and metrics periodically
    const update = () => {
      setHealth(getCacheHealth());
      setMetrics(getCacheMetrics());
      setActiveRelays(getActiveRelays());
      setPowRelays(getPowRelays());
    };
    update();
    intervalId = window.setInterval(update, 2000);
  });

  onCleanup(() => {
    if (intervalId) clearInterval(intervalId);
  });

  async function runCspChecks() {
    setLastError(null);
    // Check blob worker creation (worker-src 'blob:')
    try {
      const code = 'self.onmessage = (e) => postMessage("ok")';
      const blob = new Blob([code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      worker.terminate();
      URL.revokeObjectURL(url);
      setBlobWorkerCheck('ok');
    } catch (e: any) {
      setBlobWorkerCheck('fail');
      setLastError(`[blob worker] ${e?.message || String(e)}`);
    }

    // Check data: fetch (connect-src 'data:')
    try {
      const res = await fetch('data:text/plain,ok');
      if (res.ok) {
        setDataFetchCheck('ok');
      } else {
        setDataFetchCheck('fail');
        setLastError(`[data fetch] HTTP ${res.status}`);
      }
    } catch (e: any) {
      setDataFetchCheck('fail');
      setLastError(prev => (prev ? prev + '\n' : '') + `[data fetch] ${e?.message || String(e)}`);
    }
  }

  async function copyReport() {
    try {
      const report = {
        timestamp: new Date().toISOString(),
        environment: import.meta.env.DEV ? 'development' : 'production',
        coiEnabled: coi(),
        cache: {
          status: health().status,
          issuesCount: health().issues?.length || 0,
          warningsCount: health().warnings?.length || 0,
          totalEventsWritten: metrics().totalEventsWritten,
          flushErrorCount: metrics().flushErrorCount,
          avgFlushDurationMs: Number(metrics().avgFlushDurationMs?.toFixed?.(1) ?? 0),
        },
        relays: {
          activeCount: activeRelays().length,
          powDiscoveredCount: powRelays().length,
        },
        cspChecks: {
          blobWorker: blobWorkerCheck(),
          dataFetch: dataFetchCheck(),
        },
      } as const;

      const text = JSON.stringify(report, null, 2);
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (e) {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 3000);
    }
  }

  const badge = (ok: boolean, label: string) => (
    <span class="px-2 py-0.5 rounded text-xs"
      classList={{ 'bg-green-500/20 text-green-500': ok, 'bg-red-500/20 text-red-500': !ok }}>
      {label}
    </span>
  );

  return (
    <div class="space-y-6">
      <div class="text-center">
        <h1 class="text-3xl font-bold mb-2">Diagnostics</h1>
        <p class="text-text-secondary">Runtime health, relays, and CSP checks</p>
      </div>

      {/* COI and Environment */}
      <div class="grid md:grid-cols-3 gap-4">
        <div class="card p-4">
          <div class="font-semibold mb-2">Cross-Origin Isolation</div>
          {badge(coi(), coi() ? 'Enabled' : 'Disabled')}
          <div class="text-xs text-text-secondary mt-2">
            Requires COOP: same-origin and COEP: credentialless
          </div>
        </div>

        <div class="card p-4">
          <div class="font-semibold mb-2">Active Relays</div>
          <div class="text-2xl font-bold">{activeRelays().length}</div>
          <div class="text-xs text-text-secondary mt-2">POW discovered: {powRelays().length}</div>
        </div>

        <div class="card p-4">
          <div class="font-semibold mb-2">Environment</div>
          <div class="text-sm">{import.meta.env.DEV ? 'Development' : 'Production'}</div>
        </div>
      </div>

      {/* Cache health */}
      <div class="card p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-xl font-bold">Cache</h2>
        </div>

        <div class="grid md:grid-cols-4 gap-4">
          <div>
            <div class="text-sm text-text-secondary">Status</div>
            <div class="mt-1">
              {badge(!health().issues?.length && health().status !== 'disabled', health().status || 'unknown')}
            </div>
          </div>
          <div>
            <div class="text-sm text-text-secondary">Events Written</div>
            <div class="font-mono">{metrics().totalEventsWritten}</div>
          </div>
          <div>
            <div class="text-sm text-text-secondary">Flush Errors</div>
            <div class="font-mono">{metrics().flushErrorCount}</div>
          </div>
          <div>
            <div class="text-sm text-text-secondary">Avg Flush (ms)</div>
            <div class="font-mono">{metrics().avgFlushDurationMs.toFixed(1)}</div>
          </div>
        </div>

        <Show when={health().issues && health().issues.length > 0}>
          <div class="mt-3 text-xs text-red-500">
            Issues: {health().issues?.join(', ')}
          </div>
        </Show>
        <Show when={health().warnings && health().warnings.length > 0}>
          <div class="mt-1 text-xs text-yellow-500">
            Warnings: {health().warnings?.join(', ')}
          </div>
        </Show>
      </div>

      {/* CSP checks */}
      <div class="card p-6">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-bold">CSP Checks</h2>
          <div class="flex items-center gap-2">
            <button class="px-3 py-1.5 text-sm rounded bg-accent text-white" onClick={runCspChecks}>
              Run Checks
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded bg-bg-secondary dark:bg-bg-tertiary hover:bg-accent/20"
              title="Copy a redacted diagnostics report to clipboard"
              onClick={copyReport}
            >
              Copy Report
            </button>
            <Show when={copyState() !== 'idle'}>
              <span class="text-xs"
                classList={{ 'text-green-500': copyState() === 'copied', 'text-red-500': copyState() === 'error' }}>
                {copyState() === 'copied' ? 'Copied' : 'Copy failed'}
              </span>
            </Show>
          </div>
        </div>
        <div class="grid md:grid-cols-3 gap-4 text-sm">
          <div class="flex items-center gap-2">
            <span>Blob Worker</span>
            {badge(blobWorkerCheck() === 'ok', blobWorkerCheck())}
          </div>
          <div class="flex items-center gap-2">
            <span>data: Fetch</span>
            {badge(dataFetchCheck() === 'ok', dataFetchCheck())}
          </div>
          <div class="text-text-secondary">
            Tip: YouTube embeds require frame-src youtube domains; remote mp4 needs media-src https: data: blob:
          </div>
        </div>
        <Show when={lastError()}>
          <div class="mt-3 text-xs text-red-500 whitespace-pre-wrap">{lastError()}</div>
        </Show>
      </div>

      {/* Relay stats */}
      <RelayStats />
    </div>
  );
};

export default Diagnostics;
