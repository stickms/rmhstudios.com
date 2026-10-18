/**
 * RMHCalculator notebook evaluator (feature idea F11). Pure and client-safe: a
 * hand-written tokenizer + recursive-descent parser, no eval and no model call.
 * Each line is one of: blank/comment (`#`, `//`), `name = expr`, or `expr`.
 * Supports + - * / ^ ( ), `%` (`20% of 150`, `150 + 10%`), `$` amounts,
 * variables, `ans`, `sum`, a few functions and unit conversion (`5 ft in cm`).
 */

export interface Value {
  n: number;
  unit?: string;
  cur?: boolean;
  pct?: boolean;
}
export type LineResult =
  | { kind: 'empty' }
  | { kind: 'ok'; value: Value; text: string }
  | { kind: 'error'; message: string };

type Dim = 'length' | 'mass' | 'volume' | 'time' | 'temp';
// factor = size of one unit in the dimension's base (m, g, l, s)
const UNITS: Record<string, { dim: Dim; f: number; label: string }> = {};
function def(dim: Dim, label: string, f: number, ...names: string[]) {
  for (const n of [label, ...names]) UNITS[n] = { dim, f, label };
}
def('length', 'mm', 0.001, 'millimeter', 'millimeters');
def('length', 'cm', 0.01, 'centimeter', 'centimeters');
def('length', 'm', 1, 'meter', 'meters', 'metre', 'metres');
def('length', 'km', 1000, 'kilometer', 'kilometers');
def('length', 'in', 0.0254, 'inch', 'inches');
def('length', 'ft', 0.3048, 'foot', 'feet');
def('length', 'yd', 0.9144, 'yard', 'yards');
def('length', 'mi', 1609.344, 'mile', 'miles');
def('mass', 'g', 1, 'gram', 'grams');
def('mass', 'kg', 1000, 'kilogram', 'kilograms');
def('mass', 'oz', 28.349523125, 'ounce', 'ounces');
def('mass', 'lb', 453.59237, 'lbs', 'pound', 'pounds');
def('volume', 'ml', 0.001, 'milliliter', 'milliliters');
def('volume', 'l', 1, 'liter', 'liters', 'litre', 'litres');
def('volume', 'gal', 3.785411784, 'gallon', 'gallons');
def('volume', 'cup', 0.2365882365, 'cups');
def('time', 's', 1, 'sec', 'second', 'seconds');
def('time', 'min', 60, 'minute', 'minutes');
def('time', 'h', 3600, 'hr', 'hour', 'hours');
def('time', 'day', 86400, 'days');
def('time', 'week', 604800, 'weeks');
def('temp', 'C', 1, 'celsius');
def('temp', 'F', 1, 'fahrenheit');
def('temp', 'K', 1, 'kelvin');

const FUNCS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Tok = { t: 'num'; v: number } | { t: 'id'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re =
    /\s*(?:(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)|([A-Za-z_][A-Za-z_0-9]*)|([-+*/^()=%$]))/y;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m) throw new Error(`Unexpected "${src.slice(pos).trim()[0]}"`);
    pos = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', v: Number(m[1].replace(/,/g, '')) });
    else if (m[2] !== undefined) out.push({ t: 'id', v: m[2] });
    else out.push({ t: 'op', v: m[3]! });
  }
  return out;
}

function toBase(n: number, unit: string): number {
  const u = UNITS[unit]!;
  if (u.dim !== 'temp') return n * u.f;
  return unit === 'F' ? ((n - 32) * 5) / 9 + 273.15 : unit === 'C' ? n + 273.15 : n;
}
function fromBase(b: number, unit: string): number {
  const u = UNITS[unit]!;
  if (u.dim !== 'temp') return b / u.f;
  return unit === 'F' ? ((b - 273.15) * 9) / 5 + 32 : unit === 'C' ? b - 273.15 : b;
}
export function convert(v: Value, to: string): Value {
  if (!v.unit) throw new Error('Nothing to convert');
  const a = UNITS[v.unit]!;
  const b = UNITS[to];
  if (!b) throw new Error(`Unknown unit "${to}"`);
  if (a.dim !== b.dim) throw new Error(`Cannot convert ${a.dim} to ${b.dim}`);
  return { n: fromBase(toBase(v.n, v.unit), b.label), unit: b.label, cur: v.cur };
}

class Parser {
  private i = 0;
  constructor(
    private toks: Tok[],
    private vars: Map<string, Value>,
  ) {}

  private peek(o = 0) {
    return this.toks[this.i + o];
  }
  private isOp(v: string, o = 0) {
    const t = this.peek(o);
    return t?.t === 'op' && t.v === v;
  }
  private isId(v: string, o = 0) {
    const t = this.peek(o);
    return t?.t === 'id' && t.v.toLowerCase() === v;
  }

  parseLine(): { name?: string; value: Value } {
    let name: string | undefined;
    const t0 = this.peek();
    if (t0?.t === 'id' && this.isOp('=', 1)) {
      name = t0.v;
      if (UNITS[name] || name in FUNCS || name in CONSTS || name === 'ans' || name === 'sum')
        throw new Error(`"${name}" is reserved`);
      this.i += 2;
    }
    const value = this.conv();
    if (this.i < this.toks.length) throw new Error('Unexpected input');
    return { name, value };
  }

  private conv(): Value {
    let v = this.expr();
    while (this.isId('in') || this.isId('to') || this.isId('as')) {
      const u = this.peek(1);
      if (u?.t !== 'id') throw new Error('Expected a unit');
      this.i += 2;
      v = convert(v, UNITS[u.v] ? u.v : u.v.toLowerCase());
    }
    return v;
  }

  private expr(): Value {
    let l = this.term();
    while (this.isOp('+') || this.isOp('-')) {
      const sign = this.isOp('+') ? 1 : -1;
      this.i++;
      const r = this.term();
      if (r.pct && !l.pct) l = { ...l, n: l.n * (1 + sign * r.n) };
      else l = this.add(l, r, sign);
    }
    return l;
  }

  private add(l: Value, r: Value, sign: number): Value {
    if (l.unit && r.unit) {
      const rc = convert(r, l.unit);
      return { ...l, n: l.n + sign * rc.n, cur: l.cur || r.cur };
    }
    if (l.unit || r.unit) throw new Error('Unit mismatch');
    return { n: l.n + sign * r.n, cur: l.cur || r.cur };
  }

  private term(): Value {
    let l = this.unary();
    for (;;) {
      if (this.isOp('*') || this.isOp('/')) {
        const div = this.isOp('/');
        this.i++;
        l = this.mul(l, this.unary(), div);
      } else if (this.isId('of') && l.pct) {
        this.i++;
        const r = this.unary();
        l = { ...r, n: r.n * l.n };
      } else return l;
    }
  }

  private mul(l: Value, r: Value, div: boolean): Value {
    const cur = l.cur || r.cur;
    if (div && r.n === 0) throw new Error('Division by zero');
    if (l.unit && r.unit) {
      if (!div) throw new Error('Cannot multiply two units');
      return { n: l.n / convert(r, l.unit).n, cur };
    }
    if (r.unit && div) throw new Error('Cannot divide by a unit');
    return { n: div ? l.n / r.n : l.n * r.n, unit: l.unit ?? r.unit, cur };
  }

  private unary(): Value {
    if (this.isOp('-')) {
      this.i++;
      const v = this.unary();
      return { ...v, n: -v.n };
    }
    if (this.isOp('+')) {
      this.i++;
      return this.unary();
    }
    return this.power();
  }

  private power(): Value {
    const base = this.postfix();
    if (this.isOp('^')) {
      this.i++;
      const e = this.unary();
      if (e.unit) throw new Error('Exponent cannot have a unit');
      return { ...base, n: Math.pow(base.n, e.n) };
    }
    return base;
  }

  private postfix(): Value {
    let v = this.primary();
    if (this.isOp('%')) {
      this.i++;
      v = { n: v.n / 100, pct: true };
    } else {
      const t = this.peek();
      if (t?.t === 'id' && UNITS[t.v] && !v.unit) {
        const kw = t.v === 'in' && this.peek(1)?.t === 'id';
        if (!kw) {
          this.i++;
          v = { ...v, unit: UNITS[t.v]!.label };
        }
      }
    }
    return v;
  }

  private primary(): Value {
    const t = this.peek();
    if (!t) throw new Error('Unexpected end');
    this.i++;
    if (t.t === 'num') return { n: t.v };
    if (t.t === 'op') {
      if (t.v === '$') {
        const v = this.primary();
        return { ...v, cur: true };
      }
      if (t.v === '(') {
        const v = this.conv();
        if (!this.isOp(')')) throw new Error('Missing )');
        this.i++;
        return v;
      }
      throw new Error(`Unexpected "${t.v}"`);
    }
    const id = t.v;
    const low = id.toLowerCase();
    if (this.isOp('(') && FUNCS[low]) {
      this.i++;
      const arg = this.conv();
      if (!this.isOp(')')) throw new Error('Missing )');
      this.i++;
      return { ...arg, n: FUNCS[low]!(arg.n) };
    }
    const variable = this.vars.get(id);
    if (variable) return variable;
    if (low in CONSTS) return { n: CONSTS[low]! };
    throw new Error(`Unknown "${id}"`);
  }
}

export function formatValue(v: Value): string {
  if (!Number.isFinite(v.n)) return 'undefined';
  const abs = Math.abs(v.n);
  const digits = v.cur ? 2 : abs >= 1e15 || (abs > 0 && abs < 1e-6) ? 0 : 8;
  let s =
    digits === 0
      ? v.n.toPrecision(8).replace(/\.?0+(e|$)/, '$1')
      : v.n.toLocaleString('en-US', {
          minimumFractionDigits: v.cur ? 2 : 0,
          maximumFractionDigits: digits,
        });
  if (v.pct) s = `${(v.n * 100).toLocaleString('en-US', { maximumFractionDigits: 6 })}%`;
  if (v.cur) s = `$${s}`;
  return v.unit ? `${s} ${v.unit}` : s;
}

export function evaluateNotebook(body: string): LineResult[] {
  const vars = new Map<string, Value>();
  const results: LineResult[] = [];
  let ans: Value | null = null;
  let sum = 0;
  let sumCur = false;
  for (const raw of body.split('\n').slice(0, 500)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      if (!line) sum = 0;
      results.push({ kind: 'empty' });
      continue;
    }
    try {
      const scope = new Map(vars);
      if (ans) scope.set('ans', ans);
      scope.set('sum', { n: sum, cur: sumCur || undefined });
      const { name, value } = new Parser(tokenize(line), scope).parseLine();
      if (name) vars.set(name, value);
      ans = value;
      if (!value.unit) {
        sum += value.n;
        sumCur = sumCur || !!value.cur;
      }
      results.push({ kind: 'ok', value, text: formatValue(value) });
    } catch (err) {
      results.push({ kind: 'error', message: err instanceof Error ? err.message : 'Error' });
    }
  }
  return results;
}
