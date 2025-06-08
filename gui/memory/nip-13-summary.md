# NIP-13: Proof of Work

**Status**: Active specification for spam deterrence

## Purpose

NIP-13 defines Proof of Work (PoW) as a mechanism to add computational cost to creating Nostr events, primarily for spam deterrence. This creates a universal, bearer proof that all relays and clients can validate with minimal code.

## Technical Implementation

### Difficulty Definition
- **Difficulty = number of leading zero bits in the event ID**
- Example: `000000000e9d97a1ab09fc381030b346cdd7a142ad57e6df0b46dc9bef6c7e2d` has difficulty of 36
- Higher difficulty = more leading zeros = more computational work required

### Nonce Tag Format
```json
["nonce", "<incrementing_value>", "<target_difficulty>"]
```

**Example:**
```json
{
  "content": "It's just me mining my own business",
  "tags": [["nonce", "776797", "20"]]
}
```

### Mining Process
1. Set target difficulty in nonce tag
2. Increment nonce value (second entry)
3. Recalculate event ID using NIP-01 serialization
4. Count leading zero bits in ID
5. Repeat until difficulty target is met
6. **Recommended**: Update `created_at` timestamp during mining

### Validation
- Count leading zero bits in event ID
- Compare against claimed difficulty in nonce tag
- Reference implementations provided in C and JavaScript

## Key Insights for Implementation

### PoW Can Be Outsourced
- **Critical**: Event ID doesn't commit to signature
- PoW mining can happen before signing
- Enables PoW service providers
- Mobile/low-power devices can outsource mining

### Integration Challenges
- Traditional flow: create → sign → publish
- PoW flow: create → mine → sign → publish
- Some signers need repeated approval for mining iterations

### Universal Validation
- Any relay/client can verify PoW with simple bit counting
- No special crypto libraries needed beyond SHA256
- Creates network-wide spam resistance

## What This Means for Notemine

1. **Users write content** (kind 1 events)
2. **System mines the event** before signing
3. **Higher difficulty = better spam protection**
4. **Mining happens client-side** but can be delegated
5. **All events should include nonce tags** for PoW validation

This confirms the approach: users only create content, everything else (including PoW mining) is handled by the client.