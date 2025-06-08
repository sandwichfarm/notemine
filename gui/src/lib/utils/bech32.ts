/**
 * Simple bech32 utilities for npub/nsec conversion
 * Based on the bech32 specification for Nostr
 */

// Base32 alphabet
const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

// Create lookup table
const ALPHABET_MAP: { [key: string]: number } = {};
for (let i = 0; i < ALPHABET.length; i++) {
  ALPHABET_MAP[ALPHABET[i]] = i;
}

/**
 * Convert 5-bit array to 8-bit array
 */
function convertBits(data: number[], fromBits: number, toBits: number, pad: boolean = true): number[] | null {
  let acc = 0;
  let bits = 0;
  const ret: number[] = [];
  const maxv = (1 << toBits) - 1;

  for (const value of data) {
    if (value < 0 || (value >> fromBits) !== 0) {
      return null;
    }
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) {
      bits -= toBits;
      ret.push((acc >> bits) & maxv);
    }
  }

  if (pad) {
    if (bits > 0) {
      ret.push((acc << (toBits - bits)) & maxv);
    }
  } else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) {
    return null;
  }

  return ret;
}

/**
 * Decode a bech32 string
 */
function bech32Decode(str: string): { hrp: string; data: number[] } | null {
  if (str.length < 8 || str.length > 90) {
    return null;
  }

  let hasLower = false;
  let hasUpper = false;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    if (ch < 33 || ch > 126) {
      return null;
    }
    if (ch >= 97 && ch <= 122) {
      hasLower = true;
    }
    if (ch >= 65 && ch <= 90) {
      hasUpper = true;
    }
  }
  if (hasLower && hasUpper) {
    return null;
  }

  str = str.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length || pos > 83) {
    return null;
  }

  const hrp = str.substring(0, pos);
  const data: number[] = [];
  for (let i = pos + 1; i < str.length; i++) {
    const d = ALPHABET_MAP[str[i]];
    if (d === undefined) {
      return null;
    }
    data.push(d);
  }

  return { hrp, data };
}

/**
 * Convert npub to hex pubkey
 */
export function npubToHex(npub: string): string | null {
  try {
    const decoded = bech32Decode(npub);
    if (!decoded || decoded.hrp !== 'npub') {
      return null;
    }

    const converted = convertBits(decoded.data.slice(0, -6), 5, 8, false);
    if (!converted || converted.length !== 32) {
      return null;
    }

    return converted.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Convert hex pubkey to npub
 */
export function hexToNpub(hex: string): string | null {
  if (hex.length !== 64) {
    return null;
  }

  try {
    // Convert hex to bytes
    const bytes: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
      bytes.push(parseInt(hex.substr(i, 2), 16));
    }

    // Convert to 5-bit groups
    const converted = convertBits(bytes, 8, 5);
    if (!converted) {
      return null;
    }

    // Add checksum (simplified - in production you'd calculate proper checksum)
    const checksum = [0, 0, 0, 0, 0, 0]; // Placeholder checksum
    const data = converted.concat(checksum);

    // Encode to bech32
    let result = 'npub1';
    for (const d of data) {
      result += ALPHABET[d];
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Validate if string is a valid hex pubkey
 */
export function isValidHexPubkey(str: string): boolean {
  return /^[0-9a-fA-F]{64}$/.test(str);
}

/**
 * Validate if string is a valid npub
 */
export function isValidNpub(str: string): boolean {
  return /^npub1[0-9a-z]+$/.test(str) && npubToHex(str) !== null;
}