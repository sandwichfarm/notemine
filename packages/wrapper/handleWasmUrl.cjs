const handleWasmUrl = {
  name: 'handle-wasm-url',
  setup(build) {
    // Handle imports of `.wasm` files
    build.onLoad({ filter: /\.wasm$/ }, async (args) => {
      const fs = require('fs').promises;
      const path = args.path;
      const wasmBuffer = await fs.readFile(path);
      const base64 = wasmBuffer.toString('base64');
      const dataUrl = `data:application/wasm;base64,${base64}`;
      return {
        contents: `export default "${dataUrl}";`,
        loader: 'js',
      };
    });
  },
};

module.exports = { handleWasmUrl }