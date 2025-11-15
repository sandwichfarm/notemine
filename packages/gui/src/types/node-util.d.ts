declare module 'util' {
  const TextEncoder: typeof globalThis.TextEncoder;
  const TextDecoder: typeof globalThis.TextDecoder;
  export { TextEncoder, TextDecoder };
}
