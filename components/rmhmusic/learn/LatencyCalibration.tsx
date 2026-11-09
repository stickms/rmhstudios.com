'use client';

/**
 * LatencyCalibration — eight clicks at 100 BPM; the learner plays along on
 * whatever input they use (or taps the pad), and the median lag between click
 * and note (`medianOffset`) is saved as the profile's `latencyMs`. Skippable at
 * any point; too few taps asks to try again rather than saving a guess.
 *
 * The intro → preparing → running → done / retry / no-audio lifecycle is the
 * pure machine in `machines/calibration.ts`; this component carries out its
 * effects. The click track (`audio/clicks.ts`) is tracked as a whole, so Skip
 * and unmount silence the clicks still to come and clear every timer, and a
 * start that is still resuming sound when the dialog closes schedules nothing.
 * Click times are on the note clock (see `audio/clicks.ts`), so the result
 * includes the output delay as well as the input path's.
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { scheduleClicks, type ScheduledClicks } from '@/lib/rmhmusic/learn/audio/clicks';
import { resumeAudio } from '@/lib/rmhmusic/learn/audio/resume';
import { calibrationMachine, shown, type Effect } from '@/lib/rmhmusic/learn/machines/calibration';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { getAudioContext } from '@/lib/shared/platform';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './buttons';
import { useMachine } from './useMachine';
import { useNoteEvents } from './useLearnInput';

const CLICKS = 8;
const PLAN = { count: CLICKS, beatS: 60 / 100, leadS: 1, clickS: 0.05 };
/** The note the tap pad sends through the on-screen keys. */
const PAD_NOTE = 72;

export function LatencyCalibration({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('c-rmhmusic');
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const [state, send] = useMachine(calibrationMachine);
  /** The click track of the run in progress: a resource the effects own, not machine state. */
  const audio = useRef<ScheduledClicks | null>(null);

  const perform = (effects: Effect[]) => {
    for (const fx of effects) {
      switch (fx.type) {
        case 'prepare':
          void prepare(fx.token);
          break;
        case 'schedule': {
          const ctx = getAudioContext();
          if (!ctx) {
            perform(send({ type: 'prepared', token: fx.token, ok: false }));
            break;
          }
          audio.current?.cancel();
          const token = fx.token;
          audio.current = scheduleClicks(ctx, PLAN, {
            beat: (i) => perform(send({ type: 'beat', token, i })),
            end: () => perform(send({ type: 'finished', token })),
          });
          perform(send({ type: 'scheduled', token, clicks: audio.current.clicks }));
          break;
        }
        case 'cancel-audio':
          audio.current?.cancel();
          audio.current = null;
          break;
        case 'save':
          void useLearnStore.getState().setLatency(fx.ms);
          break;
        case 'close':
          onDone();
          break;
        default: {
          const never: never = fx;
          throw new Error(`calibration: unhandled effect ${JSON.stringify(never)}`);
        }
      }
    }
  };

  const prepare = async (token: number) => {
    const ctx = getAudioContext();
    if (!ctx) {
      perform(send({ type: 'prepared', token, ok: false }));
      return;
    }
    // Bounded: a resume that never settles shows "Sound can't play" instead of hanging here.
    if (!(await resumeAudio(ctx))) {
      perform(send({ type: 'prepared', token, ok: false }));
      return;
    }
    const { hub } = useLearnStore.getState();
    // Keys inputs need their source on; mic and MIDI were turned on from the chooser.
    if (input === 'keys') await hub?.start('keys').catch(() => {});
    await hub?.start('screen').catch(() => {});
    perform(send({ type: 'prepared', token, ok: true }));
  };

  // Unmount (the dialog closed): silence the clicks and clear the timers; a start still preparing is dropped.
  useEffect(
    () => () => {
      // `dispose` only ever asks to cancel the audio.
      if (send({ type: 'dispose' }).some((fx) => fx.type === 'cancel-audio')) {
        audio.current?.cancel();
        audio.current = null;
      }
    },
    [send],
  );

  useNoteEvents((e) => {
    if (e.type === 'on') perform(send({ type: 'tap', time: e.time }));
  });

  const view = shown(state);
  const phase = view.kind;
  const beat =
    view.kind === 'running' || view.kind === 'done' || view.kind === 'retry' ? view.beat : -1;
  const taps = view.kind === 'running' ? view.responses.length : 0;
  const result = view.kind === 'done' ? view.ms : null;

  const start = () => perform(send({ type: 'start' }));
  const skip = () => perform(send({ type: 'skip' }));

  const pad = (down: boolean) => {
    const { screen } = useLearnStore.getState();
    if (down) screen?.press(PAD_NOTE);
    else screen?.release(PAD_NOTE);
  };

  const hint =
    input === 'mic'
      ? t('latency-hint-mic', { defaultValue: 'Play or sing a short note on each click.' })
      : input === 'midi'
        ? t('latency-hint-midi', { defaultValue: 'Press a key on your controller on each click.' })
        : input === 'keys'
          ? t('latency-hint-keys', { defaultValue: 'Press A on your keyboard on each click.' })
          : t('latency-hint-screen', { defaultValue: 'Tap the pad on each click.' });

  return (
    <div className="space-y-4">
      <p className="text-sm text-(--app-text-muted)">
        {t('latency-intro', {
          defaultValue:
            'You will hear 8 clicks. Play along with each one. This tells lessons how much delay your setup adds.',
        })}
      </p>
      <p className="font-medium text-(--app-text)">{hint}</p>

      <div className="flex justify-center gap-2" aria-hidden="true">
        {Array.from({ length: CLICKS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-3 w-3 rounded-(--app-radius-sm) transition-colors',
              i <= beat ? 'bg-(--app-accent)' : 'bg-(--app-border-bright)',
            )}
          />
        ))}
      </div>

      <button
        type="button"
        className="glass-inset flex min-h-28 w-full items-center justify-center rounded-(--app-radius) border border-(--app-border-bright) text-lg font-semibold text-(--app-text) select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          e.preventDefault();
          pad(true);
        }}
        onPointerUp={() => pad(false)}
        onPointerCancel={() => pad(false)}
        onPointerLeave={() => pad(false)}
        onKeyDown={(e) => {
          if (e.key !== ' ' && e.key !== 'Enter') return;
          e.preventDefault();
          if (!e.repeat) pad(true);
        }}
        onKeyUp={() => pad(false)}
      >
        {t('latency-pad', { defaultValue: 'Tap' })}
      </button>

      <div aria-live="polite" className="min-h-6 text-sm">
        {phase === 'running' && (
          <p className="text-(--app-text-muted)">
            {t('latency-taps', {
              count: taps,
              defaultValue_one: '{{count}} tap heard',
              defaultValue: '{{count}} taps heard',
            })}
          </p>
        )}
        {phase === 'done' && result !== null && (
          <p className="font-medium text-(--app-success)">
            {t('latency-result', {
              ms: result,
              defaultValue: 'Done. Your setup adds about {{ms}} ms. Lessons will allow for it.',
            })}
          </p>
        )}
        {phase === 'retry' && (
          <p className="text-(--app-warning)">
            {t('latency-retry', {
              defaultValue: "We didn't catch enough taps. Try again and play on every click.",
            })}
          </p>
        )}
        {phase === 'no-audio' && (
          <p className="text-(--app-danger)">
            {t('latency-no-audio', {
              defaultValue: "Sound can't play in this browser, so timing can't be checked.",
            })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={skip} className={SECONDARY_BUTTON}>
          {phase === 'done'
            ? t('latency-back', { defaultValue: 'Back to inputs' })
            : t('latency-skip', { defaultValue: 'Skip' })}
        </button>
        {phase !== 'running' && phase !== 'no-audio' && (
          <button type="button" onClick={start} className={PRIMARY_BUTTON}>
            {phase === 'intro'
              ? t('latency-start', { defaultValue: 'Start' })
              : t('latency-again', { defaultValue: 'Try again' })}
          </button>
        )}
      </div>
    </div>
  );
}
