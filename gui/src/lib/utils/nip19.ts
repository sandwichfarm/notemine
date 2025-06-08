import { bech32 } from 'bech32';
import type { NostrEvent } from '$lib/types/nostr';

// Encode data to bech32
function encodeBech32(prefix: string, data: number[]): string {
  const words = bech32.toWords(new Uint8Array(data));
  return bech32.encode(prefix, words, 1000);
}

// Encode a note event to NIP-19 nevent format
export function encodeNevent(event: NostrEvent, relays: string[] = []): string {
  const data: number[] = [];
  
  // Add event ID (32 bytes)
  const idBytes = hexToBytes(event.id);
  data.push(0x00); // TLV type for event ID
  data.push(32); // Length
  data.push(...Array.from(idBytes));
  
  // Add relays if provided
  for (const relay of relays) {
    const relayBytes = new TextEncoder().encode(relay);
    data.push(0x01); // TLV type for relay
    data.push(relayBytes.length); // Length
    data.push(...Array.from(relayBytes));
  }
  
  // Add author pubkey (32 bytes)
  const pubkeyBytes = hexToBytes(event.pubkey);
  data.push(0x02); // TLV type for author
  data.push(32); // Length
  data.push(...Array.from(pubkeyBytes));
  
  // Add kind (4 bytes, big endian)
  data.push(0x03); // TLV type for kind
  data.push(4); // Length
  const kindBytes = new ArrayBuffer(4);
  new DataView(kindBytes).setUint32(0, event.kind, false);
  data.push(...Array.from(new Uint8Array(kindBytes)));
  
  return encodeBech32('nevent', data);
}

// Convert hex string to bytes
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Generate njump.me link for an event
export function generateNjumpLink(event: NostrEvent, relays: string[] = []): string {
  const nevent = encodeNevent(event, relays);
  return `https://njump.me/${nevent}`;
}