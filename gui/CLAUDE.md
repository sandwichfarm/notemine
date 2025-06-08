# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

mood: focused

---

## Common Development Commands

```bash
# Install dependencies
pnpm install

# Run development server
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview

# Run tests
pnpm test

# Run linting
pnpm run lint

# Format code
pnpm run format
```

## Project Overview

This is a **Nostr client** built with **SvelteKit (Svelte 5) + Tailwind CSS** that enforces **NIP-13 Proof-of-Work mining** for all notes. Key architectural decisions:

- **Client-side only** - No backend server required
- **Applesauce** for Nostr protocol integration (applesauce-core, applesauce-relay, applesauce-signers)
- **@notemine/wrapper** for PoW mining
- **Dexie.js** for IndexedDB persistence
- **NIP-66** for discovering PoW-compatible relays

## Key Architecture Components

### 1. Relay Discovery System
- Queries `kind: 30166` events with `#R pow` tag to find PoW-compatible relays
- Maintains relay connection health and metadata

### 2. Mining Queue System
- All notes must be mined before publishing
- Mining continues in background if user navigates away
- Progress persisted to IndexedDB for resumption

### 3. Decay-Based Feed Ranking
- Notes decay based on age (configurable decay rate)
- Cumulative PoW from replies/mentions adds weight
- Zaps contribute to ranking but not decay prevention

### 4. Event Subscription Architecture
- Subscribes to: kind 1 (notes), kind 1111 (comments), mentions, zaps
- Real-time updates via Applesauce subscriptions
- Efficient batching and deduplication

## Development Guidelines

### State Management
- Use Svelte 5 runes (`$state`, `$derived`, `$effect`)
- Store relay connections in a central store
- Mining queue should be reactive and persistent

### UI/UX Principles
- Interface reveals itself as data arrives (progressive disclosure)
- Note opacity fades with age/decay
- Mining progress visible in UI
- Single-page app with dynamic sections

### Data Persistence Strategy
- **IndexedDB (via Dexie)**: Mining queue, nonce progress, relay metadata
- **LocalStorage**: User preferences (decay rate, PoW thresholds)
- **SessionStorage**: Temporary UI state

### Testing Approach
- Unit tests for mining logic and decay calculations
- Integration tests for relay discovery
- E2E tests for critical user flows

## NIP-13 Implementation Details

All events must include a `nonce` tag with format: `["nonce", "<nonce_value>", "<difficulty>"]`

Example mined event:
```json
{
  "kind": 1,
  "tags": [["nonce", "123456", "21"]],
  "content": "Hello Nostr!",
  "created_at": 1700000000,
  "pubkey": "...",
  "id": "000000..."
}
```

## Relay Communication Patterns

Use Applesauce's subscription model:
```javascript
// Subscribe to PoW notes
const sub = applesauce.subscribe({
  kinds: [1, 1111],
  '#nonce': ['*'] // Only events with nonce tags
});
```

---

# **Final High-Level Design Document (HLDD)**

*Nostr Client with NIP-13 Mining, Decay-Based Feed, Applesauce Integration, and Tailwind UI*

## **1. Software Architecture**

### **Overview**

This is a fully client-side **SvelteKit (Svelte 5) + Tailwind CSS** application that enforces **NIP-13 mining** for all visible and produced notes. It integrates with Nostr using **Applesauce**, a modern client library. The app discovers PoW-compatible relays using **NIP-66 (30166 events)** filtered by `#R pow`, and only displays **kind 1 events** and their **children** (threads, mentions, zaps).

A **Strfry-based custom relay** enforces **minimum PoW values per kind**, ensuring quality and consistency.

---

## **2. Component Breakdown**

### **Relay Discovery (NIP-66)**

* Filters `30166` events by `#R pow` to discover PoW relays.
* Fetches metadata and liveness using Applesauce.

### **Nostr Integration with Applesauce**

* Uses **Applesauce** ecosystem for all relay communication and signing operations.
* Handles subscriptions to kind 1, 1111, and reaction events (including zaps).

### **Mining Engine**

* Uses `@notemine/wrapper` to mine events with NIP-13 `nonce` tags.
* Mining resumes on revisit using persisted nonce data in IndexedDB.

### **Decay Engine**

* Weights each note using:

  * Age-based decay.
  * Cumulative PoW (replies, mentions).
  * Zaps (for ranking, not decay).
* Allows per-user decay rate tuning via UI.

### **Strfry-Based Relay**

* Enforces PoW thresholds at the relay level.
* Configurable per-kind PoW minimums.
* Public policy, discoverable via NIP-66.

### **Reactive UI (SvelteKit + Tailwind)**

* Single-page app layout.
* Dynamic interface that reveals itself as data arrives.
* Note visibility fades with age (opacity-based).
* Mining queue visualized in UI.
* Global and per-kind PoW controls.

---

## **3. Infrastructure**

| Area      | Details                                            |
| --------- | -------------------------------------------------- |
| Hosting   | Static frontend deployed to Bunny.net              |
| Relays    | Discovered via NIP-66 + Strfry-based relay         |
| PoW Relay | Enforces minimum PoW policy                        |
| Mining    | Client-only, via `@notemine/wrapper`               |
| Storage   | IndexedDB (Dexie.js), LocalStorage, SessionStorage |

---

## **4. CI/CD**

| Step         | Tooling        |
| ------------ | -------------- |
| Build & Lint | Vite + Vitest  |
| Deploy       | GitHub Actions |
| Hosting CDN  | Bunny.net      |

---

## **5. Data Flow**

1. **Relay Discovery**:

   * Query `30166` events.
   * Filter by `#R pow` to find PoW-capable relays.

2. **View Feed**:

   * Connect to discovered relays using Applesauce.
   * Subscribe to kind 1, kind 1111, mentions, zaps.

3. **Create Note**:

   * User inputs note → Added to mining queue.
   * Once mined → Published via Applesauce.

4. **Apply Ranking**:

   * Order by age, cumulative PoW (including zaps).
   * Filter out expired/decayed notes.

5. **Persist & Resume**:

   * Nonce progress and queues stored in IndexedDB.
   * Mining resumes if the user reloads.

---

## **6. Data Schemas**

### **30166 Relay Event**

```json
{
  "kind": 30166,
  "tags": [
    ["d", "wss://relay.example.com"],
    ["R", "pow"]
  ],
  "content": "{}"
}
```

### **NIP-13 Mined Note**

```json
{
  "kind": 1,
  "tags": [
    ["nonce", "123456", "21"]
  ],
  "content": "PoW content here",
  "created_at": 1700000000,
  "pubkey": "<hexkey>",
  "sig": "<signature>",
  "id": "<eventid>"
}
```

---

## **7. Technologies**

| Layer         | Library/Framework                       |
| ------------- | --------------------------------------- |
| Frontend      | SvelteKit (Svelte 5)                    |
| Styling       | Tailwind CSS                            |
| Nostr Client  | **Applesauce**                          |
| Mining        | `@notemine/wrapper`                     |
| Relay Backend | Custom Strfry-based relay               |
| Storage       | Dexie (IndexedDB), Local/SessionStorage |
| CI/CD         | GitHub Actions, Bunny.net               |

---

Let me know if you'd like the HLDD exported in another format (e.g., markdown, PDF, Notion spec).

## Additional Notes

- Always show me the command to start the dev server and the link when completing a task. Do not manage the dev services yourself to help avoid confusion.

---

## Hyprland-Inspired Interface TODOs

Based on analysis of Hyprland's window management architecture, these todos will help recreate an authentic Hyprland experience in our web-based GUI.

### 🎯 Priority 1: Core Window Management

#### 1.1 Binary Tree Tiling Algorithm
- [ ] Implement binary space partitioning (BSP) tree data structure for window management
- [ ] Add automatic split orientation based on aspect ratio (horizontal if wider, vertical if taller)
- [ ] Support dynamic window insertion at focused node
- [ ] Implement tree rebalancing on window removal
- [ ] Add `preserve_split` option to lock split orientations

#### 1.2 Master-Stack Layout
- [ ] Create master-stack layout algorithm as alternative to BSP
- [ ] Support configurable master window count (default 1)
- [ ] Implement master area ratio adjustment (default 60/40 split)
- [ ] Add stack area tiling modes (vertical list, grid)
- [ ] Support promotion/demotion of windows between master and stack

#### 1.3 Focus Management
- [ ] Implement directional focus navigation (focus left/right/up/down)
- [ ] Add MRU (Most Recently Used) focus stack per workspace
- [ ] Support focus-follows-mouse with configurable levels (0, 1, 2)
- [ ] Implement focus stealing prevention (`focus_on_activate` setting)
- [ ] Add focus indication with animated border color changes

### 🎯 Priority 2: Animation Engine

#### 2.1 Bezier-Based Animation System
- [ ] Create animation manager with frame-based interpolation
- [ ] Implement Bezier curve easing functions (linear, ease-in, ease-out, custom)
- [ ] Support per-animation-type configuration (windows, borders, fade, workspace)
- [ ] Add animation speed/duration multipliers
- [ ] Implement animation cancellation and retargeting

#### 2.2 Window Animations
- [ ] Add window open animations (fade-in, pop-in with scale)
- [ ] Implement window close animations (fade-out, scale-down)
- [ ] Create smooth position transitions for layout changes
- [ ] Add window resize animations with easing
- [ ] Support configurable animation styles per window type

#### 2.3 Workspace Transitions
- [ ] Implement workspace switching animations (slide, fade)
- [ ] Add smooth transitions for workspace creation/destruction
- [ ] Support directional workspace navigation animations
- [ ] Create workspace swipe gestures for touchpad support

### 🎯 Priority 3: Visual Effects

#### 3.1 Window Decorations
- [ ] Implement rounded corners with configurable radius
- [ ] Add gradient borders with focus-based color transitions
- [ ] Create drop shadow system for depth perception
- [ ] Support per-window decoration rules
- [ ] Add blur effect for transparent windows (dual-Kawase blur)

#### 3.2 Opacity and Transparency
- [ ] Implement window opacity controls
- [ ] Add focus-based opacity changes
- [ ] Create idle window dimming
- [ ] Support per-window opacity rules
- [ ] Add background blur for readability

### 🎯 Priority 4: Advanced Window Management

#### 4.1 Window Groups (Tabbed Containers)
- [ ] Implement window grouping system
- [ ] Add tab cycling within groups
- [ ] Support drag-to-group functionality
- [ ] Create visual indicators for grouped windows
- [ ] Add group manipulation commands (merge, split)

#### 4.2 Floating Windows
- [ ] Implement floating window layer above tiled windows
- [ ] Add mouse-based move and resize with modifier keys
- [ ] Support window snapping and edge resistance
- [ ] Create float toggle with position memory
- [ ] Add centering and positioning rules

#### 4.3 Pseudotiling
- [ ] Implement pseudotiled mode (maintains size within tile space)
- [ ] Add automatic pseudotiling for windows with size hints
- [ ] Support centered positioning within tile
- [ ] Create visual indicators for pseudotiled windows

### 🎯 Priority 5: Input and Interaction

#### 5.1 Mouse Interactions
- [ ] Implement modifier+drag for window movement in tiled mode
- [ ] Add modifier+right-drag for resize operations
- [ ] Support live layout preview during drag
- [ ] Create edge snapping for floating windows
- [ ] Add double-click to maximize/restore

#### 5.2 Keyboard Shortcuts
- [ ] Expand keybinding system to match Hyprland's flexibility
- [ ] Add workspace navigation (Super+1-9, Super+scroll)
- [ ] Implement window movement commands (movewindow left/right/up/down)
- [ ] Support layout switching keybinds
- [ ] Add resize mode with keyboard controls

#### 5.3 Gesture Support
- [ ] Implement three-finger swipe for workspace switching
- [ ] Add pinch gestures for overview mode
- [ ] Support gesture momentum and inertia
- [ ] Create gesture configuration system

### 🎯 Priority 6: Performance Optimizations

#### 6.1 Damage Tracking
- [ ] Implement region-based damage tracking
- [ ] Add per-pane damage accumulation
- [ ] Support partial redraws for efficiency
- [ ] Create damage visualization debug mode

#### 6.2 Frame Scheduling
- [ ] Implement requestAnimationFrame-based render loop
- [ ] Add frame coalescing for multiple updates
- [ ] Support variable refresh rate handling
- [ ] Create frame timing diagnostics

### 🎯 Priority 7: Configuration System

#### 7.1 Live Configuration
- [ ] Create configuration parser for Hyprland-style syntax
- [ ] Implement live config reload without restart
- [ ] Support hierarchical configuration sections
- [ ] Add config validation and error reporting

#### 7.2 Window Rules
- [ ] Implement window rule matching system (by class, title, etc.)
- [ ] Support rule actions (float, workspace, size, position)
- [ ] Add regex-based matching
- [ ] Create rule priority system

### 🎯 Priority 8: IPC and Scripting

#### 8.1 Command System
- [ ] Create hyprctl-like command interface
- [ ] Implement dispatcher system for commands
- [ ] Support batch command execution
- [ ] Add command history and replay

#### 8.2 Event System
- [ ] Implement event emission for state changes
- [ ] Create event subscription mechanism
- [ ] Support event filtering and batching
- [ ] Add event replay for debugging

### 🎯 Priority 9: Multi-Monitor Support

#### 9.1 Monitor Management
- [ ] Implement per-monitor workspace sets
- [ ] Add monitor-aware window placement
- [ ] Support different layouts per monitor
- [ ] Create monitor hotplug handling

#### 9.2 Cross-Monitor Operations
- [ ] Implement window movement between monitors
- [ ] Add workspace movement between monitors
- [ ] Support monitor-specific scaling
- [ ] Create monitor arrangement configuration

### 🎯 Priority 10: Special Features

#### 10.1 Special Workspaces
- [ ] Implement scratchpad functionality
- [ ] Add named special workspaces
- [ ] Support workspace pinning
- [ ] Create workspace-specific rules

#### 10.2 Advanced Effects
- [ ] Implement window wobble effects
- [ ] Add parallax backgrounds
- [ ] Support custom shaders for effects
- [ ] Create effect composition pipeline

### Implementation Notes

1. **Architecture**: Use a modular approach where each system (tiling, animation, etc.) is independent but interconnected through events.

2. **Performance**: Prioritize CSS transforms and will-change for smooth animations. Use ResizeObserver and IntersectionObserver for efficient updates.

3. **Compatibility**: Ensure graceful degradation for browsers without certain features (e.g., backdrop-filter for blur).

4. **Testing**: Create visual regression tests for layout algorithms and animation timing.

5. **Documentation**: Document each Hyprland feature implementation with examples and configuration options.

## Additional Notes

- Always show me the command to start the dev server and the link when completing a task. Do not manage the dev services yourself to help avoid confusion.
```