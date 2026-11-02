/**
 * Endings (H3.2): the three choices, their epilogue levels and the flag-dependent epilogue lines.
 *
 * Flags change what the epilogue SAYS, never which endings are available. `endingLines` returns the
 * ordered variant lines for an ending given the saved flags; every key has a short English default
 * in the story's voice now, which the H4.7 author may reword (a reworded line is a NEW key, because
 * `defaultValue` only applies to a missing key — repo CLAUDE.md, i18n).
 *
 * Pure data, environment-agnostic. (The `harmonic_ending` entity lives in flow-entities.ts.)
 */
import { EPILOGUE_LEVELS } from './chapters';
import { ENDINGS, type Ending, type FlagValue } from './flags';

export { ENDINGS, EPILOGUE_LEVELS };
export type { Ending };

export const isEnding = (v: string): v is Ending => (ENDINGS as readonly string[]).includes(v);

export const epilogueLevel = (e: Ending): string => EPILOGUE_LEVELS[e];

export interface EndingLine {
  key: string;
  defaultValue: string;
}

interface Variants {
  /** Always played. */
  base: EndingLine;
  /** After `sanaHelped` is true / false. */
  sana: { yes: EndingLine; no: EndingLine };
  /** After `vossSpared` is true / false. */
  voss: { yes: EndingLine; no: EndingLine };
}

const line = (key: string, defaultValue: string): EndingLine => ({ key, defaultValue });

/** The data table: placeholders for the H4.7 author, one line per slot. */
const TABLE: Record<Ending, Variants> = {
  anchor: {
    base: line('ch7.ending.anchor.base', 'The ship settles on the ice. It is only a ship now.'),
    sana: {
      yes: line(
        'ch7.ending.anchor.sana_yes',
        'Sana reads the gauges aloud, and for once they agree.',
      ),
      no: line(
        'ch7.ending.anchor.sana_no',
        'Nobody is left to read the gauges. You read them yourself.',
      ),
    },
    voss: {
      yes: line('ch7.ending.anchor.voss_yes', 'Voss lowers his rifle and watches the crew fade.'),
      no: line('ch7.ending.anchor.voss_no', 'There is no one on the ramp to argue with the ship.'),
    },
  },
  release: {
    base: line('ch7.ending.release.base', 'The string finishes its jump. Harbour lights, 1971.'),
    sana: {
      yes: line(
        'ch7.ending.release.sana_yes',
        "A note in Sana's hand is waiting in the harbour office.",
      ),
      no: line('ch7.ending.release.sana_no', 'The harbour office has no note. You write one.'),
    },
    voss: {
      yes: line(
        'ch7.ending.release.voss_yes',
        'Somewhere ahead of you, Voss is a young man with a clipboard.',
      ),
      no: line(
        'ch7.ending.release.voss_no',
        'The year holds no one who will come looking for you.',
      ),
    },
  },
  silence: {
    base: line('ch7.ending.silence.base', 'The hum stops. The ice is only ice.'),
    sana: {
      yes: line(
        'ch7.ending.silence.sana_yes',
        'You walk the other way, and you hum what Sana taught you.',
      ),
      no: line('ch7.ending.silence.sana_no', 'You walk the other way, and the quiet follows you.'),
    },
    voss: {
      yes: line('ch7.ending.silence.voss_yes', 'You hope the commander got home.'),
      no: line('ch7.ending.silence.voss_no', 'You do not look back at the array.'),
    },
  },
};

/** The epilogue's variant lines, in play order: base, then Sana's, then Voss's. */
export function endingLines(
  ending: Ending,
  flags: Readonly<Record<string, FlagValue>>,
): EndingLine[] {
  const t = TABLE[ending];
  return [
    t.base,
    flags.sanaHelped === true ? t.sana.yes : t.sana.no,
    flags.vossSpared === true ? t.voss.yes : t.voss.no,
  ];
}

/** Every line of every ending (catalogue and tests). */
export const ALL_ENDING_LINES: readonly EndingLine[] = ENDINGS.flatMap((e) => {
  const t = TABLE[e];
  return [t.base, t.sana.yes, t.sana.no, t.voss.yes, t.voss.no];
});
