import { nip19 } from 'nostr-tools';

const HEX_REGEX = /^[0-9a-f]{64}$/i;

export interface ParsedNpub {
  npub: string;
  hex: string;
  relays?: string[];
  source: 'hex' | 'npub' | 'nprofile';
}

const dedupeRelays = (relays: (string | undefined)[] = []) =>
  Array.from(new Set(relays.filter(Boolean))) as string[];

/**
 * Normalize free-form npub/hex/nprofile input into a parsed structure.
 * Returns null when the value cannot be decoded.
 */
export function parseNpub(input: string | undefined | null): ParsedNpub | null {
  if (!input) return null;
  const normalized = input.trim();
  if (!normalized) return null;

  if (HEX_REGEX.test(normalized)) {
    const hex = normalized.toLowerCase();
    return { npub: nip19.npubEncode(hex), hex, source: 'hex' };
  }

  try {
    const decoded = nip19.decode(normalized);
    if (decoded.type === 'npub' && typeof decoded.data === 'string') {
      const hex = decoded.data;
      if (HEX_REGEX.test(hex)) {
        return { npub: nip19.npubEncode(hex), hex, source: 'npub' };
      }
    }
    if (decoded.type === 'nprofile' && typeof decoded.data === 'object' && decoded.data !== null) {
      const data = decoded.data as { pubkey?: string; relays?: string[] };
      if (data.pubkey && HEX_REGEX.test(data.pubkey)) {
        return {
          npub: nip19.npubEncode(data.pubkey),
          hex: data.pubkey,
          relays: dedupeRelays(data.relays),
          source: 'nprofile',
        };
      }
    }
  } catch {
    // Swallow decoding errors; caller handles null result.
  }

  return null;
}

export function formatShortNpub(npub: string): string {
  if (npub.length <= 16) return npub;
  return `${npub.slice(0, 8)}…${npub.slice(-6)}`;
}
