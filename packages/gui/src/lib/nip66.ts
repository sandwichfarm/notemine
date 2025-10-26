import { SimplePool } from 'nostr-tools/pool';

const NIP66_RELAYS = ['wss://relay.nostr.watch'];

export interface Nip66Relay {
  url: string;
  powLevel?: number;
}

export async function fetchNip66PowRelays(): Promise<string[]> {
  return new Promise((resolve) => {
    const pool = new SimplePool();
    const relays = new Set<string>();
    const since = Math.floor(Date.now() / 1000) - 24 * 60 * 60; // Last 24 hours

    pool.subscribeMany(
      NIP66_RELAYS,
      [
        {
          since,
          kinds: [30166],
          '#R': ['pow'],
        },
      ],
      {
        onevent(event) {
          try {
            // Find POW tag
            const powTag = event.tags.find((t) => t[0] === 'R' && t[1].includes('pow'));
            if (!powTag) return;

            // Check if it's actually a POW relay (R tag = "pow" with no threshold or threshold > 0)
            const isPow =
              (powTag[1] === 'pow' && !powTag?.[2]) ||
              (powTag[1] === 'pow' && Number(powTag?.[2]) > 0);
            if (!isPow) return;

            // Extract relay URL from 'd' tag
            const dTag = event.tags.find((t) => t[0] === 'd');
            if (!dTag?.[1]) return;

            const relayUrl = new URL(dTag[1]).toString();
            if (!relays.has(relayUrl)) {
              relays.add(relayUrl);
              console.log('[NIP-66] Found POW relay:', relayUrl);
            }
          } catch (e) {
            // Silently ignore malformed events
          }
        },
        oneose() {
          const relayArray = Array.from(relays);
          console.log(`[NIP-66] Discovered ${relayArray.length} POW relays`);
          resolve(relayArray);
        },
      }
    );
  });
}
