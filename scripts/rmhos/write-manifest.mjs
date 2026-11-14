/* eslint-disable no-console -- command-line tool output */
// The only writer of manifest.json for an image directory:
//   { version, kernel: { version, url, sha256 }, files: { [name]: { size, sha256 } } }
// version = first 12 hex of the sha256 over the boot inputs, in a fixed order:
// bzImage, rootfs.ext4, seabios.bin, vgabios.bin, state.zst. The snapshot is
// part of it: a new snapshot is a new published path.
//
//   node scripts/rmhos/write-manifest.mjs [dir]      (default public/rmhos-dev)
//
// The kernel entry comes from versions.env, the same file build.sh reads.
import { createHash } from 'node:crypto';
import {
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireMeta } from './image-meta.mjs';

const here =
  path.dirname(
    fileURLToPath(
      import.meta
        .url,
    ),
  );
const dir =
  path.resolve(
    process
      .argv[2] ??
      path.join(
        here,
        '..',
        '..',
        'public',
        'rmhos-dev',
      ),
  );

requireMeta(
  dir,
  'write-manifest',
);

const versions =
  Object.fromEntries(
    readFileSync(
      path.join(
        here,
        'versions.env',
      ),
      'utf8',
    )
      .split(
        '\n',
      )
      .filter(
        (
          l,
        ) =>
          /^[A-Z_0-9]+=/.test(
            l,
          ),
      )
      .map(
        (
          l,
        ) =>
          l.split(
            '=',
            2,
          ),
      ),
  );
const kernelVersion =
  versions.KERNEL_VERSION;
const kernelUrl = `https://cdn.kernel.org/pub/linux/kernel/v${versions.KERNEL_SERIES.split('.')[0]}.x/linux-${kernelVersion}.tar.xz`;

const BOOT =
  [
    'bzImage',
    'rootfs.ext4',
    'seabios.bin',
    'vgabios.bin',
    'state.zst',
  ];
const ALL =
  [
    ...BOOT,
    'packages.txt',
  ];
const sha =
  (
    b,
  ) =>
    createHash(
      'sha256',
    )
      .update(
        b,
      )
      .digest(
        'hex',
      );

const files =
  {};
const whole =
  createHash(
    'sha256',
  );
for (const name of ALL) {
  const p =
    path.join(
      dir,
      name,
    );
  let bytes;
  try {
    bytes =
      readFileSync(
        p,
      );
  } catch {
    console.error(
      `write-manifest: ${p} is missing`,
    );
    process.exit(
      1,
    );
  }
  files[
    name
  ] =
    {
      size: statSync(
        p,
      )
        .size,
      sha256:
        sha(
          bytes,
        ),
    };
  if (
    BOOT.includes(
      name,
    )
  )
    whole.update(
      bytes,
    );
}
const manifest =
  {
    version:
      whole
        .digest(
          'hex',
        )
        .slice(
          0,
          12,
        ),
    kernel:
      {
        version:
          kernelVersion,
        url: kernelUrl,
        sha256:
          versions.KERNEL_SHA256,
      },
    files,
  };
writeFileSync(
  path.join(
    dir,
    'manifest.json',
  ),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `manifest.json written, version ${manifest.version}`,
);
