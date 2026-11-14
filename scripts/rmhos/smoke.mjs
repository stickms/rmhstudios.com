/* eslint-disable no-console -- command-line tool output */
// Boots the built rmhOS image headless in Node with the v86 emulator and
// drives the guest agent over serial1 (the wire protocol of
// features/rmhos/engine/agent-protocol.ts). Exits non-zero on any failure.
//
//   pnpm rmhos:image && pnpm rmhos:smoke
//
// RMHOS_DIR overrides the image directory (default public/rmhos-dev).
// RMHOS_SMOKE_CMDLINE_EXTRA is appended to the kernel command line (debugging).
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here =
  path.dirname(
    fileURLToPath(
      import.meta
        .url,
    ),
  );
const root =
  path.resolve(
    here,
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

// Same command line Task 6 and Task 7 boot with.
export const CMDLINE =
  'root=/dev/sda rw rootfstype=ext4 console=ttyS0 console=tty0 vga=0x318 quiet tsc=reliable mitigations=off';

const TOTAL_TIMEOUT_MS =
  15 *
  60 *
  1000;

function fail(
  message,
) {
  console.error(
    `rmhos smoke: FAIL: ${message}`,
  );
  process.exitCode = 1;
}

async function main() {
  const need =
    [
      'bzImage',
      'rootfs.ext4',
      'seabios.bin',
      'vgabios.bin',
      'manifest.json',
    ];
  for (const name of need) {
    if (
      !existsSync(
        path.join(
          dir,
          name,
        ),
      )
    ) {
      throw new Error(
        `${path.join(dir, name)} is missing; run pnpm rmhos:image first`,
      );
    }
  }

  const {
    V86,
  } =
    await import('v86');
  const wasmPath =
    path.join(
      path.dirname(
        createRequire(
          import.meta
            .url,
        ).resolve(
          'v86/package.json',
        ),
      ),
      'build',
      'v86.wasm',
    );

  const buf =
    async (
      name,
    ) => {
      const b =
        await readFile(
          path.join(
            dir,
            name,
          ),
        );
      return b.buffer.slice(
        b.byteOffset,
        b.byteOffset +
          b.byteLength,
      );
    };

  const emulator =
    new V86(
      {
        wasm_path:
          wasmPath,
        memory_size:
          512 *
          1024 *
          1024,
        vga_memory_size:
          8 *
          1024 *
          1024,
        bios: {
          buffer:
            await buf(
              'seabios.bin',
            ),
        },
        vga_bios:
          {
            buffer:
              await buf(
                'vgabios.bin',
              ),
          },
        bzimage:
          {
            buffer:
              await buf(
                'bzImage',
              ),
          },
        hda: {
          buffer:
            await buf(
              'rootfs.ext4',
            ),
        },
        cmdline:
          `${CMDLINE} ${process.env.RMHOS_SMOKE_CMDLINE_EXTRA ?? ''}`.trim(),
        filesystem:
          {},
        uart1: true,
        autostart: true,
        disable_speaker: true,
        log_level: 0,
      },
    );

  let serial0 =
    '';
  let serial1 =
    '';
  const dec =
    (
      s,
      b,
    ) =>
      s +
      String.fromCharCode(
        b,
      );
  emulator.add_listener(
    'serial0-output-byte',
    (
      b,
    ) => {
      serial0 =
        dec(
          serial0,
          b,
        );
      if (
        process
          .env
          .RMHOS_SMOKE_VERBOSE
      )
        process.stderr.write(
          String.fromCharCode(
            b,
          ),
        );
    },
  );
  emulator.add_listener(
    'serial1-output-byte',
    (
      b,
    ) => {
      serial1 =
        dec(
          serial1,
          b,
        );
    },
  );

  const started =
    Date.now();
  const deadline =
    started +
    TOTAL_TIMEOUT_MS;
  const sleep =
    (
      ms,
    ) =>
      new Promise(
        (
          r,
        ) =>
          setTimeout(
            r,
            ms,
          ),
      );
  const waitFor =
    async (
      what,
      test,
    ) => {
      for (;;) {
        const hit =
          test();
        if (
          hit
        )
          return hit;
        if (
          Date.now() >
          deadline
        ) {
          throw new Error(
            `timed out waiting for ${what}\n--- serial0 tail ---\n${serial0.slice(-1500)}\n--- serial1 tail ---\n${serial1.slice(-500)}`,
          );
        }
        await sleep(
          100,
        );
      }
    };
  const send =
    (
      line,
    ) =>
      emulator.serial_send_bytes(
        1,
        new TextEncoder().encode(
          `${line}\n`,
        ),
      );
  const seen =
    (
      re,
    ) =>
      serial1.match(
        re,
      );
  const step =
    (
      msg,
    ) =>
      console.log(
        `[${((Date.now() - started) / 1000).toFixed(1)}s] ${msg}`,
      );

  try {
    await waitFor(
      'RMHOS READY',
      () =>
        /^RMHOS READY\r?$/m.test(
          serial1,
        ),
    );
    step(
      'READY',
    );

    send(
      'SESSION smoke',
    );
    await waitFor(
      'RMHOS SESSION_OK',
      () =>
        /^RMHOS SESSION_OK\r?$/m.test(
          serial1,
        ),
    );
    step(
      'SESSION_OK',
    );

    send(
      'RESTORE',
    );
    await waitFor(
      'RMHOS RESTORED',
      () =>
        /^RMHOS RESTORED\r?$/m.test(
          serial1,
        ),
    );
    step(
      'RESTORED',
    );
    // The agent logs "desktop launched" once startx was started on tty1, then,
    // 45 seconds later, whether the X server is up (informational here:
    // headless, nothing paints; painting is checked in the browser).
    if (
      /rmhos-agent: startx failed/.test(
        serial0,
      )
    ) {
      throw new Error(
        `the agent could not launch startx\n${serial0.slice(-1500)}`,
      );
    }
    await waitFor(
      '"desktop launched" on serial0',
      () =>
        /rmhos-agent: desktop launched/.test(
          serial0,
        ),
    );
    step(
      'desktop launched (startx started on tty1)',
    );
    const xstatus =
      await waitFor(
        'the X server status line',
        () =>
          serial0.match(
            /rmhos-agent: (X server is (?:not )?running)/,
          ),
      );
    step(
      xstatus[1],
    );
    if (
      xstatus[1].includes(
        'not',
      )
    ) {
      console.log(
        `X log tail from the guest:\n${serial0
          .split(
            '\n',
          )
          .filter(
            (
              l,
            ) =>
              l.includes(
                'rmhos-agent: x:',
              ),
          )
          .join(
            '\n',
          )}`,
      );
    }

    send(
      'SAVE n1',
    );
    const saved =
      await waitFor(
        'RMHOS SAVED n1',
        () =>
          seen(
            /^RMHOS SAVED n1 (\d+)\r?$/m,
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
      `SAVED n1 ${bytes}`,
    );

    const tar =
      await emulator.read_file(
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
      `home.tar is a tar (${tar.length} bytes)`,
    );

    const release =
      serial0.match(
        /^rmhos-kernel (\S+)\r?$/m,
      );
    if (
      !release
    )
      throw new Error(
        `no "rmhos-kernel <release>" line on serial0\n${serial0.slice(-1500)}`,
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
      `kernel release ${release[1]}`,
    );

    if (
      /\bKernel panic\b/.test(
        serial0,
      )
    )
      throw new Error(
        'kernel panic on serial0',
      );
    if (
      /RMHOS ERR/.test(
        serial1,
      )
    )
      throw new Error(
        `guest reported an error:\n${serial1.slice(-500)}`,
      );

    console.log(
      'rmhos smoke: OK',
    );
  } finally {
    try {
      await emulator.destroy();
    } catch {
      /* the emulator is going away anyway */
    }
  }
}

main().then(
  () =>
    process.exit(
      process.exitCode ??
        0,
    ),
  (
    error,
  ) => {
    fail(
      error instanceof
        Error
        ? error.message
        : String(
            error,
          ),
    );
    process.exit(
      1,
    );
  },
);
