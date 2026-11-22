/* eslint-disable no-console -- command-line tool output */
// Self-check of the snapshot/meta refusal, on tiny fake files in a temp dir (no
// emulator, no real image): a matching meta is accepted; a missing meta, a
// changed file, a changed state or a changed command line make write-manifest
// exit non-zero with a message and no manifest.json.
//
//   node scripts/rmhos/meta-selftest.mjs        (also: pnpm rmhos:selftest)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { META_FILE, computeMeta, metaProblems } from './image-meta.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = mkdtempSync(path.join(tmpdir(), 'rmhos-meta-'));
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`);
  if (!ok) failures += 1;
};

function fresh() {
  for (const [name, text] of Object.entries({
    bzImage: 'kernel',
    'rootfs.ext4': 'rootfs',
    'seabios.bin': 'bios',
    'vgabios.bin': 'vga',
    'state.zst': 'state',
    'packages.txt': 'pkgs',
    'apk-installed.txt': 'apk',
    'linux-6.12.117.tar.xz': 'kernel source',
  })) {
    writeFileSync(path.join(tmp, name), text);
  }
  rmSync(path.join(tmp, 'manifest.json'), {
    force: true,
  });
  writeFileSync(path.join(tmp, META_FILE), JSON.stringify(computeMeta(tmp)));
}
const manifest = () =>
  spawnSync('node', [path.join(here, 'write-manifest.mjs'), tmp], {
    encoding: 'utf8',
  });

try {
  fresh();
  check('matching meta has no problems', metaProblems(tmp).length === 0, metaProblems(tmp).join('; '));
  let r = manifest();
  check(
    'write-manifest succeeds on a matching meta',
    r.status === 0 && existsSync(path.join(tmp, 'manifest.json')),
    r.stderr,
  );
  const m = JSON.parse(readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
  check('manifest lists state.zst', m.files['state.zst']?.size === 5);

  fresh();
  rmSync(path.join(tmp, META_FILE));
  r = manifest();
  check(
    'missing meta is refused',
    r.status !== 0 && /state\.meta\.json is missing/.test(r.stderr) && !existsSync(path.join(tmp, 'manifest.json')),
    r.stderr,
  );

  for (const name of ['rootfs.ext4', 'bzImage', 'seabios.bin', 'vgabios.bin', 'state.zst']) {
    fresh();
    writeFileSync(path.join(tmp, name), 'tampered');
    r = manifest();
    check(
      `a changed ${name} is refused`,
      r.status !== 0 && /differs/.test(r.stderr) && !existsSync(path.join(tmp, 'manifest.json')),
      r.stderr,
    );
  }

  fresh();
  const meta = JSON.parse(readFileSync(path.join(tmp, META_FILE), 'utf8'));
  writeFileSync(
    path.join(tmp, META_FILE),
    JSON.stringify({
      ...meta,
      cmdline: `${meta.cmdline} extra`,
    }),
  );
  r = manifest();
  check('a changed command line is refused', r.status !== 0 && /command line/.test(r.stderr), r.stderr);

  fresh();
  writeFileSync(
    path.join(tmp, META_FILE),
    JSON.stringify({
      ...meta,
      memoryBytes: 1,
    }),
  );
  check(
    'a changed memory size is refused',
    metaProblems(tmp).some((p) => /memory/.test(p)),
  );
} finally {
  rmSync(tmp, {
    recursive: true,
    force: true,
  });
}

if (failures) {
  console.error(`rmhos meta self-test: ${failures} failure(s)`);
  process.exit(1);
}
console.log('rmhos meta self-test: OK');
