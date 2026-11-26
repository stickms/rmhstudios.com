/**
 * s15-08 — the link that opens the same functions in anyone's RMHCalculator.
 *
 * `/rmhcalculator?tab=graph&f=sin(x)&f=x^2&min=-5&max=5`. The link carries the functions (repeated `f`) and an
 * optional domain, nothing else: no graph is stored for sharing and no points travel, so a link never exposes a
 * member's saved list. Opening one fills the recipient's Graphing tab and waits for them to press Plot.
 *
 * Pure and client-safe (no zod): the calculator parses `location.search` with it, and it holds the limits.
 * A link that breaks a limit is refused whole rather than trimmed, so a recipient never plots something the
 * sender did not mean.
 */

export const GRAPH_LINK_MAX_FUNCTIONS = 4;
export const GRAPH_LINK_MAX_FUNCTION_LENGTH = 200;
/** The longest query string the parser will look at (four 200-character functions, percent-encoded, with room). */
export const GRAPH_LINK_MAX_SEARCH_LENGTH = 8192;
/** The widest end of a domain a link may carry. A model plots a window, not infinity. */
export const GRAPH_LINK_MAX_DOMAIN = 1e9;

export interface GraphLinkDomain {
  min: number;
  max: number;
}

export interface GraphLinkContent {
  functions: string[];
  domain: GraphLinkDomain | null;
}

export type GraphLinkRefusal = 'none' | 'too-long' | 'too-many' | 'function-too-long' | 'bad-function' | 'bad-domain';

export type GraphLinkParse = ({ ok: true } & GraphLinkContent) | { ok: false; reason: GraphLinkRefusal };

/** A control character (tab, newline, NUL, DEL, the C1 block…) has no place in an expression a link carries. */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 32 || (c >= 127 && c <= 159)) return true;
  }
  return false;
}
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

function parseEnd(raw: string | null): number | null | undefined {
  if (raw === null) return undefined;
  const text = raw.trim();
  if (!NUMBER.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) && Math.abs(n) <= GRAPH_LINK_MAX_DOMAIN ? n : null;
}

/** The domain `min`..`max` makes, `null` for none, `'bad'` for a half, non-finite or reversed one. */
function domainOf(min: string | null, max: string | null): GraphLinkDomain | null | 'bad' {
  const lo = parseEnd(min);
  const hi = parseEnd(max);
  if (lo === undefined && hi === undefined) return null;
  if (typeof lo !== 'number' || typeof hi !== 'number' || hi <= lo) return 'bad';
  return { min: lo, max: hi };
}

/** Read a link's query string (with or without its `?`). `tab=graph` marks a graph link; anything else is `none`. */
export function parseGraphLink(search: string): GraphLinkParse {
  if (typeof search !== 'string' || search === '') return { ok: false, reason: 'none' };
  if (search.length > GRAPH_LINK_MAX_SEARCH_LENGTH) return { ok: false, reason: 'too-long' };
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return { ok: false, reason: 'none' };
  }
  if (params.get('tab') !== 'graph') return { ok: false, reason: 'none' };

  const raw = params.getAll('f');
  if (raw.length === 0) return { ok: false, reason: 'none' };
  if (raw.length > GRAPH_LINK_MAX_FUNCTIONS) return { ok: false, reason: 'too-many' };
  const functions: string[] = [];
  for (const f of raw) {
    if (f.length > GRAPH_LINK_MAX_FUNCTION_LENGTH) return { ok: false, reason: 'function-too-long' };
    const text = f.trim();
    if (hasControl(text)) return { ok: false, reason: 'bad-function' };
    if (text) functions.push(text);
  }
  if (functions.length === 0) return { ok: false, reason: 'bad-function' };

  const domain = domainOf(params.get('min'), params.get('max'));
  if (domain === 'bad') return { ok: false, reason: 'bad-domain' };
  return { ok: true, functions, domain };
}

/**
 * The link for some functions and an optional domain, or `null` when they would not make one the parser accepts
 * (nothing to plot, more than four, one too long, a reversed domain). `origin` is `location.origin`.
 */
export function buildGraphLink(
  origin: string,
  content: { functions: string[]; domain?: GraphLinkDomain | null },
): string | null {
  const functions = content.functions.map((f) => f.trim()).filter(Boolean);
  const params = new URLSearchParams();
  params.set('tab', 'graph');
  for (const f of functions) params.append('f', f);
  if (content.domain) {
    params.set('min', String(content.domain.min));
    params.set('max', String(content.domain.max));
  }
  const url = `${origin}/rmhcalculator?${params.toString()}`;
  const back = parseGraphLink(params.toString());
  return back.ok ? url : null;
}
