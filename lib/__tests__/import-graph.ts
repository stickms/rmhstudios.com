/**
 * A static import-graph walk over the repo's own source, for the gates that ask
 * "what does this entry reach?" (redesign audit B1: `islands.test.ts`).
 *
 * It follows relative, `@/` and `@features/` specifiers (static, `export from`
 * and dynamic `import()`), skips `import type` / `export type` (erased, no code)
 * and `*.server` specifiers (stubbed out of every client bundle by
 * `stubServerFiles` in vite.shared.ts). Package imports are not followed; the
 * caller reads them from {@link packageImports}.
 */
import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import {
  dirname,
  join,
  resolve,
} from 'node:path';

export const ROOT =
  join(
    __dirname,
    '..',
    '..',
  );
const EXTS =
  [
    '.tsx',
    '.ts',
    '.mts',
    '.jsx',
    '.js',
    '.mjs',
  ];

const IMPORT_RE =
  /(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

export function resolveImport(
  from: string,
  spec: string,
):
  | string
  | null {
  let base: string;
  if (
    spec.startsWith(
      '@/',
    )
  )
    base =
      join(
        ROOT,
        spec.slice(
          2,
        ),
      );
  else if (
    spec.startsWith(
      '@features/',
    )
  )
    base =
      join(
        ROOT,
        'features',
        spec.slice(
          '@features/'
            .length,
        ),
      );
  else if (
    spec.startsWith(
      '.',
    )
  )
    base =
      resolve(
        dirname(
          from,
        ),
        spec,
      );
  else
    return null;
  base =
    base.replace(
      /\?.*$/,
      '',
    );
  for (const c of [
    base,
    ...EXTS.map(
      (
        e,
      ) =>
        base +
        e,
    ),
    ...EXTS.map(
      (
        e,
      ) =>
        join(
          base,
          'index' +
            e,
        ),
    ),
  ]) {
    if (
      existsSync(
        c,
      ) &&
      statSync(
        c,
      ).isFile()
    )
      return c;
  }
  return null;
}

function specifiers(
  file: string,
): string[] {
  if (
    !EXTS.some(
      (
        e,
      ) =>
        file.endsWith(
          e,
        ),
    )
  )
    return [];
  const out: string[] =
    [];
  for (const m of readFileSync(
    file,
    'utf8',
  ).matchAll(
    IMPORT_RE,
  )) {
    if (
      /^(?:import|export)\s+type\s/.test(
        m[0],
      )
    )
      continue;
    const spec =
      m[1] ??
      m[2] ??
      m[3];
    if (
      !spec ||
      /\.server(?:\.[cm]?[jt]sx?)?$/.test(
        spec,
      )
    )
      continue;
    out.push(
      spec,
    );
  }
  return out;
}

/** Every repo file `roots` reach. */
export function reach(
  roots: readonly string[],
): Set<string> {
  const seen =
    new Set<string>();
  const stack =
    [
      ...roots,
    ];
  while (
    stack.length
  ) {
    const f =
      stack.pop()!;
    if (
      seen.has(
        f,
      )
    )
      continue;
    seen.add(
      f,
    );
    for (const spec of specifiers(
      f,
    )) {
      const r =
        resolveImport(
          f,
          spec,
        );
      if (
        r
      )
        stack.push(
          r,
        );
    }
  }
  return seen;
}

/** The bare package specifiers (`react`, `@tanstack/react-router`, …) the given files import. */
export function packageImports(
  files: Iterable<string>,
): Set<string> {
  const out =
    new Set<string>();
  for (const f of files) {
    for (const spec of specifiers(
      f,
    )) {
      if (
        spec.startsWith(
          '.',
        ) ||
        spec.startsWith(
          '@/',
        ) ||
        spec.startsWith(
          '@features/',
        )
      )
        continue;
      out.add(
        spec,
      );
    }
  }
  return out;
}
