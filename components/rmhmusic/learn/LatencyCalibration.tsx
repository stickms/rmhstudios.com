'use client';

/**
 * LatencyCalibration — eight clicks at 100 BPM; the learner plays along on
 * whatever input they use (or taps the pad), and the median lag between click
 * and note (`medianOffset`) is saved as the profile's `latencyMs`. Skippable at
 * any point; too few taps asks to try again rather than saving a guess.
 *
 * Clocks: clicks are scheduled on the AudioContext clock (`ctx.currentTime`,
 * seconds), while note events carry `performance.now()` ms. One offset,
 * `performance.now() - ctx.currentTime * 1000`, measured once just before
 * scheduling, maps each click onto the note clock. It is the *scheduled* time,
 * so the result includes the output delay before the click is heard as well as
 * the input path's delay — the total a lesson has to allow for.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { medianOffset } from '@/lib/rmhmusic/learn/calibration';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { getAudioContext } from '@/lib/shared/platform';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './buttons';
import { useNoteEvents } from './useLearnInput';

const CLICKS = 8;
const BEAT_S = 60 / 100;
/** Time before the first click, so the learner is ready. */
const LEAD_S = 1;
const CLICK_LEN_S = 0.05;
/** The note the tap pad sends through the on-screen keys. */
const PAD_NOTE = 72;

type Phase = 'intro' | 'running' | 'done' | 'retry' | 'no-audio';

export function LatencyCalibration({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('c-rmhmusic');
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const [phase, setPhase] = useState<Phase>('intro');
  const [beat, setBeat] = useState(-1);
  const [taps, setTaps] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const clicks = useRef<number[]>([]);
  const responses = useRef<number[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const running = useRef(false);

  const clearTimers = () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  useNoteEvents((e) => {
    if (!running.current || e.type !== 'on') return;
    responses.current.push(e.time);
    setTaps((n) => n + 1);
  });

  const start = async () => {
    const ctx = getAudioContext();
    if (!ctx) {
      setPhase('no-audio');
      return;
    }
    try {
      if (ctx.state === 'suspended') await ctx.resume();
    } catch {
      setPhase('no-audio');
      return;
    }
    const { hub } = useLearnStore.getState();
    // Keys inputs need their source on; mic and MIDI were turned on from the chooser.
    if (input === 'keys') await hub?.start('keys').catch(() => {});
    await hub?.start('screen').catch(() => {});

    clearTimers();
    clicks.current = [];
    responses.current = [];
    setTaps(0);
    setBeat(-1);
    setResult(null);

    // The one clock conversion (see the docblock).
    const offsetMs = performance.now() - ctx.currentTime * 1000;
    const t0 = ctx.currentTime + LEAD_S;
    for (let i = 0; i < CLICKS; i++) {
      const at = t0 + i * BEAT_S;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 1500 : 1000;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.3, at + 0.002);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + CLICK_LEN_S);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + CLICK_LEN_S);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      const clickMs = at * 1000 + offsetMs;
      clicks.current.push(clickMs);
      timers.current.push(setTimeout(() => setBeat(i), clickMs - performance.now()));
    }

    running.current = true;
    setPhase('running');
    const endMs = clicks.current[CLICKS - 1] + BEAT_S * 1000;
    timers.current.push(
      setTimeout(() => {
        running.current = false;
        const ms = medianOffset(clicks.current, responses.current);
        if (ms === null) {
          setPhase('retry');
          return;
        }
        setResult(Math.max(-500, Math.min(500, ms)));
        setPhase('done');
        void useLearnStore.getState().setLatency(ms);
      }, endMs - performance.now()),
    );
  };

  const skip = () => {
    running.current = false;
    clearTimers();
    onDone();
  };

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
        className="glass-inset flex min-h-28 w-full items-center justify-center rounded-(--app-radius) text-lg font-semibold text-(--app-text) select-none"
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
          <button type="button" onClick={() => void start()} className={PRIMARY_BUTTON}>
            {phase === 'intro'
              ? t('latency-start', { defaultValue: 'Start' })
              : t('latency-again', { defaultValue: 'Try again' })}
          </button>
        )}
      </div>
    </div>
  );
}
