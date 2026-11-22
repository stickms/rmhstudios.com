import {
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  CALM_COLOR_GAP_MS,
  mayChangeScreenColor,
  type SynapseAssistFlags,
} from '../engine/assist-profile';

/**
 * The value of the board's full-screen colour state, changing at most once per
 * second under calm visuals. A change that arrives early waits out the gap and
 * then applies the latest value; the timeout exists only while one is pending.
 */
export function useCappedScreenColor(
  value: boolean,
  flags: SynapseAssistFlags,
): boolean {
  const [
    shown,
    setShown,
  ] =
    useState(
      value,
    );
  const lastChange =
    useRef(
      0,
    );
  useEffect(() => {
    if (
      !flags.calm
    ) {
      setShown(
        value,
      );
      return;
    }
    if (
      value ===
      shown
    )
      return;
    const now =
      Date.now();
    if (
      mayChangeScreenColor(
        lastChange.current,
        now,
        flags,
      )
    ) {
      lastChange.current =
        now;
      setShown(
        value,
      );
      return;
    }
    const wait =
      Math.max(
        0,
        CALM_COLOR_GAP_MS -
          (now -
            lastChange.current),
      );
    const id =
      setTimeout(
        () => {
          lastChange.current =
            Date.now();
          setShown(
            value,
          );
        },
        wait,
      );
    return () =>
      clearTimeout(
        id,
      );
  }, [
    value,
    shown,
    flags,
  ]);
  return flags.calm
    ? shown
    : value;
}

/** With no timers a run has no natural end: the player ends it. */
export function EndRunButton({
  onEndRun,
}: {
  onEndRun: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'game-assists',
    );
  return (
    <button
      type="button"
      className="assist-end-run"
      onClick={
        onEndRun
      }
    >
      {t(
        'end-run',
        {
          defaultValue:
            'End run',
        },
      )}
    </button>
  );
}

// Colour-safe: the card's colour-coded states (correct, wrong, running out of time) also say so in words.
export function CardStateMark({
  status,
  urgent,
}: {
  status:
    | 'idle'
    | 'correct'
    | 'wrong';
  urgent: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'game-assists',
    );
  if (
    status ===
    'correct'
  )
    return (
      <span className="card-state-mark">
        {t(
          'state-correct',
          {
            defaultValue:
              '\u2713 Correct',
          },
        )}
      </span>
    );
  if (
    status ===
    'wrong'
  )
    return (
      <span className="card-state-mark">
        {t(
          'state-wrong',
          {
            defaultValue:
              '\u2715 Wrong',
          },
        )}
      </span>
    );
  if (
    urgent
  )
    return (
      <span className="card-state-mark">
        {t(
          'state-urgent',
          {
            defaultValue:
              '! Running out',
          },
        )}
      </span>
    );
  return null;
}
