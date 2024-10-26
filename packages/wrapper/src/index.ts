
import { Subject, BehaviorSubject } from 'rxjs';
//@ts-ignore: multi-stage build hack to facilitate inline base64 wasm within an inline web-worker.
import MineWorker from '../dist/mine.worker.js';

export interface MinerOptions {
  content?: string;
  tags?: string[][];
  pubkey?: string;
  difficulty?: number;
  numberOfWorkers?: number;
}

export interface ProgressEvent {
  workerId: number;
  hashRate?: number;
  bestPowData?: BestPowData;
}

export interface ErrorEvent {
  error: any;
  message?: string;
}

export interface CancelledEvent {
  reason?: string;
}

export interface SuccessEvent {
  result: MinedResult | null;
}

export interface BestPowData {
  bestPow: number;
  nonce: string;
  hash: string;
}

export interface WorkerPow extends BestPowData {
  workerId?: number;
}

export interface MinedResult {
  event: any;
  totalTime: number;
  hashRate: number;
}

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

  public mining$ = new BehaviorSubject<boolean>(false);
  public cancelled$ = new BehaviorSubject<boolean>(false);
  public result$ = new BehaviorSubject<MinedResult | null>(null);
  public workers$ = new BehaviorSubject<Worker[]>([]);
  public workersPow$ = new BehaviorSubject<Record<number, BestPowData>>({});
  public highestPow$ = new BehaviorSubject<WorkerPow | null>(null);

  private progressSubject = new Subject<ProgressEvent>();
  private errorSubject = new Subject<ErrorEvent>();
  private cancelledEventSubject = new Subject<CancelledEvent>();
  private successSubject = new Subject<SuccessEvent>();

  public progress$ = this.progressSubject.asObservable();
  public error$ = this.errorSubject.asObservable();
  public cancelledEvent$ = this.cancelledEventSubject.asObservable();
  public success$ = this.successSubject.asObservable();

  constructor(options?: MinerOptions) {
    this._content = options?.content || '';
    this._tags = [...Notemine._defaultTags, ...(options?.tags || [])];
    this._pubkey = options?.pubkey || '';
    this._difficulty = options?.difficulty || 20;
    this._numberOfWorkers = options?.numberOfWorkers || navigator.hardwareConcurrency || 4;
  }

  set content(content: string) {
    this._content = content;
  }

  get content(): string {
    return this._content;
  }

  set tags(tags: string[][]) {
    this._tags = Array.from(new Set([...this._tags, ...tags]));
  }

  get tags(): string[][] {
    return this._tags;
  }

  set pubkey(pubkey: string) {
    this._pubkey = pubkey;
  }

  get pubkey(): string {
    return this._pubkey;
  }

  set difficulty(difficulty: number) {
    this._difficulty = difficulty;
  }

  get difficulty(): number {
    return this._difficulty;
  }

  set numberOfWorkers(numberOfWorkers: number) {
    this._numberOfWorkers = numberOfWorkers;
  }

  get numberOfWorkers(): number {
    return this._numberOfWorkers;
  }

  set lastRefresh(interval: number) {
    this._lastRefresh = interval;
  }

  get lastRefresh(): number {
    return this._lastRefresh;
  }

  get totalHashRate(): number {
    return this._totalHashRate;
  }

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

  stop(): void {
    this.cancel();
  }

  cancel(): void {
    if (!this.mining$.getValue()) return;

    this.cancelled$.next(true);
    this.workers$.getValue().forEach(worker => worker.terminate());
    this.mining$.next(false);

    this.cancelledEventSubject.next({ reason: 'Mining cancelled by user.' });
  }

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

  private handleWorkerError(e: ErrorEvent): void {
    console.error('Worker encountered an error:', e);
    const errorDetails = {
      message: e.message,
      error: e.error ? e.error.message : null,
    };
    this.errorSubject.next({ error: JSON.stringify(errorDetails) });
  }

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

  private async recordMaxRate(workerId: number, hashRate: number){
    //console.log(`Worker ${workerId} hash rate: ${Math.round(hashRate/1000)}`);
    const maxHashRate = this._workerMaxHashRates.get(workerId);
    if (maxHashRate === undefined || hashRate > maxHashRate) {
      this._workerMaxHashRates.set(workerId, Math.round(hashRate));
    }
  }

  private averageHashRate(arr: number[]): number {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
        sum += arr[i];
    }
    return arr.length === 0 ? 0 : sum / arr.length;
  }

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
