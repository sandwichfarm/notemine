# Settings Analysis - Wired vs Unwired Settings

## Settings in Window.svelte (Settings Pane)

### 1. GENERAL Settings (Lines 849-867)
- **gaps_in** (line 853): ✅ WIRED - Used in windowManager.updateConfig() and affects window layout
- **gaps_out** (line 856): ✅ WIRED - Used in windowManager.updateConfig() and affects window layout
- **border_size** (line 859): ✅ WIRED - Used in windowManager.updateConfig() and affects window borders
- **layout** (line 862): ✅ PARTIALLY WIRED - Saved but only 'dwindle' is implemented (master layout not implemented)

### 2. DECORATION Settings (Lines 869-888)
- **rounding** (line 874): ❌ NOT WIRED - Saved but not applied to window styles
- **blur** (line 877): ❌ NOT WIRED - Saved but not applied to windows
- **drop_shadow** (line 880): ❌ NOT WIRED - Saved but not applied to windows
- **shadow_range** (line 883): ❌ NOT WIRED - Saved but not applied to windows
- **fullscreen_bg** (line 886): ✅ WIRED - Used in Window.svelte for fullscreen background

### 3. ANIMATIONS Settings (Lines 890-903)
- **enabled** (line 895): ❌ NOT WIRED - Saved but animations always run
- **window_duration** (line 898): ❌ NOT WIRED - Saved but not applied to transitions
- **fade_duration** (line 901): ❌ NOT WIRED - Saved but not applied to transitions

### 4. INPUT Settings (Lines 905-919)
- **follow_mouse** (line 910): ❌ NOT WIRED - Saved but focus doesn't follow mouse
- **mouse_refocus** (line 917): ❌ NOT WIRED - Saved but not implemented

### 5. NOTEMINE Settings (Lines 921-934)
- **minimum_diff** (line 926): ❌ NOT WIRED - Saved but not used in mining logic
- **target_diff** (line 929): ✅ WIRED - Updates globalDifficulty store
- **decay_rate** (line 932): ❌ NOT WIRED - Saved but decay engine not connected

### 6. UI Settings (Lines 936-952)
- **show_timestamps** (line 941): ❌ NOT WIRED - Saved but not passed to Feed component
- **show_pow_values** (line 944): ❌ NOT WIRED - Saved but not passed to Feed component
- **fade_old_notes** (line 947): ❌ NOT WIRED - Saved but not passed to Feed component
- **compact_mode** (line 950): ❌ NOT WIRED - Saved but not passed to Feed component

### 7. MINING Settings (Lines 954-975)
- **mining_threads** (line 959): ✅ WIRED - Used in pow-client.ts line 259 via statePersistence.getSetting()
- **auto_mine** (line 967): ❌ NOT WIRED - Saved but not used
- **batch_size** (line 970): ❌ NOT WIRED - Saved but not used
- **max_queue_size** (line 973): ❌ NOT WIRED - Saved but not used

### 8. RELAYS Settings (Lines 977-990)
- **max_relays** (line 982): ❌ NOT WIRED - Saved but not used by relay discovery
- **connection_timeout** (line 985): ❌ NOT WIRED - Saved but not used by relay pool
- **enable_discovery** (line 988): ❌ NOT WIRED - Saved but discovery always runs

### 9. MINING DIFFICULTY Settings (Lines 992-1031)
- **global baseline** (line 997): ✅ WIRED - Updates difficultySettings store
- **per-kind difficulties** (lines 1002-1029): ✅ WIRED - Updates difficultySettings store

## Summary

### Properly Wired Settings (8/38 = 21%)
1. gaps_in
2. gaps_out
3. border_size
4. fullscreen_bg
5. target_diff
6. global baseline difficulty
7. per-kind difficulties
8. mining_threads

### Partially Wired (1/38 = 3%)
1. layout (only dwindle works, master not implemented)

### Not Wired (29/38 = 76%)
- All decoration settings except fullscreen_bg
- All animation settings
- All input settings
- Most notemine settings
- All UI settings
- All mining settings
- All relay settings

## Where Settings Should Be Applied

### Window Styling (Window.svelte)
- rounding: Apply to window div style
- blur: Apply backdrop-filter
- drop_shadow: Apply to box-shadow
- shadow_range: Adjust shadow size

### Animation System
- animations.enabled: Conditionally apply transitions
- window_duration: Apply to window transition duration
- fade_duration: Apply to opacity transitions

### Feed Component
- Pass UI settings as props to Feed.svelte
- show_timestamps, show_pow_values, fade_old_notes, compact_mode

### Mining System
- Pass mining_threads to pow client initialization
- Implement queue size limits
- Implement auto-mining logic

### Relay System
- Pass max_relays to relay discovery
- Pass connection_timeout to relay pool
- Conditionally run discovery based on enable_discovery

### Input Handling
- Implement mouse focus tracking in HyprlandInterface
- Add mouse event handlers for follow_mouse behavior
