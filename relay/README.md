# notemine relay

A proof-of-work first nostr relay with intelligent POW-based retention.

## Features

- **POW Required**: All kind 1 (notes) events must have minimum POW difficulty of 16
- **LMDB Backend**: Fast, embedded database using fiatjaf/eventstore
- **Intelligent Retention**: POW-based scoring with exponential time decay
  - `score = rootPOW + reactionsPOW + (repliesCount * 0.5)`
  - `decayedScore = score * exp(-λ * age_in_days)`
- **Cascade Deletion**: When notes are pruned, all children (reactions, replies) are deleted
- **Event Limits**: Maximum 1000 kind 1 events, unlimited reactions (space permitting)
- **NIP Support**: NIP-01, NIP-09, NIP-11, NIP-13 (POW), NIP-16, NIP-20, NIP-33

## Building

```bash
# Install dependencies
go mod download

# Build
go build -o notemine-relay ./cmd/relay

# Run
./notemine-relay
```

## Configuration

Environment variables:

- `PORT` - Server port (default: 3334)
- `DB_PATH` - LMDB database path (default: ./data/relay.lmdb)

## Retention Algorithm

The relay uses a sophisticated retention algorithm that:

1. **Scores each note** based on:
   - Root note POW difficulty
   - Combined POW of all reactions (weighted by type: +1, -1, or +0.5)
   - Reply count (0.5 points each)

2. **Applies time decay**:
   - Exponential decay with λ = 0.1 per day
   - Older content gradually loses score
   - Fresh content with high POW stays longer

3. **Prunes periodically** (every hour):
   - When kind 1 events exceed 1000
   - Deletes lowest-scoring events
   - Cascade deletes all children

## Development

```bash
# Run with custom config
PORT=8080 DB_PATH=/tmp/relay.lmdb go run ./cmd/relay

# Test POW validation
curl -X POST http://localhost:3334 -d '{"event": {...}}'
```

## Architecture

```
relay/
├── cmd/relay/         # Main entry point
├── internal/
│   ├── pow/          # POW difficulty calculation (NIP-13)
│   └── retention/    # Retention algorithm with scoring & pruning
└── data/             # LMDB database (created on first run)
```

## License

MIT
