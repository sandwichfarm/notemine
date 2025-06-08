import { EventStore } from 'applesauce-core';
import { SimpleRelayPool } from './simple-pool';
import type { NostrEvent, Filter } from '$lib/types/nostr';
import { writable, derived } from 'svelte/store';

export interface Contact {
  pubkey: string;
  relay?: string;
  petname?: string;
}

export class ContactsService {
  private pool: SimpleRelayPool;
  private eventStore: EventStore;
  
  // Stores
  public contacts = writable<Map<string, Contact>>(new Map());
  public followedPubkeys = derived(this.contacts, $contacts => 
    Array.from($contacts.keys())
  );
  public isLoadingContacts = writable(false);
  
  constructor(pool: SimpleRelayPool, eventStore: EventStore) {
    this.pool = pool;
    this.eventStore = eventStore;
  }
  
  /**
   * Fetch contact list for a user (NIP-02 kind:3)
   */
  async fetchContactList(pubkey: string, relays: string[]): Promise<void> {
    this.isLoadingContacts.set(true);
    
    try {
      const filter: Filter = {
        kinds: [3],
        authors: [pubkey],
        limit: 1
      };
      
      return new Promise((resolve) => {
        let resolved = false;
        const subscription = this.pool.req(relays, filter).subscribe({
          next: (response) => {
            if (response !== 'EOSE' && 'id' in response) {
              const contacts = this.parseContactListEvent(response);
              if (contacts && !resolved) {
                resolved = true;
                this.contacts.set(contacts);
                subscription.unsubscribe();
                resolve();
              }
            } else if (response === 'EOSE' && !resolved) {
              resolved = true;
              subscription.unsubscribe();
              resolve();
            }
          },
          error: (error) => {
            console.error('Failed to fetch contact list:', error);
            if (!resolved) {
              resolved = true;
              resolve();
            }
          }
        });
        
        // Timeout after 5 seconds
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            subscription.unsubscribe();
            resolve();
          }
        }, 5000);
      });
    } finally {
      this.isLoadingContacts.set(false);
    }
  }
  
  /**
   * Parse NIP-02 contact list event
   */
  private parseContactListEvent(event: NostrEvent): Map<string, Contact> | null {
    try {
      const contacts = new Map<string, Contact>();
      
      // Parse p tags (follows)
      for (const tag of event.tags) {
        if (tag[0] === 'p' && tag[1]) {
          const contact: Contact = {
            pubkey: tag[1],
            relay: tag[2], // Optional relay URL
            petname: tag[3] // Optional petname
          };
          contacts.set(tag[1], contact);
        }
      }
      
      return contacts;
    } catch (error) {
      console.error('Failed to parse contact list:', error);
      return null;
    }
  }
  
  /**
   * Create or update contact list event
   */
  createContactListEvent(contacts: Contact[]): Omit<NostrEvent, 'id' | 'sig'> {
    const tags = contacts.map(contact => {
      const tag = ['p', contact.pubkey];
      if (contact.relay) tag.push(contact.relay);
      if (contact.petname) tag.push(contact.petname);
      return tag;
    });
    
    return {
      kind: 3,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: '',
      pubkey: '' // Will be set by caller
    };
  }
  
  /**
   * Add a contact to the list
   */
  addContact(contact: Contact): void {
    this.contacts.update(contacts => {
      contacts.set(contact.pubkey, contact);
      return contacts;
    });
  }
  
  /**
   * Remove a contact from the list
   */
  removeContact(pubkey: string): void {
    this.contacts.update(contacts => {
      contacts.delete(pubkey);
      return contacts;
    });
  }
  
  /**
   * Check if a pubkey is followed
   */
  isFollowing(pubkey: string): boolean {
    let following = false;
    this.contacts.subscribe(contacts => {
      following = contacts.has(pubkey);
    })();
    return following;
  }
  
  /**
   * Get relay hint for a contact
   */
  getRelayHint(pubkey: string): string | undefined {
    let relay: string | undefined;
    this.contacts.subscribe(contacts => {
      relay = contacts.get(pubkey)?.relay;
    })();
    return relay;
  }
}

// Export instance
export const contactsService = new ContactsService(new SimpleRelayPool(), new EventStore());