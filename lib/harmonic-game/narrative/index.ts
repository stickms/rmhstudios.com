/** Narrative (H3.1): importing this registers `harmonic_dialogue` and `harmonic_hint`. */
import './entities';
import './flow-entities'; // harmonic_flag, harmonic_chapter_end, harmonic_ending (H3.2)

export * from './constants';
export * from './runner';
export * from './service';
export * from './speakers';
export * from './types';
export { ALL_SCRIPTS, findScript } from './scripts';
export { HarmonicDialogue, HarmonicHint } from './entities';
export * from './chapters';
export * from './flags';
export { ALL_ENDING_LINES, endingLines, epilogueLevel, isEnding, type EndingLine } from './endings';
export { HarmonicFlag, HarmonicChapterEnd, HarmonicEnding } from './flow-entities';
