import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from 'rollup-plugin-typescript2';
import wasm from '@rollup/plugin-wasm';
import postcss from 'rollup-plugin-postcss';
import { terser } from 'rollup-plugin-terser';
import { sveltePreprocess } from 'svelte-preprocess';
import livereload from 'rollup-plugin-livereload';
import { spawn } from 'child_process';
import copy from 'rollup-plugin-copy'
import alias from '@rollup/plugin-alias';


const production = !process.env.ROLLUP_WATCH;

function serve() {
  let server;

  function toExit() {
    if (server) server.kill(0);
  }

  return {
    writeBundle() {
      if (server) return;
      server = spawn('yarn', ['start', '--', '--dev'], {
        stdio: ['ignore', 'inherit', 'inherit'],
        shell: true,
      });

      process.on('SIGTERM', toExit);
      process.on('exit', toExit);
    }
  };
}

export default {
  input: 'src/main.js',
  output: {
    sourcemap: true,
    format: 'iife',  // IIFE format works well in the browser context
    name: 'app',
    file: 'public/build/bundle.js',
  },
  plugins: [
    svelte({
      compilerOptions: {
        dev: !production,
      },
      preprocess: sveltePreprocess(),
    }),

    resolve({
      browser: true,
      dedupe: ['svelte'],
    }),

    commonjs({
      include: 'node_modules/**',  // Ensure CommonJS modules are properly handled
      sourceMap: !production,
    }),

    copy({
      targets: [
        { src: 'node_modules/@notemine/wrapper/dist/notemine_bg.wasm', dest: 'public/build' }
      ]
    }),

    // typescript({ 
    //   include: ['src/**/*', 'node_modules/@notemine/wrapper/dist/**/*'], 
    // }),

    wasm(), // Handle WASM files

    // Add PostCSS for CSS handling
    postcss({
      extract: true,
    }),

    // Auto-reload in development mode
    !production && serve(),
    !production && livereload('public'),

    // Minify for production
    production && terser(),
  ],

  watch: {
    clearScreen: false,
  },
};
