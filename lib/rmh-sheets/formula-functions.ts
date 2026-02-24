/**
 * Built-in spreadsheet functions.
 * Each function receives an array of evaluated arguments and returns a value.
 */

type FormulaFn = (args: (string | number | boolean | null)[]) => string | number | boolean;

function toNumber(v: string | number | boolean | null): number {
  if (v === null || v === '' || v === false) return 0;
  if (v === true) return 1;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function isNumeric(v: string | number | boolean | null): boolean {
  if (v === null || v === '') return false;
  if (typeof v === 'boolean') return true;
  return !isNaN(Number(v));
}

// Math functions
const SUM: FormulaFn = (args) => args.reduce((sum: number, v) => sum + toNumber(v), 0);

const AVERAGE: FormulaFn = (args) => {
  const nums = args.filter(isNumeric);
  if (nums.length === 0) return 0;
  return nums.reduce((sum: number, v) => sum + toNumber(v), 0) / nums.length;
};

const COUNT: FormulaFn = (args) => args.filter(isNumeric).length;

const COUNTA: FormulaFn = (args) => args.filter((v) => v !== null && v !== '').length;

const COUNTBLANK: FormulaFn = (args) => args.filter((v) => v === null || v === '').length;

const MIN: FormulaFn = (args) => {
  const nums = args.filter(isNumeric).map(toNumber);
  return nums.length === 0 ? 0 : Math.min(...nums);
};

const MAX: FormulaFn = (args) => {
  const nums = args.filter(isNumeric).map(toNumber);
  return nums.length === 0 ? 0 : Math.max(...nums);
};

const ROUND: FormulaFn = (args) => {
  const value = toNumber(args[0]);
  const decimals = args[1] !== undefined ? toNumber(args[1]) : 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

const ABS: FormulaFn = (args) => Math.abs(toNumber(args[0]));

const FLOOR: FormulaFn = (args) => Math.floor(toNumber(args[0]));

const CEIL: FormulaFn = (args) => Math.ceil(toNumber(args[0]));

const POWER: FormulaFn = (args) => Math.pow(toNumber(args[0]), toNumber(args[1]));

const SQRT: FormulaFn = (args) => {
  const v = toNumber(args[0]);
  if (v < 0) throw new Error('#NUM!');
  return Math.sqrt(v);
};

const MOD: FormulaFn = (args) => {
  const divisor = toNumber(args[1]);
  if (divisor === 0) throw new Error('#DIV/0!');
  return toNumber(args[0]) % divisor;
};

// Logic functions
const IF: FormulaFn = (args) => {
  const condition = args[0];
  const trueVal = args[1] !== undefined ? args[1] : true;
  const falseVal = args[2] !== undefined ? args[2] : false;
  return condition ? (trueVal ?? false) : (falseVal ?? false);
};

const AND: FormulaFn = (args) => args.every(Boolean);

const OR: FormulaFn = (args) => args.some(Boolean);

const NOT: FormulaFn = (args) => !args[0];

const TRUE_FN: FormulaFn = () => true;

const FALSE_FN: FormulaFn = () => false;

// Text functions
const CONCATENATE: FormulaFn = (args) => args.map((v) => (v === null ? '' : String(v))).join('');

const LEN: FormulaFn = (args) => String(args[0] ?? '').length;

const UPPER: FormulaFn = (args) => String(args[0] ?? '').toUpperCase();

const LOWER: FormulaFn = (args) => String(args[0] ?? '').toLowerCase();

const TRIM: FormulaFn = (args) => String(args[0] ?? '').trim();

const LEFT: FormulaFn = (args) => {
  const str = String(args[0] ?? '');
  const count = toNumber(args[1] ?? 1);
  return str.substring(0, count);
};

const RIGHT: FormulaFn = (args) => {
  const str = String(args[0] ?? '');
  const count = toNumber(args[1] ?? 1);
  return str.substring(str.length - count);
};

const MID: FormulaFn = (args) => {
  const str = String(args[0] ?? '');
  const start = toNumber(args[1]) - 1; // 1-based in spreadsheets
  const count = toNumber(args[2]);
  return str.substring(start, start + count);
};

const FIND: FormulaFn = (args) => {
  const search = String(args[0] ?? '');
  const text = String(args[1] ?? '');
  const startPos = args[2] !== undefined ? toNumber(args[2]) - 1 : 0;
  const pos = text.indexOf(search, startPos);
  if (pos === -1) throw new Error('#VALUE!');
  return pos + 1; // 1-based
};

const SUBSTITUTE: FormulaFn = (args) => {
  const text = String(args[0] ?? '');
  const oldText = String(args[1] ?? '');
  const newText = String(args[2] ?? '');
  if (args[3] !== undefined) {
    // Replace nth occurrence
    let count = 0;
    const target = toNumber(args[3]);
    return text.replace(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (match) => {
      count++;
      return count === target ? newText : match;
    });
  }
  return text.split(oldText).join(newText);
};

// Lookup functions
const VLOOKUP: FormulaFn = (args) => {
  // VLOOKUP(search_key, range_values, col_index, [is_sorted])
  // range_values arrives as a flat array of values — we need the original range shape
  // For our engine, VLOOKUP is special-cased in the evaluator
  throw new Error('#N/A');
};

const HLOOKUP: FormulaFn = (args) => {
  throw new Error('#N/A');
};

const INDEX: FormulaFn = (args) => {
  // Special-cased in evaluator
  throw new Error('#N/A');
};

const MATCH: FormulaFn = (args) => {
  const searchVal = args[0];
  // Remaining args are the values from the range
  for (let i = 1; i < args.length; i++) {
    if (args[i] === searchVal || String(args[i]) === String(searchVal)) {
      return i; // 1-based position
    }
  }
  throw new Error('#N/A');
};

// Aggregate functions with conditions
const COUNTIF: FormulaFn = (args) => {
  // Last arg is the criteria, rest are values
  const criteria = String(args[args.length - 1] ?? '');
  const values = args.slice(0, -1);
  return values.filter((v) => matchesCriteria(v, criteria)).length;
};

const SUMIF: FormulaFn = (args) => {
  // args: [rangeValues..., criteria, sumRangeValues...]
  // Simplified: criteria is in the middle
  // For our engine, SUMIF is handled specially
  throw new Error('#N/A');
};

function matchesCriteria(value: string | number | boolean | null, criteria: string): boolean {
  if (criteria.startsWith('>')) {
    return toNumber(value) > toNumber(criteria.slice(1));
  }
  if (criteria.startsWith('<')) {
    if (criteria[1] === '>') return String(value) !== criteria.slice(2);
    return toNumber(value) < toNumber(criteria.slice(1));
  }
  if (criteria.startsWith('=')) {
    return String(value) === criteria.slice(1);
  }
  return String(value) === criteria;
}

// Date functions
const NOW: FormulaFn = () => new Date().toISOString();

const TODAY: FormulaFn = () => new Date().toLocaleDateString();

const YEAR: FormulaFn = (args) => new Date(String(args[0])).getFullYear();

const MONTH: FormulaFn = (args) => new Date(String(args[0])).getMonth() + 1;

const DAY: FormulaFn = (args) => new Date(String(args[0])).getDate();

// Registry
export const FORMULA_FUNCTIONS: Record<string, FormulaFn> = {
  // Math
  SUM, AVERAGE, COUNT, MIN, MAX, ROUND, ABS, FLOOR, CEIL, POWER, SQRT, MOD,
  // Logic
  IF, AND, OR, NOT, TRUE: TRUE_FN, FALSE: FALSE_FN,
  // Text
  CONCATENATE, LEN, UPPER, LOWER, TRIM, LEFT, RIGHT, MID, FIND, SUBSTITUTE,
  // Lookup
  VLOOKUP, HLOOKUP, INDEX, MATCH,
  // Aggregate
  COUNTIF, SUMIF, COUNTA, COUNTBLANK,
  // Date
  NOW, TODAY, YEAR, MONTH, DAY,
};
