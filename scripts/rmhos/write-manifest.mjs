/* eslint-disable no-console -- command-line tool output */
// The only writer of manifest.json for an image directory:
//   { version, kernel: { version, url, sha256 }, build: { commit, runUrl, date },
//     files: { [name]: { size, sha256 } } }
// version = first 12 hex of the sha256 over the boot inputs, in a fixed order:
// bzImage, rootfs.ext4, seabios.bin, vgabios.bin, state.zst. The snapshot is
// part of it: a new snapshot is a new published path. The other files listed
// (packages.txt, apk-installed.txt, the kernel source tarball) are published beside the
// image but are NOT boot inputs, so they are not in the hash: changing one cannot change what
// boots, and the publish step refuses to overwrite a version that already exists.
//
//   node scripts/rmhos/write-manifest.mjs [dir]      (default public/rmhos-dev)
//
// The kernel entry comes from versions.env, the same file build.sh reads; the build block from
// <dir>/build-info.json (written by build.sh: commit, workflow run URL, build date).
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { requireMeta } from './image-meta.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const BOOT = ['bzImage', 'rootfs.ext4', 'seabios.bin', 'vgabios.bin', 'state.zst'];

export function readVersions(file = path.join(here, 'versions.env')) {
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => /^[A-Z_0-9]+=/.test(l))
      .map((l) => l.split('=', 2)),
  );
}

const sha = (b) => createHash('sha256').update(b).digest('hex');

/** The version of the boot files in `dir`: first 12 hex of the sha256 over them, in BOOT order. */
export function bootVersion(dir) {
  const whole = createHash('sha256');
  for (const name of BOOT) {
    const p = path.join(dir, name);
    let bytes;
    try {
      bytes = readFileSync(p);
    } catch {
      throw new Error(`${p} is missing`);
    }
    whole.update(bytes);
  }
  return whole.digest('hex').slice(0, 12);
}

/** The manifest for the files in `dir`. Throws (naming the file) when one is missing. */
export function computeManifest(dir, versions = readVersions()) {
  const kernelVersion = versions.KERNEL_VERSION;
  const kernelFile = `linux-${kernelVersion}.tar.xz`;
  const kernelUrl = `https://cdn.kernel.org/pub/linux/kernel/v${versions.KERNEL_SERIES.split('.')[0]}.x/${kernelFile}`;
  const all = [...BOOT, 'packages.txt', 'apk-installed.txt', kernelFile];

  const files = {};
  const whole = createHash('sha256');
  for (const name of all) {
    const p = path.join(dir, name);
    let bytes;
    try {
      bytes = readFileSync(p);
    } catch {
      throw new Error(`${p} is missing`);
    }
    files[name] = {
      size: statSync(p).size,
      sha256: sha(bytes),
    };
    if (BOOT.includes(name)) whole.update(bytes);
  }

  let build = {
    commit: 'unknown',
    runUrl: '',
    date: '',
  };
  try {
    build = {
      ...build,
      ...JSON.parse(readFileSync(path.join(dir, 'build-info.json'), 'utf8')),
    };
  } catch {
    /* an image built by hand without build.sh: unknown provenance, said so */
  }
  return {
    version: whole.digest('hex').slice(0, 12),
    kernel: {
      version: kernelVersion,
      url: kernelUrl,
      sha256: versions.KERNEL_SHA256,
    },
    build,
    files,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = path.resolve(process.argv[2] ?? path.join(here, '..', '..', 'public', 'rmhos-dev'));
  requireMeta(dir, 'write-manifest');
  let manifest;
  try {
    manifest = computeManifest(dir);
  } catch (e) {
    console.error(`write-manifest: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
  writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`manifest.json written, version ${manifest.version}`);
}
