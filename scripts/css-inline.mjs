// Read a stylesheet with the partial `@import './<stem>/<part>.css'` lines of a split entry sheet (redesign E4)
// replaced by the partial's text — the text the single file used to have. Mirrors lib/__tests__/css-source.ts.
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  join,
  resolve,
} from 'node:path';

export function readCssInlined(
  file,
) {
  const abs =
    resolve(
      file,
    );
  const partsDir =
    join(
      dirname(
        abs,
      ),
      basename(
        abs,
        '.css',
      ),
    ) +
    '/';
  return readFileSync(
    abs,
    'utf8',
  ).replace(
    /^@import\s+['"](\.\/[^'"]+\.css)['"]\s*;[ \t]*$/gm,
    (
      whole,
      spec,
    ) => {
      const target =
        resolve(
          dirname(
            abs,
          ),
          spec,
        );
      if (
        !target.startsWith(
          partsDir,
        ) ||
        !existsSync(
          target,
        )
      )
        return whole;
      return readCssInlined(
        target,
      ).replace(
        /\s+$/,
        '',
      );
    },
  );
}
