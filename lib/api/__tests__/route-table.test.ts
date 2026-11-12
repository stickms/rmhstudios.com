import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { compileRoutes } from '@/lib/api/route-match';
import {
  API_ROUTE_TABLE,
  apiRouteFiles,
  registeredApiRoutes,
  type ApiSource,
} from '@/lib/api/route-sources';
import type { Endpoint } from '@/lib/contract/endpoint';
import { renderRouteTable } from '../../../scripts/gen-api-route-table';

/**
 * The API route table (third-pass audit AR3): registered endpoints behind the one splat
 * `app/routes/api/$.ts`, next to the route files that remain.
 *
 * Everything here is static (the tree and the contract modules, no handler is loaded), so
 * it runs in the commit gate. It holds five things:
 *
 *  1. the generated table lists exactly the modules that register an endpoint;
 *  2. every registered path and method has exactly one handler: a path is registered
 *     once, no route file declares the same path, and each handler is a wrapped one,
 *     `implement(contract, …)` or a `defineHandler(…)` that has no contract yet;
 *  3. the router plus the table answer every path as one flat router over all of the
 *     templates would: no route file can take a registered path, and a registered path
 *     wins or loses to its neighbours as it did when it was a file;
 *  4. every contract resolves to exactly one handler, for its method;
 *  5. a handler bound with `implement()` binds its contract under that contract's own
 *     method and path.
 */

const ROOT = process.cwd();
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

const registered = registeredApiRoutes(ROOT);
const files = apiRouteFiles(ROOT);
/** The dispatcher itself is a route file, not an endpoint. */
const SPLAT = 'app/routes/api/$.ts';
const fileRoutes = files.filter((f) => f.file !== SPLAT);

const contractModules = {
  ...import.meta.glob<Record<string, unknown>>('../../**/*.contract.ts', { eager: true }),
  ...import.meta.glob<Record<string, unknown>>('../../../features/**/*.contract.ts', {
    eager: true,
  }),
};

const isEndpoint = (v: unknown): v is Endpoint =>
  typeof v === 'object' &&
  v !== null &&
  typeof (v as Endpoint).path === 'string' &&
  typeof (v as Endpoint).method === 'string' &&
  (v as Endpoint).path.startsWith('/api/');

/** module path as an import would spell it (`@/lib/x/y.contract`) -> its exports. */
const contractsByModule = new Map<string, Record<string, unknown>>();
for (const [key, mod] of Object.entries(contractModules)) {
  const repoPath = key.startsWith('../../../')
    ? key.slice('../../../'.length)
    : `lib/${key.slice('../../'.length)}`;
  contractsByModule.set(repoPath.replace(/\.ts$/, ''), mod);
}

function contractModuleOf(specifier: string): Record<string, unknown> | undefined {
  const repoPath = specifier.replace(/^@features\//, 'features/').replace(/^@\//, '');
  return contractsByModule.get(repoPath);
}

interface Binding {
  method: string;
  /** The first argument of `implement(…)`, resolved to the contract object. */
  contract: Endpoint | undefined;
  expr: string;
}

/** What `bindingsOf` found in one registered module. */
interface Bindings {
  /** `implement(contract, …)` handlers, each with its contract resolved. */
  bindings: Binding[];
  /** Methods bound with a bare `defineHandler(…)`: wrapped, no contract yet. */
  plain: string[];
  /** Methods bound with anything else. A registered module may not have any. */
  other: string[];
  /** Every method key, in source order (a repeat shows up twice). */
  methods: string[];
}

const bindingsCache = new Map<string, Bindings>();

/** The handlers a registered module declares, by how each is bound. */
function bindingsOf(source: ApiSource): Bindings {
  const cached = bindingsCache.get(source.file);
  if (cached) return cached;
  const found = readBindings(source);
  bindingsCache.set(source.file, found);
  return found;
}

function readBindings(source: ApiSource): Bindings {
  const text = read(source.file);
  const sf = ts.createSourceFile(source.file, text, ts.ScriptTarget.Latest, true);
  const imports = new Map<string, { module: string; name: string | null }>();
  let handlers: ts.ObjectLiteralExpression | undefined;
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && st.importClause && ts.isStringLiteral(st.moduleSpecifier)) {
      const module = st.moduleSpecifier.text;
      const named = st.importClause.namedBindings;
      if (named && ts.isNamespaceImport(named))
        imports.set(named.name.text, { module, name: null });
      if (named && ts.isNamedImports(named)) {
        for (const el of named.elements) {
          imports.set(el.name.text, { module, name: (el.propertyName ?? el.name).text });
        }
      }
    }
    if (ts.isVariableStatement(st)) {
      const decl = st.declarationList.declarations[0];
      const init = decl?.initializer;
      if (
        decl &&
        ts.isIdentifier(decl.name) &&
        decl.name.text === 'route' &&
        init &&
        ts.isCallExpression(init) &&
        init.expression.getText(sf) === 'apiRoute'
      ) {
        const arg = init.arguments[1];
        if (arg && ts.isObjectLiteralExpression(arg)) handlers = arg;
      }
    }
  }
  if (!handlers)
    throw new Error(`${source.file}: no \`export const route = apiRoute(path, { … })\``);

  const bindings: Binding[] = [];
  const plain: string[] = [];
  const other: string[] = [];
  const methods: string[] = [];
  for (const prop of handlers.properties) {
    const method = prop.name?.getText(sf) ?? '?';
    methods.push(method);
    const init = ts.isPropertyAssignment(prop) ? prop.initializer : undefined;
    const callee = init && ts.isCallExpression(init) ? init.expression.getText(sf) : undefined;
    if (callee === 'defineHandler') {
      plain.push(method);
      continue;
    }
    if (!init || !ts.isCallExpression(init) || callee !== 'implement') {
      other.push(method);
      continue;
    }
    const first = init.arguments[0];
    const expr = first?.getText(sf) ?? '';
    let contract: unknown;
    if (first && ts.isIdentifier(first)) {
      const from = imports.get(first.text);
      if (from?.name) contract = contractModuleOf(from.module)?.[from.name];
    } else if (first && ts.isPropertyAccessExpression(first) && ts.isIdentifier(first.expression)) {
      const from = imports.get(first.expression.text);
      if (from && from.name === null) contract = contractModuleOf(from.module)?.[first.name.text];
    }
    bindings.push({ method, contract: isEndpoint(contract) ? contract : undefined, expr });
  }
  return { bindings, plain, other, methods };
}

describe('the generated route table', () => {
  it('lists exactly the modules that register an endpoint (run `pnpm api:routes`)', () => {
    expect(read(API_ROUTE_TABLE)).toBe(renderRouteTable(ROOT));
  });

  it('holds only templates the matcher supports, each once', () => {
    expect(() =>
      compileRoutes(registered.map((r) => ({ path: r.template, value: r.file }))),
    ).not.toThrow();
  });

  it('a registered module sits in an api/ folder and is named for its path', () => {
    const misplaced = registered
      .filter(({ file, template }) => {
        const tail = template.replace(/^\/api\//, '').replace(/\//g, '.');
        return (
          !file.endsWith(`/api/${tail}.server.ts`) && file !== `lib/api/routes/${tail}.server.ts`
        );
      })
      .map((r) => `${r.file} (${r.template})`);
    expect(misplaced).toEqual([]);
  });

  it('every handler of a registered module is implement() or defineHandler()', () => {
    const offenders: string[] = [];
    for (const source of registered) {
      const { other } = bindingsOf(source);
      if (other.length) offenders.push(`${source.file}: ${other.join(', ')}`);
    }
    expect(
      offenders,
      'a handler written without the wrapper stays a route file under app/routes/api',
    ).toEqual([]);
  });

  it('every registered path and method has exactly one handler', () => {
    const problems: string[] = [];
    const KNOWN = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);
    const fileByTemplate = new Map(fileRoutes.map((f) => [f.template.toLowerCase(), f.file]));
    const seen = new Map<string, string>();
    for (const source of registered) {
      const key = source.template.toLowerCase();
      const twin = seen.get(key);
      if (twin) problems.push(`${source.template}: registered by ${twin} and ${source.file}`);
      seen.set(key, source.file);
      const file = fileByTemplate.get(key);
      if (file) problems.push(`${source.template}: registered by ${source.file}, and ${file}`);
      const { methods } = bindingsOf(source);
      if (methods.length === 0) problems.push(`${source.file}: no handlers`);
      for (const method of methods) {
        if (!KNOWN.has(method)) problems.push(`${source.file}: unknown method ${method}`);
      }
      if (new Set(methods).size !== methods.length) {
        problems.push(`${source.file}: a method is bound twice (${methods.join(', ')})`);
      }
    }
    expect(problems).toEqual([]);
  });
});

const flat = (paths: string[]) => {
  const root = createRootRoute();
  root.addChildren(paths.map((path) => createRoute({ getParentRoute: () => root, path })));
  const router = createRouter({ routeTree: root, history: createMemoryHistory() });
  return (path: string): string | null => {
    const [, rawParams, found] = router.getMatchedRoutes(path);
    return found && rawParams['**'] === undefined ? found.fullPath.replace(/\/$/, '') : null;
  };
};
const fileTemplates = fileRoutes.map((f) => f.template);
const registeredTemplates = registered.map((r) => r.template);
// What production has: the remaining route files and the splat.
const withSplat = flat([...fileTemplates, '/api/$']);
// What it must equal: one router over every template, as when they were all files.
const everything = flat([...fileTemplates, ...registeredTemplates]);
const table = compileRoutes(registeredTemplates.map((path) => ({ path, value: path })));

describe('the router and the table together', () => {
  /** Concrete paths: each template, and each with a sibling's static word in every param slot. */
  const samples = new Set<string>();
  const staticsAt = new Map<number, Set<string>>();
  const all = [...fileTemplates, ...registeredTemplates];
  for (const template of all) {
    template.split('/').forEach((segment, i) => {
      if (segment.startsWith('$')) return;
      if (!staticsAt.has(i)) staticsAt.set(i, new Set());
      staticsAt.get(i)!.add(segment);
    });
  }
  for (const template of all) {
    const segments = template.split('/');
    const concrete = (override?: [number, string]) =>
      segments
        .map((s, i) =>
          override?.[0] === i ? override[1] : s === '$' ? 'a/b' : s.startsWith('$') ? 'zz9' : s,
        )
        .join('/');
    samples.add(concrete());
    samples.add(`${concrete()}/`);
    samples.add(`${concrete()}/zz-extra`);
    segments.forEach((segment, i) => {
      if (!segment.startsWith('$') || segment === '$') return;
      for (const word of staticsAt.get(i) ?? []) samples.add(concrete([i, word]));
    });
  }

  it('finds route files and registered endpoints', () => {
    expect(fileTemplates.length).toBeGreaterThan(0);
    expect(samples.size).toBeGreaterThan(all.length);
  });

  it('answers every sampled path as one flat router over all templates would', () => {
    const wrong: string[] = [];
    for (const path of samples) {
      const expected = everything(path);
      const viaRouter = withSplat(path);
      const got = viaRouter === '/api/$' ? (table.match(path)?.template ?? null) : viaRouter;
      if (got !== expected) wrong.push(`${path}: was ${expected}, now ${got}`);
    }
    expect(
      wrong,
      'a route file now takes a path a registered endpoint used to answer (or the reverse). ' +
        'Register both, or keep both as route files.',
    ).toEqual([]);
  }, 60_000);
});

describe('contracts and their handlers', () => {
  const registeredByTemplate = new Map(registered.map((r) => [r.template, r]));
  const filesByTemplate = new Map<string, ApiSource[]>();
  for (const f of fileRoutes) {
    filesByTemplate.set(f.template, [...(filesByTemplate.get(f.template) ?? []), f]);
  }
  const contracts: Array<{ name: string; contract: Endpoint }> = [];
  for (const [module, exports] of contractsByModule) {
    for (const [name, value] of Object.entries(exports)) {
      if (isEndpoint(value)) contracts.push({ name: `${module}#${name}`, contract: value });
    }
  }

  it('reads the contract modules', () => {
    expect(contracts.length).toBeGreaterThan(500);
  });

  it('every contract path resolves to exactly one handler, for its method', () => {
    const problems: string[] = [];
    for (const { name, contract } of contracts) {
      // Ask the router, as a request would: a contract may be answered by a splat
      // (`/api/auth/get-session` by `/api/auth/$`) or a `$param` (`models/anims.json`).
      const path = contract.path.replace(/\$[A-Za-z0-9_]+/g, 'zz9');
      const viaRouter = withSplat(path);
      const template = viaRouter === '/api/$' ? table.match(path)?.template : viaRouter;
      const sources =
        viaRouter === '/api/$'
          ? [registeredByTemplate.get(template ?? '')].filter((s) => s !== undefined)
          : (filesByTemplate.get(template ?? '') ?? []);
      if (sources.length !== 1) {
        problems.push(`${name} ${contract.method} ${contract.path}: ${sources.length} handlers`);
        continue;
      }
      const source = sources[0]!;
      const declares =
        source.kind === 'registered'
          ? bindingsOf(source).methods.includes(contract.method)
          : new RegExp(`\\b${contract.method}\\s*:`).test(read(source.file));
      if (!declares) problems.push(`${name}: ${source.file} has no ${contract.method} handler`);
    }
    expect(problems).toEqual([]);
  });

  it('an implement() binding binds its contract under its own method and path', () => {
    const problems: string[] = [];
    for (const source of registered) {
      for (const binding of bindingsOf(source).bindings) {
        if (!binding.contract) {
          problems.push(`${source.file}: cannot resolve the contract \`${binding.expr}\``);
        } else if (
          binding.contract.method !== binding.method ||
          binding.contract.path !== source.template
        ) {
          problems.push(
            `${source.file}: ${binding.method} ${source.template} implements ` +
              `${binding.expr} (${binding.contract.method} ${binding.contract.path})`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
