import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import {
  dirname,
  join,
} from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT =
  join(
    dirname(
      fileURLToPath(
        import.meta
          .url,
      ),
    ),
    '..',
  );
const OUT_DIR =
  join(
    ROOT,
    'ballast',
  );
const FILE_COUNT = 2500;
const FUNCTIONS_PER_FILE = 132;
const STEPS_PER_FUNCTION = 36;
const FILES_PER_GROUP = 100;
const OPERATORS =
  [
    '+',
    '-',
    '^',
  ];
const pad =
  (
    value,
    width,
  ) =>
    String(
      value,
    ).padStart(
      width,
      '0',
    );
const createRandom =
  (
    seed,
  ) => {
    let state =
      seed >>>
      0;
    return () => {
      state =
        (state +
          0x6d2b79f5) >>>
        0;
      let mixed =
        state;
      mixed =
        Math.imul(
          mixed ^
            (mixed >>>
              15),
          mixed |
            1,
        );
      mixed ^=
        mixed +
        Math.imul(
          mixed ^
            (mixed >>>
              7),
          mixed |
            61,
        );
      return (
        ((mixed ^
          (mixed >>>
            14)) >>>
          0) /
        4294967296
      );
    };
  };
const renderStep =
  (
    random,
  ) => {
    const operator =
      OPERATORS[
        Math.floor(
          random() *
            OPERATORS.length,
        )
      ];
    const operand =
      3 +
      Math.floor(
        random() *
          995,
      );
    return [
      '  acc =',
      `    (acc ${operator}`,
      `      ${operand}) |`,
      '    0;',
    ];
  };
const renderFile =
  (
    fileIndex,
  ) => {
    const random =
      createRandom(
        fileIndex *
          7919 +
          17,
      );
    const lines =
      [];
    for (
      let fn = 0;
      fn <
      FUNCTIONS_PER_FILE;
      fn += 1
    ) {
      lines.push(
        `export function ballast${pad(fileIndex, 4)}x${pad(fn, 3)}(`,
        '  seed,',
        ') {',
      );
      lines.push(
        '  let acc =',
        '    seed |',
        '    0;',
      );
      for (
        let step = 0;
        step <
        STEPS_PER_FUNCTION;
        step += 1
      )
        lines.push(
          ...renderStep(
            random,
          ),
        );
      lines.push(
        '  return acc;',
        '}',
      );
    }
    return `${lines.join('\n')}\n`;
  };
const pathFor =
  (
    fileIndex,
  ) =>
    join(
      OUT_DIR,
      `group-${pad(Math.floor(fileIndex / FILES_PER_GROUP), 2)}`,
      `ballast-${pad(fileIndex, 4)}.mjs`,
    );
const check =
  process.argv.includes(
    '--check',
  );
let stale = 0;
for (
  let fileIndex = 0;
  fileIndex <
  FILE_COUNT;
  fileIndex += 1
) {
  const target =
    pathFor(
      fileIndex,
    );
  const source =
    renderFile(
      fileIndex,
    );
  if (
    check
  ) {
    if (
      !existsSync(
        target,
      ) ||
      readFileSync(
        target,
        'utf8',
      ) !==
        source
    )
      stale += 1;
    continue;
  }
  mkdirSync(
    dirname(
      target,
    ),
    {
      recursive: true,
    },
  );
  writeFileSync(
    target,
    source,
  );
}
if (
  check &&
  stale >
    0
) {
  console.error(
    `ballast: ${stale} file(s) differ from scripts/gen-ballast.mjs output`,
  );
  process.exit(
    1,
  );
}
process.stdout.write(
  `ballast: ${FILE_COUNT} files ${check ? 'verified' : 'written'}\n`,
);
