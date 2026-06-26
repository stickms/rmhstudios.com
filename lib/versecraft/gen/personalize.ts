// ─── Player Personalization ───────────────────────────────────────────────────
// Generated worlds are name- and gender-agnostic so a single cached/shared seed
// renders identically for everyone. To still address the player by THEIR name and
// pronouns, both the AI and the deterministic fallback write the player as tokens:
//
//   {mc}        → the player's name
//   {they}      → subject pronoun   (she / he / they / ze …)
//   {them}      → object pronoun    (her / him / them / zir …)
//   {their}     → possessive det.   (her / his / their / zir …)
//   {theirs}    → possessive pron.  (hers / his / theirs / zirs …)
//   {themself}  → reflexive         (herself / himself / themself …)
//   {they're}   → subject + "to be" (she's / he's / they're …)
//   {they've}   → subject + "have"  (she's / he's / they've …)
//
// `personalize` substitutes these at the LAST moment (render time) using the
// player's own settings, so shareable worlds stay universal while every player
// sees their own name and pronouns. Capitalization is inferred from sentence
// position, so writers never have to spell out a capitalized token.

import type { Pronouns } from './world-types';

export interface PronounSet {
  subject: string;        // they / she / he
  object: string;         // them / her / him
  possessive: string;     // their / her / his
  possessivePronoun: string; // theirs / hers / his
  reflexive: string;      // themself / herself / himself
  /** "to be" contraction: they're / she's / he's */
  contractionBe: string;
  /** "have" contraction: they've / she's / he's */
  contractionHave: string;
  /** Whether the subject takes plural verb agreement (they ARE vs she IS). */
  plural: boolean;
}

const PRESETS: Record<string, PronounSet> = {
  'she/her': {
    subject: 'she', object: 'her', possessive: 'her', possessivePronoun: 'hers',
    reflexive: 'herself', contractionBe: "she's", contractionHave: "she's", plural: false,
  },
  'he/him': {
    subject: 'he', object: 'him', possessive: 'his', possessivePronoun: 'his',
    reflexive: 'himself', contractionBe: "he's", contractionHave: "he's", plural: false,
  },
  'they/them': {
    subject: 'they', object: 'them', possessive: 'their', possessivePronoun: 'theirs',
    reflexive: 'themself', contractionBe: "they're", contractionHave: "they've", plural: true,
  },
};

/**
 * Resolve a pronoun set from the preset union, optionally overridden by a raw
 * custom string like "ze/zir/zirs" (1–4 slots: subject/object/possessive/
 * possessivePronoun). Anything unparseable falls back to they/them.
 */
export function pronounSet(pronouns: Pronouns | string, custom?: string): PronounSet {
  const raw = (custom ?? '').trim();
  if (raw) {
    const parts = raw.split(/[/,]/).map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const [subject, object, possessive, possessivePronoun] = parts;
      return {
        subject,
        object,
        possessive: possessive || object,
        possessivePronoun: possessivePronoun || possessive || `${object}s`,
        reflexive: `${object}self`,
        contractionBe: `${subject}'re`,
        contractionHave: `${subject}'ve`,
        plural: true, // neopronouns generally take plural agreement
      };
    }
  }
  return PRESETS[pronouns] ?? PRESETS['they/them'];
}

const TOKEN_RE = /\{(mc|name|they|them|their|theirs|themself|themselves|they're|theyre|they've|theyve)\}/gi;

/** Capitalize the first character of a string. */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** True if the character immediately before `idx` puts us at a sentence start. */
function atSentenceStart(text: string, idx: number): boolean {
  let i = idx - 1;
  // skip immediate whitespace
  while (i >= 0 && /\s/.test(text[i])) i--;
  if (i < 0) return true;                 // start of string
  return /[.!?:"'—–\-(]/.test(text[i]);   // after sentence punctuation / open quote
}

export interface PersonalizeOpts {
  name: string;
  pronouns: PronounSet;
}

/** Replace {mc}/{they}/… tokens with the player's name and pronouns. */
export function personalize(text: string, opts: PersonalizeOpts): string {
  if (!text || text.indexOf('{') === -1) return text;
  const p = opts.pronouns;
  return text.replace(TOKEN_RE, (match, rawKey: string, offset: number) => {
    const key = rawKey.toLowerCase();
    let value: string;
    let isPronoun = false;
    switch (key) {
      case 'mc': case 'name': value = opts.name; break;
      case 'they': value = p.subject; isPronoun = true; break;
      case 'them': value = p.object; isPronoun = true; break;
      case 'their': value = p.possessive; isPronoun = true; break;
      case 'theirs': value = p.possessivePronoun; isPronoun = true; break;
      case 'themself': case 'themselves': value = p.reflexive; isPronoun = true; break;
      case "they're": case 'theyre': value = p.contractionBe; isPronoun = true; break;
      case "they've": case 'theyve': value = p.contractionHave; isPronoun = true; break;
      default: return match;
    }
    // Names are already proper-cased; pronouns get sentence-start capitalization.
    if (isPronoun && atSentenceStart(text, offset)) return cap(value);
    return value;
  });
}

/** Convenience: build a personalizer bound to a player's name + pronouns. */
export function makePersonalizer(name: string, pronouns: Pronouns | string, custom?: string) {
  const set = pronounSet(pronouns, custom);
  const opts: PersonalizeOpts = { name: name || 'You', pronouns: set };
  return (text: string) => personalize(text, opts);
}
