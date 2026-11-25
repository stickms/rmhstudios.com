/**
 * Test doubles that know the schema (sprint 14, feature 19). TEST-TIME ONLY: nothing under `app/`, `components/`,
 * `features/*\/ui` or a `*.server.ts` may import this file (a source scan in `__tests__/query-shape.test.ts` holds it).
 *
 * A fake database accepts any argument object, so a query Postgres would reject passes the test that pins it. This
 * module rejects what Prisma rejects at run time: a field the model does not have, a `null` comparison or `nulls`
 * ordering on a required column, a nested select of a missing column, an unknown field in `data`. It also checks that a
 * response body can be serialised (`assertJsonSafe`), which `Response.json` cannot do for a `BigInt`.
 *
 * Why the schema source and not `Prisma.dmmf`: the client's runtime model is slim. Its fields carry only `name`,
 * `kind`, `type` and `relationName`, with no `isRequired` and no `isList`, so it cannot tell an optional column from a
 * required one, which is the one fact the `null` rules need. The map is therefore parsed from `prisma/schema/**` and
 * `Prisma.dmmf` is only used by the test that cross-checks names.
 *
 * Out of scope: value types beyond `null` (tsc), raw SQL (integration runs it against Postgres).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── The model map ────────────────────────────────────────────────────────────────────────────────────────────────

export type FieldKind = 'scalar' | 'object' | 'enum';

export interface FieldInfo {
  name: string;
  /** A scalar type, an enum name or a model name. */
  type: string;
  /** `object` is a relation to another model. */
  kind: FieldKind;
  optional: boolean;
  list: boolean;
}

export interface ModelInfo {
  name: string;
  fields: Map<string, FieldInfo>;
  /** Compound unique / id keys (`userId_itemId`) and the fields they join. */
  compound: Map<string, string[]>;
}

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'prisma', 'schema');

function schemaFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...schemaFiles(full));
    else if (entry.endsWith('.prisma')) out.push(full);
  }
  return out.sort();
}

/** Drop a `//` comment unless it sits inside a string literal. */
function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && line[i - 1] !== '\\') inString = !inString;
    else if (!inString && c === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

interface RawField {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
}
interface RawModel {
  name: string;
  fields: RawField[];
  blockAttributes: string[];
  fieldAttributes: Map<string, string>;
}

/** Parse one schema file into its models and enum names. Exported for the parser's own tests. */
export function parseSchemaSource(source: string): { models: RawModel[]; enums: string[] } {
  const models: RawModel[] = [];
  const enums: string[] = [];
  let current: RawModel | null = null;
  let inEnum = false;
  let pending = '';
  for (const raw of source.split('\n')) {
    const line = stripComment(raw).trim();
    if (!current && !inEnum) {
      const m = /^model\s+(\w+)\s*\{/.exec(line);
      if (m) {
        current = { name: m[1]!, fields: [], blockAttributes: [], fieldAttributes: new Map() };
        continue;
      }
      const e = /^enum\s+(\w+)\s*\{/.exec(line);
      if (e) {
        enums.push(e[1]!);
        inEnum = true;
      }
      continue;
    }
    if (line === '}') {
      if (current) models.push(current);
      current = null;
      inEnum = false;
      pending = '';
      continue;
    }
    if (inEnum || !current || !line) continue;
    // A field or block attribute can wrap over several lines inside its parentheses.
    pending = pending ? `${pending} ${line}` : line;
    if ((pending.match(/\(/g) ?? []).length !== (pending.match(/\)/g) ?? []).length) continue;
    const field = pending;
    pending = '';
    if (field.startsWith('@@')) {
      current.blockAttributes.push(field);
      continue;
    }
    const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(field);
    // `Unsupported("vector(1536)")` columns are not in the generated client, so no query can name them.
    if (!f || f[2] === 'Unsupported') continue;
    current.fields.push({ name: f[1]!, type: f[2]!, list: Boolean(f[3]), optional: Boolean(f[4]) });
    current.fieldAttributes.set(f[1]!, f[5] ?? '');
  }
  return { models, enums };
}

function buildModelMap(): Map<string, ModelInfo> {
  const rawModels: RawModel[] = [];
  const enumNames = new Set<string>();
  for (const file of schemaFiles(SCHEMA_DIR)) {
    const parsed = parseSchemaSource(readFileSync(file, 'utf8'));
    rawModels.push(...parsed.models);
    for (const e of parsed.enums) enumNames.add(e);
  }
  const modelNames = new Set(rawModels.map((m) => m.name));
  const map = new Map<string, ModelInfo>();
  for (const raw of rawModels) {
    const fields = new Map<string, FieldInfo>();
    for (const f of raw.fields) {
      const kind: FieldKind = modelNames.has(f.type) ? 'object' : enumNames.has(f.type) ? 'enum' : 'scalar';
      fields.set(f.name, {
        name: f.name,
        type: f.type,
        kind,
        optional: f.optional,
        list: f.list,
      });
    }
    const compound = new Map<string, string[]>();
    for (const attr of raw.blockAttributes) {
      if (!/^@@(unique|id)\s*\(/.test(attr)) continue;
      const list = /\[([^\]]*)\]/.exec(attr)?.[1];
      if (!list) continue;
      const cols = list
        .split(',')
        .map((c) => c.trim().replace(/\(.*$/, ''))
        .filter(Boolean);
      if (cols.length < 2) continue;
      const name = /\bname:\s*"([^"]+)"/.exec(attr)?.[1] ?? cols.join('_');
      compound.set(name, cols);
    }
    map.set(raw.name, { name: raw.name, fields, compound });
  }
  return map;
}

let modelMap: Map<string, ModelInfo> | null = null;
let accessorMap: Map<string, string> | null = null;

/** Every model of the schema, parsed once per process. */
export function schemaModels(): ReadonlyMap<string, ModelInfo> {
  modelMap ??= buildModelMap();
  return modelMap;
}

/** The Prisma client accessor: the model name with its first letter lowered (`RMHark` is `rMHark`). */
export function modelAccessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function resolveModel(nameOrAccessor: string): ModelInfo | undefined {
  const models = schemaModels();
  const direct = models.get(nameOrAccessor);
  if (direct) return direct;
  if (!accessorMap) {
    accessorMap = new Map();
    for (const name of models.keys()) accessorMap.set(modelAccessor(name), name);
  }
  const viaAccessor = accessorMap.get(nameOrAccessor);
  return viaAccessor ? models.get(viaAccessor) : undefined;
}

// ── The checker ──────────────────────────────────────────────────────────────────────────────────────────────────

type Obj = Record<string, unknown>;

const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A plain object literal, as opposed to a `Date`, a `Decimal` or a `Buffer`. */
function isPlain(v: unknown): v is Obj {
  if (!isObject(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const READ_KEYS = [
  'where',
  'select',
  'include',
  'omit',
  'orderBy',
  'cursor',
  'take',
  'skip',
  'distinct',
  'relationLoadStrategy',
];
const AGGREGATE_KEYS = ['_count', '_avg', '_sum', '_min', '_max'];

/** Operation → the argument keys Prisma accepts for it. */
const OPERATION_KEYS: Record<string, readonly string[]> = {
  findUnique: READ_KEYS,
  findUniqueOrThrow: READ_KEYS,
  findFirst: READ_KEYS,
  findFirstOrThrow: READ_KEYS,
  findMany: READ_KEYS,
  create: ['data', 'select', 'include', 'omit'],
  createMany: ['data', 'skipDuplicates'],
  createManyAndReturn: ['data', 'skipDuplicates', 'select', 'include', 'omit'],
  update: ['where', 'data', 'select', 'include', 'omit'],
  updateMany: ['where', 'data', 'limit'],
  updateManyAndReturn: ['where', 'data', 'limit', 'select', 'include', 'omit'],
  upsert: ['where', 'create', 'update', 'select', 'include', 'omit'],
  delete: ['where', 'select', 'include', 'omit'],
  deleteMany: ['where', 'limit'],
  count: ['where', 'orderBy', 'cursor', 'take', 'skip', 'select'],
  aggregate: ['where', 'orderBy', 'cursor', 'take', 'skip', ...AGGREGATE_KEYS],
  groupBy: ['where', 'orderBy', 'by', 'having', 'take', 'skip', ...AGGREGATE_KEYS],
};

/** The operations a model delegate has. */
export const MODEL_OPERATIONS: readonly string[] = Object.keys(OPERATION_KEYS);

/** Collects problems under a `Model.operation` prefix. */
class Report {
  readonly problems: string[] = [];
  constructor(private readonly prefix: string) {}
  add(path: string, message: string): void {
    this.problems.push(`${this.prefix} ${path}: ${message}`);
  }
}

function unknownField(r: Report, path: string, m: ModelInfo, key: string): void {
  r.add(path, `${m.name} has no field "${key}"`);
}

function checkNullScalar(r: Report, path: string, m: ModelInfo, f: FieldInfo, how: string): void {
  if (f.optional && !f.list) return;
  r.add(
    path,
    `${how} compares ${m.name}.${f.name} with null, but it is a ${f.list ? 'list' : 'required'} column (Prisma rejects a null comparison on a column that is not optional)`,
  );
}

function checkScalarFilter(r: Report, path: string, m: ModelInfo, f: FieldInfo, v: unknown): void {
  if (f.type === 'Json') return;
  if (v === null) {
    checkNullScalar(r, path, m, f, '`null`');
    return;
  }
  if (!isPlain(v)) return;
  for (const [op, arg] of Object.entries(v)) {
    if (op !== 'equals' && op !== 'not') continue;
    if (arg === null) checkNullScalar(r, `${path}.${op}`, m, f, `\`${op}: null\``);
    else if (op === 'not' && isPlain(arg)) checkScalarFilter(r, `${path}.not`, m, f, arg);
  }
}

function checkRelationFilter(r: Report, path: string, m: ModelInfo, f: FieldInfo, v: unknown): void {
  const target = f.type;
  if (v === null) {
    if (f.list || !f.optional) {
      r.add(path, `${m.name}.${f.name} is not an optional relation, so it cannot be compared with null`);
    }
    return;
  }
  if (!isObject(v)) {
    r.add(path, `a filter on relation ${m.name}.${f.name} must be an object`);
    return;
  }
  if (f.list) {
    for (const [k, w] of Object.entries(v)) {
      if (k === 'some' || k === 'every' || k === 'none') checkWhere(r, `${path}.${k}`, target, w);
      else r.add(`${path}.${k}`, `${m.name}.${f.name} is a list relation: filter it with some, every or none`);
    }
    return;
  }
  if ('is' in v || 'isNot' in v) {
    for (const [k, w] of Object.entries(v)) {
      if (k !== 'is' && k !== 'isNot') {
        r.add(`${path}.${k}`, `use is / isNot or a plain where on ${m.name}.${f.name}, not both`);
      } else if (w !== null) checkWhere(r, `${path}.${k}`, target, w);
    }
    return;
  }
  checkWhere(r, path, target, v);
}

function checkWhere(r: Report, path: string, modelName: string, where: unknown): void {
  if (where === undefined) return;
  const m = resolveModel(modelName);
  if (!m) {
    r.add(path, `unknown model "${modelName}"`);
    return;
  }
  if (!isObject(where)) {
    r.add(path, 'a where must be an object');
    return;
  }
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    if (k === 'AND' || k === 'OR' || k === 'NOT') {
      const parts = Array.isArray(v) ? v : [v];
      parts.forEach((w, i) => checkWhere(r, Array.isArray(v) ? `${path}.${k}[${i}]` : `${path}.${k}`, m.name, w));
      continue;
    }
    const f = m.fields.get(k);
    if (f) {
      if (f.kind === 'object') checkRelationFilter(r, `${path}.${k}`, m, f, v);
      else checkScalarFilter(r, `${path}.${k}`, m, f, v);
      continue;
    }
    const cols = m.compound.get(k);
    if (cols) {
      if (!isObject(v)) {
        r.add(`${path}.${k}`, `the compound key ${k} takes an object of ${cols.join(', ')}`);
        continue;
      }
      for (const [ck, cv] of Object.entries(v)) {
        const cf = m.fields.get(ck);
        if (!cf) unknownField(r, `${path}.${k}.${ck}`, m, ck);
        else checkScalarFilter(r, `${path}.${k}.${ck}`, m, cf, cv);
      }
      continue;
    }
    unknownField(r, `${path}.${k}`, m, k);
  }
}

function checkOrderBy(r: Report, path: string, modelName: string, orderBy: unknown): void {
  if (orderBy === undefined) return;
  const m = resolveModel(modelName);
  if (!m) {
    r.add(path, `unknown model "${modelName}"`);
    return;
  }
  if (Array.isArray(orderBy)) {
    orderBy.forEach((o, i) => checkOrderBy(r, `${path}[${i}]`, m.name, o));
    return;
  }
  if (!isObject(orderBy)) {
    r.add(path, 'an orderBy must be an object or a list of objects');
    return;
  }
  for (const [k, v] of Object.entries(orderBy)) {
    if (v === undefined) continue;
    if (k.startsWith('_')) {
      // Aggregate ordering (`_count`, `_sum`, … in groupBy): `'asc'`, or `{ field: 'asc' }`.
      if (isObject(v)) {
        for (const col of Object.keys(v)) {
          if (col !== '_all' && !m.fields.has(col)) unknownField(r, `${path}.${k}.${col}`, m, col);
        }
      }
      continue;
    }
    const f = m.fields.get(k);
    if (!f) {
      unknownField(r, `${path}.${k}`, m, k);
      continue;
    }
    if (f.kind === 'object') {
      if (f.list) {
        if (!isObject(v) || !('_count' in v)) {
          r.add(`${path}.${k}`, `${m.name}.${f.name} is a list relation: order by { _count } only`);
        }
      } else checkOrderBy(r, `${path}.${k}`, f.type, v);
      continue;
    }
    if (isObject(v) && 'nulls' in v && v.nulls !== undefined && (!f.optional || f.list)) {
      r.add(
        `${path}.${k}`,
        `\`nulls\` ordering on ${m.name}.${f.name}, which is a ${f.list ? 'list' : 'required'} column (Prisma only accepts nulls ordering on an optional scalar)`,
      );
    }
  }
}

function checkFieldList(
  r: Report,
  path: string,
  modelName: string,
  value: unknown,
  scalarOnly: boolean,
  allowAll = false,
): void {
  const m = resolveModel(modelName);
  if (!m || value === undefined) return;
  const names = Array.isArray(value) ? value : [value];
  names.forEach((n, i) => {
    const at = Array.isArray(value) ? `${path}[${i}]` : path;
    if (typeof n !== 'string') {
      r.add(at, 'expected a field name');
      return;
    }
    if (allowAll && n === '_all') return;
    const f = m.fields.get(n);
    if (!f) unknownField(r, at, m, n);
    else if (scalarOnly && f.kind === 'object') r.add(at, `${m.name}.${f.name} is a relation, not a column`);
  });
}

/** Arguments of a relation inside a `select` / `include` (and the read operations' own). */
function checkReadArgs(r: Report, path: string, modelName: string, args: Obj): void {
  const m = resolveModel(modelName);
  if (!m) {
    r.add(path, `unknown model "${modelName}"`);
    return;
  }
  if (args.select !== undefined && args.include !== undefined) {
    r.add(path, 'select and include cannot both be given at one level');
  }
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue;
    if (!READ_KEYS.includes(k)) r.add(`${path}.${k}`, `unknown argument "${k}"`);
    else if (k === 'where' || k === 'cursor') checkWhere(r, `${path}.${k}`, m.name, v);
    else if (k === 'orderBy') checkOrderBy(r, `${path}.${k}`, m.name, v);
    else if (k === 'distinct') checkFieldList(r, `${path}.${k}`, m.name, v, true);
    else if (k === 'omit') {
      if (isObject(v)) checkFieldList(r, `${path}.${k}`, m.name, Object.keys(v), true);
    } else if (k === 'select') checkSelection(r, `${path}.select`, m.name, v, 'select');
    else if (k === 'include') checkSelection(r, `${path}.include`, m.name, v, 'include');
  }
}

function checkSelection(
  r: Report,
  path: string,
  modelName: string,
  sel: unknown,
  mode: 'select' | 'include',
  allowAll = false,
): void {
  const m = resolveModel(modelName);
  if (!m) {
    r.add(path, `unknown model "${modelName}"`);
    return;
  }
  if (!isObject(sel)) {
    r.add(path, `a ${mode} must be an object`);
    return;
  }
  for (const [k, v] of Object.entries(sel)) {
    if (v === undefined) continue;
    if (k === '_count') {
      // `_count: true` or `_count: { select: { relation: true | { where } } }`.
      if (isObject(v) && isObject(v.select)) {
        for (const [rel, rv] of Object.entries(v.select)) {
          const rf = m.fields.get(rel);
          if (!rf || rf.kind !== 'object' || !rf.list) {
            r.add(`${path}._count.select.${rel}`, `${m.name}.${rel} is not a list relation`);
          } else if (isObject(rv) && rv.where !== undefined) {
            checkWhere(r, `${path}._count.select.${rel}.where`, rf.type, rv.where);
          }
        }
      }
      continue;
    }
    if (allowAll && k === '_all') continue;
    const f = m.fields.get(k);
    if (!f) {
      unknownField(r, `${path}.${k}`, m, k);
      continue;
    }
    if (f.kind === 'object') {
      if (isObject(v)) checkReadArgs(r, `${path}.${k}`, f.type, v);
      continue;
    }
    if (mode === 'include')
      r.add(`${path}.${k}`, `include names ${m.name}.${f.name}, which is a column, not a relation (use select)`);
    else if (typeof v !== 'boolean') r.add(`${path}.${k}`, `${m.name}.${f.name} is a column: select it with true`);
  }
}

const NESTED_WRITE_KEYS = [
  'create',
  'createMany',
  'connect',
  'connectOrCreate',
  'disconnect',
  'set',
  'delete',
  'update',
  'updateMany',
  'upsert',
  'deleteMany',
];

function checkNestedWrite(r: Report, path: string, f: FieldInfo, v: unknown): void {
  if (v === null || !isObject(v)) return;
  const target = f.type;
  for (const [op, arg] of Object.entries(v)) {
    if (arg === undefined) continue;
    const at = `${path}.${op}`;
    const each = (fn: (item: unknown, where: string) => void) => {
      if (Array.isArray(arg)) arg.forEach((item, i) => fn(item, `${at}[${i}]`));
      else fn(arg, at);
    };
    if (!NESTED_WRITE_KEYS.includes(op)) {
      r.add(at, `unknown nested write "${op}" on relation ${f.name}`);
    } else if (op === 'create') each((d, w) => checkData(r, w, target, d));
    else if (op === 'createMany') {
      if (isObject(arg)) each((d, w) => checkData(r, `${w}.data`, target, isObject(d) ? d.data : d));
    } else if (op === 'connect' || op === 'set' || op === 'disconnect' || op === 'delete') {
      if (isObject(arg) || Array.isArray(arg)) each((w, where) => checkWhere(r, where, target, w));
    } else if (op === 'connectOrCreate') {
      each((c, w) => {
        if (!isObject(c)) return;
        checkWhere(r, `${w}.where`, target, c.where);
        checkData(r, `${w}.create`, target, c.create);
      });
    } else if (op === 'update') {
      each((u, w) => {
        if (!isObject(u)) return;
        // `{ where?, data }` (a list relation, or a to-one update with a where) or the data itself; a model with a
        // column named `data` takes the second form only when no other key is present.
        if ('data' in u && Object.keys(u).every((key) => key === 'where' || key === 'data')) {
          checkWhere(r, `${w}.where`, target, u.where);
          checkData(r, `${w}.data`, target, u.data);
        } else checkData(r, w, target, u);
      });
    } else if (op === 'updateMany') {
      each((u, w) => {
        if (!isObject(u)) return;
        checkWhere(r, `${w}.where`, target, u.where);
        checkData(r, `${w}.data`, target, u.data);
      });
    } else if (op === 'upsert') {
      each((u, w) => {
        if (!isObject(u)) return;
        checkWhere(r, `${w}.where`, target, u.where);
        checkData(r, `${w}.create`, target, u.create);
        checkData(r, `${w}.update`, target, u.update);
      });
    } else if (op === 'deleteMany') {
      each((w, where) => checkWhere(r, where, target, w));
    }
  }
}

function checkData(r: Report, path: string, modelName: string, data: unknown): void {
  if (data === undefined) return;
  const m = resolveModel(modelName);
  if (!m) {
    r.add(path, `unknown model "${modelName}"`);
    return;
  }
  if (Array.isArray(data)) {
    data.forEach((d, i) => checkData(r, `${path}[${i}]`, m.name, d));
    return;
  }
  if (!isObject(data)) {
    r.add(path, 'data must be an object');
    return;
  }
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    const f = m.fields.get(k);
    if (!f) {
      unknownField(r, `${path}.${k}`, m, k);
      continue;
    }
    if (f.kind === 'object') {
      checkNestedWrite(r, `${path}.${k}`, f, v);
      continue;
    }
    const written = isPlain(v) && 'set' in v ? v.set : v;
    if (written === null && !f.optional && f.type !== 'Json') {
      r.add(`${path}.${k}`, `writes null to ${m.name}.${f.name}, which is a required column`);
    }
  }
}

function checkAggregates(r: Report, args: Obj, modelName: string): void {
  for (const key of AGGREGATE_KEYS) {
    const v = args[key];
    if (isObject(v)) checkFieldList(r, key, modelName, Object.keys(v), true, true);
  }
}

/**
 * Every way `args` would be rejected by Prisma for `model.operation`, as readable lines; empty when the shape is
 * valid. `model` is the model name (`SliceRun`) or its client accessor (`sliceRun`).
 */
export function queryShapeProblems(model: string, operation: string, args: unknown): string[] {
  const m = resolveModel(model);
  const r = new Report(`${m?.name ?? model}.${operation}`);
  if (!m) {
    r.add('model', `unknown model "${model}"`);
    return r.problems;
  }
  const allowed = OPERATION_KEYS[operation];
  if (!allowed) {
    r.add('operation', `unknown operation "${operation}"`);
    return r.problems;
  }
  if (args === undefined || args === null) return r.problems;
  if (!isObject(args)) {
    r.add('args', 'the arguments must be an object');
    return r.problems;
  }
  if (args.select !== undefined && args.include !== undefined) {
    r.add('args', 'select and include cannot both be given at one level');
  }
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) continue;
    if (!allowed.includes(k)) {
      r.add(k, `unknown argument "${k}" for ${operation}`);
      continue;
    }
    switch (k) {
      case 'where':
      case 'cursor':
        checkWhere(r, k, m.name, v);
        break;
      case 'orderBy':
        checkOrderBy(r, k, m.name, v);
        break;
      case 'distinct':
        checkFieldList(r, k, m.name, v, true);
        break;
      case 'by':
        checkFieldList(r, k, m.name, v, true);
        break;
      case 'omit':
        if (isObject(v)) checkFieldList(r, k, m.name, Object.keys(v), true);
        break;
      case 'select':
        checkSelection(r, k, m.name, v, 'select', operation === 'count');
        break;
      case 'include':
        checkSelection(r, k, m.name, v, 'include');
        break;
      case 'data':
      case 'create':
      case 'update':
        checkData(r, k, m.name, v);
        break;
      default:
        break;
    }
  }
  checkAggregates(r, args, m.name);
  return r.problems;
}

/** Throws with every problem when `args` would be rejected by Prisma for `model.operation`. */
export function assertQueryShape(model: string, operation: string, args: unknown): void {
  const problems = queryShapeProblems(model, operation, args);
  if (problems.length > 0) {
    throw new Error(`Query shape rejected by the schema:\n  ${problems.join('\n  ')}`);
  }
}

// ── The fake wrapper ─────────────────────────────────────────────────────────────────────────────────────────────

type Fn = (...args: unknown[]) => unknown;

const delegateCache = new WeakMap<object, object>();
const clientCache = new WeakMap<object, object>();

/**
 * A Proxy over the fake's own function, so a `vi.fn` stays a spy through the wrapper: `mock.calls`,
 * `mockResolvedValueOnce` and `toHaveBeenCalledWith` all reach the original. Only a call is intercepted.
 */
function checkedCall(fn: Fn, before: (args: unknown[]) => void, self: object): Fn {
  return new Proxy(fn, {
    apply(target, _thisArg, args: unknown[]) {
      before(args);
      return Reflect.apply(target, self, args);
    },
  });
}

/** A name every object inherits (`constructor`, `hasOwnProperty`, …), which test tooling reads; never an operation. */
const inherited = (prop: string): boolean => prop in Object.prototype;

function wrapDelegate(model: ModelInfo, delegate: object): object {
  const cached = delegateCache.get(delegate);
  if (cached) return cached;
  // One wrapper per operation name and function, so `db.x.findMany === db.x.findMany`, and a function the test
  // replaces (`db.x.findMany = vi.fn()`) is wrapped afresh. The same function under two operations is checked as each.
  const calls = new Map<string, { fn: Fn; wrapped: Fn }>();
  const wrapped = new Proxy(delegate, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof prop !== 'string' || typeof value !== 'function' || inherited(prop)) return value;
      if (!MODEL_OPERATIONS.includes(prop)) {
        throw new Error(`Query shape rejected by the schema:\n  ${model.name}.${prop}: unknown operation "${prop}"`);
      }
      const hit = calls.get(prop);
      if (hit && hit.fn === value) return hit.wrapped;
      const call = checkedCall(value as Fn, (args) => assertQueryShape(model.name, prop, args[0]), target);
      calls.set(prop, { fn: value as Fn, wrapped: call });
      return call;
    },
  });
  delegateCache.set(delegate, wrapped);
  return wrapped;
}

/**
 * An object that looks like a model delegate: it has at least one Prisma operation as a function. A `Map` or `Set`
 * hung on a fake (whose `delete` is a function) is a helper, not a delegate.
 */
function looksLikeDelegate(v: unknown): v is object {
  if (typeof v !== 'object' || v === null) return false;
  if (v instanceof Map || v instanceof Set || v instanceof WeakMap || v instanceof WeakSet) return false;
  return MODEL_OPERATIONS.some((op) => typeof Reflect.get(v, op) === 'function');
}

/**
 * A Proxy over any fake client that runs `assertQueryShape` before each `client.<model>.<operation>(args)` and
 * inside `$transaction(fn)`, then delegates. Raw SQL (`$queryRaw`, `$executeRaw`) and every other `$` member pass
 * through unchecked; integration runs raw SQL against Postgres. The fake's functions keep their identity as spies
 * (`vi.fn`'s `mock` and `mockResolvedValueOnce` work through the wrapper), the fake may hold only some models, and a
 * property that is neither a model nor delegate-shaped (a helper, a table, a `Map`) is returned untouched.
 */
export function shapeChecked<T extends object>(fake: T): T {
  const cached = clientCache.get(fake);
  if (cached) return cached as T;
  let transaction: { fn: Fn; wrapped: Fn } | null = null;
  const wrapped = new Proxy(fake, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop, target);
      if (typeof prop !== 'string') return value;
      if (prop === '$transaction' && typeof value === 'function') {
        if (transaction?.fn === value) return transaction.wrapped;
        // Only the interactive form hands over a client: wrap its callback so `tx.<model>.<op>` is checked too.
        const call = new Proxy(value as Fn, {
          apply(fn, _thisArg, [arg, ...rest]: unknown[]) {
            const callback =
              typeof arg === 'function'
                ? (tx: unknown) => (arg as Fn)(typeof tx === 'object' && tx !== null ? shapeChecked(tx) : tx)
                : arg;
            return Reflect.apply(fn, target, [callback, ...rest]);
          },
        });
        transaction = { fn: value as Fn, wrapped: call };
        return call;
      }
      if (prop.startsWith('$')) return value;
      const model = resolveModel(prop);
      if (model && modelAccessor(model.name) === prop && typeof value === 'object' && value !== null) {
        return wrapDelegate(model, value);
      }
      if (!model && looksLikeDelegate(value)) {
        throw new Error(
          `Query shape rejected by the schema:\n  ${prop}: unknown model "${prop}" (no model has this client accessor)`,
        );
      }
      return value;
    },
  });
  clientCache.set(fake, wrapped);
  return wrapped;
}

// ── The JSON check ───────────────────────────────────────────────────────────────────────────────────────────────

function describePath(path: string): string {
  return path === '' ? '(root)' : path;
}

function jsonProblem(value: unknown, path: string, ancestors: object[]): string | null {
  switch (typeof value) {
    case 'bigint':
      return `${describePath(path)}: a BigInt cannot be serialised (convert it with Number() or String())`;
    case 'function':
      return `${describePath(path)}: a function cannot be serialised`;
    case 'symbol':
      return `${describePath(path)}: a Symbol cannot be serialised`;
    case 'number':
      return Number.isFinite(value)
        ? null
        : `${describePath(path)}: ${String(value)} is not a finite number and serialises as null`;
    case 'object': {
      if (value === null) return null;
      if (ancestors.includes(value)) return `${describePath(path)}: a circular reference`;
      const toJson: unknown = Reflect.get(value, 'toJSON');
      if (typeof toJson === 'function') {
        // JSON.stringify serialises what `toJSON` returns (a Date, a Decimal), so that is what is checked.
        return jsonProblem((toJson as Fn).call(value), path, [...ancestors, value]);
      }
      const next = [...ancestors, value];
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const p = jsonProblem(value[i], `${path}[${i}]`, next);
          if (p) return p;
        }
        return null;
      }
      for (const [k, v] of Object.entries(value)) {
        const p = jsonProblem(v, path === '' ? k : `${path}.${k}`, next);
        if (p) return p;
      }
      return null;
    }
    default:
      return null;
  }
}

/**
 * Throws when `value` holds something `Response.json` throws on or silently corrupts: a `BigInt`, a function, a
 * `Symbol`, a cycle or a non-finite number, anywhere in it. The message carries the path to the bad value
 * (`proceeds`, `rows[2].amount`).
 */
export function assertJsonSafe(value: unknown): void {
  const problem = jsonProblem(value, '', []);
  if (problem) throw new Error(`Not JSON-safe at ${problem}`);
}
