# NIP-01: Basic Protocol Flow

**Status**: Draft Mandatory - Core foundation specification

## Key Understanding

**NIP-01 is the foundational specification that defines the core Nostr protocol.** It establishes the basic rules for events, communication, and relay interactions that all other NIPs extend.

## Event Structure

Every Nostr event has this exact structure:
```json
{
  "id": "<32-byte hex-encoded sha256 of the serialized event data>",
  "pubkey": "<32-byte hex-encoded public key of the event creator>", 
  "created_at": <unix timestamp>,
  "kind": <integer>,
  "tags": [["tag1", "value1"], ["tag2", "value2"]],
  "content": "<arbitrary string>",
  "sig": "<64-byte hex signature of the event data>"
}
```

## Event Kinds Defined

- **Kind 0**: User metadata (profile information)
- **Ranges**:
  - `1000-10000`: Regular events (stored by relays)
  - `10000-20000`: Replaceable events (only latest version stored)
  - `20000-30000`: Ephemeral events (not stored by relays)
  - `30000-40000`: Addressable events (parameterized replaceable)

## Communication Protocol

**Client → Relay Messages:**
- `["EVENT", <event JSON>]` - Publish an event
- `["REQ", <subscription_id>, <filters...>]` - Request/subscribe to events  
- `["CLOSE", <subscription_id>]` - End a subscription

**Relay → Client Messages:**
- `["EVENT", <subscription_id>, <event JSON>]` - Send matching event
- `["OK", <event_id>, <true|false>, <message>]` - Confirm event acceptance
- `["EOSE", <subscription_id>]` - End of stored events
- `["CLOSED", <subscription_id>, <message>]` - Subscription ended
- `["NOTICE", <message>]` - Error/notification message

## Cryptography

- **Curve**: secp256k1 (same as Bitcoin)
- **Signatures**: Schnorr signatures
- **Event ID**: SHA256 hash of serialized event data
- **Serialization**: Strict JSON rules (no whitespace, specific ordering)

## What This Means for Implementation

1. **Users primarily create Kind 1 events** (text notes) - everything else is metadata/system events
2. **Event signing happens client-side** - relays just store and forward
3. **Relays are "dumb"** - they don't generate content, just facilitate communication
4. **Protocol is extensible** - other NIPs define additional event kinds and behaviors

## Critical for PoW Implementation

- Event IDs are deterministic (SHA256 of serialized data)
- PoW involves finding a nonce that creates an ID with leading zeros
- The `tags` array is where nonce information gets stored