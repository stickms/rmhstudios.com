/**
 * The secondary-prompt store (D1, D9): one `MedSecondaryPrompt` per school x program x normalised wording and one
 * `MedSecondaryObservation` per prompt x cycle x source. Dedupe is by `secondaryKey`, so Admit and SDN seeing one prompt
 * share a row and, in one cycle, are two observations of one cycle (the cycle list is the distinct `cycleYear`s, never a
 * sum of sources). Observations are history and are never deleted: a school that stops asking a prompt is shown by the
 * absence of a new observation, not by a deleted row.
 *
 * Anonymization: nothing person-shaped is accepted. A `sourceRef` is stored only if it is an `https:` URL with no
 * userinfo, query string or fragment (a school page or a thread, never a post permalink); anything else is stored as
 * null. Every write is a prompt, an observation or a check row, none of which has a column that could hold a person.
 */
import { MAX_LIMIT, MAX_TEXT, parsePromptText, secondaryKey } from '../engine/secondaries/text';
import { THEMES_VERSION, tagThemes } from '../engine/secondaries/themes';
import {
  SOURCE_PRIORITY,
  type NormalizedPrompt,
  type PromptLimit,
  type PromptSource,
} from '../engine/secondaries/types';
import type { MedPrisma, MedSecondaryObservationRow, MedSecondaryPromptRow } from './types';

/** The oldest entry year a stored observation may name; the newest is the caller's `siteCycle`. */
export const MIN_STORED_CYCLE = 2005;
const MAX_REF = 300;

export interface RecordResult {
  /** Distinct prompts accepted from the batch (after rejection and collapsing duplicates). */
  prompts: number;
  /** New `MedSecondaryPrompt` rows. */
  created: number;
  /** Observation rows created, or whose limit, optional flag or reference changed. */
  observed: number;
  /** Observations that already existed with the same values (at most `lastCheckedAt` moved). */
  unchanged: number;
  /** Candidates dropped: empty text or key, text too long, a cycle outside the range, an unknown program. */
  rejected: number;
}

export interface RecordInput {
  schoolId: string;
  source: PromptSource;
  now: Date;
  prompts: readonly NormalizedPrompt[];
  /** The newest entry year an observation may carry (the cycle in progress). */
  siteCycle: number;
  /**
   * `forum` marks a prompt a forum post carried: the weakest evidence. It may add a prompt or an observation but never
   * changes or re-checks an existing one, so a person's quote cannot override a page's limit.
   */
  origin?: 'page' | 'forum';
}

/** `https:` and nothing that can name a post or a person: no userinfo, query string or fragment. Else null. */
export function sanitizeSourceRef(ref: string | null | undefined): string | null {
  if (typeof ref !== 'string' || ref === '' || ref.length > MAX_REF || /[?#]/.test(ref)) return null;
  try {
    const u = new URL(ref);
    if (u.protocol !== 'https:' || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '')
      return null;
    return ref;
  } catch {
    return null;
  }
}

function validLimit(limit: PromptLimit | null): PromptLimit | null {
  if (limit === null) return null;
  const ok = Number.isInteger(limit.value) && limit.value >= 1 && limit.value <= MAX_LIMIT;
  return ok && (limit.kind === 'WORDS' || limit.kind === 'CHARS') ? { kind: limit.kind, value: limit.value } : null;
}

interface Candidate {
  cycleYear: number;
  program: NormalizedPrompt['program'];
  key: string;
  text: string;
  limit: PromptLimit | null;
  optional: boolean;
  sourceRef: string | null;
}

const rank = (s: string): number => {
  const i = SOURCE_PRIORITY.indexOf(s as PromptSource);
  return i === -1 ? SOURCE_PRIORITY.length : i;
};

export async function recordPrompts(prisma: MedPrisma, input: RecordInput): Promise<RecordResult> {
  const { schoolId, source, now, siteCycle } = input;
  const weak = input.origin === 'forum';
  const result: RecordResult = { prompts: 0, created: 0, observed: 0, unchanged: 0, rejected: 0 };

  // 1. Validate and collapse: the first of two inputs with one key, program and cycle wins.
  const batch = new Map<string, Candidate>();
  for (const p of input.prompts) {
    const okCycle = Number.isInteger(p.cycleYear) && p.cycleYear >= MIN_STORED_CYCLE && p.cycleYear <= siteCycle;
    const okProgram = p.program === 'REG' || p.program === 'PHD';
    if (!okCycle || !okProgram || typeof p.text !== 'string' || p.text.length > MAX_TEXT) {
      result.rejected++;
      continue;
    }
    const parsed = parsePromptText(p.text);
    const key = secondaryKey(parsed.text);
    if (parsed.text === '' || key === '') {
      result.rejected++;
      continue;
    }
    const id = `${p.program}\u0000${key}\u0000${p.cycleYear}`;
    if (batch.has(id)) continue;
    batch.set(id, {
      cycleYear: p.cycleYear,
      program: p.program,
      key,
      text: parsed.text,
      // A source's own structured limit wins over one written in the text.
      limit: validLimit(p.limit) ?? validLimit(parsed.limit),
      optional: p.optional || parsed.optional,
      sourceRef: sanitizeSourceRef(p.sourceRef),
    });
  }
  result.prompts = batch.size;
  if (batch.size === 0) return result;

  // 2. What the school already holds, read once.
  const stored = await prisma.medSecondaryPrompt.findMany({ where: { schoolId } });
  const byKey = new Map<string, MedSecondaryPromptRow>(stored.map((r) => [`${r.program}\u0000${r.key}`, r]));
  const observations = new Map<string, MedSecondaryObservationRow[]>();
  if (stored.length > 0) {
    const rows = await prisma.medSecondaryObservation.findMany({
      where: { promptId: { in: stored.map((r) => r.id) } },
    });
    for (const o of rows) observations.set(o.promptId, [...(observations.get(o.promptId) ?? []), o]);
  }

  // 3. Write, sequentially: every write is create-or-touch, so a rerun changes nothing.
  for (const c of batch.values()) {
    const rowKey = `${c.program}\u0000${c.key}`;
    let prompt = byKey.get(rowKey);
    if (!prompt) {
      prompt = await prisma.medSecondaryPrompt.create({
        data: {
          schoolId,
          program: c.program,
          key: c.key,
          text: c.text,
          themes: tagThemes(c.text),
          themesVersion: THEMES_VERSION,
        },
      });
      byKey.set(rowKey, prompt);
      observations.set(prompt.id, []);
      result.created++;
    }
    const seen = observations.get(prompt.id) ?? [];
    const existing = seen.find((o) => o.cycleYear === c.cycleYear && o.source === source);

    if (existing) {
      // A check never moves backwards, and an input older than what is stored never overwrites it: a rerun of a dated
      // import (the school-pages file, checked on a past day) must not rewind a later check or an admin's correction.
      if (existing.lastCheckedAt.getTime() > now.getTime()) {
        result.unchanged++;
        continue;
      }
      if (weak) {
        result.unchanged++;
        continue;
      }
      const same =
        existing.limitKind === (c.limit?.kind ?? null) &&
        existing.limitValue === (c.limit?.value ?? null) &&
        existing.optional === c.optional &&
        (c.sourceRef === null || existing.sourceRef === c.sourceRef);
      const updated = await prisma.medSecondaryObservation.update({
        where: { id: existing.id },
        data: same
          ? { lastCheckedAt: now }
          : {
              limitKind: c.limit?.kind ?? null,
              limitValue: c.limit?.value ?? null,
              optional: c.optional,
              sourceRef: c.sourceRef ?? existing.sourceRef,
              lastCheckedAt: now,
            },
      });
      seen[seen.indexOf(existing)] = updated;
      if (same) result.unchanged++;
      else result.observed++;
    } else {
      const created = await prisma.medSecondaryObservation.create({
        data: {
          promptId: prompt.id,
          cycleYear: c.cycleYear,
          source,
          limitKind: c.limit?.kind ?? null,
          limitValue: c.limit?.value ?? null,
          optional: c.optional,
          sourceRef: c.sourceRef,
          firstSeenAt: now,
          lastCheckedAt: now,
        },
      });
      seen.push(created);
      observations.set(prompt.id, seen);
      result.observed++;
    }

    // The display wording follows the newest cycle; within a cycle the better source wins. An older cycle's wording
    // never overwrites a newer one, and a forum sighting never rewrites anything.
    if (!weak && prompt.text !== c.text) {
      const others = seen.filter((o) => o.cycleYear !== c.cycleYear || o.source !== source);
      const newest = Math.max(0, ...others.map((o) => o.cycleYear));
      const bestRankNow = Math.min(
        SOURCE_PRIORITY.length,
        ...others.filter((o) => o.cycleYear === c.cycleYear).map((o) => rank(o.source)),
      );
      const wins = c.cycleYear > newest || (c.cycleYear === newest && rank(source) <= bestRankNow);
      if (wins) {
        prompt = await prisma.medSecondaryPrompt.update({
          where: { id: prompt.id },
          data: { text: c.text, themes: tagThemes(c.text), themesVersion: THEMES_VERSION },
        });
        byKey.set(rowKey, prompt);
      }
    }
  }
  return result;
}

/** One row per school and source: when its page was last read and what it gave. */
export async function recordCheck(
  prisma: MedPrisma,
  input: {
    schoolId: string;
    source: PromptSource;
    now: Date;
    status: 'OK' | 'EMPTY' | 'UNAVAILABLE';
    promptCount: number;
  },
): Promise<void> {
  const fields = { checkedAt: input.now, status: input.status, promptCount: input.promptCount };
  // Never backwards: a dated re-import must not make a school look checked earlier than it was.
  const [current] = await prisma.medSecondaryCheck.findMany({
    where: { schoolId: input.schoolId, source: input.source },
  });
  if (current && current.checkedAt.getTime() > input.now.getTime()) return;
  await prisma.medSecondaryCheck.upsert({
    where: { schoolId_source: { schoolId: input.schoolId, source: input.source } },
    create: { schoolId: input.schoolId, source: input.source, ...fields },
    update: fields,
  });
}

/** How many observations the school has from this source (a page that now gives nothing is only "gone" if this is above 0). */
export async function storedObservationCount(
  prisma: MedPrisma,
  schoolId: string,
  source: PromptSource,
): Promise<number> {
  const prompts = await prisma.medSecondaryPrompt.findMany({ where: { schoolId } });
  if (prompts.length === 0) return 0;
  const rows = await prisma.medSecondaryObservation.findMany({
    where: { promptId: { in: prompts.map((p) => p.id) }, source },
  });
  return rows.length;
}

/** Re-tags prompts a newer rule table has not seen; the count it changed. Idempotent: a current row is not read again. */
export async function retagThemes(prisma: MedPrisma): Promise<number> {
  const old = await prisma.medSecondaryPrompt.findMany({ where: { themesVersion: { lt: THEMES_VERSION } } });
  for (const p of old) {
    await prisma.medSecondaryPrompt.update({
      where: { id: p.id },
      data: { themes: tagThemes(p.text), themesVersion: THEMES_VERSION },
    });
  }
  return old.length;
}
