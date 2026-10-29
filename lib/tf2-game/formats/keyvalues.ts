/**
 * Valve KeyValues text (SDK: KeyValues::LoadFromBuffer / KeyValues::RecursiveLoadFromBuffer)
 * and the BSP entity lump (a flat list of `{ "key" "value" … }` blocks, read by
 * the engine's MapEntity_ParseToken loop).
 *
 * KeyValues are a tree of `key value` / `key { … }` pairs. Keys are compared
 * case-insensitively but duplicates are preserved in file order (VMT proxies,
 * entity outputs and soundscripts rely on that). `#base` / `#include`
 * directives are surfaced, not resolved: the caller owns the file system.
 * Conditionals (`[$WIN32]`, `[!$X360]`) are kept on the node and, by default,
 * evaluated for a PC build.
 */

export class KvNode {
  /** Key as written (original case). */
  key: string;
  /** Leaf value, or null for a block. */
  value: string | null;
  /** Children of a block (empty for a leaf). */
  children: KvNode[];
  /** The conditional that followed this pair, e.g. "$WIN32" or "!$X360", if any. */
  condition: string | null;

  constructor(
    key: string,
    value: string | null,
    children: KvNode[] = [],
    condition: string | null = null,
  ) {
    this.key = key;
    this.value = value;
    this.children = children;
    this.condition = condition;
  }

  get isBlock(): boolean {
    return this.value === null;
  }

  /** First child with this key (case-insensitive). */
  get(key: string): KvNode | undefined {
    const k = key.toLowerCase();
    for (const c of this.children) if (c.key.toLowerCase() === k) return c;
    return undefined;
  }

  /** Every child with this key (case-insensitive), in file order. */
  getAll(key: string): KvNode[] {
    const k = key.toLowerCase();
    return this.children.filter((c) => c.key.toLowerCase() === k);
  }

  /** Leaf value of the first child with this key, or `fallback`. */
  getString(key: string, fallback = ''): string {
    const c = this.get(key);
    return c && c.value !== null ? c.value : fallback;
  }

  /** Numeric value of a child (KeyValues::GetFloat semantics: parse prefix, else fallback). */
  getNumber(key: string, fallback = 0): number {
    const c = this.get(key);
    if (!c || c.value === null) return fallback;
    const n = parseFloat(c.value);
    return Number.isFinite(n) ? n : fallback;
  }

  /** Walks a path of keys ("a/b/c"). */
  find(path: string): KvNode | undefined {
    let node: KvNode | undefined = this as KvNode;
    for (const part of path.split('/')) {
      if (!node) return undefined;
      node = node.get(part);
    }
    return node;
  }

  /** Plain-object view (last duplicate wins), handy for debugging and tests. */
  toObject(): Record<string, unknown> {
    const o: Record<string, unknown> = {};
    for (const c of this.children) o[c.key] = c.isBlock ? c.toObject() : c.value;
    return o;
  }
}

export interface KvDirective {
  type: 'base' | 'include';
  path: string;
}

export interface KvParseResult {
  /** A synthetic root whose children are the file's top-level pairs. */
  root: KvNode;
  /** `#base` / `#include` directives in file order. */
  directives: KvDirective[];
}

export interface KvParseOptions {
  /** Process `\n \t \\ \"` escapes inside quoted strings (KeyValues::UsesEscapeSequences). Default false. */
  escapes?: boolean;
  /**
   * Evaluate conditionals, dropping pairs whose condition is false. Receives the
   * condition name without `$` / `!` (e.g. "WIN32"). Default: a PC build
   * (WIN32/WINDOWS/POSIX/LINUX/OSX true, X360/PS3/GAMECONSOLE false); pass
   * `null` to keep every pair regardless of its condition.
   */
  evaluate?: ((name: string) => boolean) | null;
}

const PC_TRUE = new Set(['WIN32', 'WINDOWS', 'POSIX', 'LINUX', 'OSX', 'DECKARD']);
export const defaultKvCondition = (name: string): boolean => PC_TRUE.has(name.toUpperCase());

const enum Tok {
  End,
  String,
  Open,
  Close,
  Condition,
}

class Tokenizer {
  pos = 0;
  type: Tok = Tok.End;
  text = '';
  quoted = false;

  constructor(
    private readonly src: string,
    private readonly escapes: boolean,
  ) {}

  private skipWhitespaceAndComments(): void {
    const s = this.src;
    for (;;) {
      while (this.pos < s.length && s.charCodeAt(this.pos) <= 32) this.pos++;
      if (s.charCodeAt(this.pos) === 47 && s.charCodeAt(this.pos + 1) === 47) {
        // SDK: EatCPPComment
        while (this.pos < s.length && s[this.pos] !== '\n') this.pos++;
        continue;
      }
      if (s.charCodeAt(this.pos) === 47 && s.charCodeAt(this.pos + 1) === 42) {
        const end = s.indexOf('*/', this.pos + 2);
        this.pos = end < 0 ? s.length : end + 2;
        continue;
      }
      return;
    }
  }

  /** SDK: KeyValues::ReadToken */
  next(): Tok {
    this.skipWhitespaceAndComments();
    const s = this.src;
    this.quoted = false;
    if (this.pos >= s.length) return (this.type = Tok.End);
    const c = s[this.pos];
    if (c === '{') {
      this.pos++;
      this.text = '{';
      return (this.type = Tok.Open);
    }
    if (c === '}') {
      this.pos++;
      this.text = '}';
      return (this.type = Tok.Close);
    }
    if (c === '"') {
      this.pos++;
      this.quoted = true;
      let out = '';
      let start = this.pos;
      while (this.pos < s.length) {
        const ch = s[this.pos];
        if (ch === '"') break;
        if (this.escapes && ch === '\\' && this.pos + 1 < s.length) {
          out += s.slice(start, this.pos);
          const e = s[this.pos + 1];
          out += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          this.pos += 2;
          start = this.pos;
          continue;
        }
        this.pos++;
      }
      out += s.slice(start, this.pos);
      this.pos++; // closing quote (or EOF)
      this.text = out;
      return (this.type = Tok.String);
    }
    if (c === '[') {
      const end = s.indexOf(']', this.pos);
      const stop = end < 0 ? s.length : end;
      this.text = s.slice(this.pos + 1, stop).trim();
      this.pos = stop + 1;
      return (this.type = Tok.Condition);
    }
    // Unquoted: up to whitespace, a quote or a brace.
    const start = this.pos;
    while (this.pos < s.length) {
      const ch = s.charCodeAt(this.pos);
      if (ch <= 32 || ch === 34 || ch === 123 || ch === 125) break;
      this.pos++;
    }
    this.text = s.slice(start, this.pos);
    return (this.type = Tok.String);
  }

  /** Peeks for a conditional `[...]` and consumes it if present. */
  maybeCondition(): string | null {
    const save = this.pos;
    this.skipWhitespaceAndComments();
    if (this.src[this.pos] === '[') {
      this.next();
      return this.text;
    }
    this.pos = save;
    return null;
  }
}

/** Evaluates a KeyValues conditional expression like "$WIN32", "!$X360", "$WIN32||$POSIX". */
export function evaluateKvCondition(expr: string, isTrue: (name: string) => boolean): boolean {
  // SDK: KeyValues::EvaluateConditional (supports ! and || / &&, left to right)
  const orParts = expr.split('||');
  return orParts.some((orPart) =>
    orPart.split('&&').every((term) => {
      let t = term.trim();
      let neg = false;
      while (t.startsWith('!')) {
        neg = !neg;
        t = t.slice(1).trim();
      }
      if (t.startsWith('$')) t = t.slice(1);
      const v = isTrue(t);
      return neg ? !v : v;
    }),
  );
}

/** Parses KeyValues text into a tree. Never throws on malformed input; it stops at what it can read. */
export function parseKeyValues(text: string, options: KvParseOptions = {}): KvParseResult {
  const tz = new Tokenizer(text, options.escapes ?? false);
  const evaluate = options.evaluate === undefined ? defaultKvCondition : options.evaluate;
  const root = new KvNode('', null);
  const directives: KvDirective[] = [];

  const keep = (cond: string | null): boolean =>
    !cond || !evaluate || evaluateKvCondition(cond, evaluate);

  // Reads pairs into `parent` until a closing brace (or EOF at top level).
  const readBlock = (parent: KvNode, topLevel: boolean): void => {
    for (;;) {
      const t = tz.next();
      if (t === Tok.End) return;
      if (t === Tok.Close) {
        if (topLevel) continue; // stray brace — tolerate
        return;
      }
      if (t === Tok.Condition) continue; // dangling conditional — tolerate
      if (t === Tok.Open) {
        // Anonymous block: KeyValues allows `{ ... }` with an empty key at top level.
        const node = new KvNode('', null);
        readBlock(node, false);
        parent.children.push(node);
        continue;
      }
      const key = tz.text;
      if (topLevel && !tz.quoted && (key === '#base' || key === '#include')) {
        const p = tz.next();
        if (p === Tok.String)
          directives.push({ type: key === '#base' ? 'base' : 'include', path: tz.text });
        continue;
      }
      let cond = tz.maybeCondition();
      const v = tz.next();
      if (v === Tok.Open) {
        const node = new KvNode(key, null, [], cond);
        readBlock(node, false);
        const after = tz.maybeCondition();
        if (after) node.condition = cond = after;
        if (keep(cond)) parent.children.push(node);
      } else if (v === Tok.String) {
        const node = new KvNode(key, tz.text, [], cond);
        const after = tz.maybeCondition();
        if (after) node.condition = cond = after;
        if (keep(cond)) parent.children.push(node);
      } else if (v === Tok.Close) {
        // `key }` — malformed; treat key as empty-valued and close the block.
        parent.children.push(new KvNode(key, ''));
        if (!topLevel) return;
      } else {
        // EOF after key.
        parent.children.push(new KvNode(key, ''));
        return;
      }
    }
  };

  readBlock(root, true);
  return { root, directives };
}

/**
 * Parses a KeyValues file whose content is a single top-level block (VMTs,
 * gameinfo.txt, most scripts) and returns that block.
 */
export function parseKeyValuesBlock(text: string, options?: KvParseOptions): KvNode | null {
  const { root } = parseKeyValues(text, options);
  return root.children.find((c) => c.isBlock) ?? null;
}

// --- BSP entity lump --------------------------------------------------------

/** One entity from the BSP entity lump. Duplicate keys (outputs) are kept in order. */
export class BspEntity {
  readonly props: Array<[string, string]>;

  constructor(props: Array<[string, string]>) {
    this.props = props;
  }

  get classname(): string {
    return this.get('classname') ?? '';
  }

  /** First value for `key` (case-insensitive), or undefined. */
  get(key: string): string | undefined {
    const k = key.toLowerCase();
    for (const [pk, pv] of this.props) if (pk.toLowerCase() === k) return pv;
    return undefined;
  }

  /** All values for `key` (case-insensitive), e.g. every "OnTrigger" output. */
  getAll(key: string): string[] {
    const k = key.toLowerCase();
    const out: string[] = [];
    for (const [pk, pv] of this.props) if (pk.toLowerCase() === k) out.push(pv);
    return out;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  getNumber(key: string, fallback = 0): number {
    const v = this.get(key);
    if (v === undefined) return fallback;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  /** A "x y z" vector key (origin, angles, mins…). Missing components read 0. */
  getVec3(key: string, fallback: { x: number; y: number; z: number } | null = null) {
    const v = this.get(key);
    if (v === undefined) return fallback ? { ...fallback } : null;
    const p = v.trim().split(/\s+/).map(Number);
    return { x: p[0] || 0, y: p[1] || 0, z: p[2] || 0 };
  }

  /** The entity's origin (0 0 0 when absent). */
  get origin(): { x: number; y: number; z: number } {
    return this.getVec3('origin', { x: 0, y: 0, z: 0 })!;
  }

  /** The entity's angles, folding in the legacy "angle" yaw key (SDK: CBaseEntity::KeyValue "angle"). */
  get angles(): { x: number; y: number; z: number } {
    const a = this.getVec3('angles');
    if (a) return a;
    const yaw = this.get('angle');
    if (yaw !== undefined) {
      const y = parseFloat(yaw);
      // ANGLE_UP (-1) / ANGLE_DOWN (-2) — bspfile.h
      if (y === -1) return { x: -90, y: 0, z: 0 };
      if (y === -2) return { x: 90, y: 0, z: 0 };
      return { x: 0, y: Number.isFinite(y) ? y : 0, z: 0 };
    }
    return { x: 0, y: 0, z: 0 };
  }

  /** Brush model index for "*N" model keys, else -1. */
  get brushModelIndex(): number {
    const m = this.get('model');
    if (!m || m[0] !== '*') return -1;
    const n = parseInt(m.slice(1), 10);
    return Number.isFinite(n) ? n : -1;
  }
}

/** One parsed entity output ("target,input,param,delay,times" or ESC-separated). */
export interface EntityOutput {
  target: string;
  input: string;
  parameter: string;
  delay: number;
  timesToFire: number;
}

/** SDK: CEventAction::CEventAction — outputs use ESC (0x1b) or ',' as separators. */
export function parseEntityOutput(value: string): EntityOutput {
  const sep = value.includes('\x1b') ? '\x1b' : ',';
  const p = value.split(sep);
  return {
    target: p[0] ?? '',
    input: p[1] ?? '',
    parameter: p[2] ?? '',
    delay: parseFloat(p[3] ?? '0') || 0,
    timesToFire: p[4] !== undefined && p[4] !== '' ? parseInt(p[4], 10) : -1,
  };
}

/**
 * Parses the BSP entity lump text. Values may hold any character but `"`
 * (outputs use ESC). Malformed trailing data is ignored.
 */
export function parseEntityLump(text: string): BspEntity[] {
  const out: BspEntity[] = [];
  const s = text;
  let i = 0;
  const n = s.length;
  const skipWs = () => {
    for (;;) {
      while (i < n && (s.charCodeAt(i) <= 32 || s.charCodeAt(i) === 0)) i++;
      if (s.charCodeAt(i) === 47 && s.charCodeAt(i + 1) === 47) {
        while (i < n && s[i] !== '\n') i++;
        continue;
      }
      return;
    }
  };
  const readToken = (): string | null => {
    skipWs();
    if (i >= n) return null;
    if (s[i] === '"') {
      const end = s.indexOf('"', i + 1);
      const stop = end < 0 ? n : end;
      const t = s.slice(i + 1, stop);
      i = stop + 1;
      return t;
    }
    const start = i;
    while (i < n && s.charCodeAt(i) > 32 && s[i] !== '"' && s[i] !== '{' && s[i] !== '}') i++;
    return s.slice(start, i);
  };

  for (;;) {
    skipWs();
    if (i >= n) break;
    if (s[i] !== '{') {
      i++;
      continue;
    }
    i++;
    const props: Array<[string, string]> = [];
    for (;;) {
      skipWs();
      if (i >= n) break;
      if (s[i] === '}') {
        i++;
        break;
      }
      const k = readToken();
      if (k === null) break;
      skipWs();
      if (s[i] === '}') {
        props.push([k, '']);
        continue;
      }
      const v = readToken();
      props.push([k, v ?? '']);
    }
    out.push(new BspEntity(props));
  }
  return out;
}

/** Every entity with this classname (case-insensitive). */
export function findEntities(entities: BspEntity[], classname: string): BspEntity[] {
  const c = classname.toLowerCase();
  return entities.filter((e) => e.classname.toLowerCase() === c);
}

/** Entities whose targetname matches (case-insensitive; `*` suffix wildcard as in the SDK). */
export function findEntitiesByName(entities: BspEntity[], name: string): BspEntity[] {
  const n = name.toLowerCase();
  if (n.endsWith('*')) {
    const prefix = n.slice(0, -1);
    return entities.filter((e) => (e.get('targetname') ?? '').toLowerCase().startsWith(prefix));
  }
  return entities.filter((e) => (e.get('targetname') ?? '').toLowerCase() === n);
}
