/**
 * Local storage utilities for anonymous key persistence
 */

const STORAGE_KEY = 'notemine:anonKey';

/**
 * Save anonymous secret key to localStorage
 * @param secret - Uint8Array secret key
 */
export function saveAnonKey(secret: Uint8Array): void {
  try {
    // Convert Uint8Array to hex string for storage
    const hex = Array.from(secret)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem(STORAGE_KEY, hex);
  } catch (error) {
    console.error('[AnonStorage] Failed to save anon key:', error);
  }
}

/**
 * Load anonymous secret key from localStorage
 * @returns Uint8Array secret key or null if not found
 */
export function loadAnonKey(): Uint8Array | null {
  try {
    const hex = localStorage.getItem(STORAGE_KEY);
    if (!hex) return null;

    // Convert hex string back to Uint8Array
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  } catch (error) {
    console.error('[AnonStorage] Failed to load anon key:', error);
    return null;
  }
}

/**
 * Check if a persisted anonymous key exists
 * @returns true if key exists in storage
 */
export function hasPersistedAnonKey(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Clear persisted anonymous key from localStorage
 */
export function clearAnonKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('[AnonStorage] Failed to clear anon key:', error);
  }
}
