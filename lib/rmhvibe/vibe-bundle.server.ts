/**
 * RMHVibe — server-side project bundler.
 *
 * Turns a model-generated multi-file React/TypeScript project into a single,
 * self-contained HTML document for the sandboxed iframe viewer. The model writes
 * real .tsx/.ts/.css files with relative imports; esbuild transpiles + links them
 * (bare npm imports left EXTERNAL, resolved at runtime from esm.sh via an import
 * map), then we wrap the output in our HTML shell with a strict CSP.
 *
 * This replaces the old in-browser Babel approach: no 3MB Babel download, no
 * client-side transpile, and full TypeScript + multi-file support. Large npm
 * packages (three, @react-three/fiber, pixi, d3, …) stay external so esbuild
 * remains fast — the browser pulls them straight from esm.sh, same as before.
 *
 * Server-only (`.server.ts`): esbuild is a native binary, lazy-imported so it
 * never enters the client bundle.
 */

import type { Plugin } from 'esbuild';

/** Thrown when a model project fails to parse or compile; message is user-surfacable. */
export class BundleError extends Error {}

export type VibeProject = {
  slug: string;
  title: string;
  description: string;
  deps: Record<string, string>; // bare package name -> pinned version/range
  files: Record<string, string>; // normalized path -> source
};

// Strict CSP for bundled pages. No Babel/jsdelivr anymore — code, styles, and
// fonts come only from esm.sh; images/media are inline (data:/blob:); nothing
// can exfiltrate to other origins. Combined with the viewer's sandboxed iframe
// (no allow-same-origin), pages are locked down.
const VIBE_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  "script-src 'unsafe-inline' blob: https://esm.sh",
  'worker-src blob:',
  "style-src 'unsafe-inline' https://esm.sh",
  'img-src data: blob:',
  'font-src data: https://esm.sh',
  'media-src data: blob:',
  'connect-src https://esm.sh',
].join('; ');

const FILES_MARKER = '===FILES===';
const FILE_HEADER_RE = /^---\s*file:\s*(.+?)\s*---\s*$/;

/**
 * Parse the model's "SLUG/TITLE/DESCRIPTION/DEPS … ===FILES=== --- file: … ---"
 * response into a project. Returns `null` when there's no `===FILES===` marker so
 * the caller can fall back to the legacy single-HTML path.
 */
export function parseVibeProject(raw: string): VibeProject | null {
  const idx = raw.indexOf(FILES_MARKER);
  if (idx === -1) return null;

  const head = raw.slice(0, idx);
  const body = raw.slice(idx + FILES_MARKER.length);

  const field = (name: string) => {
    const m = head.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'));
    return m ? m[1].trim() : '';
  };

  const files = parseFiles(body);
  if (Object.keys(files).length === 0) return null;

  return {
    slug: field('SLUG'),
    title: field('TITLE'),
    description: field('DESCRIPTION'),
    deps: parseDeps(field('DEPS')),
    files,
  };
}

/** Parse `DEPS: three@0.183, @react-three/fiber@9` into { name: version }. */
function parseDeps(raw: string): Record<string, string> {
  const deps: Record<string, string> = {};
  for (const token of raw.split(',')) {
    const t = token.trim();
    if (!t) continue;
    // Last '@' separates version, but ignore a leading '@' on scoped names.
    const at = t.lastIndexOf('@');
    if (at > 0) deps[t.slice(0, at)] = t.slice(at + 1);
    else deps[t] = 'latest';
  }
  return deps;
}

/** Split the body into a { path: source } map on `--- file: <path> ---` headers. */
function parseFiles(body: string): Record<string, string> {
  const files: Record<string, string> = {};
  let current: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current) files[normalizePath(current)] = stripFences(buf.join('\n'));
  };
  for (const line of body.split('\n')) {
    const m = line.match(FILE_HEADER_RE);
    if (m) {
      flush();
      current = m[1].trim();
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  flush();
  return files;
}

/** Strip a code fence the model may have wrapped an individual file in. */
function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```[a-z0-9]*\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim();
}

/** Normalise a virtual path: drop leading `./` or `/`. */
function normalizePath(p: string): string {
  return p.trim().replace(/^\.?\//, '');
}

const ENTRY_CANDIDATES = ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'main.tsx', 'main.ts', 'App.tsx'];
const RESOLVE_EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '.mjs', '.css', '.json'];

function pickEntry(files: Record<string, string>): string {
  for (const c of ENTRY_CANDIDATES) if (files[c]) return c;
  const first = Object.keys(files).find((f) => /\.(tsx?|jsx?)$/.test(f));
  if (!first) throw new BundleError('No entry file found (expected index.tsx).');
  return first;
}

/** Resolve a relative specifier against the virtual file map; null if missing. */
function resolveInVfs(spec: string, importer: string, files: Record<string, string>): string | null {
  const base = importer ? importer.replace(/[^/]*$/, '') : '';
  const target = spec.startsWith('.') ? joinPath(base, spec) : normalizePath(spec);
  for (const ext of RESOLVE_EXTS) if (files[target + ext]) return target + ext;
  for (const ext of RESOLVE_EXTS) if (files[`${target}/index${ext}`]) return `${target}/index${ext}`;
  return null;
}

/** Posix-style path join that collapses `.`/`..` segments. */
function joinPath(base: string, rel: string): string {
  const out: string[] = [];
  for (const part of (base + rel).split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

/** Bare package name from a specifier: `@react-three/fiber/x` -> `@react-three/fiber`. */
function bareName(spec: string): string {
  if (spec.startsWith('@')) {
    const [scope, name] = spec.split('/');
    return name ? `${scope}/${name}` : scope;
  }
  return spec.split('/')[0];
}

function loaderFor(p: string): 'ts' | 'tsx' | 'jsx' | 'js' | 'css' | 'json' {
  if (p.endsWith('.tsx')) return 'tsx';
  if (p.endsWith('.ts')) return 'ts';
  if (p.endsWith('.jsx')) return 'jsx';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.json')) return 'json';
  return 'js';
}

/** esbuild plugin serving the model's files from memory; bare imports go external. */
function virtualFilesPlugin(files: Record<string, string>, externals: Set<string>): Plugin {
  return {
    name: 'vibe-vfs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') {
          return { path: normalizePath(args.path), namespace: 'vfs' };
        }
        const spec = args.path;
        if (!spec.startsWith('.') && !spec.startsWith('/')) {
          externals.add(bareName(spec));
          return { path: spec, external: true };
        }
        const resolved = resolveInVfs(spec, args.importer, files);
        if (!resolved) {
          return { errors: [{ text: `Cannot resolve '${spec}' from '${args.importer || 'entry'}'` }] };
        }
        return { path: resolved, namespace: 'vfs' };
      });

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
        const contents = files[args.path];
        if (contents === undefined) return { errors: [{ text: `Missing file '${args.path}'` }] };
        return { contents, loader: loaderFor(args.path) };
      });
    },
  };
}

/**
 * Bundle a parsed project into a self-contained HTML document. Throws BundleError
 * (with a readable message) if the project can't be compiled.
 */
export async function buildVibeHtml(project: Pick<VibeProject, 'title' | 'deps' | 'files'>): Promise<string> {
  const esbuild = await import('esbuild');
  const entry = pickEntry(project.files);
  const externals = new Set<string>();

  let result;
  try {
    result = await esbuild.build({
      entryPoints: [entry],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2020',
      jsx: 'automatic',
      minify: true,
      logLevel: 'silent',
      outdir: 'dist',
      plugins: [virtualFilesPlugin(project.files, externals)],
    });
  } catch (err) {
    throw new BundleError(formatBuildError(err));
  }

  let js = '';
  let css = '';
  for (const out of result.outputFiles ?? []) {
    if (out.path.endsWith('.css')) css += out.text;
    else if (out.path.endsWith('.js')) js += out.text;
  }
  if (!js.trim()) throw new BundleError('Bundle produced no JavaScript output.');

  return assembleHtml({ title: project.title, js, css, deps: project.deps, externals });
}

function formatBuildError(err: unknown): string {
  const e = err as {
    errors?: Array<{ text: string; location?: { file: string; line: number } | null }>;
    message?: string;
  };
  if (e.errors?.length) {
    return e.errors
      .slice(0, 5)
      .map((x) => x.text + (x.location ? ` (${x.location.file}:${x.location.line})` : ''))
      .join('; ');
  }
  return e.message || 'Unknown bundling error.';
}

/**
 * Build the runtime import map. react/react-dom are pinned; every other dep (and
 * any bare import esbuild left external) maps to esm.sh. `?external=react,react-dom`
 * forces react-consuming libs (r3f, framer-motion, …) to share the single React
 * instance from this map rather than bundling their own. Trailing-slash entries
 * enable subpath imports like `three/examples/jsm/...`.
 */
function buildImportMap(deps: Record<string, string>, externals: Set<string>): Record<string, string> {
  const imports: Record<string, string> = {
    react: 'https://esm.sh/react@19',
    'react/': 'https://esm.sh/react@19/',
    'react-dom': 'https://esm.sh/react-dom@19?external=react',
    'react-dom/': 'https://esm.sh/react-dom@19/',
    'react-dom/client': 'https://esm.sh/react-dom@19/client?external=react',
  };

  for (const name of new Set([...Object.keys(deps), ...externals])) {
    if (name === 'react' || name === 'react-dom') continue;
    const version = deps[name] ?? 'latest';
    const spec = version === 'latest' ? name : `${name}@${version}`;
    imports[name] = `https://esm.sh/${spec}?external=react,react-dom`;
    imports[`${name}/`] = `https://esm.sh/${spec}/`;
  }
  return imports;
}

function assembleHtml(opts: {
  title: string;
  js: string;
  css: string;
  deps: Record<string, string>;
  externals: Set<string>;
}): string {
  const importMap = JSON.stringify({ imports: buildImportMap(opts.deps, opts.externals) });
  // Neutralise any literal "</script>" the bundle/styles might contain so it
  // can't terminate the inline tags early.
  const js = opts.js.replace(/<\/script/gi, '<\\/script');
  const css = opts.css.replace(/<\/style/gi, '<\\/style');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${VIBE_CSP}">
<title>${escapeHtml(opts.title || 'Vibe')}</title>
<style>
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%}
#root{min-height:100%}
${css}
</style>
<script type="importmap">${importMap}</script>
</head>
<body>
<div id="root"></div>
<script type="module">
${js}
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
