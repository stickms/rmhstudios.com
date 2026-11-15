/**
 * Whether the learner has gone away from a timed run. The tap lesson runs on timers (the screen
 * follows the metronome's look-ahead, the finish is a timer) and a browser throttles timers in a
 * tab that is hidden, or a window that has been out of focus for a while. A run on throttled
 * timers shows beats late and scores wrongly, so it is dropped instead: the tab going hidden
 * drops it at once; the window losing focus drops it only if it stays away for {@link AWAY_BLUR_MS}
 * (a click into the browser's own chrome, or a dialog, comes back before that).
 *
 * Pure of the DOM: it is handed the document and window (anything with `addEventListener`), so it
 * runs against plain `EventTarget`s in a test. Returns the stop function.
 */
export const AWAY_BLUR_MS = 1500;

export type AwayReason =
  | 'hidden'
  | 'blurred';

interface Listenable {
  addEventListener(
    type: string,
    listener: () => void,
  ): void;
  removeEventListener(
    type: string,
    listener: () => void,
  ): void;
}

export function watchAway({
  doc,
  win,
  onAway,
  blurMs = AWAY_BLUR_MS,
}: {
  doc: Listenable & {
    readonly hidden: boolean;
  };
  win: Listenable;
  onAway: (
    reason: AwayReason,
  ) => void;
  blurMs?: number;
}): () => void {
  let timer:
    | ReturnType<
        typeof setTimeout
      >
    | undefined;
  const clear =
    () => {
      clearTimeout(
        timer,
      );
      timer =
        undefined;
    };
  const onVisibility =
    () => {
      if (
        doc.hidden
      ) {
        clear();
        onAway(
          'hidden',
        );
      }
    };
  const onBlur =
    () => {
      clear();
      timer =
        setTimeout(
          () => {
            timer =
              undefined;
            onAway(
              'blurred',
            );
          },
          blurMs,
        );
    };
  doc.addEventListener(
    'visibilitychange',
    onVisibility,
  );
  win.addEventListener(
    'blur',
    onBlur,
  );
  win.addEventListener(
    'focus',
    clear,
  );
  return () => {
    clear();
    doc.removeEventListener(
      'visibilitychange',
      onVisibility,
    );
    win.removeEventListener(
      'blur',
      onBlur,
    );
    win.removeEventListener(
      'focus',
      clear,
    );
  };
}
