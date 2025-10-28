import { Subject, BehaviorSubject } from 'rxjs';
//@ts-ignore: multi-stage build hack to facilitate inline base64 wasm within an inline web-worker.
import MineWorker from '../dist/mine.worker.js';

/** Generate a UUID v4 for run identification */
function generateRunId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/** Options for configuring the miner */
export interface MinerOptions {
  /** The content to include in the mined event */
  content?: string;
  /** Tags associated with the mined event */
  tags?: string[][];
  /** Public key used for the event */
  pubkey?: string;
  /** Difficulty level for mining */
  difficulty?: number;
  /** Number of workers to use for mining */
  numberOfWorkers?: number;
  /** Event kind (default: 1) */
  kind?: number;
  /** Enable debug logging (default: false) */
  debug?: boolean;
}

/** Data structure representing a progress event during mining */
export interface ProgressEvent {
  /** ID of the worker making progress */
  workerId: number;
  /** Current hash rate of the worker (in hashes per second) */
  hashRate?: number;
  /** Current nonce being tried by the worker (Protocol v2) */
  currentNonce?: string;
  /** Current best proof-of-work data */
  bestPowData?: BestPowData;
}

/** Data structure for reporting an error event */
export interface ErrorEvent {
  /** The error that occurred */
  error: any;
  /** Optional message with more details about the error */
  message?: string;
}

/** Data structure for reporting a cancelled mining event */
export interface CancelledEvent {
  /** Reason for the cancellation */
  reason?: string;
}

/** Data structure for reporting a successful mining event */
export interface SuccessEvent {
  /** The result of the mining operation */
  result: MinedResult | null;
}

/** Best proof-of-work data found so far */
export interface BestPowData {
  /** Best proof-of-work value */
  bestPow: number;
  /** Nonce used to achieve the proof-of-work */
  nonce: string;
  /** Hash that met the proof-of-work requirements */
  hash: string;
}

/** Proof-of-work data including worker information */
export interface WorkerPow extends BestPowData {
  /** ID of the worker who found this proof-of-work */
  workerId?: number;
}

/** Data structure representing a mined event result */
export interface MinedResult {
  /** The mined event data */
  event: any;
  /** Total time taken to mine (in milliseconds) */
  totalTime: number;
  /** Hash rate achieved during mining */
  hashRate: number;
}

/** Serializable mining state for pause/resume functionality */
export interface MiningState {
  /** The event being mined */
  event: {
    pubkey: string;
    kind: number;
    tags: string[][];
    content: string;
    created_at: number;
  };
  /** Array of current nonces for each worker */
  workerNonces: string[];
  /** Best proof-of-work found so far */
  bestPow: BestPowData | null;
  /** Per-worker best proof-of-work data */
  workersPow?: Record<number, BestPowData>;
  /** Target difficulty */
  difficulty: number;
  /** Number of workers when state was saved */
  numberOfWorkers: number;
}

/** Class representing a miner for Notemine events */
export class Notemine {
  private readonly REFRESH_EVERY_MS = 250;

  private _content: string;
  private _tags: string[][];
  private _pubkey: string;
  private _difficulty: number;
  private _numberOfWorkers: number;
  private _kind: number;
  private _debug: boolean;
  private _createdAt?: number;
  private _workerMaxHashRates = new Map<number, number>();
  private _workerHashRates = new Map<number, number[]>();
  private _lastRefresh = 0;
  private _totalHashRate = 0;
  private _lastHashRateLog = 0; // Phase 6: Track last hash rate log time
  private _workerNonces = new Map<number, string>();
  private _lastNonceLog = new Map<number, number>(); // Phase 6: Track last nonce log per worker
  private _resumeNonces: string[] | undefined;
  // Fallback sampling for rate when workers only send nonces
  private _workerLastNonce = new Map<number, bigint>();
  private _workerLastTime = new Map<number, number>();
  private _runId: string | null = null; // Current session run ID for message gating
  private _hasSeenRealNonces = false; // Track first transition from defaults to real nonces
  static _defaultTags: string[][] = [['miner', 'notemine']];

  /** Observable indicating whether mining is currently active */
  public mining$ = new BehaviorSubject<boolean>(false);
  /** Observable indicating if mining was cancelled */
  public cancelled$ = new BehaviorSubject<boolean>(false);
  /** Observable indicating if mining is paused */
  public paused$ = new BehaviorSubject<boolean>(false);
  /** Observable for the result of the mining operation */
  public result$ = new BehaviorSubject<MinedResult | null>(null);
  /** Observable for the list of active workers */
  public workers$ = new BehaviorSubject<Worker[]>([]);
  /** Observable tracking the proof-of-work data for each worker */
  public workersPow$ = new BehaviorSubject<Record<number, BestPowData>>({});
  /** Observable for the worker that found the best proof-of-work */
  public highestPow$ = new BehaviorSubject<WorkerPow | null>(null);

  private progressSubject = new Subject<ProgressEvent>();
  private errorSubject = new Subject<ErrorEvent>();
  private cancelledEventSubject = new Subject<CancelledEvent>();
  private successSubject = new Subject<SuccessEvent>();
  private firstRealNoncesSubject = new Subject<void>();

  /** Observable for mining progress updates */
  public progress$ = this.progressSubject.asObservable();
  /** Observable for errors encountered during mining */
  public error$ = this.errorSubject.asObservable();
  /** Observable for mining cancellations */
  public cancelledEvent$ = this.cancelledEventSubject.asObservable();
  /** Observable for successful mining results */
  public success$ = this.successSubject.asObservable();
  /** Observable that emits once when first real nonces are received (transition from defaults) */
  public firstRealNonces$ = this.firstRealNoncesSubject.asObservable();

  /**
   * Creates a new Notemine miner instance
   * @param options - Configuration options for the miner
   */
  constructor(options?: MinerOptions) {
    this._content = options?.content || '';
    this._tags = Notemine.normalizeTags([...Notemine._defaultTags, ...(options?.tags || [])]);
    this._pubkey = options?.pubkey || '';
    this._difficulty = options?.difficulty || 20;
    this._numberOfWorkers = options?.numberOfWorkers || navigator.hardwareConcurrency || 4;
    this._kind = options?.kind ?? 1; // Use ?? instead of || to allow kind: 0
    this._debug = options?.debug || false;
  }

  /** Sets the content to be used in the mining event */
  set content(content: string) {
    this._content = content;
  }

  /** Gets the current mining content */
  get content(): string {
    return this._content;
  }

  /** Sets the tags to be used in the mining event */
  set tags(tags: string[][]) {
    this._tags = Notemine.normalizeTags([...this._tags, ...tags]);
  }

  /** Gets the current tags */
  get tags(): string[][] {
    return this._tags;
  }

  /** Sets the public key for the event */
  set pubkey(pubkey: string) {
    this._pubkey = pubkey;
  }

  /** Gets the current public key */
  get pubkey(): string {
    return this._pubkey;
  }

  /** Sets the mining difficulty */
  set difficulty(difficulty: number) {
    this._difficulty = difficulty;
  }

  /** Gets the current mining difficulty */
  get difficulty(): number {
    return this._difficulty;
  }

  /** Sets the number of workers for mining */
  set numberOfWorkers(numberOfWorkers: number) {
    this._numberOfWorkers = numberOfWorkers;
  }

  /** Gets the number of workers currently being used */
  get numberOfWorkers(): number {
    return this._numberOfWorkers;
  }

  /** Sets the event kind */
  set kind(kind: number) {
    this._kind = kind;
  }

  /** Gets the event kind */
  get kind(): number {
    return this._kind;
  }

  /** Sets debug mode */
  set debug(debug: boolean) {
    this._debug = debug;
  }

  /** Gets debug mode */
  get debug(): boolean {
    return this._debug;
  }

  /** Sets the last refresh interval */
  set lastRefresh(interval: number) {
    this._lastRefresh = interval;
  }

  /** Gets the last refresh interval */
  get lastRefresh(): number {
    return this._lastRefresh;
  }

  /** Gets the total hash rate achieved */
  get totalHashRate(): number {
    return this._totalHashRate;
  }

  /**
   * Starts the mining process. Throws an error if pubkey or content is not set.
   */
  async mine(): Promise<void> {
    if (this.mining$.getValue()) return;

    if (!this.pubkey) {
      throw new Error('Public key is not set.');
    }

    if (!this.content) {
      throw new Error('Content is not set.');
    }

    // Generate new runId for this mining session to prevent ghost updates
    this._runId = generateRunId();

    if (this._debug) {
      console.log('[Notemine] Starting new mining session, runId:', this._runId);
    }

    this.mining$.next(true);
    this.cancelled$.next(false);
    this.result$.next(null);
    this.workers$.next([]);

    // Reset hash rate tracking when starting/resuming
    this._workerHashRates.clear();
    this._workerMaxHashRates.clear();
    this._totalHashRate = 0;
    this._lastRefresh = 0;

    // Reset first real nonces flag for new session
    this._hasSeenRealNonces = false;

    // Only clear these if not resuming with real data
    // Clear when: no resume nonces OR (empty nonces AND no per-worker bests)
    const hasResumeNonces = this._resumeNonces && this._resumeNonces.length > 0;
    const hasWorkersPow = Object.keys(this.workersPow$.getValue() || {}).length > 0;
    const isRealResume = hasResumeNonces || hasWorkersPow;

    if (!isRealResume) {
      //@ts-ignore: pedantic
      this.workersPow$.next({});
      //@ts-ignore: pedantic
      this.highestPow$.next({});
      this._workerNonces.clear();
      this._createdAt = undefined;
    }

    await this.initializeWorkers();

    // Clear resume nonces after they're used
    this._resumeNonces = undefined;
  }

  /** Stops the mining process */
  stop(): void {
    this.cancel();
  }

  /** Cancels the mining process */
  cancel(): void {
    if (!this.mining$.getValue()) return;

    if (this._debug) {
      console.log('[Notemine] Cancelling mining, sending cancel to workers');
    }

    this.cancelled$.next(true);

    // Send cancel message to all workers first
    const workers = this.workers$.getValue();
    workers.forEach(worker => {
      try {
        worker.postMessage({
          type: 'cancel',
          runId: this._runId
        });
      } catch (err) {
        console.error('Error sending cancel to worker:', err);
      }
    });

    // Phase 4: Give workers 200ms grace period to respond, then terminate
    setTimeout(() => {
      workers.forEach(worker => {
        try {
          worker.terminate();
        } catch (err) {
          // Worker may already be terminated, ignore
        }
      });
    }, 200);

    this.mining$.next(false);

    this.cancelledEventSubject.next({ reason: 'Mining cancelled by user.' });
  }

  /**
   * Pauses the mining process while preserving state
   */
  pause(): void {
    if (!this.mining$.getValue()) return;

    if (this._debug) {
      console.log('[Notemine] Pausing mining, sending cancel to workers');
    }

    // Send cancel message to all workers first
    const workers = this.workers$.getValue();
    workers.forEach(worker => {
      try {
        worker.postMessage({
          type: 'cancel',
          runId: this._runId  // Include runId so workers know this is legitimate
        });
      } catch (err) {
        console.error('Error sending cancel to worker:', err);
      }
    });

    // Phase 4: Give workers 200ms grace period to respond to cancel, then terminate
    setTimeout(() => {
      workers.forEach(worker => {
        try {
          worker.terminate();
        } catch (err) {
          // Worker may already be terminated, ignore
        }
      });
    }, 200);

    this.mining$.next(false);
    this.paused$.next(true);
  }

  /**
   * Resumes the mining process from a paused or saved state
   * @param workerNonces - Optional array of worker nonces to resume from
   */
  async resume(workerNonces?: string[]): Promise<void> {
    if (this.mining$.getValue()) return;

    if (this._debug) {
      console.log('[Notemine] Resuming mining session');
    }

    // If workerNonces provided, use them; otherwise use tracked nonces
    if (workerNonces && workerNonces.length > 0) {
      this._resumeNonces = workerNonces;
    } else if (this._workerNonces.size > 0) {
      // Build an ordered array keyed by worker id to preserve resume alignment
      const orderedNonces: string[] = [];
      for (let i = 0; i < this.numberOfWorkers; i++) {
        const nonce = this._workerNonces.get(i);
        orderedNonces[i] = nonce ?? i.toString();
      }
      this._resumeNonces = orderedNonces;
    }

    this.paused$.next(false);
    await this.mine();
  }

  /**
   * Gets the current mining state for serialization/persistence
   * @returns MiningState object containing all resumable state
   */
  getState(): MiningState {
    const workerNonces: string[] = [];
    let hasRealNonces = false;

    // Build array from current worker nonces
    for (let i = 0; i < this.numberOfWorkers; i++) {
      const nonce = this._workerNonces.get(i);
      if (nonce) {
        workerNonces.push(nonce);
        // Check if this is not a default nonce (0, 1, 2, etc.)
        if (nonce !== i.toString()) {
          hasRealNonces = true;
        }
      } else {
        // If worker hasn't reported yet, use default starting nonce
        workerNonces.push(i.toString());
      }
    }

    // Guarded persistence: If we only have default nonces, don't persist them
    // This prevents cluttering persistence with meaningless initial state
    const noncesToPersist = hasRealNonces ? workerNonces : [];

    const state = {
      event: {
        pubkey: this.pubkey,
        kind: this.kind,
        tags: this.tags,
        content: this.content,
        created_at: this._createdAt ?? Math.floor(Date.now() / 1000),
      },
      workerNonces: noncesToPersist,
      bestPow: this.highestPow$.getValue(),
      workersPow: this.workersPow$.getValue(),
      difficulty: this.difficulty,
      numberOfWorkers: this.numberOfWorkers,
    };
    if (this._debug) {
      const workersPow = this.workersPow$.getValue();
      const workersPowCount = Object.keys(workersPow).length;
      try {
        console.log('[Notemine] getState:', {
          hasRealNonces: hasRealNonces,
          noncesCount: noncesToPersist.length,
          workersPowCount: workersPowCount,
          sampleNonces: noncesToPersist.slice(0, 3),
        });
      } catch {
        console.log(`[Notemine] getState workerNonces (hasReal: ${hasRealNonces})`, noncesToPersist);
      }
    }
    return state;
  }

  /**
   * Restores mining state from a previously saved state
   * @param state - MiningState object to restore
   */
  restoreState(state: MiningState): void {
    if (this.mining$.getValue()) {
      throw new Error('Cannot restore state while mining is active');
    }

    if (this._debug) {
      console.log('[Notemine] Restoring state:', {
        nonces: state.workerNonces.length,
        difficulty: state.difficulty,
        hasWorkersPow: !!state.workersPow,
        workersPowCount: state.workersPow ? Object.keys(state.workersPow).length : 0,
        savedWorkers: state.numberOfWorkers,
      });
    }

    // Restore event data
    this.pubkey = state.event.pubkey;
    this.kind = state.event.kind;
    this._tags = Notemine.normalizeTags(state.event.tags);
    this.content = state.event.content;
    this.difficulty = state.difficulty;
    this._createdAt = state.event.created_at;

    // Restore nonces
    this._resumeNonces = state.workerNonces;

    // Restore per-worker best POW data if available
    if (state.workersPow) {
      this.workersPow$.next(state.workersPow);

      // Seed highestPow$ from the best among all workers
      const workerPowValues = Object.values(state.workersPow);
      if (workerPowValues.length > 0) {
        const maxPow = workerPowValues.reduce((max, pow) =>
          pow.bestPow > max.bestPow ? pow : max
        );
        this.highestPow$.next(maxPow);

        if (this._debug) {
          console.log('[Notemine] Restored per-worker POW, highest:', maxPow.bestPow);
        }
      }
    } else if (state.bestPow) {
      // Backward compatibility: use old bestPow if workersPow not available
      this.highestPow$.next(state.bestPow);

      if (this._debug) {
        console.log('[Notemine] Restored legacy bestPow:', state.bestPow.bestPow);
      }
    }

    // Note: numberOfWorkers can be different from state.numberOfWorkers
    // The worker will handle redistribution automatically
  }

  /**
   * Initializes worker threads for mining
   */
  private async initializeWorkers(): Promise<void> {
    try {
      ////console.log('Initializing workers...');
      const workers: Worker[] = [];
      for (let i = 0; i < this.numberOfWorkers; i++) {
        //@ts-ignore: esbuild-inline-worker
        const worker = MineWorker();
        worker.onmessage = this.handleWorkerMessage.bind(this);
        worker.onerror = this.handleWorkerError.bind(this);
        const event = this.prepareEvent();

        worker.postMessage({
          type: 'mine',
          event,
          difficulty: this.difficulty,
          id: i,
          totalWorkers: this.numberOfWorkers,
          workerNonces: this._resumeNonces,
          runId: this._runId,
        });

        workers.push(worker);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.workers$.next(workers);
      ////console.log(`Initialized ${workers.length} workers.`);
    } catch (error) {
      this.errorSubject.next({ error });
      console.error('Error initializing workers:', error);
    }
  }

  /**
   * Handles messages received from the mining workers
   * @param e - The message event from a worker
   */
  private handleWorkerMessage(e: MessageEvent): void {
    const data = e.data;
    const { type, workerId, runId } = data;

    // RunId gating: Ignore messages from old/different mining sessions
    // This prevents ghost updates after pause/cancel
    // Reject messages without runId (likely stale cached workers) OR with wrong runId
    if (!runId || runId !== this._runId) {
      if (this._debug || runId) {
        console.log(`[Notemine] 🚫 GHOST UPDATE BLOCKED - Ignoring message from old session. Expected: ${this._runId}, Got: ${runId || 'missing'}`);
      }
      return;
    }

    ////console.log('Message from worker:', data);

    if (type === 'initialized') {
      ////console.log(`Worker ${workerId} initialized:`, data.message);
    } else if (type === 'progress') {
      // Phase 4: Stop processing progress after mining stops
      if (!this.mining$.getValue()) {
        if (this._debug) {
          console.log('[Notemine] Ignoring progress - mining stopped');
        }
        return;
      }

      if (this._debug) {
        try {
          console.log('[Notemine] progress from worker', workerId, JSON.stringify(data));
        } catch {
          console.log('[Notemine] progress from worker', workerId, data);
        }
      }
      let bestPowData: BestPowData | undefined;

      // Phase 3: Track current nonce for this worker (Protocol v2)
      if (data?.currentNonce) {
        this._workerNonces.set(workerId, data.currentNonce);

        // Phase 2: Detect first transition from default nonces to real nonces
        if (!this._hasSeenRealNonces && data.currentNonce !== workerId.toString()) {
          this._hasSeenRealNonces = true;
          this.firstRealNoncesSubject.next();
          if (this._debug) {
            console.log('[Notemine] First real nonce detected - triggering immediate save');
          }
        }

        // Phase 6: Log per-worker currentNonce updates (rate limited to every 2s per worker)
        if (this._debug) {
          const now = Date.now();
          const lastLog = this._lastNonceLog.get(workerId) || 0;
          if (now - lastLog >= 2000) {
            console.log(`[Notemine] Worker ${workerId} currentNonce:`, data.currentNonce);
            this._lastNonceLog.set(workerId, now);
          }
        }
      } else if (this._debug) {
        // Phase 3: Backward compatibility - worker doesn't support Protocol v2 currentNonce
        console.log('[Notemine] Worker', workerId, 'sent progress without currentNonce (Protocol v1)');
      }

      if (data?.bestPowData) {
        bestPowData = data.bestPowData as BestPowData;

        const workersPow = { ...this.workersPow$.getValue() };
        workersPow[workerId] = bestPowData;
        this.workersPow$.next(workersPow);

        //console.log(`Worker ${workerId} best PoW: ${bestPowData.bestPow}`);

        const highestPow = this.highestPow$.getValue()

        //console.log(`Highest PoW: ${highestPow?.bestPow}`);

        if (!highestPow || (bestPowData && bestPowData.bestPow > (highestPow?.bestPow || 0))) {
          this.highestPow$.next({
            ...bestPowData,
            workerId,
          });
        }
      }

      this.calculateHashRate(workerId, data.hashRate);

      this.progressSubject.next({
        workerId,
        hashRate: data.hashRate,
        currentNonce: data.currentNonce,
        bestPowData,
      });
    } else if (type === 'result') {
      ////console.log('Mining result received:', data.data);
      this.result$.next(data.data);
      this.mining$.next(false);

      this.workers$.getValue().forEach(worker => worker.terminate());
      this.successSubject.next({ result: this.result$.getValue() });
    } else if (type === 'error') {
      console.error('Error from worker:', data.error);
      this.errorSubject.next({ error: data.error || 'Unknown error from worker' });
    }
  }

  /**
   * Handles errors encountered by the mining workers
   * @param e - The error event from a worker
   */
  private handleWorkerError(e: ErrorEvent): void {
    console.error('Worker encountered an error:', e);
    const errorDetails = {
      message: e.message,
      error: e.error ? e.error.message : null,
    };
    this.errorSubject.next({ error: JSON.stringify(errorDetails) });
  }

  /**
   * Prepares the mining event with necessary data
   * @returns A JSON string representing the event
   */
  private prepareEvent(): string {
    const createdAt = this._createdAt ?? Math.floor(Date.now() / 1000);
    const isNewTimestamp = this._createdAt === undefined;
    // Ensure created_at stays stable for the lifetime of this mining session
    this._createdAt = createdAt;

    if (this._debug) {
      console.log(`[Notemine] prepareEvent created_at: ${createdAt} (${isNewTimestamp ? 'NEW' : 'PRESERVED'})`);
    }

    const event = {
      pubkey: this.pubkey,
      kind: this._kind,
      tags: this.tags,
      content: this.content,
      created_at: createdAt,
    };

    return JSON.stringify(event);
  }

  /**
   * Calculates and tracks the hash rate for a worker
   * @param workerId - The ID of the worker
   * @param hashRate - The hash rate to track
   */
  private calculateHashRate(workerId: number, hashRate: number) {
    // Phase 4: Stop calculating hash rate after mining stops
    if (!this.mining$.getValue()) {
      return;
    }

    if (!hashRate || hashRate <= 0) {
      return;
    }

    let workerHashRates: number[] = this._workerHashRates.get(workerId) || [];
    workerHashRates.push(hashRate);

    if (workerHashRates.length > 11) {
        workerHashRates.shift();
    }

    this._workerHashRates.set(workerId, workerHashRates);

    this.recordMaxRate(workerId, hashRate);
    this.refreshHashRate();
  }

  /**
   * Records the maximum hash rate for a worker
   * @param workerId - The ID of the worker
   * @param hashRate - The hash rate to record
   */
  private async recordMaxRate(workerId: number, hashRate: number){
    const maxHashRate = this._workerMaxHashRates.get(workerId);
    if (maxHashRate === undefined || hashRate > maxHashRate) {
      this._workerMaxHashRates.set(workerId, Math.round(hashRate));
    }
  }

  /**
   * Calculates the average hash rate from an array of hash rates
   * @param arr - Array of hash rate values
   * @returns The average hash rate
   */
  private averageHashRate(arr: number[]): number {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum += arr[i];
    }
    return arr.length === 0 ? 0 : sum / arr.length;
  }

  /**
   * Refreshes the total hash rate for all workers
   */
  private refreshHashRate() {
    if (Date.now() - this.lastRefresh < this.REFRESH_EVERY_MS) {
        return;
    }

    let totalRate = 0;
    this._workerHashRates.forEach((hashRates) => {
        if (hashRates.length > 0) {
            totalRate += this.averageHashRate(hashRates);
        }
    });

    const oldRate = this._totalHashRate;
    this._totalHashRate = totalRate / 1000;
    this._lastRefresh = Date.now();

    // Phase 6: Log total hash rate changes every ~1 second
    if (this._debug) {
      const now = Date.now();
      if (now - this._lastHashRateLog >= 1000) {
        console.log(`[Notemine] totalHashRate: ${this._totalHashRate.toFixed(2)} KH/s (Δ ${(this._totalHashRate - oldRate).toFixed(2)})`);
        this._lastHashRateLog = now;
      }
    }
  }

  /** Normalize tags by content (dedupe arrays by their values, not references) */
  private static normalizeTags(tags: string[][]): string[][] {
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const t of tags) {
      if (!Array.isArray(t) || t.length === 0) continue;
      const key = t.join('\u001F');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(t);
      }
    }
    // Ensure default tags exist exactly once
    for (const dt of Notemine._defaultTags) {
      const key = dt.join('\u001F');
      if (!seen.has(key)) {
        seen.add(key);
        out.push(dt);
      }
    }
    return out;
  }
}
