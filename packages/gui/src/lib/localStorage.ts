import { createSignal, Accessor, Setter } from 'solid-js';

/**
 * Generic localStorage utility with reactive stores
 * Automatically syncs with localStorage and provides reactive signals
 */
export function createLocalStore<T>(
  key: string,
  defaultValue: T
): [Accessor<T>, Setter<T>] {
  // Try to load from localStorage
  const stored = localStorage.getItem(key);
  const initialValue = stored ? JSON.parse(stored) : defaultValue;

  // Create reactive signal
  const [value, setValue] = createSignal<T>(initialValue);

  // Wrapper setter that syncs to localStorage
  const setValueAndStore: Setter<T> = (newValue) => {
    setValue(newValue);
    const valueToStore = typeof newValue === 'function'
      ? (newValue as (prev: T) => T)(value())
      : newValue;
    localStorage.setItem(key, JSON.stringify(valueToStore));
    return valueToStore;
  };

  return [value, setValueAndStore];
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
