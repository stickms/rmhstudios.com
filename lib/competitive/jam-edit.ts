/**
 * Editing a game jam after it was created (s14-14): the pure rules. Client-safe, no I/O.
 *
 * What may change depends on the phase, read from the jam's own dates:
 *  - before the start: everything but the slug. A voting jam's theme is the vote's result, so it is never editable;
 *    its vote-opening time is editable only while the vote has not opened;
 *  - after the start, before submissions close: the description, and the two deadlines, which may only move later;
 *  - after submissions close: the description and the rating deadline (later only);
 *  - after rating closes: nothing.
 * The date order (`start < submissions close < rating close`) is one rule, used by creation and by every edit.
 */
import { jamPhase, type JamPhase } from './jam';
import { resolveVoteOpensAt } from './jam-themes';

export const JAM_EDIT_FIELDS = [
  'title',
  'description',
  'theme',
  'startsAt',
  'submitEndsAt',
  'ratingEndsAt',
  'themeVoteOpensAt',
] as const;
export type JamEditField = (typeof JAM_EDIT_FIELDS)[number];

/** `free`: any valid value; `later`: only a later time than now (a deadline once the jam has started); `locked`. */
export type EditMode = 'free' | 'later' | 'locked';

/** Why a field is locked, for the line beside it in the dialog (the dialog owns the translated copy). */
export type LockReason = 'started' | 'voting-theme' | 'vote-opened' | 'no-vote' | 'ended';

export interface EditableJam {
  startsAt: Date;
  submitEndsAt: Date;
  ratingEndsAt: Date;
  themeVoting: boolean;
  themeVoteOpensAt: Date | null;
}

export interface FieldRule {
  mode: EditMode;
  /** Set when `mode` is `locked`. */
  reason?: LockReason;
}

const FREE: FieldRule = { mode: 'free' };
const LATER: FieldRule = { mode: 'later' };
const locked = (reason: LockReason): FieldRule => ({ mode: 'locked', reason });

/** The rule for every field right now. Pure: the phase comes from the dates and `now`. */
export function editableFields(jam: EditableJam, now: Date = new Date()): Record<JamEditField, FieldRule> {
  const phase: JamPhase = jamPhase(jam, now);
  if (phase === 'done') {
    return Object.fromEntries(JAM_EDIT_FIELDS.map((f) => [f, locked('ended')])) as Record<JamEditField, FieldRule>;
  }
  if (phase !== 'upcoming') {
    return {
      title: locked('started'),
      description: FREE,
      theme: locked('started'),
      startsAt: locked('started'),
      submitEndsAt: phase === 'open' ? LATER : locked('started'),
      ratingEndsAt: LATER,
      themeVoteOpensAt: locked('started'),
    };
  }
  // A vote that has opened (or a null opening time, which means open) is fixed: members were told when to vote.
  const voteOpen = !jam.themeVoteOpensAt || jam.themeVoteOpensAt.getTime() <= now.getTime();
  return {
    title: FREE,
    description: FREE,
    theme: jam.themeVoting ? locked('voting-theme') : FREE,
    startsAt: FREE,
    submitEndsAt: FREE,
    ratingEndsAt: FREE,
    themeVoteOpensAt: !jam.themeVoting ? locked('no-vote') : voteOpen ? locked('vote-opened') : FREE,
  };
}

/** The one date-order rule: `start < submissions close < rating close`. Creation and edits both use it. */
export function datesInOrder(startsAt: Date, submitEndsAt: Date, ratingEndsAt: Date): boolean {
  return startsAt.getTime() < submitEndsAt.getTime() && submitEndsAt.getTime() < ratingEndsAt.getTime();
}

/** What an edit may carry: every field optional; a date is a `Date`. */
export interface JamPatch {
  title?: string | undefined;
  description?: string | undefined;
  theme?: string | undefined;
  startsAt?: Date | undefined;
  submitEndsAt?: Date | undefined;
  ratingEndsAt?: Date | undefined;
  themeVoteOpensAt?: Date | undefined;
}

/** The stored values an edit compares against. */
export interface JamState extends EditableJam {
  title: string;
  description: string;
  theme: string;
}

/** The columns an accepted edit writes (only the changed ones are present). */
export interface JamEditData {
  title?: string;
  description?: string;
  theme?: string;
  startsAt?: Date;
  submitEndsAt?: Date;
  ratingEndsAt?: Date;
  themeVoteOpensAt?: Date;
}

export type EditCode = 'JAM_EDIT_LOCKED' | 'JAM_DATES_ORDER' | 'JAM_DEADLINE_SHORTER' | 'JAM_VOTE_OPENS_LATE';

export type JamEditOutcome =
  | {
      ok: true;
      /** The fields whose value actually changes, in `JAM_EDIT_FIELDS` order. A patch that repeats stored values changes none. */
      changed: JamEditField[];
      /** The columns to write: only the changed ones. */
      data: JamEditData;
    }
  | { ok: false; code: EditCode; field?: JamEditField };

const same = (a: string | Date | null | undefined, b: string | Date | null | undefined): boolean =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;

/**
 * Validate an edit against the jam as it stands at `now`. A field the patch repeats unchanged is ignored, so a
 * dialog may send every field; a changed field the phase locks is refused, a deadline that moves earlier once the
 * jam has started is refused, and the resulting dates must keep the order.
 */
export function validateJamEdit(jam: JamState, patch: JamPatch, now: Date = new Date()): JamEditOutcome {
  const rules = editableFields(jam, now);
  const next: JamEditData = {};
  const changed: JamEditField[] = [];
  for (const field of JAM_EDIT_FIELDS) {
    const value = patch[field];
    if (value === undefined) continue;
    const current = jam[field];
    if (same(value, current)) continue;
    const rule = rules[field];
    if (rule.mode === 'locked') return { ok: false, code: 'JAM_EDIT_LOCKED', field };
    if (rule.mode === 'later') {
      // `later` is only ever a date; a deadline can be extended, never shortened, and never into the past.
      const to = value as Date;
      const from = current as Date;
      if (to.getTime() <= from.getTime() || to.getTime() <= now.getTime()) {
        return { ok: false, code: 'JAM_DEADLINE_SHORTER', field };
      }
    }
    if (field === 'title' || field === 'description' || field === 'theme') next[field] = value as string;
    else next[field] = value as Date;
    changed.push(field);
  }
  const startsAt = next.startsAt ?? jam.startsAt;
  const submitEndsAt = next.submitEndsAt ?? jam.submitEndsAt;
  const ratingEndsAt = next.ratingEndsAt ?? jam.ratingEndsAt;
  if (!datesInOrder(startsAt, submitEndsAt, ratingEndsAt)) return { ok: false, code: 'JAM_DATES_ORDER' };
  // A voting jam: the vote must open before the (possibly new) start.
  if (jam.themeVoting && (next.startsAt || next.themeVoteOpensAt)) {
    const opensAt = next.themeVoteOpensAt ?? jam.themeVoteOpensAt;
    if (opensAt && !resolveVoteOpensAt(opensAt, startsAt, now)) {
      return { ok: false, code: 'JAM_VOTE_OPENS_LATE', field: 'themeVoteOpensAt' };
    }
  }
  return { ok: true, changed, data: next };
}
