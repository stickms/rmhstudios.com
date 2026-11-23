/**
 * SDN school-database essay-questions page (`…/medical-school/essay-questions/<CODE>/<slug>`, "Secondary prompts by
 * cycle"). A deterministic parser, no model. Two shapes are read: an inline JSON array (`<script id="essay-questions-data">`,
 * the way the school-database pages embed their data) when present, otherwise the visible list. It is an anonymization
 * boundary: only the allow-listed fields (cycle, program, question, limit, optional) are read, so a username, avatar,
 * comment, footnote or report link in the data or the markup cannot reach the output.
 *
 * UNVERIFIED MARKUP (secondaries plan, Facts 1): both shapes are hand-built to the endpoint inventory's description.
 * Selectors and field names are in `SEL` and `FIELD`; the live-capture swap is one edit.
 */
import { parse, type HTMLElement } from 'node-html-parser';
import {
  MAX_PER_SECTION,
  classifyProgram,
  cycleLabelToEntryYear,
  parsePromptText,
} from '../../../engine/secondaries/text';
import type { NormalizedPrompt, PromptLimit } from '../../../engine/secondaries/types';
import { inDiscussion } from '../discussion';
import { SdnPageError } from './guard';

const SEL = {
  data: 'script#essay-questions-data',
  section: 'section.essay-cycle',
  cycleAttr: 'data-cycle',
  cycleHeading: '.essay-heading, h2',
  walk: '.essay-program, .essay-question',
  program: 'essay-program',
  text: '.essay-text',
  limit: '.essay-limit',
  optional: '.essay-optional',
  empty: '.essay-empty',
} as const;

/** The only keys read from an inline row. Anything else a row carries is never looked at. */
const FIELD = {
  cycle: 'cycle',
  program: 'program',
  question: 'question',
  limit: 'limit',
  optional: 'optional',
} as const;

interface Ctx {
  currentCycle: number;
  onSkippedSection?: () => void;
}

function build(
  cycleYear: number,
  heading: string | undefined,
  question: string,
  limitText: string | undefined,
  optionalFlag: boolean,
): NormalizedPrompt | null {
  const parsed = parsePromptText(question);
  if (parsed.text === '') return null;
  const fromElement = limitText ? parsePromptText(limitText) : null;
  const limit: PromptLimit | null = fromElement?.limit ?? parsed.limit;
  return {
    cycleYear,
    program: classifyProgram(parsed.text, heading),
    text: parsed.text,
    limit,
    optional: parsed.optional || (fromElement?.optional ?? false) || optionalFlag,
    sourceRef: null,
  };
}

function fromInline(raw: string, ctx: Ctx): NormalizedPrompt[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new SdnPageError('essays: inline data is not JSON');
  }
  if (!Array.isArray(data)) throw new SdnPageError('essays: inline data is not an array');

  const perCycle = new Map<string, number>();
  const skipped = new Set<string>();
  const out: NormalizedPrompt[] = [];
  for (const row of data) {
    if (row === null || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const label = r[FIELD.cycle];
    const question = r[FIELD.question];
    if (typeof label !== 'string' || typeof question !== 'string') continue;
    const n = (perCycle.get(label) ?? 0) + 1;
    perCycle.set(label, n);
    if (n > MAX_PER_SECTION) throw new SdnPageError('essays: too many prompts in one cycle');
    const cycleYear = cycleLabelToEntryYear(label, ctx.currentCycle);
    if (cycleYear === null) {
      if (!skipped.has(label)) {
        skipped.add(label);
        ctx.onSkippedSection?.();
      }
      continue;
    }
    const program = r[FIELD.program];
    const limit = r[FIELD.limit];
    const p = build(
      cycleYear,
      typeof program === 'string' ? program : undefined,
      question,
      typeof limit === 'string' ? limit : undefined,
      r[FIELD.optional] === true,
    );
    if (p) out.push(p);
  }
  return out;
}

function fromMarkup(root: ReturnType<typeof parse>, ctx: Ctx): NormalizedPrompt[] {
  const sections = root.querySelectorAll(SEL.section);
  if (sections.length === 0) {
    if (root.querySelector(SEL.empty)) return [];
    throw new SdnPageError('essays: no recognisable cycle section');
  }
  const out: NormalizedPrompt[] = [];
  for (const section of sections) {
    const label = section.getAttribute(SEL.cycleAttr) ?? section.querySelector(SEL.cycleHeading)?.text.trim() ?? '';
    const cycleYear = cycleLabelToEntryYear(label, ctx.currentCycle);
    if (cycleYear === null) {
      ctx.onSkippedSection?.();
      continue;
    }
    let heading: string | undefined;
    let inSection = 0;
    for (const el of section.querySelectorAll(SEL.walk) as HTMLElement[]) {
      if (inDiscussion(el)) continue;
      if (el.classNames.split(/\s+/).includes(SEL.program)) {
        heading = el.text;
        continue;
      }
      const textEl = el.querySelector(SEL.text);
      if (!textEl) continue;
      inSection++;
      if (inSection > MAX_PER_SECTION) throw new SdnPageError('essays: too many prompts in one cycle');
      const p = build(
        cycleYear,
        heading,
        textEl.text,
        el.querySelector(SEL.limit)?.text,
        el.querySelector(SEL.optional) !== null,
      );
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * Every prompt on the page as a `NormalizedPrompt` (`sourceRef` null: the caller sets the page URL). Throws `SdnPageError`
 * (no status) for a page with neither shape, bad inline data, or more than `MAX_PER_SECTION` prompts under one cycle.
 */
export function parseEssayQuestionsPage(html: string, ctx: Ctx): NormalizedPrompt[] {
  const root = parse(html);
  const inline = root.querySelector(SEL.data);
  if (inline) return fromInline(inline.text, ctx);
  return fromMarkup(root, ctx);
}
