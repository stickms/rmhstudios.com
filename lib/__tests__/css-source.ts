/**
 * Read a stylesheet the way the build sees it when it has been split (redesign E4).
 *
 * `app/globals.css` and `components/library/library.css`
 * are entry sheets: a short prelude plus ordered `@import './<stem>/<part>.css'`
 * lines. The source-reading gates were written against one big file; `readCss` returns the entry with each
 * partial import replaced, in place, by that partial's text — i.e. the text the single file used to have.
 *
 * Only imports of a sibling `<stem>/` directory are inlined; every other `@import` (fonts, `tailwindcss`) is left exactly as written, so a gate that looks at the entry still sees them.
 */
import {
  existsSync,
  readFileSync,
} from 'node:fs';
import {
  dirname,
  join,
  resolve,
  basename,
} from 'node:path';
import { fileURLToPath } from 'node:url';

export function readCss(
  file:
    | string
    | URL,
  root: string = process.cwd(),
): string {
  const abs =
    resolve(
      root,
      typeof file ===
        'string'
        ? file
        : fileURLToPath(
            file,
          ),
    );
  const text =
    readFileSync(
      abs,
      'utf8',
    );
  const stem =
    basename(
      abs,
      '.css',
    );
  const partsDir =
    join(
      dirname(
        abs,
      ),
      stem,
    ) +
    '/';
  return text.replace(
    /^@import\s+['"](\.\/[^'"]+\.css)['"]\s*;[ \t]*$/gm,
    (
      whole,
      spec: string,
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
      return readCss(
        target,
        root,
      ).replace(
        /\s+$/,
        '',
      );
    },
  );
}

/** The partial files an entry sheet imports (absolute paths), in import order. */
export function cssParts(
  file: string,
  root: string = process.cwd(),
): string[] {
  const abs =
    resolve(
      root,
      file,
    );
  const text =
    readFileSync(
      abs,
      'utf8',
    );
  const stem =
    basename(
      abs,
      '.css',
    );
  const partsDir =
    join(
      dirname(
        abs,
      ),
      stem,
    ) +
    '/';
  const out: string[] =
    [];
  for (const m of text.matchAll(
    /^@import\s+['"](\.\/[^'"]+\.css)['"]\s*;[ \t]*$/gm,
  )) {
    const target =
      resolve(
        dirname(
          abs,
        ),
        m[1] as string,
      );
    if (
      target.startsWith(
        partsDir,
      )
    )
      out.push(
        target,
      );
  }
  return out;
}
