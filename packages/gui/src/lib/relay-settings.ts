/**
 * Relay settings management with local persistence
 * Handles read/write preferences for individual relays
 */

import { createSignal } from 'solid-js';

export interface RelaySettings {
  url: string;
  read: boolean;
  write: boolean;
}

const STORAGE_KEY = 'notemine:relaySettings';

// Load saved settings from localStorage
function loadSettings(): Record<string, RelaySettings> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[RelaySettings] Error loading settings:', error);
  }
  return {};
}

// Save settings to localStorage
function saveSettings(settings: Record<string, RelaySettings>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('[RelaySettings] Error saving settings:', error);
  }
}

// Signal for reactive relay settings
const [relaySettings, setRelaySettings] = createSignal<Record<string, RelaySettings>>(
  loadSettings()
);

/**
 * Get settings for a specific relay
 * Returns default settings (read: true, write: true) if not configured
 */
export function getRelaySettings(url: string): RelaySettings {
  const settings = relaySettings();
  return settings[url] || { url, read: true, write: true };
}

/**
 * Get all relay settings
 */
export function getAllRelaySettings(): Record<string, RelaySettings> {
  return relaySettings();
}

/**
 * Update settings for a specific relay
 */
export function updateRelaySettings(url: string, read: boolean, write: boolean) {
  setRelaySettings((prev) => {
    const updated = {
      ...prev,
      [url]: { url, read, write },
    };
    saveSettings(updated);
    return updated;
  });
}

/**
 * Remove settings for a specific relay
 */
export function removeRelaySettings(url: string) {
  setRelaySettings((prev) => {
    const updated = { ...prev };
    delete updated[url];
    saveSettings(updated);
    return updated;
  });
}

/**
 * Initialize settings for a relay if not already configured
 * Returns the settings (existing or newly created)
 */
export function initializeRelaySettings(url: string): RelaySettings {
  const settings = relaySettings();
  if (!settings[url]) {
    updateRelaySettings(url, true, true);
  }
  return getRelaySettings(url);
}

/**
 * Get all relays configured for reading
 */
export function getReadRelays(): string[] {
  const settings = relaySettings();
  return Object.values(settings)
    .filter((s) => s.read)
    .map((s) => s.url);
}

/**
 * Get all relays configured for writing
 */
export function getWriteRelays(): string[] {
  const settings = relaySettings();
  return Object.values(settings)
    .filter((s) => s.write)
    .map((s) => s.url);
}
