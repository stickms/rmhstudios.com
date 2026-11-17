/**
 * RMHVibe — project text format, shared by the server bundler and the client
 * progress panel.
 *
 * The model answers with "SLUG/TITLE/DESCRIPTION/DEPS … ===FILES=== --- file: <path> ---"
 * blocks. This module is the ONE parser for that format, and it tolerates a
 * half-streamed answer so the page can be built while the model is still writing.
 *
 * Client-safe and pure: no node, esbuild or zod imports.
 */

export type VibeProjectFiles =
  {
    deps: Record<
      string,
      string
    >;
    files: Record<
      string,
      string
    >;
  };

export type PartialVibeProject =
  VibeProjectFiles & {
    title:
      | string
      | null;
    /** Files whose header has been followed by another header (fully written). */
    done: string[];
    /** The last file, still streaming; null before `===FILES===` or any header. */
    writing:
      | string
      | null;
  };

export const FILES_MARKER =
  '===FILES===';
const FILE_HEADER_RE =
  /^---\s*file:\s*(.+?)\s*---\s*$/;

export const RESOLVE_EXTS =
  [
    '',
    '.tsx',
    '.ts',
    '.jsx',
    '.js',
    '.mjs',
    '.css',
    '.json',
  ];

/** Strip a code fence the model may have wrapped an individual file in. */
export function stripFences(
  s: string,
): string {
  return s
    .trim()
    .replace(
      /^```[a-z0-9]*\s*\n?/i,
      '',
    )
    .replace(
      /\n?```\s*$/,
      '',
    )
    .trim();
}

/** Normalise a virtual path: drop leading `./` or `/`. */
export function normalizePath(
  p: string,
): string {
  return p
    .trim()
    .replace(
      /^\.?\//,
      '',
    );
}

/** Parse `DEPS: three@0.183, @react-three/fiber@9` into { name: version }. */
export function parseDeps(
  raw: string,
): Record<
  string,
  string
> {
  const deps: Record<
    string,
    string
  > =
    {};
  for (const token of raw.split(
    ',',
  )) {
    const t =
      token.trim();
    if (
      !t
    )
      continue;
    // Last '@' separates version, but ignore a leading '@' on scoped names.
    const at =
      t.lastIndexOf(
        '@',
      );
    if (
      at >
      0
    )
      deps[
        t.slice(
          0,
          at,
        )
      ] =
        t.slice(
          at +
            1,
        );
    else
      deps[
        t
      ] =
        'latest';
  }
  return deps;
}

/** Read a `NAME: value` metadata line from the header section. */
export function headField(
  head: string,
  name: string,
):
  | string
  | null {
  const m =
    head.match(
      new RegExp(
        `^${name}:\\s*(.+)$`,
        'im',
      ),
    );
  return m
    ? m[1].trim()
    : null;
}

/** Parse a (possibly truncated) streamed answer. Never throws. */
export function parsePartialProject(
  raw: string,
): PartialVibeProject {
  const idx =
    raw.indexOf(
      FILES_MARKER,
    );
  const head =
    idx ===
    -1
      ? raw
      : raw.slice(
          0,
          idx,
        );
  const result: PartialVibeProject =
    {
      title:
        headField(
          head,
          'TITLE',
        ),
      deps: parseDeps(
        headField(
          head,
          'DEPS',
        ) ??
          '',
      ),
      files:
        {},
      done: [],
      writing:
        null,
    };
  if (
    idx ===
    -1
  )
    return result;

  const order: string[] =
    [];
  let current:
    | string
    | null =
    null;
  let buf: string[] =
    [];
  const flush =
    () => {
      if (
        current ===
        null
      )
        return;
      result.files[
        current
      ] =
        stripFences(
          buf.join(
            '\n',
          ),
        );
      order.push(
        current,
      );
    };
  for (const line of raw
    .slice(
      idx +
        FILES_MARKER.length,
    )
    .split(
      '\n',
    )) {
    const m =
      line.match(
        FILE_HEADER_RE,
      );
    if (
      m
    ) {
      flush();
      current =
        normalizePath(
          m[1],
        );
      buf =
        [];
    } else if (
      current !==
      null
    ) {
      buf.push(
        line,
      );
    }
  }
  flush();

  result.writing =
    order.length
      ? order[
          order.length -
            1
        ]
      : null;
  result.done =
    order.slice(
      0,
      -1,
    );
  return result;
}

/** Posix-style path join that collapses `.`/`..` segments. */
export function joinPath(
  base: string,
  rel: string,
): string {
  const out: string[] =
    [];
  for (const part of (
    base +
    rel
  ).split(
    '/',
  )) {
    if (
      part ===
        '' ||
      part ===
        '.'
    )
      continue;
    if (
      part ===
      '..'
    )
      out.pop();
    else
      out.push(
        part,
      );
  }
  return out.join(
    '/',
  );
}

/** The path a specifier names from `importer`, before extension probing. */
export function specTarget(
  spec: string,
  importer: string,
): string {
  const base =
    importer
      ? importer.replace(
          /[^/]*$/,
          '',
        )
      : '';
  return spec.startsWith(
    '.',
  )
    ? joinPath(
        base,
        spec,
      )
    : normalizePath(
        spec,
      );
}

/** Resolve a relative specifier against the virtual file map; null if missing. */
export function resolveInVfs(
  spec: string,
  importer: string,
  files: Record<
    string,
    string
  >,
):
  | string
  | null {
  const target =
    specTarget(
      spec,
      importer,
    );
  for (const ext of RESOLVE_EXTS)
    if (
      files[
        target +
          ext
      ]
    )
      return (
        target +
        ext
      );
  for (const ext of RESOLVE_EXTS)
    if (
      files[
        `${target}/index${ext}`
      ]
    )
      return `${target}/index${ext}`;
  return null;
}
