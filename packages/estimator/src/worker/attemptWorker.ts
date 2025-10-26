let gPayload: any = null;
let gAttempt: ((payload: any, nonce: number) => any) | null = null;
let gInit: ((payload: any) => any) | null = null;

self.onmessage = async (ev: MessageEvent) => {
  const data = ev.data as any;
  if (!data || !data.cmd) return;
  if (data.cmd === 'init') {
    gPayload = data.payload;
    if (data.moduleUrl) {
      const mod: any = await import(data.moduleUrl);
      gAttempt = mod.attempt || null;
      gInit = mod.init || null;
      if (gInit) await gInit(gPayload);
    }
    (self as any).postMessage({ cmd: 'inited' });
    return;
  }
  if (data.cmd === 'start') {
    const durationMs: number = data.durationMs;
    const end = performance.now() + durationMs;
    let attempts = 0;
    let nonce = data.nonceBase || 0;
    const f = gAttempt;
    if (!f) {
      (self as any).postMessage({ cmd: 'done', attempts: 0 });
      return;
    }
    const batch = 1024;
    while (performance.now() < end) {
      for (let i = 0; i < batch; i++) { f(gPayload, nonce++); attempts++; }
    }
    (self as any).postMessage({ cmd: 'done', attempts });
  }
};
