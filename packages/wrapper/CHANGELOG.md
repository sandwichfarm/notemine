# @notemine/wrapper

## Unreleased

### Minor Changes

- **Pause & Resume**: Added ability to pause mining operations and resume from exact same state
  - New `pause()` method stops workers while preserving state
  - New `resume(workerNonces?)` method resumes mining from paused state
  - New `getState()` method returns serializable mining state
  - New `restoreState(state)` method loads previously saved state
  - Added `paused$` observable to track pause state
  - Added `MiningState` interface for state serialization

- **State Persistence**: Mining state can now be saved and restored across page refreshes
  - State includes worker nonces, best POW, event data, and difficulty
  - Storage mechanism is implementation-agnostic (localStorage, IndexedDB, etc.)

- **Dynamic Worker Scaling**: Resume mining with different number of workers
  - Automatic nonce redistribution when worker count changes
  - Finds minimum nonce and redistributes across new worker pool

### Patch Changes

- Core WASM now reports current nonce in progress updates
- Worker hash rate tracking resets on resume (not accumulated)
- Best POW preserved across pause/resume cycles
- Updated dependencies
  - @notemine/core@0.4.6

## 0.1.3

### Patch Changes

- Updated dependencies
  - @notemine/core@0.4.3

## 0.1.2

### Patch Changes

- Fix links in READMEs
- Updated dependencies
  - @notemine/core@0.4.2

## 0.1.1

### Patch Changes

- Updated docs
- Updated dependencies
  - @notemine/core@0.4.1

## 0.1.0

### Minor Changes

- Removed @notemine/rust, moved Rust source to @notemine/core, optimized package.json, added deps install script in prepare with confirm and overrides

### Patch Changes

- Updated dependencies
  - @notemine/core@0.4.0
