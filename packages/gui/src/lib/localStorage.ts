import { createSignal, Accessor, Setter } from 'solid-js';

export interface LocalStoreOptions {
  /**
   * Lazy mode: Keep state in-memory only during updates
   * Only write to localStorage when flush() is called
   * Default: false (immediate sync to localStorage)
   */
  lazy?: boolean;
}

export interface LazyLocalStore<T> {
  value: Accessor<T>;
  setValue: Setter<T>;
  /**
   * Manually flush in-memory state to localStorage
   * Only available in lazy mode
   */
  flush: () => void;
}

/**
 * Generic localStorage utility with reactive stores
 * Automatically syncs with localStorage and provides reactive signals
 *
 * @param key - localStorage key
 * @param defaultValue - default value if key doesn't exist
 * @param options - configuration options
 * @returns [value accessor, setter] or { value, setValue, flush } in lazy mode
 */
// Overload signatures for better type inference
export function createLocalStore<T>(
  key: string,
  defaultValue: T,
  options: LocalStoreOptions & { lazy: true }
): LazyLocalStore<T>;
export function createLocalStore<T>(
  key: string,
  defaultValue: T,
  options?: LocalStoreOptions & { lazy?: false }
): [Accessor<T>, Setter<T>];
export function createLocalStore<T>(
  key: string,
  defaultValue: T,
  options?: LocalStoreOptions
): [Accessor<T>, Setter<T>] | LazyLocalStore<T> {
  // Try to load from localStorage
  const stored = localStorage.getItem(key);
  const initialValue = stored ? JSON.parse(stored) : defaultValue;

  // Create reactive signal
  const [value, setValue] = createSignal<T>(initialValue);

  const lazy = options?.lazy ?? false;

  if (lazy) {
    // Lazy mode: in-memory only, manual flush
    const setValueInMemory = ((next: T | ((prev: T) => T)) => {
      return setValue((prev) => {
        const resolvedValue =
          typeof next === 'function'
            ? (next as (prev: T) => T)(prev)
            : next;
        return resolvedValue;
      });
    }) as Setter<T>;

    const flush = () => {
      try {
        localStorage.setItem(key, JSON.stringify(value()));
      } catch (err) {
        console.error(`[localStorage] Failed to flush ${key}:`, err);
      }
    };

    return { value, setValue: setValueInMemory, flush };
  } else {
    // Normal mode: sync to localStorage on every update
    const setValueAndStore = ((next: T | ((prev: T) => T)) => {
      return setValue((prev) => {
        const resolvedValue =
          typeof next === 'function'
            ? (next as (prev: T) => T)(prev)
            : next;

        localStorage.setItem(key, JSON.stringify(resolvedValue));
        return resolvedValue;
      });
    }) as Setter<T>;

    return [value, setValueAndStore];
  }
}

/**
 * Remove an item from localStorage
 */
export function removeFromStorage(key: string): void {
  localStorage.removeItem(key);
}

/**
 * Clear all items from localStorage
 */
export function clearStorage(): void {
  localStorage.clear();
}

/**
 * Get a value from localStorage without reactivity
 */
export function getStorageItem<T>(key: string, defaultValue: T): T {
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : defaultValue;
}

/**
 * Set a value in localStorage without reactivity
 */
export function setStorageItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}
