import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3000,
    // In dev, aggressively disable HTTP caching to avoid stale modules/workers
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
      'Surrogate-Control': 'no-store',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  esbuild: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: [
      '@notemine/core',
      '@notemine/wrapper',
      '@tursodatabase/database-wasm',
      '@tursodatabase/database-common',
      '@tursodatabase/database-wasm-common',
      '@napi-rs/wasm-runtime',
      '@emnapi/core',
      '@emnapi/runtime',
      '@emnapi/wasi-threads',
      '@tybys/wasm-util',
      'applesauce-sqlite/turso-wasm',
    ],
    include: [
      'applesauce-core/event-store',
      'applesauce-core/helpers',
    ],
    esbuildOptions: {
      target: 'es2022',
    },
  },
  resolve: {
    dedupe: ['solid-js'],
    preserveSymlinks: true,
  },
});
