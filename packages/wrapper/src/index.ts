import { Subject, BehaviorSubject } from 'rxjs';
//@ts-ignore: multi-stage build hack to facilitate inline base64 wasm within an inline web-worker.
import MineWorker from '../dist/mine.worker.js';

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
}

/** Data structure representing a progress event during mining */
export interface ProgressEvent {
  /** ID of the worker making progress */
  workerId: number;
  /** Current hash rate of the worker (in hashes per second) */
  hashRate?: number;
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

/** Class representing a miner for Notemine events */
export class Notemine {
  private readonly REFRESH_EVERY_MS = 250;

  private _content: string;
  private _tags: string[][];
  private _pubkey: string;
  private _difficulty: number;
  private _numberOfWorkers: number;
  private _workerMaxHashRates = new Map<number, number>();
  private _workerHashRates = new Map<number, number[]>();
  private _lastRefresh = 0;
  private _totalHashRate = 0;
  static _defaultTags: string[][] = [['miner', 'notemine']];

  /** Observable indicating whether mining is currently active */
  public mining$ = new BehaviorSubject<boolean>(false);
  /** Observable indicating if mining was cancelled */
  public cancelled$ = new BehaviorSubject<boolean>(false);
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

  /** Observable for mining progress updates */
  public progress$ = this.progressSubject.asObservable();
  /** Observable for errors encountered during mining */
  public error$ = this.errorSubject.asObservable();
  /** Observable for mining cancellations */
  public cancelledEvent$ = this.cancelledEventSubject.asObservable();
  /** Observable for successful mining results */
  public success$ = this.successSubject.asObservable();

  /**
   * Creates a new Notemine miner instance
   * @param options - Configuration options for the miner
   */
  constructor(options?: MinerOptions) {
    this._content = options?.content || '';
    this._tags = [...Notemine._defaultTags, ...(options?.tags || [])];
    this._pubkey = options?.pubkey || '';
    this._difficulty = options?.difficulty || 20;
    this._numberOfWorkers = options?.numberOfWorkers || navigator.hardwareConcurrency || 4;
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
    this._tags = Array.from(new Set([...this._tags, ...tags]));
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

    this.mining$.next(true);
    this.cancelled$.next(false);
    this.result$.next(null);
    this.workers$.next([]);
    //@ts-ignore: pedantic
    this.workersPow$.next({});
    //@ts-ignore: pedantic
    this.highestPow$.next({});

    await this.initializeWorkers();
  }

  /** Stops the mining process */
  stop(): void {
    this.cancel();
  }

  /** Cancels the mining process */
  cancel(): void {
    if (!this.mining$.getValue()) return;

    this.cancelled$.next(true);
    this.workers$.getValue().forEach(worker => worker.terminate());
    this.mining$.next(false);

    this.cancelledEventSubject.next({ reason: 'Mining cancelled by user.' });
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
    const { type, workerId, hashRate } = data;

    ////console.log('Message from worker:', data);

    if (type === 'initialized') {
      ////console.log(`Worker ${workerId} initialized:`, data.message);
    } else if (type === 'progress') {
      let bestPowData: BestPowData | undefined;

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

      this.progressSubject.next({ workerId, hashRate, bestPowData });
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
    const event = {
      pubkey: this.pubkey,
      kind: 1,
      tags: this.tags,
      content: this.content,
      created_at: Math.floor(Date.now() / 1000),
    };

    return JSON.stringify(event);
  }

  /**
   * Calculates and tracks the hash rate for a worker
   * @param workerId - The ID of the worker
   * @param hashRate - The hash rate to track
   */
  private calculateHashRate(workerId: number, hashRate: number) {
    if (!hashRate) return;

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
    //console.log(`Worker ${workerId} hash rate: ${Math.round(hashRate/1000)}`);
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

    //console.log(`Refreshing hash rate... total: ${this.totalHashRate}`);

    let totalRate = 0;
    this._workerHashRates.forEach((hashRates) => {
        if (hashRates.length > 0) {
            totalRate += this.averageHashRate(hashRates);
        }
    });

    this._totalHashRate = Math.round(totalRate/1000);
    this._lastRefresh = Date.now();
  }
}
