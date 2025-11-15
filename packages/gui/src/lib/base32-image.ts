import { base32 } from '@scure/base';

const DATA_URL_BASE32_REGEX = /^data:([^;]+);base32,(.+)$/i;
const DATA_URL_BASE64_REGEX = /^data:([^;]+);base64,(.+)$/i;
const DEFAULT_MIME_TYPE = 'application/octet-stream';
const MAX_IMAGE_DIMENSION = 128;

const chunkedStringFromBytes = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return binary;
};

export interface EncodedImagePayload {
  base32DataUrl: string;
  mimeType: string;
  previewDataUrl: string;
}

export const arrayBufferToBytes = (buffer: ArrayBuffer): Uint8Array =>
  new Uint8Array(buffer);

const getGlobalBuffer = (): { from: (input: string, encoding: string) => any } | undefined => {
  if (typeof globalThis === 'undefined') return undefined;
  const bufferCtor = (globalThis as any).Buffer;
  if (typeof bufferCtor?.from === 'function') {
    return bufferCtor;
  }
  return undefined;
};

const decodeBase64 = (value: string): Uint8Array => {
  if (typeof atob === 'function') {
    const binary = atob(value);
    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      result[i] = binary.charCodeAt(i);
    }
    return result;
  }
  const BufferCtor = getGlobalBuffer();
  if (BufferCtor) {
    const buffer = BufferCtor.from(value, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  throw new Error('Base64 decoding is not supported in this environment');
};

const hasDomSupport = () => typeof document !== 'undefined' && typeof window !== 'undefined';

const toBlobPart = (bytes: Uint8Array): ArrayBuffer => {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

const loadImageFromBytes = (bytes: Uint8Array, mimeType: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    if (!hasDomSupport() || typeof Image === 'undefined' || typeof URL === 'undefined') {
      reject(new Error('Image APIs unavailable'));
      return;
    }

    const blob = new Blob([toBlobPart(bytes)], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = (event) => {
      URL.revokeObjectURL(objectUrl);
      reject(event instanceof ErrorEvent ? event.error ?? event : event);
    };
    image.src = objectUrl;
  });
};

const resizeImageBytes = async (
  bytes: Uint8Array,
  mimeType: string,
  maxDimension: number
): Promise<{ bytes: Uint8Array; mimeType: string }> => {
  if (!hasDomSupport() || !mimeType.startsWith('image/')) {
    return { bytes, mimeType };
  }

  try {
    const image = await loadImageFromBytes(bytes, mimeType);
    const largestSide = Math.max(image.width, image.height);
    if (!largestSide || largestSide <= maxDimension) {
      return { bytes, mimeType };
    }

    const scale = maxDimension / largestSide;
    const targetWidth = Math.max(1, Math.round(image.width * scale));
    const targetHeight = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return { bytes, mimeType };
    }
    context.drawImage(image, 0, 0, targetWidth, targetHeight);
    const exportMime = mimeType.startsWith('image/') ? mimeType : 'image/png';
    const dataUrl = canvas.toDataURL(exportMime);
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) {
      return { bytes, mimeType };
    }
    const resizedBytes =
      parsed.encoding === 'base64' ? decodeBase64(parsed.encoded) : base32.decode(parsed.encoded);
    return {
      bytes: resizedBytes,
      mimeType: parsed.mimeType,
    };
  } catch {
    return { bytes, mimeType };
  }
};

const parseDataUrl = (
  value: string
): { mimeType: string; encoded: string; encoding: 'base32' | 'base64' } | null => {
  if (!value) return null;
  const base32Match = DATA_URL_BASE32_REGEX.exec(value);
  if (base32Match) {
    return {
      mimeType: base32Match[1] || DEFAULT_MIME_TYPE,
      encoded: base32Match[2],
      encoding: 'base32',
    };
  }
  const base64Match = DATA_URL_BASE64_REGEX.exec(value);
  if (base64Match) {
    return {
      mimeType: base64Match[1] || DEFAULT_MIME_TYPE,
      encoded: base64Match[2],
      encoding: 'base64',
    };
  }
  return {
    mimeType: DEFAULT_MIME_TYPE,
    encoded: value,
    encoding: 'base32',
  };
};

export const encodeBytesToBase32DataUrl = (bytes: Uint8Array, mimeType: string): string => {
  const encoded = base32.encode(bytes);
  return `data:${mimeType};base32,${encoded}`;
};

export const encodeFileToBase32DataUrl = async (file: File): Promise<EncodedImagePayload> => {
  const buffer = await file.arrayBuffer();
  const bytes = arrayBufferToBytes(buffer);
  const mimeType = file.type || DEFAULT_MIME_TYPE;
  const resized = await resizeImageBytes(bytes, mimeType, MAX_IMAGE_DIMENSION);
  return {
    base32DataUrl: encodeBytesToBase32DataUrl(resized.bytes, resized.mimeType),
    mimeType: resized.mimeType,
    previewDataUrl: bytesToBase64DataUrl(resized.bytes, resized.mimeType),
  };
};

export const ensureBase32DataUrl = (
  value: string,
  mimeType: string = DEFAULT_MIME_TYPE
): string => {
  const parsed = parseDataUrl(value);
  if (!parsed) return value;
  if (parsed.encoding === 'base32' && DATA_URL_BASE32_REGEX.test(value)) {
    return value;
  }
  const targetMime = parsed.mimeType || mimeType;
  if (parsed.encoding === 'base32') {
    return `data:${targetMime};base32,${parsed.encoded}`;
  }
  const bytes = decodeBase64(parsed.encoded);
  return encodeBytesToBase32DataUrl(bytes, targetMime);
};

export const base32DataUrlToBytes = (
  dataUrl: string
): { mimeType: string; bytes: Uint8Array } | null => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  try {
    const bytes =
      parsed.encoding === 'base64' ? decodeBase64(parsed.encoded) : base32.decode(parsed.encoded);
    return {
      mimeType: parsed.mimeType,
      bytes,
    };
  } catch {
    return null;
  }
};

export const bytesToBase64DataUrl = (bytes: Uint8Array, mimeType: string): string => {
  const binary = chunkedStringFromBytes(bytes);
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
};

export const base32DataUrlToBase64 = (dataUrl: string): string | null => {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;
  if (parsed.encoding === 'base64') {
    return `data:${parsed.mimeType};base64,${parsed.encoded}`;
  }
  const bytes = base32.decode(parsed.encoded);
  return bytesToBase64DataUrl(bytes, parsed.mimeType);
};

export const sanitizeText = (value?: string): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};
