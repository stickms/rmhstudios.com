/* eslint-disable no-console -- command-line tool output */
// Writes manifest.json for an image directory:
//   { version, kernel: { version, url, sha256 }, files: { [name]: { size, sha256 } } }
// version = first 12 hex of the sha256 over the boot inputs, in a fixed order:
// bzImage, rootfs.ext4, seabios.bin, vgabios.bin.
//
//   node manifest.mjs <dir> <kernelVersion> <kernelUrl> <kernelSha256>
import { createHash } from 'node:crypto';
import {
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const [
  dir,
  kernelVersion,
  kernelUrl,
  kernelSha256,
] =
  process.argv.slice(
    2,
  );
if (
  !dir ||
  !kernelVersion ||
  !kernelUrl ||
  !kernelSha256
) {
  console.error(
    'usage: manifest.mjs <dir> <kernelVersion> <kernelUrl> <kernelSha256>',
  );
  process.exit(
    2,
  );
}

const BOOT =
  [
    'bzImage',
    'rootfs.ext4',
    'seabios.bin',
    'vgabios.bin',
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
  const bytes =
    readFileSync(
      p,
    );
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
          kernelSha256,
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
