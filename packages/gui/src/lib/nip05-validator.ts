import { createResource, Accessor } from 'solid-js';

export interface Nip05ValidationResult {
  valid: boolean;
  loading: boolean;
  error?: string;
}

// Cache for validated NIP-05 identifiers
// Key format: "nip05@pubkey"
const validationCache = new Map<string, { result: boolean; timestamp: number }>();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Validates a NIP-05 identifier against the pubkey
 * According to NIP-05 specification: https://github.com/nostr-protocol/nips/blob/master/05.md
 */
export async function validateNip05(
  nip05: string,
  pubkey: string
): Promise<boolean> {
  if (!nip05 || !pubkey) {
    return false;
  }

  // Check cache first
  const cacheKey = `${nip05}@${pubkey}`;
  const cached = validationCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.result;
  }

  try {
    // Parse NIP-05 identifier
    let name: string;
    let domain: string;

    if (nip05.includes('@')) {
      [name, domain] = nip05.split('@');
    } else {
      // If no @ symbol, treat as domain with name "_"
      name = '_';
      domain = nip05;
    }

    // Construct the .well-known URL
    const url = `https://${domain}/.well-known/nostr.json?name=${encodeURIComponent(name)}`;

    // Fetch with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      validationCache.set(cacheKey, { result: false, timestamp: Date.now() });
      return false;
    }

    const json = await response.json();

    // Check if the response contains the pubkey under the name
    const isValid =
      json.names &&
      typeof json.names === 'object' &&
      json.names[name] === pubkey;

    // Cache the result
    validationCache.set(cacheKey, { result: isValid, timestamp: Date.now() });

    return isValid;
  } catch (error) {
    console.error('NIP-05 validation error:', error);
    // Cache negative result to avoid repeated failures
    validationCache.set(cacheKey, { result: false, timestamp: Date.now() });
    return false;
  }
}

/**
 * SolidJS hook for reactive NIP-05 validation
 * Usage: const validation = useNip05Validation(() => nip05, () => pubkey)
 */
export function useNip05Validation(
  nip05: Accessor<string | undefined>,
  pubkey: Accessor<string | undefined>
): Accessor<Nip05ValidationResult> {
  const [validationResult] = createResource(
    () => {
      const n = nip05();
      const p = pubkey();
      if (!n || !p) return null;
      return { nip05: n, pubkey: p };
    },
    async (params) => {
      if (!params) return { valid: false, loading: false };

      try {
        const valid = await validateNip05(params.nip05, params.pubkey);
        return { valid, loading: false };
      } catch (error) {
        return {
          valid: false,
          loading: false,
          error: error instanceof Error ? error.message : 'Validation failed',
        };
      }
    }
  );

  return () => {
    if (validationResult.loading) {
      return { valid: false, loading: true };
    }

    return (
      validationResult() || { valid: false, loading: false, error: undefined }
    );
  };
}

/**
 * Clear the validation cache (useful for testing or manual refresh)
 */
export function clearNip05Cache(): void {
  validationCache.clear();
}
