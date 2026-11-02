/**
 * The client side of chapter transitions and endings (H3.2). `harmonic_chapter_end` /
 * `harmonic_ending` emit a `clientcommand` (narrative/chapters.ts); this controller answers it:
 *
 *   goto <level>  curtain down (HUD fades to black over CURTAIN_MS), then load the level; once it
 *                 is up, the chapter's title card ("Chapter 2 — Listening Post") shows over black
 *                 for CARD_MS and fades out. A level that fails to load becomes the end card.
 *   end           the run stops (`host.end()`); the page shows "End of the current build".
 *
 * Pure apart from its timer (injected), so it runs under Node tests.
 */
import type { SpContentHost } from '../../tf2-game/client/sp-client';
import { chapterById, parseFlowCommand } from '../narrative/chapters';
import type { HarmonicHudState } from './hud-state';

/** The fade to black before the next chapter loads (ms, wall clock). */
export const CURTAIN_MS = 900;
/** How long a chapter title card stays up after a chapter starts (HUD seconds). */
export const CARD_S = 4;
/** The last part of the card, spent fading it out (HUD seconds). */
export const CARD_FADE_S = 1.2;

export interface FlowTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const realTimers: FlowTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class ChapterFlow {
  private timer: unknown = null;
  private curtain = false;
  private cardLevel: string | null = null;
  private cardFrom = -1;

  constructor(private readonly timers: FlowTimers = realTimers) {}

  /** `SpContent.onClientCommand`. Commands that are not Harmonic's are ignored. */
  handle(command: string, host: SpContentHost): void {
    const cmd = parseFlowCommand(command);
    if (!cmd) return;
    this.cancel();
    if (cmd.kind === 'end') {
      host.end();
      return;
    }
    this.curtain = true;
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (!host.loadMap(cmd.level)) host.end();
    }, CURTAIN_MS);
  }

  /** A level finished loading: lower the curtain; a chapter starts its title card. */
  levelLoaded(levelId: string): void {
    this.curtain = false;
    this.cardLevel = chapterById(levelId) ? levelId : null;
    this.cardFrom = -1;
  }

  /** The level is being torn down (quit, or the next load): drop a pending transition. */
  cancel(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }

  /** The HUD slice. `hudNow` is the HUD clock (`HudState.now`). */
  readHud(hudNow: number): Pick<HarmonicHudState, 'chapter' | 'curtain'> {
    const out: Pick<HarmonicHudState, 'chapter' | 'curtain'> = {};
    if (this.curtain) out.curtain = true;
    const ch = this.cardLevel ? chapterById(this.cardLevel) : undefined;
    if (ch) {
      if (this.cardFrom < 0) this.cardFrom = hudNow;
      if (hudNow - this.cardFrom < CARD_S) {
        out.chapter = {
          number: ch.number,
          titleKey: ch.titleKey,
          titleDefault: ch.titleDefault,
          fading: hudNow - this.cardFrom >= CARD_S - CARD_FADE_S,
        };
      }
    }
    return out;
  }
}
