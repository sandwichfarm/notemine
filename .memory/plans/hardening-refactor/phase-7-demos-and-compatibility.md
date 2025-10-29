# Phase 7 — Demos & Compatibility

Purpose: keep the learning curve low (demos) while enabling advanced apps (GUI) without breaking compatibility.

## Minimal Demo (no resume)

```ts
import { Notemine } from '@notemine/wrapper';

const miner = new Notemine({ content: 'Hello', pubkey, difficulty: 21 });
miner.progress$.subscribe(({ workerId, hashRate }) => {
  if (hashRate) console.log(`Worker ${workerId}: ${(hashRate/1000).toFixed(2)} kH/s`);
});
miner.highestPow$.subscribe(pow => console.log('Best pow', pow?.bestPow));
await miner.mine();
```

Characteristics:
- No queue or persistence; relies only on progress$ and highestPow$.
- Exercises Protocol v2 (currentNonce present) but doesn’t use it.

## Advanced GUI (resume + queue)

- Uses MiningProvider and QueueProcessor.
- Safe persistence throttled and guarded.
- Preferences drive number of workers and resume policy.

## Backward Compatibility Matrix

- Old core/worker (no currentNonce):
  - Wrapper mines; persistence skips default nonces and avoids clobbering good state.
- New core/worker (Protocol v2):
  - Full resume fidelity; immediate start-of-run nonces; stable kH/s across refreshes.

## Versioning

- Wrapper v2 introduces Protocol v2 but remains backward‑compatible.
- Core keeps the same public API; progress payloads enhanced (extra fields ignored by older wrappers).

## Acceptance

- Minimal demo runs with zero configuration beyond pubkey/content/difficulty.
- GUI uses the same wrapper and achieves stable behavior under repeated refresh/resume.
