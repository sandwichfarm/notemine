import { browser } from '$app/environment';
import { eventService } from '$lib/services/events';
import { relayDiscovery } from '$lib/services/relay-discovery';

export const prerender = false;
export const ssr = false;
export const csr = true;

export async function load() {
  if (browser) {
    // Initialize services
    await relayDiscovery.startDiscovery();
    await eventService.initialize();
  }
  
  return {};
}