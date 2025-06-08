# Nostr Protocol Overview

## Core Understanding

**Nostr is a simple, open protocol for decentralized social networking.** It's built around cryptographically signed events that flow through relays.

## Fundamental Concepts

### Users vs System Event Creation

**🟢 USER-CREATED EVENTS (What users actively compose):**
- **Kind 1**: Text notes (tweets, posts, messages) - PRIMARY USER CONTENT
- **Kind 3**: Follow lists (manually curated by user)
- **Kind 7**: Reactions (likes, emoji reactions - user clicks button)
- **Kind 4/17**: Direct messages (user composes)
- **Kind 30023**: Long-form articles (user writes)

**🔴 SYSTEM/META EVENTS (Generated automatically by client):**
- **Kind 0**: User metadata/profile (client manages, updates from UI forms)
- **Kind 10002**: Relay lists (client auto-generates from user's relay settings)
- **Kind 30078**: App-specific data (client settings, preferences)
- **Authentication events** (client handles relay auth)

### Key Insight for Interface Design

**Users primarily write Kind 1 events (text notes).** Everything else should be abstracted away:
- Profile updates → Form fields that generate Kind 0 events
- Follows → UI buttons that update Kind 3 events  
- Reactions → Click buttons that create Kind 7 events
- Settings → UI that generates appropriate meta events

## Event Structure (NIP-01)

```json
{
  "id": "<sha256 hash>",
  "pubkey": "<user's public key>", 
  "created_at": <timestamp>,
  "kind": <event type number>,
  "tags": [["tag", "value"], ...],
  "content": "<the actual content>",
  "sig": "<cryptographic signature>"
}
```

## Proof of Work (NIP-13)

- **Purpose**: Spam prevention through computational cost
- **Method**: Find nonce that creates event ID with leading zeros
- **Format**: `["nonce", "<number>", "<target_difficulty>"]` in tags
- **Mining**: Increment nonce, recalculate ID, check for leading zeros
- **Key**: PoW happens BEFORE signing, can be outsourced

## Protocol Flow

1. **User creates content** (text, reactions, follows)
2. **Client processes** (adds metadata, mines PoW, signs)
3. **Client publishes** to relays
4. **Relays store/forward** events
5. **Other clients subscribe** and receive events

## Design Implications for Notemine

1. **Simple compose interface** - just text input for Kind 1 events
2. **Hidden complexity** - PoW mining, signing, relay management happens behind scenes
3. **Smart difficulty** - calculate based on content analysis (mentions, replies)
4. **Meta events** - generate automatically from user actions (profile edits, settings)
5. **No manual kind selection** - infer from context/interface section

The interface should feel like writing tweets/posts, not like managing a complex protocol.