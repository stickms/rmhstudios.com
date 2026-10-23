import { beforeAll, afterAll, test, vi } from 'vitest';
import { DoughBody } from '../dough';
import { peirce } from '../eversion/projections/peirce';
import { bakeLut } from '../eversion/projection-lut';
import { tryBakePeirceLut, warmProjectionWasm } from './projection';
import { serveWasm } from './__tests__/fixtures';

const js = new DoughBody(),
  wasm = new DoughBody();
const fit = peirce.fit(390, 844);
beforeAll(async () => {
  serveWasm();
  if (!(await wasm.enableWasm())) throw new Error('Wasm dough did not load');
  await warmProjectionWasm();
  if (!tryBakePeirceLut(fit)) throw new Error('Wasm projection did not load');
  js.grab(0.2, 0.1);
  wasm.grab(0.2, 0.1);
});
afterAll(() => vi.unstubAllGlobals());

test('dough frame, including JS lifecycle and shared-memory field', async ({ bench }) => {
  await bench.compare(
    bench('JavaScript', () => {
      js.step(1 / 60);
    }),
    bench('WebAssembly', () => {
      wasm.step(1 / 60);
    }),
    { time: 1000 },
  );
});
test('Peirce 1024x512 bake, including owned output copy', async ({ bench }) => {
  await bench.compare(
    bench('JavaScript', () => {
      bakeLut(peirce, fit);
    }),
    bench('WebAssembly', () => {
      tryBakePeirceLut(fit);
    }),
    { time: 1000, iterations: 5 },
  );
});
