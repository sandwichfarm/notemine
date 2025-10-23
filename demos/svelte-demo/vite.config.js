import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import rollupConfig from './rollup.config.js';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    svelte(), 
    ...rollupConfig.plugins,
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      compressionOptions: {
        level: 6,
      },
      filter: /\.(js|css|html|svg|json)$/i,
      threshold: 1024
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
      compressionOptions: {
        level: 11,
      },
      filter: /\.(js|css|html|svg|json)$/i,
      threshold: 1024
    })

  ],
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