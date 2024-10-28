import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import rollupConfig from './rollup.config.js';

export default defineConfig({
  plugins: [svelte(), ...rollupConfig.plugins],
  resolve: {
    alias: {
      $lib: './src/lib',
      $stores: './src/lib/stores',
    },
  },
  build: {
    ...rollupConfig.output,
    rollupOptions: {
      ...rollupConfig,
    },
  },
});