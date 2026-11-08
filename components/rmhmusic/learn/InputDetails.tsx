'use client';

/**
 * The live parts of the input setup rows: the microphone's level bar and
 * detected note, the MIDI device list and played notes, and the plain-language
 * message shown when an input could not start. Each listens to the store's hub
 * only while mounted.
 */

import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InputSource } from '@/lib/rmhmusic/learn/input/events';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { SECONDARY_BUTTON } from './buttons';
import { useLastNote, useMicLevel, useMidiDevices, useNoteEvents } from './useLearnInput';

/** Live level bar plus the note the microphone hears, with how far off it is in cents. */
export function MicDetails() {
  const { t } = useTranslation('c-rmhmusic');
  const level = useMicLevel();
  const note = useLastNote('mic');
  const cents = note?.cents === undefined ? null : Math.round(note.cents);

  return (
    <div className="space-y-2">
      <div
        role="meter"
        aria-label={t('mic-level', { defaultValue: 'Microphone level' })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        className="h-2 w-full overflow-hidden rounded-(--app-radius-sm) bg-(--app-surface-active)"
      >
        <div
          className="h-full origin-left bg-(--app-accent)"
          style={{ transform: `scaleX(${level})` }}
        />
      </div>
      <p className="text-sm text-(--app-text-muted)" aria-live="polite">
        {note
          ? t('mic-heard', {
              note: midiToName(note.midi),
              cents: cents === null ? '0' : `${cents > 0 ? '+' : ''}${cents}`,
              defaultValue: 'Hearing {{note}} ({{cents}} cents)',
            })
          : t('mic-listening', { defaultValue: 'Listening… play or sing a note.' })}
      </p>
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
        <p className="text-(--app-warning)">
          {t('midi-disconnected', {
            name: gone,
            defaultValue: '{{name}} was disconnected.',
          })}
        </p>
      )}
      {devices.length === 0 ? (
        <p className="text-(--app-text-muted)">
          {t('midi-no-device', {
            defaultValue: 'Plug in or pair a MIDI controller. It will show up here.',
          })}
        </p>
      ) : (
        <ul className="space-y-1">
          {devices.map((d) => (
            <li key={d.id} className="font-medium text-(--app-text)">
              {d.name}
            </li>
          ))}
        </ul>
      )}
      {devices.length > 0 && (
        <p className="min-h-6 text-(--app-text-muted)">
          {playing.length > 0
            ? t('midi-playing', {
                notes: playing.map((m) => midiToName(m)).join(' '),
                defaultValue: 'Playing {{notes}}',
              })
            : t('midi-try', { defaultValue: 'Play a key: it lights up here.' })}
        </p>
      )}
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
  } else if (source === 'mic') {
    message = t('mic-failed', {
      defaultValue:
        "The microphone couldn't start. Another app may be using it. Close it and try again.",
    });
  } else if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    message = t('midi-blocked', {
      defaultValue:
        'MIDI access was blocked. Allow MIDI devices for this site in your browser settings, then try again.',
    });
  } else {
    message = t('midi-failed', { defaultValue: "MIDI couldn't start in this browser." });
  }

  return (
    <div role="alert" className="space-y-2 text-sm">
      <p className="flex gap-2 text-(--app-danger)">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{message}</span>
      </p>
      <button type="button" onClick={onFallback} className={SECONDARY_BUTTON}>
        {t('use-screen-keys', { defaultValue: 'Use on-screen keys instead' })}
      </button>
    </div>
  );
}
