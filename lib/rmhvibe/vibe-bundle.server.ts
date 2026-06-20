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
import {
  classifyImport,
  hostedStem,
  VIBE_PACKAGES,
  VIBE_PACKAGES_REVISION,
} from '@/lib/rmhvibe/vibe-packages';

/** Thrown when a model project fails to parse or compile; message is user-surfacable. */
export class BundleError extends Error {}

export type VibeProject = {
  slug: string;
  title: string;
  description: string;
  deps: Record<string, string>; // bare package name -> pinned version/range
  files: Record<string, string>; // normalized path -> source
};

// Public base URL where the vibe AI proxy lives. Baked into generated pages, so
// it must be the origin those pages are actually served from in production.
// Override in non-prod via VIBE_AI_BASE_URL (e.g. http://localhost:7005).
const VIBE_AI_BASE_URL = (process.env.VIBE_AI_BASE_URL || 'https://rmhstudios.com').replace(/\/$/, '');
const VIBE_AI_ENDPOINT = `${VIBE_AI_BASE_URL}/api/vibe/ai`;
const VIBE_AI_ORIGIN = new URL(VIBE_AI_BASE_URL).origin;

// Where the curated, pre-bundled "hosted" packages are served from — our OWN
// origin (see scripts/build-vibe-packages.ts + public/vibe-packages/). Generated
// pages point their importmap here instead of esm.sh, so the common case (React +
// large libs) never depends on a third-party CDN at view time.
const VIBE_PACKAGES_BASE = `${VIBE_AI_BASE_URL}/vibe-packages`;

// Strict CSP for bundled pages. Code/styles come from our own origin
// (VIBE_AI_ORIGIN — the self-hosted packages) plus esm.sh (the long-tail
// fallback); images/media are inline (data:/blob:); the only other network
// destination is our AI proxy, used by the injected window.RMHVibeAI helper —
// nothing else can exfiltrate to other origins. Combined with the viewer's
// sandboxed iframe (no allow-same-origin), pages are locked down.
const VIBE_CSP = [
  "default-src 'none'",
  "base-uri 'none'",
  `script-src 'unsafe-inline' blob: https://esm.sh ${VIBE_AI_ORIGIN}`,
  'worker-src blob:',
  `style-src 'unsafe-inline' https://esm.sh ${VIBE_AI_ORIGIN}`,
  'img-src data: blob:',
  'font-src data: https://esm.sh',
  'media-src data: blob:',
  `connect-src https://esm.sh ${VIBE_AI_ORIGIN}`,
].join('; ');

/**
 * Inline runtime helper injected into every generated page. Exposes a tiny,
 * key-free `window.RMHVibeAI` API that proxies to our server (which holds the
 * DeepSeek key). Generated code calls `RMHVibeAI.chat(...)` /
 * `RMHVibeAI.stream(...)` — it never sees a URL, key, or SSE framing.
 */
function vibeAIHelperScript(): string {
  const endpoint = JSON.stringify(VIBE_AI_ENDPOINT);
  // Plain ES5-ish IIFE so it runs without the import map / module graph.
  return `<script>
(function(){
  var ENDPOINT = ${endpoint};
  function toMessages(input){
    if (typeof input === 'string') return [{ role: 'user', content: input }];
    if (Array.isArray(input)) return input;
    return [];
  }
  function post(messages, opts, stream){
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messages, system: opts && opts.system, stream: !!stream })
    });
  }
  async function chat(input, opts){
    var res = await post(toMessages(input), opts, false);
    if (!res.ok) throw new Error('RMHVibeAI request failed (' + res.status + ')');
    var data = await res.json();
    return data.reply || '';
  }
  async function stream(input, onDelta, opts){
    var res = await post(toMessages(input), opts, true);
    if (!res.ok || !res.body) throw new Error('RMHVibeAI stream failed (' + res.status + ')');
    var reader = res.body.getReader();
    var dec = new TextDecoder();
    var buf = '', full = '';
    for (;;) {
      var r = await reader.read();
      if (r.done) break;
      buf += dec.decode(r.value, { stream: true });
      var frames = buf.split('\\n\\n');
      buf = frames.pop() || '';
      for (var i = 0; i < frames.length; i++) {
        var line = frames[i].split('\\n').find(function(l){ return l.indexOf('data:') === 0; });
        if (!line) continue;
        var json = line.slice(5).trim();
        if (!json) continue;
        var evt;
        try { evt = JSON.parse(json); } catch (e) { continue; }
        if (evt.type === 'delta' && evt.text) { full += evt.text; if (onDelta) onDelta(evt.text, full); }
        else if (evt.type === 'error') { throw new Error(evt.message || 'RMHVibeAI error'); }
      }
    }
    return full;
  }
  window.RMHVibeAI = { chat: chat, stream: stream, endpoint: ENDPOINT };
})();
<\/script>`;
}

/**
 * Self-contained runtime safety harness injected into every generated page.
 *
 * The server-side bundle only catches COMPILE errors — it never runs the code. So
 * a vibe that compiles but throws at runtime (a bad render, an undefined access),
 * or whose `esm.sh` fallback import fails to load, leaves `#root` empty and the
 * page shows the model's (often dark) background with nothing on it — the classic
 * "everything is black" failure. This harness turns those silent failures into a
 * visible, readable error instead of a blank screen.
 *
 * It runs as a CLASSIC (non-module) script in <head>, so it's installed before the
 * module bundle executes and survives the module throwing. It listens for:
 *  - the window 'error' event — the ONLY thing that catches runtime throws inside a
 *    `<script type="module">` (window.onerror does not), and also fires for failed
 *    resource/import loads;
 *  - 'unhandledrejection' — rejected promises from async render/effect code;
 *  - a boot watchdog — if the module never finishes executing (a SyntaxError or a
 *    failed import aborts the whole module silently), `window.__vibeBooted` is never
 *    set and we surface it after a grace period.
 *
 * A boot-time failure (nothing rendered) gets a full-screen card; an error after
 * the app already rendered gets a small dismissible toast, so a late error in a
 * working page doesn't blank out everything the user can see.
 */
function vibeRuntimeHarnessScript(): string {
  return `<script>
(function(){
  var shown = false;
  function rootEmpty(){
    var r = document.getElementById('root');
    return !r || r.childElementCount === 0;
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function show(title, detail){
    var fatal = rootEmpty();
    var prev = document.getElementById('__vibe_err__');
    // A fatal (boot) failure supersedes a toast; don't stack two toasts.
    if (prev && !fatal) return;
    if (prev) prev.remove();
    var box = document.createElement('div');
    box.id = '__vibe_err__';
    box.setAttribute('style', fatal
      ? 'position:fixed;inset:0;z-index:2147483647;background:#0f1117;color:#e6e6e6;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px;overflow:auto;-webkit-font-smoothing:antialiased'
      : 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#0f1117;color:#e6e6e6;font:12.5px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;padding:14px 16px;border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.55);max-height:42vh;overflow:auto');
    box.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin:0 0 10px;font-weight:600;font-size:14px;color:#ff6b6b">'
      + '<span aria-hidden="true">\\u26A0</span><span>' + esc(title) + '</span>'
      + '<button type="button" id="__vibe_err_x__" aria-label="Dismiss" style="margin-left:auto;background:none;border:0;color:#8a92a6;cursor:pointer;font-size:16px;line-height:1;padding:2px 4px">\\u2715</button>'
      + '</div>'
      + '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;color:#c7ccdb">' + esc(detail) + '</pre>';
    (document.body || document.documentElement).appendChild(box);
    var x = document.getElementById('__vibe_err_x__');
    if (x) x.onclick = function(){ box.remove(); };
    if (fatal) shown = true;
  }
  window.addEventListener('error', function(ev){
    // A failed resource/import load: ev.error is null, the target is the element.
    var t = ev && ev.target;
    if (t && t !== window && (t.src || t.href)) {
      show('Failed to load a dependency', 'Could not load:\\n' + (t.src || t.href) + '\\n\\nA package may be unavailable or blocked by the network.');
      return;
    }
    var e = ev && ev.error;
    show('This vibe hit a runtime error', e ? (e.stack || (e.name + ': ' + e.message)) : (ev && ev.message) || 'Unknown error');
  }, true);
  window.addEventListener('unhandledrejection', function(ev){
    var r = ev && ev.reason;
    show('Unhandled promise rejection', (r && (r.stack || r.message)) || String(r));
  });
  // Boot watchdog. A SyntaxError or a failed import aborts the module before
  // window.__vibeBooted is set; a generous grace period covers slow esm.sh cold loads.
  setTimeout(function(){
    if (shown) return;
    if (!window.__vibeBooted) {
      show('This vibe failed to start', 'The app script did not finish loading \\u2014 usually a syntax error in the generated code, or a package that failed to load. Try \\u201CCustomize\\u201D to regenerate.');
    } else if (rootEmpty()) {
      show('This vibe rendered nothing', 'The app loaded but mounted no content into #root. Try \\u201CCustomize\\u201D to regenerate.');
    }
  }, 8000);
})();
<\/script>`;
}

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

/** A file counts as a usable entry only if it has real (non-whitespace) source. */
function hasSource(files: Record<string, string>, path: string): boolean {
  return (files[path] ?? '').trim().length > 0;
}

function pickEntry(files: Record<string, string>): string {
  // Prefer a conventional entry name, but skip ones the model left empty — an
  // empty `index.tsx` is a common miss (the real code lands under another header)
  // and would otherwise bundle to nothing.
  for (const c of ENTRY_CANDIDATES) if (hasSource(files, c)) return c;
  const first = Object.keys(files).find((f) => /\.(tsx?|jsx?)$/.test(f) && hasSource(files, f));
  if (!first) {
    const names = Object.keys(files).join(', ') || 'none';
    throw new BundleError(`No non-empty entry file found (expected index.tsx). Files: ${names}.`);
  }
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

function loaderFor(p: string): 'ts' | 'tsx' | 'jsx' | 'js' | 'css' | 'json' {
  if (p.endsWith('.tsx')) return 'tsx';
  if (p.endsWith('.ts')) return 'ts';
  if (p.endsWith('.jsx')) return 'jsx';
  if (p.endsWith('.css')) return 'css';
  if (p.endsWith('.json')) return 'json';
  return 'js';
}

/**
 * esbuild plugin serving the model's files from an in-memory VFS, with tiered
 * resolution of bare npm imports (see vibe-packages.ts):
 *  - 'inline' packages are left for esbuild's default resolver, which pulls them
 *    from our real node_modules and bundles them straight into the page.
 *  - 'hosted'/'fallback' packages stay EXTERNAL and resolve at runtime via the
 *    page's importmap (our origin for hosted, esm.sh for fallback). Used hosted
 *    base names and fallback names are recorded so the importmap lists only what
 *    the page actually imports.
 *
 * Relative/absolute imports are resolved against the VFS only when they come from
 * a VFS file; relative imports inside a bundled node_modules package fall through
 * to esbuild's default file-system resolver.
 */
function virtualFilesPlugin(
  files: Record<string, string>,
  fallbackExternals: Set<string>,
): Plugin {
  return {
    name: 'vibe-vfs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') {
          return { path: normalizePath(args.path), namespace: 'vfs' };
        }
        const spec = args.path;
        const isBare = !spec.startsWith('.') && !spec.startsWith('/');
        if (isBare) {
          const cls = classifyImport(spec);
          if (cls.tier === 'inline') {
            // Defer to esbuild's default resolver → bundle it from node_modules.
            return undefined;
          }
          // hosted → importmap points at our origin; fallback → esm.sh (tracked).
          if (cls.tier === 'fallback') fallbackExternals.add(cls.name);
          return { path: spec, external: true };
        }
        // Relative/absolute import. Only the model's VFS files resolve against the
        // VFS; a relative import from a real node_modules file is esbuild's job.
        if (args.namespace !== 'vfs') return undefined;
        const resolved = resolveInVfs(spec, args.importer, files);
        if (!resolved) {
          return { errors: [{ text: `Cannot resolve '${spec}' from '${args.importer || 'entry'}'` }] };
        }
        return { path: resolved, namespace: 'vfs' };
      });

      build.onLoad({ filter: /.*/, namespace: 'vfs' }, (args) => {
        const contents = files[args.path];
        if (contents === undefined) return { errors: [{ text: `Missing file '${args.path}'` }] };
        // resolveDir lets esbuild resolve the model's bare 'inline' imports (clsx,
        // zustand, …) from the app's node_modules — VFS files have no real
        // directory of their own. process.cwd() is the app root in dev and the
        // /app working dir in production, both of which hold the inline deps.
        return { contents, loader: loaderFor(args.path), resolveDir: process.cwd() };
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
  // Long-tail packages the page imports that aren't in our curated registry —
  // populated by the resolver plugin and mapped to esm.sh in the importmap.
  const fallbackExternals = new Set<string>();

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
      // Inline packages are resolved from node_modules; mirror their production builds.
      define: { 'process.env.NODE_ENV': '"production"' },
      outdir: 'dist',
      plugins: [virtualFilesPlugin(project.files, fallbackExternals)],
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
  if (!js.trim()) {
    // The project parsed and compiled cleanly but emitted no JS — so the entry
    // had no runnable code. Surface enough to tell the two usual causes apart:
    // an entry that only imports CSS (css present), vs. a mis-parsed/empty entry.
    const inventory = Object.entries(project.files)
      .map(([p, src]) => `${p} (${src.trim().length}b)`)
      .join(', ');
    const hint = css.trim()
      ? `entry "${entry}" produced only styles, no script — it must mount the app, e.g. createRoot(...).render(<App/>)`
      : `entry "${entry}" was empty after parsing`;
    throw new BundleError(`Bundle produced no JavaScript output: ${hint}. Files: ${inventory}.`);
  }

  return assembleHtml({ title: project.title, js, css, deps: project.deps, fallbackExternals });
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
 * Build the runtime import map. EVERY hosted package (React + curated large libs)
 * is listed and points at our OWN origin's pre-bundled ESM files — no third-party
 * CDN. We list them all, not just the page's direct imports, because a hosted
 * bundle pulls in its own hosted deps (e.g. @react-three/fiber imports three);
 * importmap entries are lazy, so the browser only fetches the ones actually
 * imported. Deep subpaths we don't pre-build (e.g. `three/examples/jsm/...`) and
 * any package not in the registry fall back to esm.sh, with `?external=react,
 * react-dom` forcing them onto our single hosted React instance.
 */
function buildImportMap(
  deps: Record<string, string>,
  fallbackExternals: Set<string>,
): Record<string, string> {
  const imports: Record<string, string> = {};
  const hostedUrl = (stem: string) => `${VIBE_PACKAGES_BASE}/${stem}.js?r=${VIBE_PACKAGES_REVISION}`;

  for (const [name, entry] of Object.entries(VIBE_PACKAGES)) {
    if (entry.tier !== 'hosted') continue;
    imports[name] = hostedUrl(hostedStem(name));
    for (const sub of entry.subpaths ?? []) {
      imports[`${name}/${sub}`] = hostedUrl(hostedStem(name, sub));
    }
    // Deep subpaths beyond the pre-built ones → esm.sh. Skip for react/react-dom:
    // an unknown React subpath must NOT load a second React copy from the CDN.
    // Importmap requires a trailing-slash KEY to map to a trailing-slash VALUE, so
    // these carry no query string (the base import already shares our React).
    if (name === 'react' || name === 'react-dom') continue;
    const version = deps[name];
    imports[`${name}/`] = version ? `https://esm.sh/${name}@${version}/` : `https://esm.sh/${name}/`;
  }

  // Long-tail packages not in the curated registry → esm.sh, sharing our React.
  for (const name of fallbackExternals) {
    if (imports[name]) continue;
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
  fallbackExternals: Set<string>;
}): string {
  const importMap = JSON.stringify({
    imports: buildImportMap(opts.deps, opts.fallbackExternals),
  });
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
${vibeRuntimeHarnessScript()}
${vibeAIHelperScript()}
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
;window.__vibeBooted=true;
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
