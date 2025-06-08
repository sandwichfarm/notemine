import Dexie, { type Table } from 'dexie';
import type { NostrEvent } from '$lib/types';

export interface MiningJobDB {
  id: string;
  content: string;
  kind: number;
  tags: string[][];
  created_at: number;
  status: 'queued' | 'mining' | 'paused' | 'completed' | 'failed';
  targetDifficulty: number;
  currentNonce?: number;
  bestPow?: number;
  minedEvent?: NostrEvent;
  error?: string;
  updatedAt: number;
}

export interface MiningProgress {
  jobId: string;
  nonce: number;
  bestPow: number;
  hashCount: number;
  updatedAt: number;
}

export interface RelayMetadata {
  url: string;
  lastSeen: number;
  supportsPow: boolean;
  minPowValues?: Record<number, number>;
  status: 'active' | 'inactive' | 'error';
}

export interface CachedEvent {
  id: string;
  event: NostrEvent;
  receivedAt: number;
  decayScore?: number;
  cumulativePow?: number;
}

export interface EventRelationship {
  id: string; // Composite key: childId:parentId:type
  childEventId: string;
  parentEventId: string;
  relationType: 'reply' | 'mention' | 'root';
  createdAt: number;
}

class NotemineDatabase extends Dexie {
  miningJobs!: Table<MiningJobDB>;
  miningProgress!: Table<MiningProgress>;
  relayMetadata!: Table<RelayMetadata>;
  cachedEvents!: Table<CachedEvent>;
  eventRelationships!: Table<EventRelationship>;

  constructor() {
    super('notemineDB');
    
    this.version(1).stores({
      miningJobs: 'id, status, created_at, updatedAt',
      miningProgress: 'jobId',
      relayMetadata: 'url, lastSeen, status',
      cachedEvents: 'id, receivedAt, decayScore',
      eventRelationships: 'id, childEventId, parentEventId, relationType'
    });
  }

  async saveMiningJob(job: MiningJobDB): Promise<void> {
    await this.miningJobs.put(job);
  }

  async getMiningJob(id: string): Promise<MiningJobDB | undefined> {
    return await this.miningJobs.get(id);
  }

  async getAllMiningJobs(status?: MiningJobDB['status']): Promise<MiningJobDB[]> {
    if (status) {
      return await this.miningJobs.where('status').equals(status).toArray();
    }
    return await this.miningJobs.toArray();
  }

  async updateMiningJobStatus(id: string, status: MiningJobDB['status'], minedEvent?: NostrEvent): Promise<void> {
    await this.miningJobs.update(id, {
      status,
      minedEvent,
      updatedAt: Date.now()
    });
  }

  async saveMiningProgress(progress: MiningProgress): Promise<void> {
    await this.miningProgress.put(progress);
  }

  async getMiningProgress(jobId: string): Promise<MiningProgress | undefined> {
    return await this.miningProgress.get(jobId);
  }

  async deleteMiningProgress(jobId: string): Promise<void> {
    await this.miningProgress.delete(jobId);
  }

  async saveRelayMetadata(metadata: RelayMetadata): Promise<void> {
    await this.relayMetadata.put(metadata);
  }

  async getActiveRelays(): Promise<RelayMetadata[]> {
    return await this.relayMetadata
      .where('status')
      .equals('active')
      .toArray();
  }

  async updateRelayStatus(url: string, status: RelayMetadata['status']): Promise<void> {
    await this.relayMetadata.update(url, {
      status,
      lastSeen: Date.now()
    });
  }

  async cacheEvent(event: NostrEvent, decayScore?: number, cumulativePow?: number): Promise<void> {
    await this.cachedEvents.put({
      id: event.id,
      event,
      receivedAt: Date.now(),
      decayScore,
      cumulativePow
    });
  }

  async getCachedEvents(limit: number = 100): Promise<CachedEvent[]> {
    return await this.cachedEvents
      .orderBy('receivedAt')
      .reverse()
      .limit(limit)
      .toArray();
  }

  async getEventsByDecayScore(limit: number = 100): Promise<CachedEvent[]> {
    const events = await this.cachedEvents.toArray();
    return events
      .filter(e => e.decayScore !== undefined)
      .sort((a, b) => (b.decayScore || 0) - (a.decayScore || 0))
      .slice(0, limit);
  }

  async cleanupOldEvents(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = Date.now() - maxAge;
    await this.cachedEvents
      .where('receivedAt')
      .below(cutoff)
      .delete();
  }

  async clearAllMiningJobs(): Promise<void> {
    await this.miningJobs.clear();
    await this.miningProgress.clear();
  }

  async saveEventRelationship(childEvent: NostrEvent, parentEventId: string, relationType: EventRelationship['relationType']): Promise<void> {
    const id = `${childEvent.id}:${parentEventId}:${relationType}`;
    await this.eventRelationships.put({
      id,
      childEventId: childEvent.id,
      parentEventId,
      relationType,
      createdAt: Date.now()
    });
  }

  async getChildEvents(parentEventId: string, relationType?: EventRelationship['relationType']): Promise<EventRelationship[]> {
    if (relationType) {
      return await this.eventRelationships
        .where('parentEventId')
        .equals(parentEventId)
        .and(rel => rel.relationType === relationType)
        .toArray();
    }
    return await this.eventRelationships
      .where('parentEventId')
      .equals(parentEventId)
      .toArray();
  }

  async getParentEvents(childEventId: string): Promise<EventRelationship[]> {
    return await this.eventRelationships
      .where('childEventId')
      .equals(childEventId)
      .toArray();
  }
}

export const db = new NotemineDatabase();

export async function initDatabase(): Promise<void> {
  try {
    await db.open();
    console.log('Database initialized');
    
    // Cleanup old events on startup
    await db.cleanupOldEvents();
    
    // Resume any interrupted mining jobs
    const interruptedJobs = await db.getAllMiningJobs('mining');
    for (const job of interruptedJobs) {
      await db.updateMiningJobStatus(job.id, 'paused');
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}