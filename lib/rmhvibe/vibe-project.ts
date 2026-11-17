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
      DELETE_HEADER_RE.test(
        line,
      )
    ) {
      // A delete line ends the current file; the deleted path is not a file.
      flush();
      current =
        null;
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
  // A trailing delete line closed the last file, so nothing is still streaming.
  const closed =
    current ===
    null;
  flush();

  result.writing =
    order.length &&
    !closed
      ? order[
          order.length -
            1
        ]
      : null;
  result.done =
    closed
      ? order
      : order.slice(
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

const DELETE_HEADER_RE = /^---\s*delete:\s*(.+?)\s*---\s*$/;

/** One header-line value: collapse any whitespace so it can't break the format. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Write a project in the exact generation format (files in sorted path order). */
export function serializeVibeProject(p: VibeProjectFiles & { title?: string; description?: string }): string {
  const out: string[] = [];
  if (p.title) out.push(`TITLE: ${oneLine(p.title)}`);
  if (p.description) out.push(`DESCRIPTION: ${oneLine(p.description)}`);
  const deps = Object.entries(p.deps)
    .map(([name, version]) => `${name}@${version}`)
    .join(', ');
  if (deps) out.push(`DEPS: ${deps}`);
  out.push(FILES_MARKER);
  for (const path of Object.keys(p.files).sort()) {
    out.push(`--- file: ${path} ---`, p.files[path]);
  }
  return out.join('\n') + '\n';
}

export type AppliedVibeEdit = VibeProjectFiles & {
  title: string | null;
  description: string | null;
  changed: string[];
  deleted: string[];
};

/**
 * Merge a model's edit answer onto a base project. Listed files replace the base
 * file wholesale, `--- delete: path ---` lines remove files, everything else is
 * kept as-is. Null when the answer has no `===FILES===` marker or changes no file.
 */
export function applyVibeEdit(base: VibeProjectFiles, editRaw: string): AppliedVibeEdit | null {
  const idx = editRaw.indexOf(FILES_MARKER);
  if (idx === -1) return null;
  const head = editRaw.slice(0, idx);
  const depsLine = headField(head, 'DEPS');

  const files = { ...base.files };
  const changed: string[] = [];
  const deleted: string[] = [];
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current === null) return;
    files[current] = stripFences(buf.join('\n'));
    if (!changed.includes(current)) changed.push(current);
  };
  for (const line of editRaw.slice(idx + FILES_MARKER.length).split('\n')) {
    const file = line.match(FILE_HEADER_RE);
    const del = line.match(DELETE_HEADER_RE);
    if (file) {
      flush();
      current = normalizePath(file[1]);
      buf = [];
    } else if (del) {
      flush();
      current = null;
      buf = [];
      const path = normalizePath(del[1]);
      if (path in files) {
        delete files[path];
        if (!deleted.includes(path)) deleted.push(path);
      }
      const at = changed.indexOf(path);
      if (at !== -1) changed.splice(at, 1);
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  if (changed.length === 0 && deleted.length === 0) return null;

  return {
    deps: depsLine === null ? base.deps : parseDeps(depsLine),
    files,
    title: headField(head, 'TITLE'),
    description: headField(head, 'DESCRIPTION'),
    changed,
    deleted,
  };
}
