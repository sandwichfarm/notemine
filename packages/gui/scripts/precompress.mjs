#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const INCLUDE_RE = /\.(js|mjs|css|html|svg|json|wasm)$/i;

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

async function compressFileStream(srcPath, algo) {
  const outExt = algo === 'gzip' ? '.gz' : '.br';
  const dstPath = srcPath + outExt;
  if (fs.existsSync(dstPath)) return { skipped: true, dstPath };

  const read = fs.createReadStream(srcPath);
  const write = fs.createWriteStream(dstPath);
  const stream = algo === 'gzip'
    ? zlib.createGzip({ level: 9 })
    : zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });

  await pipeline(read, stream, write);
  return { skipped: false, dstPath };
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error(`[precompress] Dist directory not found: ${DIST_DIR}`);
    process.exit(1);
  }

  const files = Array.from(walk(DIST_DIR))
    .filter(f => INCLUDE_RE.test(f) && !f.endsWith('.gz') && !f.endsWith('.br'));

  let total = 0, gz = 0, br = 0;
  for (const file of files) {
    total++;
    try {
      const r1 = await compressFileStream(file, 'gzip');
      if (!r1.skipped) gz++;
      const r2 = await compressFileStream(file, 'br');
      if (!r2.skipped) br++;
      process.stdout.write(`.`);
    } catch (e) {
      console.error(`\n[precompress] Failed for ${file}:`, e?.message || e);
    }
  }
  console.log(`\n[precompress] Done. Processed: ${total}, new .gz: ${gz}, new .br: ${br}`);
}

main().catch(err => {
  console.error('[precompress] Fatal error:', err);
  process.exit(1);
});

