# Mining Settings Wiring Analysis

## Current State

### 1. Settings Found in Window.svelte (Lines 221-226)

```typescript
// Mining settings  
let miningThreads = statePersistence.getSetting('miningThreads', Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2)));
let autoMine = true;
let batchSize = 10;
let maxQueueSize = 100;
```

### 2. Settings UI in Window.svelte (Lines 1119-1140)

The settings pane has inputs for:
- `miningThreads` - Number of worker threads (with hardware limits)
- `autoMine` - Auto-mining toggle (checkbox)
- `batchSize` - Batch size for mining
- `maxQueueSize` - Maximum queue size

### 3. Settings Persistence (Line 289)

Only `miningThreads` is being persisted:
```typescript
$: statePersistence.updateSetting('miningThreads', miningThreads);
```

### 4. Usage in pow-client.ts (Lines 274-279)

The `miningThreads` setting IS properly wired up:
```typescript
// Get user-configured number of mining threads (defaults to half of available cores)
const defaultThreads = Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 2));
const configuredThreads = statePersistence.getSetting('miningThreads', defaultThreads);
const numberOfWorkers = Math.min(configuredThreads, navigator.hardwareConcurrency || 4);
```

## Issues Found

### 1. Missing Persistence for Other Settings
- `autoMine`, `batchSize`, and `maxQueueSize` are NOT persisted
- They reset to defaults on page reload

### 2. Unused Settings
- `autoMine`, `batchSize`, and `maxQueueSize` are defined but never used
- No code references these settings in the mining services

### 3. Worker Count Setting
- The `miningThreads` setting IS properly wired up and working
- It correctly loads from persistence and applies to Notemine

## Recommendations

1. **Add persistence for other mining settings** if they will be used:
   ```typescript
   $: statePersistence.updateSetting('autoMine', autoMine);
   $: statePersistence.updateSetting('batchSize', batchSize);
   $: statePersistence.updateSetting('maxQueueSize', maxQueueSize);
   ```

2. **Implement usage of autoMine, batchSize, maxQueueSize** or remove them from UI

3. **The worker count (miningThreads) is already properly wired** - no changes needed

## Summary

The `miningThreads` setting for controlling worker count is properly implemented and persisted. The other mining settings exist in the UI but are not functional. The main issue is that these other settings need to either be fully implemented or removed from the interface.