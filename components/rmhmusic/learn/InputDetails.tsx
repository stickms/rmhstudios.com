/**
 * The live parts of the input setup rows: the microphone's level bar and
 * detected note, the MIDI device list and played notes, and the plain-language
 * message shown when an input could not start. Each listens to the store's hub
 * only while mounted.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InputSource } from '@/lib/rmhmusic/learn/input/events';
import { AUDIO_START_ERROR } from '@/lib/rmhmusic/learn/input/mic';
import {
  DEFAULT_MIC_SETTINGS,
  MIC_GAIN_STEPS,
  MIC_GATE_STEPS,
  gainFromStep,
  gateFromStep,
  isMicHum,
  levelToDb,
  stepFromGain,
  stepFromGate,
} from '@/lib/rmhmusic/learn/input/mic-gain';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { Tabs } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { SECONDARY_BUTTON } from './buttons';
import { LiveStaff } from './LiveStaff';
import { useLastNote, useMicMeter, useMidiDevices, useNoteEvents, type MicMeter } from './useLearnInput';

/**
 * The level bar with the cutoff drawn over it, as a voice-chat app draws its input sensitivity: the bar
 * is the sound the microphone hears, the line is the cutoff, and sound left of the line is ignored. The
 * bar is the accent colour while it is above the line (heard) and muted below it (ignored).
 */
function MicMeterBar({ meter, shownGate }: { meter: MicMeter; shownGate: number }) {
  const { t } = useTranslation('c-rmhmusic');
  const heard = meter.level >= shownGate;
  return (
    <div
      role="meter"
      aria-label={t('mic-level', {
        defaultValue: 'Microphone level',
      })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(meter.level * 100)}
      className="relative h-3 w-full overflow-hidden rounded-app-sm bg-app-surface-active"
    >
      <div
        className={cn('h-full origin-left', heard ? 'bg-app-accent' : 'bg-app-text-muted')}
        style={{
          transform: `scaleX(${meter.level})`,
        }}
      />
      <div
        aria-hidden="true"
        data-mic-cutoff=""
        className="absolute inset-y-0 w-0.5 bg-app-text"
        style={{ left: `${Math.round(shownGate * 100)}%` }}
      />
    </div>
  );
}

/**
 * How the microphone is listened to (`input/mic-gain.ts`, `mic-auto.ts`). Automatic sensitivity, on
 * by default, steers the gain toward a steady level while a note sounds and keeps the cutoff just above
 * the room's noise; off, a gain slider (1x to 16x) and a cutoff slider are the learner's. Either way a
 * hum filter (50 or 60 Hz mains) can be turned on. Everything applies to the running microphone as it
 * moves, so the bar above answers at once, and is saved on the profile.
 */
function MicSensitivity({ meter }: { meter: MicMeter }) {
  const { t } = useTranslation('c-rmhmusic');
  const auto = useLearnStore((s) => s.profile?.micAuto ?? DEFAULT_MIC_SETTINGS.auto);
  const gain = useLearnStore((s) => s.profile?.micGain ?? DEFAULT_MIC_SETTINGS.gain);
  const gate = useLearnStore((s) => s.profile?.micGate ?? DEFAULT_MIC_SETTINGS.gate);
  const hum = useLearnStore((s) => s.profile?.micHum ?? DEFAULT_MIC_SETTINGS.hum);
  const failed = useLearnStore((s) =>
    ['micAuto', 'micGain', 'micGate', 'micHum'].some((k) => s.saveFailed.includes(k as never)),
  );
  const autoId = useId();
  const gainId = useId();
  const gateId = useId();
  const gainText = t('mic-sensitivity-value', { value: gain, defaultValue: '{{value}}x' });
  // A real minus sign, and pinned left to right below: in a right-to-left page "-48 dB" drew as "dB 48-".
  const cutoffText = t('mic-cutoff-value', {
    value: String(levelToDb(gate)).replace('-', '−'),
    defaultValue: '{{value}} dB',
  });
  const store = useLearnStore.getState;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={autoId} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-app-text">
          <input
            id={autoId}
            type="checkbox"
            checked={auto}
            onChange={(e) => void store().setMicAuto(e.target.checked)}
            className="size-5 shrink-0 accent-app-accent"
          />
          {t('mic-auto', { defaultValue: 'Automatic sensitivity' })}
        </label>
        <p className="text-sm text-app-text-muted">
          {auto
            ? t('mic-auto-on', {
                value: Math.round(meter.gain * 10) / 10,
                defaultValue: 'Adjusting by itself while you play. Gain now {{value}}x.',
              })
            : t('mic-auto-off', { defaultValue: 'Set the gain and the cutoff yourself.' })}
        </p>
      </div>

      {auto ? null : (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <label htmlFor={gainId} className="text-app-text">
                {t('mic-sensitivity', { defaultValue: 'Microphone sensitivity' })}
              </label>
              <span dir="ltr" className="text-app-text-muted">
                {gainText}
              </span>
            </div>
            <input
              id={gainId}
              type="range"
              min={0}
              max={MIC_GAIN_STEPS}
              step={1}
              value={stepFromGain(gain)}
              aria-valuetext={gainText}
              onChange={(e) => void store().setMicGain(gainFromStep(Number(e.target.value)))}
              className="h-11 w-full accent-app-accent"
            />
            <p className="text-sm text-app-text-muted">
              {t('mic-sensitivity-hint', {
                defaultValue: 'Raise it if the bar above barely moves when you play or sing.',
              })}
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <label htmlFor={gateId} className="text-app-text">
                {t('mic-cutoff', { defaultValue: 'Cutoff' })}
              </label>
              <span dir="ltr" className="text-app-text-muted">
                {cutoffText}
              </span>
            </div>
            <input
              id={gateId}
              type="range"
              min={0}
              max={MIC_GATE_STEPS}
              step={1}
              value={stepFromGate(gate)}
              aria-valuetext={cutoffText}
              onChange={(e) => void store().setMicGate(gateFromStep(Number(e.target.value)))}
              className="h-11 w-full accent-app-accent"
            />
            <p className="text-sm text-app-text-muted">
              {t('mic-cutoff-hint', {
                defaultValue:
                  'Sound quieter than the line on the bar is ignored. Raise it until a hum stops moving the bar.',
              })}
            </p>
          </div>
        </>
      )}

      <div className="space-y-1">
        <p className="text-sm text-app-text">{t('mic-hum', { defaultValue: 'Hum filter' })}</p>
        <Tabs
          dense
          tabs={[
            { id: 'off', label: t('mic-hum-off', { defaultValue: 'Off' }) },
            { id: '50', label: t('mic-hum-50', { defaultValue: '50 Hz' }) },
            { id: '60', label: t('mic-hum-60', { defaultValue: '60 Hz' }) },
          ]}
          value={hum}
          onChange={(id) => {
            if (isMicHum(id)) void store().setMicHum(id);
          }}
          size="sm"
          aria-label={t('mic-hum', { defaultValue: 'Hum filter' })}
        />
        <p className="text-sm text-app-text-muted">
          {t('mic-hum-hint', {
            defaultValue: 'Choose the mains frequency where you live if a steady low hum shows on the bar.',
          })}
        </p>
      </div>
      {failed ? (
        <p className="text-sm text-app-danger" role="status">
          {t('mic-sensitivity-failed', { defaultValue: "Couldn't save the sensitivity. It still applies here." })}
        </p>
      ) : null}
    </div>
  );
}

/** Live level bar with its cutoff, the sensitivity controls, and the note the microphone hears. */
export function MicDetails() {
  const { t } = useTranslation('c-rmhmusic');
  const meter = useMicMeter();
  const gate = useLearnStore((s) => s.profile?.micGate ?? DEFAULT_MIC_SETTINGS.gate);
  const note = useLastNote('mic');
  const cents = note?.cents === undefined ? null : Math.round(note.cents);
  // The running microphone reports the cutoff in force (automatic or manual); before it runs, the saved one.
  const shownGate = meter.gate > 0 ? meter.gate : Math.min(1, gate * 5);

  return (
    <div className="space-y-2">
      <MicMeterBar meter={meter} shownGate={shownGate} />
      <MicSensitivity meter={meter} />
      <p className="text-sm text-app-text-muted" aria-live="polite">
        {note
          ? t('mic-heard', {
              note: midiToName(note.midi),
              cents: cents === null ? '0' : `${cents > 0 ? '+' : ''}${cents}`,
              defaultValue: 'Hearing {{note}} ({{cents}} cents)',
            })
          : t('mic-listening', {
              defaultValue: 'Listening… play or sing a note.',
            })}
      </p>
      <LiveStaff source="mic" announce={false} className="max-w-48" />
    </div>
  );
}

/** Connected MIDI devices (live), a note when one is unplugged, and the notes being played. */
export function MidiDetails() {
  const { t } = useTranslation('c-rmhmusic');
  const devices = useMidiDevices();
  const [gone, setGone] = useState<string | null>(null);
  const previous = useRef(devices);
  const [playing, setPlaying] = useState<number[]>([]);

  useEffect(() => {
    const now = new Set(devices.map((d) => d.id));
    const lost = previous.current.find((d) => !now.has(d.id));
    if (lost) setGone(lost.name);
    else if (devices.length > previous.current.length) setGone(null);
    previous.current = devices;
  }, [devices]);

  useNoteEvents((e) => {
    if (e.source !== 'midi') return;
    setPlaying((prev) =>
      e.type === 'on'
        ? prev.includes(e.midi)
          ? prev
          : [...prev, e.midi].sort((a, b) => a - b)
        : prev.filter((m) => m !== e.midi),
    );
  });

  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      {gone && (
        <p className="text-app-warning">
          {t('midi-disconnected', {
            name: gone,
            defaultValue: '{{name}} was disconnected.',
          })}
        </p>
      )}
      {devices.length === 0 ? (
        <p className="text-app-text-muted">
          {t('midi-no-device', {
            defaultValue: 'Plug in or pair a MIDI controller. It will show up here.',
          })}
        </p>
      ) : (
        <ul className="space-y-1">
          {devices.map((d) => (
            <li key={d.id} className="font-medium text-app-text">
              {d.name}
            </li>
          ))}
        </ul>
      )}
      {devices.length > 0 && (
        <p className="min-h-6 text-app-text-muted">
          {playing.length > 0
            ? t('midi-playing', {
                notes: playing.map((m) => midiToName(m)).join(' '),
                defaultValue: 'Playing {{notes}}',
              })
            : t('midi-try', {
                defaultValue: 'Play a key: it lights up here.',
              })}
        </p>
      )}
      {devices.length > 0 && <LiveStaff source="midi" announce={false} className="max-w-48" />}
    </div>
  );
}

/** Plain words for why an input could not start, with the always-working fallback. */
export function InputErrorNotice({
  source,
  error,
  onFallback,
}: {
  source: Extract<InputSource, 'mic' | 'midi'>;
  error: Error;
  onFallback: () => void;
}) {
  const { t } = useTranslation('c-rmhmusic');
  let message: string;
  if (source === 'mic' && error.name === 'NotAllowedError') {
    message = t('mic-blocked', {
      defaultValue:
        'Microphone access was blocked. To allow it, tap the lock or settings icon next to the address bar, turn on the microphone for this site, then try again.',
    });
  } else if (source === 'mic' && error.name === 'NotFoundError') {
    message = t('mic-not-found', {
      defaultValue: 'No microphone was found. Connect one, or check that it is turned on.',
    });
  } else if (source === 'mic' && error.name === 'NotSupportedError') {
    message = t('mic-unsupported', {
      defaultValue: "This browser can't use a microphone on this page.",
    });
  } else if (source === 'mic' && error.name === AUDIO_START_ERROR) {
    message = t('mic-audio-failed', {
      defaultValue: "Sound couldn't start on this device. Reload the page and try again.",
    });
  } else if (source === 'mic') {
    message = t('mic-failed', {
      defaultValue: "The microphone couldn't start. Another app may be using it. Close it and try again.",
    });
  } else if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    message = t('midi-blocked', {
      defaultValue:
        'MIDI access was blocked. Allow MIDI devices for this site in your browser settings, then try again.',
    });
  } else {
    message = t('midi-failed', {
      defaultValue: "MIDI couldn't start in this browser.",
    });
  }

  return (
    <div role="alert" className="space-y-2 text-sm">
      <p className="flex gap-2 text-app-danger">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </p>
      <button type="button" onClick={onFallback} className={SECONDARY_BUTTON}>
        {t('use-screen-keys', {
          defaultValue: 'Use on-screen keys instead',
        })}
      </button>
    </div>
  );
}
