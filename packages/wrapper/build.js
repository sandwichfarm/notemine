import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import getPort from 'get-port';
import esbuild from 'esbuild';
import { clean } from 'esbuild-plugin-clean';
import esbuildPluginTsc from 'esbuild-plugin-tsc';
import inlineWorkerPlugin from 'esbuild-plugin-inline-worker';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';
import { wasmLoader } from 'esbuild-plugin-wasm';
import copy from 'esbuild-plugin-copy';
import { minify } from 'terser';

import { handleWasmUrl } from './handleWasmUrl.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const production = process.env.NODE_ENV === 'production';

export async function buildWithWatch() {
  await fs.mkdir(path.resolve(__dirname, 'dist'), { recursive: true });
  const watch = !production;
  const livereloadPort = await getPort({ port: 53100 });

  const workerBuildOptions = {
    entryPoints: ['src/mine.worker.ts'],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['esnext'],
    minify: true,
    plugins: [
      handleWasmUrl,
      wasmLoader(),
    ],
    loader: {
      '.ts': 'ts',
      '.js': 'js',
      '.wasm': 'file',
    },
    define: {
      'import.meta.url': 'self.location.href',
    },
    outdir: 'dist',
    write: true,
  };

  let workerResult;
  try {
    workerResult = await esbuild.build(workerBuildOptions);
  } catch (error) {
    console.error('Worker build failed:', error);
    process.exit(1);
  }

  if (!workerResult || workerResult.errors?.length > 0) {
    console.error('Worker build output is missing or contains errors.');
    process.exit(1);
  }

  const workerFilePath = path.resolve(__dirname, 'dist', 'mine.worker.js');
  const workerCode = await fs.readFile(workerFilePath, 'utf8');
  const minifiedWorkerCode = await minify(workerCode);

  if (minifiedWorkerCode.error) {
    console.error('Terser minification failed:', minifiedWorkerCode.error);
    process.exit(1);
  }

  await fs.writeFile(workerFilePath, minifiedWorkerCode.code);

  const distPath = path.resolve(__dirname, 'dist');
  await fs.mkdir(distPath, { recursive: true });

  const mainBuildOptions = {
    entryPoints: ['src/index.ts'],
    outdir: 'dist',
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: ['esnext'],
    sourcemap: !production,
    minify: production,
    plugins: [
      esbuildPluginTsc({
        force: true,
      }),
      handleWasmUrl,
      inlineWorkerPlugin({
        entryPoints: ['dist/mine.worker.js'],
        minify: true,
        target: 'esnext',
        format: 'iife',
      }),
      polyfillNode({
        polyfills: {
          fs: false,
          path: false,
          util: true,
          assert: true,
          stream: true,
          os: true,
        },
      }),
      copy({
        assets: {
          from: '../node_modules/@notemine/core/notemine_bg.wasm',
          to: 'dist',
        },
      }),
    ].filter(Boolean),
    loader: {
      '.ts': 'ts',
      '.js': 'js',
      '.wasm': 'file',
    },
    define: {
      'import.meta.url': 'self.location.href',
    },
  };

  try {
    if (watch) {
      const mainContext = await esbuild.context(mainBuildOptions);
      await mainContext.watch();
    } else {
      await esbuild.build(mainBuildOptions);
    }
  } catch (error) {
    console.error('Main build failed:', error);
    process.exit(1);
  }
}

buildWithWatch();
