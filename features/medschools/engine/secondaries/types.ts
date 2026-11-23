import type { MedProgram } from '../types';

/**
 * Where a prompt was read (the `MedPromptSource` enum). Three sources: Admit's public secondary-essays page, SDN (its
 * essay-questions page and the forum posts the live SDN job already reads), and the school's own page (a one-time
 * curated import, never a scraper). CycleTrack is not a source here.
 */
export const PROMPT_SOURCES = ['ADMIT', 'SDN', 'SCHOOL'] as const;
export type PromptSource = (typeof PROMPT_SOURCES)[number];

/** Which source's display values win for one prompt and cycle, best first. */
export const SOURCE_PRIORITY: readonly PromptSource[] = ['SCHOOL', 'ADMIT', 'SDN'];

export type LimitKind = 'WORDS' | 'CHARS';
export interface PromptLimit {
  kind: LimitKind;
  value: number;
}

/** What every adapter and the school import emit. No field can hold a person. */
export interface NormalizedPrompt {
  cycleYear: number;
  program: MedProgram;
  text: string;
  limit: PromptLimit | null;
  optional: boolean;
  sourceRef: string | null;
}
