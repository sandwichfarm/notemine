type StartMsg = { cmd: 'start'; durationMs: number; workerId: number; nonceBase: number };
type InitMsg = { cmd: 'init'; moduleUrl: string; payload: any };

export class WebWorkerPool {
  private workers: Worker[] = [];
  private workerUrl: string;
  private attemptModuleUrl: string;

  constructor(opts: { threads: number; workerUrl: string; attemptModuleUrl: string }) {
    this.workerUrl = opts.workerUrl;
    this.attemptModuleUrl = opts.attemptModuleUrl;
    for (let i = 0; i < opts.threads; i++) this.workers.push(new Worker(this.workerUrl, { type: 'module' }));
  }

  async probe(payload: any, durationMs: number): Promise<number> {
    const initPromises = this.workers.map((w) => this.postInit(w, { cmd: 'init', moduleUrl: this.attemptModuleUrl, payload }));
    await Promise.all(initPromises);
    const startAt = performance.now();
    const per = this.workers.map((w, i) => this.postStart(w, { cmd: 'start', durationMs, workerId: i, nonceBase: i }));
    const counts = await Promise.all(per);
    const elapsed = performance.now() - startAt;
    const total = counts.reduce((a, b) => a + b, 0);
    return total / (elapsed / 1000);
  }

  async destroy(): Promise<void> {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  private postInit(w: Worker, msg: InitMsg): Promise<void> {
    return new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        const data = ev.data;
        if (data && data.cmd === 'inited') { w.removeEventListener('message', onMessage); resolve(); }
      };
      const onError = (e: any) => { w.removeEventListener('error', onError as any); reject(e); };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError as any);
      w.postMessage(msg);
    });
  }

  private postStart(w: Worker, msg: StartMsg): Promise<number> {
    return new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        const data = ev.data;
        if (data && data.cmd === 'done') { w.removeEventListener('message', onMessage); resolve(data.attempts as number); }
      };
      const onError = (e: any) => { w.removeEventListener('error', onError as any); reject(e); };
      w.addEventListener('message', onMessage);
      w.addEventListener('error', onError as any);
      w.postMessage(msg);
    });
  }
}
