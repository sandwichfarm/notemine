/**
 * Vitest setup file for global test configuration
 */

import { beforeEach, vi } from 'vitest';
import { TextDecoder, TextEncoder } from 'util';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => {
      // Return the value if it exists, even if it's an empty string
      return key in store ? store[key] : null;
    },
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

// Define localStorage on global object
(globalThis as any).localStorage = localStorageMock as Storage;

// Polyfill TextEncoder/TextDecoder for libraries that expect Node globals
if (!(globalThis as any).TextEncoder) {
  (globalThis as any).TextEncoder = TextEncoder;
}
if (!(globalThis as any).TextDecoder) {
  (globalThis as any).TextDecoder = TextDecoder;
}

// Mock window.nostr for NIP-07 tests
(globalThis as any).window = {
  ...(globalThis as any).window,
  nostr: undefined,
};

// Reset mocks and storage before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  (globalThis as any).window.nostr = undefined;
});
