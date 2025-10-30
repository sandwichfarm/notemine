/**
 * Image Deblur Cache
 *
 * Maintains a persistent cache of deblurred image URLs using SHA-1 hashing
 * for compact storage. Uses FIFO eviction when cache size limit is reached.
 */

const CACHE_STORAGE_KEY = 'notemine:deblur-cache';

interface DeblurCacheData {
  hashes: string[];
  maxSize: number;
}

/**
 * Hash a URL using SHA-1 for compact storage
 * Returns hex string (40 chars) instead of storing full URLs
 */
async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Load cache data from LocalStorage
 */
function loadCache(): DeblurCacheData {
  try {
    const stored = localStorage.getItem(CACHE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate structure
      if (Array.isArray(parsed.hashes) && typeof parsed.maxSize === 'number') {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Failed to load deblur cache, resetting:', error);
  }

  // Return default empty cache
  return { hashes: [], maxSize: 500 };
}

/**
 * Save cache data to LocalStorage
 */
function saveCache(data: DeblurCacheData): void {
  try {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save deblur cache:', error);
  }
}

/**
 * Check if an image URL has been deblurred
 */
export async function isImageDeblurred(url: string): Promise<boolean> {
  const cache = loadCache();
  const hash = await hashUrl(url);
  return cache.hashes.includes(hash);
}

/**
 * Mark an image URL as deblurred
 * Implements FIFO eviction when cache exceeds maxSize
 */
export async function markImageDeblurred(url: string): Promise<void> {
  const cache = loadCache();
  const hash = await hashUrl(url);

  // Check if already in cache
  if (cache.hashes.includes(hash)) {
    return; // Already cached, no need to add
  }

  // Add to end of queue
  cache.hashes.push(hash);

  // FIFO eviction: remove from front if over limit
  while (cache.hashes.length > cache.maxSize) {
    cache.hashes.shift(); // Remove oldest entry
  }

  saveCache(cache);
}

/**
 * Clear all deblurred image entries
 */
export function clearDeblurCache(): void {
  const cache = loadCache();
  cache.hashes = [];
  saveCache(cache);
}

/**
 * Update the maximum cache size
 * Trims existing entries if new size is smaller
 */
export function setDeblurCacheSize(newSize: number): void {
  const cache = loadCache();
  cache.maxSize = Math.max(1, Math.min(5000, newSize)); // Clamp to 1-5000

  // Trim if current cache exceeds new size
  if (cache.hashes.length > cache.maxSize) {
    cache.hashes = cache.hashes.slice(-cache.maxSize); // Keep most recent entries
  }

  saveCache(cache);
}

/**
 * Get current cache statistics
 */
export function getDeblurCacheStats(): { count: number; maxSize: number } {
  const cache = loadCache();
  return {
    count: cache.hashes.length,
    maxSize: cache.maxSize
  };
}
