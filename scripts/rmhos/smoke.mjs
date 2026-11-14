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
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { startNodeVm } from './node-vm.mjs';
import { metaProblems } from './image-meta.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.resolve(process.env.RMHOS_DIR ?? path.join(root, 'public', 'rmhos-dev'));
const RESTORE_BUDGET_S = 5;

/** SESSION line in the three-field form: user, epoch seconds, 64 bytes of hex entropy. */
function sessionLine({
  user = 'smoke',
  epoch = Math.floor(Date.now() / 1000),
  entropy = randomBytes(64).toString('hex'),
} = {}) {
  return `SESSION ${user} ${epoch} ${entropy}`;
}

const step = (vm, msg) => console.log(`[${vm.elapsed().toFixed(1)}s] ${msg}`);

function need(names) {
  for (const name of names) {
    if (!existsSync(path.join(dir, name))) {
      const hint = name === 'state.zst' ? ' && pnpm rmhos:snapshot' : '';
      throw new Error(`${path.join(dir, name)} is missing; run pnpm rmhos:image${hint} first`);
    }
  }
}

/** SESSION, RESTORE, SAVE against a running agent; throws on any deviation. */
async function drive(vm, nonce) {
  vm.send(sessionLine());
  await vm.waitLine(/^RMHOS SESSION_OK\r?$/m);
  const sessionOkAt = vm.elapsed();
  step(vm, 'SESSION_OK');

  vm.send('RESTORE');
  await vm.waitLine(/^RMHOS RESTORED\r?$/m);
  step(vm, 'RESTORED');
  // The agent logs "desktop launched" once startx was started on tty1
  // (headless: nothing paints; painting is checked in the browser).
  if (/rmhos-agent: startx failed/.test(vm.serial0)) {
    throw new Error(`the agent could not launch startx\n${vm.serial0.slice(-1500)}`);
  }
  await vm.waitFor('"desktop launched" on serial0', () =>
    /rmhos-agent: desktop launched/.test(vm.serial0),
  );
  step(vm, 'desktop launched (startx started on tty1)');

  vm.send(`SAVE ${nonce}`);
  const saved = await vm.waitLine(new RegExp(`^RMHOS SAVED ${nonce} (\\d+)\\r?$`, 'm'));
  const bytes = Number(saved[1]);
  if (!(bytes > 0)) throw new Error(`SAVED reported ${bytes} bytes`);
  step(vm, `SAVED ${nonce} ${bytes}`);

  const tar = await vm.emulator.read_file('/sync/home.tar');
  if (tar.length < 512) throw new Error(`home.tar is only ${tar.length} bytes`);
  const magic = String.fromCharCode(...tar.slice(257, 262));
  if (magic !== 'ustar')
    throw new Error(`home.tar has no ustar magic (got ${JSON.stringify(magic)})`);
  if (tar.length < bytes)
    throw new Error(`home.tar (${tar.length}) is smaller than reported (${bytes})`);
  step(vm, `home.tar is a tar (${tar.length} bytes)`);

  if (/\bKernel panic\b/.test(vm.serial0)) throw new Error('kernel panic on serial0');
  if (/RMHOS ERR/.test(vm.serial1))
    throw new Error(`guest reported an error:\n${vm.serial1.slice(-500)}`);
  return sessionOkAt;
}

async function coldBoot() {
  console.log('--- case 1: cold boot');
  const vm = await startNodeVm({
    dir,
    extraCmdline: process.env.RMHOS_SMOKE_CMDLINE_EXTRA,
  });
  try {
    await vm.waitFor('RMHOS READY', () => /^RMHOS READY\r?$/m.test(vm.serial1));
    step(vm, 'READY');
    const sessionOkAt = await drive(vm, 'n1');
    const release = vm.serial0.match(/^rmhos-kernel (\S+)\r?$/m);
    if (!release)
      throw new Error(`no "rmhos-kernel <release>" line on serial0\n${vm.serial0.slice(-1500)}`);
    if (!release[1].endsWith('-rmhos'))
      throw new Error(`kernel release ${release[1]} does not end in -rmhos`);
    step(vm, `kernel release ${release[1]}`);
    return sessionOkAt;
  } finally {
    await vm.destroy();
  }
}

async function fromSnapshot() {
  console.log('--- case 2: restore from state.zst');
  need(['state.zst']);
  const problems = metaProblems(dir);
  if (problems.length)
    throw new Error(`state.zst does not belong to these files:\n  - ${problems.join('\n  - ')}`);
  const vm = await startNodeVm({
    dir,
    initialState: true,
    timeoutMs: 5 * 60 * 1000,
  });
  try {
    // No boot may happen: the agent is already waiting on serial1.
    await vm.whenReady;
    vm.send(sessionLine());
    await vm.waitLine(/^RMHOS SESSION_OK\r?$/m);
    const at = vm.elapsed();
    step(vm, `SESSION_OK from the snapshot (budget ${RESTORE_BUDGET_S}s)`);
    if (at > RESTORE_BUDGET_S)
      throw new Error(`SESSION_OK took ${at.toFixed(1)}s from start, budget ${RESTORE_BUDGET_S}s`);
    if (/rmhos-kernel|Linux version/.test(vm.serial0))
      throw new Error('the restored machine booted');
    vm.send('RESTORE');
    await vm.waitLine(/^RMHOS RESTORED\r?$/m);
    step(vm, 'RESTORED');
    vm.send('SAVE n2');
    const saved = await vm.waitLine(/^RMHOS SAVED n2 (\d+)\r?$/m);
    if (!(Number(saved[1]) > 0)) throw new Error('SAVED reported no bytes');
    step(vm, `SAVED n2 ${saved[1]}`);
    return at;
  } finally {
    await vm.destroy();
  }
}

// --- tar bytes built here, never by the host's tar -------------------------

function tarHeader({ name, size = 0, mode = 0o644, type = '0' }) {
  const h = new Uint8Array(512);
  const put = (off, str) => h.set(new TextEncoder().encode(str), off);
  put(0, name);
  put(100, `${mode.toString(8).padStart(7, '0')}\0`);
  put(108, '0000000\0');
  put(116, '0000000\0');
  put(124, `${size.toString(8).padStart(11, '0')}\0`);
  put(136, '00000000000\0');
  put(148, '        ');
  h[156] = type.charCodeAt(0);
  put(257, 'ustar\0');
  put(263, '00');
  let sum = 0;
  for (const b of h) sum += b;
  put(148, `${sum.toString(8).padStart(6, '0')}\0 `);
  return h;
}

function makeTar(entries) {
  const parts = [];
  for (const e of entries) {
    const data = new TextEncoder().encode(e.content ?? '');
    parts.push(
      tarHeader({
        ...e,
        size: data.length,
      }),
    );
    if (data.length) {
      const padded = new Uint8Array(Math.ceil(data.length / 512) * 512);
      padded.set(data);
      parts.push(padded);
    }
  }
  parts.push(new Uint8Array(1024));
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of parts) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** The entries of a tar: { name, mode, content }. */
function readTar(bytes) {
  const out = [];
  const text = (a, from, len) =>
    new TextDecoder().decode(a.subarray(from, from + len)).replace(/\0.*$/s, '');
  for (let off = 0; off + 512 <= bytes.length;) {
    const h = bytes.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const size = parseInt(text(h, 124, 12), 8);
    const name = text(h, 0, 100);
    const mode = parseInt(text(h, 100, 8), 8);
    out.push({
      name,
      mode,
      content: new TextDecoder().decode(bytes.subarray(off + 512, off + 512 + size)),
    });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/** Restores the snapshot, opens SESSION, places `archive` in the share and sends RESTORE. */
async function withArchive(archive) {
  need(['state.zst']);
  const vm = await startNodeVm({
    dir,
    initialState: true,
    timeoutMs: 5 * 60 * 1000,
  });
  await vm.whenReady;
  vm.send(sessionLine());
  await vm.waitLine(/^RMHOS SESSION_OK\r?$/m);
  await vm.emulator.create_file('/sync/home.tar', archive);
  vm.send('RESTORE');
  return vm;
}

async function refusedArchive() {
  console.log('--- case 3: a crafted archive (absolute and ../ entries) is refused');
  const vm = await withArchive(
    makeTar([
      {
        name: '/tmp/rmhos-escape.txt',
        content: 'absolute\n',
      },
      {
        name: '../escape.txt',
        content: 'dotdot\n',
      },
    ]),
  );
  try {
    // The agent answers "ERR restore" for a refused archive.
    await vm.waitLine(/^RMHOS ERR restore\r?$/m);
    step(vm, 'RMHOS ERR restore');
    if (!/home archive has absolute or \.\. entries; refused/.test(vm.serial0)) {
      throw new Error(`the archive was not refused before extraction\n${vm.serial0.slice(-1500)}`);
    }
    // Refused before extraction means nothing was written outside the home
    // (the guest filesystem is not visible from here; the log line is the proof).
    if (/RMHOS RESTORED/.test(vm.serial1)) throw new Error('a crafted archive was restored');
    vm.send('SAVE n2');
    await vm.waitLine(/^RMHOS SAVED n2 (\d+)\r?$/m);
    step(vm, 'protocol still alive: SAVED n2');
    const names = readTar(await vm.emulator.read_file('/sync/home.tar')).map((e) => e.name);
    if (names.some((n) => /escape/.test(n)))
      throw new Error(`crafted entries ended up in the home: ${names}`);
  } finally {
    await vm.destroy();
  }
}

async function validArchive() {
  console.log('--- case 4: a valid archive is restored and saved back');
  // note.txt first, then a "./" entry with mode 000: the agent must make the
  // home usable again (u+rwx) so later sessions and SAVE keep working.
  const vm = await withArchive(
    makeTar([
      {
        name: 'note.txt',
        content: 'hello from the archive\n',
      },
      {
        name: './',
        type: '5',
        mode: 0,
      },
    ]),
  );
  try {
    await vm.waitLine(/^RMHOS RESTORED\r?$/m);
    step(vm, 'RESTORED');
    vm.send('SAVE n3');
    await vm.waitLine(/^RMHOS SAVED n3 (\d+)\r?$/m);
    step(vm, 'SAVED n3');
    const entries = readTar(await vm.emulator.read_file('/sync/home.tar'));
    const note = entries.find((e) => e.name.replace(/^\.\//, '') === 'note.txt');
    if (!note) throw new Error(`note.txt is not in the saved tar: ${entries.map((e) => e.name)}`);
    if (note.content !== 'hello from the archive\n')
      throw new Error(`note.txt content changed: ${JSON.stringify(note.content)}`);
    const root = entries.find((e) => e.name === './' || e.name === '.');
    if (!root || (root.mode & 0o700) !== 0o700) {
      throw new Error(
        `the home directory is not user-accessible after restore (mode ${root?.mode?.toString(8)})`,
      );
    }
    step(vm, 'note.txt round-trips; home mode ' + root.mode.toString(8));
  } finally {
    await vm.destroy();
  }
}

/** Restores the snapshot with a debug flag in the share, opens a session, returns what the guest logged. */
async function debugSession({ entropy, epoch }) {
  need(['state.zst']);
  const vm = await startNodeVm({
    dir,
    initialState: true,
    timeoutMs: 5 * 60 * 1000,
  });
  await vm.whenReady;
  await vm.emulator.create_file('/debug-rng', new TextEncoder().encode('1\n'));
  vm.send(
    sessionLine({
      entropy,
      epoch,
    }),
  );
  await vm.waitLine(/^RMHOS SESSION_OK\r?$/m);
  const rng = (
    await vm.waitFor('the rng debug line', () =>
      vm.serial0.match(/rmhos-agent: rng ([0-9a-f]{64})/),
    )
  )[1];
  const clock = Number(
    (await vm.waitFor('the clock line', () => vm.serial0.match(/rmhos-agent: clock (\d+)/)))[1],
  );
  const written = Number(
    (
      await vm.waitFor('the entropy byte count', () =>
        vm.serial0.match(/rmhos-agent: entropy bytes written (\d+)/),
      )
    )[1],
  );
  return {
    vm,
    rng,
    clock,
    written,
  };
}

async function rngAndClock() {
  console.log('--- case 5: a session reseeds the RNG and sets the clock');
  const epoch = Math.floor(Date.now() / 1000);
  const entropyA = randomBytes(64).toString('hex');
  const entropyB = randomBytes(64).toString('hex');
  const a = await debugSession({
    entropy: entropyA,
    epoch,
  });
  const b = await debugSession({
    entropy: entropyB,
    epoch,
  });
  const c = await debugSession({
    entropy: entropyA,
    epoch,
  });
  // The mechanism, asserted directly: entropy with 00 bytes at the start, in the
  // middle and at the end must still arrive whole (64 bytes in the pool).
  const zeros = `00${randomBytes(30).toString('hex')}00${randomBytes(31).toString('hex')}00`;
  if (zeros.length !== 128) throw new Error('test entropy has the wrong length');
  const z = await debugSession({ entropy: zeros, epoch });
  try {
    for (const { written } of [a, b, c, z]) {
      if (written !== 64) throw new Error(`the agent wrote ${written} entropy bytes, expected 64`);
    }
    step(a.vm, 'entropy: 64 bytes reach the pool, also with 00 at the start, middle and end');
    step(
      a.vm,
      `urandom after SESSION: A ${a.rng.slice(0, 16)}... B ${b.rng.slice(0, 16)}... A again ${c.rng.slice(0, 16)}...`,
    );
    if (a.rng === b.rng)
      throw new Error('two restores with different entropy produced the same /dev/urandom output');
    console.log(
      `same entropy and epoch twice: output ${a.rng === c.rng ? 'MATCHES (the reseed is deterministic)' : 'differs (timing jitter)'}`,
    );
    for (const { clock } of [a, b, c]) {
      if (Math.abs(clock - epoch) > 5)
        throw new Error(`guest clock ${clock} is not within 5 s of the epoch sent (${epoch})`);
    }
    step(
      a.vm,
      `guest clock ${a.clock - epoch}s, ${b.clock - epoch}s, ${c.clock - epoch}s from the epoch sent`,
    );
    for (const x of ['could not set the clock']) {
      if (a.vm.serial0.includes(x)) throw new Error(x);
    }
  } finally {
    await Promise.all([a.vm.destroy(), b.vm.destroy(), c.vm.destroy(), z.vm.destroy()]);
  }
}

async function badSessions() {
  console.log('--- case 6: a SESSION without a valid epoch and entropy is refused');
  need(['state.zst']);
  const vm = await startNodeVm({
    dir,
    initialState: true,
    timeoutMs: 5 * 60 * 1000,
  });
  try {
    await vm.whenReady;
    const good = randomBytes(64).toString('hex');
    for (const line of [
      'SESSION smoke',
      `SESSION smoke 1794700000`,
      `SESSION smoke 1794700000 ${good.slice(2)}`,
      `SESSION smoke abc ${good}`,
      `SESSION smoke 0 ${good}`,
      `SESSION smoke 1 ${good}`,
      `SESSION smoke 1577836799 ${good}`,
      `SESSION smoke 4102444801 ${good}`,
      `SESSION smoke 99999999999 ${good}`,
      `SESSION smoke 1794700000 ${good.toUpperCase()}`,
      `SESSION smoke 1794700000 ${good} extra`,
    ]) {
      const before = vm.serial1.length;
      vm.send(line);
      await vm.waitFor(`ERR bad_session for ${line.slice(0, 30)}`, () =>
        /RMHOS ERR bad_session\r?\n/.test(vm.serial1.slice(before)),
      );
    }
    step(vm, 'every malformed SESSION answered ERR bad_session');
    vm.send(sessionLine());
    await vm.waitLine(/^RMHOS SESSION_OK\r?$/m);
    step(vm, 'a valid SESSION still works afterwards');
  } finally {
    await vm.destroy();
  }
}

function metaRefusal() {
  console.log('--- case 7: the snapshot/meta refusal self-test');
  const r = spawnSync(
    'node',
    [path.join(path.dirname(fileURLToPath(import.meta.url)), 'meta-selftest.mjs')],
    {
      encoding: 'utf8',
    },
  );
  if (r.status !== 0) throw new Error(`meta self-test failed:\n${r.stdout}\n${r.stderr}`);
  console.log(r.stdout.trim().split('\n').slice(-1)[0]);
}

async function main() {
  need(['bzImage', 'rootfs.ext4', 'seabios.bin', 'vgabios.bin', 'manifest.json']);
  // RMHOS_SMOKE_CASES=3,4 runs a subset (debugging); default is all seven.
  const only = new Set((process.env.RMHOS_SMOKE_CASES ?? '1,2,3,4,5,6,7').split(','));
  let cold;
  let warm;
  if (only.has('1')) cold = await coldBoot();
  if (only.has('2')) warm = await fromSnapshot();
  if (only.has('3')) await refusedArchive();
  if (only.has('4')) await validArchive();
  if (only.has('5')) await rngAndClock();
  if (only.has('6')) await badSessions();
  if (only.has('7')) metaRefusal();
  if (cold !== undefined && warm !== undefined) {
    console.log(
      `SESSION_OK after ${cold.toFixed(1)}s (cold boot) and ${warm.toFixed(1)}s (from the snapshot)`,
    );
  }
  console.log('rmhos smoke: OK');
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`rmhos smoke: FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  },
);
