import { defineConfig } from 'vitest/config';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [wasm()],
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: true,
    reporters: 'default',
  },
});

