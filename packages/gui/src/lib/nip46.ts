import { nip04, nip19 } from 'nostr-tools';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { relayPool } from './applesauce';
import type { NostrEvent } from 'nostr-tools/core';

/**
 * NIP-46 Nostr Connect client implementation
 */
export class Nip46Client {
  private clientSecret: Uint8Array;
  private clientPubkey: string;
  private remotePubkey: string;
  private relays: string[];
  private pendingRequests: Map<string, (result: any) => void>;

  constructor(bunkerUri: string) {
    // Parse bunker URI: bunker://<pubkey>?relay=<relay>&relay=<relay>...
    const url = new URL(bunkerUri);
    this.remotePubkey = url.hostname || url.pathname.replace('//', '');
    this.relays = url.searchParams.getAll('relay');

    if (!this.relays.length) {
      throw new Error('No relays specified in bunker URI');
    }

    // Generate client keys
    this.clientSecret = generateSecretKey();
    this.clientPubkey = getPublicKey(this.clientSecret);
    this.pendingRequests = new Map();
  }

  /**
   * Connect to the remote signer
   */
  async connect(): Promise<string> {
    // Subscribe to responses
    this.listenForResponses();

    // Send connect request
    const result = await this.sendRequest('connect', [this.clientPubkey]);
    return result;
  }

  /**
   * Get public key from remote signer
   */
  async getPublicKey(): Promise<string> {
    const result = await this.sendRequest('get_public_key', []);
    return result;
  }

  /**
   * Sign event with remote signer
   */
  async signEvent(event: Partial<NostrEvent>): Promise<NostrEvent> {
    const result = await this.sendRequest('sign_event', [JSON.stringify(event)]);
    return JSON.parse(result);
  }

  /**
   * Send a request to the remote signer
   */
  private async sendRequest(method: string, params: string[]): Promise<any> {
    return new Promise(async (resolve, reject) => {
      const id = Math.random().toString(36).substring(7);

      // Store pending request
      this.pendingRequests.set(id, resolve);

      // Create request event
      const requestContent = JSON.stringify({
        id,
        method,
        params,
      });

      // Encrypt with NIP-04
      const encryptedContent = await nip04.encrypt(
        this.clientSecret,
        this.remotePubkey,
        requestContent
      );

      // Create kind 24133 request event
      const requestEvent: Partial<NostrEvent> = {
        kind: 24133,
        content: encryptedContent,
        tags: [['p', this.remotePubkey]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: this.clientPubkey,
      };

      // Publish to relays
      for (const relayUrl of this.relays) {
        try {
          const relay = relayPool.relay(relayUrl);
          // Note: We'd need to sign this with clientSecret
          // For now, this is a simplified version
          console.log('[NIP-46] Sending request to', relayUrl);
        } catch (error) {
          console.error('[NIP-46] Failed to send request:', error);
        }
      }

      // Timeout after 30 seconds
      setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }, 30000);
    });
  }

  /**
   * Listen for responses from remote signer
   */
  private listenForResponses() {
    // Subscribe to kind 24133 events directed to us
    for (const relayUrl of this.relays) {
      try {
        const relay = relayPool.relay(relayUrl);
        // Subscribe to responses
        // This is simplified - full implementation would use relay.subscribe
        console.log('[NIP-46] Listening for responses on', relayUrl);
      } catch (error) {
        console.error('[NIP-46] Failed to listen:', error);
      }
    }
  }

  /**
   * Parse nostrconnect:// URI and return bunker URI
   */
  static parseNostrConnectUri(uri: string): string {
    // nostrconnect://<pubkey>?relay=<relay>&metadata=<metadata>
    const url = new URL(uri);
    const pubkey = url.hostname || url.pathname.replace('//', '');
    const relays = url.searchParams.getAll('relay');

    // Convert to bunker URI
    const bunkerUri = `bunker://${pubkey}${relays.map((r) => `?relay=${encodeURIComponent(r)}`).join('')}`;
    return bunkerUri;
  }
}

/**
 * Generate a nostrconnect:// URI for remote signing
 */
export function generateNostrConnectUri(
  pubkey: string,
  relays: string[],
  metadata?: { name?: string; url?: string; description?: string }
): string {
  const params = new URLSearchParams();

  relays.forEach((relay) => {
    params.append('relay', relay);
  });

  if (metadata) {
    params.append('metadata', JSON.stringify(metadata));
  }

  return `nostrconnect://${pubkey}?${params.toString()}`;
}
