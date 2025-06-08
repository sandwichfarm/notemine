# Development Setup Notes

## Local Relay for Development

**Use `nak relay` for local development:**

```bash
# Start ephemeral relay in background
nohup nak relay &

# Or use screen/tmux
screen -S relay
nak relay
# Ctrl+A, D to detach
```

**Benefits:**
- Ephemeral relay (perfect for testing)
- No configuration needed
- Works great in development environment
- Local WebSocket endpoint for testing

**Default endpoint:** `ws://localhost:4736` (check nak docs for actual port)

## Development Flow

1. Start local relay: `nak relay`
2. Start GUI dev server: `pnpm run dev`
3. Test PoW mining locally without external relay dependencies
4. Relay will store events temporarily for testing feed/subscriptions

## Integration with Notemine

```typescript
// Development relay configuration
const DEV_RELAYS = ['ws://localhost:4736'];
const PROD_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol'];

const relays = process.env.NODE_ENV === 'development' 
  ? DEV_RELAYS 
  : PROD_RELAYS;
```

This provides a fast, local testing environment for the "everything is PoW" client development.