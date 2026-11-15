/* eslint-disable no-console -- command-line tool output */
// Boots the built image, waits for the guest agent to be ready and the guest to
// settle, and saves the machine as public/rmhos-dev/state.zst (zstd of
// emulator.save_state()). The snapshot is taken before any SESSION, so no user
// and no X server exist in it. Sessions restore from it instead of cold booting.
//
//   pnpm rmhos:image && pnpm rmhos:snapshot
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  zstdCompressSync,
  constants,
} from 'node:zlib';
import { startNodeVm } from './node-vm.mjs';
import {
  META_FILE,
  computeMeta,
} from './image-meta.mjs';

const root =
  path.resolve(
    path.dirname(
      fileURLToPath(
        import.meta
          .url,
      ),
    ),
    '..',
    '..',
  );
const dir =
  path.resolve(
    process
      .env
      .RMHOS_DIR ??
      path.join(
        root,
        'public',
        'rmhos-dev',
      ),
  );
const MAX_BYTES =
  80 *
  1024 *
  1024;
const QUIET_MS = 2000;

async function main() {
  for (const name of [
    'bzImage',
    'rootfs.ext4',
    'seabios.bin',
    'vgabios.bin',
  ]) {
    if (
      !existsSync(
        path.join(
          dir,
          name,
        ),
      )
    )
      throw new Error(
        `${path.join(dir, name)} is missing; run pnpm rmhos:image first`,
      );
  }
  const vm =
    await startNodeVm(
      {
        dir,
        timeoutMs:
          10 *
          60 *
          1000,
      },
    );
  try {
    await vm.waitFor(
      'RMHOS READY',
      () =>
        /^RMHOS READY\r?$/m.test(
          vm.serial1,
        ),
    );
    console.log(
      `[${vm.elapsed().toFixed(1)}s] READY`,
    );
    // The guest configures its network after the agent is up; take the state once that line is
    // logged (rmhos-net.start always logs one, after at most 60 s), then once serial0 has been quiet.
    await vm.waitFor(
      'rmhos-net line',
      () =>
        /^rmhos-net: /m.test(
          vm.serial0,
        ),
    );
    console.log(
      `[${vm.elapsed().toFixed(1)}s] ${vm.serial0.match(/^rmhos-net: .*$/m)[0].trim()}`,
    );
    await vm.waitFor(
      `${QUIET_MS} ms of serial silence`,
      () =>
        Date.now() -
          vm.lastByteAt >=
        QUIET_MS,
    );
    const raw =
      await vm.emulator.save_state();
    const t0 =
      Date.now();
    const packed =
      zstdCompressSync(
        Buffer.from(
          raw,
        ),
        {
          params:
            {
              [constants.ZSTD_c_compressionLevel]: 10,
            },
        },
      );
    console.log(
      `state ${raw.byteLength} bytes, zstd ${packed.length} bytes (${((Date.now() - t0) / 1000).toFixed(1)}s to compress)`,
    );
    if (
      packed.length >
      MAX_BYTES
    )
      throw new Error(
        `state.zst is ${packed.length} bytes, budget ${MAX_BYTES}`,
      );
    await writeFile(
      path.join(
        dir,
        'state.zst',
      ),
      packed,
    );
    await writeFile(
      path.join(
        dir,
        META_FILE,
      ),
      `${JSON.stringify(computeMeta(dir), null, 2)}\n`,
    );
    console.log(
      `wrote ${path.join(dir, 'state.zst')}`,
    );
  } finally {
    await vm.destroy();
  }
}

main().then(
  () =>
    process.exit(
      0,
    ),
  (
    e,
  ) => {
    console.error(
      `rmhos snapshot: FAIL: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(
      1,
    );
  },
);
