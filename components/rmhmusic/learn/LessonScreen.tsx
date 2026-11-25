/**
 * LessonScreen — the page around one lesson (`/rmhmusic/lesson/<id>`): a way back to the path,
 * "Change input", and the activity for the lesson's mode (see `isPlayable`), each behind a
 * placeholder of exactly its own boxes. An unknown or unshipped lesson gets a friendly "not
 * available yet" page with a link home, never a crash or a blank. A document (`.app-page`).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BASS_CLEF_UNIT_ID, getLesson, needsVoiceRange } from '@/lib/rmhmusic/learn/content/path';
import { DECKS } from '@/lib/rmhmusic/learn/content/decks';
import { isSpelledCard } from '@/lib/rmhmusic/learn/content/spelling';
import { isPlayable } from '@/lib/rmhmusic/learn/content/routing';
import { rhythmActivity } from '@/lib/rmhmusic/learn/machines/rhythm';
import { staffCardRange } from '@/lib/rmhmusic/learn/voice/range';
import { cn } from '@/lib/utils';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { chordSoundFor, resolveSound } from '@/lib/rmhmusic/learn/audio/instruments/catalog';
import { beginSoundSession, prefetchSound } from '@/lib/rmhmusic/learn/audio/instruments/engine';
import { whenIdle } from '@/lib/shared/platform';
import type { PlayOptions } from '@/lib/rmhmusic/learn/audio/voice';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './buttons';
import { EarLesson, EarListenBox } from './EarLesson';
import { FirstNoteLesson } from './FirstNoteLesson';
import { FindNoteLesson, FindNoteStaffBox } from './FindNoteLesson';
import { FlashcardLesson } from './FlashcardLesson';
import { InputSetup } from './InputSetup';
import { IntervalReadLesson } from './IntervalReadLesson';
import { MatchNoteLesson, MatchStaffBox } from './MatchNoteLesson';
import { ModeToggle } from './ModeToggle';
import { ChordNameBox, PlayChordLesson } from './PlayChordLesson';
import { PracticeModeToggle } from './PracticeModeToggle';
import { KeySignatureLesson } from './KeySignatureLesson';
import { PlayScaleLesson, ScaleNameBox } from './PlayScaleLesson';
import { RhythmLesson } from './RhythmLesson';
import { RhythmReadLesson } from './RhythmReadLesson';
import { StaffChordsLesson } from './StaffChordsLesson';
import { PianoUnitNote } from './PianoUnitNote';
import { STAFF_BOX, STAFF_GRAND_ASPECT, STAFF_LOW_ASPECT } from './StaffCard';
import { useLearnerShape } from './useLearnerShape';
import { useInputRelease } from './useLearnInput';
import { useArrival } from '@/components/ui/arrive';
import { beginActivity } from '@/lib/rmhmusic/learn/activity-clock';

export function Shell({
  title,
  action,
  busy = false,
  back,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** Where the back link goes instead of the learn home (a song goes back to the songbook). */
  back?: {
    to: '/rmhmusic/songs' | '/rmhmusic/sprint' | '/rmhmusic/history';
    label: string;
  };
  /** The lesson is still loading: the main region says so to screen readers. */
  busy?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('c-rmhmusic');
  return (
    <div className="app-page">
      <div className="rmm-column mx-auto flex w-full max-w-3xl flex-1 flex-col pr-[max(1.25rem,var(--safe-right))] pl-[max(1.25rem,var(--safe-left))]">
        {/* With large text the toggle and "Change input" wrap below the back link (kept at the
            end), and below each other if they must, rather than widen the page. */}
        <header className="flex flex-wrap items-center justify-between gap-2 pt-[calc(0.5rem+var(--safe-top))]">
          <Link
            to={back?.to ?? '/rmhmusic'}
            className="-ms-3 flex min-h-11 min-w-0 items-center gap-1.5 rounded-app-sm px-3 py-2 text-sm font-medium text-app-text-muted transition-colors hover:text-app-text"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 rtl-flip" aria-hidden="true" />
            <span>
              {back?.label ??
                t('back-to-lessons', {
                  defaultValue: 'Back to lessons',
                })}
            </span>
          </Link>
          <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <ModeToggle />
            {action}
          </div>
        </header>
        <main aria-busy={busy || undefined} className="flex-1 space-y-4 pt-4 pb-[calc(2rem+var(--safe-bottom))]">
          {busy && (
            <p role="status" className="sr-only">
              {t('loading-lesson', {
                defaultValue: 'Loading the lesson…',
              })}
            </p>
          )}
          <h1 className="rmm-display text-[2.25rem] leading-[2.75rem] break-words text-app-text sm:text-[2.75rem] sm:leading-[3.25rem]">
            {title}
          </h1>
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The loading placeholder: the same boxes as the lesson — the instruction page (title line, a
 * three-line hint, the staff) and the input region (`.rmm-input-region`), which the lesson keeps
 * the same size for every input and every state — so loading → loaded → done moves nothing.
 */
function LessonSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <div className="h-15">
          <div className="app-skeleton mx-auto h-5 w-56 max-w-full" />
        </div>
        <div className="mx-auto w-full max-w-64 pt-2">
          <div className="app-skeleton aspect-[200/132] w-full" />
          <div className="min-h-9" />
        </div>
      </section>
      <div className="rmm-input-region">
        <div className="app-skeleton h-full w-full" />
      </div>
    </div>
  );
}

/**
 * The flashcard lesson's placeholder: its boxes exactly — the card's sheet (title line, the staff
 * and the answer line under it, the sentence line) and below it the letters and the input region
 * (`.rmm-flash__answers`, whose heights the stylesheet fixes for every width).
 */
export function FlashcardSkeleton({
  low = false,
  grand = false,
  signs = false,
}: {
  /** A grand staff deck: the grand card's box (`STAFF_GRAND_ASPECT`). */
  grand?: boolean;
  /** An alto's deck: the low card's box (`STAFF_LOW_ASPECT`). */
  low?: boolean;
  /** A deck of sharps, flats or keys: the answers box also holds the ♭ ♮ ♯ row. */
  signs?: boolean;
}) {
  return (
    <div aria-hidden="true" className="rmm-flash space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <div className={STAFF_BOX}>
          <div
            className={cn(
              'app-skeleton w-full',
              grand ? STAFF_GRAND_ASPECT : low ? STAFF_LOW_ASPECT : 'aspect-[200/102]',
            )}
          />
          <div className="h-9" />
        </div>
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className={cn('rmm-flash__answers', signs && 'rmm-flash__answers--signs')}>
        {signs && <div className="rmm-flash__signs app-skeleton" />}
        <div className="rmm-flash__letters">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="app-skeleton h-full w-full" />
          ))}
        </div>
        <div className="rmm-input-region">
          <div className="app-skeleton h-full w-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * The note finder's placeholder: its boxes exactly — the target's sheet (title line, the low staff
 * card with its name drawn inside it, the sentence line), then the board and the input line
 * (`.rmm-find__answers`, one height on piano and guitar, so the placeholder needs no instrument).
 */
function FindNoteSkeleton({ grand = false }: { grand?: boolean }) {
  return (
    // The mode toggle is the real one (it needs nothing from the store), outside the hidden placeholder.
    <div className="rmm-find space-y-4">
      <PracticeModeToggle />
      <div aria-hidden="true" className="space-y-4">
        <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
          <div className="h-8">
            <div className="app-skeleton mx-auto h-8 w-40" />
          </div>
          <FindNoteStaffBox skeleton grand={grand} />
          <div className="flex h-11 items-center">
            <div className="app-skeleton h-5 w-56 max-w-full" />
          </div>
        </section>
        <div className="rmm-find__answers">
          <div className="rmm-find__board max-[359px]:-mx-2 max-[332px]:-mx-3.5">
            <div className="app-skeleton h-full w-full" />
          </div>
          <div className="rmm-find__device" />
        </div>
      </div>
    </div>
  );
}

/**
 * The pitch match's placeholder: its boxes exactly — the target's sheet (title line, the staff card,
 * the Hear-it row, the sentence line), then the keys and the input line
 * (`.rmm-match__answers`).
 */
function MatchNoteSkeleton({
  low = false,
}: {
  /** An alto's targets: the low card's box. */
  low?: boolean;
}) {
  return (
    <div aria-hidden="true" className="rmm-match space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <MatchStaffBox skeleton low={low} />
        <div className="h-11" />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-match__answers">
        <div className="rmm-input-region">
          <div className="app-skeleton h-full w-full" />
        </div>
        <div className="rmm-find__device" />
      </div>
    </div>
  );
}

/**
 * The ear lessons' placeholder: their boxes exactly — the listening sheet (title line, the empty
 * staff and the sound row, the sentence line) and the answers box (`.rmm-ear__answers`).
 */
function EarSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-ear space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <EarListenBox skeleton />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-ear__answers">
        <div className="app-skeleton h-full w-full" />
      </div>
    </div>
  );
}

/**
 * The chord-playing lesson's placeholder: its boxes exactly — the sheet (title line, the chord's
 * name, the sentence line) and the input region below it.
 */
function PlayChordSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-chord space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <ChordNameBox skeleton />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-input-region">
        <div className="app-skeleton h-full w-full" />
      </div>
    </div>
  );
}

/**
 * The scale lesson's placeholder: its boxes exactly: the sheet (title line, the scale's name, the
 * eight places, the sentence line) and the input region below it.
 */
function PlayScaleSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-chord space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <ScaleNameBox skeleton />
        <div className="min-h-14" />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-input-region">
        <div className="app-skeleton h-full w-full" />
      </div>
    </div>
  );
}

/** The key-signature lesson's placeholder: the sheet with its staff card, and the four buttons. */
function KeySignatureSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <div className="app-skeleton mx-auto aspect-[200/102] w-full max-w-72 sm:max-w-80" />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="app-skeleton h-9 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * The rhythm lessons' placeholder: their boxes exactly — the sheet (title line, the 8rem question
 * box, the sentence line) and the 12.5rem answers box (`.rmm-rhythm__answers`). All three rhythm
 * lessons share it.
 */
function RhythmSkeleton({ toggle = false }: { toggle?: boolean }) {
  return (
    // The two question lessons carry the mode toggle (the real one, outside the hidden placeholder);
    // tap-the-beat is not a question session and has none.
    <div className="rmm-rhythm space-y-4">
      {toggle ? <PracticeModeToggle /> : null}
      <div aria-hidden="true" className="space-y-4">
        <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
          <div className="h-8">
            <div className="app-skeleton mx-auto h-8 w-40" />
          </div>
          <div className="rmm-values">
            <div className="app-skeleton h-full w-full" />
          </div>
          <div className="flex min-h-11 items-center">
            <div className="app-skeleton h-5 w-56 max-w-full" />
          </div>
        </section>
        <div className="rmm-rhythm__answers">
          <div className="app-skeleton h-full w-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * The Read rhythms placeholder: the mode toggle (the real one), the sheet (title line, the bar at the
 * width `RhythmReadLesson` gives it with its three rows of words, the sentence lines) and the answers box.
 */
function RhythmReadSkeleton() {
  return (
    <div className="rmm-rhythm space-y-4">
      <PracticeModeToggle />
      <div aria-hidden="true" className="space-y-4">
        <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
          <div className="h-8">
            <div className="app-skeleton mx-auto h-8 w-40" />
          </div>
          <div className="mx-auto w-full max-w-md">
            <div className="app-skeleton aspect-[400/112] w-full" />
            <div className="h-18" />
          </div>
          <div className="flex min-h-16 items-center justify-center">
            <div className="app-skeleton h-5 w-56 max-w-full" />
          </div>
        </section>
        <div className="rmm-rhythm__answers">
          <div className="app-skeleton h-full w-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * The interval reading lessons' placeholder: their boxes exactly — the mode toggle (the real one),
 * the sheet (title line, the staff and the note names under it, the sentence line) and the 12.5rem
 * answers box (`.rmm-interval__answers`).
 */
function IntervalSkeleton() {
  return (
    <div className="rmm-interval space-y-4">
      <PracticeModeToggle />
      <div aria-hidden="true" className="space-y-4">
        <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
          <div className="h-8">
            <div className="app-skeleton mx-auto h-8 w-40" />
          </div>
          <div className={STAFF_BOX}>
            <div className="app-skeleton aspect-[200/102] w-full" />
            <div className="h-9" />
          </div>
          <div className="flex h-11 items-center">
            <div className="app-skeleton h-5 w-56 max-w-full" />
          </div>
        </section>
        <div className="rmm-interval__answers">
          <div className="app-skeleton h-full w-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * The chord reading lessons' placeholder: the sheet (title line, the staff and the note names under
 * it, the sentence line) and a block for the answer buttons.
 */
function StaffChordsSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <div className={STAFF_BOX}>
          <div className="app-skeleton aspect-[200/102] w-full" />
          <div className="h-9" />
        </div>
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="app-skeleton h-56 w-full" />
    </div>
  );
}

export function LessonScreen({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation('c-rmhmusic');
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);
  const [setupOpen, setSetupOpen] = useState(false);
  // Once the lesson has been on screen, it stays: a session that expires (or a save that fails)
  // mid-lesson is the lesson's to show — its result stays up with a sign-in link or Retry — so the
  // store's `unauthorized` must not swap it for the load-time sign-in page and lose the result.
  const [started, setStarted] = useState(false);
  if (status === 'ready' && !started) setStarted(true);
  const arrival = useArrival(started || status === 'error');
  const setupButton = useRef<HTMLButtonElement>(null);
  // Leaving the screen (any route change) or hiding the tab stops the mic; the screen sees it
  // through the hub's phases (useInputPhases), so nothing here needs to re-render.
  useInputRelease();
  // A singer with no range yet (the dialog was dismissed, or never opened) is asked to choose one
  // before a lesson in the range starts: a range is never assumed.
  const noRange = useLearnStore((s) => s.profile?.instrument === 'voice' && !s.profile.voiceRange);
  const lesson = getLesson(lessonId);
  // An alto's lessons in the range draw on the low card; the placeholder takes its height too,
  // from the layout route's read of the profile before the store has loaded.
  const shape = useLearnerShape();
  const lowCard =
    shape.instrument === 'voice' &&
    shape.voiceRange !== null &&
    staffCardRange(shape.voiceRange) === 'low' &&
    needsVoiceRange(lesson);
  // A lesson on the grand staff draws a taller card, so its placeholder does too.
  const grandDeck = lesson?.mode === 'staff-flashcards' && !!lesson.deck && DECKS[lesson.deck]?.grand === true;
  const playable = isPlayable(lesson);
  // The sound this lesson's notes are voiced with: the learner's (`resolveSound`), except that a
  // lesson of chords keeps to a sound that plays them (`chordSoundFor`: violin and flute fall back
  // to the learner's instrument; the Sound dialog says so). Rhythm lessons make no pitched sound.
  const instrument = useLearnStore((s) => s.profile?.instrument ?? 'piano');
  const chosen = useLearnStore((s) => s.profile?.sound ?? null);
  const mode = lesson?.mode;
  const pitched =
    playable &&
    mode !== 'rhythm-basics' &&
    mode !== 'rhythm-reading' &&
    // A key signature is read from the page: no note is played, so no sound is loaded.
    mode !== 'key-signature' &&
    // Neither is an interval read off the staff, nor a chord.
    mode !== 'staff-intervals' &&
    mode !== 'staff-chords';
  const soundId =
    mode === 'ear-chord' || mode === 'play-chord'
      ? chordSoundFor({
          instrument,
          sound: chosen,
        })
      : resolveSound({
          instrument,
          sound: chosen,
        });
  const sound = useMemo<PlayOptions>(
    () => ({
      instrument: soundId,
    }),
    [soundId],
  );
  // One sound session per lesson: the samples load (at most LOAD_WAIT_MS of "Loading sound…"),
  // else the simple tone plays for the rest of the lesson. Ended when the lesson is left. A layout
  // effect: it must begin before the lesson's own (passive) effects play the first question.
  const loaded = status === 'ready';
  useLayoutEffect(() => {
    if (!loaded || !pitched) return;
    return beginSoundSession(soundId);
  }, [loaded, pitched, soundId, lessonId]);
  // Entering a pitched lesson route starts the learner's sound loading in the background (browser
  // idle, skipped with Data Saver), as soon as the profile says which sound it is: the lesson's own
  // session then usually finds it ready. Never on the home page (plan §3.5).
  const known = useLearnStore((s) => s.profile != null);
  useEffect(() => {
    if (!pitched || !known) return;
    return whenIdle(() => void prefetchSound(soundId));
  }, [pitched, known, soundId]);

  // The lesson is open: its length, for the practice log, counts from here.
  useEffect(() => beginActivity(), [lessonId]);

  // The store is empty until `load()` runs in the browser (a no-op when the home already loaded it).
  useEffect(() => {
    if (playable) void useLearnStore.getState().load();
  }, [playable]);

  if (!lesson || !playable) {
    return (
      <Shell
        title={t('lesson-unavailable-title', {
          defaultValue: 'Not available yet',
        })}
      >
        <div className="rmm-sheet space-y-3 p-5">
          <p className="text-app-text-muted">
            {t('lesson-unavailable-body', {
              defaultValue: "This lesson isn't ready yet. Pick another one from your learning path.",
            })}
          </p>
          <Link to="/rmhmusic" className={PRIMARY_BUTTON}>
            {t('lesson-back-to-path', {
              defaultValue: 'Back to your lessons',
            })}
          </Link>
        </div>
      </Shell>
    );
  }

  let body: ReactNode;
  if (started && noRange && needsVoiceRange(lesson)) {
    body = (
      <div className="rmm-sheet space-y-3 p-5">
        <p className="text-app-text-muted">
          {t('voice-choose-first', {
            defaultValue: 'Choose your voice first: this lesson uses the notes you can sing.',
          })}
        </p>
        <button type="button" onClick={() => setSetupOpen(true)} className={PRIMARY_BUTTON}>
          {t('voice-choose-link', {
            defaultValue: 'Choose your voice',
          })}
        </button>
      </div>
    );
  } else if (started) {
    body =
      lesson.mode === 'staff-flashcards' ? (
        <FlashcardLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} sound={sound} />
      ) : lesson.mode === 'keyboard-map' || lesson.mode === 'fretboard' || lesson.mode === 'grand-staff-find' ? (
        <FindNoteLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} sound={sound} />
      ) : lesson.mode === 'match-note' || lesson.mode === 'sing-interval' ? (
        <MatchNoteLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} sound={sound} />
      ) : lesson.mode === 'ear-interval' || lesson.mode === 'ear-chord' ? (
        <EarLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} sound={sound} />
      ) : lesson.mode === 'play-chord' ? (
        <PlayChordLesson
          key={lesson.id}
          lessonId={lesson.id}
          paused={setupOpen}
          sound={sound}
          onChangeInput={() => setSetupOpen(true)}
        />
      ) : lesson.mode === 'play-scale' ? (
        <PlayScaleLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} sound={sound} />
      ) : lesson.mode === 'key-signature' ? (
        <KeySignatureLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : lesson.mode === 'staff-intervals' ? (
        <IntervalReadLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : lesson.mode === 'staff-chords' ? (
        <StaffChordsLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : lesson.mode === 'rhythm-basics' ? (
        <RhythmLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : lesson.mode === 'rhythm-reading' ? (
        <RhythmReadLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : (
        <FirstNoteLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} sound={sound} />
      );
  } else if (status === 'error' && error === 'unauthorized') {
    body = (
      <div role="alert" className="rmm-sheet space-y-3 p-5">
        <p className="text-app-text">
          {t('error-signed-out', {
            defaultValue: 'Your session ended. Sign in again to continue.',
          })}
        </p>
        <Link
          to="/login"
          search={{
            callbackURL: `/rmhmusic/lesson/${lesson.id}`,
          }}
          className={PRIMARY_BUTTON}
        >
          {t('sign-in', {
            defaultValue: 'Sign in',
          })}
        </Link>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div role="alert" className="rmm-sheet space-y-3 p-5">
        <p className="text-app-text">
          {t('error-lesson-load', {
            defaultValue: "Couldn't load this lesson.",
          })}
        </p>
        <button type="button" onClick={() => void useLearnStore.getState().load()} className={PRIMARY_BUTTON}>
          {t('retry', {
            defaultValue: 'Try again',
          })}
        </button>
      </div>
    );
  } else {
    // Not started yet: the placeholder of exactly the lesson's boxes (the first render after
    // `ready` takes the branch above).
    body =
      lesson.mode === 'staff-flashcards' ? (
        <FlashcardSkeleton
          low={lowCard}
          grand={grandDeck}
          signs={Boolean(lesson.deck && DECKS[lesson.deck]?.cards?.some(isSpelledCard))}
        />
      ) : lesson.mode === 'keyboard-map' || lesson.mode === 'fretboard' || lesson.mode === 'grand-staff-find' ? (
        <FindNoteSkeleton grand={lesson.mode === 'grand-staff-find'} />
      ) : lesson.mode === 'match-note' || lesson.mode === 'sing-interval' ? (
        <MatchNoteSkeleton low={lowCard} />
      ) : lesson.mode === 'ear-interval' || lesson.mode === 'ear-chord' ? (
        <EarSkeleton />
      ) : lesson.mode === 'play-chord' ? (
        <PlayChordSkeleton />
      ) : lesson.mode === 'play-scale' ? (
        <PlayScaleSkeleton />
      ) : lesson.mode === 'key-signature' ? (
        <KeySignatureSkeleton />
      ) : lesson.mode === 'staff-intervals' ? (
        <IntervalSkeleton />
      ) : lesson.mode === 'staff-chords' ? (
        <StaffChordsSkeleton />
      ) : lesson.mode === 'rhythm-basics' ? (
        <RhythmSkeleton toggle={rhythmActivity(lesson.id) !== 'tap'} />
      ) : lesson.mode === 'rhythm-reading' ? (
        <RhythmReadSkeleton />
      ) : (
        <LessonSkeleton />
      );
  }

  const ready = status === 'ready';
  return (
    <Shell
      title={lesson.title}
      busy={status !== 'ready' && status !== 'error'}
      action={
        // Always in the header so nothing moves when the lesson loads; hidden (and inert) until
        // then. Icon-only under 400px, where the label would crowd the header.
        <div className={ready ? undefined : 'invisible'} inert={!ready || undefined}>
          <button
            ref={setupButton}
            type="button"
            onClick={() => setSetupOpen(true)}
            aria-label={t('change-input', {
              defaultValue: 'Change input',
            })}
            className={`${SECONDARY_BUTTON} min-w-11 max-[399px]:px-0`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span aria-hidden="true" className="max-[399px]:hidden">
              {t('change-input', {
                defaultValue: 'Change input',
              })}
            </span>
          </button>
        </div>
      }
    >
      {/* The lesson title is an English catalogue string for now, localised in a later phase. */}
      <div className={arrival}>
        {shape.instrument === 'guitar' && lesson?.unit === BASS_CLEF_UNIT_ID ? <PianoUnitNote /> : null}
        {body}
      </div>
      <InputSetup open={setupOpen} onOpenChange={setSetupOpen} returnFocus={setupButton} />
    </Shell>
  );
}
