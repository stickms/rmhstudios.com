/**
 * Chapter order and the chapter-to-chapter command (H3.2).
 *
 * DECISION: levels are compiled from TypeScript, so there are no landmarks and no engine
 * `trigger_changelevel` (that builds a transition record of carried entities we neither have nor
 * want). A chapter ends with the point entity `harmonic_chapter_end` (input `End`): it saves the
 * flags and emits a `clientcommand` sim event; the Harmonic client (SpContent.onClientCommand)
 * fades out, loads the next chapter and shows its title card. Anything not yet authored is "not
 * available" and the client shows the "End of the current build" card instead.
 *
 * Pure data, environment-agnostic.
 */

export interface HarmonicChapter {
  /** The level id (`levels/<id>.ts`, registered in HARMONIC_LEVELS by its chapter work package). */
  id: string;
  /** 1-based. */
  number: number;
  titleKey: string;
  titleDefault: string;
}

export const HARMONIC_CHAPTERS: readonly HarmonicChapter[] = [
  { id: 'h1_whiteout', number: 1, titleKey: 'chapter_h1_whiteout', titleDefault: 'Whiteout' },
  {
    id: 'h2_listening',
    number: 2,
    titleKey: 'chapter_h2_listening',
    titleDefault: 'Listening Post',
  },
  {
    id: 'h3_still_point',
    number: 3,
    titleKey: 'chapter_h3_still_point',
    titleDefault: 'Still Point',
  },
  {
    id: 'h4_below_decks',
    number: 4,
    titleKey: 'chapter_h4_below_decks',
    titleDefault: 'Below Decks',
  },
  {
    id: 'h5_long_corridor',
    number: 5,
    titleKey: 'chapter_h5_long_corridor',
    titleDefault: 'Long Corridor',
  },
  { id: 'h6_drive_room', number: 6, titleKey: 'chapter_h6_drive_room', titleDefault: 'Drive Room' },
  { id: 'h7_harmonic', number: 7, titleKey: 'chapter_h7_harmonic', titleDefault: 'Harmonic' },
];

/** A two-room fake chain for testing transitions (levels/dev_flow.ts). Not on the title screen. */
export const HARMONIC_DEV_CHAPTERS: readonly HarmonicChapter[] = [
  { id: 'dev_flow_a', number: 1, titleKey: 'chapter_dev_flow_a', titleDefault: 'Dev flow A' },
  { id: 'dev_flow_b', number: 2, titleKey: 'chapter_dev_flow_b', titleDefault: 'Dev flow B' },
];

const CHAINS = [HARMONIC_CHAPTERS, HARMONIC_DEV_CHAPTERS];

export function chapterById(id: string): HarmonicChapter | undefined {
  for (const c of CHAINS) {
    const f = c.find((x) => x.id === id);
    if (f) return f;
  }
  return undefined;
}

/** The chapter after `id` in its own chain, or null at the end of the chain / for a non-chapter. */
export function nextChapter(id: string): HarmonicChapter | null {
  for (const c of CHAINS) {
    const i = c.findIndex((x) => x.id === id);
    if (i >= 0) return c[i + 1] ?? null;
  }
  return null;
}

/** Epilogue level ids, one per ending (sources land in H4.7). */
export const EPILOGUE_LEVELS = {
  anchor: 'h7_epilogue_anchor',
  release: 'h7_epilogue_release',
  silence: 'h7_epilogue_silence',
} as const;

// ─── The client command ───────────────────────────────────────────────────────

const PREFIX = 'harmonic_flow';

export type FlowCommand = { kind: 'goto'; level: string } | { kind: 'end' };

/** `harmonic_flow goto <level>` or `harmonic_flow end`. */
export const flowCommand = (target: string | null): string =>
  target ? `${PREFIX} goto ${target}` : `${PREFIX} end`;

export function parseFlowCommand(command: string): FlowCommand | null {
  const [head, verb, arg] = command.trim().split(/\s+/);
  if (head !== PREFIX) return null;
  if (verb === 'end') return { kind: 'end' };
  if (verb === 'goto' && arg && /^[a-z0-9_]{1,64}$/.test(arg)) return { kind: 'goto', level: arg };
  return null;
}
