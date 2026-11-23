/**
 * Admit's public secondary-essays page (`med.admit.org/secondary-essays/<slug>`): one section per cycle, one element per
 * prompt. A deterministic HTML parser, no model. It is an anonymization boundary: only the prompt text, its limit element
 * and its optional marker are read, so no username, avatar, comment or "Chance %" (Admit's own statistic about how often a
 * prompt is asked, not a fact about the prompt) can reach the output. Comment and discussion blocks are skipped even
 * when a prompt-shaped element sits inside one.
 *
 * UNVERIFIED MARKUP (secondaries plan, Facts 1): the selectors below are written against the endpoint inventory's
 * one-line description and the hand-built fixtures. They are all in `SEL`, so the live-capture swap is one edit.
 */
import { parse, type HTMLElement } from 'node-html-parser';
import { MAX_PER_SECTION, classifyProgram, cycleLabelToEntryYear, parsePromptText } from '../../../engine/secondaries/text';
import type { NormalizedPrompt, PromptLimit } from '../../../engine/secondaries/types';

export { cycleLabelToEntryYear, MAX_PER_SECTION };

/** The page's shape is not what the parser knows (markup changed, or too many prompts under one heading). */
export class AdmitPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdmitPageError';
  }
}

const SEL = {
  section: 'section.secondary-cycle',
  cycleAttr: 'data-cycle',
  cycleHeading: '.cycle-heading, h2',
  // Document order inside a section: a heading sets the program of the prompts after it.
  walk: '.program-heading, .secondary-prompt',
  heading: 'program-heading',
  text: '.prompt-text',
  limit: '.prompt-limit',
  optional: '.prompt-optional',
  empty: '.secondary-empty',
} as const;

const DISCUSSION_RE = /comment|discussion|reply|replies/i;
const HEADING_CYCLE_RE = /\b\d{4}\s*[-‐-―/]\s*\d{2,4}\b/;

/** True when an element sits inside a comment or discussion block (or an `aside`), whatever it looks like. */
function inDiscussion(el: HTMLElement): boolean {
  for (let n = el.parentNode as HTMLElement | null; n; n = n.parentNode as HTMLElement | null) {
    if (n.tagName === 'ASIDE') return true;
    if (DISCUSSION_RE.test(n.getAttribute?.('class') ?? '')) return true;
  }
  return false;
}

function cycleOf(section: HTMLElement, currentCycle: number): number | null {
  const attr = section.getAttribute(SEL.cycleAttr);
  if (attr) return cycleLabelToEntryYear(attr, currentCycle);
  const heading = section.querySelector(SEL.cycleHeading)?.text ?? '';
  const m = HEADING_CYCLE_RE.exec(heading);
  return m ? cycleLabelToEntryYear(m[0], currentCycle) : null;
}

/**
 * Every prompt on the page as a `NormalizedPrompt` (`sourceRef` null: the caller, which knows the page URL, sets it).
 * `ctx.onSkippedSection` is told about each cycle section whose label is not a cycle at or before `currentCycle`.
 * Throws `AdmitPageError` for a page with no recognisable section, or more than `MAX_PER_SECTION` prompts in a section.
 * A page that says it has no prompts, or whose sections hold none, is `[]`.
 */
export function parseSecondaryEssaysPage(
  html: string,
  ctx: { currentCycle: number; onSkippedSection?: () => void },
): NormalizedPrompt[] {
  const root = parse(html);
  const sections = root.querySelectorAll(SEL.section);
  if (sections.length === 0) {
    if (root.querySelector(SEL.empty)) return [];
    throw new AdmitPageError('secondary essays: no recognisable cycle section');
  }

  const out: NormalizedPrompt[] = [];
  for (const section of sections) {
    const cycleYear = cycleOf(section, ctx.currentCycle);
    if (cycleYear === null) {
      ctx.onSkippedSection?.();
      continue;
    }
    let heading: string | undefined;
    let inSection = 0;
    for (const el of section.querySelectorAll(SEL.walk)) {
      if (inDiscussion(el)) continue;
      if (el.classNames.split(/\s+/).includes(SEL.heading)) {
        heading = el.text;
        continue;
      }
      const textEl = el.querySelector(SEL.text);
      if (!textEl) continue;
      inSection++;
      if (inSection > MAX_PER_SECTION) throw new AdmitPageError('secondary essays: too many prompts in one section');

      const parsed = parsePromptText(textEl.text);
      if (parsed.text === '') continue;
      // A structured limit element wins over a limit written inside the text.
      const limitEl = el.querySelector(SEL.limit);
      const fromElement = limitEl ? parsePromptText(limitEl.text) : null;
      const limit: PromptLimit | null = fromElement?.limit ?? parsed.limit;
      const optional = parsed.optional || (fromElement?.optional ?? false) || el.querySelector(SEL.optional) !== null;
      out.push({
        cycleYear,
        program: classifyProgram(parsed.text, heading),
        text: parsed.text,
        limit,
        optional,
        sourceRef: null,
      });
    }
  }
  return out;
}
