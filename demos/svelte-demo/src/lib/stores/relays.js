import { derived, readable, writable, get } from "svelte/store";
import { relaySettings } from "./relay-settings";
import { SimplePool } from 'nostr-tools'

export const powRelays = new writable([]);
export const usub = new writable(null)
export const activeRelays = derived(
  [relaySettings, powRelays],
  ([$relaySettings, $powRelays]) => {
    let relays = [];
    if ($relaySettings.myRelays && $relaySettings.myRelays.length > 0) {
      relays.push(...$relaySettings.myRelays);
    }
    if ($relaySettings.powRelaysEnabled) {
      relays.push(...$powRelays);
    }
    return relays;
  }
);

export const fetchNip66Relays = async () => {
  return new Promise( (resolve) => {
      const NIP66_RELAYS = [
          'wss://relay.nostr.watch',
          'wss://relaypag.es',
          'wss://monitorlizard.nostr1.com'
      ]
      const nip66pool = new SimplePool();
      const relays = new Set()
      let events = 0
      nip66pool.subscribeMany(
          NIP66_RELAYS,
          // [
            {
              since: Math.floor(Date.now()/1000)-24*60*60,
              kinds: [30166],
              "#R": [ "pow" ]
            },
          // ],
          {
              onevent(event) {
                  try {
                      const powTag = event.tags.find(t => t[0] === 'R' && t[1].includes('pow'))
                      const ispow = (powTag[1] === 'pow' && !powTag?.[2]) || (powTag[1] === 'pow' && powTag?.[2] > 0)
                      if(!ispow) return;
                      const relayUrl = new URL(event.tags.find( t => t[0] === 'd')?.[1]).toString()
                      if(relays.has(relayUrl)) return;
                      relays.add(relayUrl)
                      console.log(events++, relayUrl)
                  }
                  catch(e){}
              },
              oneose(){
                  powRelays.update( $powRelays => $powRelays = Array.from(relays) )
                  resolve(get(powRelays))
              }
          }
      );
  });
}
