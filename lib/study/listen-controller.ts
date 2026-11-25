/**
 * The sequence behind Listen (s11-17): say a side, and after the front, wait the member's delay and show the back.
 * It owns no browser API: speech, the sound player and the timer come in as functions, so the order of events is
 * tested without a browser, and `components/study/useCardListen.ts` hands it the real ones. Nothing here grades a
 * card; the only thing it ever does to a session is ask for the answer to be shown.
 */
import type { Spoken } from '@/lib/study/listen';

/** What to play for one side. A card's own recording is played instead of speech. */
export interface SideRequest {
  spoken: Spoken;
  /** The language the speech is in (a BCP 47 tag). */
  lang: string;
  /** The address of the member's own recording of this side, when there is one. */
  soundUrl?: string | undefined;
  /** Seconds to wait after this side before asking for the answer; absent: never ask (the member decides). */
  revealAfter?: number | undefined;
}

export interface ListenDeps {
  /** Say `text` in `lang`; call `done` when it ends (or cannot be said). Returns a function that silences it. */
  speak: (text: string, lang: string, done: () => void) => () => void;
  /** Play a recording; call `done` when it ends. Returns a function that stops it. */
  playSound: (url: string, done: () => void) => () => void;
  /** A one-shot timer (a `setTimeout`, never a frame loop). Returns its cancel. */
  later: (run: () => void, ms: number) => () => void;
  /** Show the answer now. */
  reveal: () => void;
}

export interface ListenController {
  /** Play a side from its start, silencing anything still playing or pending. What the side is: see {@link SideOutcome}. */
  play: (request: SideRequest) => SideOutcome;
  /** Silence the speech and cancel the pending reveal. */
  stop: () => void;
}

/** `spoken` and `sound` started something; `picture` and `none` did not (the session waits for the member). */
export type SideOutcome = 'spoken' | 'sound' | 'picture' | 'none';

export function createListenController(deps: ListenDeps): ListenController {
  let silence: (() => void) | null = null;
  let cancelTimer: (() => void) | null = null;
  /** Bumped by every play and stop, so a side that finishes after it was replaced does nothing. */
  let turn = 0;

  const stop = () => {
    turn++;
    silence?.();
    silence = null;
    cancelTimer?.();
    cancelTimer = null;
  };

  const afterSide = (mine: number, seconds: number | undefined) => {
    if (mine !== turn) return;
    silence = null;
    if (seconds === undefined || seconds <= 0) return;
    cancelTimer = deps.later(() => {
      if (mine !== turn) return;
      cancelTimer = null;
      deps.reveal();
    }, seconds * 1000);
  };

  return {
    stop,
    play: (request) => {
      stop();
      const mine = turn;
      const done = () => afterSide(mine, request.revealAfter);
      if (request.soundUrl) {
        silence = deps.playSound(request.soundUrl, done);
        return 'sound';
      }
      if (request.spoken.kind === 'text') {
        silence = deps.speak(request.spoken.text, request.lang, done);
        return 'spoken';
      }
      return request.spoken.kind;
    },
  };
}
