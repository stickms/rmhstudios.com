/**
 * Lossless KeyValues parser. Never throws: malformed input yields diagnostics
 * and a best-effort tree, because the editor must be able to open — and let the
 * author fix — a half-typed file.
 */

import type { KvDiagnostic, KvDoc, KvNode, KvToken } from './types';

const BOM = '﻿';

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f' || ch === '\v';
}

interface LineIndex {
  starts: number[];
}

function buildLineIndex(src: string): LineIndex {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return { starts };
}

function locate(index: LineIndex, offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = index.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (index.starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { line: lo + 1, column: offset - index.starts[lo] + 1 };
}

interface TokenizeResult {
  tokens: KvToken[];
  trailing: string;
}

function tokenize(
  src: string,
  bomLen: number,
  report: (message: string, offset: number, severity?: 'error' | 'warning') => void,
): TokenizeResult {
  const tokens: KvToken[] = [];
  const n = src.length;
  let i = bomLen;
  let triviaStart = i;

  const push = (
    type: KvToken['type'],
    start: number,
    end: number,
    text: string,
    quoted: boolean,
  ) => {
    tokens.push({
      type,
      raw: src.slice(start, end),
      text,
      trivia: src.slice(triviaStart, start),
      quoted,
      start,
      end,
    });
    triviaStart = end;
    i = end;
  };

  while (i < n) {
    const ch = src[i];
    if (isSpace(ch)) {
      i++;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (ch === '{') {
      push('open', i, i + 1, '{', false);
      continue;
    }
    if (ch === '}') {
      push('close', i, i + 1, '}', false);
      continue;
    }
    if (ch === '"') {
      const start = i;
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = src[j];
        if (c === '\\' && j + 1 < n && src[j + 1] !== '\n') {
          j += 2;
          continue;
        }
        if (c === '"') {
          closed = true;
          break;
        }
        if (c === '\n') break;
        j++;
      }
      if (!closed) {
        report('Unterminated string', start);
        push('string', start, j, src.slice(start + 1, j), true);
      } else {
        push('string', start, j + 1, src.slice(start + 1, j), true);
      }
      continue;
    }
    if (ch === '[') {
      const close = src.indexOf(']', i);
      const eol = src.indexOf('\n', i);
      if (close !== -1 && (eol === -1 || close < eol)) {
        const inner = src.slice(i + 1, close);
        if (inner.startsWith('$') || inner.startsWith('!')) {
          push('cond', i, close + 1, inner, false);
          continue;
        }
      }
    }
    // Unquoted token: runs to whitespace, a brace or a quote.
    const start = i;
    let j = i;
    while (j < n) {
      const c = src[j];
      if (isSpace(c) || c === '{' || c === '}' || c === '"') break;
      if (c === '/' && src[j + 1] === '/' && j > start) break;
      j++;
    }
    if (j === start) j++;
    push('string', start, j, src.slice(start, j), false);
  }

  return { tokens, trailing: src.slice(triviaStart) };
}

export function parseKv(source: string): KvDoc {
  const bom = source.startsWith(BOM) ? BOM : '';
  const diagnostics: KvDiagnostic[] = [];
  const lineIndex = buildLineIndex(source);
  const report = (
    message: string,
    offset: number,
    severity: 'error' | 'warning' = 'error',
  ): void => {
    const { line, column } = locate(lineIndex, offset);
    diagnostics.push({ severity, message, line, column, offset });
  };

  const { tokens, trailing } = tokenize(source, bom.length, report);
  let pos = 0;
  const peek = (): KvToken | undefined => tokens[pos];
  const next = (): KvToken | undefined => tokens[pos++];

  function parseEntries(parent: KvNode | null, insideBlock: boolean): KvNode[] {
    const nodes: KvNode[] = [];
    for (;;) {
      const tok = peek();
      if (!tok) return nodes;

      if (tok.type === 'close') {
        if (insideBlock) return nodes;
        report('Unexpected "}"', tok.start);
        next();
        continue;
      }
      if (tok.type === 'cond') {
        const prev = nodes[nodes.length - 1];
        if (prev && !prev.condAfter) prev.condAfter = tok;
        else report('Unexpected conditional', tok.start, 'warning');
        next();
        continue;
      }
      if (tok.type === 'open') {
        report('Block has no key', tok.start);
        next();
        parseEntries(parent, true);
        if (peek()?.type === 'close') next();
        continue;
      }

      next();
      const node: KvNode = { key: tok, parent };
      nodes.push(node);

      let after = peek();
      if (after?.type === 'string') {
        node.value = after;
        next();
        after = peek();
        if (after?.type === 'cond') {
          node.cond = after;
          next();
        }
        continue;
      }
      if (after?.type === 'cond') {
        node.cond = after;
        next();
        after = peek();
      }
      if (after?.type === 'open') {
        node.open = after;
        next();
        node.children = parseEntries(node, true);
        const close = peek();
        if (close?.type === 'close') {
          node.close = close;
          next();
        } else {
          report(`Missing "}" for "${node.key.text}"`, node.open.start);
        }
        continue;
      }
      report(`Missing value for "${node.key.text}"`, tok.start, 'warning');
    }
  }

  const roots = parseEntries(null, false);
  return { bom, tokens, trailing, roots, diagnostics };
}

/** Exact inverse of `parseKv`. */
export function serializeKv(doc: KvDoc): string {
  let out = doc.bom;
  for (const t of doc.tokens) out += t.trivia + t.raw;
  return out + doc.trailing;
}
