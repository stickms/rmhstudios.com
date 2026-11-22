// state.meta.json ties the snapshot (state.zst) to the exact files it was taken
// against. A saved machine only makes sense with the disk, kernel and BIOS it
// was saved with (its page cache and device state describe them), so every
// consumer (smoke case 2, write-manifest, publish-r2) checks this first.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CMDLINE, MEMORY_BYTES } from './vm-options.mjs';

export const META_FILE = 'state.meta.json';
const INPUTS = ['rootfs.ext4', 'bzImage', 'seabios.bin', 'vgabios.bin'];

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** The meta describing the files in `dir` right now. */
export function computeMeta(dir) {
  const files = {};
  for (const name of INPUTS) files[name] = sha256(path.join(dir, name));
  return {
    files,
    state: sha256(path.join(dir, 'state.zst')),
    cmdline: CMDLINE,
    memoryBytes: MEMORY_BYTES,
  };
}

/** Problems with the meta in `dir` ([] when it matches the files on disk). */
export function metaProblems(dir) {
  let meta;
  try {
    meta = JSON.parse(readFileSync(path.join(dir, META_FILE), 'utf8'));
  } catch {
    return [`${META_FILE} is missing or unreadable (the snapshot was not taken against these files)`];
  }
  let now;
  try {
    now = computeMeta(dir);
  } catch (e) {
    return [`cannot hash the image files: ${e instanceof Error ? e.message : e}`];
  }
  const problems = [];
  for (const name of INPUTS) {
    if (meta.files?.[name] !== now.files[name])
      problems.push(`${name} differs from the one the snapshot was taken against`);
  }
  if (meta.state !== now.state) problems.push('state.zst differs from the one the meta describes');
  if (meta.cmdline !== now.cmdline) problems.push('the kernel command line changed since the snapshot');
  if (meta.memoryBytes !== now.memoryBytes) problems.push('the memory size changed since the snapshot');
  return problems;
}

/** Exits non-zero with a clear message unless the meta matches. */
export function requireMeta(dir, who) {
  const problems = metaProblems(dir);
  if (problems.length) {
    console.error(`${who}: refusing, state.zst does not belong to these files:\n  - ${problems.join('\n  - ')}`);
    console.error('Run pnpm rmhos:image (or pnpm rmhos:snapshot) to take a matching snapshot.');
    process.exit(1);
  }
}
