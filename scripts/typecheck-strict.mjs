// Strict-islands typecheck (redesign audit A7). Runs tsc with tsconfig.strict.json
// and fails ONLY on errors located in the island's own files (its `include`
// list). tsc also checks imported non-island files under the strict flags; those
// errors are debt of the importee, not of the island, and are only counted.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { matchesGlob } from 'node:path';

const cfg =
  JSON.parse(
    readFileSync(
      'tsconfig.strict.json',
      'utf8',
    ).replace(
      /^\s*\/\/.*$/gm,
      '',
    ),
  );
const include =
  cfg.include;
const r =
  spawnSync(
    process.execPath,
    [
      'node_modules/typescript-native/bin/tsc',
      '--noEmit',
      '-p',
      'tsconfig.strict.json',
      '--pretty',
      'false',
    ],
    {
      encoding:
        'utf8',
      maxBuffer:
        64 *
        1024 *
        1024,
    },
  );
const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
const errs =
  out
    .split(
      '\n',
    )
    .filter(
      (
        l,
      ) =>
        /error TS\d+/.test(
          l,
        ),
    );
const inIsland =
  (
    l,
  ) => {
    const f =
      l.split(
        '(',
      )[0];
    return include.some(
      (
        g,
      ) =>
        matchesGlob(
          f,
          g,
        ),
    );
  };
const own =
  errs.filter(
    inIsland,
  );
if (
  r.status !==
    0 &&
  errs.length ===
    0
) {
  console.error(
    out,
  );
  process.exit(
    r.status ??
      1,
  );
}
if (
  own.length
) {
  console.error(
    own.join(
      '\n',
    ),
  );
  console.error(
    `\ntypecheck:strict: ${own.length} error(s) in strict-island files.`,
  );
  process.exit(
    1,
  );
}
console.warn(
  `typecheck:strict: island clean (${errs.length} strict-flag errors in imported non-island files ignored).`,
);
