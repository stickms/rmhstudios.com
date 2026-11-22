/**
 * SoundDialog — "Sound": which recorded instrument the lessons play (`INSTRUMENT_IDS`), listed by
 * family (keyboards, plucked strings, bowed strings, winds) under plain headings. ONE radio group (plan §4): Tab reaches the chosen row, the arrow keys move between
 * rows and Space or Enter picks (`radio-keys.ts`); the chosen one carries a check. Each row's load
 * status is an always-present live region the row names as its description. Picking a sound saves it, loads its samples and plays one note
 * through it, so choosing is also hearing. Nothing loads until a row is picked.
 *
 * The learner's own instrument's sound is the default and is stored as "follow my instrument"
 * (null), so a learner who switches between piano and guitar keeps hearing their instrument. The
 * bowed strings and the winds play single notes and intervals; chord lessons then use the learner's instrument, which
 * one sentence says. The sound credits page is linked here, not from a footer.
 *
 * Built like InputSetup: the shared `Dialog` portaled into the RMH Music root (`useDialogHost`),
 * focus returned to the opening button.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDialogHost } from '@/components/shared/useDialogHost';
import {
  SOUND_FAMILIES,
  isAvailable,
  defaultSoundFor,
  playsChords,
  resolveSound,
} from '@/lib/rmhmusic/learn/audio/instruments/catalog';
import { getInstrument, onInstrumentChange, peekInstrument } from '@/lib/rmhmusic/learn/audio/instruments/engine';
import type { InstrumentId } from '@/lib/rmhmusic/learn/audio/instruments/types';
import { playNote, wakeSound } from '@/lib/rmhmusic/learn/audio/voice';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { TEXT_BUTTON } from './buttons';
import { radioKey } from './radio-keys';
import { cn } from '@/lib/utils';

/** The note a picked sound plays: the middle of what lessons ask that instrument for. */
const PREVIEW_MIDI: Readonly<Record<InstrumentId, number>> = {
  piano: 60,
  guitar: 55,
  violin: 67,
  flute: 72,
  cello: 48,
  clarinet: 62,
  oboe: 69,
  'guitar-nylon': 55,
  ukulele: 67,
  organ: 60,
};
const PREVIEW_MS = 900;

/** A sound's name. Literal defaults, one call per id (the i18n default-drift gate reads them). */
export function soundName(t: TFunction, id: InstrumentId): string {
  switch (id) {
    case 'piano':
      return t('sound-piano', {
        defaultValue: 'Piano',
      });
    case 'guitar':
      return t('sound-guitar', {
        defaultValue: 'Acoustic guitar',
      });
    case 'violin':
      return t('sound-violin', {
        defaultValue: 'Violin',
      });
    case 'flute':
      return t('sound-flute', {
        defaultValue: 'Flute',
      });
    case 'cello':
      return t('sound-cello', {
        defaultValue: 'Cello',
      });
    case 'clarinet':
      return t('sound-clarinet', {
        defaultValue: 'Clarinet',
      });
    case 'oboe':
      return t('sound-oboe', {
        defaultValue: 'Oboe',
      });
    case 'guitar-nylon':
      return t('sound-guitar-nylon', {
        defaultValue: 'Nylon-string guitar',
      });
    case 'ukulele':
      return t('sound-ukulele', {
        defaultValue: 'Ukulele',
      });
    case 'organ':
      return t('sound-organ', {
        defaultValue: 'Organ',
      });
  }
}

function soundDetail(t: TFunction, id: InstrumentId): string {
  switch (id) {
    case 'piano':
      return t('sound-piano-detail', {
        defaultValue: 'A grand piano. Plays chords.',
      });
    case 'guitar':
      return t('sound-guitar-detail', {
        defaultValue: 'A steel-string guitar. Plays chords.',
      });
    case 'violin':
      return t('sound-violin-detail', {
        defaultValue: 'Single notes and intervals.',
      });
    case 'flute':
      return t('sound-flute-detail', {
        defaultValue: 'Single notes and intervals.',
      });
    case 'cello':
      return t('sound-cello-detail', {
        defaultValue: 'A cello section. Single notes and intervals.',
      });
    case 'clarinet':
      return t('sound-clarinet-detail', {
        defaultValue: 'Single notes and intervals.',
      });
    case 'oboe':
      return t('sound-oboe-detail', {
        defaultValue: 'Single notes and intervals.',
      });
    case 'guitar-nylon':
      return t('sound-guitar-nylon-detail', {
        defaultValue: 'A classical guitar. Plays chords.',
      });
    case 'ukulele':
      return t('sound-ukulele-detail', {
        defaultValue: 'A tenor ukulele. Plays chords.',
      });
    case 'organ':
      return t('sound-organ-detail', {
        defaultValue: 'A quiet pipe organ stop. Plays chords.',
      });
  }
}

/** A family heading in the Sound dialog. */
function familyName(t: TFunction, id: (typeof SOUND_FAMILIES)[number]['id']): string {
  switch (id) {
    case 'keyboards':
      return t('sound-family-keyboards', {
        defaultValue: 'Keyboards',
      });
    case 'plucked':
      return t('sound-family-plucked', {
        defaultValue: 'Plucked strings',
      });
    case 'bowed':
      return t('sound-family-bowed', {
        defaultValue: 'Bowed strings',
      });
    case 'winds':
      return t('sound-family-winds', {
        defaultValue: 'Winds',
      });
  }
}

/** Re-render when any instrument's loading state changes. */
function useInstrumentTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => onInstrumentChange(() => setTick((n) => n + 1)), []);
}

interface SoundDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus?: RefObject<HTMLElement | null>;
}

export function SoundDialog({ open, onOpenChange, returnFocus }: SoundDialogProps) {
  const { t } = useTranslation('c-rmhmusic');
  const { host, sentinel } = useDialogHost('.rmhmusic-theme');
  const instrument = useLearnStore((s) => s.profile?.instrument ?? 'piano');
  const stored = useLearnStore((s) => s.profile?.sound ?? null);
  const saveFailed = useLearnStore((s) => s.saveFailed.includes('sound'));
  const [picked, setPicked] = useState<InstrumentId | null>(null);
  const token = useRef(0);
  const stopPreview = useRef<() => void>(() => {});
  useInstrumentTick();

  const current = resolveSound({
    instrument,
    sound: stored,
  });
  const fallback = defaultSoundFor(instrument);
  // A radio group: one Tab stop (the chosen row), arrows move between rows, Space or Enter picks.
  // The rows in the order they are shown (by family), which is the order the arrow keys move in.
  const families = SOUND_FAMILIES.map((f) => ({
    id: f.id,
    ids: f.ids.filter(isAvailable),
  })).filter((f) => f.ids.length > 0);
  const sounds = families.flatMap((f) => f.ids);
  const tabStop = Math.max(0, sounds.indexOf(current));
  const rows = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  useEffect(() => {
    if (!open) {
      token.current++;
      stopPreview.current();
      setPicked(null);
    }
  }, [open]);
  useEffect(() => () => stopPreview.current(), []);

  const pick = (id: InstrumentId) => {
    const mine = ++token.current;
    setPicked(id);
    void useLearnStore.getState().setSound(id === fallback ? null : id);
    // Inside the tap: browsers start audio only from a gesture.
    const woke = wakeSound();
    const inst = getInstrument(id);
    if (!inst) return;
    void Promise.all([
      inst.load({
        user: true,
      }),
      woke,
    ]).then(([state]) => {
      if (mine !== token.current || state.kind !== 'ready') return;
      stopPreview.current();
      const release = playNote(PREVIEW_MIDI[id], {
        instrument: id,
      });
      const timer = setTimeout(release, PREVIEW_MS);
      stopPreview.current = () => {
        clearTimeout(timer);
        release();
      };
    });
  };

  const status = (id: InstrumentId): string | null => {
    if (picked !== id) return null;
    const state = peekInstrument(id)?.state;
    if (state?.kind === 'loading')
      return t('sound-loading', {
        defaultValue: 'Loading sound…',
      });
    if (state?.kind === 'failed')
      return t('sound-load-failed', {
        defaultValue: "Couldn't load this sound. Lessons will play a simple tone.",
      });
    return null;
  };

  return (
    <>
      {sentinel}
      {host && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent
            container={host}
            className="app-glass max-w-md grid-cols-[minmax(0,1fr)] gap-4 p-5 text-app-text sm:p-6"
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              const target = returnFocus?.current;
              if (!target) return;
              e.preventDefault();
              target.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle className="rmm-display text-2xl leading-8 text-app-text">
                {t('sound-title', {
                  defaultValue: 'Sound',
                })}
              </DialogTitle>
            </DialogHeader>
            <div
              role="radiogroup"
              aria-label={t('sound-title', {
                defaultValue: 'Sound',
              })}
              className="space-y-3"
            >
              {families.map((family) => (
                <div key={family.id} role="group" aria-labelledby={`${baseId}-family-${family.id}`}>
                  <p id={`${baseId}-family-${family.id}`} className="pt-1 text-sm font-semibold text-app-text-muted">
                    {familyName(t, family.id)}
                  </p>
                  <div className="divide-y divide-app-border">
                    {family.ids.map((id) => {
                      const index = sounds.indexOf(id);
                      const chosen = id === current;
                      const line = status(id);
                      const statusId = `${baseId}-${id}-status`;
                      return (
                        <div key={id}>
                          <button
                            ref={(el) => {
                              rows.current[index] = el;
                            }}
                            type="button"
                            role="radio"
                            aria-checked={chosen}
                            // The family groups split the rows, so say where each sits in
                            // the one radio group: all ten, across the families.
                            aria-posinset={index + 1}
                            aria-setsize={sounds.length}
                            aria-describedby={statusId}
                            tabIndex={index === tabStop ? 0 : -1}
                            data-sound={id}
                            onClick={() => pick(id)}
                            onKeyDown={(e) => {
                              const action = radioKey(e.key, index, sounds.length);
                              if (!action) return;
                              e.preventDefault();
                              if (action.kind === 'select') pick(id);
                              else rows.current[action.index]?.focus();
                            }}
                            className="flex min-h-11 w-full items-start gap-3 rounded-app-sm py-3 text-start transition-colors hover:text-app-accent"
                          >
                            <span className="flex h-6 w-5 shrink-0 items-center justify-center">
                              {chosen && <Check className="h-5 w-5 text-app-accent" aria-hidden="true" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium text-app-text">{soundName(t, id)}</span>
                              <span className="block text-sm text-app-text-muted">{soundDetail(t, id)}</span>
                            </span>
                          </button>
                          {/* Always in the tree (an empty live region takes no room), so screen readers hear
                        the load's progress; the row's radio names it as its description. */}
                          <p
                            id={statusId}
                            role="status"
                            className={cn(
                              'flex items-center gap-1.5 ps-8 text-sm text-app-text-muted',
                              line && 'min-h-5',
                            )}
                          >
                            {line && peekInstrument(id)?.state.kind === 'loading' && (
                              <Loader2 className="app-spin h-4 w-4" aria-hidden="true" />
                            )}
                            {line}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="min-h-5 space-y-1 text-sm text-app-text-muted">
              {!playsChords(current) && (
                <p>
                  {fallback === 'guitar'
                    ? t('sound-chords-guitar', {
                        defaultValue: 'Chord lessons use the guitar.',
                      })
                    : t('sound-chords-piano', {
                        defaultValue: 'Chord lessons use the piano.',
                      })}
                </p>
              )}
              {saveFailed && (
                <p role="alert" className="text-app-danger">
                  {t('sound-save-failed', {
                    defaultValue: "Couldn't save your sound. Pick it again.",
                  })}
                </p>
              )}
            </div>
            <Link to="/rmhmusic/credits" className={TEXT_BUTTON}>
              {t('sound-credits-link', {
                defaultValue: 'Sound credits',
              })}
            </Link>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** For lessons and the home: the instrument id the learner hears. */
export function useLearnerSound(): InstrumentId {
  const instrument = useLearnStore((s) => s.profile?.instrument ?? 'piano');
  const stored = useLearnStore((s) => s.profile?.sound ?? null);
  return resolveSound({
    instrument,
    sound: stored,
  });
}
