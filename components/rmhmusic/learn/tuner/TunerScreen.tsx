/**
 * TunerScreen — `/rmhmusic/tuner`: a tuner and a note reader, switched with the sanctioned
 * `<Tabs>`. **Tune** listens through the microphone (`TunePanel`); **Read notes** writes every
 * note played on any input on the staff (`ReadPanel`). A tool beside the path: it completes no
 * lesson and gates nothing.
 *
 * The page is the lessons' `Shell` (back link, title, Change input). The learner's chosen input
 * starts on entry as in a lesson (`useLessonInputStart`); the microphone stops when the page is
 * hidden or left (`useInputRelease`). The reference tones and the on-screen keys sound through the
 * learner's sound, in one sound session for the page. The tuner's preset starts as the learner's
 * instrument (guitar strings for guitar, any note otherwise) and can be changed.
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { beginSoundSession } from '@/lib/rmhmusic/learn/audio/instruments/engine';
import { resolveSound } from '@/lib/rmhmusic/learn/audio/instruments/catalog';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import type { TunerPreset } from '@/lib/rmhmusic/learn/tuner/machine';
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../buttons';
import { InputSetup } from '../InputSetup';
import { Shell } from '../LessonScreen';
import {
  useInputRelease,
  useLessonInputStart,
  useNoteSound,
} from '../useLearnInput';
import { ReadPanel } from './ReadPanel';
import { TunePanel } from './TunePanel';

type TabId =
  | 'tune'
  | 'read';

const RETURN_TO =
  '/rmhmusic/tuner';
const TABS_ID =
  'rmm-tuner';

export function TunerScreen() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const status =
    useLearnStore(
      (
        s,
      ) =>
        s.status,
    );
  const error =
    useLearnStore(
      (
        s,
      ) =>
        s.error,
    );
  const profile =
    useLearnStore(
      (
        s,
      ) =>
        s.profile,
    );
  const [
    tab,
    setTab,
  ] =
    useState<TabId>(
      'tune',
    );
  const [
    chosenPreset,
    setPreset,
  ] =
    useState<TunerPreset | null>(
      null,
    );
  const [
    setupOpen,
    setSetupOpen,
  ] =
    useState(
      false,
    );
  const setupButton =
    useRef<HTMLButtonElement>(
      null,
    );

  useInputRelease();
  useLessonInputStart();

  useEffect(() => {
    void useLearnStore
      .getState()
      .load();
  }, []);

  const ready =
    status ===
      'ready' &&
    !!profile;
  const loading =
    !ready &&
    status !==
      'error';
  const arrival =
    useArrival(
      !loading,
    );
  const instrument =
    profile?.instrument ??
    'piano';
  const input =
    ready
      ? profile.input
      : null;
  const sound =
    profile
      ? resolveSound(
          profile,
        )
      : null;
  const preset: TunerPreset =
    chosenPreset ??
    (instrument ===
    'guitar'
      ? 'guitar'
      : 'chromatic');

  // One sound session for the page, before anything can sound (as in a lesson).
  useLayoutEffect(() => {
    if (
      !sound
    )
      return;
    return beginSoundSession(
      sound,
    );
  }, [
    sound,
  ]);
  const voicing =
    useMemo(
      () =>
        sound
          ? {
              instrument:
                sound,
            }
          : undefined,
      [
        sound,
      ],
    );
  useNoteSound(
    !setupOpen,
    voicing,
  );

  let body: ReactNode;
  if (
    status ===
    'error'
  ) {
    body =
      (
        <div
          role="alert"
          className={`rmm-sheet space-y-3 p-4 ${arrival ?? ''}`}
        >
          <p className="text-app-text">
            {error ===
            'unauthorized'
              ? t(
                  'error-signed-out',
                  {
                    defaultValue:
                      'Your session ended. Sign in again to continue.',
                  },
                )
              : t(
                  'sprint-load-failed',
                  {
                    defaultValue:
                      "Couldn't load your settings.",
                  },
                )}
          </p>
          {error ===
          'unauthorized' ? (
            <Link
              to="/login"
              search={{
                callbackURL:
                  RETURN_TO,
              }}
              className={
                PRIMARY_BUTTON
              }
            >
              {t(
                'sign-in',
                {
                  defaultValue:
                    'Sign in',
                },
              )}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() =>
                void useLearnStore
                  .getState()
                  .load()
              }
              className={
                PRIMARY_BUTTON
              }
            >
              {t(
                'retry',
                {
                  defaultValue:
                    'Try again',
                },
              )}
            </button>
          )}
        </div>
      );
  } else {
    body =
      (
        <div
          className={
            loading
              ? 'space-y-4'
              : `space-y-4 ${arrival ?? ''}`
          }
        >
          <Tabs
            idBase={
              TABS_ID
            }
            tabs={[
              {
                id: 'tune',
                label:
                  t(
                    'tuner-tab-tune',
                    {
                      defaultValue:
                        'Tune',
                    },
                  ),
              },
              {
                id: 'read',
                label:
                  t(
                    'tuner-tab-read',
                    {
                      defaultValue:
                        'Read notes',
                    },
                  ),
              },
            ]}
            value={
              tab
            }
            onChange={(
              id,
            ) =>
              setTab(
                id ===
                  'read'
                  ? 'read'
                  : 'tune',
              )
            }
            aria-label={t(
              'tuner-tabs',
              {
                defaultValue:
                  'Tuner or note reader',
              },
            )}
          />
          <div
            role="tabpanel"
            id={`${TABS_ID}-panel-${tab}`}
            aria-labelledby={`${TABS_ID}-tab-${tab}`}
          >
            {tab ===
            'tune' ? (
              <TunePanel
                input={
                  input
                }
                preset={
                  preset
                }
                onPreset={
                  setPreset
                }
                sound={
                  sound
                }
                loading={
                  loading
                }
              />
            ) : (
              <ReadPanel
                input={
                  input
                }
                instrument={
                  instrument
                }
                loading={
                  loading
                }
              />
            )}
          </div>
        </div>
      );
  }

  return (
    <Shell
      title={t(
        'tuner-title',
        {
          defaultValue:
            'Tuner',
        },
      )}
      busy={
        loading
      }
      action={
        <button
          ref={
            setupButton
          }
          type="button"
          disabled={
            loading
          }
          onClick={() =>
            setSetupOpen(
              true,
            )
          }
          aria-label={t(
            'change-input',
            {
              defaultValue:
                'Change input',
            },
          )}
          className={`${SECONDARY_BUTTON} min-w-11 max-[399px]:px-0`}
        >
          <SlidersHorizontal
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span
            aria-hidden="true"
            className="max-[399px]:hidden"
          >
            {t(
              'change-input',
              {
                defaultValue:
                  'Change input',
              },
            )}
          </span>
        </button>
      }
    >
      {
        body
      }
      <InputSetup
        open={
          setupOpen
        }
        onOpenChange={
          setSetupOpen
        }
        returnFocus={
          setupButton
        }
      />
    </Shell>
  );
}
