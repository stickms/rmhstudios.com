/* eslint-disable no-console -- command-line tool output */
// Boots the built rmhOS image headless in Node with the v86 emulator and
// drives the guest agent over serial1 (the wire protocol of
// features/rmhos/engine/agent-protocol.ts). Two cases: a cold boot, then a
// restore from state.zst that must reach SESSION_OK without a boot. Exits
// non-zero on any failure.
//
//   pnpm rmhos:image && pnpm rmhos:snapshot && pnpm rmhos:smoke
//
// RMHOS_DIR overrides the image directory (default public/rmhos-dev).
// RMHOS_SMOKE_CMDLINE_EXTRA is appended to the kernel command line of the cold boot.
// RMHOS_SMOKE_VERBOSE=1 echoes serial0.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startNodeVm } from './node-vm.mjs';

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
const RESTORE_BUDGET_S = 20;

const step =
  (
    vm,
    msg,
  ) =>
    console.log(
      `[${vm.elapsed().toFixed(1)}s] ${msg}`,
    );

function need(
  names,
) {
  for (const name of names) {
    if (
      !existsSync(
        path.join(
          dir,
          name,
        ),
      )
    ) {
      const hint =
        name ===
        'state.zst'
          ? ' && pnpm rmhos:snapshot'
          : '';
      throw new Error(
        `${path.join(dir, name)} is missing; run pnpm rmhos:image${hint} first`,
      );
    }
  }
}

/** SESSION, RESTORE, SAVE against a running agent; throws on any deviation. */
async function drive(
  vm,
  nonce,
) {
  vm.send(
    'SESSION smoke',
  );
  await vm.waitLine(
    /^RMHOS SESSION_OK\r?$/m,
  );
  const sessionOkAt =
    vm.elapsed();
  step(
    vm,
    'SESSION_OK',
  );

  vm.send(
    'RESTORE',
  );
  await vm.waitLine(
    /^RMHOS RESTORED\r?$/m,
  );
  step(
    vm,
    'RESTORED',
  );
  // The agent logs "desktop launched" once startx was started on tty1
  // (headless: nothing paints; painting is checked in the browser).
  if (
    /rmhos-agent: startx failed/.test(
      vm.serial0,
    )
  ) {
    throw new Error(
      `the agent could not launch startx\n${vm.serial0.slice(-1500)}`,
    );
  }
  await vm.waitFor(
    '"desktop launched" on serial0',
    () =>
      /rmhos-agent: desktop launched/.test(
        vm.serial0,
      ),
  );
  step(
    vm,
    'desktop launched (startx started on tty1)',
  );

  vm.send(
    `SAVE ${nonce}`,
  );
  const saved =
    await vm.waitLine(
      new RegExp(
        `^RMHOS SAVED ${nonce} (\\d+)\\r?$`,
        'm',
      ),
    );
  const bytes =
    Number(
      saved[1],
    );
  if (
    !(
      bytes >
      0
    )
  )
    throw new Error(
      `SAVED reported ${bytes} bytes`,
    );
  step(
    vm,
    `SAVED ${nonce} ${bytes}`,
  );

  const tar =
    await vm.emulator.read_file(
      '/sync/home.tar',
    );
  if (
    tar.length <
    512
  )
    throw new Error(
      `home.tar is only ${tar.length} bytes`,
    );
  const magic =
    String.fromCharCode(
      ...tar.slice(
        257,
        262,
      ),
    );
  if (
    magic !==
    'ustar'
  )
    throw new Error(
      `home.tar has no ustar magic (got ${JSON.stringify(magic)})`,
    );
  if (
    tar.length <
    bytes
  )
    throw new Error(
      `home.tar (${tar.length}) is smaller than reported (${bytes})`,
    );
  step(
    vm,
    `home.tar is a tar (${tar.length} bytes)`,
  );

  if (
    /\bKernel panic\b/.test(
      vm.serial0,
    )
  )
    throw new Error(
      'kernel panic on serial0',
    );
  if (
    /RMHOS ERR/.test(
      vm.serial1,
    )
  )
    throw new Error(
      `guest reported an error:\n${vm.serial1.slice(-500)}`,
    );
  return sessionOkAt;
}

async function coldBoot() {
  console.log(
    '--- case 1: cold boot',
  );
  const vm =
    await startNodeVm(
      {
        dir,
        extraCmdline:
          process
            .env
            .RMHOS_SMOKE_CMDLINE_EXTRA,
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
    step(
      vm,
      'READY',
    );
    const sessionOkAt =
      await drive(
        vm,
        'n1',
      );
    const release =
      vm.serial0.match(
        /^rmhos-kernel (\S+)\r?$/m,
      );
    if (
      !release
    )
      throw new Error(
        `no "rmhos-kernel <release>" line on serial0\n${vm.serial0.slice(-1500)}`,
      );
    if (
      !release[1].endsWith(
        '-rmhos',
      )
    )
      throw new Error(
        `kernel release ${release[1]} does not end in -rmhos`,
      );
    step(
      vm,
      `kernel release ${release[1]}`,
    );
    return sessionOkAt;
  } finally {
    await vm.destroy();
  }
}

async function fromSnapshot() {
  console.log(
    '--- case 2: restore from state.zst',
  );
  need(
    [
      'state.zst',
    ],
  );
  const vm =
    await startNodeVm(
      {
        dir,
        initialState: true,
        timeoutMs:
          5 *
          60 *
          1000,
      },
    );
  try {
    // No boot may happen: the agent is already waiting on serial1.
    await vm.whenReady;
    vm.send(
      'SESSION smoke',
    );
    await vm.waitLine(
      /^RMHOS SESSION_OK\r?$/m,
    );
    const at =
      vm.elapsed();
    step(
      vm,
      `SESSION_OK from the snapshot (budget ${RESTORE_BUDGET_S}s)`,
    );
    if (
      at >
      RESTORE_BUDGET_S
    )
      throw new Error(
        `SESSION_OK took ${at.toFixed(1)}s from start, budget ${RESTORE_BUDGET_S}s`,
      );
    if (
      /rmhos-kernel|Linux version/.test(
        vm.serial0,
      )
    )
      throw new Error(
        'the restored machine booted',
      );
    vm.send(
      'RESTORE',
    );
    await vm.waitLine(
      /^RMHOS RESTORED\r?$/m,
    );
    step(
      vm,
      'RESTORED',
    );
    vm.send(
      'SAVE n2',
    );
    const saved =
      await vm.waitLine(
        /^RMHOS SAVED n2 (\d+)\r?$/m,
      );
    if (
      !(
        Number(
          saved[1],
        ) >
        0
      )
    )
      throw new Error(
        'SAVED reported no bytes',
      );
    step(
      vm,
      `SAVED n2 ${saved[1]}`,
    );
    return at;
  } finally {
    await vm.destroy();
  }
}

async function main() {
  need(
    [
      'bzImage',
      'rootfs.ext4',
      'seabios.bin',
      'vgabios.bin',
      'manifest.json',
    ],
  );
  const cold =
    await coldBoot();
  const warm =
    await fromSnapshot();
  console.log(
    `SESSION_OK after ${cold.toFixed(1)}s (cold boot) and ${warm.toFixed(1)}s (from the snapshot)`,
  );
  console.log(
    'rmhos smoke: OK',
  );
}

main().then(
  () =>
    process.exit(
      0,
    ),
  (
    error,
  ) => {
    console.error(
      `rmhos smoke: FAIL: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(
      1,
    );
  },
);
