/**
 * SongScreen — `/rmhmusic/songs/$songId`: one song of the songbook, read from its score and played.
 * Two ways to play, switched with the sanctioned `<Tabs>`:
 *
 * - **Wait for me:** the cursor waits on each note until the right one is played.
 * - **Play along:** a bar of metronome clicks counts in, then the cursor moves in time and every
 *   note is scored by pitch and timing.
 *
 * The run is the pure machine `lib/rmhmusic/learn/songs/machine.ts` (held by `useMachine`); this
 * file carries out its effects. **Time:** note events carry the input adapters' own
 * `performance.now()` stamps, and the metronome's `onBeat` gives each click's time on the same
 * clock; the first click fixes the beat grid (`begin`). The screen sends `tick` at the machine's
 * `nextDue` with one `setTimeout` at a time while a play-along run is under way, so nothing runs at
 * rest and there is no animation frame. A play-along run is dropped (Start again) when the tab is
 * hidden or the window is away long enough for timers to be throttled (`watchAway`), when the
 * Change input dialog opens, or when sound stops; the metronome stops with it, on unmount too.
 *
 * The version follows the learner's instrument: piano plays the staff as written; guitar reads the
 * same staff with the octave clef, sounds an octave lower and shows the tab. "Hear it" plays the
 * four-bar phrase the cursor is in through the learner's sound; notes are not taken while it
 * sounds (and its echo tail, for the microphone). "Slower" plays at two thirds of the tempo.
 *
 * Every box keeps one height through loading, every state and the result: the score window
 * (`.rmm-score`), the two text lines under it, the controls row, and the input region. A polite live
 * region says the note to play (Wait for me) or the bar (Play along), once per change.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { createMetronome, type Metronome } from '@/lib/rmhmusic/learn/audio/metronome';
import { resumeAudio } from '@/lib/rmhmusic/learn/audio/resume';
import { playSequence, type PlayingSequence } from '@/lib/rmhmusic/learn/audio/sequence';
import { onSoundChange, soundStatus, wakeSound } from '@/lib/rmhmusic/learn/audio/voice';
import { beginSoundSession } from '@/lib/rmhmusic/learn/audio/instruments/engine';
import { resolveSound } from '@/lib/rmhmusic/learn/audio/instruments/catalog';
import type { InstrumentId } from '@/lib/rmhmusic/learn/audio/instruments/types';
import { ECHO_TAIL_MS } from '@/lib/rmhmusic/learn/input/echo-window';
import { watchAway } from '@/lib/rmhmusic/learn/input/away-watch';
import type { LearnInput } from '@/lib/rmhmusic/learn/schemas';
import { effectiveLatencyMs } from '@/lib/rmhmusic/learn/scoring/timing';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { songById } from '@/lib/rmhmusic/learn/songs/catalog';
import {
  createSongMachine,
  cursorOf,
  marksOf,
  nextDue,
  type SongEffect,
  type SongState,
} from '@/lib/rmhmusic/learn/songs/machine';
import { createApiSongSaver, type SongBest, type SongSaver } from '@/lib/rmhmusic/learn/songs/saver';
import { notesOf, phraseAt, songBeats, soundingPitch, spelledName, type Song, type SongVersion } from '@/lib/rmhmusic/learn/songs/score';
import type { SongMode } from '@/lib/rmhmusic/learn/songs/scoring';
import { getAudioContext } from '@/lib/shared/platform';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_BUTTON } from '../buttons';
import { InputSetup } from '../InputSetup';
import { DeviceRegion } from '../LessonParts';
import { Shell } from '../LessonScreen';
import { Notehead } from '../Notehead';
import { OnScreenKeyboard } from '../OnScreenKeyboard';
import { useMachine } from '../useMachine';
import { useInputPhases, useInputRelease, useLessonInputStart, useNoteEvents, useNoteSound } from '../useLearnInput';
import { ScoreView } from './ScoreView';

const TABS_ID = 'rmm-song';
/** Slower plays at this share of the song's tempo. */
export const SLOW_TEMPO = 2 / 3;

type T = ReturnType<typeof useTranslation>['t'];

export function SongScreen({ songId }: { songId: string }) {
  const { t } = useTranslation('c-rmhmusic');
  const song = songById(songId);
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);
  const profile = useLearnStore((s) => s.profile);
  const [mode, setMode] = useState<SongMode>('wait');
  const [slow, setSlow] = useState(false);
  const [running, setRunning] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const setupButton = useRef<HTMLButtonElement>(null);
  const [bests, setBests] = useState<SongBest[] | null>(null);
  const saver = useMemo<SongSaver>(() => createApiSongSaver(), []);

  useInputRelease();
  useLessonInputStart({ mic: true });

  useEffect(() => {
    void useLearnStore.getState().load();
  }, []);
  useEffect(() => {
    let live = true;
    saver
      .bests()
      .then((b) => live && setBests(b))
      .catch(() => live && setBests([]));
    return () => {
      live = false;
    };
  }, [saver]);

  const ready = status === 'ready' && !!profile;
  const loading = !ready && status !== 'error';
  const arrival = useArrival(!loading);
  const version: SongVersion = profile?.instrument === 'guitar' ? 'guitar' : 'piano';
  const sound = profile ? resolveSound(profile) : null;

  // One sound session for the page, before anything can sound (as in a lesson).
  useLayoutEffect(() => {
    if (!sound) return;
    return beginSoundSession(sound);
  }, [sound]);
  const voicing = useMemo(() => (sound ? { instrument: sound } : undefined), [sound]);
  useNoteSound(!setupOpen, voicing);

  if (!song) {
    return (
      <Shell title={t('song-missing-title', { defaultValue: 'Song not found' })} back={{ to: '/rmhmusic/songs', label: t('song-back', { defaultValue: 'All songs' }) }}>
        <p className="text-app-text">
          {t('song-missing', { defaultValue: "This song isn't in the songbook." })}
        </p>
        <Link to="/rmhmusic/songs" className={TEXT_BUTTON}>
          {t('song-choose', { defaultValue: 'Choose another song' })}
        </Link>
      </Shell>
    );
  }

  const bestOf = (m: SongMode) => bests?.find((b) => b.songId === song.id && b.mode === m)?.bestScore ?? null;
  const best = bests === null ? undefined : bestOf(mode);

  let body: ReactNode;
  if (status === 'error') {
    body = (
      <div role="alert" className={`rmm-sheet space-y-3 p-4 ${arrival ?? ''}`}>
        <p className="text-app-text">
          {error === 'unauthorized'
            ? t('error-signed-out', { defaultValue: 'Your session ended. Sign in again to continue.' })
            : t('sprint-load-failed', { defaultValue: "Couldn't load your settings." })}
        </p>
        {error === 'unauthorized' ? (
          <Link to="/login" search={{ callbackURL: `/rmhmusic/songs/${song.id}` }} className={PRIMARY_BUTTON}>
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        ) : (
          <button type="button" onClick={() => void useLearnStore.getState().load()} className={PRIMARY_BUTTON}>
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        )}
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        <p className="min-h-6 text-sm leading-6 text-app-text-muted">{song.composer}</p>
        <Tabs
          idBase={TABS_ID}
          tabs={[
            { id: 'wait', label: t('song-mode-wait', { defaultValue: 'Wait for me' }), disabled: running || loading },
            { id: 'play', label: t('song-mode-play', { defaultValue: 'Play along' }), disabled: running || loading },
          ]}
          value={mode}
          onChange={(id) => setMode(id === 'play' ? 'play' : 'wait')}
          aria-label={t('song-modes', { defaultValue: 'How to play' })}
        />
        <div role="tabpanel" id={`${TABS_ID}-panel-${mode}`} aria-labelledby={`${TABS_ID}-tab-${mode}`} className={arrival}>
          {ready && profile && sound ? (
            <SongRun
              key={`${mode}:${version}`}
              song={song}
              version={version}
              mode={mode}
              input={profile.input}
              latencyMs={effectiveLatencyMs(profile.latencyMs)}
              sound={sound}
              slow={slow}
              onSlow={setSlow}
              paused={setupOpen}
              onRunning={setRunning}
              best={best}
              saver={saver}
              onBest={(score) =>
                setBests((prev) => [
                  ...(prev ?? []).filter((b) => !(b.songId === song.id && b.mode === mode)),
                  { songId: song.id, mode, bestScore: score },
                ])
              }
            />
          ) : (
            <RunSkeleton song={song} />
          )}
        </div>
      </div>
    );
  }

  return (
    <Shell
      title={song.title}
      busy={loading}
      back={{ to: '/rmhmusic/songs', label: t('song-back', { defaultValue: 'All songs' }) }}
      action={
        <button
          ref={setupButton}
          type="button"
          disabled={loading || running}
          onClick={() => setSetupOpen(true)}
          aria-label={t('change-input', { defaultValue: 'Change input' })}
          className={`${SECONDARY_BUTTON} min-w-11 max-[399px]:px-0`}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span aria-hidden="true" className="max-[399px]:hidden">
            {t('change-input', { defaultValue: 'Change input' })}
          </span>
        </button>
      }
    >
      {body}
      <InputSetup open={setupOpen} onOpenChange={setSetupOpen} returnFocus={setupButton} />
    </Shell>
  );
}

/** The run's boxes: the score sheet (window, two lines, controls) and the input region. */
function RunFrame({
  score,
  line,
  sub,
  controls,
  answers,
  said,
}: {
  score: ReactNode;
  line: string;
  sub: string;
  controls: ReactNode;
  answers: ReactNode;
  said: string;
}) {
  return (
    <div className="space-y-4">
      <section className="rmm-sheet space-y-2 p-3 sm:p-5">
        {score}
        {/* Keyed by their text: a changed line is a new node, never the old one re-laid. */}
        <p key={`line:${line}`} className="min-h-12 text-center text-sm leading-6 text-app-text">
          {line}
        </p>
        <p key={`sub:${sub}`} className="min-h-12 text-center text-sm leading-6 text-app-text-muted sm:min-h-6">
          {sub}
        </p>
        <div className="flex h-11 items-center justify-center gap-3">{controls}</div>
        <p role="status" className="sr-only">
          {said}
        </p>
      </section>
      <div className="rmm-input-region">{answers}</div>
    </div>
  );
}

function RunSkeleton({ song }: { song: Song }) {
  return (
    <div aria-hidden="true">
      <RunFrame
        score={
          <div className="rmm-score" data-song={song.id}>
            <div className="app-skeleton h-full w-full" />
          </div>
        }
        line=""
        sub=""
        controls={<div className="app-skeleton h-11 w-48" />}
        answers={<div className="app-skeleton h-full w-full" />}
        said=""
      />
    </div>
  );
}

function SongRun({
  song,
  version,
  mode,
  input,
  latencyMs,
  sound,
  slow,
  onSlow,
  paused,
  onRunning,
  best,
  saver,
  onBest,
}: {
  song: Song;
  version: SongVersion;
  mode: SongMode;
  input: LearnInput;
  latencyMs: number;
  sound: InstrumentId;
  slow: boolean;
  onSlow: (slow: boolean) => void;
  paused: boolean;
  onRunning: (running: boolean) => void;
  /** This mode's best: undefined while loading, null when there is none. */
  best: number | null | undefined;
  saver: SongSaver;
  onBest: (score: number) => void;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const [state, send, getState] = useMachine(createSongMachine({ song, version, mode }));
  const phases = useInputPhases();
  const notes = useMemo(() => notesOf(song), [song]);
  const bpm = Math.round(song.bpm * (slow ? SLOW_TEMPO : 1));
  const beatMs = 60_000 / bpm;
  const metronome = useRef<Metronome | null>(null);
  const hearing = useRef<{ seq: PlayingSequence; until: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [hearingNow, setHearingNow] = useState(false);
  const [noSound, setNoSound] = useState(false);
  const mounted = useRef(true);

  const stopHearing = useCallback(() => {
    const h = hearing.current;
    if (!h) return;
    h.seq.cancel();
    clearTimeout(h.timer);
    hearing.current = null;
    setHearingNow(false);
  }, []);

  // The effects, carried out with the current props.
  const latest = useRef({ beatMs, bpm, latencyMs, saver, onBest });
  useEffect(() => {
    latest.current = { beatMs, bpm, latencyMs, saver, onBest };
  });
  const carry = useCallback(
    (effects: SongEffect[]): void => {
      for (const fx of effects) {
        if (fx.type === 'halt') {
          metronome.current?.stop();
          metronome.current = null;
        } else if (fx.type === 'save') {
          void latest.current.saver
            .save(song.id, fx.run)
            .catch(() => ({ outcome: 'failed' as const }))
            .then((res) => {
              if (res.outcome === 'saved' && res.bestScore !== undefined) latest.current.onBest(res.bestScore);
              if (mounted.current) carry(send({ type: 'answered', attempt: fx.attempt, outcome: res.outcome }));
            });
        } else if (fx.type === 'prepare') {
          void prepare();
        }
      }
    },
    // `send` is the runner's, stable for the screen's life; `prepare` reads refs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [send, song.id],
  );

  /** Play along: wake sound and start the count-in; the first click fixes the beat grid. */
  async function prepare() {
    const ctx = getAudioContext();
    const awake = ctx ? await resumeAudio(ctx) : false;
    if (!mounted.current || getState().kind !== 'counting') return;
    if (!ctx || !awake || document.hidden) {
      carry(send({ type: 'stop', why: document.hidden ? 'away' : 'sound' }));
      return;
    }
    const { beatMs: ms, bpm: tempo, latencyMs: latency } = latest.current;
    const countIn = song.beatsPerBar + (song.pickup > 0 ? song.beatsPerBar - song.pickup : 0);
    let first = true;
    const m = createMetronome(ctx, {
      bpm: tempo,
      beatsPerBar: song.beatsPerBar,
      count: countIn + Math.ceil(songBeats(song)),
      onBeat: (_beat, _bar, at) => {
        if (!first) return;
        first = false;
        carry(send({ type: 'begin', t0: at + countIn * ms, beatMs: ms, latencyMs: latency }));
      },
    });
    metronome.current = m;
    m.start();
  }

  // Notes: every note-on goes to the machine with its own time, except while "Hear it" sounds
  // (and its echo tail, which the microphone would hear).
  const heardUntil = useRef(0);
  useNoteEvents((e) => {
    if (paused || hearing.current || e.time < heardUntil.current) return;
    carry(send({ type: 'note', note: e }));
  });

  // Play along: one tick at the next due time.
  const due = nextDue(state);
  useEffect(() => {
    if (due === null) return;
    // A timer may fire a fraction of a millisecond before its time on this clock: the tick is for
    // `due` at least, or the cursor would stay put and nothing would ask again.
    const id = setTimeout(
      () => carry(send({ type: 'tick', at: Math.max(due, performance.now()) })),
      Math.max(0, due - performance.now()),
    );
    return () => clearTimeout(id);
  }, [due, carry, send]);

  const live = state.kind === 'counting' || state.kind === 'playing';
  const inRun = live || state.kind === 'waiting';
  useEffect(() => {
    onRunning(live);
  }, [live, onRunning]);

  // Dropped: a dialog over a play-along run, the tab hidden or away, sound stopped.
  useEffect(() => {
    if (paused && live) carry(send({ type: 'stop', why: 'dialog' }));
  }, [paused, live, carry, send]);
  useEffect(() => {
    if (!live) return;
    return watchAway({
      doc: document,
      win: window,
      onAway: () => carry(send({ type: 'stop', why: 'away' })),
    });
  }, [live, carry, send]);
  useEffect(
    () =>
      onSoundChange(() => {
        const k = getState().kind;
        if ((k === 'counting' || k === 'playing') && soundStatus() !== 'ready') carry(send({ type: 'stop', why: 'sound' }));
      }),
    [carry, send, getState],
  );

  // Leaving: the metronome and "Hear it" stop.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      metronome.current?.stop();
      metronome.current = null;
      stopHearing();
    };
  }, [stopHearing]);

  async function hear() {
    if (hearing.current) {
      stopHearing();
      return;
    }
    setNoSound(false);
    if (soundStatus() !== 'ready' && !(await wakeSound())) {
      setNoSound(true);
      return;
    }
    const { from, to } = phraseAt(song, Math.max(0, cursorOf(getState())));
    const phrase = notes.slice(from, to);
    const ms = latest.current.beatMs;
    const total = phrase.reduce((sum, n) => sum + n.beats * ms, 0);
    const seq = playSequence(
      phrase.map((n) => soundingPitch(n.written, version)),
      phrase.slice(0, -1).map((n) => n.beats * ms),
      { instrument: sound, holdsMs: phrase.map((n) => n.beats * ms * 0.92) },
    );
    if (!seq.started) {
      setNoSound(true);
      return;
    }
    const until = performance.now() + total + ECHO_TAIL_MS;
    heardUntil.current = until;
    const timer = setTimeout(() => {
      hearing.current = null;
      setHearingNow(false);
    }, total + ECHO_TAIL_MS);
    hearing.current = { seq, until, timer };
    setHearingNow(true);
  }

  // Focus: the sheet's first control stays put; at the end, Play again.
  const againButton = useRef<HTMLButtonElement>(null);
  const finished = 'record' in state;
  // Once the save has settled (Start again is disabled while saving): the control that had focus
  // (Stop, or a key the learner played on screen) is gone.
  const settled = finished && state.kind !== 'saving';
  useEffect(() => {
    if (settled) againButton.current?.focus({ preventScroll: true });
  }, [settled]);

  const cursor = cursorOf(state);
  const marks = marksOf(state);
  const current = cursor >= 0 ? notes[cursor] : undefined;
  const barOf = (i: number) => (notes[i]?.bar ?? 0) + (song.pickup > 0 ? 0 : 1);
  const bars = song.bars.length - (song.pickup > 0 ? 1 : 0);

  const { line, said } = describe(t, state, {
    current: current ? spelledName(current) : '',
    bar: cursor >= 0 ? barOf(cursor) : 0,
    bars,
    wrongName: state.kind === 'waiting' && state.lastWrong !== null ? pitchName(state.lastWrong) : '',
    octaveOff:
      state.kind === 'waiting' &&
      state.lastWrong !== null &&
      pitchName(state.lastWrong) === pitchName(state.pitches[state.index] ?? -1),
  });
  const sub = noSound
    ? t('song-no-sound', { defaultValue: "Sound isn't playing." })
    : saveLine(t, state, best);

  const label = t('song-score-label', {
    title: song.title,
    bars,
    beats: song.beatsPerBar,
    defaultValue: 'The score of {{title}}: {{bars}} bars, {{beats}} beats to a bar.',
  });


  // Start and Stop take one width (min-w-24), so swapping them never moves the centred row.
  const controls = (
    <>
      {inRun ? (
        <button type="button" onClick={() => carry(send({ type: 'again' }))} className={`${SECONDARY_BUTTON} min-w-24`}>
          {t('song-stop', { defaultValue: 'Stop' })}
        </button>
      ) : (
        <button
          ref={againButton}
          type="button"
          disabled={hearingNow || state.kind === 'saving'}
          onClick={() => {
            if (state.kind !== 'ready') carry(send({ type: 'again' }));
            carry(send({ type: 'start', at: performance.now() }));
          }}
          className={`${PRIMARY_BUTTON} min-w-24`}
        >
          {t('sprint-start', { defaultValue: 'Start' })}
        </button>
      )}
      <button
        type="button"
        disabled={live}
        onClick={() => void hear()}
        aria-pressed={hearingNow}
        className={SECONDARY_BUTTON}
      >
        {t('song-hear', { defaultValue: 'Hear it' })}
      </button>
      <button
        type="button"
        disabled={live}
        onClick={() => onSlow(!slow)}
        aria-pressed={slow}
        className={TEXT_BUTTON}
      >
        {t('song-slower', { defaultValue: 'Slower' })}
      </button>
    </>
  );

  let answers: ReactNode;
  if (finished) {
    answers = (
      <div className="rmm-sheet flex h-full flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-4 text-center">
        <p
          className="flex justify-center gap-1"
          role="img"
          aria-label={t('lesson-stars', {
            count: state.summary.stars,
            defaultValue_one: '{{count}} star',
            defaultValue: '{{count}} stars',
          })}
        >
          {[0, 1, 2].map((i) => (
            <Notehead key={i} kind={i < state.summary.stars ? 'filled' : 'open'} className="h-5 w-7 text-app-accent" />
          ))}
        </p>
        {state.kind === 'failed' ? (
          <button type="button" onClick={() => carry(send({ type: 'retry' }))} className={SECONDARY_BUTTON}>
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        ) : state.kind === 'signed-out' ? (
          <Link to="/login" search={{ callbackURL: `/rmhmusic/songs/${song.id}` }} className={SECONDARY_BUTTON}>
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        ) : (
          <Link to="/rmhmusic/songs" className={TEXT_BUTTON}>
            {t('song-choose', { defaultValue: 'Choose another song' })}
          </Link>
        )}
      </div>
    );
  } else if (input === 'mic' || input === 'midi') {
    answers = (
      <div className="h-full">
        <DeviceRegion input={input} on={phases[input] === 'active'} />
      </div>
    );
  } else if (input === 'keys') {
    answers = (
      <div className="rmm-sheet flex h-full items-center justify-center p-4 text-center">
        <p className="text-sm leading-6 text-app-text-muted">
          {t('flash-keys-region', {
            defaultValue: 'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
          })}
        </p>
      </div>
    );
  } else {
    answers = <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />;
  }

  return (
    <RunFrame
      score={<ScoreView song={song} version={version} cursor={cursor} marks={marks} label={label} />}
      line={line}
      sub={sub}
      controls={controls}
      answers={answers}
      said={said}
    />
  );
}

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function pitchName(midi: number): string {
  return PITCH_NAMES[((Math.round(midi) % 12) + 12) % 12] ?? '';
}

/** The sheet's line and what the live region says. */
function describe(
  t: T,
  state: SongState,
  at: { current: string; bar: number; bars: number; wrongName: string; octaveOff: boolean },
): { line: string; said: string } {
  switch (state.kind) {
    case 'ready': {
      if (state.stopped !== null) {
        const line =
          state.stopped === 'sound'
            ? t('song-stopped-sound', { defaultValue: 'Sound stopped, so this run was dropped. Start again.' })
            : state.stopped === 'dialog'
              ? t('song-stopped-dialog', { defaultValue: 'The run stopped while the settings were open. Start again.' })
              : t('song-stopped-away', { defaultValue: 'You left the page, so this run was dropped. Start again.' });
        return { line, said: line };
      }
      const line =
        state.mode === 'wait'
          ? t('song-intro-wait', { defaultValue: 'Play each note when you are ready. The cursor waits for you.' })
          : t('song-intro-play', { defaultValue: 'One bar of clicks counts you in. Then play along in time.' });
      return { line, said: '' };
    }
    case 'waiting': {
      const line = at.octaveOff
        ? t('song-wait-octave', {
            note: at.current,
            defaultValue: 'That {{note}} is in another octave. Play the one written.',
          })
        : at.wrongName
        ? t('song-wait-wrong', { played: at.wrongName, note: at.current, defaultValue: 'That was {{played}}. Play {{note}}.' })
        : t('song-wait-play', { note: at.current, defaultValue: 'Play {{note}}.' });
      const said = t('song-wait-said', {
        bar: at.bar,
        note: at.current,
        defaultValue: 'Bar {{bar}}: {{note}}',
      });
      return { line, said };
    }
    case 'counting': {
      const line = t('rhythm-tap-listen', { defaultValue: 'Listen to the count.' });
      return { line, said: line };
    }
    case 'playing': {
      if (state.cursor < 0) {
        const line = t('rhythm-tap-listen', { defaultValue: 'Listen to the count.' });
        return { line, said: line };
      }
      const line = t('song-play-bar', { bar: at.bar, bars: at.bars, defaultValue: 'Bar {{bar}} of {{bars}}' });
      return { line, said: line };
    }
    default: {
      const s = state.summary;
      const line =
        state.mode === 'wait'
          ? t('song-result-wait', {
              right: s.right,
              total: s.total,
              defaultValue: 'Right first time: {{right}} of {{total}} notes.',
            })
          : t('song-result-play', {
              right: s.right,
              total: s.total,
              early: s.early,
              late: s.late,
              defaultValue: 'Notes right: {{right}} of {{total}}. Early: {{early}}. Late: {{late}}.',
            });
      return { line, said: line };
    }
  }
}

function saveLine(t: T, state: SongState, best: number | null | undefined): string {
  switch (state.kind) {
    case 'saving':
      return t('lesson-saving', { defaultValue: 'Saving…' });
    case 'saved':
      return best === null || best === undefined
        ? t('song-saved', { score: state.summary.score, defaultValue: 'Saved. Score {{score}}.' })
        : t('song-saved-best', {
            score: state.summary.score,
            best,
            defaultValue: 'Saved. Score {{score}}, your best {{best}}.',
          });
    case 'failed':
      return t('song-save-failed', { defaultValue: "Couldn't save this run." });
    case 'signed-out':
      return t('sprint-signed-out', { defaultValue: 'Not saved: sign in again to keep your results.' });
    case 'unsaved':
      return t('song-unsaved', { score: state.summary.score, defaultValue: 'Score {{score}}. Not saved.' });
    default:
      return best === undefined
        ? ''
        : best === null
          ? t('song-best-none', { defaultValue: 'No best yet.' })
          : t('song-best', { score: best, defaultValue: 'Your best: {{score}}' });
  }
}
