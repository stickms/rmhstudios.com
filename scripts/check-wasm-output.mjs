// Fail the image/CI build if a Wasm module was omitted or corrupted.
import { readFile, readdir } from 'node:fs/promises';

const assets = new URL('../.output/public/assets/', import.meta.url);
// Optional live origin verification after starting the built Nitro server.
const baseUrl = process.argv[2];
const files = await readdir(assets, { recursive: true });
for (const name of ['dough', 'projection']) {
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
