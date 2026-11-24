/**
 * SDN school-database essay-questions page (`www.studentdoctor.net/schools-database/medical-school/essay-questions/
 * <CODE>/<slug>`). A deterministic parser, no model.
 *
 * VERIFIED AGAINST LIVE PAGES (2026-11-23, secondaries plan Facts 1): the page is server-rendered HTML with no inline
 * JSON. Prompts are grouped by TOPIC CATEGORY (`section.category-card`, its `h2` is "Other", "Motivation and Fit"...,
 * never a cycle or a program), and one `li.question-item` is one prompt WORDING with `data-years="2026-2027,2024-2025"`
 * naming every cycle it was used in, so a prompt yields one `NormalizedPrompt` per cycle. The text is the item's first
 * `p`, numbered within its category ("1. Describe..."), with any limit and "(Optional)" written inside it. There is no
 * program heading: a combined-degree prompt says so in its own text ("... - MSTP applicants", "HST Only").
 * A school with nothing says so in a metrics block ("Prompts" 0) and has no category section.
 *
 * It is an anonymization boundary: only the item's `data-years` and its first `p` are read, so nothing else on the page
 * (the add-a-prompt form and its token, comments, links, the page chrome) can reach the output.
 */
import { parse } from 'node-html-parser';
import {
  MAX_PER_SECTION,
  classifyProgram,
  cycleLabelToEntryYear,
  parsePromptText,
} from '../../../engine/secondaries/text';
import type { NormalizedPrompt } from '../../../engine/secondaries/types';
import { inDiscussion } from '../discussion';
import { SdnPageError } from './guard';

const SEL = {
  page: '#essay-questions-page',
  item: 'li.question-item',
  yearsAttr: 'data-years',
  text: 'p',
  metrics: '.sdn-school-essay-metrics',
} as const;

const PROMPTS_METRIC_RE = /\bPrompts\s*(\d+)\b/;

interface Ctx {
  currentCycle: number;
  onSkippedSection?: () => void;
}

/**
 * Every prompt on the page as a `NormalizedPrompt` (`sourceRef` null: the caller sets the page URL). Throws
 * `SdnPageError` (no status) for a page that is not the essay page, a page with no prompts that does not say it has
 * none, or more than `MAX_PER_SECTION` prompts under one cycle.
 */
export function parseEssayQuestionsPage(html: string, ctx: Ctx): NormalizedPrompt[] {
  const root = parse(html);
  if (!root.querySelector(SEL.page)) throw new SdnPageError('essays: no recognisable essay page');

  const items = root.querySelectorAll(SEL.item);
  if (items.length === 0) {
    const metrics = root.querySelector(SEL.metrics)?.text.replace(/\s+/g, ' ');
    const m = metrics ? PROMPTS_METRIC_RE.exec(metrics) : null;
    if (m?.[1] === '0') return [];
    throw new SdnPageError('essays: no prompts and no statement that there are none');
  }

  const perCycle = new Map<number, number>();
  const skipped = new Set<string>();
  const out: NormalizedPrompt[] = [];
  for (const item of items) {
    if (inDiscussion(item)) continue;
    const textEl = item.querySelector(SEL.text);
    const labels = (item.getAttribute(SEL.yearsAttr) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (!textEl || labels.length === 0) continue;
    const parsed = parsePromptText(textEl.text);
    if (parsed.text === '') continue;

    const seenHere = new Set<number>();
    for (const label of labels) {
      const cycleYear = cycleLabelToEntryYear(label, ctx.currentCycle);
      if (cycleYear === null) {
        if (!skipped.has(label)) {
          skipped.add(label);
          ctx.onSkippedSection?.();
        }
        continue;
      }
      if (seenHere.has(cycleYear)) continue;
      seenHere.add(cycleYear);
      const n = (perCycle.get(cycleYear) ?? 0) + 1;
      perCycle.set(cycleYear, n);
      if (n > MAX_PER_SECTION) throw new SdnPageError('essays: too many prompts in one cycle');
      out.push({
        cycleYear,
        program: classifyProgram(parsed.text),
        text: parsed.text,
        limit: parsed.limit,
        optional: parsed.optional,
        sourceRef: null,
      });
    }
  }
  return out;
}
