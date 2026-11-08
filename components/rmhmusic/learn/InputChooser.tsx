'use client';

/**
 * InputChooser — the four ways to play (on-screen keys, computer keyboard, a
 * MIDI controller, the microphone) as a list of rows. Choosing one stops the
 * previous input, starts the new one and saves it to the profile
 * (`chooseInput`). The microphone and MIDI start only from the click on their
 * row: iOS grants them to a user gesture and nothing else.
 *
 * Every failure is a sentence, never a blank: a blocked or missing microphone,
 * a browser without Web MIDI, no controller plugged in, a controller unplugged
 * mid-session; and each offers the on-screen keys, which always work.
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Check, Keyboard, Loader2, Mic, Piano, Timer, Usb } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isMidiSupported } from '@/lib/rmhmusic/learn/input/midi';
import type { LearnInput } from '@/lib/rmhmusic/learn/schemas';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './buttons';
import { InputErrorNotice, MicDetails, MidiDetails } from './InputDetails';
import { chooseInput } from './useLearnInput';

interface RowProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The right-hand control: a Use button, "In use", or why it cannot be used. */
  action: ReactNode;
  children?: ReactNode;
}

function Row({ icon: Icon, title, description, action, children }: RowProps) {
  return (
    <li className="space-y-1 py-3">
      <div className="flex min-h-11 items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-(--app-accent)" aria-hidden="true" />
        <p className="min-w-0 flex-1 font-medium text-(--app-text)">{title}</p>
        <div className="shrink-0">{action}</div>
      </div>
      <div className="space-y-3 ps-8">
        <p className="text-sm text-(--app-text-muted)">{description}</p>
        {children}
      </div>
    </li>
  );
}

interface InputChooserProps {
  /** Shows the timing row, opening calibration. */
  onCalibrate?: () => void;
  /** Called after each choice settles (started or failed), so a parent can re-read the hub. */
  onChosen?: () => void;
}

export function InputChooser({ onCalibrate, onChosen }: InputChooserProps) {
  const { t } = useTranslation('c-rmhmusic');
  const hub = useLearnStore((s) => s.hub);
  const selected = useLearnStore((s) => s.profile?.input ?? 'screen');
  const latency = useLearnStore((s) => s.profile?.latencyMs ?? 0);
  const storeError = useLearnStore((s) => s.error);
  // Errors are scoped to this dialog's own actions (choosing an input, saving the timing offset).
  const saveFailed = useLearnStore(
    (s) => s.saveFailed.includes('input') || s.saveFailed.includes('latencyMs'),
  );
  const [busy, setBusy] = useState<LearnInput | null>(null);
  const [failed, setFailed] = useState<LearnInput | null>(null);
  const midiSupported = isMidiSupported();
  const active = hub?.active() ?? [];

  const choose = async (next: LearnInput) => {
    setBusy(next);
    setFailed(null);
    const ok = await chooseInput(next);
    setBusy(null);
    if (!ok) setFailed(next);
    onChosen?.();
  };

  const inUse = (id: LearnInput) => selected === id && (id === 'screen' || active.includes(id));

  const action = (id: LearnInput, name: string) => {
    if (busy === id) {
      return (
        <span className="inline-flex min-h-11 items-center gap-2 text-sm text-(--app-text-muted)">
          <Loader2 className="app-spin h-4 w-4" aria-hidden="true" />
          {t('input-starting', { defaultValue: 'Starting…' })}
        </span>
      );
    }
    if (inUse(id)) {
      return (
        <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-(--app-success)">
          <Check className="h-4 w-4" aria-hidden="true" />
          {t('input-in-use', { defaultValue: 'In use' })}
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void choose(id)}
        aria-label={t('input-use-named', { name, defaultValue: 'Use {{name}}' })}
        className={SECONDARY_BUTTON}
      >
        {t('input-use', { defaultValue: 'Use' })}
      </button>
    );
  };

  const error = (id: 'mic' | 'midi') => {
    const err = failed === id ? hub?.lastError(id) : null;
    return err ? (
      <InputErrorNotice source={id} error={err} onFallback={() => void choose('screen')} />
    ) : null;
  };

  const names = {
    screen: t('input-screen', { defaultValue: 'On-screen keys' }),
    keys: t('input-keys', { defaultValue: 'Computer keyboard' }),
    midi: t('input-midi', { defaultValue: 'MIDI controller' }),
    mic: t('input-mic', { defaultValue: 'Microphone' }),
  };

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-(--app-border)">
        <Row
          icon={Piano}
          title={names.screen}
          description={t('input-screen-desc', {
            defaultValue: 'Tap the piano on your screen. Always works.',
          })}
          action={action('screen', names.screen)}
        />
        <Row
          icon={Keyboard}
          title={names.keys}
          description={t('input-keys-desc', {
            defaultValue: 'Keys A to K play C4 to C5. W, E, T, Y and U are the black keys.',
          })}
          action={action('keys', names.keys)}
        />
        <Row
          icon={Usb}
          title={names.midi}
          description={t('input-midi-desc', {
            defaultValue:
              'The most accurate way to play: a digital piano or keyboard over USB or Bluetooth.',
          })}
          action={
            midiSupported ? (
              action('midi', names.midi)
            ) : (
              <span className="inline-flex min-h-11 max-w-36 items-center text-end text-sm text-(--app-text-dim)">
                {t('midi-unsupported', { defaultValue: 'Not supported in this browser' })}
              </span>
            )
          }
        >
          {!midiSupported ? (
            <p className="text-sm text-(--app-text-muted)">
              {t('midi-unsupported-hint', {
                defaultValue:
                  'iPhone and iPad browsers cannot use MIDI. Use the on-screen keys or the microphone, or open this page in Chrome or Edge on a computer.',
              })}
            </p>
          ) : (
            (error('midi') ?? (inUse('midi') ? <MidiDetails /> : null))
          )}
        </Row>
        <Row
          icon={Mic}
          title={names.mic}
          description={t('input-mic-desc', {
            defaultValue: 'For guitar or voice. Works best in a quiet room.',
          })}
          action={action('mic', names.mic)}
        >
          {error('mic') ?? (inUse('mic') ? <MicDetails /> : null)}
        </Row>
      </ul>

      {(saveFailed || storeError === 'unauthorized') && (
        <p role="status" className="text-sm text-(--app-danger)">
          {storeError === 'unauthorized'
            ? t('error-signed-out', {
                defaultValue: 'Your session ended. Sign in again to continue.',
              })
            : t('error-save', { defaultValue: "Couldn't save that change. Try again." })}
        </p>
      )}

      {onCalibrate && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-(--app-border) pt-3">
          <p className="flex items-center gap-2 text-sm text-(--app-text-muted)">
            <Timer className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('latency-current', { ms: latency, defaultValue: 'Timing offset: {{ms}} ms' })}
          </p>
          <button type="button" onClick={onCalibrate} className={PRIMARY_BUTTON}>
            {t('latency-check', { defaultValue: 'Check timing' })}
          </button>
        </div>
      )}
    </div>
  );
}
