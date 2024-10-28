import path from 'path';
import { fileURLToPath } from 'url';
import typescript from 'rollup-plugin-typescript2';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
import copy from 'rollup-plugin-copy';
import wasm from '@rollup/plugin-wasm';
import { terser } from 'rollup-plugin-terser';
import livereload from 'rollup-plugin-livereload';
import webWorkerLoader from 'rollup-plugin-web-worker-loader';

const production = !process.env.ROLLUP_WATCH;

// Fix path resolution for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basePlugins = [
  resolve({
    extensions: ['.ts', '.js', '.json', '.wasm'],
    browser: true,
    preferBuiltins: false,
  }),
  replace({
    'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
    preventAssignment: true,
  }),
  typescript({
    tsconfig: './tsconfig.json',
    clean: true,
  }),
  commonjs(),
  wasm(),
  copy({
    targets: [{ src: 'src/wasm/*', dest: 'dist/wasm' }],
  }),
  terser(),
  livereload('dist'),
  webWorkerLoader({
    inline: true,
    targetPlatform: 'browser',
    extensions: ['.ts'],
  })
];

export default [
  {
    input: './src/index.ts',
    output: {
      dir: './dist',
      format: 'esm',
      sourcemap: true,
      entryFileNames: 'index.esm.js',
    },
    external: ['rxjs', 'nostr-tools', 'wasm/notemine.js'],
    plugins: basePlugins,
    watch: {
      exclude: 'node_modules/**',
      clearScreen: false,
    },
  },
];
