import { writable, derived } from 'svelte/store';
import type { Notemine } from '@notemine/wrapper';

export interface MiningJob {
  id: string;
  content: string;
  difficulty: number;
  createdAt: number;
  startedAt?: number;
  pausedAt?: number;
  currentNonce?: string;
  bestPow?: number;
  hashRate?: number;
  miner?: Notemine;
  status: 'queued' | 'mining' | 'paused' | 'completed';
}

class MiningQueueService {
  // Stores
  public queue = writable<MiningJob[]>([]);
  public activeJobId = writable<string | null>(null);
  
  // Derived stores
  public activeJob = derived(
    [this.queue, this.activeJobId],
    ([$queue, $activeJobId]) => {
      return $queue.find(job => job.id === $activeJobId) || null;
    }
  );
  
  public queuedJobs = derived(
    this.queue,
    $queue => $queue.filter(job => job.status === 'queued')
  );
  
  public completedJobs = derived(
    this.queue,
    $queue => $queue.filter(job => job.status === 'completed')
  );
  
  /**
   * Add a new job to the queue
   */
  addJob(job: Omit<MiningJob, 'id' | 'createdAt' | 'status'>): string {
    const id = crypto.randomUUID();
    const newJob: MiningJob = {
      ...job,
      id,
      createdAt: Date.now(),
      status: 'queued'
    };
    
    this.queue.update(q => [...q, newJob]);
    
    // If no active job, start this one
    let currentActiveId: string | null = null;
    this.activeJobId.subscribe(id => currentActiveId = id)();
    
    if (!currentActiveId) {
      this.startJob(id);
    }
    
    return id;
  }
  
  /**
   * Start mining a specific job
   */
  startJob(jobId: string) {
    this.queue.update(q => 
      q.map(job => {
        if (job.id === jobId) {
          return {
            ...job,
            status: 'mining' as const,
            startedAt: Date.now()
          };
        } else if (job.status === 'mining') {
          // Pause other mining jobs
          return {
            ...job,
            status: 'paused' as const,
            pausedAt: Date.now()
          };
        }
        return job;
      })
    );
    
    this.activeJobId.set(jobId);
  }
  
  /**
   * Pause a mining job
   */
  pauseJob(jobId: string, currentNonce?: string, bestPow?: number) {
    this.queue.update(q =>
      q.map(job => {
        if (job.id === jobId) {
          return {
            ...job,
            status: 'paused' as const,
            pausedAt: Date.now(),
            currentNonce,
            bestPow
          };
        }
        return job;
      })
    );
    
    // If this was the active job, clear it
    let currentActiveId: string | null = null;
    this.activeJobId.subscribe(id => currentActiveId = id)();
    
    if (currentActiveId === jobId) {
      this.activeJobId.set(null);
      // Start next queued job if available
      this.startNextQueued();
    }
  }
  
  /**
   * Resume a paused job
   */
  resumeJob(jobId: string) {
    // First pause any active job
    let currentActiveId: string | null = null;
    this.activeJobId.subscribe(id => currentActiveId = id)();
    
    if (currentActiveId && currentActiveId !== jobId) {
      this.pauseJob(currentActiveId);
    }
    
    // Then start this job
    this.startJob(jobId);
  }
  
  /**
   * Complete a job
   */
  completeJob(jobId: string) {
    this.queue.update(q =>
      q.map(job => {
        if (job.id === jobId) {
          return {
            ...job,
            status: 'completed' as const
          };
        }
        return job;
      })
    );
    
    // Start next queued job
    this.startNextQueued();
  }
  
  /**
   * Remove a job from the queue
   */
  removeJob(jobId: string) {
    this.queue.update(q => q.filter(job => job.id !== jobId));
    
    let currentActiveId: string | null = null;
    this.activeJobId.subscribe(id => currentActiveId = id)();
    
    if (currentActiveId === jobId) {
      this.activeJobId.set(null);
      this.startNextQueued();
    }
  }
  
  /**
   * Reorder the queue
   */
  reorderQueue(newOrder: string[]) {
    this.queue.update(q => {
      const jobMap = new Map(q.map(job => [job.id, job]));
      const reordered: MiningJob[] = [];
      
      // Add jobs in new order
      for (const id of newOrder) {
        const job = jobMap.get(id);
        if (job) {
          reordered.push(job);
          jobMap.delete(id);
        }
      }
      
      // Add any remaining jobs
      for (const job of jobMap.values()) {
        reordered.push(job);
      }
      
      return reordered;
    });
  }
  
  /**
   * Start the next queued job
   */
  private startNextQueued() {
    let queue: MiningJob[] = [];
    this.queue.subscribe(q => queue = q)();
    
    const nextJob = queue.find(job => job.status === 'queued');
    if (nextJob) {
      this.startJob(nextJob.id);
    } else {
      this.activeJobId.set(null);
    }
  }
  
  /**
   * Clear completed jobs
   */
  clearCompleted() {
    this.queue.update(q => q.filter(job => job.status !== 'completed'));
  }
}

export const miningQueue = new MiningQueueService();