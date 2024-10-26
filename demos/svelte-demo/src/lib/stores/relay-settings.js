import { writable } from "svelte/store";

export const relaySettings = writable({
  myRelaysVisible: false,
  powRelaysEnabled: true,
  myRelays: []
});