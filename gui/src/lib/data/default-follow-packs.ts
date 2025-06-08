/**
 * Default follow packs for curated feeds
 * These are used when users are anonymous or don't have a follow list
 */

export interface FollowPackReference {
  id: string;
  name: string;
  description: string;
}

export const DEFAULT_FOLLOW_PACKS: FollowPackReference[] = [
  {
    id: 'c1c83b9b97c9d4709bdef4ae0b3374c80f62192d8eefcd07d21c693ebf05e8fa',
    name: 'Nostr Streamers',
    description: 'Top 50 most prolific live streamers on Nostr'
  },
  // Add more default packs here as they are provided
  // Examples of what we might add:
  // {
  //   id: 'xxx',
  //   name: 'Nostr Developers',
  //   description: 'Core protocol and client developers'
  // },
  // {
  //   id: 'xxx', 
  //   name: 'Bitcoin Builders',
  //   description: 'Bitcoin developers and educators'
  // },
  // {
  //   id: 'xxx',
  //   name: 'Artists & Creators',
  //   description: 'Visual artists, musicians, and content creators'
  // }
];

// Relay recommendations for discovering follow packs
export const FOLLOW_PACK_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
  'wss://relay.primal.net'
];