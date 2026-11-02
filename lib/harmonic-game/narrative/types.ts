/**
 * Narrative data types (plan H3.1; architecture.md §6). Scripts are plain data: a chapter file
 * exports `DialogueScript[]`, the registry (`scripts/index.ts`) indexes them by id and levels start
 * them through a `harmonic_dialogue` entity. Pure; environment-agnostic.
 */

/** The cast (story.md). `ines` is the player; `odile` is only ever heard on the radio. */
export type SpeakerId = 'ines' | 'odile' | 'sana' | 'voss' | 'lind' | 'pavel';

/**
 * `voice`: said in the room (subtitled; no voice acting in phases 0-2).
 * `radio`: through the Trust's set: a click and a static bed around the line, and the HUD marks it.
 */
export type DialogueChannel = 'radio' | 'voice';

export interface DialogueLine {
  speaker: SpeakerId;
  /** `ch<N>.<scene>.<n>` (dev: `dev.<scene>.<n>`); a key in `locales/en/harmonic.json`. */
  key: string;
  /** The English text; must equal the catalogue entry (the drift test and the narrative test check). */
  defaultValue: string;
  /** How long the line stays up. Default: `defaultLineMs(defaultValue)`. */
  durationMs?: number;
  /** Default `voice`. */
  channel?: DialogueChannel;
}

export interface DialogueScript {
  /** Unique across all chapters, `ch<N>.<scene>` (dev: `dev.<scene>`). */
  id: string;
  lines: DialogueLine[];
  /**
   * Output names the starting `harmonic_dialogue` fires when the script finishes, in addition to
   * `OnFinished` (so one entity can drive several branches: `['OnUser1']`).
   */
  then?: string[];
  /** Plays at most once per level load (a death reload resets it). */
  once?: boolean;
}
