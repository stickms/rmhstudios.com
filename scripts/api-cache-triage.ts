/**
 * API cache triage — classify every `GET`/`HEAD` handler under `app/routes/api/**`
 * as public-cacheable, private-cacheable or no-store.
 *
 * Why this exists: `auth: 'none'` is NOT proof that a response is anonymous-
 * invariant (docs/loading-audit-2026-08-11/03-api-caching.md §2: 46 of 69
 * `auth: 'none'` handlers read the session themselves). A `public` cache on one
 * of those serves the first caller's body to everyone. So the verdict here is
 * computed from what the handler *and the functions it calls* actually touch,
 * never from the declared `auth` mode alone.
 *
 * Method (AST, not regex over text — comments and string contents do not count):
 *   1. find every `GET`/`HEAD` entry of a route's `handlers` object;
 *   2. take the `defineHandler(options, fn)` options and the handler function;
 *   3. walk the handler body, and recursively (depth <= 5) the body of every
 *      function it calls that is imported from this repo or defined in the file,
 *      collecting signals: session / cookie / request-header reads, viewer-id
 *      use, writes (a GET with a side effect must not be cached), streaming,
 *      cookies set, randomness, outbound fetches;
 *   4. classify (see `classify`). The classification is a CANDIDATE: a `public`
 *      verdict means "the scan found nothing viewer-dependent", and each route
 *      still gets a human read before a policy is declared.
 *
 * Usage:
 *   pnpm tsx scripts/api-cache-triage.ts                # markdown table to stdout
 *   pnpm tsx scripts/api-cache-triage.ts --json         # machine-readable
 *   pnpm tsx scripts/api-cache-triage.ts --class public --undeclared
 *   pnpm tsx scripts/api-cache-triage.ts --apicache     # apiCache consumers report
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { CACHE_POLICY } from '../lib/api/cache-policies';

const ROOT = path.resolve(import.meta.dirname, '..');
const API_DIR = path.join(ROOT, 'app/routes/api');
const MAX_DEPTH = 5;

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type Signal =
  | 'session' // reads the session / current user
  | 'header' // reads request headers / cookies
  | 'ip' // reads the client IP (rate limiting is fine; an IP-dependent body is not)
  | 'viewer' // uses ctx userId / user / isAdmin after the wrapper resolved it
  | 'write' // database or store write on a GET
  | 'stream' // SSE / ReadableStream / WebSocket-ish
  | 'setcookie' // sets a cookie or redirects
  | 'random' // Math.random / randomUUID in the response path
  | 'external' // outbound fetch (third party latency / rate limits)
  | 'unresolved'; // imported repo function we could not locate (scan is incomplete)

/**
 * `review` = viewer-independent but the GET writes (lazy materialisation of a
 * daily row, a view counter...). Whether it may be cached is a human call: an
 * idempotent seed-on-first-read is safe to cache, a counter is not.
 */
type Klass = 'public' | 'private' | 'review' | 'no-store';

interface Finding {
  signal: Signal;
  via: string; // call path that surfaced it
  detail: string;
}

export interface Row {
  file: string; // repo-relative
  url: string; // /api/...
  method: 'GET' | 'HEAD';
  wrapper: 'defineHandler' | 'other';
  auth: string;
  feature: boolean;
  declared: string | null; // the cache option, as written
  etag: string | null;
  handRolled: string | null; // Cache-Control value(s) the body sets itself
  klass: Klass;
  reasons: string[];
  /**
   * `auth: 'optional'` but nothing in the handler (or its callees) uses the viewer, and
   * the rate limit is not per-user: the wrapper pays a session lookup per request for a
   * value nothing reads. `auth: 'none'` is behaviour-identical and cheaper.
   */
  deadSession: boolean;
  /** who may edit the options object (04-workstreams.md): WS3 unless WS2/WS6 own the file */
  owner: 'WS3' | 'WS2' | 'WS6';
  clientRefs: number; // call sites in client/server code referencing the URL
}

/* -------------------------------------------------------------------------- */
/* Module + function resolution                                               */
/* -------------------------------------------------------------------------- */

const sourceCache = new Map<string, ts.SourceFile | null>();

function loadSource(file: string): ts.SourceFile | null {
  if (sourceCache.has(file)) return sourceCache.get(file)!;
  let sf: ts.SourceFile | null;
  try {
    const text = fs.readFileSync(file, 'utf8');
    sf = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
  } catch {
    sf = null;
  }
  sourceCache.set(file, sf);
  return sf;
}

function resolveModule(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package: not ours
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* next */
    }
  }
  return null;
}

interface ImportBinding {
  module: string;
  /** exported name in the module, or '*' for a namespace import */
  imported: string;
}

function importBindings(sf: ts.SourceFile): Map<string, ImportBinding> {
  const map = new Map<string, ImportBinding>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const clause = st.importClause;
    if (!clause) continue;
    const module = st.moduleSpecifier.text;
    if (clause.name) map.set(clause.name.text, { module, imported: 'default' });
    const nb = clause.namedBindings;
    if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) {
        map.set(el.name.text, { module, imported: (el.propertyName ?? el.name).text });
      }
    } else if (nb && ts.isNamespaceImport(nb)) {
      map.set(nb.name.text, { module, imported: '*' });
    }
  }
  return map;
}

type FnNode = ts.FunctionLikeDeclaration;

/** Find a top-level function named `name` in `sf` (declaration or `const x = () =>`). */
function findLocalFunction(sf: ts.SourceFile, name: string): FnNode | null {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name && st.body) return st;
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name && d.initializer) {
          const init = unwrap(d.initializer);
          if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
        }
      }
    }
  }
  return null;
}

function unwrap(e: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(e) ||
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e)
  ) {
    e = e.expression;
  }
  return e;
}

/** Follow `export { x } from './y'` / `export * from './y'` when a name is not defined locally. */
function findExported(
  file: string,
  name: string,
  seen = new Set<string>(),
): { fn: FnNode; file: string } | 'unresolved' | null {
  if (seen.has(file)) return null;
  seen.add(file);
  const sf = loadSource(file);
  if (!sf) return null;
  const local = findLocalFunction(sf, name);
  if (local) return { fn: local, file };
  for (const st of sf.statements) {
    if (
      !ts.isExportDeclaration(st) ||
      !st.moduleSpecifier ||
      !ts.isStringLiteral(st.moduleSpecifier)
    )
      continue;
    const target = resolveModule(st.moduleSpecifier.text, file);
    if (!target) continue;
    if (!st.exportClause) {
      const r = findExported(target, name, seen);
      if (r && r !== 'unresolved') return r;
    } else if (ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        if (el.name.text === name) {
          const r = findExported(target, (el.propertyName ?? el.name).text, seen);
          if (r) return r;
        }
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Signal collection                                                          */
/* -------------------------------------------------------------------------- */

const WRITE_METHODS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);
// Redis / store writes that are side effects a cache would suppress.
// Redis writes that are user-visible side effects (counters, fan-out). Cache fills
// (`redisSetJSON`, `redisDel` of a cache key) are deliberately NOT here: a GET that
// memoises its own result is still a pure read.
const STORE_WRITES = new Set([
  'redisPublish',
  'redisIncr',
  'hset',
  'sadd',
  'incr',
  'incrby',
  'bufferView',
  'recordView',
  'incrementHotCounter',
]);
// Request headers that do not make a response viewer-dependent (conditional /
// transport negotiation). Every other header read is treated as personalising.
const NEUTRAL_HEADERS =
  /^(if-none-match|if-modified-since|if-range|range|accept-encoding|host|x-forwarded-proto|x-forwarded-host|content-type|content-length)$/i;
const SESSION_CALLS =
  /^(getSession|getInitialUser|getSessionUser|getCurrentUser|requireUser|requireSession|getViewer|resolveViewer|getOptionalUser|getUserFromRequest|getUserIdFromRequest|authenticate\w*|verifySession\w*)$/;
const IP_CALLS = /^(getClientIp|getRequestIp|getIp)$/;
const HEADER_CALLS = /^(getCookie|parseCookies?|getCookies|getRequestHeaders?)$/;
// Names callees use for "who is asking". Passing the wrapper's userId into them
// is caught by the `viewer` signal on the handler; inside a callee, a parameter
// like this means the function's result is per-viewer.
const VIEWER_PARAM = /^(viewerId|viewerUserId|currentUserId|requesterId|meId|callerId)$/;

interface Collected {
  findings: Finding[];
  /** literal values written to a Cache-Control header by the handler or its callees */
  handRolledCache: string[];
}

function collectFromFunction(
  fn: FnNode,
  file: string,
  via: string,
  depth: number,
  opts: { isRoot: boolean; auth: string },
  visited: Set<string>,
  out: Collected,
): void {
  const sf = fn.getSourceFile();
  const imports = importBindings(sf);

  // ctx destructuring in the ROOT handler: `{ userId, user, session, isAdmin, request }`
  const viewerNames = new Set<string>();
  if (opts.isRoot) {
    const p = fn.parameters[0];
    if (p && ts.isObjectBindingPattern(p.name)) {
      for (const el of p.name.elements) {
        const n = (el.propertyName ?? el.name) as ts.Identifier;
        if (ts.isIdentifier(n) && ['userId', 'user', 'session', 'isAdmin'].includes(n.text)) {
          if (ts.isIdentifier(el.name)) viewerNames.add(el.name.text);
        }
      }
    }
  } else {
    for (const p of fn.parameters) {
      if (ts.isIdentifier(p.name) && VIEWER_PARAM.test(p.name.text)) {
        out.findings.push({ signal: 'viewer', via, detail: `parameter ${p.name.text}` });
      }
      if (ts.isObjectBindingPattern(p.name)) {
        for (const el of p.name.elements) {
          if (ts.isIdentifier(el.name) && VIEWER_PARAM.test(el.name.text)) {
            out.findings.push({ signal: 'viewer', via, detail: `parameter ${el.name.text}` });
          }
        }
      }
    }
  }

  const body = fn.body;
  if (!body) return;
  const add = (signal: Signal, detail: string) => out.findings.push({ signal, via, detail });

  const visit = (node: ts.Node): void => {
    // string literals
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const s = node.text;
      if (/^cache-control$/i.test(s)) out.handRolledCache.push(cacheControlValue(node));
      if (/^set-cookie$/i.test(s)) add('setcookie', 'Set-Cookie');
      if (/text\/event-stream/i.test(s)) add('stream', 'text/event-stream');
    }
    if (ts.isIdentifier(node) && opts.isRoot && viewerNames.has(node.text)) {
      // a use of a ctx viewer binding, not its declaration
      const parent = node.parent;
      const isDecl = ts.isBindingElement(parent) && parent.name === node;
      const isPropName = ts.isPropertyAccessExpression(parent) && parent.name === node;
      if (!isDecl && !isPropName) add('viewer', `uses ${node.text}`);
    }
    if (
      ts.isIdentifier(node) &&
      (node.text === 'ReadableStream' || node.text === 'TransformStream')
    ) {
      add('stream', node.text);
    }
    if (ts.isIdentifier(node) && node.text === 'getSession') add('session', 'getSession');
    if (ts.isPropertyAccessExpression(node)) {
      const text = node.getText(sf);
      if (node.name.text === 'headers' && /^(request|req)$/.test(node.expression.getText(sf))) {
        // request.headers.get('x') with a neutral key is fine; anything else
        // (a personalising key, or the whole Headers handed to a function) is not.
        const gp = node.parent;
        if (
          ts.isPropertyAccessExpression(gp) &&
          gp.expression === node &&
          ts.isCallExpression(gp.parent)
        ) {
          const key = gp.parent.arguments[0];
          if (key && ts.isStringLiteralLike(key)) {
            if (!NEUTRAL_HEADERS.test(key.text)) add('header', `header ${key.text}`);
          } else add('header', 'request.headers.get(<dynamic>)');
        } else add('header', 'request.headers passed whole');
      }
      if (text === 'Math.random') add('random', 'Math.random');
      if (/^auth\.api\./.test(text) && node.expression.getText(sf) === 'auth.api')
        add('session', text);
    }
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      let name: string | null = null;
      let ns: string | null = null;
      if (ts.isIdentifier(callee)) name = callee.text;
      else if (ts.isPropertyAccessExpression(callee)) {
        name = callee.name.text;
        const root = rootIdentifier(callee.expression);
        ns = root;
        // prisma.model.write()
        if (WRITE_METHODS.has(name) && root && /^(prisma|tx|db|client)$/.test(root))
          add('write', `${callee.getText(sf).slice(0, 60)}`);
        if (name === '$executeRaw' || name === '$executeRawUnsafe') add('write', name);
        if (name === 'randomUUID') add('random', 'randomUUID');
        if (name === 'headers' && root === 'request') add('header', 'request.headers()');
        if (name === 'redirect' && root === 'Response') add('setcookie', 'redirect');
      }
      if (name) {
        if (SESSION_CALLS.test(name)) add('session', `${name}()`);
        if (HEADER_CALLS.test(name)) add('header', `${name}()`);
        if (IP_CALLS.test(name)) add('ip', `${name}()`);
        if (STORE_WRITES.has(name)) add('write', `${name}()`);
        if (name === 'fetch' || name === 'safeFetch') add('external', `${name}()`);
        if (depth < MAX_DEPTH) followCall(name, ns, imports, file, via, depth, visited, out);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
}

/** The value paired with a `'Cache-Control'` key: `h.set('Cache-Control', v)` or `{ 'Cache-Control': v }`. */
function cacheControlValue(node: ts.Node): string {
  const p = node.parent;
  let v: ts.Node | undefined;
  if (ts.isPropertyAssignment(p) && p.name === node) v = p.initializer;
  else if (ts.isCallExpression(p) && p.arguments[0] === node) v = p.arguments[1];
  if (!v) return '?';
  if (ts.isStringLiteralLike(v)) return v.text;
  return '<dynamic>';
}

function rootIdentifier(e: ts.Expression): string | null {
  let cur: ts.Expression = e;
  for (;;) {
    cur = unwrap(cur);
    if (ts.isIdentifier(cur)) return cur.text;
    if (ts.isPropertyAccessExpression(cur)) cur = cur.expression;
    else if (ts.isCallExpression(cur)) cur = cur.expression;
    else if (ts.isElementAccessExpression(cur)) cur = cur.expression;
    else return null;
  }
}

function followCall(
  name: string,
  ns: string | null,
  imports: Map<string, ImportBinding>,
  file: string,
  via: string,
  depth: number,
  visited: Set<string>,
  out: Collected,
): void {
  const sf = loadSource(file)!;
  // namespace import: ns.fn(...)
  let binding = ns ? imports.get(ns) : imports.get(name);
  let targetName = name;
  if (ns && binding && binding.imported !== '*') binding = undefined; // method on an imported object, not a module function
  if (!ns && binding) targetName = binding.imported === 'default' ? 'default' : binding.imported;

  let found: { fn: FnNode; file: string } | 'unresolved' | null = null;
  if (binding) {
    const target = resolveModule(binding.module, file);
    if (!target) {
      // Bare package (zod, prisma client...) or alias we cannot resolve: only repo-aliased ones matter.
      if (binding.module.startsWith('@/') || binding.module.startsWith('.')) {
        out.findings.push({ signal: 'unresolved', via, detail: `${name} from ${binding.module}` });
      }
      return;
    }
    found = findExported(target, targetName === 'default' ? name : targetName);
    if (!found) {
      // Not a plain function (class instance, object method, re-exported const): note incomplete.
      if (!/^(prisma|auth)/.test(name))
        out.findings.push({
          signal: 'unresolved',
          via,
          detail: `${name} in ${path.relative(ROOT, target)}`,
        });
      return;
    }
  } else if (!ns) {
    const local = findLocalFunction(sf, name);
    if (local) found = { fn: local, file };
  }
  if (!found || found === 'unresolved') return;
  // The cache layer itself publishes invalidations and memoises; that is not a
  // viewer-visible side effect of the GET that reads through it.
  if (/lib\/(cache|cached\.server)\.ts$/.test(found.file)) return;
  const key = `${found.file}#${name}`;
  if (visited.has(key)) return;
  visited.add(key);
  collectFromFunction(
    found.fn,
    found.file,
    `${via} > ${name}`,
    depth + 1,
    { isRoot: false, auth: '' },
    visited,
    out,
  );
}

/* -------------------------------------------------------------------------- */
/* Route scanning                                                             */
/* -------------------------------------------------------------------------- */

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** `app/routes/api/users/$id.wishlist.ts` -> `/api/users/$id/wishlist` */
function routeUrl(file: string): string {
  let rel = path.relative(path.join(ROOT, 'app/routes'), file).replace(/\.tsx?$/, '');
  // `[.]` is an escaped literal dot, keep it; bare `.` is a path separator.
  rel = rel
    .replace(/\[\.\]/g, '\uE000')
    .replace(/\./g, '/')
    .replace(/\uE000/g, '.');
  rel = rel.replace(/\/index$/, '');
  return '/' + rel;
}

/** File ownership per docs/server-perf-2026-10-21/04-workstreams.md (WS5 owns no api routes). */
export function ownerOf(url: string): Row['owner'] {
  const ws6 = [
    /^\/api\/og(\/|$)/,
    /^\/api\/feed\/image(\/|$)/,
    /^\/api\/image-proxy$/,
    /^\/api\/oembed$/,
    /^\/api\/embed(\/|$)/,
    /^\/api\/unfurl$/,
  ];
  if (ws6.some((r) => r.test(url))) return 'WS6';
  const ws2 =
    /^\/api\/(rmharks|feed|notifications|messages|chats|group-chats|profile|comments|explore)(\/|$)/;
  return ws2.test(url) ? 'WS2' : 'WS3';
}

function literalProp(obj: ts.ObjectLiteralExpression, name: string): ts.Expression | null {
  for (const p of obj.properties) {
    if (
      ts.isPropertyAssignment(p) &&
      (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
      p.name.text === name
    ) {
      return p.initializer;
    }
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) return p.name;
  }
  return null;
}

/** The cache option as written; a `CACHE_POLICY.x` reference is expanded to its spec. */
function describeCache(node: ts.Node, sf: ts.SourceFile): string {
  const text = compact(node, sf);
  const m = /^CACHE_POLICY\.(\w+)$/.exec(text);
  if (m && m[1] in CACHE_POLICY) {
    const spec = CACHE_POLICY[m[1] as keyof typeof CACHE_POLICY];
    return `${text} { visibility: '${spec.visibility}', maxAge: ${spec.maxAge}, sMaxAge: ${spec.sMaxAge}, staleWhileRevalidate: ${spec.staleWhileRevalidate} }`;
  }
  return text;
}

function compact(node: ts.Node, sf: ts.SourceFile): string {
  return node.getText(sf).replace(/\s+/g, ' ').replace(/,\s*}/g, ' }').slice(0, 160);
}

function scanRoute(file: string): Omit<Row, 'clientRefs'>[] {
  const sf = loadSource(file)!;
  const rows: Omit<Row, 'clientRefs'>[] = [];
  const url = routeUrl(file);

  const visitHandlers = (obj: ts.ObjectLiteralExpression) => {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop) && !ts.isMethodDeclaration(prop)) continue;
      const nm =
        prop.name &&
        (ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteral(prop.name)
            ? prop.name.text
            : '');
      if (nm !== 'GET' && nm !== 'HEAD') continue;

      let options: ts.ObjectLiteralExpression | null = null;
      let fn: FnNode | null = null;
      let wrapper: Row['wrapper'] = 'other';
      if (ts.isPropertyAssignment(prop)) {
        const init = unwrap(prop.initializer);
        if (
          ts.isCallExpression(init) &&
          ts.isIdentifier(init.expression) &&
          init.expression.text === 'defineHandler'
        ) {
          wrapper = 'defineHandler';
          const a0 = init.arguments[0] && unwrap(init.arguments[0]);
          if (a0 && ts.isObjectLiteralExpression(a0)) options = a0;
          const a1 = init.arguments[1] && unwrap(init.arguments[1]);
          if (a1 && (ts.isArrowFunction(a1) || ts.isFunctionExpression(a1))) fn = a1;
        } else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          fn = init;
        }
      } else {
        fn = prop;
      }

      const auth = options
        ? ((literalProp(options, 'auth') as ts.StringLiteral | null)?.text ?? 'required')
        : 'n/a';
      const cacheNode = options ? literalProp(options, 'cache') : null;
      const etagNode = options ? literalProp(options, 'etag') : null;
      const featureNode = options ? literalProp(options, 'feature') : null;

      const out: Collected = { findings: [], handRolledCache: [] };
      if (fn) {
        const visited = new Set<string>();
        // 'other' wrappers (raw handlers) have no ctx: the request is the argument.
        if (wrapper === 'other') {
          const p = fn.parameters[0];
          if (p && ts.isObjectBindingPattern(p.name)) {
            /* request destructured: header reads are caught via request.headers in the body */
          }
        }
        collectFromFunction(fn, file, nm, 0, { isRoot: true, auth }, visited, out);
      }

      const { klass, reasons } = classify(wrapper, auth, !!featureNode, out.findings, fn !== null);
      const rlNode = options ? literalProp(options, 'rateLimit') : null;
      const userScopedRl = !!rlNode && /scope\s*:\s*['"]user['"]/.test(rlNode.getText(sf));
      const viewerUse = out.findings.some(
        (f) => f.signal === 'session' || f.signal === 'header' || f.signal === 'viewer',
      );
      const deadSession =
        wrapper === 'defineHandler' &&
        auth === 'optional' &&
        !viewerUse &&
        !userScopedRl &&
        !featureNode &&
        fn !== null;
      rows.push({
        file: path.relative(ROOT, file),
        url,
        method: nm as 'GET' | 'HEAD',
        wrapper,
        auth,
        feature: !!featureNode,
        declared: cacheNode ? describeCache(cacheNode, sf) : null,
        etag: etagNode ? compact(etagNode, sf) : null,
        handRolled: out.handRolledCache.length
          ? [...new Set(out.handRolledCache)].join(' | ')
          : null,
        klass,
        reasons,
        deadSession,
        owner: ownerOf(url),
      });
    }
  };

  const find = (node: ts.Node) => {
    if (
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'handlers' &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      visitHandlers(node.initializer);
    }
    ts.forEachChild(node, find);
  };
  find(sf);
  return rows;
}

/**
 * The verdict. Order matters — the first matching rule wins:
 *   no-store  — the GET has a side effect, streams, sets cookies, or is admin-only
 *               (admin tooling should read fresh, and is not hot);
 *   private   — the response can depend on who is asking (session, cookie,
 *               header, viewer id), or the wrapper demanded a session;
 *   public    — nothing viewer-dependent was found in the handler or anything it
 *               calls (still needs the human read: see `unresolved`).
 */
function classify(
  wrapper: Row['wrapper'],
  auth: string,
  hasFeature: boolean,
  findings: Finding[],
  hasBody: boolean,
): { klass: Klass; reasons: string[] } {
  const by = (s: Signal) => findings.filter((f) => f.signal === s);
  const brief = (s: Signal) => {
    const fs_ = by(s);
    if (!fs_.length) return null;
    const d = [...new Set(fs_.map((f) => f.detail))].slice(0, 3).join(', ');
    return `${s}: ${d}${fs_.length > 3 ? '…' : ''}`;
  };
  const reasons: string[] = [];
  if (!hasBody) return { klass: 'no-store', reasons: ['handler body not statically resolvable'] };

  const viewerDep = by('session').length || by('header').length || by('viewer').length;
  if (
    by('stream').length ||
    by('setcookie').length ||
    (by('write').length && (viewerDep || auth === 'required'))
  ) {
    for (const s of ['write', 'stream', 'setcookie', 'session', 'viewer'] as Signal[]) {
      const b = brief(s);
      if (b) reasons.push(b);
    }
    return { klass: 'no-store', reasons };
  }
  if (auth === 'admin')
    return { klass: 'no-store', reasons: ['auth: admin (low traffic, must be fresh)'] };
  if (by('write').length) {
    reasons.push(
      brief('write')!,
      'viewer-independent GET that writes: idempotent seed or counter? (human review)',
    );
    return { klass: 'review', reasons };
  }

  if (auth === 'required' || hasFeature || viewerDep) {
    if (auth === 'required') reasons.push('auth: required');
    if (hasFeature) reasons.push('membership-gated');
    for (const s of ['session', 'header', 'viewer'] as Signal[]) {
      const b = brief(s);
      if (b) reasons.push(b);
    }
    return { klass: 'private', reasons };
  }

  const r = brief('random');
  if (r) {
    reasons.push(r);
    return { klass: 'no-store', reasons };
  }
  reasons.push(`auth: ${auth}`, 'no session/header/viewer/write/stream signal');
  const ip = brief('ip');
  if (ip) reasons.push(ip + ' (verify: rate limit only?)');
  const ext = brief('external');
  if (ext) reasons.push(ext);
  const unres = by('unresolved');
  if (unres.length)
    reasons.push(
      `UNRESOLVED(${unres.length}): ${[...new Set(unres.map((u) => u.detail))].slice(0, 3).join('; ')}`,
    );
  return { klass: 'public', reasons };
}

/* -------------------------------------------------------------------------- */
/* Call-frequency                                                             */
/* -------------------------------------------------------------------------- */

/** Count references to each `/api/...` URL in client + server source. */
function countClientRefs(urls: string[]): Map<string, number> {
  const dirs = ['app', 'components', 'hooks', 'lib', 'stores', 'server'].map((d) =>
    path.join(ROOT, d),
  );
  const refs: string[] = [];
  const scan = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (
        e.name === 'node_modules' ||
        e.name === '__tests__' ||
        (e.name === 'api' && dir.endsWith('routes'))
      )
        continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (
        /\.(tsx?|mjs)$/.test(e.name) &&
        !/\.test\./.test(e.name) &&
        e.name !== 'routeTree.gen.ts'
      ) {
        const text = fs.readFileSync(p, 'utf8');
        for (const m of text.matchAll(/[`'"](\/api\/[^`'"\s?#)]*)/g)) {
          // A route's own declaration is not a caller.
          if (/createFileRoute\(\s*$/.test(text.slice(Math.max(0, m.index! - 20), m.index!)))
            continue;
          // Count only references that look like reads: a `method: 'POST'` (etc.)
          // in the next 200 characters means the call is a mutation of the same URL.
          const window = text.slice(m.index!, m.index! + 200);
          if (/method\s*:\s*['"](POST|PUT|PATCH|DELETE)/.test(window.split(/\bfetch\(/)[0]))
            continue;
          refs.push(m[1].replace(/\$\{[^}]*\}/g, '$'));
        }
      }
    }
  };
  for (const d of dirs) scan(d);

  const counts = new Map<string, number>();
  const toRegex = (u: string) =>
    new RegExp(
      '^' +
        u
          .split('/')
          .map((seg) =>
            seg.startsWith('$') || seg.includes('$')
              ? '[^/]+'
              : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          )
          .join('/') +
        '/?$',
    );
  const matchers = urls.map((u) => [u, toRegex(u)] as const);
  for (const r of refs) {
    for (const [u, re] of matchers) {
      // a template ref like `/api/users/$` should match `/api/users/$id`
      if (re.test(r.replace(/\$$/, 'x').replace(/\/\$\//g, '/x/')))
        counts.set(u, (counts.get(u) ?? 0) + 1);
    }
  }
  return counts;
}

/* -------------------------------------------------------------------------- */
/* apiCache consumer report                                                   */
/* -------------------------------------------------------------------------- */

interface ApiCacheRow {
  file: string;
  /** imports `cached` / `invalidateCached` from lib/cached.server (coherent across processes) */
  onCached: boolean;
  gets: number;
  sets: number;
  /** `apiCache.invalidate*` call sites: each is a write path that expects readers to see the change */
  invalidates: number;
  keys: string[];
  /** other-process code (server/**: hubs, workers) imports this module, so a write there never reaches the web process's copy */
  importedByServerTier: string[];
}

function apiCacheReport(): ApiCacheRow[] {
  const files: string[] = [];
  const scan = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.output') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) scan(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
    }
  };
  for (const d of ['app', 'lib', 'server']) scan(path.join(ROOT, d));
  const texts = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')] as const));
  const serverTier = [...texts].filter(([f]) => f.startsWith(path.join(ROOT, 'server') + path.sep));

  const rows: ApiCacheRow[] = [];
  for (const [f, text] of texts) {
    if (f.endsWith('lib/cache.ts') || f.endsWith('lib/cached.server.ts')) continue;
    if (!/\bapiCache\./.test(text)) continue;
    const keys = new Set<string>();
    for (const m of text.matchAll(
      /apiCache\.(?:get|set)(?:<[^>]*>)?\(\s*([^,)]+(?:\([^)]*\))?)/g,
    )) {
      keys.add(m[1].replace(/\s+/g, ' ').slice(0, 48));
    }
    const spec = '@/' + path.relative(ROOT, f).replace(/\.tsx?$/, '');
    const importers = serverTier
      .filter(([, t]) => t.includes(`'${spec}'`) || t.includes(`"${spec}"`))
      .map(([sf]) => path.relative(ROOT, sf));
    rows.push({
      file: path.relative(ROOT, f),
      onCached: /from\s+['"]@\/lib\/cached\.server['"]/.test(text),
      gets: (text.match(/apiCache\.get\b/g) ?? []).length,
      sets: (text.match(/apiCache\.set\b/g) ?? []).length,
      invalidates: (text.match(/apiCache\.invalidate(?:Prefix)?\b/g) ?? []).length,
      keys: [...keys].slice(0, 3),
      importedByServerTier: importers,
    });
  }
  return rows.sort((a, b) => b.invalidates - a.invalidates || a.file.localeCompare(b.file));
}

/* -------------------------------------------------------------------------- */
/* Main                                                                       */
/* -------------------------------------------------------------------------- */

export function triage(): Row[] {
  const files = walk(API_DIR).filter((f) => !f.includes(`${path.sep}v1${path.sep}`));
  const base: Omit<Row, 'clientRefs'>[] = [];
  for (const f of files) base.push(...scanRoute(f));
  const counts = countClientRefs([...new Set(base.map((r) => r.url))]);
  return base.map((r) => ({ ...r, clientRefs: counts.get(r.url) ?? 0 }));
}

function md(rows: Row[]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const lines = [
    '| URL | GET refs | owner | auth | wrapper | verdict | declared | reasons |',
    '|---|---:|---|---|---|---|---|---|',
  ];
  for (const r of rows) {
    const declared = r.declared
      ? '`' + esc(r.declared.replace(/\s+/g, ' ')) + '`'
      : r.handRolled
        ? 'hand: `' + esc(r.handRolled) + '`'
        : '-';
    lines.push(
      `| \`${r.url}\` | ${r.clientRefs} | ${r.owner} | ${r.auth}${r.feature ? '+feature' : ''} | ${r.wrapper === 'defineHandler' ? 'dH' : 'raw'} | ${r.klass} | ${declared} | ${esc(r.reasons.join('; '))} |`,
    );
  }
  return lines.join('\n');
}

function summary(rows: Row[]): string {
  const total = rows.length;
  const dh = rows.filter((r) => r.wrapper === 'defineHandler');
  const declared = rows.filter((r) => r.declared || r.handRolled);
  const t = (k: Klass, pred: (r: Row) => boolean = () => true) =>
    rows.filter((r) => r.klass === k && pred(r)).length;
  return [
    `GET/HEAD handlers: ${total} (defineHandler ${dh.length}, other ${total - dh.length})`,
    `already declaring a policy: ${rows.filter((r) => r.declared).length} via cache option, ${rows.filter((r) => !r.declared && r.handRolled).length} hand-rolled Cache-Control`,
    `verdicts (all): public ${t('public')}, private ${t('private')}, review ${t('review')}, no-store ${t('no-store')}`,
    `verdicts (undeclared): public ${t('public', (r) => !r.declared && !r.handRolled)}, private ${t('private', (r) => !r.declared && !r.handRolled)}, review ${t('review', (r) => !r.declared && !r.handRolled)}, no-store ${t('no-store', (r) => !r.declared && !r.handRolled)}`,
    `declared total: ${declared.length}`,
  ].join('\n');
}

const print = (line = '') => void process.stdout.write(line + '\n');

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--apicache')) {
    const rows = apiCacheReport();
    if (args.includes('--json')) return void print(JSON.stringify(rows, null, 2));
    print('| file | on cached()? | get/set/inval | keys | also imported by server/** |');
    print('|---|---|---|---|---|');
    for (const r of rows) {
      print(
        `| \`${r.file}\` | ${r.onCached ? 'yes' : 'no'} | ${r.gets}/${r.sets}/${r.invalidates} | ${r.keys.map((k) => '`' + k + '`').join(' ')} | ${r.importedByServerTier.map((c) => '`' + c + '`').join(' ') || '-'} |`,
      );
    }
    return;
  }

  let rows = triage();
  const klass = args.includes('--class') ? args[args.indexOf('--class') + 1] : null;
  if (klass) rows = rows.filter((r) => r.klass === klass);
  if (args.includes('--undeclared')) rows = rows.filter((r) => !r.declared && !r.handRolled);
  rows.sort((a, b) => b.clientRefs - a.clientRefs || a.url.localeCompare(b.url));
  if (args.includes('--json')) return void print(JSON.stringify(rows, null, 2));
  print(summary(rows.length ? triage() : []));
  print();
  print(md(rows));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
