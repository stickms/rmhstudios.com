// Fail the image/CI build if a Wasm module was omitted or corrupted.
import { readFile, readdir } from 'node:fs/promises';

const assets = new URL('../.output/public/assets/', import.meta.url);
// Optional live origin verification after starting the built Nitro server.
const baseUrl = process.argv[2];
const files = await readdir(assets, { recursive: true });
// `dough` left this list with Steel phase 3: it was the old globe's simulation, the new shell
// does not mount that globe, so the bundler no longer emits the kernel. `projection` still
// ships (the eversion lab route imports it) until phase 6 deletes both kernels and this check.
for (const name of ['projection']) {
  const file = files.find((file) => file.startsWith(`${name}-`) && file.endsWith('.wasm'));
  if (!file) throw new Error(`Production output is missing ${name} WebAssembly`);
  const bytes = await readFile(new URL(file.replaceAll('\\', '/'), assets));
  if (!globalThis.WebAssembly.validate(bytes)) throw new Error(`Invalid WebAssembly: ${file}`);
  if (baseUrl) {
    const response = await fetch(new URL(`/assets/${file}`, baseUrl));
    if (!response.ok || !response.headers.get('content-type')?.startsWith('application/wasm')) {
      throw new Error(`Wasm is not served correctly: ${file}`);
    }
    if (!response.headers.get('cache-control')?.includes('immutable')) {
      throw new Error(`Missing immutable cache policy: ${file}`);
    }
    if (!globalThis.WebAssembly.validate(await response.arrayBuffer())) {
      throw new Error(`Invalid served WebAssembly: ${file}`);
    }
  }
}
