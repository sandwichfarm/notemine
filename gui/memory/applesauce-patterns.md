# Applesauce Usage Patterns

## Core Concepts

**Applesauce is utilities for Nostr apps - "batteries not included"**
- Uses RxJS observables for reactive programming
- Modular design - use what you need
- No networking - pair with relay libraries (nostr-tools, ndk, etc.)
- Powers NoStrudel client

## Key Packages

### 1. applesauce-core
- EventStore for managing events
- Query system for filtering events
- Reactive subscriptions

### 2. applesauce-factory
- Event creation blueprints
- Common social media event templates
- Factory pattern for generating events

### 3. applesauce-react
- React hooks and providers
- Account management
- UI integration patterns

## Usage Patterns

### EventStore + Reactive Queries
```typescript
import { EventStore } from 'applesauce-core';

const eventStore = new EventStore();

// Add events
eventStore.addEvent(event);

// Query with filters
const notes = eventStore.getEvents({
  kinds: [1],
  authors: [pubkey]
});

// Reactive subscriptions
eventStore.events$.subscribe(events => {
  // Handle event updates
});
```

### Event Creation with Factory
```typescript
import { EventFactory } from 'applesauce-factory';
import { NoteBlueprint } from 'applesauce-factory/blueprints';

const factory = new EventFactory();

const unsignedEvent = await factory.create(
  NoteBlueprint,
  "hello nostr:npub... #introductions"
);
```

## Integration Strategy for Notemine

1. **Use applesauce-core for event management**
   - EventStore for local event cache
   - Reactive queries for feed updates
   - Subscription management

2. **Use applesauce-factory for event creation**
   - NoteBlueprint for kind 1 events
   - Automated event template generation
   - Consistent event structure

3. **Pair with nostr-tools for relay communication**
   - Applesauce handles events, nostr-tools handles networking
   - Relay pool management
   - WebSocket connections

4. **Reactive UI with Svelte stores**
   - Convert RxJS observables to Svelte stores
   - Real-time feed updates
   - Progressive disclosure based on data availability