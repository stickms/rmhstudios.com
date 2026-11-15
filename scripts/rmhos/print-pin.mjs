/* eslint-disable no-console -- command-line tool output */
// Prints the TypeScript block to paste into features/rmhos/engine/image-manifest.ts after an image
// has been published, in the shape that file's published-image constant has:
//
//   export const PUBLISHED_IMAGE = { version, files: { bzImage, rootfs, state, seabios, vgabios } }
//   // each { size, sha256 }
//
// manifest.json names its files by their file names (bzImage, rootfs.ext4, state.zst, seabios.bin,
// vgabios.bin); the page names them by role. That mapping lives in ONE place, `toPin`, tested by
// print-pin.test.ts. If the constant's shape changes, change `toPin` / `renderPin` and the test.
//
//   node scripts/rmhos/print-pin.mjs [dir]      (default public/rmhos-dev)
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** manifest.json file name -> the role the page uses for it. */
export const ROLES = {
  bzImage: 'bzImage',
  'rootfs.ext4': 'rootfs',
  'state.zst': 'state',
  'seabios.bin': 'seabios',
  'vgabios.bin': 'vgabios',
};

/** The pin for a manifest: `{ version, files: { <role>: { size, sha256 } } }`. Throws on a gap. */
export function toPin(manifest) {
  if (!/^[0-9a-f]{12}$/.test(manifest?.version ?? '')) throw new Error('manifest has no valid version');
  const files = {};
  for (const [name, role] of Object.entries(ROLES)) {
    const f = manifest.files?.[name];
    if (!f || !Number.isSafeInteger(f.size) || f.size <= 0 || !/^[0-9a-f]{64}$/.test(f.sha256 ?? '')) {
      throw new Error(`manifest.files["${name}"] is missing or malformed`);
    }
    files[role] = { size: f.size, sha256: f.sha256 };
  }
  return { version: manifest.version, files };
}

/** The TypeScript source for a pin (2-space indent, single quotes, trailing commas). */
export function renderPin(pin, constName = 'PUBLISHED_IMAGE') {
  const lines = [`export const ${constName} = {`, `  version: '${pin.version}',`, '  files: {'];
  for (const [role, f] of Object.entries(pin.files)) {
    lines.push(
      `    ${role}: {`,
      `      size: ${f.size},`,
      `      sha256: '${f.sha256}',`,
      '    },',
    );
  }
  lines.push('  },', '};');
  return lines.join('\n');
}

/** What the workflow and publish-r2.mjs print at the end. */
export function pinReport(manifest) {
  const b = manifest.build ?? {};
  return [
    '',
    'Paste this into features/rmhos/engine/image-manifest.ts (replace the published-image constant):',
    '',
    renderPin(toPin(manifest)),
    '',
    `// built from commit ${b.commit ?? 'unknown'}${b.runUrl ? `, ${b.runUrl}` : ''}${b.date ? `, ${b.date}` : ''}`,
    '',
  ].join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dir = path.resolve(process.argv[2] ?? path.join(here, '..', '..', 'public', 'rmhos-dev'));
  try {
    console.log(pinReport(JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))));
  } catch (e) {
    console.error(`print-pin: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}
