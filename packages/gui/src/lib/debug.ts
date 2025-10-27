/**
 * Debug logging utility that respects user preferences
 *
 * Usage:
 *   import { debug } from '../lib/debug';
 *   debug('[Component] Message', data);
 */

// Global debug state - will be updated by the app when preferences load
let debugEnabled = false;

/**
 * Set the global debug state
 * This should be called from the PreferencesProvider or App.tsx
 */
export function setDebugEnabled(enabled: boolean): void {
  debugEnabled = enabled;
}

/**
 * Get the current debug state
 */
export function isDebugEnabled(): boolean {
  return debugEnabled;
}

/**
 * Debug logger that only logs when debug mode is enabled
 */
export function debug(...args: any[]): void {
  if (debugEnabled) {
    console.log(...args);
  }
}

/**
 * Debug warn that only logs when debug mode is enabled
 */
export function debugWarn(...args: any[]): void {
  if (debugEnabled) {
    console.warn(...args);
  }
}

/**
 * Debug error that only logs when debug mode is enabled
 */
export function debugError(...args: any[]): void {
  if (debugEnabled) {
    console.error(...args);
  }
}
