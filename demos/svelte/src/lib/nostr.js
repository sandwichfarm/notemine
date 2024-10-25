import { SimplePool } from "nostr-tools";
import { get } from 'svelte/store';
import { finalizeEvent, verifyEvent } from "nostr-tools";
import { relaySettings, user, events, activeRelays, usub, miningState } from './stores/index';
import { verifyPow } from './utils.js';

let pubs;

export const pool = new SimplePool();

const timeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Timeout")), ms);
  promise
    .then(value => {
      clearTimeout(timer);
      resolve(value);
    })
    .catch(err => {
      clearTimeout(timer);
      reject(err);
    });
});

export const publishEvent = async (ev) => {
  //console.log(ev);
  const pow = verifyPow(ev);
  //console.log('Publishing event:', ev);
  try {
    const { isAnon, secret } = get(user);
    if (isAnon) {
      ev = finalizeEvent(ev, secret);
    } else {
      ev = await window.nostr.signEvent(ev);
    }
    const isGood = verifyEvent(ev);
    if (!isGood) throw new Error('Event is not valid');

    const currentActiveRelays = get(activeRelays);
    const pubs = pool.publish(currentActiveRelays, ev).map(p => timeout(p, 10000));

    const results = await Promise.allSettled(pubs);
    const successCount = results.filter(result => result.status === 'fulfilled').length;

    miningState.update( m => ({...m, publishSuccessNum: successCount}) )

    //console.log(`Event published successfully to ${successCount} relays.`);
  } catch (error) {
    console.error('Error publishing event:', error);
  }
};



function setMyRelays(relays) {
  //console.log(`Setting my relays: ${relays}`);
  relaySettings.update(r => ({
    ...r,
    myRelays: Array.from(new Set([...r.myRelays, ...relays]))
  }));
}

export function onK0(event){
  let profile
  try {
      profile = JSON.parse(event.content)
      let photo 
      if(profile?.photo) photo = profile.photo
      else if(profile?.picture) photo = profile.picture
      else if(profile?.avatar) photo = profile.avatar
      user.update( u => ({...u, photo, name: profile.name  }) )
  }
  catch(e){
      console.error('Error parsing K0 content:', e)
  }
  //console.log('K0 profile:', profile)
  events.update( e => ({...e, k0: event}) )
}

export function onK3(event){
  let relays = []
  try{
      relays = Object.keys(JSON.parse(event.content))
  }
  catch(e){
      console.error('Error parsing K3 content:', e)
      console.warn('K3 content:', event.content)
  }
  
  //console.log('K3 relays:', relays)
  setMyRelays(relays)
  events.update( e => ({...e, k3: event}) ) 
}

export function onK10002(event){
  const relays = event.tags.filter( t => t[0] === 'r' ).map( r => r[1] )
  //console.log('K10002 relays:', relays)
  setMyRelays(relays?.length? relays : [])
  events.update( e => ({...e, k10002: event}) ) 
}

export function onevent(event){ 
  switch(event.kind){
      case 0:     return onK0(event)
      case 3:     return onK3(event)
      case 10002: return onK10002(event)
  }
}

export function oneose(){ 
  try {
    const _usub = get(usub)
    _usub.close() 
  }
  catch(e){
      console.warn('Error closing subscription:', e)
  }   
}

export function onclose( resolve ){
  user.update( u => ({...u, isAnon: false}) )
  resolve()
}