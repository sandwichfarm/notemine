export type AlgorithmId = 'sha256';
export type CpuSignature = string;

export type Calibration = {
  a: number;
  b: number;
  c: number;
  eff: Record<number, number>;
  algo: AlgorithmId;
  cpu: CpuSignature;
  at: number;
  version: number;
};

export type BuildPayloadFn = (content: Uint8Array, tags: string[]) => any;
export type AttemptFn = (payload: any, nonce: number) => void | Uint8Array;

export type CalibrateOptions = {
  algo?: AlgorithmId;
  cpu: CpuSignature;
  sizes?: number[];
  tagSets?: number[];
  threadsToTest?: number[];
  warmupMs?: number;
  probe1tMs?: number;
  probeMtMs?: number;
  buildPayload: BuildPayloadFn;
  attempt?: AttemptFn;
  workerScriptUrl?: string;
  attemptModuleUrl?: string;
};

export type EstimateParams = {
  bytes: number;
  tags: number;
  bits?: number;
  attemptsFn?: (p: { bits?: number }) => number;
  threads: number;
  cal: Calibration;
};

export type EstimateResult = {
  timeSec: number;
  rateHps: number;
  details: { t1: number; E: number; attempts: number };
};

export type WebPersistence = {
  load: (key: string) => Promise<Calibration | null>;
  save: (key: string, cal: Calibration) => Promise<void>;
};
