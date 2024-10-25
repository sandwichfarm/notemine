import { writable } from "svelte/store";

export const contentState = writable({
  content: '',
  difficulty: 21,
  numberOfWorkers: navigator.hardwareConcurrency || 2
});