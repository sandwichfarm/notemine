import { derived, readable, writable } from "svelte/store";
import { relaySettings } from "./relay-settings";

const POW_RELAYS = [
  'wss://nostr.bitcoiner.social',
  'wss://nostr.mom',
  'wss://nos.lol',
  'wss://powrelay.xyz',
  'wss://labour.fiatjaf.com/',
  'wss://nostr.lu.ke',
  'wss://140.f7z.io'
]

export const usub = new writable(null)

export const activeRelays = derived(
  relaySettings,
  ($relaySettings) => {
    let relays = [];
    if ($relaySettings.myRelays && $relaySettings.myRelays.length > 0) {
      relays.push(...$relaySettings.myRelays);
    }
    if ($relaySettings.powRelaysEnabled) {
      relays.push(...POW_RELAYS);
    }
    return relays;
  }
);

export const powRelays = new readable(POW_RELAYS);