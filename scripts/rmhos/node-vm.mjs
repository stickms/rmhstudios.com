// Runs the rmhOS machine headless in Node for the snapshot and smoke scripts.
import path from 'node:path';
import { createRequire } from 'node:module';
import { baseVmOptions } from './vm-options.mjs';

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

/**
 * Starts the VM from an image directory. `initialState` restores
 * <dir>/state.zst instead of booting. Returns the emulator plus the serial
 * logs and small helpers to drive the agent on serial1.
 */
export async function startNodeVm({
  dir,
  initialState = false,
  relayUrl,
  timeoutMs,
  extraCmdline,
}) {
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
  const options =
    baseVmOptions(
      {
        baseUrl: `${dir}${path.sep}`,
        relayUrl,
      },
    );
  if (
    extraCmdline
  )
    options.cmdline = `${options.cmdline} ${extraCmdline}`;
  if (
    initialState
  )
    options.initial_state =
      {
        url: path.join(
          dir,
          'state.zst',
        ),
      };

  const vm =
    {
      serial0:
        '',
      serial1:
        '',
      lastByteAt:
        Date.now(),
      startedAt:
        Date.now(),
    };
  const emulator =
    new V86(
      {
        ...options,
        wasm_path:
          wasmPath,
        autostart: true,
        disable_speaker: true,
        log_level: 0,
      },
    );
  emulator.add_listener(
    'serial0-output-byte',
    (
      b,
    ) => {
      vm.serial0 +=
        String.fromCharCode(
          b,
        );
      vm.lastByteAt =
        Date.now();
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
      vm.serial1 +=
        String.fromCharCode(
          b,
        );
      vm.lastByteAt =
        Date.now();
    },
  );

  // Input sent before the machine is ready (files loaded, state restored) is lost.
  vm.whenReady =
    new Promise(
      (
        resolve,
      ) =>
        emulator.add_listener(
          'emulator-ready',
          resolve,
        ),
    );

  const deadline =
    Date.now() +
    (timeoutMs ??
      15 *
        60 *
        1000);
  vm.emulator =
    emulator;
  vm.elapsed =
    () =>
      (Date.now() -
        vm.startedAt) /
      1000;
  vm.send =
    (
      line,
    ) =>
      emulator.serial_send_bytes(
        1,
        new TextEncoder().encode(
          `${line}\n`,
        ),
      );
  vm.waitFor =
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
            `timed out waiting for ${what}\n--- serial0 tail ---\n${vm.serial0.slice(-1500)}\n--- serial1 tail ---\n${vm.serial1.slice(-500)}`,
          );
        }
        await sleep(
          50,
        );
      }
    };
  vm.waitLine =
    (
      re,
    ) =>
      vm.waitFor(
        String(
          re,
        ),
        () =>
          vm.serial1.match(
            re,
          ),
      );
  vm.destroy =
    async () => {
      try {
        await emulator.destroy();
      } catch {
        /* going away anyway */
      }
    };
  return vm;
}

export { sleep };
