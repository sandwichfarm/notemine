# Phase 3 — Web Worker Protocol v2

Purpose: define robust, versioned messages between wrapper and workers, enabling safe resume, isolation by run, and backward compatibility.

## Message Envelopes

Every message to/from a worker includes:
- `runId: string` — current session token; messages with mismatched runId are ignored by the wrapper.
- `workerId: number` — index in 0..N-1.

## Incoming (to worker)

```ts
// Start mining
{ type: 'mine', runId, event: string /* JSON */, difficulty: number, id: number, totalWorkers: number, workerNonces?: string[] }

// Soft cancel (stop loop and exit)
{ type: 'cancel', runId }
```

## Outgoing (from worker)

```ts
// Lifecycle
{ type: 'initialized', runId, workerId, message?: string }

// Progress (Protocol v2)
{ type: 'progress', runId, workerId, hashRate?: number, currentNonce?: string, bestPowData?: { best_pow: number, nonce: string, hash: string } }

// Success
{ type: 'result', runId, workerId, data: { event: any, total_time: number, khs: number } }

// Error
{ type: 'error', runId, workerId, error: string }
```

## Startup Contract

- On receiving `mine`, the worker must:
  1) Compute `startNonce` (from `workerNonces` when present; else `id`)
  2) Immediately post a `progress` with `{ currentNonce: startNonce }`
  3) Enter mining loop; emit progress periodically (with `currentNonce` and `hashRate`) and on best‑pow improvement.

## Resume Nonce Mapping

- When `workerNonces.length === totalWorkers`: use `workerNonces[id]`.
- Else: use `min(workerNonces) + id` to redistribute evenly across workers.

## Backward Compatibility

- If a worker posts progress without `currentNonce`:
  - Wrapper records best‑pow if present; does not clobber saved nonces in persistence.
  - Wrapper exposes a compatibility flag in diagnostics.

## Error Handling

- Any thrown errors in the worker are posted as `{ type: 'error', runId, workerId, error }` and do not crash the wrapper.
- Wrapper logs and forwards error$; user code decides whether to cancel the session.

## Acceptance

- Workers always emit an initial `currentNonce` immediately after `mine`.
- All messages carry `runId`; wrapper isolation verified under rapid pause/resume/cancel.
- Older workers continue to function; wrapper avoids state clobbering without `currentNonce`.
