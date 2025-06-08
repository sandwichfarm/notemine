# Notemine Interface Design (Based on Nostr Understanding)

## Core Principle
**Users write text. Everything else is handled automatically.**

## Simplified Interface Design

### Primary Interface: Note Composer
```
┌─────────────────────────────────────┐
│ What's happening?                   │
│                                     │
│ [Text area for Kind 1 content]     │
│                                     │
│ Auto-detected: Reply/Mention/Normal │
│ PoW Difficulty: 21 ⚙️              │
│                                     │
│           [Mine & Publish]          │
└─────────────────────────────────────┘
```

### Auto-Generated Events by Context

**Kind 1 (Text Notes)**
- User types → Client mines PoW → Signs → Publishes
- **Difficulty calculated by content analysis:**
  - Normal note: Base difficulty
  - Contains @npub or nostr:npub → Mention (lower difficulty)
  - Contains #[0] or nostr:note → Reply (lower difficulty)

**Kind 0 (Profile) - Hidden from main interface**
- Profile edit form → Generates Kind 0 event
- User never sees "Kind 0" terminology

**Kind 3 (Follows) - Hidden from main interface**  
- Follow/Unfollow buttons → Updates Kind 3 event
- User never sees "Kind 3" terminology

**Kind 7 (Reactions) - Hidden from main interface**
- ❤️ Like button → Creates Kind 7 event with "+"
- User never sees "Kind 7" terminology

## PoW Difficulty Strategy

### Smart Content Analysis
```typescript
function calculateDifficulty(content: string, globalDifficulty: number): number {
  // Detect content type automatically
  if (content.includes('@npub') || content.includes('nostr:npub')) {
    return globalDifficulty - 16; // Mentions get easier difficulty
  }
  if (content.includes('#[') || content.includes('nostr:note')) {
    return globalDifficulty - 11; // Replies get easier difficulty  
  }
  return globalDifficulty; // Normal posts get full difficulty
}
```

### Settings Panel (Advanced Users)
- Global difficulty slider
- Show current difficulty for each content type
- No manual kind selection - that's not how users think

## Interface Sections

### 1. Compose (Primary)
- Simple text area
- Auto-calculated difficulty display
- Mining progress when publishing

### 2. Feed (Secondary)  
- Display received Kind 1 events
- Decay-based ranking
- Like/Reply buttons (generate appropriate events)

### 3. Profile (Hidden)
- Form fields that update Kind 0 events
- User doesn't know about Kind 0

### 4. Settings (Hidden)
- PoW difficulty configuration
- Relay management (generates Kind 10002 events)
- User doesn't see kind numbers

## Key Changes from Current Implementation

1. **Remove kind selector dropdown** - infer from content/context
2. **Simplify to text input** - primary interface is just writing
3. **Auto-difficulty calculation** - based on content analysis
4. **Hide protocol complexity** - users don't need to know about kinds
5. **Context-aware mining** - different difficulties for different content types

This matches how Twitter/social media works: users write text, everything else is handled by the platform.