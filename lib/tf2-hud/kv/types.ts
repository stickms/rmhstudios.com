/**
 * Types for the lossless KeyValues (VDF / `.res`) syntax tree.
 *
 * "Lossless" means: `serializeKv(parseKv(text)) === text` for every input,
 * including ones with BOMs, CRLF line endings, comments, odd spacing, duplicate
 * keys and platform conditionals. The tree is a *view* over a flat token list
 * that keeps the exact text (and the trivia — whitespace and comments — before
 * it) of every token, so nothing the author typed can be lost by loading a file.
 */

export type KvTokenType = 'string' | 'open' | 'close' | 'cond';

export interface KvToken {
  type: KvTokenType;
  /** Exact source text of the token, including any quotes. */
  raw: string;
  /** The string content without quotes (not unescaped). `{`/`}` for braces. */
  text: string;
  /** Whitespace and `//` comments between the previous token and this one. */
  trivia: string;
  quoted: boolean;
  /** Offsets of `raw` in the original source (BOM included in the count). */
  start: number;
  end: number;
}

export interface KvNode {
  key: KvToken;
  /** Scalar value (`"key" "value"`). Mutually exclusive with `open`. */
  value?: KvToken;
  /** Platform conditional on the entry, e.g. `[$X360]`. */
  cond?: KvToken;
  /** A conditional that trailed a closing brace. */
  condAfter?: KvToken;
  open?: KvToken;
  close?: KvToken;
  children?: KvNode[];
  parent: KvNode | null;
}

export type KvSeverity = 'error' | 'warning';

export interface KvDiagnostic {
  severity: KvSeverity;
  message: string;
  /** 1-based. */
  line: number;
  column: number;
  /** Offset into the source. */
  offset: number;
}

export interface KvDoc {
  bom: string;
  tokens: KvToken[];
  /** Trivia after the last token (trailing comments / newline). */
  trailing: string;
  roots: KvNode[];
  diagnostics: KvDiagnostic[];
}
