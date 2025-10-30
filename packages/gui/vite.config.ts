import { defineConfig, loadEnv } from 'vite';
import solid from 'vite-plugin-solid';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Load env files from the gui package directory, not monorepo root
  const env = loadEnv(mode, __dirname, '');
  const enableCOI = env.VITE_ENABLE_COI === '1';

  // Base headers for cache control
  const baseHeaders = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  };

  // Add COI headers if enabled
  const coiHeaders = enableCOI
    ? {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      }
    : {};

  return {
    plugins: [solid()],
    server: {
      host: '0.0.0.0', // Expose to network
      port: 3000,
      headers: {
        ...baseHeaders,
        ...coiHeaders,
      },
    },
    preview: {
      headers: {
        ...baseHeaders,
        ...coiHeaders,
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
  };
});
