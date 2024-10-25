import fs from 'fs';
import path from 'path';
import esbuild from 'esbuild';
import { fileURLToPath } from 'url';

// Define __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgDir = path.resolve(__dirname, '../pkg');
const wasmPath = path.join(pkgDir, 'notemine_bg.wasm');
const wasmBase64Path = path.join(pkgDir, 'wasmBase64.js');
const initWasmSrcPath = path.join(pkgDir, 'initWasm.js');
const initWasmBundlePath = path.join(pkgDir, 'initWasm.bundle.js');
const packageJsonPath = path.join(pkgDir, 'package.json');

function encodeWasmToBase64(wasmFilePath) {
  const wasmBuffer = fs.readFileSync(wasmFilePath);
  return wasmBuffer.toString('base64');
}

function generateWasmBase64Module(base64Wasm) {
  const wasmModuleContent = `// wasmBase64.js
export const wasmBase64 = "${base64Wasm}";
`;
  fs.writeFileSync(wasmBase64Path, wasmModuleContent, 'utf8');
}

function generateInitWasmModule() {
  const initWasmContent = `// initWasm.js
import { wasmBase64 } from './wasmBase64.js';

export async function initWasm() {
  try {
    // Decode Base64 to Uint8Array
    const wasmBinary = Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0));
    
    // Instantiate the WASM module
    const result = await WebAssembly.instantiate(wasmBinary.buffer, {});
    
    return result.instance;
  } catch (error) {
    console.error('WASM Instantiation Failed:', error);
    throw error;
  }
}
`;
  fs.writeFileSync(initWasmSrcPath, initWasmContent, 'utf8');
}

async function bundleInitWasm() {
  await esbuild.build({
    entryPoints: [initWasmSrcPath],
    bundle: true,
    outfile: initWasmBundlePath,
    format: 'esm',
    platform: 'browser',
    target: ['esnext'],
    minify: true,
    sourcemap: false,
  });
}

function updatePackageJson() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  if (!packageJson.files) {
    packageJson.files = [];
  }

  if (!packageJson.files.includes('initWasm.bundle.js')) {
    packageJson.files.push('initWasm.bundle.js');
  }

  if (!packageJson.exports) {
    packageJson.exports = {};
  }

  packageJson.exports['./initWasm'] = './initWasm.bundle.js';


  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), 'utf8');
}

async function main() {
  if (!fs.existsSync(wasmPath)) {
    console.error(`WASM file not found at ${wasmPath}. Please run wasm-bindgen first.`);
    process.exit(1);
  }

  const base64Wasm = encodeWasmToBase64(wasmPath);
  console.log('WASM file encoded to Base64.');

  generateWasmBase64Module(base64Wasm);
  console.log('wasmBase64.js module generated.');

  generateInitWasmModule();
  console.log('initWasm.js module generated.');

  await bundleInitWasm();
  console.log('initWasm.js bundled with esbuild.');

  updatePackageJson();
  console.log('package.json updated with initWasm export.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
