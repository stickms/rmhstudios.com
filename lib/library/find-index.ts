/**
 * Find in book — the per-document search index (feature 13).
 *
 * Text is extracted on demand, one page or chapter at a time, and kept in
 * memory for as long as the reader is open: the first search pays for the
 * extraction and later searches (and a reopened panel) reuse it. Between units
 * the index gives the main thread back, so a 400-page PDF is searched without
 * freezing the reader, and a search can be cancelled with an `AbortSignal` the
 * moment the query changes. Results are reported in page order.
 *
 * The index runs on the main thread by design: extraction itself happens in the
 * pdf.js worker the reader already owns, and matching a page is linear.
 */

import { whenIdle } from '@/lib/shared/platform';
import { findNormalised, normalise, prepareQuery, type FindOptions, type MatchRange } from './find';

/** Where a document's text comes from. Units are numbered from 1. */
export interface FindSource {
  count: number;
  load: (unit: number) => Promise<string>;
}

export interface UnitMatches {
  unit: number;
  ranges: MatchRange[];
}

export interface SearchHooks {
  signal: AbortSignal;
  /** Called after each unit is searched. */
  onProgress?: (done: number, total: number) => void;
  /** Called, in unit order, for every unit that has at least one match. */
  onMatches?: (matches: UnitMatches) => void;
}

export interface SearchSummary {
  aborted: boolean;
  matches: number;
  units: number;
  /** False when no unit has any text, as with a scanned PDF. */
  searchable: boolean;
}

export interface FindIndex {
  readonly count: number;
  /** The extracted text of a unit, once it has been loaded. */
  textOf: (unit: number) => string | undefined;
  search: (query: string, options: FindOptions, hooks: SearchHooks) => Promise<SearchSummary>;
}

export interface FindIndexOptions {
  /** Gives the main thread back between units. Defaults to an idle callback. */
  yieldToMain?: () => Promise<void>;
  /** Longest stretch of cached units matched before yielding, in milliseconds. */
  sliceMs?: number;
}

/** Fewer non-space characters than this on a unit means it has no text layer. */
const MIN_TEXT = 3;
const SLICE_MS = 12;
const IDLE_TIMEOUT_MS = 50;

function idleYield(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function') whenIdle(resolve, IDLE_TIMEOUT_MS);
    else setTimeout(resolve, 0);
  });
}

function hasText(text: string): boolean {
  return text.replace(/\s/g, '').length >= MIN_TEXT;
}

export function createFindIndex(source: FindSource, opts: FindIndexOptions = {}): FindIndex {
  const yieldToMain = opts.yieldToMain ?? idleYield;
  const sliceMs = opts.sliceMs ?? SLICE_MS;
  const texts = new Map<number, string>();
  const pending = new Map<number, Promise<string>>();

  // One extraction per unit, shared by overlapping searches. A failed unit is
  // treated as empty rather than failing the whole search.
  function extract(unit: number): Promise<string> {
    const inflight = pending.get(unit);
    if (inflight) return inflight;
    const run = source
      .load(unit)
      .catch(() => '')
      .then((text) => {
        texts.set(unit, text);
        pending.delete(unit);
        return text;
      });
    pending.set(unit, run);
    return run;
  }

  async function search(query: string, options: FindOptions, hooks: SearchHooks): Promise<SearchSummary> {
    const { signal } = hooks;
    const summary: SearchSummary = {
      aborted: false,
      matches: 0,
      units: 0,
      searchable: false,
    };
    const prepared = prepareQuery(query, options);
    let sliceStart = performance.now();

    for (let unit = 1; unit <= source.count; unit++) {
      if (signal.aborted) break;
      let text = texts.get(unit);
      if (text === undefined) {
        text = await extract(unit);
        if (signal.aborted) break;
        await yieldToMain();
        sliceStart = performance.now();
        if (signal.aborted) break;
      } else if (performance.now() - sliceStart >= sliceMs) {
        await yieldToMain();
        sliceStart = performance.now();
        if (signal.aborted) break;
      }
      if (hasText(text)) summary.searchable = true;
      const ranges = prepared ? findNormalised(normalise(text, options), prepared, options.wholeWords) : [];
      if (ranges.length > 0) {
        summary.matches += ranges.length;
        summary.units += 1;
        hooks.onMatches?.({
          unit,
          ranges,
        });
      }
      hooks.onProgress?.(unit, source.count);
    }

    summary.aborted = signal.aborted;
    return summary;
  }

  return {
    count: source.count,
    textOf: (unit) => texts.get(unit),
    search,
  };
}
