import { writable, derived } from 'svelte/store';
import { db } from './database';
import { extractPowDifficulty, calculateDecayScore } from '$lib/utils/nostr';
import type { NostrEvent } from '$lib/types';
import type { CachedEvent } from './database';

export interface DecaySettings {
  decayRate: number; // Per hour decay factor (0.1 = 10% per hour)
  zapWeight: number; // How much zaps contribute to ranking (not decay prevention)
  powWeight: number; // Weight multiplier for PoW difficulty
  mentionPowBonus: number; // Bonus for being mentioned/replied to
}

const DEFAULT_DECAY_SETTINGS: DecaySettings = {
  decayRate: 0.02, // 2% decay per hour = ~50% after 24 hours
  zapWeight: 0.5,
  powWeight: 1.0,
  mentionPowBonus: 5.0
};

// Reactive stores
export const decaySettings = writable<DecaySettings>(loadDecaySettings());
export const lastUpdateTime = writable<number>(Date.now());

// Derived store for events sorted by decay score
export const rankedEvents = writable<CachedEvent[]>([]);

function loadDecaySettings(): DecaySettings {
  if (typeof localStorage === 'undefined') return DEFAULT_DECAY_SETTINGS;
  
  const saved = localStorage.getItem('notemine:decaySettings');
  if (saved) {
    try {
      return { ...DEFAULT_DECAY_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      console.warn('Failed to load decay settings:', e);
    }
  }
  return DEFAULT_DECAY_SETTINGS;
}

function saveDecaySettings(settings: DecaySettings): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('notemine:decaySettings', JSON.stringify(settings));
}

// Subscribe to settings changes and save them
decaySettings.subscribe(saveDecaySettings);

export function updateDecaySettings(partial: Partial<DecaySettings>): void {
  decaySettings.update(current => ({ ...current, ...partial }));
}

export function calculateCumulativePow(
  event: NostrEvent,
  replies: NostrEvent[] = [],
  mentions: NostrEvent[] = [],
  zaps: NostrEvent[] = []
): number {
  const settings = loadDecaySettings();
  
  // Base PoW from the event itself
  let cumulativePow = extractPowDifficulty(event) * settings.powWeight;
  
  // Add PoW from replies
  for (const reply of replies) {
    const replyPow = extractPowDifficulty(reply);
    cumulativePow += replyPow * settings.mentionPowBonus;
  }
  
  // Add PoW from mentions
  for (const mention of mentions) {
    const mentionPow = extractPowDifficulty(mention);
    cumulativePow += mentionPow * settings.mentionPowBonus;
  }
  
  // Add zap contribution (for ranking, not decay prevention)
  const zapValue = zaps.reduce((sum, zap) => {
    // Extract sat amount from zap content or tags
    const amount = extractZapAmount(zap);
    return sum + amount;
  }, 0);
  
  cumulativePow += zapValue * settings.zapWeight;
  
  return cumulativePow;
}

export function calculateEventDecayScore(
  event: NostrEvent,
  cumulativePow: number,
  settings: DecaySettings = loadDecaySettings()
): number {
  return calculateDecayScore(event.created_at, settings.decayRate, cumulativePow);
}

function extractZapAmount(zapEvent: NostrEvent): number {
  // Look for amount in bolt11 tag or description
  const bolt11Tag = zapEvent.tags.find(tag => tag[0] === 'bolt11');
  if (bolt11Tag && bolt11Tag[1]) {
    // Parse lightning invoice for amount (simplified)
    try {
      const invoice = bolt11Tag[1];
      const match = invoice.match(/(\d+)([munp]?)/);
      if (match) {
        const amount = parseInt(match[1]);
        const unit = match[2];
        switch (unit) {
          case 'm': return amount * 100; // msat to sat
          case 'u': return amount * 1000; // microsat to sat  
          case 'n': return amount * 1000000; // nanosat to sat
          case 'p': return amount * 1000000000; // picosat to sat
          default: return amount; // assume sat
        }
      }
    } catch (e) {
      console.warn('Failed to parse zap amount:', e);
    }
  }
  
  return 0;
}

export async function updateEventDecayScores(): Promise<void> {
  try {
    const events = await db.getCachedEvents(1000);
    const settings = loadDecaySettings();
    
    const updatedEvents: CachedEvent[] = [];
    
    for (const cachedEvent of events) {
      const event = cachedEvent.event;
      
      // Get related events from database
      const childRelationships = await db.getChildEvents(event.id);
      
      // Get the actual events for cumulative PoW calculation
      const replies: NostrEvent[] = [];
      const mentions: NostrEvent[] = [];
      
      for (const rel of childRelationships) {
        const childEvent = await db.cachedEvents.get(rel.childEventId);
        if (childEvent) {
          if (rel.relationType === 'reply' || rel.relationType === 'root') {
            replies.push(childEvent.event);
          } else if (rel.relationType === 'mention') {
            mentions.push(childEvent.event);
          }
        }
      }
      
      // Get zap amount from our tracking
      const zapAmount = decayEngineService.getZapsForEvent(event.id);
      
      // Calculate cumulative PoW including zaps
      let cumulativePow = calculateCumulativePow(event, replies, mentions, []);
      
      // Add zap contribution directly
      cumulativePow += zapAmount * settings.zapWeight;
      
      const decayScore = calculateEventDecayScore(event, cumulativePow, settings);
      
      const updatedEvent: CachedEvent = {
        ...cachedEvent,
        cumulativePow,
        decayScore
      };
      
      updatedEvents.push(updatedEvent);
      
      // Update in database
      await db.cacheEvent(event, decayScore, cumulativePow);
    }
    
    // Sort by decay score and update store
    updatedEvents.sort((a, b) => (b.decayScore || 0) - (a.decayScore || 0));
    rankedEvents.set(updatedEvents);
    
    lastUpdateTime.set(Date.now());
    
    console.log(`Updated decay scores for ${updatedEvents.length} events`);
  } catch (error) {
    console.error('Failed to update decay scores:', error);
  }
}

export function shouldEventBeVisible(
  event: NostrEvent,
  decayScore: number,
  minVisibilityThreshold: number = 0.01
): boolean {
  return decayScore >= minVisibilityThreshold;
}

export function getEventOpacity(decayScore: number, maxOpacity: number = 1.0): number {
  // Map decay score to opacity (0.2 minimum for readability)
  return Math.max(0.2, Math.min(maxOpacity, decayScore / 100));
}

// Periodic update system
let updateInterval: NodeJS.Timeout | null = null;

export function startDecayUpdates(intervalMs: number = 5 * 60 * 1000): void {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  updateInterval = setInterval(updateEventDecayScores, intervalMs);
  
  // Run initial update
  updateEventDecayScores();
}

export function stopDecayUpdates(): void {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

// Track zaps separately for quick access
const zapsByEvent = new Map<string, number>();

export class DecayEngineService {
  addEvent(event: NostrEvent): void {
    // Immediately calculate and cache the event
    updateEventDecayScores();
  }

  addZap(eventId: string, amount: number): void {
    // Track zap amount
    const current = zapsByEvent.get(eventId) || 0;
    zapsByEvent.set(eventId, current + amount);
    
    // Trigger recalculation for the affected event
    updateEventDecayScores();
  }

  getZapsForEvent(eventId: string): number {
    return zapsByEvent.get(eventId) || 0;
  }

  startDecayUpdates(intervalMs: number = 5 * 60 * 1000): void {
    startDecayUpdates(intervalMs);
  }

  stopDecayUpdates(): void {
    stopDecayUpdates();
  }
}

export const decayEngineService = new DecayEngineService();

// Auto-start updates when browser loads
if (typeof window !== 'undefined') {
  startDecayUpdates();
  
  // Stop updates when page unloads
  window.addEventListener('beforeunload', stopDecayUpdates);
}