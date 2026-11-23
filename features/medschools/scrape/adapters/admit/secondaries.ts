/**
 * Admit's public secondary-essays page (`med.admit.org/secondary-essays/<slug>`). A deterministic parser, no model.
 *
 * VERIFIED AGAINST LIVE PAGES (2026-11-23, secondaries plan Facts 1): the page is a Next.js app. The server HTML draws
 * only the selected year's prompts, and draws them with hashed CSS-module class names that change on every build, so the
 * DOM is not a safe thing to read. The data is the React Server Components "flight" stream the page embeds as
 * `self.__next_f.push([1,"..."])` scripts: one row of it carries `backendData`, an array with one entry per cycle,
 * `{ year, prompts: [{ pBody, pYears, countNum, typeCount, chance }] }`, every year at once. A long prompt's `pBody` is
 * a reference (`"$52"`) to a text row (`52:T428,<text>`) of the same stream.
 *
 * - `year` is the APPLICATION year: the 2025 tab is the 2025-2026 cycle (its prompts say "the 2025-2026 cycle",
 *   its chance tooltip says "used in 2026"), so entry year `year + 1`, the repo's convention (`engine/cycle.ts`).
 * - The word or character limit is structured (`countNum` + `typeCount`), not written in the text.
 * - There is no combined-degree heading; a combined-degree prompt says so in its own text (`classifyProgram`).
 *
 * It is an anonymization boundary: only the allow-listed keys in `FIELD` are read, so nothing else the stream carries
 * (the "Chance %" statistic, `pYears`, any user, session or tracking data) can reach the output.
 */
import { parse } from 'node-html-parser';
import {
  MAX_PER_SECTION,
  classifyProgram,
  cycleLabelToEntryYear,
  parsePromptText,
} from '../../../engine/secondaries/text';
import type { NormalizedPrompt, PromptLimit } from '../../../engine/secondaries/types';

export { cycleLabelToEntryYear, MAX_PER_SECTION };

/** The page's shape is not what the parser knows (markup changed, or too many prompts under one year). */
export class AdmitPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdmitPageError';
  }
}

/** The one place that names Admit's structure. */
const SEL = {
  /** The key whose value is the per-year array. */
  data: 'backendData',
  /** The flight stream is carried by these inline scripts. */
  script: 'script',
  push: /^self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)\s*;?\s*$/s,
} as const;

/** The only keys read from a year entry and a prompt. Anything else a row carries is never looked at. */
const FIELD = {
  year: 'year',
  prompts: 'prompts',
  body: 'pBody',
  count: 'countNum',
  unit: 'typeCount',
} as const;

/** Rows of the flight stream: `<hex id>:<json>\n`, or `<hex id>:T<hex byte length>,<text of exactly that many bytes>`. */
function flightRows(html: string): { json: Map<string, string>; text: Map<string, string> } {
  const chunks: string[] = [];
  for (const script of parse(html).querySelectorAll(SEL.script)) {
    const m = SEL.push.exec(script.text.trim());
    if (!m?.[1]) continue;
    try {
      const s: unknown = JSON.parse(m[1]);
      if (typeof s === 'string') chunks.push(s);
    } catch {
      /* a push this parser does not understand is no row */
    }
  }
  const bytes = Buffer.from(chunks.join(''), 'utf8');
  const json = new Map<string, string>();
  const text = new Map<string, string>();
  let i = 0;
  while (i < bytes.length) {
    const colon = bytes.indexOf(0x3a, i);
    if (colon < 0) break;
    const id = bytes.subarray(i, colon).toString('latin1');
    if (!/^[0-9a-f]{1,8}$/.test(id)) {
      // Not a row start (e.g. a stray newline): move to the next line.
      const nl = bytes.indexOf(0x0a, i);
      if (nl < 0) break;
      i = nl + 1;
      continue;
    }
    if (bytes[colon + 1] === 0x54 /* T */) {
      const comma = bytes.indexOf(0x2c, colon + 2);
      const len = comma < 0 ? NaN : Number.parseInt(bytes.subarray(colon + 2, comma).toString('latin1'), 16);
      if (!Number.isInteger(len) || len < 0) break;
      text.set(id, bytes.subarray(comma + 1, comma + 1 + len).toString('utf8'));
      i = comma + 1 + len;
      continue;
    }
    let nl = bytes.indexOf(0x0a, colon + 1);
    if (nl < 0) nl = bytes.length;
    json.set(id, bytes.subarray(colon + 1, nl).toString('utf8'));
    i = nl + 1;
  }
  return { json, text };
}

function findKey(node: unknown, key: string, depth = 0): unknown {
  if (depth > 64 || node === null || typeof node !== 'object') return undefined;
  if (Array.isArray(node)) {
    for (const v of node) {
      const r = findKey(v, key, depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  const o = node as Record<string, unknown>;
  if (key in o) return o[key];
  for (const v of Object.values(o)) {
    const r = findKey(v, key, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** `"$52"` is a reference to a text row, `"$$..."` a literal that starts with a dollar sign, anything else is the text. */
function resolveBody(body: string, text: Map<string, string>): string | null {
  const ref = /^\$([0-9a-f]+)$/.exec(body);
  if (ref?.[1]) return text.get(ref[1]) ?? null;
  return body.startsWith('$$') ? body.slice(1) : body;
}

function limitOf(count: unknown, unit: unknown): PromptLimit | null {
  if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return null;
  if (unit === 'words') return { kind: 'WORDS', value: count };
  if (unit === 'characters') return { kind: 'CHARS', value: count };
  return null;
}

/**
 * Every prompt on the page as a `NormalizedPrompt` (`sourceRef` null: the caller, which knows the page URL, sets it).
 * `ctx.onSkippedSection` is told about each year whose cycle is not at or before `currentCycle`.
 * Throws `AdmitPageError` for a page whose stream has no `backendData`, or more than `MAX_PER_SECTION` prompts in a
 * year. A page whose years hold no prompts is `[]`.
 */
export function parseSecondaryEssaysPage(
  html: string,
  ctx: { currentCycle: number; onSkippedSection?: () => void },
): NormalizedPrompt[] {
  const { json, text } = flightRows(html);
  let years: unknown;
  for (const row of json.values()) {
    if (!row.includes(SEL.data)) continue;
    try {
      years = findKey(JSON.parse(row), SEL.data);
    } catch {
      continue;
    }
    if (Array.isArray(years)) break;
  }
  if (!Array.isArray(years)) throw new AdmitPageError('secondary essays: no recognisable cycle data');

  const out: NormalizedPrompt[] = [];
  for (const entry of years) {
    if (entry === null || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const year = e[FIELD.year];
    const prompts = e[FIELD.prompts];
    if (typeof year !== 'number' || !Number.isInteger(year) || !Array.isArray(prompts)) continue;
    // Application year 2025 is the 2025-2026 cycle.
    const cycleYear = cycleLabelToEntryYear(`${year}-${year + 1}`, ctx.currentCycle);
    if (cycleYear === null) {
      ctx.onSkippedSection?.();
      continue;
    }
    if (prompts.length > MAX_PER_SECTION) throw new AdmitPageError('secondary essays: too many prompts in one section');
    for (const raw of prompts) {
      if (raw === null || typeof raw !== 'object') continue;
      const p = raw as Record<string, unknown>;
      const body = p[FIELD.body];
      if (typeof body !== 'string') continue;
      const resolved = resolveBody(body, text);
      if (resolved === null) throw new AdmitPageError('secondary essays: a prompt text row is missing');
      const parsed = parsePromptText(resolved);
      if (parsed.text === '') continue;
      // The structured limit wins over a limit written inside the text.
      const limit = limitOf(p[FIELD.count], p[FIELD.unit]) ?? parsed.limit;
      out.push({
        cycleYear,
        program: classifyProgram(parsed.text),
        text: parsed.text,
        limit,
        optional: parsed.optional,
        sourceRef: null,
      });
    }
  }
  return out;
}
