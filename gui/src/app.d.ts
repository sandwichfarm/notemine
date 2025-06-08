// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces

import type { NostrEvent, UnsignedEvent } from '$lib/types/nostr';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
	
	// NIP-07 browser extension types
	interface Window {
		nostr?: {
			getPublicKey(): Promise<string>;
			signEvent(event: UnsignedEvent): Promise<NostrEvent>;
			getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
			nip04?: {
				encrypt(pubkey: string, plaintext: string): Promise<string>;
				decrypt(pubkey: string, ciphertext: string): Promise<string>;
			};
		};
	}
}

export {};
