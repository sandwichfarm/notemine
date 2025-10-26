import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 3000,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['@notemine/core', '@notemine/wrapper'],
    esbuildOptions: {
      target: 'es2022',
    },
  },
  resolve: {
    dedupe: ['solid-js'],
    preserveSymlinks: true,
  },
});
