import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('core:cargo', () => {
  it('runs cargo test successfully', () => {
    const cwd = resolve(__dirname, '..');
    let res;
    try {
      res = spawnSync('cargo', ['test', '--quiet'], {
        cwd,
        encoding: 'utf8',
      });
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        // Cargo not available in this environment; skip instead of failing vitest
        console.warn('[core:cargo] cargo not found on PATH; skipping cargo tests');
        expect(true).toBe(true);
        return;
      }
      throw err;
    }

    if (res.status !== 0) {
      // Show stderr/stdout for debugging
      console.error('[core:cargo] cargo test failed');
      if (res.stdout) console.error('stdout:\n' + res.stdout);
      if (res.stderr) console.error('stderr:\n' + res.stderr);
    }

    expect(res.status).toBe(0);
  });
});

