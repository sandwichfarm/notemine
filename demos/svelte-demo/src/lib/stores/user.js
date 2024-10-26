import { writable } from "svelte/store";

export const user = writable({
  isAnon: true,
  pubkey: '',
  secret: ''
});

export const profile = writable({
  name: '',
  photo: ''
});

export const events = writable({
  k0: {},
  k3: {},
  k10002: {}
});