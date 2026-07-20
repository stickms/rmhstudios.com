/**
 * Universal search — query parser (§18 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * Splits a raw query into free text + a bounded set of operators
 * (`from:@user`, `in:community`, `has:media`, `before:`/`after:`). Unknown
 * operators degrade to plain text (never error). Client-safe + unit-tested; the
 * grammar mirrored here is shown to users in the cheatsheet.
 */
export interface ParsedQuery {
  text: string;
  from?: string; // handle (no '@')
  inCommunity?: string;
  hasMedia?: boolean;
  before?: string; // YYYY-MM-DD
  after?: string; // YYYY-MM-DD
  /** How many operators were recognized (capped). */
  operatorCount: number;
}

const MAX_OPERATORS = 4;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function tokenize(raw: string): string[] {
  // Split on whitespace but keep quoted phrases together.
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) out.push(m[1] ?? m[2]);
  return out;
}

export function parseQuery(raw: string): ParsedQuery {
  const result: ParsedQuery = { text: '', operatorCount: 0 };
  const textParts: string[] = [];

  for (const token of tokenize(raw.trim())) {
    const colon = token.indexOf(':');
    const key = colon > 0 ? token.slice(0, colon).toLowerCase() : '';
    const value = colon > 0 ? token.slice(colon + 1) : '';
    const canAddOp = result.operatorCount < MAX_OPERATORS;

    if (canAddOp && key === 'from' && value) {
      result.from = value.replace(/^@/, '').toLowerCase();
      result.operatorCount++;
    } else if (canAddOp && key === 'in' && value) {
      result.inCommunity = value.toLowerCase();
      result.operatorCount++;
    } else if (canAddOp && key === 'has' && value.toLowerCase() === 'media') {
      result.hasMedia = true;
      result.operatorCount++;
    } else if (canAddOp && key === 'before' && DATE_RE.test(value)) {
      result.before = value;
      result.operatorCount++;
    } else if (canAddOp && key === 'after' && DATE_RE.test(value)) {
      result.after = value;
      result.operatorCount++;
    } else {
      // Unknown operator or plain word → free text.
      textParts.push(token);
    }
  }

  result.text = textParts.join(' ').trim();
  return result;
}
