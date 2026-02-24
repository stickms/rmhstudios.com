import { FORMULA_FUNCTIONS } from './formula-functions';
import { parseCellRef, parseRange, expandRange, cellKey, formatCellRef } from './cell-utils';
import type { CellData, FormulaResult } from '@/components/rmh-sheets/types';

// ─── Token types ───
type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'CELL_REF'
  | 'RANGE'
  | 'FUNCTION'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'BOOLEAN';

interface Token {
  type: TokenType;
  value: string;
}

// ─── AST node types ───
interface NumberNode { type: 'number'; value: number }
interface StringNode { type: 'string'; value: string }
interface BooleanNode { type: 'boolean'; value: boolean }
interface CellRefNode { type: 'cellRef'; ref: string }
interface RangeNode { type: 'range'; range: string }
interface BinaryOpNode { type: 'binaryOp'; op: string; left: ASTNode; right: ASTNode }
interface UnaryOpNode { type: 'unaryOp'; op: string; operand: ASTNode }
interface FunctionCallNode { type: 'functionCall'; name: string; args: ASTNode[] }

type ASTNode =
  | NumberNode
  | StringNode
  | BooleanNode
  | CellRefNode
  | RangeNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode;

// ─── Tokenizer ───
function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = formula.trim();

  while (i < src.length) {
    const ch = src[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t') { i++; continue; }

    // String literal
    if (ch === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length) { str += src[i + 1]; i += 2; }
        else { str += src[i]; i++; }
      }
      i++; // skip closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Number
    if (/\d/.test(ch) || (ch === '.' && i + 1 < src.length && /\d/.test(src[i + 1]))) {
      let num = '';
      while (i < src.length && (/\d/.test(src[i]) || src[i] === '.')) { num += src[i]; i++; }
      tokens.push({ type: 'NUMBER', value: num });
      continue;
    }

    // Operators
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^') {
      tokens.push({ type: 'OPERATOR', value: ch });
      i++;
      continue;
    }

    // Comparison operators
    if (ch === '>' || ch === '<' || ch === '=') {
      let op = ch;
      i++;
      if (i < src.length && (src[i] === '=' || (ch === '<' && src[i] === '>'))) {
        op += src[i];
        i++;
      }
      tokens.push({ type: 'OPERATOR', value: op });
      continue;
    }

    if (ch === '&') { tokens.push({ type: 'OPERATOR', value: '&' }); i++; continue; }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(' }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')' }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'COMMA', value: ',' }); i++; continue; }

    // Identifiers: cell refs, ranges, function names, booleans
    if (/[A-Za-z$_]/.test(ch)) {
      let ident = '';
      while (i < src.length && /[A-Za-z0-9$_]/.test(src[i])) { ident += src[i]; i++; }

      // Check for range: A1:B5
      if (i < src.length && src[i] === ':') {
        const colonPos = i;
        i++; // skip ':'
        let ident2 = '';
        while (i < src.length && /[A-Za-z0-9$_]/.test(src[i])) { ident2 += src[i]; i++; }
        if (ident2.length > 0 && parseCellRef(ident2)) {
          tokens.push({ type: 'RANGE', value: `${ident}:${ident2}` });
          continue;
        }
        // Not a valid range, backtrack
        i = colonPos;
      }

      // Boolean literals
      const upper = ident.toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'BOOLEAN', value: upper });
        continue;
      }

      // Function call: identifier followed by '('
      if (i < src.length && src[i] === '(') {
        tokens.push({ type: 'FUNCTION', value: upper });
        continue;
      }

      // Cell reference
      if (parseCellRef(ident)) {
        tokens.push({ type: 'CELL_REF', value: ident.toUpperCase().replace(/\$/g, '') });
        continue;
      }

      // Unknown identifier — treat as string
      tokens.push({ type: 'STRING', value: ident });
      continue;
    }

    // Unknown character — skip
    i++;
  }

  return tokens;
}

// ─── Parser ───
class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token | null {
    return this.pos < this.tokens.length ? this.tokens[this.pos] : null;
  }

  private consume(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: TokenType): Token {
    const token = this.consume();
    if (!token || token.type !== type) {
      throw new Error(`Expected ${type}, got ${token?.type ?? 'EOF'}`);
    }
    return token;
  }

  parse(): ASTNode {
    const node = this.parseComparison();
    if (this.pos < this.tokens.length) {
      // There might be trailing tokens; that's okay for robustness
    }
    return node;
  }

  private parseComparison(): ASTNode {
    let left = this.parseConcatenation();
    while (this.peek()?.type === 'OPERATOR' && ['=', '<', '>', '<=', '>=', '<>'].includes(this.peek()!.value)) {
      const op = this.consume().value;
      const right = this.parseConcatenation();
      left = { type: 'binaryOp', op, left, right };
    }
    return left;
  }

  private parseConcatenation(): ASTNode {
    let left = this.parseAddition();
    while (this.peek()?.type === 'OPERATOR' && this.peek()!.value === '&') {
      this.consume();
      const right = this.parseAddition();
      left = { type: 'binaryOp', op: '&', left, right };
    }
    return left;
  }

  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();
    while (this.peek()?.type === 'OPERATOR' && (this.peek()!.value === '+' || this.peek()!.value === '-')) {
      const op = this.consume().value;
      const right = this.parseMultiplication();
      left = { type: 'binaryOp', op, left, right };
    }
    return left;
  }

  private parseMultiplication(): ASTNode {
    let left = this.parsePower();
    while (this.peek()?.type === 'OPERATOR' && (this.peek()!.value === '*' || this.peek()!.value === '/')) {
      const op = this.consume().value;
      const right = this.parsePower();
      left = { type: 'binaryOp', op, left, right };
    }
    return left;
  }

  private parsePower(): ASTNode {
    let left = this.parseUnary();
    while (this.peek()?.type === 'OPERATOR' && this.peek()!.value === '^') {
      this.consume();
      const right = this.parseUnary();
      left = { type: 'binaryOp', op: '^', left, right };
    }
    return left;
  }

  private parseUnary(): ASTNode {
    if (this.peek()?.type === 'OPERATOR' && this.peek()!.value === '-') {
      this.consume();
      const operand = this.parsePrimary();
      return { type: 'unaryOp', op: '-', operand };
    }
    if (this.peek()?.type === 'OPERATOR' && this.peek()!.value === '+') {
      this.consume();
      return this.parsePrimary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
    const token = this.peek();
    if (!token) throw new Error('Unexpected end of formula');

    switch (token.type) {
      case 'NUMBER':
        this.consume();
        return { type: 'number', value: parseFloat(token.value) };

      case 'STRING':
        this.consume();
        return { type: 'string', value: token.value };

      case 'BOOLEAN':
        this.consume();
        return { type: 'boolean', value: token.value === 'TRUE' };

      case 'CELL_REF':
        this.consume();
        return { type: 'cellRef', ref: token.value };

      case 'RANGE':
        this.consume();
        return { type: 'range', range: token.value };

      case 'FUNCTION': {
        this.consume();
        this.expect('LPAREN');
        const args: ASTNode[] = [];
        if (this.peek()?.type !== 'RPAREN') {
          args.push(this.parseComparison());
          while (this.peek()?.type === 'COMMA') {
            this.consume();
            args.push(this.parseComparison());
          }
        }
        this.expect('RPAREN');
        return { type: 'functionCall', name: token.value, args };
      }

      case 'LPAREN': {
        this.consume();
        const expr = this.parseComparison();
        this.expect('RPAREN');
        return expr;
      }

      default:
        throw new Error(`Unexpected token: ${token.type} "${token.value}"`);
    }
  }
}

// ─── Evaluator ───
type CellLookup = (row: number, col: number) => CellData | undefined;

interface EvalContext {
  getCellData: CellLookup;
  evaluateCell: (row: number, col: number) => string | number | boolean;
  visiting: Set<string>; // for circular reference detection
}

function evaluateNode(node: ASTNode, ctx: EvalContext): string | number | boolean {
  switch (node.type) {
    case 'number': return node.value;
    case 'string': return node.value;
    case 'boolean': return node.value;

    case 'cellRef': {
      const addr = parseCellRef(node.ref);
      if (!addr) throw new Error('#REF!');
      const key = cellKey(addr.row, addr.col);
      if (ctx.visiting.has(key)) throw new Error('#CIRCULAR!');
      return ctx.evaluateCell(addr.row, addr.col);
    }

    case 'range': {
      // Ranges should only appear inside function arguments; return the first cell value
      const range = parseRange(node.range);
      if (!range) throw new Error('#REF!');
      const cells = expandRange(range);
      if (cells.length === 0) throw new Error('#REF!');
      return ctx.evaluateCell(cells[0].row, cells[0].col);
    }

    case 'unaryOp': {
      const val = evaluateNode(node.operand, ctx);
      if (node.op === '-') return -toNum(val);
      return val;
    }

    case 'binaryOp': {
      const left = evaluateNode(node.left, ctx);
      const right = evaluateNode(node.right, ctx);
      return evalBinaryOp(node.op, left, right);
    }

    case 'functionCall': {
      return evalFunctionCall(node, ctx);
    }
  }
}

function toNum(v: string | number | boolean): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function evalBinaryOp(op: string, left: string | number | boolean, right: string | number | boolean): string | number | boolean {
  switch (op) {
    case '+': return toNum(left) + toNum(right);
    case '-': return toNum(left) - toNum(right);
    case '*': return toNum(left) * toNum(right);
    case '/': {
      const r = toNum(right);
      if (r === 0) throw new Error('#DIV/0!');
      return toNum(left) / r;
    }
    case '^': return Math.pow(toNum(left), toNum(right));
    case '&': return String(left) + String(right);
    case '=': return left === right || String(left) === String(right);
    case '<>': return left !== right && String(left) !== String(right);
    case '<': return toNum(left) < toNum(right);
    case '>': return toNum(left) > toNum(right);
    case '<=': return toNum(left) <= toNum(right);
    case '>=': return toNum(left) >= toNum(right);
    default: throw new Error(`Unknown operator: ${op}`);
  }
}

function evalFunctionCall(node: FunctionCallNode, ctx: EvalContext): string | number | boolean {
  const fnName = node.name.toUpperCase();
  const fn = FORMULA_FUNCTIONS[fnName];

  if (!fn) throw new Error(`#NAME? Unknown function: ${fnName}`);

  // Flatten range arguments for aggregate functions
  const flatArgs: (string | number | boolean | null)[] = [];

  for (const arg of node.args) {
    if (arg.type === 'range') {
      const range = parseRange(arg.range);
      if (!range) throw new Error('#REF!');
      const cells = expandRange(range);
      for (const cell of cells) {
        try {
          const val = ctx.evaluateCell(cell.row, cell.col);
          flatArgs.push(val === '' ? null : val);
        } catch {
          flatArgs.push(null);
        }
      }
    } else {
      const val = evaluateNode(arg, ctx);
      flatArgs.push(val === '' ? null : val);
    }
  }

  return fn(flatArgs);
}

// ─── Public API ───

/**
 * Evaluate a formula string and return the result.
 */
export function evaluateFormula(
  formula: string,
  getCellData: CellLookup,
  evaluateCell: (row: number, col: number) => string | number | boolean,
  visiting?: Set<string>
): FormulaResult {
  try {
    // Strip leading '='
    const src = formula.startsWith('=') ? formula.slice(1) : formula;
    if (!src.trim()) return { value: '' };

    const tokens = tokenize(src);
    const parser = new Parser(tokens);
    const ast = parser.parse();

    const ctx: EvalContext = {
      getCellData,
      evaluateCell,
      visiting: visiting || new Set(),
    };

    const value = evaluateNode(ast, ctx);
    return { value };
  } catch (err) {
    const message = err instanceof Error ? err.message : '#ERROR!';
    return { value: message, error: message };
  }
}

/**
 * Extract all cell references from a formula for dependency tracking.
 */
export function getFormulaDependencies(formula: string): string[] {
  const deps: string[] = [];
  try {
    const src = formula.startsWith('=') ? formula.slice(1) : formula;
    const tokens = tokenize(src);
    for (const token of tokens) {
      if (token.type === 'CELL_REF') {
        const addr = parseCellRef(token.value);
        if (addr) deps.push(cellKey(addr.row, addr.col));
      } else if (token.type === 'RANGE') {
        const range = parseRange(token.value);
        if (range) {
          const cells = expandRange(range);
          for (const cell of cells) {
            deps.push(cellKey(cell.row, cell.col));
          }
        }
      }
    }
  } catch {
    // Ignore parse errors for dependency extraction
  }
  return deps;
}

/**
 * Build a dependency graph and return the topologically sorted order
 * of cells that need recalculation when a cell changes.
 */
export function getRecalcOrder(
  changedCell: string,
  cells: Record<string, CellData>
): string[] {
  // Build reverse dependency map: dependentCell -> set of cells it depends on
  const dependents = new Map<string, Set<string>>();

  for (const [key, cell] of Object.entries(cells)) {
    if (cell.formula) {
      const deps = getFormulaDependencies(cell.formula);
      for (const dep of deps) {
        if (!dependents.has(dep)) dependents.set(dep, new Set());
        dependents.get(dep)!.add(key);
      }
    }
  }

  // BFS from changed cell to find all dependent cells
  const order: string[] = [];
  const visited = new Set<string>();
  const queue = [changedCell];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const deps = dependents.get(current);
    if (!deps) continue;
    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        order.push(dep);
        queue.push(dep);
      }
    }
  }

  return order;
}
