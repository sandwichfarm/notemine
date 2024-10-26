import { writable } from "svelte/store";

export const miningState = writable({
  mining: false,
  result: 'Waiting for worker to initialize...',
  relayStatus: '',
  hashRate: 0, 
  overallBestPow: null, 
  workersBestPow: [],
  publishSuccessNum: 0,
});