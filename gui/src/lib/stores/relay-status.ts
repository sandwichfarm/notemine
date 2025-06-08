import { writable } from 'svelte/store';

export type RelayState = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface RelayStatus {
  url: string;
  state: RelayState;
  lastError?: string;
  lastConnected?: number;
  messagesSent?: number;
  messagesReceived?: number;
  // Performance metrics
  avgResponseTime?: number;
  totalRequests?: number;
  successfulRequests?: number;
  failedRequests?: number;
  uptime?: number; // Percentage
  lastResponseTime?: number;
}

export const relayStatuses = writable<Map<string, RelayStatus>>(new Map());

export function updateRelayStatus(url: string, updates: Partial<RelayStatus>) {
  relayStatuses.update(statuses => {
    const current = statuses.get(url) || { url, state: 'disconnected' };
    statuses.set(url, { ...current, ...updates });
    return new Map(statuses);
  });
}

export function getRelayStatus(url: string): RelayStatus | undefined {
  let status: RelayStatus | undefined;
  relayStatuses.subscribe(statuses => {
    status = statuses.get(url);
  })();
  return status;
}