import { writable, derived, get } from 'svelte/store';
import type { NostrEvent } from '$lib/types/nostr';
import { keyManager } from './keys';
import { getPowClient } from './pow-client';

export interface FavoritesList {
  id: string;
  name: string;
  description: string;
  image?: string;
  banner?: string;
  favorites: FavoriteItem[];
  event?: NostrEvent;
}

export interface FavoriteItem {
  eventId: string;
  relay?: string;
  petname?: string;
  addedAt?: number;
}

class FavoritesService {
  private favoritesStore = writable<Map<string, FavoritesList>>(new Map());
  private userFavorites = writable<FavoritesList | null>(null);
  private subscription: any;
  
  // Subscribe to favorites lists (kind 30078)
  async subscribeToFavorites(pubkey?: string) {
    const userPubkey = pubkey || keyManager.getPublicKey();
    if (!userPubkey) return;
    
    const pow = getPowClient();
    const relays = pow.getActiveRelays();
    
    if (relays.length === 0) return;
    
    // Subscribe to user's favorites lists
    const filter = {
      kinds: [30078],
      authors: [userPubkey],
      '#l': ['user_favourite_list'],
      limit: 10
    };
    
    const sub = pow.pool.req(relays, filter);
    
    sub.subscribe({
      next: (response: any) => {
        if (response !== 'EOSE' && response !== 'OK' && 'id' in response) {
          this.handleFavoritesEvent(response as NostrEvent);
        }
      },
      error: (error: any) => {
        console.error('Favorites subscription error:', error);
      }
    });
    
    this.subscription = sub;
  }
  
  private handleFavoritesEvent(event: NostrEvent) {
    try {
      // Parse content
      const content = JSON.parse(event.content);
      if (!content.name || !content.description) return;
      
      // Extract favorites from 'a' tags
      const favorites: FavoriteItem[] = event.tags
        .filter(tag => tag[0] === 'a')
        .map(tag => ({
          eventId: tag[1],
          relay: tag[2],
          petname: tag[3],
          addedAt: tag[4] ? parseInt(tag[4]) : undefined
        }));
      
      const list: FavoritesList = {
        id: event.id,
        name: content.name,
        description: content.description,
        image: content.image,
        banner: content.banner,
        favorites,
        event
      };
      
      // Update stores
      this.favoritesStore.update(store => {
        store.set(event.id, list);
        return new Map(store);
      });
      
      // If this is the user's list, update userFavorites
      if (event.pubkey === keyManager.getPublicKey()) {
        this.userFavorites.set(list);
      }
    } catch (error) {
      console.error('Failed to parse favorites event:', error);
    }
  }
  
  // Create or update favorites list
  async saveFavoritesList(name: string, description: string, favorites: FavoriteItem[]) {
    const pubkey = keyManager.getPublicKey();
    if (!pubkey) throw new Error('No public key available');
    
    // Get existing list to maintain the same 'd' tag
    const existingList = get(this.userFavorites);
    const dTag = existingList?.event?.tags.find(t => t[0] === 'd')?.[1] || 
                 `favorites-${Date.now()}`;
    
    // Create content
    const content = JSON.stringify({
      name,
      description
    });
    
    // Build tags
    const tags: string[][] = [
      ['d', dTag],
      ['l', 'user_favourite_list']
    ];
    
    // Add favorite items as 'a' tags
    favorites.forEach(fav => {
      const aTag = ['a', fav.eventId];
      if (fav.relay) aTag.push(fav.relay);
      if (fav.petname) aTag.push(fav.petname);
      if (fav.addedAt) aTag.push(fav.addedAt.toString());
      tags.push(aTag);
    });
    
    const unsignedEvent = {
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      kind: 30078,
      tags,
      content
    };
    
    const signedEvent = await keyManager.signEvent(unsignedEvent);
    const pow = getPowClient();
    const relays = pow.getActiveRelays();
    
    if (relays.length > 0) {
      await pow.pool.publish(relays, signedEvent);
    }
    
    // Update local state immediately
    this.handleFavoritesEvent(signedEvent);
    
    return signedEvent;
  }
  
  // Add a favorite to the user's list
  async addFavorite(eventId: string, relay?: string, petname?: string) {
    const currentList = get(this.userFavorites);
    const favorites = currentList?.favorites || [];
    
    // Check if already favorited
    if (favorites.some(f => f.eventId === eventId)) {
      return; // Already in favorites
    }
    
    const newFavorite: FavoriteItem = {
      eventId,
      relay,
      petname,
      addedAt: Math.floor(Date.now() / 1000)
    };
    
    const updatedFavorites = [...favorites, newFavorite];
    
    await this.saveFavoritesList(
      currentList?.name || 'My Favorites',
      currentList?.description || 'My favorite radio stations',
      updatedFavorites
    );
  }
  
  // Remove a favorite from the user's list
  async removeFavorite(eventId: string) {
    const currentList = get(this.userFavorites);
    if (!currentList) return;
    
    const updatedFavorites = currentList.favorites.filter(f => f.eventId !== eventId);
    
    await this.saveFavoritesList(
      currentList.name,
      currentList.description,
      updatedFavorites
    );
  }
  
  // Check if an event is favorited
  isFavorited(eventId: string): boolean {
    const list = get(this.userFavorites);
    return list?.favorites.some(f => f.eventId === eventId) || false;
  }
  
  // Get user's favorites list
  getUserFavorites() {
    return get(this.userFavorites);
  }
  
  // Create derived store for checking if event is favorited
  createFavoritedStore(eventId: string) {
    return derived(this.userFavorites, $list => 
      $list?.favorites.some(f => f.eventId === eventId) || false
    );
  }
  
  cleanup() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}

export const favoritesService = new FavoritesService();
export const userFavorites = derived(
  writable(null), 
  () => favoritesService.getUserFavorites()
);